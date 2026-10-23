# Saqina Dev: product requirements

Status of this page: written 2026-10-23 from the code, the ADRs and the standards. It is the PRD that
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
| P1 | Create a project from a brief; an interview captures objective, features, stack, delivery | Built |
| P2 | Import an existing project from GitHub; it asks how far the system is (build, review, deploy) and the answers drive the stage, progress and tasks | Built |
| P3 | Imported projects follow GitHub: documents are pulled one way, the newest edit wins, the PRD is found by name or asked for ([ADR 0005](adr/0005-imported-projects-follow-github.md)) | Built |
| P4 | Project settings: name, build strategy, repository, deployment, domain; a failed save keeps what was typed | Built |
| P5 | Archive, restore and delete a project (delete needs the typed name) | Built |

### 5.2 Requirements, plan and delivery

| # | Requirement | Status |
|---|---|---|
| R1 | Requirements with priority and status, with bulk actions | Built |
| R2 | PRD document per project, with a check that finds gaps against requirements (PRD findings) | Built |
| R3 | Plan with milestones and tasks; tasks follow the delivery stage | Built |
| R4 | Features, decisions, change requests and client approvals, each recorded and linked | Built |
| R5 | Progress and stepper derived from real records, not typed by hand | Built |
| R6 | Meetings and requests feed the same record | Built |

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
| A8 | Semantic (vector) search, wiki, skills and code-graph assets | Planned |

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
