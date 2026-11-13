/**
 * Logo validation (pure). The type is read from the bytes, never from the file name or the
 * browser's claim, and only PNG and JPEG pass: an SVG can carry script, so it is not accepted.
 */

export const LOGO_MAX_BYTES = 200 * 1024;
export const LOGO_MIN_SIDE = 32;
export const LOGO_MAX_SIDE = 1600;

export type LogoMime = "image/png" | "image/jpeg";
export type LogoVerdict =
  | { ok: true; mime: LogoMime; width: number; height: number }
  | { ok: false; reason: "tooLarge" | "type" | "dimensions" };

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function pngSize(b: Uint8Array): [number, number] | null {
  // IHDR is the first chunk: 8 byte signature, 4 length, "IHDR", then width and height.
  if (b.length < 24 || String.fromCharCode(...b.slice(12, 16)) !== "IHDR") return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return [view.getUint32(16), view.getUint32(20)];
}

function jpegSize(b: Uint8Array): [number, number] | null {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1];
    // Start-of-frame markers (not DHT, JPG, DAC) carry the size.
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker))
      return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

export function inspectLogo(bytes: Uint8Array): LogoVerdict {
  if (bytes.length > LOGO_MAX_BYTES) return { ok: false, reason: "tooLarge" };
  const isPng = PNG.every((v, i) => bytes[i] === v);
  const isJpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPng && !isJpeg) return { ok: false, reason: "type" };
  const size = isPng ? pngSize(bytes) : jpegSize(bytes);
  if (!size) return { ok: false, reason: "type" };
  const [width, height] = size;
  if (Math.min(width, height) < LOGO_MIN_SIDE || Math.max(width, height) > LOGO_MAX_SIDE)
    return { ok: false, reason: "dimensions" };
  return { ok: true, mime: isPng ? "image/png" : "image/jpeg", width, height };
}
