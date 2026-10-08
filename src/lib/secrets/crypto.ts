import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM with a random 96-bit IV per secret. The key comes from SAQINA_ENCRYPTION_KEY
 * (32 bytes, base64). `keyId` is stored with each secret so the key can be rotated later
 * (SAQINA_ENCRYPTION_KEY_<id> for old keys).
 */

export interface Sealed {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: number;
}

export class CryptoUnavailableError extends Error {
  constructor() {
    super("SAQINA_ENCRYPTION_KEY is missing or not 32 bytes");
    this.name = "CryptoUnavailableError";
  }
}

export const CURRENT_KEY_ID = 1;

function keyFor(id: number, env: Record<string, string | undefined> = process.env): Buffer {
  const raw =
    id === CURRENT_KEY_ID ? env.SAQINA_ENCRYPTION_KEY : env[`SAQINA_ENCRYPTION_KEY_${id}`];
  const key = raw ? Buffer.from(raw, "base64") : null;
  if (!key || key.length !== 32) throw new CryptoUnavailableError();
  return key;
}

export function cryptoAvailable(env: Record<string, string | undefined> = process.env): boolean {
  try {
    keyFor(CURRENT_KEY_ID, env);
    return true;
  } catch {
    return false;
  }
}

export function seal(plaintext: string, env?: Record<string, string | undefined>): Sealed {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFor(CURRENT_KEY_ID, env), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    keyId: CURRENT_KEY_ID,
  };
}

/** Throws if the data was tampered with or the key is wrong (GCM authentication). */
export function open(sealed: Sealed, env?: Record<string, string | undefined>): string {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyFor(sealed.keyId, env),
    Buffer.from(sealed.iv, "base64"),
  );
  decipher.setAuthTag(Buffer.from(sealed.authTag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
