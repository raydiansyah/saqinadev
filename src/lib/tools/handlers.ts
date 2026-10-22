import "server-only";
import { and, asc, count, eq, or, sql } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { getChangesSince } from "@/lib/brain/brain";
import { listPrdFindings } from "@/lib/brain/prd-findings";
import { db } from "@/lib/db/client";
import type { SymbolKind } from "@/lib/db/schema";
import { documents, mcpConnections, memories, memoryAssets } from "@/lib/db/schema";
import { listDocMap } from "@/lib/docmap/index-docs";
import { isSyncType } from "@/lib/docsync/paths";
import type { MemoryCategory } from "@/lib/domain/enums";
import type { SkillOutcome } from "@/lib/domain/memory";
import { AppError } from "@/lib/errors";
import type { EventBatch } from "@/lib/events/emitter";
import { assertWritableBranch, getRepository, withRepo } from "@/lib/git/service";
import { McpError } from "@/lib/mcp/client";
import { withMcpClient } from "@/lib/mcp/service";
import { callersOf, findSymbols, impactOf, type Revision } from "@/lib/memory/code/queries";
import { textTombKeys } from "@/lib/memory/hash";
import type { Principal } from "@/lib/memory/policy";
import { type RetrievedItem, readAsset, retrieveMemory } from "@/lib/memory/retrieval/engine";
import { visibleWhere } from "@/lib/memory/scope";
import { createMemoryTx } from "@/lib/memory/service";
import { retrieveSkills } from "@/lib/memory/skills/retrieve";
import { recordAgentSkillFeedback, recordSkillsOffered } from "@/lib/memory/skills/usage";
import { isTombstoned } from "@/lib/memory/store";
import { citation, retrieveWiki } from "@/lib/memory/wiki/retrieve";
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
const MAX_AGENT_PROPOSALS = 20;
const ALL_STATUSES = [
  "candidate",
  "pending_review",
  "approved",
  "rejected",
  "superseded",
  "archived",
] as const;

/**
 * Who is reading memory. An agent is its own principal: it never inherits the private memory of
 * the member who created its token, only what is shared with the project or granted to it.
 */
function memoryPrincipal(access: ProjectAccess, actor: ToolActor): Principal {
  return actor.kind === "agent"
    ? {
        kind: "agent",
        agentId: actor.agentId,
        creatorId: access.actor.id,
        canReadMemory: actor.permissions.includes("read_memory"),
      }
    : { kind: "user", userId: access.actor.id, role: access.role };
}

const memoryItem = (i: RetrievedItem) => ({
  id: i.assetId,
  level: i.level,
  kind: i.kind,
  title: i.title,
  content: i.content,
  truncated: i.truncated,
  confidence: i.confidence,
  origin: i.origin,
  sources: i.sources.map((s) => ({ type: s.sourceType, id: s.sourceId })),
});

const CODE_NOTE =
  "Static analysis of the code at the stated commit: dynamic calls and inheritance are not seen. Read the files before relying on it.";

const revisionOf = (r: Revision | null) =>
  r
    ? {
        repository: r.repository,
        branch: r.branch,
        commit: r.commitSha,
        parser: r.parser,
        status: r.status,
        indexedAt: r.indexedAt,
        stale: r.stale,
        partial: r.errorCode === "file_limit",
      }
    : null;

async function codeAnswer(tool: string, principal: Principal, projectId: string, input: Input) {
  if (tool === "find_symbol") {
    const r = await findSymbols(principal, projectId, {
      query: str(input.query) ?? "",
      kind: str(input.kind) as SymbolKind | undefined,
    });
    if (!r.revision) return { indexed: false, note: "Nothing is indexed for this project yet." };
    return {
      revision: revisionOf(r.revision),
      note: CODE_NOTE,
      symbols: r.items.map((s) => ({
        id: s.id,
        name: s.name,
        kind: s.kind,
        exported: s.exported,
        container: s.container,
        file: s.path,
        lines: [s.startLine, s.endLine],
        resolvedCallers: s.resolvedCallers,
      })),
    };
  }
  if (tool === "find_callers") {
    const r = await callersOf(principal, projectId, { symbolId: String(input.symbolId) });
    if (!r.revision) return { indexed: false, note: "Nothing is indexed for this project yet." };
    if (!r.symbol) throw new AppError("NOT_FOUND", "Unknown symbol");
    return {
      revision: revisionOf(r.revision),
      note: CODE_NOTE,
      symbol: r.symbol,
      callers: r.items.map((c) => ({
        resolution: c.resolution,
        file: c.path,
        line: c.line,
        caller: c.caller,
        test: c.isTest,
      })),
    };
  }
  const r = await impactOf(principal, projectId, { path: String(input.path) });
  if (!r.revision) return { indexed: false, note: "Nothing is indexed for this project yet." };
  if (!r.file) throw new AppError("NOT_FOUND", "Unknown file");
  return {
    revision: revisionOf(r.revision),
    note: CODE_NOTE,
    file: r.file,
    dependents: r.dependents,
    tests: r.tests,
  };
}

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
      // A proposal, not a fact: it waits for review, and an identical text is not queued twice.
      const data = {
        title: String(input.title).trim(),
        content: String(input.content).trim(),
        category: (str(input.category) ?? "technical") as MemoryCategory,
        importance: (str(input.importance) ?? "normal") as "high" | "normal",
      };
      const principal = memoryPrincipal(access, actor);
      // Only what this caller may read can count as "already there"; anything else behaves as new,
      // so the answer cannot reveal someone's private or rejected memory.
      const [existing] = await db
        .select({ id: memoryAssets.id, status: memoryAssets.status })
        .from(memoryAssets)
        .innerJoin(memories, eq(memories.assetId, memoryAssets.id))
        .where(
          and(
            or(
              visibleWhere(principal, access.project.id, ALL_STATUSES),
              // Its own earlier proposals (waiting for review) count too.
              and(eq(memoryAssets.ownerId, access.actor.id), eq(memories.source, "agent")),
            ),
            sql`lower(${memoryAssets.title}) = ${data.title.toLowerCase()}`,
            eq(memories.content, data.content),
          ),
        )
        .limit(1);
      if (existing) return { id: existing.id, created: false, status: existing.status };
      const blocked = await isTombstoned(
        db,
        access.project.id,
        ...textTombKeys(data.title, data.content, access.actor.id),
      );
      if (blocked) return { id: null, created: false, status: "not_added" };
      // One agent cannot fill the review queue of the person who created its token.
      const [{ waiting }] = await db
        .select({ waiting: count() })
        .from(memories)
        .innerJoin(memoryAssets, eq(memoryAssets.id, memories.assetId))
        .where(
          and(
            eq(memories.projectId, access.project.id),
            eq(memories.source, "agent"),
            eq(memoryAssets.status, "pending_review"),
            eq(memoryAssets.ownerId, access.actor.id),
          ),
        );
      if (waiting >= MAX_AGENT_PROPOSALS) throw new AppError("RATE_LIMIT");
      const row = await db.transaction((tx) =>
        createMemoryTx(
          tx,
          access,
          data,
          { via: "agent" },
          { status: "pending_review", visibility: "project" },
        ),
      );
      return { id: row.assetId, created: true, status: "pending_review" };
    }
    case "search_memory": {
      const result = await retrieveMemory(memoryPrincipal(access, actor), access.project.id, {
        query: str(input.query) ?? "",
        budget: { maxAssets: 20 },
      });
      return {
        semantic: result.semantic,
        ...(result.degraded ? { degraded: result.degraded } : {}),
        items: result.items.map(memoryItem),
      };
    }
    case "find_symbol":
    case "find_callers":
    case "file_impact": {
      // Opened by read_repository, the permission that gates these tools.
      const base = memoryPrincipal(access, actor);
      const principal: Principal =
        base.kind === "agent"
          ? {
              ...base,
              canReadMemory:
                actor.kind === "agent" && actor.permissions.includes("read_repository"),
            }
          : base;
      return codeAnswer(tool.name, principal, access.project.id, input);
    }
    case "search_skills": {
      const hits = await retrieveSkills(memoryPrincipal(access, actor), access.project.id, {
        query: str(input.query) ?? "",
        limit: 5,
      });
      if (actor.kind === "agent") await recordSkillsOffered(access.project.id, actor.agentId, hits);
      return {
        skills: hits.map((h) => ({
          id: h.assetId,
          version: h.version,
          name: h.content.name,
          description: h.content.description,
          useWhen: h.content.triggers,
          doNotUseWhen: h.content.exclusions,
          prerequisites: h.content.prerequisites,
          steps: h.content.steps,
          produces: h.content.outputs,
          checkItWorked: h.content.validation,
        })),
      };
    }
    case "record_skill_outcome": {
      if (actor.kind !== "agent") throw new AppError("VALIDATION_ERROR", "Agents only");
      await recordAgentSkillFeedback(
        access,
        { id: actor.agentId, canReadMemory: actor.permissions.includes("read_memory") },
        {
          skillId: String(input.skillId),
          outcome: String(input.outcome) as SkillOutcome,
          note: str(input.note),
        },
      );
      return { recorded: true };
    }
    case "search_wiki": {
      // The tool is gated by read_prd, so that is the permission that opens the documents.
      const principal = memoryPrincipal(access, actor);
      const docs: Principal =
        principal.kind === "agent"
          ? {
              ...principal,
              canReadMemory: actor.kind === "agent" && actor.permissions.includes("read_prd"),
            }
          : principal;
      const result = await retrieveWiki(docs, access.project.id, {
        query: str(input.query) ?? "",
        budget: { maxAssets: 10 },
      });
      return {
        semantic: result.semantic,
        ...(result.degraded ? { degraded: result.degraded } : {}),
        passages: result.passages.map((p) => ({
          source: p.sourceRef,
          sourceType: p.sourceType,
          title: p.title,
          heading: p.heading,
          lines: [p.startLine, p.endLine],
          citation: citation(p),
          stale: p.stale,
          draft: p.draft,
          truncated: p.truncated,
          content: p.content,
        })),
      };
    }
    case "read_memory": {
      const item = await readAsset(
        memoryPrincipal(access, actor),
        access.project.id,
        String(input.id),
      );
      if (!item) throw new AppError("NOT_FOUND", "Unknown memory");
      return memoryItem(item);
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
