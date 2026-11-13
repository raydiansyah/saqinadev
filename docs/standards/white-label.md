# White label

This is an engineering standard, not legal advice. The company's lawyer approves any published terms.

White label means an agency or studio that uses Saqina presents the **client portal** under its own
name, logo and colours. It never changes who is responsible for the data, and it never hides what a
client needs to trust the portal. Status: **Built** for the brand name, logo, accent colour, email sender
and issuer details ([ADR 0031](../adr/0031-brand-in-the-database-and-the-letterhead.md)); a custom domain
and the abuse contact are **Planned**. The rules below bind every change to portal-facing screens.

## The lock

White label is **locked by default** (Enforced: `src/lib/white-label`, table `white_label_grants`). It opens
for an organization only with (1) a **paid plan** whose terms include it, or (2) a **written agreement
signed by both parties**; the record names the plan or the agreement's reference number. Only the platform
owner writes it, every change is an audit event, and `assertWhiteLabelUnlocked(orgId)` is the one gate every
brand setting must pass. It locks again when the plan or agreement ends or is breached, when it is revoked, or
the day after its end date. Locking deletes nothing: the portal shows the default Saqina brand.

The organization sees the state and its reason under Settings > White label; the same rules are in the
in-app owner guide ("White label policy"). While it is locked, every document carries the Saqina mark as its
letterhead. While it is open, the agency leads the letterhead and a small "powered by Saqina Dev" line stays.

Basis in common practice (search summaries, not legal advice): a narrow, revocable trademark licence given
by agreement or plan, "powered by" only by mutual agreement, provider marks removed on termination
([WriteSea](https://writesea.com/reseller-agreement/),
[Aber Law Firm](https://www.aberlawfirm.com/saas-reseller-agreement-and-saas-oem-agreement-models/),
[ActiveCampaign](https://www.activecampaign.com/legal/reseller-partner-agreement),
[Solv Legal](https://solvlegal.com/blogs/white-label-saas-agreement-explained-2026/),
[LicenseSaaS](https://licensesaas.com/resources/white-label-saas-things-to-check-before-buying)).

## What may be branded

| Surface | May use the agency's brand | Rule |
|---|---|---|
| Portal name, logo, accent colour | Yes | Set per organization by an owner or admin, never by a client |
| Portal domain | Planned: a custom domain the organization proves it owns | Verified by DNS before it serves anything; no wildcard or shared cookies across domains |
| Emails sent to the client (invoices, receipts, reminders, signatures) | Brand name, accent colour, sender display name, reply-to | Sent from the platform's verified sender address; the logo is not placed in mail because it is not a public file |
| Invoices, receipts, contracts and their PDF files | Letterhead, logo, legal name, tax number and address of the **agency** | The agency is the issuer; Saqina is never named as the seller, and a small "powered by Saqina Dev" line stays |
| Staff area (dashboard, project workspace) | No | Always Saqina: this is the tool, not the client's view |

## What is never hidden or changed

- **The sign-in and security screens keep working the same way.** Branding changes colours and a logo,
  never the form, the captcha, the password rules or the wording of an error.
- **The privacy and terms links stay.** The portal names the agency as the controller and Saqina as
  the processor, with the processors listed in [compliance.md](compliance.md).
- **No misleading identity.** An organization cannot present itself as another company, and the
  display name is checked against the legal name on the organization.
- **AI disclosure stays.** Text produced by an AI, if the product ever shows any, remains marked as such.
- **Reporting a problem stays reachable**: an abuse and security contact is always visible (Planned; the
  portal footer shows the privacy and terms links today).

## Isolation

- Branding is data of one organization. A portal reads only its own organization's brand; a request for
  another organization's brand or assets is NOT_FOUND, with a test that a stranger gets nothing.
- Uploaded logos are validated on the server: the type is read from the bytes and only PNG and JPEG pass
  (an SVG can carry script, so it is refused), at most 200 KB and 32 to 1600 px. The logo is served by an
  authenticated route to the organization's people and its clients only, with `nosniff` and a sandbox CSP.
- Colours are validated and contrast-checked (WCAG 2.1 AA) before they are saved, so a brand cannot
  make the portal unreadable. See [ui-ux.md](ui-ux.md).
- Custom domains (Planned) will be listed in one place and removed with the organization; a freed domain
  stops serving at once.

## Who decides

- Only an organization owner or admin may change branding or a domain; every change is an audit event
  without secrets ([security.md](security.md)).
- Turning branding on is a **Red lane** change ([governance.md](governance.md)): it touches identity,
  domains and email, so it needs a human reviewer.
- The platform owner can disable a brand that breaks these rules; the portal then falls back to the
  default Saqina look. Nothing is deleted.

## Checklist for a change that touches the portal

- [ ] The staff area is unchanged by brand settings.
- [ ] A stranger and a client of another organization cannot read this organization's brand or assets.
- [ ] Contrast checked for the brand colours; works at 320, 768 and 1280 px.
- [ ] Privacy, terms, abuse contact and the AI marker are still shown.
- [ ] Emails, invoices, receipts and contracts name the agency as the issuer.
- [ ] Logo and domain inputs are validated on the server; the change is audited.
