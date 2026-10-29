# Saqina Dev: product requirements

Status of this page: written 2026-10-23 from the code, the ADRs and the standards; updated 2026-10-29 (Studio, platform skills and connectors, Generate PRD). It is the PRD that
[`CLAUDE.md`](../CLAUDE.md) tells every tool to check before a feature is built or changed. Change the
product and this page in the same pull request.

Each requirement carries a status: **Built** (in the product and tested), **Partial** (some of it works;
the gap is named), **Planned** (agreed, not built).

## 1. Problem

An agency or studio that builds software for clients keeps scope in documents, agreements in email,
invoices in a spreadsheet, tasks in a tracker and progress in chat. Nobody can answer "where is this
project, what was agreed, and what is owed" without asking five people. Clients cannot follow progress
without asking. AI assistants that could help have no reliable record to read, so they guess.

## 2. Product

One workspace per client project: scope, agreements, invoices, payments, development and maintenance,
with an AI assistant that answers from the whole project record and a portal where the client follows
progress. Built by Abati Technology, live at saqina.dev, in English and Indonesian.

## 3. Users

| User | Needs |
|---|---|
| **Owner / admin** (agency lead) | One view of every project: scope, money, risk; control over who sees what |
| **Editor** (developer, PM) | Requirements, tasks, documents, decisions kept current with little typing |
| **Viewer** | Read-only access to a project |
| **Client** (portal user) | Follow progress, read shared documents, approve and sign, pay; never see internal data |
| **Platform owner** (Saqina staff) | Run the platform: plans, white-label grants, AI control plane |
| **Agent** (Claude client over MCP) | Read a project and append memory inside the permission it was granted |

Roles are `owner`, `admin`, `editor`, `viewer` per project; portal users are a separate kind.

## 4. Goals and non-goals

Goals:

1. The project record is the single source of truth; the assistant, the portal and the documents all read it.
2. A client can follow a project and approve work without a call.
3. Every change to money, scope or agreements leaves an audit trail.
4. AI helps without ever acting alone: rules validate every write, a person approves.

Non-goals (this version): a general chat product, time tracking with payroll, accounting beyond
invoices and payments, mobile apps, e-signature with a legal certificate authority, semantic search.

## 5. Requirements

### 5.1 Projects and onboarding

| # | Requirement | Status |
|---|---|---|
| P1 | Create a project from a brief; an interview captures objective, features, stack, delivery. Nobody types a title: the name comes from the plan (the preview plan at creation, then a model-suggested title after the interview) until a person renames it; the URL never changes ([ADR 0010](adr/0010-ai-refinement-arrives-as-proposals.md)) | Built |
| P2 | Import an existing project from GitHub; it asks how far the system is (build, review, deploy) and the answers drive the stage, progress and tasks. Each answer is independent; answers that disagree are flagged, not corrected ([ADR 0008](adr/0008-delivery-answers-are-independent.md)) | Built |
| P3 | Imported projects follow GitHub: documents are pulled one way, the newest edit wins, the PRD is found by name or asked for ([ADR 0005](adr/0005-imported-projects-follow-github.md)) | Built |
| P4 | Project settings: name, build strategy, repository, deployment, domain; a failed save keeps what was typed | Built |
| P5 | Archive, restore and delete a project (delete needs the typed name) | Built |
| P6 | The interview recommends a UI theme from 21 (3 tiers: recommended, available, concept), the user can change it, and the choice feeds the PRD, plan and memory. A public `/themes` page shows all 21 with live previews, including a dashboard preview; every theme defines status and chart colours that pass contrast checks, and a concept theme on a project with data screens gets an extra warning | Built |

### 5.2 Requirements, plan and delivery

| # | Requirement | Status |
|---|---|---|
| R1 | Requirements with priority and status, with bulk actions | Built |
| R2 | PRD document per project, with a check that finds gaps against requirements (PRD findings) | Built |
| R3 | Plan with milestones and tasks; tasks follow the delivery stage | Built |
| R4 | Features, decisions, change requests and client approvals, each recorded and linked | Built |
| R5 | Progress and stepper derived from real records, not typed by hand | Built |
| R6 | Meetings and requests feed the same record | Built |
| R7 | Generate PRD: a form with one field per section, filled from the current PRD or the interview; Enhance improves a section (a model when set up, rules otherwise); saving writes a new version that is approved again | Built |
| R8 | After the interview a model refines the PRD and plan document following the Superpowers `brainstorming` and `writing-plans` skills; the result is a proposal from the planner agent ([ADR 0010](adr/0010-ai-refinement-arrives-as-proposals.md)) | Built |

### 5.3 Documents and agreements

| # | Requirement | Status |
|---|---|---|
| D1 | Markdown documents, versioned, editable, Mermaid diagrams rendered | Built |
| D2 | Proposal, agreement, handover and maintenance agreement drafted from project data | Built |
| D3 | Drafts are editable and approved before signing; editing or regenerating clears signatures | Built |
| D4 | Signed by both the team and the client; signatures bind to one version by SHA-256; only then issued with a reference number (`PRP`, `AGR`, `HND`, `MNT` + year + sequence) ([ADR 0006](adr/0006-two-party-document-signing.md)) | Built |
| D5 | Every document carries the default Saqina logo as letterhead, the issuer name and the reference | Built |
| D6 | Dates are written in full ("27 Februari 2027") in every document and screen | Built |
| D7 | Documents the team shares appear in the client portal | Built |

### 5.4 Money

| # | Requirement | Status |
|---|---|---|
| M1 | Payment terms, invoices, payments and balances per project | Built |
| M2 | Maintenance plans with cycle, fee, response time, scope and exclusions | Built |
| M3 | Reminders for due items | Built |
| M4 | Billing and finance views in the team area and the portal, with clear action labels | Built |

### 5.5 Client portal

| # | Requirement | Status |
|---|---|---|
| C1 | Clients are invited, sign in separately from the team and see only their projects | Built |
| C2 | Client sees progress, shared documents, messages, invoices; can approve and sign | Built |
| C3 | A stranger asking for another project's data gets NOT_FOUND, never "forbidden" | Built |
| C4 | Client guide in the portal, signed-in only | Built |

### 5.6 AI assistant, memory and agents

| # | Requirement | Status |
|---|---|---|
| A1 | Assistant answers from the project record; read-only answers and intent detection use Claude | Built |
| A2 | Without `ANTHROPIC_API_KEY` Saqina answers from deterministic rules and sends nothing out; customer documents go to a model only with recorded consent | Built |
| A3 | Actions that change data are rule-validated and need approval; a model never writes, merges or deploys alone | Built |
| A4 | Project brain: every change goes to an outbox and is distilled into memory and PRD findings ([ADR 0003](adr/0003-project-brain.md)) | Built |
| A5 | Governed project memory: owner, visibility, lifecycle, versions, citations; chat suggestions wait for review; access is checked before search ([ADR 0004](adr/0004-project-memory.md)) | Built |
| A6 | Retrieval is full-text plus exact match, with a budget; the UI states that semantic search is off | Built |
| A7 | MCP tools for agents (`search_memory`, `read_memory`, `write_memory`); agent writes are candidates, never straight into memory; every call audited | Built |
| A8 | Semantic (vector) search, wiki, skills and code-graph assets | Partial: platform skills (A14) are built; semantic search is planned |
| A9 | Every chat message shows its time in the reader's timezone, can be copied, and shows who has read it: Saqina, and any connected agent that read up to it | Built |
| A10 | Pin a message as a named chapter; a chapter list jumps to it, loading older pages when needed | Built |
| A11 | Fork from a message: a copy of the thread up to it, in a new thread; proposals and agent runs are not copied and the original is not touched | Built |
| A12 | Rewind to a message: later messages are hidden and the project changes the assistant made after it (tasks, requirements, the PRD and other documents) are put back. All or nothing: it refuses when a later change cannot be reversed or a record was edited since ([ADR 0007](adr/0007-chat-rewind-is-all-or-nothing.md)) | Built |
| A13 | Chat threads stay private; the owner can open one to connected agents (MCP `list_conversations`, `read_conversation`), and every read is recorded and shown as "read by" | Built |
| A14 | Platform skills: the platform owner installs SKILL.md skills (pasted or from GitHub) for every project, chooses where each is used, and can switch them off; Superpowers ships built in. Skill text is never executed ([ADR 0009](adr/0009-platform-skills-and-connectors.md)) | Built |
| A15 | Platform connectors: the owner connects MCP servers once (Firecrawl, Exa, Context7 presets, or a custom server over streamable HTTP) with encrypted keys; their tools reach every project under the same policy, audit and approval; agents read through enabled low-risk tools | Built |
| A16 | Agent settings pick the model from the models already set up, or Automatic (the project and platform defaults); a pin for Saqina's agents is what their runs use, within the platform policy | Built |
| A17 | Own AI gateway in the Studio chat: a person adds their own OpenAI, Anthropic or Gemini API key (or an OpenAI-compatible endpoint) and picks, per chat, the platform default or one of their own models. It belongs to that person only, the key is encrypted and never shown, it follows the owner's external-providers switch, and if their model cannot answer nothing goes to another provider ([ADR 0017](adr/0017-own-ai-gateway.md)). Subscription logins (ChatGPT, Claude) are not offered | Built (API key); ChatGPT sign-in open |

### 5.7 White label

| # | Requirement | Status |
|---|---|---|
| W1 | White label is **locked by default**; it opens only with a paid plan that includes it or a written agreement signed by both parties, recorded with a reference | Built |
| W2 | Only the platform owner grants or revokes; every change is an audit event; one open grant per organization | Built |
| W3 | It locks again on revoke or the day after the end date; nothing is deleted | Built |
| W4 | The organization sees the status, the reason and the policy under Settings > White label ([standard](standards/white-label.md)) | Built |
| W5 | Brand settings themselves (name, logo, colour, domain, sender) behind that gate | Planned |
| W6 | What is never hidden: sign-in and security, privacy and terms links, the AI marker, the abuse contact, the team area | Built (policy and gate); brand settings use it when built |

### 5.8 Platform and operations

| # | Requirement | Status |
|---|---|---|
| O1 | English and Indonesian for every screen, error and email | Built |
| O2 | Signed-in user guides, split into owner and client, with real screenshots | Built |
| O3 | Every failure shows a reference code (`REQ-XXXX`) that is also in the log | Built |
| O4 | Audit log for sensitive changes; no secrets or personal data in logs | Built |
| O5 | Health endpoint, cron jobs (reminders, maintenance, doc sync), post-deploy smoke test | Built |
| O6 | End-to-end journey test at 320, 768 and 1280 px | Planned (needs Playwright and a CI job) |
| O7 | API documentation for the outside routes (`docs/api/openapi.yaml`) | Planned |

### 5.9 Studio

| # | Requirement | Status |
|---|---|---|
| S1 | "Start building" on an approved PRD or plan, or on a document both parties signed, opens the Studio | Built |
| S2 | Studio: the chat beside a work area. A reply that makes a plan or starts agents turns the work area to the Plan or Agents tab; a change-making request the assistant is unsure about is confirmed in the chat first | Built |
| S3 | Build in Saqina: Start building hands each open task to the team agent whose role fits it; each result is a proposal a person approves. A project built elsewhere only opens the Studio | Built |
| S8 | Attach files in the chat: text (into the prompt), images and PDF (to a model that can read them); stored in a private S3 bucket, served only after an access check; 5 MB and 5 files per message ([ADR 0011](adr/0011-chat-attachments-and-tools.md)) | Built |
| S9 | Add context in the chat: pick switched-on skills (always in the prompt) and connectors; a picked or named connector's tool runs from the chat through the same policy (high risk waits for approval) and its result is shown; owners and project admins reach "Manage connectors" from the menu | Built |
| G1 | Repository events: Saqina installs the webhook itself (a token without admin rights falls back to a manual URL and secret) and records push, pull request, check suite, workflow run and deployment status | Built |
| G2 | A branch, pull request or commit that carries a task reference (`T-xxxxxxxx`) is linked to the task. An opened pull request puts the task in review; a merged one completes it (the merge is the person's decision) ([ADR 0012](adr/0012-git-ci-and-deploys-flow-back.md)) | Built |
| G3 | CI results and deployments are shown, and the delivery page suggests build, review and deploy answers from them; a person confirms each one | Built |
| G4 | A push to the default branch refreshes the head and queues a code reindex | Built |
| L1 | Local IDE over MCP: read tasks, claim a task, report review or blocked (never done), read skills, use the project's connector tools under the same policy, read AGENTS.md and context files as resources ([ADR 0014](adr/0014-local-ide-sync-over-mcp.md)) | Built |
| L2 | A project AGENTS.md (workflow, branch naming, reporting, skills and connectors) from live data, by MCP and as a download | Built |
| L3 | Setup snippets for Claude Code, Cursor, Codex and Kiro, and every token scope selectable | Built |
| S4 | Code: read-only view of the connected repository (folders and files, secrets masked) in the work area | Built |
| S5 | Preview: the published project in a sandboxed frame, with a picker for earlier deployments (a build sandbox for unpublished code is not part of this version); for an app with a database or sign-in the preview waits for S10 | Built |
| S6 | Git: branches, pull requests and CI checks linked to tasks, and the switch that turns repository events on; Saqina never merges | Built |
| S7 | Publish to `<project>.saqina.dev` on Saqina's Vercel team by default, or to the client's own Vercel account (own token, optional custom domain); a person presses Publish ([ADR 0013](adr/0013-publishing-to-vercel.md)) | Built (needs `VERCEL_TOKEN` and the wildcard domain, see the runbook) |
| S10 | Databases and sign-in for the app (Neon, Supabase, Clerk, Postgres or a custom service), always on the user's own accounts: keys are kept encrypted per project, each with a separate Live and Preview value, and sent to the Vercel deployment. An app that uses one is published and previewed only when the preview has its own database (not the live one; test keys for Clerk); until then Publish and Preview explain what is missing ([ADR 0015](adr/0015-databases-and-auth-for-the-app.md)) | Built (needs the encryption key) |
| S11 | The same env in Saqina and in a local IDE: each service variable has Live, Preview and an optional Local value (falls back to Preview, never live); Saqina sends them to Vercel (production, preview, development), offers `.env.example` (names) and `.env.local` (Local values, admins only, audited) for download, and warns when the repository's `.env.example` names a variable Saqina does not have ([ADR 0018](adr/0018-env-in-saqina-and-local-ide.md)) | Built |

## 6. Non-functional requirements

| Area | Requirement |
|---|---|
| Security | Authorization on the server for every id; input validated with zod; user text never rendered as HTML; secrets encrypted ([security](standards/security.md)) |
| Privacy | Retention and AI disclosure follow [compliance](standards/compliance.md) |
| Accessibility | WCAG 2.1 AA, keyboard and screen-reader usable, 44 px touch targets |
| Responsive | No horizontal scroll at 320, 768, 1280 px |
| States | Loading, empty and error state for every async screen, in both languages |
| Performance | No query inside a loop; new queries are indexed ([performance](standards/performance.md)) |
| Delivery | `pnpm lint`, `typecheck`, `test`, `build` pass before merge; migrations are expand-only and reversible by redeploy ([delivery](standards/delivery.md)) |

## 7. Success measures

- A client can find the current state of a project and its open invoices without asking the team.
- Every issued document has two signatures and a reference number; none issued by one click.
- No cross-project or cross-client data in any response (covered by the security tests).
- Zero unreferenced errors: each failure a user reports can be found in the log by its reference code.

## 8. Open questions

- Which plans include white label, and at what price (needed before W5).
- Whether clients pay inside the portal or only see invoices (today: they see and track).
- When semantic search becomes worth the pgvector and embedding cost (A8).

## 9. Where this is built

Standards: [docs/standards](standards/README.md). Decisions: [docs/adr](adr/). Operations:
[runbook](runbook.md). Guides for people: `src/content/docs/`. Code map: `src/lib/<area>` holds the rules,
`src/app` the pages and actions, `src/lib/db/schema` the tables.
