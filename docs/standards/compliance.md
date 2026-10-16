# Privacy, retention, AI disclosure and licences

This is an engineering standard, not legal advice. The company's lawyer approves the published policy.

## Privacy policy

The policy must describe the **real** data flow, not boilerplate. It is generated from the content in
`src/content/legal/*` and must be updated in the same pull request as any change that collects new data
or adds a processor. Current processors to keep listed: Neon (database), Vercel (hosting), Resend
(email), the configured AI providers, GitHub (repositories), Cloudflare Turnstile, and Sentry once enabled.
Placeholders (`[COMPANY NAME]`, `[CONTACT EMAIL]`) must be filled before launch.

## UU PDP / GDPR capabilities

| Right or duty | What the product does |
|---|---|
| Lawful basis | Stated per purpose in the policy; consent is explicit where it is the basis (public forms, AI processing of documents) |
| Consent log | Who consented, to what, when, which version of the text (stored with the record or in an audit event) |
| Access and portability | `/api/account/export` JSON download in Settings (Enforced, audited, rate limited) |
| Erasure | Settings > Delete account (Enforced): typed email, refused while it would destroy shared projects or leave no platform owner |
| Rectification | Profile and client records are editable |
| Breach handling | Incident runbook: detect, contain, assess, notify the regulator within the legal window and affected people |

## Data retention (Enforced: `src/lib/housekeeping/retention.ts`, run daily by `/api/cron/maintenance`)

| Data | Keep | Then |
|---|---|---|
| Rate-limit rows | days | delete (already) |
| Notifications read | 90 days | delete |
| Public inquiries not converted | until `INQUIRY_RETENTION_DAYS` is set (owner decides) | delete |
| AI usage records | 13 months | delete detail |
| Webhook deliveries | 7 days | delete |
| Audit events | 24 months | delete |
| Deleted account | immediate (no grace period) | erase; audit keeps a pseudonymous subject |

The owner confirms these durations; the job reads them from one config so the policy and the code agree.

## AI disclosure (EU AI Act Art. 50 and good practice)

Output produced by a model is labelled as AI-generated wherever a person could mistake it for human
work: AI review of the interview, note analysis, requirements read by AI, summaries, chat replies,
proposals from agents. One shared component renders the label so it is consistent in both languages.
Content a person approved stays labelled in its history (`source`).

## AI usage policy

See [governance.md](governance.md): what may be generated, what may never be sent to a provider (secrets,
other clients' data), who reviews, and the consent needed before documents go to a model.

## Licences and IP

- Dependencies follow the allowlist in [delivery.md](delivery.md); the licence check runs in CI.
- Code and text written with AI assistance is recorded in the pull request attribution. The company
  owns the output; do not paste code of unknown origin or licence into the repository.
- Third-party assets (fonts, images, icons) need their licence noted next to the asset.

## SOC 2 readiness (direction)

Access logging, least privilege (owner/admin/editor/viewer, client portal), change management through
pull requests, an incident response plan in the runbook, and quarterly access reviews by the owner.
