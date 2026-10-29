import { describe, expect, it } from "vitest";
import { userContent as anthropicContent } from "@/lib/ai/adapters/anthropic";
import { userContent as openaiContent } from "@/lib/ai/adapters/openai";
import type { AiRequest } from "@/lib/ai/provider";
import { mentionedTools, ruleChoice, type ToolChoice } from "@/lib/assistant/tool-turn";
import { detectFile } from "@/lib/attachments/detect";
import { cleanFileName } from "@/lib/attachments/service";
import { createS3Store, s3ObjectUrl, storageDriver } from "@/lib/attachments/storage";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const text = (s: string) => new TextEncoder().encode(s);

describe("file type comes from the bytes", () => {
  it("knows PNG, JPEG, GIF, WebP and PDF whatever the name says", () => {
    expect(detectFile("x.txt", bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))?.mime).toBe(
      "image/png",
    );
    expect(detectFile("a", bytes(0xff, 0xd8, 0xff))?.kind).toBe("image");
    expect(detectFile("a", bytes(0x47, 0x49, 0x46, 0x38))?.mime).toBe("image/gif");
    expect(
      detectFile("a", bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50))?.mime,
    ).toBe("image/webp");
    expect(detectFile("doc.png", text("%PDF-1.7 ..."))?.kind).toBe("pdf");
  });

  it("accepts UTF-8 text with a text extension and keeps its content", () => {
    expect(detectFile("notes.md", text("# Hi\nÜber"))).toEqual({
      kind: "text",
      mime: "text/plain; charset=utf-8",
      text: "# Hi\nÜber",
    });
  });

  it("refuses SVG, HTML, binary and unknown files", () => {
    expect(detectFile("a.svg", text("<svg onload=alert(1)>"))).toBeNull();
    expect(detectFile("a.xml", text('<?xml version="1.0"?>\n<svg></svg>'))).toBeNull();
    expect(detectFile("a.txt", text("<!DOCTYPE html><script>"))).toBeNull();
    expect(detectFile("a.txt", new Uint8Array([0xc3, 0x28]))).toBeNull();
    expect(detectFile("a.txt", text("a\u0000b"))).toBeNull();
    expect(detectFile("a.exe", text("MZ"))).toBeNull();
  });

  it("cleans file names of paths and control characters", () => {
    expect(cleanFileName("../../etc/pass\u0007wd.txt")).toBe("passwd.txt");
    expect(cleanFileName("")).toBe("file");
  });
});

describe("S3 storage", () => {
  const config = {
    bucket: "files",
    region: "ap-southeast-1",
    accessKeyId: "AKID",
    secretAccessKey: "secret",
  };

  it("addresses AWS virtual-host style, and S3-compatible stores path style", () => {
    expect(s3ObjectUrl(config, "projects/p/attachments/a")).toBe(
      "https://files.s3.ap-southeast-1.amazonaws.com/projects/p/attachments/a",
    );
    expect(s3ObjectUrl({ ...config, endpoint: "https://r2.example/" }, "k")).toBe(
      "https://r2.example/files/k",
    );
  });

  it("signs every call with SigV4 and maps a missing object to NOT_FOUND", async () => {
    const seen: Request[] = [];
    const store = createS3Store(config, async (r) => {
      seen.push(r);
      return r.method === "GET"
        ? new Response("nope", { status: 404 })
        : new Response(null, { status: 200 });
    });
    await store.put("projects/p/attachments/a", new Uint8Array([1, 2, 3]), "image/png");
    expect(seen[0].method).toBe("PUT");
    expect(seen[0].headers.get("authorization")).toMatch(/^AWS4-HMAC-SHA256 Credential=AKID\//);
    expect(seen[0].headers.get("x-amz-content-sha256")).toBeTruthy();
    await expect(store.get("projects/p/attachments/a")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await store.delete("missing");
  });

  it("fails loudly without leaking the response body", async () => {
    const store = createS3Store(
      config,
      async () => new Response("<Key>secret-name</Key>", { status: 403 }),
    );
    await expect(store.put("k", new Uint8Array([1]), "image/png")).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
    });
  });

  it("is required in production; development falls back to the database", () => {
    expect(storageDriver({ NODE_ENV: "production" })).toBe("none");
    expect(storageDriver({ NODE_ENV: "development" })).toBe("db");
    expect(
      storageDriver({
        NODE_ENV: "production",
        S3_BUCKET: "b",
        S3_REGION: "r",
        S3_ACCESS_KEY_ID: "i",
        S3_SECRET_ACCESS_KEY: "s",
      }),
    ).toBe("s3");
  });
});

describe("attachments reach the model in each provider's shape", () => {
  const req: AiRequest = {
    system: "s",
    segments: [],
    userMessage: "What is in this?",
    draft: "",
    attachments: [
      { kind: "image", mime: "image/png", name: "a.png", data: "AAA" },
      { kind: "pdf", mime: "application/pdf", name: "b.pdf", data: "BBB" },
    ],
  };

  it("Anthropic: image and document blocks before the text", () => {
    const content = anthropicContent(req) as { type: string }[];
    expect(content.map((c) => c.type)).toEqual(["image", "document", "text"]);
  });

  it("OpenAI-compatible: images as data URLs; text only without images", () => {
    const content = openaiContent(req) as { type: string; image_url?: { url: string } }[];
    expect(content[0].image_url?.url).toBe("data:image/png;base64,AAA");
    expect(content.map((c) => c.type)).toEqual(["image_url", "text"]);
    expect(typeof openaiContent({ ...req, attachments: [] })).toBe("string");
  });
});

describe("picking a connector tool without a model", () => {
  const tool = (
    name: string,
    connector: string,
    schema: Record<string, unknown> = {},
  ): ToolChoice => ({
    connectorId: connector,
    key: `mcp:${connector}:${name}`,
    name,
    connector,
    description: "",
    inputSchema: schema,
  });
  const search = tool("web_search", "Exa", {
    properties: { query: { type: "string" } },
    required: ["query"],
  });
  const scrape = tool("scrape", "Firecrawl", { properties: { url: { type: "string" } } });

  it("a message names a connector or a tool", () => {
    expect(mentionedTools("cari pakai Exa: next.js 16", [search, scrape])).toEqual([search]);
    expect(mentionedTools("hello there", [search, scrape])).toEqual([]);
  });

  it("fills the first text input with the message, or takes the only tool", () => {
    expect(ruleChoice("web_search next 16 caching", [search, scrape])).toEqual({
      tool: search,
      input: { query: "web_search next 16 caching" },
    });
    expect(ruleChoice("anything", [scrape])?.input).toEqual({ url: "anything" });
    expect(ruleChoice("anything", [search, scrape])).toBeNull();
  });
});
