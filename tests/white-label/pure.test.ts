import { describe, expect, it } from "vitest";
import { checkAccent, contrastRatio, readableOn } from "@/lib/white-label/contrast";
import { inspectLogo, LOGO_MAX_BYTES } from "@/lib/white-label/logo";
import { brandStyle } from "@/lib/white-label/theme";

/** A PNG with only the signature and an IHDR chunk: enough for the size check. */
function png(width: number, height: number, extra = 0) {
  const b = new Uint8Array(33 + extra);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13], 8);
  b.set([0x49, 0x48, 0x44, 0x52], 12);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

/** A JPEG with a JFIF header and one baseline frame header. */
function jpeg(width: number, height: number) {
  return Uint8Array.from([
    0xff,
    0xd8,
    0xff,
    0xe0,
    0x00,
    0x10,
    0x4a,
    0x46,
    0x49,
    0x46,
    0x00,
    0x01,
    0x01,
    0x00,
    0x00,
    0x01,
    0x00,
    0x01,
    0x00,
    0x00,
    0xff,
    0xc0,
    0x00,
    0x11,
    0x08,
    height >> 8,
    height & 255,
    width >> 8,
    width & 255,
    0x03,
    0x01,
    0x22,
    0x00,
    0x02,
    0x11,
    0x01,
    0x03,
    0x11,
    0x01,
  ]);
}

describe("accent colour", () => {
  it("accepts the Saqina coral and other readable colours", () => {
    expect(checkAccent("#ff6a55")).toBe("ok");
    expect(checkAccent("#1f6feb")).toBe("ok");
    expect(checkAccent("#FFB000")).toBe("ok");
  });

  it("refuses colours that vanish on the dark page", () => {
    expect(checkAccent("#222222")).toBe("lowOnPage");
    expect(checkAccent("#000000")).toBe("lowOnPage");
  });

  it("refuses a mid grey that no text colour reads on", () => {
    expect(checkAccent("#777777")).toBe("lowText");
  });

  it("refuses anything that is not #rrggbb", () => {
    for (const bad of ["", "red", "#fff", "#12345g", "rgb(1,2,3)", "#1234567"])
      expect(checkAccent(bad)).toBe("invalid");
  });

  it("measures contrast the WCAG way and picks the better text colour", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#ffffff", "#ffffff")).toBe(1);
    expect(readableOn("#ffff00")).not.toBe("#ffffff");
    expect(readableOn("#1f2a44")).toBe("#ffffff");
  });

  it("turns an accent into portal variables, and nothing without one", () => {
    expect(brandStyle(null)).toBeUndefined();
    expect(brandStyle("#1f6feb")).toMatchObject({
      "--primary": "#1f6feb",
      "--ring": "#1f6feb",
      "--primary-foreground": "#ffffff",
    });
  });
});

describe("logo check", () => {
  it("reads PNG and JPEG sizes from the bytes", () => {
    expect(inspectLogo(png(200, 80))).toEqual({
      ok: true,
      mime: "image/png",
      width: 200,
      height: 80,
    });
    expect(inspectLogo(jpeg(300, 120))).toEqual({
      ok: true,
      mime: "image/jpeg",
      width: 300,
      height: 120,
    });
  });

  it("refuses what is not a PNG or JPEG, whatever it claims to be", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>');
    expect(inspectLogo(svg)).toEqual({ ok: false, reason: "type" });
    expect(inspectLogo(new TextEncoder().encode("GIF89a........"))).toEqual({
      ok: false,
      reason: "type",
    });
    expect(inspectLogo(new Uint8Array(0))).toEqual({ ok: false, reason: "type" });
    // A PNG signature with no readable header is not trusted either.
    expect(inspectLogo(png(10, 10).slice(0, 12))).toEqual({ ok: false, reason: "type" });
  });

  it("refuses logos that are too large or too small or too big", () => {
    expect(inspectLogo(png(200, 80, LOGO_MAX_BYTES))).toEqual({ ok: false, reason: "tooLarge" });
    expect(inspectLogo(png(16, 16))).toEqual({ ok: false, reason: "dimensions" });
    expect(inspectLogo(png(4000, 100))).toEqual({ ok: false, reason: "dimensions" });
    expect(inspectLogo(jpeg(31, 500))).toEqual({ ok: false, reason: "dimensions" });
  });
});
