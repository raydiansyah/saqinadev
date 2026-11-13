---
title: White label policy
description: What may carry your own brand on the client portal, what is never hidden, and who decides.
order: 3
updated: 2026-11-12
kind: policy
---

White label means an agency or studio that uses Saqina shows the **client portal** under its own name, logo and colours. It does not change who is responsible for the data, and it must not hide anything a client needs to trust the portal.

**Status today.** Brand settings do not exist in the product yet: the portal still shows as Saqina Dev. This policy already applies to every change to screens that clients see, and it is the basis for the brand settings feature when it is built. The technical standard lives in the repository: `docs/standards/white-label.md`.

## The lock: when white label opens

**White label is locked by default.** It only opens for one organization on one of two bases, and each leaves a written record:

1. **A paid plan** whose terms include white label. The record names the plan code.
2. **A written agreement signed by both parties**, Saqina and your organization (a reseller or white-label agreement). The record names the agreement's reference number, for example `AGR-2027-004`.

Only the platform owner can open it, once one of those bases exists. The opening is written to the audit log, and the reference is visible to the organization under **Settings > White label**.

It **locks again** when the plan or the agreement ends or is breached, when the platform owner revokes it, or when its end date passes (the end date itself is still open; it locks the next day, for example after 27 February 2027). Locking deletes nothing: the portal shows the default Saqina brand again, and the brand settings are kept for when it opens again.

While it is locked, every document still carries the default Saqina logo as its letterhead, with Saqina as the owner of the service.

**Why this way.** In common practice white label is a narrow, revocable trademark licence, given through an agreement or a specific plan, with a "powered by" mark only when both sides agree, and every provider mark removed when the relationship ends. References (search summaries, not legal advice; example clauses and general guides):

- [WriteSea white label reseller agreement](https://writesea.com/reseller-agreement/): branding applied per order for agreed fees; a "powered by" mark only when mutually agreed.
- [Aber Law Firm, SaaS channel agreement models](https://www.aberlawfirm.com/saas-reseller-agreement-and-saas-oem-agreement-models/): keep the trademark licence narrow and revocable; mind naked licensing.
- [ActiveCampaign reseller partner agreement](https://www.activecampaign.com/legal/reseller-partner-agreement): a white label programme opened through an accepted agreement.
- [Solv Legal, white label SaaS agreement guide](https://solvlegal.com/blogs/white-label-saas-agreement-explained-2026/): branding rights, term, and removing the provider's marks on termination.
- [LicenseSaaS, things to check before buying white label](https://licensesaas.com/resources/white-label-saas-things-to-check-before-buying): full rebrand versus a partial "powered by" mark.

## What may carry your brand

You set these under Settings > White label, once white label is open. Only an owner or admin can change them, never a client.

- Portal name, logo and accent colour. The logo is a PNG or JPEG of at most 200 KB, shown on a light background. The accent colour is checked: it must stand out from the dark portal and carry readable button text.
- Email to clients (invoices, receipts, reminders, signature requests): the brand name, the accent colour, the sender's display name and a reply-to address. Mail still goes out from the platform's verified address.
- Invoices, receipts, contracts and their PDF files: your logo, legal name, tax number and address lead the letterhead. You are the issuer, and Saqina is never named as the seller. A small "powered by Saqina Dev" line stays on every branded document.
- A custom domain for the portal is not available yet.

## What is never hidden or changed

- **Sign-in and security screens** work exactly the same: the form, the captcha, the password rules and the wording of an error do not change. A brand only changes colours and a logo.
- **The privacy and terms links** stay. The portal names the agency as the data controller and Saqina as the processor.
- **No pretending.** An organization cannot present itself as another company. The display name is checked against the organization's legal name.
- **The AI marker stays.** Text or answers produced by an AI remain marked as such in the portal.
- **How to report a problem** (abuse and security contact) is always visible.
- **The team area** (dashboard and project workspace) is always Saqina. It is the tool, not the client's view.

## Isolation

- A brand is data of one organization. A portal only reads its own organization's brand; a request for another organization's brand or assets answers "not found".
- Logos are validated on the server: type, size and dimensions. An SVG is never inlined as HTML; it is shown as an image.
- Colours are contrast-checked (WCAG 2.1 AA) before they are saved, so a brand cannot make the portal unreadable.
- Custom domains are listed in one place and removed with the organization. A released domain stops serving at once.

## Who decides

- Only an organization owner or admin may change the brand or a domain. Every change is written to the audit log without secrets.
- Turning a brand on is a high-risk change (identity, domains, email) and needs a human reviewer.
- The platform owner can disable a brand that breaks these rules. The portal falls back to the Saqina look and nothing is deleted.

## Checklist for a change to the portal

- [ ] The team area is unchanged by brand settings.
- [ ] A stranger and a client of another organization cannot read this organization's brand or assets.
- [ ] Brand colours are contrast-checked, and the screen works at 320, 768 and 1280 px.
- [ ] Privacy, terms, the abuse contact and the AI marker are still shown.
- [ ] Emails and invoices name the agency as the issuer.
- [ ] Logo and domain inputs are validated on the server, and the change is audited.
