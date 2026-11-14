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
    secondaryCta: "See How It Works",
    cards: [
      { label: "Invoice", value: "INV-2026-014 · paid" },
      { label: "Receipt", value: "KWT-2026-009 · issued" },
      { label: "Contract", value: "AGR-2026-003 · signed" },
      { label: "Reminder", value: "3 days before due" },
      { label: "Brand", value: "Your agency name" },
    ],
  },
  lifecycle: {
    file: "how it works",
    title: "Seven steps, one project.",
    steps: [
      { name: "Project", point: "The client and the payment terms, from a short form." },
      { name: "Contract", point: "Draft the agreement from the project." },
      { name: "Signatures", point: "You sign, then the client signs." },
      { name: "Invoice", point: "Issued from a payment term, numbered once." },
      { name: "Payment", point: "You record it. Overpaying is refused." },
      { name: "Receipt", point: "Issued in the same step as the payment." },
      { name: "Reminders", point: "Before and after the due date, once each." },
    ],
    pause: "Pause",
    play: "Play",
  },
  pillars: {
    file: "what you get",
    title: "Three things, connected.",
    items: [
      {
        id: "project",
        name: "One project",
        points: [
          "Client, contracts and money in one place",
          "Numbers issued once, never reused",
          "Nothing left in a chat thread",
        ],
      },
      {
        id: "portal",
        name: "Client portal",
        points: [
          "Invoices, payments and receipts",
          "Agreements signed online",
          "A short list of what needs the client",
        ],
      },
      {
        id: "brand",
        name: "Your brand",
        points: [
          "Your name, logo and colour on every page and email",
          "A small Saqina credit stays in the footer",
          "Open on a paid plan or a signed agreement",
        ],
      },
    ],
    orbit: ["Client", "Contract", "Invoice", "Payment", "Receipt", "Reminder"],
    portal: { label: "Paid so far", value: "Rp 8.250.000", due: "Due 30 Nov" },
    brand: { name: "Your agency name", credit: "Powered by Saqina" },
  },
  demo: {
    file: "try it",
    title: "Type an amount, get the receipt.",
    body: "This runs in your browser. Nothing is sent or saved.",
    clientLabel: "Client name",
    clientPlaceholder: "Client name",
    amountLabel: "Amount in rupiah",
    amountError: "Enter an amount above zero.",
    invoice: "Invoice",
    receipt: "Receipt",
    sent: "Sent",
    paid: "Paid",
    record: "Record payment",
    reset: "Start over",
    words: "Amount in words",
    waiting: "The receipt appears when you record the payment.",
    note: "Sample numbers. Yours follow your own counter.",
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
    secondary: "Try the receipt",
  },
  footer: { tagline: ["Invoices.", "Receipts.", "Contracts.", "Reminders."] },
};
