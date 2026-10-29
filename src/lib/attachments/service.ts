import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import type { Actor } from "@/lib/auth/actor";
import { loadProjectAccess, type ProjectAccess } from "@/lib/auth/permissions";
import { db, type Tx } from "@/lib/db/client";
import { chatAttachments } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import { log } from "@/lib/log";
import { allow } from "@/lib/rate-limit";
import { detectFile, MAX_ATTACHMENT_BYTES } from "./detect";
import { type FileStore, fileStore } from "./storage";

export type AttachmentKind = "text" | "image" | "pdf";

export interface AttachmentView {
  id: string;
  name: string;
  mime: string;
  size: number;
  kind: AttachmentKind;
}

/** Most files one message carries. */
export const MAX_ATTACHMENTS = 5;

const view = (r: typeof chatAttachments.$inferSelect): AttachmentView => ({
  id: r.id,
  name: r.name,
  mime: r.mime,
  size: r.size,
  kind: r.kind,
});

/** A safe display name: no path, no control characters, at most 120 characters. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const clean = base.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return clean.slice(-120) || "file";
}

/**
 * Uploads one file for a message the person is about to send. The type comes from the bytes,
 * never from the name or the browser's claim; anything else is refused.
 */
export async function uploadAttachment(
  actor: Actor,
  slug: string,
  file: { name: string; bytes: Uint8Array },
  store: FileStore = fileStore(),
): Promise<AttachmentView> {
  const access = await loadProjectAccess(actor, { slug }, "content:write");
  if (!(await allow(`attachments:${actor.id}`, 60, 60 * 60_000))) throw new AppError("RATE_LIMIT");
  if (file.bytes.byteLength === 0)
    throw new AppError("VALIDATION_ERROR", "Empty file", { file: "empty" });
  if (file.bytes.byteLength > MAX_ATTACHMENT_BYTES)
    throw new AppError("VALIDATION_ERROR", "File too large", { file: "tooLarge" });
  const name = cleanFileName(file.name);
  const detected = detectFile(name, file.bytes);
  if (!detected) throw new AppError("VALIDATION_ERROR", "Unsupported file", { file: "type" });

  const id = randomUUID();
  // The key never carries the file name: names can hold personal data.
  const key = `projects/${access.project.id}/attachments/${id}`;
  await store.put(key, file.bytes, detected.mime);
  const [row] = await db
    .insert(chatAttachments)
    .values({
      id,
      projectId: access.project.id,
      uploadedBy: actor.id,
      name,
      mime: detected.mime,
      size: file.bytes.byteLength,
      sha256: createHash("sha256").update(file.bytes).digest("hex"),
      kind: detected.kind,
      storage: store.driver,
      storageKey: key,
      textContent: detected.text ?? null,
      data: store.driver === "db" ? Buffer.from(file.bytes) : null,
    })
    .returning();
  return view(row);
}

/**
 * Binds uploads to the message being sent. Only the sender's own uploads in this project that are
 * not yet part of a message; any other id is refused, so a file cannot be borrowed.
 */
export async function attachToMessageTx(
  tx: Tx,
  access: ProjectAccess,
  input: { ids: string[]; conversationId: string; messageId: string },
): Promise<AttachmentView[]> {
  if (input.ids.length === 0) return [];
  const rows = await tx
    .update(chatAttachments)
    .set({ conversationId: input.conversationId, messageId: input.messageId })
    .where(
      and(
        inArray(chatAttachments.id, input.ids),
        eq(chatAttachments.projectId, access.project.id),
        eq(chatAttachments.uploadedBy, access.actor.id),
        isNull(chatAttachments.messageId),
      ),
    )
    .returning();
  if (rows.length !== new Set(input.ids).size)
    throw new AppError("VALIDATION_ERROR", "Attachment unavailable", { attachments: "invalid" });
  return rows.map(view);
}

export interface LoadedAttachment extends AttachmentView {
  text: string | null;
  bytes: Uint8Array | null;
}

/** The files of a message, with their content, for the prompt. */
export async function loadForPrompt(
  access: ProjectAccess,
  messageId: string,
  store?: FileStore,
): Promise<LoadedAttachment[]> {
  const rows = await db
    .select()
    .from(chatAttachments)
    .where(
      and(
        eq(chatAttachments.projectId, access.project.id),
        eq(chatAttachments.messageId, messageId),
      ),
    );
  return Promise.all(
    rows.map(async (r) => ({
      ...view(r),
      text: r.textContent,
      bytes: r.kind === "text" ? null : await bytesOf(r, store),
    })),
  );
}

async function bytesOf(r: typeof chatAttachments.$inferSelect, store?: FileStore) {
  if (r.storage === "db") return r.data ? new Uint8Array(r.data) : new Uint8Array();
  return (store ?? fileStore()).get(r.storageKey);
}

/** One file for download. A file of another project, or of nobody, is NOT_FOUND. */
export async function readAttachment(
  actor: Actor,
  slug: string,
  id: string,
  store?: FileStore,
): Promise<{ view: AttachmentView; bytes: Uint8Array }> {
  const access = await loadProjectAccess(actor, { slug }, "project:read");
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("NOT_FOUND");
  const [row] = await db
    .select()
    .from(chatAttachments)
    .where(and(eq(chatAttachments.id, id), eq(chatAttachments.projectId, access.project.id)));
  // An upload not yet sent is visible only to the person who uploaded it.
  if (!row || (!row.messageId && row.uploadedBy !== actor.id)) throw new AppError("NOT_FOUND");
  return { view: view(row), bytes: await bytesOf(row, store) };
}

/** Uploads never sent within a day are removed, bytes included. */
export async function purgeUnsentAttachments(now = new Date(), store?: FileStore) {
  const stale = await db
    .delete(chatAttachments)
    .where(
      and(
        isNull(chatAttachments.messageId),
        lt(chatAttachments.createdAt, new Date(now.getTime() - 24 * 60 * 60_000)),
      ),
    )
    .returning({ storage: chatAttachments.storage, key: chatAttachments.storageKey });
  const remote = stale.filter((r) => r.storage === "s3");
  if (remote.length > 0) {
    const s3 = store ?? fileStore();
    for (const r of remote)
      await s3.delete(r.key).catch((error) =>
        log.warn("attachments.purge_failed", {
          error: error instanceof Error ? error.name : "error",
        }),
      );
  }
  return stale.length;
}
