import "server-only";
import { and, eq } from "drizzle-orm";
import type { ProjectAccess } from "@/lib/auth/permissions";
import { db } from "@/lib/db/client";
import { documents, mcpConnections } from "@/lib/db/schema";
import { AppError } from "@/lib/errors";
import type { EventBatch } from "@/lib/events/emitter";
import { assertWritableBranch, getRepository, withRepo } from "@/lib/git/service";
import { McpError } from "@/lib/mcp/client";
import { withMcpClient } from "@/lib/mcp/service";
import { listMemories } from "@/lib/memory/service";
import { getTechStack } from "@/lib/projects/stack";
import type { ToolRow } from "./registry";

type Input = Record<string, unknown>;
export interface HandlerContext {
  access: ProjectAccess;
  batch: EventBatch;
}

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

async function internal(tool: ToolRow, input: Input, { access }: HandlerContext) {
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
