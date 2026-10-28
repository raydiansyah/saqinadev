# AI agents: the workflow for PRDs and plans

Applies to every agent that works in this repository: Claude Code, Codex (ChatGPT), Gemini CLI,
Antigravity, Kiro, and any agent a person connects to Saqina over MCP. The same rule is repeated in
`AGENTS.md`, `GEMINI.md` and `.kiro/steering/prd-plan-workflow.md`, because some tools do not follow links.

## The rule

When you create or edit a PRD, a spec or a plan (implementation plan, roadmap, task breakdown), do these
in order. Read the project PRD ([PRD.md](../PRD.md)) first.

1. **Superpowers.** Run `brainstorming` to settle intent, requirements and design. Run `executing-plans`
   when you carry out a plan that already exists.
2. **Ruflo.** Use `ruflo-sparc:sparc-spec` for a PRD or spec and `ruflo-goals:goal-plan` for a plan. Search
   memory for earlier patterns first and store what worked afterwards.
3. **Superpowers `writing-plans`.** Write the multi-step plan before you touch code.
4. **Antislop.** Load `antislop` and `antislop-copywriting` before you write the text. Add `antislop-ui`,
   `antislop-code`, `antislop-human` or `antislop-layoutmobile` when the document is about UI or code.

If a skill is not installed, stop and tell the person. Do not skip it quietly, and do not pretend you ran it.
Follow the steps in its `SKILL.md` by hand only when the person says to go on without it.

Status: **Manual** (the agent must follow it). `scripts/check-agent-skills.sh` shows what is installed.

## Check this machine

```bash
bash scripts/check-agent-skills.sh
```

It lists, for each agent, which of the nine required skills it can find, and prints the fix for each gap.

## Install

| Skill set | Install |
|---|---|
| Superpowers | Claude Code: `/plugin install superpowers@claude-plugins-official`. Other agents: follow the README at <https://github.com/obra/superpowers> for Codex, Gemini CLI and Kiro |
| Ruflo | `claude mcp add claude-flow -- npx -y @claude-flow/cli@latest`, then `npx @claude-flow/cli@latest init --wizard` |
| Antislop | Put the `antislop*` folders in `~/.agents/skills/`, then link them into each agent's skills folder |

Superpowers and Ruflo skills installed through Claude Code live in `~/.claude/plugins/cache/`. Other agents
reach them by a symlink in `~/.agents/skills/` (and `~/.kiro/skills/` for Kiro) that points at the version
folder. A plugin update changes that folder name: run the check script and link the new path again.

A skills folder is shared when it is a symlink to `~/.agents/skills/`. Link a skill into an agent with:

```bash
ln -s ~/.agents/skills/antislop ~/.kiro/skills/antislop
```

## Where each agent reads its rules

| Agent | File |
|---|---|
| Claude Code | `CLAUDE.md` (imports `AGENTS.md` and these standards) |
| Codex (ChatGPT) | `AGENTS.md` |
| Gemini CLI, Antigravity | `GEMINI.md`, `AGENTS.md` |
| Kiro | `.kiro/steering/prd-plan-workflow.md`, `AGENTS.md` |

## Memory: which one for what

Three memories exist. Each has one job; do not copy between them without a person.

| Memory | Holds | Never holds |
|---|---|---|
| **Saqina project memory** ([ADR 0004](../adr/0004-project-memory.md)) | Facts, decisions and constraints of a client project, with sources and review | Anything about how to work on this repository |
| **Ruflo memory** (`agentdb.rvf`, `ruvector.db`, `.swarm/`, local files) | Working patterns for coding agents, for example "migrations only add" | Client data, secrets, `.env` values, document text, production data. It has no access control and agents write to it directly |
| **Assistant memory** (`~/.claude/projects/.../memory/`) | The person's preferences and corrections to the agent | Anything the code, the PRD or an ADR already says |

Product decisions go to the PRD or an ADR. Facts about a client project reach Saqina memory only through
`write_memory`, which creates a candidate that a person reviews. Invoices, payments and code are read from
their own records, never from memory. Nothing flows from Ruflo memory into Saqina memory automatically.

Ruflo files are local and git-ignored. If the Ruflo server is down, say so and carry on without it.

## Inside Saqina

An agent a person connects to a project over MCP is bound by the same rule when it writes a PRD or plan,
and it acts only inside the permission it was granted ([governance](governance.md)).
The "Build in Saqina" assistant that drafts a PRD or plan does not yet run these steps: **Planned**.
Until it does, a person reviews every PRD or plan it writes.
