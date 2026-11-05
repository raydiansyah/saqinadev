# AI orchestrator

What runs the AI in Saqina, and what it is built on. In short: the orchestration is **our own code on
the PostgreSQL database and the Next.js app**, with no agent framework (no LangChain, no AI SDK, no
queue service). Models are reached through adapters written against each provider's HTTP API.

## Parts

| Part | What it is | Where |
|---|---|---|
| **Gateway** | Picks a model for each call, calls it, falls back, records usage | `src/lib/ai/gateway.ts`, `model-resolver.ts` |
| **Control plane** | The platform Owner's screens: providers, models, defaults, agent mapping, policy | `src/lib/ai/control-plane.ts`, `/dashboard/ai` |
| **Adapters** | One per protocol behind the `AiProvider` interface | `src/lib/ai/adapters/` |
| **Agent registry** | Who each agent is: instructions, scope, tools, model, limits, versions | `src/lib/agent-definitions/` |
| **Execution engine** | Plans work, runs tasks by dependency, retries, cancels, streams progress | `src/lib/executions/` |
| **Tool policy** | Which tool an agent may call, and what needs a person's approval | `src/lib/tools/` |
| **Memory** | Project memory the models read, with full-text and optional vector search | `src/lib/memory/` |

## Which model answers

Each call names an operation (`conversation`, `intent`, `structured_analysis`, `document_generation`,
`agent_run`, `tool_call`, `context_generation`, `connection_test`, `embedding`) and the abilities it needs
(text, structured output, tool calling, and so on). The gateway tries models in this order and skips any
that is disabled, not allowed by policy, or missing an ability:

1. the person's own model, if they chose one (and then only that one);
2. the agent's own model, or the platform's mapping for its role;
3. the project's preferred model;
4. the platform default, then the platform fallback.

If none can answer, the answer comes from deterministic rules and no data leaves the server. The call is
recorded in `ai_usage_records` (model, tokens, duration, outcome), never the text.

## Providers it can talk to

| Adapter | Reaches |
|---|---|
| `anthropic`, `anthropic_compatible` | Anthropic, or a server speaking its API |
| `openai`, `openai_compatible` | OpenAI, or any compatible endpoint (also used for embeddings) |
| `gemini` | Google Gemini (also for embeddings) |
| `vercel_gateway` | Vercel AI Gateway |
| `local_cli` | Claude Code, Codex or OpenCode logged in on the server, with no key ([ADR 0023](adr/0023-local-cli-provider.md)). Off by default; the Owner switches it on |

Keys are encrypted at rest and never shown again. A person can also add their own key for their own chats
([ADR 0017](adr/0017-own-ai-gateway.md)). The default model is configured by the Owner in AI & Models;
`ANTHROPIC_API_KEY` is only a system fallback.

## Plan and Build with agents

Decision record: [ADR 0020](adr/0020-execution-engine.md), [0021](adr/0021-agents-commit-to-a-work-branch.md),
[0022](adr/0022-owner-agent-registry.md).

1. **Plan.** A planner agent turns a request into tasks with roles, dependencies and acceptance criteria.
   The plan is checked: known roles, no cycles, within the budget.
2. **Dispatch.** A task starts only when everything it depends on has succeeded. Up to three run at once.
   Tasks that write the same files run one after another. Each goes to a project agent whose definition is
   on and was frozen into the execution.
3. **Run.** An agent reads files from the work branch and writes within its task's files. Writes go through
   the audited tool pipeline to a branch named `saqina/exec-<id>`. A task succeeds only after the git host
   returns a commit id. Reviewer agents give a verdict with evidence per criterion; a failed review sends
   the findings back as a revision task.
4. **Hand over.** Agents message each other through stored messages, only to agents their definition
   lists. Text from files, messages, CI or documentation reaches a model as data, never as an instruction.
5. **Stop.** Cancel tells the running agent to stop. A failed task can be retried. A time limit and a
   deadline end work that runs too long.

Agents never merge, open a pull request or deploy: a person does that.

Budget of one execution: 25 tasks, a chain of 6 dependent tasks, 2 retries per task, 3 runs at once, 60
minutes, 400 messages, and 3 open executions per project.

## What it runs on

| Need | Used | Not used |
|---|---|---|
| State, queue | PostgreSQL tables (`executions`, `execution_jobs`, `execution_events`, `agent_messages`, …) claimed with `FOR UPDATE SKIP LOCKED` | Redis, BullMQ, Inngest |
| Worker | Work after the response (`after()`) and `GET /api/cron/executions`, the same code in both | A separate worker process |
| Live progress | Server-sent events read from the stored event log, resumable with `Last-Event-ID`, polling as a fallback | WebSockets, a hosted realtime service |
| Order of events | A counter on the execution row, taken in the same transaction as each change | |
| Rules of movement | Pure state machines for execution and task, checked on every move | |
| Models | Own adapters over HTTP, one `AiProvider` interface | LangChain, the Vercel AI SDK |
| Search | PostgreSQL full-text, plus `pgvector` for projects that opted in ([ADR 0024](adr/0024-semantic-search.md)) | A separate vector database |

On Vercel, run the cron route every minute in production (Pro, or an outside scheduler); see the
[runbook](runbook.md#executions-plan-and-build-with-agents). Without a model set up, a plan fails at once
and says so.

## Where a person stays in control

- Changes to project data are proposals a person approves; the one write without approval is an agent's
  commit to its own work branch.
- Only the platform Owner manages agents, providers and the local CLI switch; every change is audited.
- An agent can use only the tools in its definition, frozen when the execution starts.
- Every prompt separates instructions from data (`instruction`, `project_data`, `external`, `tool_output`).
