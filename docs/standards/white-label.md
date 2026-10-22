# White label

This is an engineering standard, not legal advice. The company's lawyer approves any published terms.

White label means an agency or studio that uses Saqina presents the **client portal** under its own
name, logo and colours. It never changes who is responsible for the data, and it never hides what a
client needs to trust the portal. Status: **Planned** (no brand settings exist yet; the rules below
bind the work that adds them and every change to portal-facing screens).

## What may be branded

| Surface | May use the agency's brand | Rule |
|---|---|---|
| Portal name, logo, accent colour | Yes | Set per organization by an owner or admin, never by a client |
| Portal domain | Yes, a custom domain the organization proves it owns | Verified by DNS before it serves anything; no wildcard or shared cookies across domains |
| Emails sent to the client (invoices, reminders, approvals) | Sender name and logo | Sent from the platform's verified sender domain unless the organization verified its own (SPF and DKIM) |
| Invoices and documents shown to the client | Header, logo, legal name and tax number of the **agency** | The agency is the issuer; Saqina is never named as the seller |
| Staff area (dashboard, project workspace) | No | Always Saqina: this is the tool, not the client's view |

## What is never hidden or changed

- **The sign-in and security screens keep working the same way.** Branding changes colours and a logo,
  never the form, the captcha, the password rules or the wording of an error.
- **The privacy and terms links stay.** The portal names the agency as the controller and Saqina as
  the processor, with the processors listed in [compliance.md](compliance.md).
- **No misleading identity.** An organization cannot present itself as another company, and the
  display name is checked against the legal name on the organization.
- **AI disclosure stays.** Text or answers produced by an AI remain marked as such in the portal.
- **Reporting a problem stays reachable**: an abuse and security contact is always visible.

## Isolation

- Branding is data of one organization. A portal reads only its own organization's brand; a request for
  another organization's brand or assets is NOT_FOUND, with a test that a stranger gets nothing.
- Uploaded logos are validated on the server: type (PNG, JPEG, SVG sanitised or rasterised), size,
  dimensions. An SVG is never inlined as HTML; it is shown as an image.
- Colours are validated and contrast-checked (WCAG 2.1 AA) before they are saved, so a brand cannot
  make the portal unreadable. See [ui-ux.md](ui-ux.md).
- Custom domains are listed in one place and removed with the organization; a freed domain stops
  serving at once.

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
- [ ] Emails and invoices name the agency as the issuer.
- [ ] Logo and domain inputs are validated on the server; the change is audited.
