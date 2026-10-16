import "server-only";
import { and, asc, eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { getChangesSince } from "@/lib/brain/brain";
import { listPrdFindings } from "@/lib/brain/prd-findings";
import { db } from "@/lib/db/client";
import { documents, mcpConnections } from "@/lib/db/schema";
import { listDocMap } from "@/lib/docmap/index-docs";
import { isSyncType } from "@/lib/docsync/paths";
import type { MemoryCategory } from "@/lib/domain/enums";
import { AppError } from "@/lib/errors";
import type { EventBatch } from "@/lib/events/emitter";
import { assertWritableBranch, getRepository, withRepo } from "@/lib/git/service";
import { McpError } from "@/lib/mcp/client";
import { withMcpClient } from "@/lib/mcp/service";
import { createMemoryTx, listMemories } from "@/lib/memory/service";
import { getTechStack } from "@/lib/projects/stack";
import { createProposalTx } from "@/lib/proposals/repository";
import type { ToolActor } from "./executor";
import type { ToolRow } from "./registry";

type Input = Record<string, unknown>;
export interface HandlerContext {
  access: ProjectAccess;
  batch: EventBatch;
  actor: ToolActor;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);
const READ_LIMIT = 60_000;

/** A document an agent may see: PRD, PLAN and custom documents, never business documents. */
async function agentDocument(projectId: string, slug: string | undefined) {
  const [doc] = slug
    ? await db
        .select()
        .from(documents)
        .where(and(eq(documents.projectId, projectId), eq(documents.slug, slug)))
    : [];
  if (!doc || !isSyncType(doc.type)) throw new AppError("NOT_FOUND", "Unknown document");
  return doc;
}

async function internal(tool: ToolRow, input: Input, { access, actor, batch }: HandlerContext) {
  switch (tool.name) {
    case "read_project":
      return {
        name: access.project.name,
        status: access.project.status,
        description: access.project.description,
        stack: Object.fromEntries(
          Object.entries(await getTechStack(access)).map(([k, v]) => [k, v?.value]),
        ),
      };
    case "read_prd": {
      const [prd] = await db
        .select({ content: documents.content, version: documents.version })
        .from(documents)
        .where(and(eq(documents.projectId, access.project.id), eq(documents.slug, "prd")));
      return prd
        ? { version: prd.version, content: prd.content.slice(0, 20_000) }
        : { content: null };
    }
    case "list_documents": {
      const rows = await db
        .select({
          slug: documents.slug,
          title: documents.title,
          type: documents.type,
          status: documents.status,
          version: documents.version,
          updatedAt: documents.updatedAt,
        })
        .from(documents)
        .where(eq(documents.projectId, access.project.id))
        .orderBy(asc(documents.createdAt));
      return { documents: rows.filter((d) => isSyncType(d.type)) };
    }
    case "read_document": {
      const doc = await agentDocument(access.project.id, str(input.slug));
      return {
        slug: doc.slug,
        title: doc.title,
        status: doc.status,
        version: doc.version,
        truncated: doc.content.length > READ_LIMIT,
        content: doc.content.slice(0, READ_LIMIT),
      };
    }
    case "propose_document_change": {
      // Members edit in the app; this tool is how an agent asks for a change.
      if (actor.kind !== "agent")
        throw new AppError("AUTHORIZATION_ERROR", "Only agents propose changes this way");
      const doc = await agentDocument(access.project.id, str(input.slug));
      const baseVersion = Number(input.baseVersion);
      if (doc.version !== baseVersion)
        throw new AppError("CONFLICT", "Document changed", { content: "stale" });
      if (doc.status === "signed" || doc.status === "archived")
        throw new AppError("CONFLICT", "Document is read-only", { content: doc.status });
      const content = String(input.content);
      if (content === doc.content)
        throw new AppError("VALIDATION_ERROR", "No change", { content: "unchanged" });
      const proposal = await db.transaction((tx) =>
        createProposalTx(
          tx,
          access,
          {
            type: "agent_result",
            title: `${actor.name}: ${doc.title}`.slice(0, 200),
            description: str(input.summary) ?? "",
            actions: [
              {
                type: "UPDATE_DOCUMENT",
                key: "d1",
                payload: {
                  docSlug: doc.slug,
                  content,
                  baseVersion,
                  agentId: actor.agentId,
                  summary: str(input.summary) ?? "",
                },
                before: { title: doc.title, content: doc.content },
              },
            ],
          },
          batch,
        ),
      );
      return {
        proposalId: proposal.id,
        status: "pending_approval",
        message: "A project member must approve the change in Saqina before it is applied.",
      };
    }
    case "get_changes": {
      const since = Number(input.sinceRevision);
      const { upToDate, changes, truncated } = await getChangesSince(access, since);
      return {
        revision: access.project.contextRevision,
        sinceRevision: since,
        upToDate,
        changes,
        truncated,
      };
    }
    case "read_doc_map":
      return {
        revision: access.project.contextRevision,
        documents: await listDocMap(db, access.project.id),
      };
    case "list_prd_findings":
      return {
        revision: access.project.contextRevision,
        findings: (await listPrdFindings(access)).map((f) => ({
          kind: f.kind,
          subject: f.subject,
        })),
      };
    case "write_memory": {
      // Append-only: an entry with the same title and text is already known, anything else is new.
      const data = {
        title: String(input.title).trim(),
        content: String(input.content).trim(),
        category: (str(input.category) ?? "technical") as MemoryCategory,
        importance: (str(input.importance) ?? "normal") as "high" | "normal",
      };
      const existing = (await listMemories(access)).find(
        (m) => m.title.toLowerCase() === data.title.toLowerCase() && m.content === data.content,
      );
      if (existing) return { id: existing.id, created: false };
      const row = await db.transaction((tx) =>
        createMemoryTx(tx, access, data, {
          via: "agent",
        }),
      );
      return { id: row.id, created: true };
    }
    case "search_memory": {
      const q = (str(input.query) ?? "").toLowerCase();
      const items = (await listMemories(access)).filter((m) =>
        `${m.title} ${m.content}`.toLowerCase().includes(q),
      );
      return { items: items.slice(0, 20).map((m) => ({ title: m.title, content: m.content })) };
    }
  }
  throw new AppError("NOT_FOUND", "Unknown tool");
}

async function git(tool: ToolRow, input: Input, { access, batch }: HandlerContext) {
  const repo = await getRepository(access);
  if (!repo || repo.status === "disconnected")
    throw new AppError("VALIDATION_ERROR", "Repository not connected", {
      repository: "notConnected",
    });
  const emit = (
    type: "BRANCH_CREATED" | "COMMIT_CREATED" | "PULL_REQUEST_CREATED",
    data: Record<string, string>,
  ) =>
    batch.emit(db, {
      type,
      projectId: access.project.id,
      actorId: access.actor.id,
      entityType: "repository",
      entityId: access.project.id,
      data,
    });

  return withRepo(repo, async (adapter, ref, token) => {
    switch (tool.name) {
      case "list_branches":
        return { branches: await adapter.listBranches(ref, token) };
      case "list_files":
        return {
          files: (
            await adapter.listFiles(ref, token, { path: str(input.path), ref: str(input.ref) })
          ).slice(0, 300),
        };
      case "read_file":
        return {
          path: input.path,
          content: await adapter.readFile(ref, token, {
            path: String(input.path),
            ref: str(input.ref),
          }),
        };
      case "search_code":
        return { matches: await adapter.searchCode(ref, token, String(input.query)) };
      case "create_branch": {
        // Names without the agent prefix get it; the guard below rejects everything else.
        const raw = String(input.name);
        const name = raw.startsWith(repo.agentBranchPrefix)
          ? raw
          : `${repo.agentBranchPrefix}${raw}`;
        assertWritableBranch(repo, name);
        const branch = await adapter.createBranch(ref, token, {
          name,
          from: repo.developmentBranch ?? repo.defaultBranch,
        });
        await emit("BRANCH_CREATED", { title: name });
        return branch;
      }
      case "commit_changes": {
        const branch = String(input.branch);
        assertWritableBranch(repo, branch);
        const files = (input.files as { path: string; content: string }[]) ?? [];
        const result = await adapter.commitChanges(ref, token, {
          branch,
          message: String(input.message),
          files,
        });
        await emit("COMMIT_CREATED", {
          title: String(input.message).slice(0, 120),
          branch,
          sha: result.sha.slice(0, 12),
        });
        return { ...result, branch, files: files.map((f) => f.path) };
      }
      case "create_pull_request": {
        const branch = String(input.branch);
        assertWritableBranch(repo, branch);
        const pr = await adapter.createPullRequest(ref, token, {
          head: branch,
          base: repo.developmentBranch ?? repo.defaultBranch,
          title: String(input.title),
          body: str(input.body) ?? "",
        });
        await emit("PULL_REQUEST_CREATED", {
          title: String(input.title).slice(0, 120),
          url: pr.url,
        });
        return pr;
      }
    }
    throw new AppError("AUTHORIZATION_ERROR", "Not available");
  });
}

async function mcp(tool: ToolRow, input: Input, { access }: HandlerContext) {
  const [conn] = tool.connectionId
    ? await db
        .select()
        .from(mcpConnections)
        .where(
          and(
            eq(mcpConnections.id, tool.connectionId),
            eq(mcpConnections.projectId, access.project.id),
          ),
        )
    : [];
  if (!conn || conn.status !== "connected")
    throw new AppError("VALIDATION_ERROR", "MCP connection unavailable", {
      connection: "unavailable",
    });
  const result = await withMcpClient(conn, (client) => client.callTool(tool.name, input));
  if (result.isError) throw new McpError("tool_error");
  return (
    result.structuredContent ?? {
      text: result.content
        .map((c) => c.text ?? "")
        .join("\n")
        .slice(0, 20_000),
    }
  );
}

export const HANDLERS = { internal, git, mcp } as const;
