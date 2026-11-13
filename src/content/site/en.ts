import type { SiteContent } from "./types";

export const en: SiteContent = {
  meta: {
    title: "Saqina Dev: invoices, receipts, contracts and payment reminders",
    description:
      "Send invoices, issue receipts, get contracts signed and remind clients to pay, from one place. Your clients get a portal under your own name.",
    tagline: "Invoices, receipts, contracts, reminders.",
    ogSubtitle: "Get paid on time. Keep the paperwork in one place.",
    ogFooter: "Invoices · Receipts · Contracts · Reminders",
  },
  hero: {
    title: "Bill your clients, get contracts signed and get paid on time.",
    lead: "Saqina keeps the paperwork between you and your clients in one place: invoices, receipts, signed agreements and payment reminders.",
    points: [
      "Invoices and receipts numbered by year",
      "Contracts signed by both sides",
      "Reminders before and after the due date",
    ],
    primaryCta: "Start a Project",
    secondaryCta: "See What It Does",
  },
  features: {
    file: "what it does",
    title: "Five jobs, one place.",
    intro:
      "Each client project holds its own invoices, receipts and contracts, so nothing lives in a chat thread.",
    items: [
      {
        id: "invoices",
        name: "Invoices",
        points: [
          "Bill from a payment term or write your own lines",
          "Numbers like INV-2026-001, issued once and never reused",
          "Print or save as PDF",
        ],
      },
      {
        id: "receipts",
        name: "Receipts",
        points: [
          "A receipt for every payment you record",
          "Numbers like KWT-2026-001",
          "Void a payment and its receipt is voided too",
        ],
      },
      {
        id: "contracts",
        name: "Contracts",
        points: [
          "Draft a proposal, agreement or handover from the project",
          "You sign, then the client signs",
          "Any edit clears the signatures",
        ],
      },
      {
        id: "reminders",
        name: "Payment reminders",
        points: [
          "Rules by days before or after the due date",
          "Sent to you, to the client, or both",
          "Each reminder goes out once",
        ],
      },
      {
        id: "whitelabel",
        name: "White label",
        points: [
          "Your name, logo and colour on the portal, emails and documents",
          "A small Saqina credit stays in the footer",
          "Unlocked on a paid plan or a signed agreement",
        ],
      },
    ],
  },
  finalCta: {
    title: "Start with one client.",
    body: "Create a project, send the first invoice and see what is still unpaid.",
    primary: "Start a Project",
  },
  footer: { tagline: ["Invoices.", "Receipts.", "Contracts.", "Reminders."] },
};
