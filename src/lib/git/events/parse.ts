import type { CiStatus, DeployEnvironment, DeploymentState } from "@/lib/domain/enums";

/** What a repository host told us, reduced to what Saqina records. Pure: no database here. */
export type GitEvent =
  | {
      kind: "push";
      branch: string;
      after: string;
      commits: { sha: string; message: string; url: string | null }[];
    }
  | {
      kind: "pull_request";
      action: string;
      number: number;
      title: string;
      body: string;
      url: string;
      headRef: string;
      baseRef: string;
      merged: boolean;
    }
  | {
      kind: "ci";
      externalId: string;
      sha: string;
      branch: string | null;
      name: string;
      status: CiStatus;
      conclusion: string | null;
      url: string | null;
    }
  | {
      kind: "deployment";
      externalId: string;
      environment: DeployEnvironment;
      state: DeploymentState;
      url: string | null;
      sha: string | null;
    };

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Json) : {};
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

const ciStatus = (v: unknown): CiStatus =>
  v === "completed" ? "completed" : v === "in_progress" ? "in_progress" : "queued";

/** `Production`, `production`, `Production – app` all mean production; everything else is a preview. */
export const environmentOf = (name: unknown): DeployEnvironment =>
  typeof name === "string" && /^production\b/i.test(name.trim()) ? "production" : "preview";

const DEPLOY_STATES: Record<string, DeploymentState> = {
  success: "success",
  failure: "failure",
  error: "failure",
  inactive: "inactive",
  pending: "pending",
  queued: "pending",
  in_progress: "pending",
};

/** Maps one webhook delivery to an event, or null when it is not something Saqina records. */
export function parseGitEvent(event: string | null, payload: unknown): GitEvent | null {
  const p = obj(payload);
  switch (event) {
    case "push": {
      const ref = str(p.ref);
      if (!ref?.startsWith("refs/heads/")) return null;
      const commits = Array.isArray(p.commits) ? p.commits : [];
      return {
        kind: "push",
        branch: ref.slice("refs/heads/".length),
        after: str(p.after) ?? "",
        commits: commits.slice(0, 50).flatMap((c) => {
          const o = obj(c);
          const sha = str(o.id);
          return sha
            ? [{ sha, message: (str(o.message) ?? "").slice(0, 2000), url: str(o.url) }]
            : [];
        }),
      };
    }
    case "pull_request": {
      const pr = obj(p.pull_request);
      const number = num(pr.number) ?? num(p.number);
      const action = str(p.action);
      if (number === null || !action) return null;
      return {
        kind: "pull_request",
        action,
        number,
        title: (str(pr.title) ?? "").slice(0, 300),
        body: (str(pr.body) ?? "").slice(0, 5000),
        url: str(pr.html_url) ?? "",
        headRef: str(obj(pr.head).ref) ?? "",
        baseRef: str(obj(pr.base).ref) ?? "",
        merged: pr.merged === true,
      };
    }
    case "check_suite": {
      const s = obj(p.check_suite);
      const id = num(s.id);
      const sha = str(s.head_sha);
      if (id === null || !sha) return null;
      return {
        kind: "ci",
        externalId: `suite:${id}`,
        sha,
        branch: str(s.head_branch),
        name: str(obj(s.app).name) ?? "Checks",
        status: ciStatus(s.status),
        conclusion: str(s.conclusion),
        url: str(s.url),
      };
    }
    case "workflow_run": {
      const r = obj(p.workflow_run);
      const id = num(r.id);
      const sha = str(r.head_sha);
      if (id === null || !sha) return null;
      return {
        kind: "ci",
        externalId: `run:${id}`,
        sha,
        branch: str(r.head_branch),
        name: (str(r.name) ?? "Workflow").slice(0, 120),
        status: ciStatus(r.status),
        conclusion: str(r.conclusion),
        url: str(r.html_url),
      };
    }
    case "deployment_status": {
      const d = obj(p.deployment);
      const s = obj(p.deployment_status);
      const id = num(d.id);
      const state = DEPLOY_STATES[str(s.state) ?? ""];
      if (id === null || !state) return null;
      return {
        kind: "deployment",
        externalId: String(id),
        environment: environmentOf(s.environment ?? d.environment),
        state,
        url: str(s.environment_url) ?? str(s.target_url),
        sha: str(d.sha),
      };
    }
    default:
      return null;
  }
}
