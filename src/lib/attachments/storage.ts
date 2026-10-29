import "server-only";
import { AwsClient } from "aws4fetch";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";

/**
 * Where attachment bytes live. S3 (or any S3-compatible store: R2, MinIO) when it is configured;
 * otherwise the database, which only development and tests may use. The bucket stays private:
 * files are always served through Saqina's own route, after the access check.
 */
export interface FileStore {
  readonly driver: "s3" | "db";
  /** Stores the bytes; the database driver returns them so the caller writes them to its row. */
  put(key: string, body: Uint8Array, mime: string): Promise<void>;
  get(key: string): Promise<Uint8Array>;
  delete(key: string): Promise<void>;
}

export interface S3Config {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  /** For S3-compatible stores; path-style URLs are used when it is set. */
  endpoint?: string;
}

export function s3ConfigFromEnv(env = process.env): S3Config | null {
  const { S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_ENDPOINT } = env;
  if (!S3_BUCKET || !S3_REGION || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) return null;
  return {
    bucket: S3_BUCKET,
    region: S3_REGION,
    accessKeyId: S3_ACCESS_KEY_ID,
    secretAccessKey: S3_SECRET_ACCESS_KEY,
    endpoint: S3_ENDPOINT || undefined,
  };
}

/** Object URL; keys are built by Saqina (`projects/<id>/attachments/<uuid>`), never from input. */
export function s3ObjectUrl(config: S3Config, key: string): string {
  const path = key.split("/").map(encodeURIComponent).join("/");
  if (config.endpoint)
    return `${config.endpoint.replace(/\/+$/, "")}/${encodeURIComponent(config.bucket)}/${path}`;
  return `https://${config.bucket}.s3.${config.region}.amazonaws.com/${path}`;
}

type Fetcher = (request: Request) => Promise<Response>;

export function createS3Store(config: S3Config, fetcher: Fetcher = (r) => fetch(r)): FileStore {
  const client = new AwsClient({
    accessKeyId: config.accessKeyId,
    secretAccessKey: config.secretAccessKey,
    service: "s3",
    region: config.region,
  });
  const call = async (key: string, init: RequestInit, op: string) => {
    const signed = await client.sign(s3ObjectUrl(config, key), init);
    let response: Response;
    try {
      response = await fetcher(signed);
    } catch (error) {
      log.error("attachments.s3_unreachable", {
        op,
        error: error instanceof Error ? error.name : "error",
      });
      throw new AppError("INTERNAL_ERROR", "Storage unreachable");
    }
    if (op === "get" && response.status === 404) throw new AppError("NOT_FOUND");
    if (!response.ok && !(op === "delete" && response.status === 404)) {
      // The body may echo the key; only the status is logged.
      log.error("attachments.s3_failed", { op, status: response.status });
      throw new AppError("INTERNAL_ERROR", "Storage failed");
    }
    return response;
  };
  return {
    driver: "s3",
    async put(key, body, mime) {
      await call(
        key,
        {
          method: "PUT",
          body: body as unknown as BodyInit,
          headers: { "content-type": mime, "content-length": String(body.byteLength) },
        },
        "put",
      );
    },
    async get(key) {
      const response = await call(key, { method: "GET" }, "get");
      return new Uint8Array(await response.arrayBuffer());
    },
    async delete(key) {
      await call(key, { method: "DELETE" }, "delete");
    },
  };
}

/** The database fallback keeps bytes on the row itself; this store only marks that choice. */
const dbStore: FileStore = {
  driver: "db",
  async put() {},
  async get() {
    throw new Error("db attachments are read from their row");
  },
  async delete() {},
};

/**
 * The store for this deployment. In production without S3 uploads are refused with a clear
 * message rather than filling the database with files.
 */
export function fileStore(env = process.env): FileStore {
  const config = s3ConfigFromEnv(env);
  if (config) return createS3Store(config);
  if (env.NODE_ENV === "production" && env.ALLOW_DB_ATTACHMENTS !== "1")
    throw new AppError("VALIDATION_ERROR", "File storage not configured", { file: "storage" });
  return dbStore;
}

export function storageDriver(env = process.env): "s3" | "db" | "none" {
  if (s3ConfigFromEnv(env)) return "s3";
  return env.NODE_ENV === "production" && env.ALLOW_DB_ATTACHMENTS !== "1" ? "none" : "db";
}
