import { createHash } from "node:crypto";
import * as z from "zod";
import { MEMORY_CATEGORIES } from "@/lib/domain/enums";
import { MEMORY_KINDS, MEMORY_LEVELS } from "@/lib/domain/memory";
import { skillContentSchema } from "../skills/content";

/**
 * The portable form of project memory: plain JSON, readable by a person and by another tool.
 * Everything in it is data. An import trusts none of it: it never carries visibility, owner,
 * approval or confidence across, only what the text says.
 */

export const PACKAGE_FORMAT = "saqina-memory";
export const PACKAGE_VERSION = 1;
/** What one import takes. A larger package is split by the person who made it. */
export const MAX_IMPORT_ITEMS = 200;
export const MAX_EXPORT_ITEMS = 2000;
/** One export file holds this many items, so it can be imported again in one go. */
export const EXPORT_PART_ITEMS = MAX_IMPORT_ITEMS;
/** Under the 1 MB a server action accepts by default, measured in bytes, not characters. */
export const MAX_PACKAGE_BYTES = 1_000_000;

const sourceRef = z.object({ type: z.string().max(30), ref: z.string().max(300) });

export const memoryItemSchema = z.object({
  type: z.literal("memory"),
  title: z.string().trim().min(2).max(160),
  content: z.string().trim().min(1).max(4000),
  category: z.enum(MEMORY_CATEGORIES).catch("product"),
  importance: z.enum(["high", "normal"]).catch("normal"),
  level: z.enum(MEMORY_LEVELS).catch("L1"),
  kind: z.enum(MEMORY_KINDS).catch("fact"),
  /** Where it came from in the exporting project; informational. */
  origin: z.string().max(40).optional(),
  sources: z.array(sourceRef).max(10).default([]),
  createdAt: z.string().max(40).optional(),
});

export const skillItemSchema = skillContentSchema.extend({ type: z.literal("skill") });

export const itemSchema = z.discriminatedUnion("type", [memoryItemSchema, skillItemSchema]);
export type PackageItem = z.output<typeof itemSchema>;

export const packageSchema = z.object({
  format: z.literal(PACKAGE_FORMAT),
  version: z.literal(PACKAGE_VERSION),
  exportedAt: z.string().max(40),
  project: z.object({ name: z.string().max(200) }),
  items: z.array(z.unknown()).max(MAX_EXPORT_ITEMS),
  /** Present on an export made in parts: which part this is, of how many. */
  part: z.object({ number: z.number().int().min(1), of: z.number().int().min(1) }).optional(),
  checksum: z.string().length(64),
});
export type MemoryPackage = Omit<z.output<typeof packageSchema>, "items"> & {
  items: PackageItem[];
};

/** Detects a package that was cut off or edited by accident. It does not prove who made it. */
export const checksumOf = (items: unknown[]) =>
  createHash("sha256").update(JSON.stringify(items)).digest("hex");
