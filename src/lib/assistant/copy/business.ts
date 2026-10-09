import type { ScopeCategory } from "@/lib/domain/business";

/** Conversation strings for scope and project billing answers. */
export interface BusinessCopy {
  locale: "en" | "id";
  billing: {
    title: string;
    forbidden: string;
    empty: string;
    summary: string;
    value: (amount: string) => string;
    invoiced: (amount: string) => string;
    paid: (amount: string) => string;
    outstanding: (amount: string) => string;
    overdue: (amount: string) => string;
    uninvoiced: (amount: string) => string;
    invoiceLine: (p: {
      number: string;
      title: string;
      status: string;
      balance: string;
      due: string;
    }) => string;
    termLine: (label: string, amount: string, invoiced: boolean) => string;
    statusNames: Record<string, string>;
    paymentHint: string;
  };
  setup: {
    needsValue: string;
    needsTerms: string;
    termOptions: string[];
    title: (value: string) => string;
    describe: string;
    dp: string;
    installment: (n: number) => string;
    final: string;
    locked: string;
  };
  invoice: {
    noTerms: string;
    allInvoiced: string;
    whichTerm: string;
    title: (label: string, amount: string) => string;
    describe: string;
  };
  scope: {
    title: string;
    empty: string;
    categories: Record<ScopeCategory, string>;
    line: (category: string, title: string) => string;
    verdict: Record<ScopeCategory, (item: string) => string>;
    unknown: (feature: string) => string;
    conflict: (feature: string, item: string, category: string) => string;
    needsItem: string;
    addTitle: (title: string, category: string) => string;
    describeAdd: string;
  };
  change: {
    title: (feature: string) => string;
    describe: string;
    outOfScope: (feature: string, item: string, category: string) => string;
    needsFeature: string;
  };
  document: {
    names: Record<"proposal" | "agreement" | "handover" | "maintenance_agreement", string>;
    title: (name: string) => string;
    describe: string;
    needsKind: string;
    options: string[];
  };
  maintenance: {
    title: string;
    none: string;
    warranty: (until: string, days: number) => string;
    warrantyEnded: (until: string) => string;
    noWarranty: string;
    plan: (p: { name: string; start: string; end: string; fee: string; days: number }) => string;
    ended: (name: string, end: string) => string;
    upcoming: (p: { name: string; start: string; end: string; fee: string }) => string;
  };
  remind: {
    title: (label: string) => string;
    describe: (recipients: number) => string;
    nothingOpen: string;
    noPortal: string;
    invoice: (number: string, amount: string) => string;
    approval: (title: string) => string;
    changeRequest: (number: string, title: string) => string;
  };
}

export const businessEn: BusinessCopy = {
  locale: "en",
  billing: {
    title: "Project billing",
    forbidden: "Billing is visible to project owners and admins only.",
    empty: "No project value, payment schedule or invoices are recorded yet.",
    summary: "From the project's billing records:",
    value: (a) => `Project value: ${a}`,
    invoiced: (a) => `Invoiced so far: ${a}`,
    paid: (a) => `Paid (confirmed payments): ${a}`,
    outstanding: (a) => `Outstanding on issued invoices: ${a}`,
    overdue: (a) => `Overdue: ${a}`,
    uninvoiced: (a) => `Not invoiced yet: ${a}`,
    invoiceLine: (p) =>
      `${p.number} ${p.title}: ${p.status}, balance ${p.balance}${p.due ? `, due ${p.due}` : ""}`,
    termLine: (l, a, i) => `Schedule: ${l} ${a}${i ? " (invoiced)" : ""}`,
    statusNames: {
      draft: "draft",
      issued: "issued",
      sent: "sent",
      partially_paid: "partially paid",
      paid: "paid",
      overdue: "overdue",
      cancelled: "cancelled",
    },
    paymentHint:
      "Payments are recorded from the Billing page with the amount and reference from your records.",
  },
  setup: {
    needsValue: "What is the project value? For example: 25 juta or Rp25.000.000.",
    needsTerms: "How should the client pay?",
    termOptions: ["DP 50%, final 50%", "DP 40%, then two installments", "Full payment"],
    title: (v) => `Payment schedule for ${v}`,
    describe: "Sets the project value and the payment terms. No invoice is created or sent.",
    dp: "Down payment",
    installment: (n) => `Installment ${n}`,
    final: "Final payment",
    locked:
      "Some payment terms are already invoiced. Adjust the remaining terms on the Billing page so the invoiced amounts stay intact.",
  },
  invoice: {
    noTerms:
      'There is no payment schedule yet. Set one first, for example: "value 25 juta, DP 40%, the rest in two installments".',
    allInvoiced: "Every payment term already has an invoice.",
    whichTerm: "Which payment term should the invoice be for?",
    title: (l, a) => `Draft invoice: ${l} (${a})`,
    describe:
      "Creates a draft invoice from the payment schedule. It is not issued or sent to the client.",
  },
  scope: {
    title: "Project scope",
    empty: "No scope is recorded yet. Add included and excluded features on the Features page.",
    categories: {
      included: "Included",
      excluded: "Excluded",
      optional: "Optional",
      future: "Future",
    },
    line: (c, t) => `${c}: ${t}`,
    verdict: {
      included: (i) => `Yes. "${i}" is in the agreed scope (Included).`,
      excluded: (i) => `No. "${i}" is listed as Excluded, so it is outside the current scope.`,
      optional: (i) =>
        `"${i}" is listed as Optional: it needs a separate agreement before work starts.`,
      future: (i) => `"${i}" is planned for a future phase, not the current scope.`,
    },
    unknown: (f) =>
      `"${f}" is not mentioned in the recorded scope, so I cannot say it is included.`,
    conflict: (f, i, c) =>
      `"${f}" appears to be outside the current scope (${c}: "${i}"). I did not add it. Change requests arrive in a later update; for now you can move the item on the Features page or ask me to add it to Included.`,
    needsItem: "Which feature should I add to the scope?",
    addTitle: (t, c) => `Add "${t}" to ${c}`,
    describeAdd: "Changes the recorded scope. Clients see it if the item is visible to them.",
  },
  change: {
    title: (f) => `Change request: ${f}`,
    describe:
      "Creates a draft change request. Add the cost and extra time before sending it to the client; nothing is charged or scheduled until the client approves.",
    outOfScope: (f, i, c) =>
      `"${f}" appears to be outside the current scope (${c}: "${i}"). I did not add it to the project. Approve this to open a draft change request instead.`,
    needsFeature: "What should the change request be about?",
  },
  document: {
    names: {
      proposal: "Proposal",
      agreement: "Agreement draft",
      handover: "Handover document",
      maintenance_agreement: "Maintenance agreement draft",
    },
    title: (n) => `Generate ${n}`,
    describe:
      "Builds the document from the project's scope, schedule and milestones as a draft. Missing details stay as [PLACEHOLDERS]. It is not legal advice and nothing is sent.",
    needsKind: "Which document should I prepare?",
    options: ["Proposal", "Agreement", "Handover", "Maintenance agreement"],
  },
  maintenance: {
    title: "Maintenance and warranty",
    none: "No maintenance plan or warranty date is recorded for this project.",
    warranty: (u, d) => `Warranty runs until ${u} (${d} days left).`,
    warrantyEnded: (u) => `Warranty ended on ${u}.`,
    noWarranty: "No warranty date is recorded.",
    plan: (p) => `${p.name}: ${p.start} to ${p.end}, ${p.fee}. ${p.days} days left.`,
    ended: (n, e) => `${n} ended on ${e}.`,
    upcoming: (p) => `${p.name}: starts on ${p.start}, runs until ${p.end}, ${p.fee}.`,
  },
  remind: {
    title: (l) => `Remind the client: ${l}`,
    describe: (n) =>
      `Sends an in-app reminder (and an email when email is configured) to ${n} client portal user(s). At most once per day per item.`,
    nothingOpen: "There is nothing open to remind the client about.",
    noPortal: "The client has no portal access on this project, so a reminder cannot reach them.",
    invoice: (n, a) => `invoice ${n}, ${a} outstanding`,
    approval: (t) => `approval of "${t}"`,
    changeRequest: (n, t) => `${n} ${t}`,
  },
};

export const businessId: BusinessCopy = {
  locale: "id",
  billing: {
    title: "Billing project",
    forbidden: "Billing hanya terlihat oleh owner dan admin project.",
    empty: "Belum ada nilai project, jadwal pembayaran, atau invoice yang tercatat.",
    summary: "Dari catatan billing project:",
    value: (a) => `Nilai project: ${a}`,
    invoiced: (a) => `Sudah ditagihkan: ${a}`,
    paid: (a) => `Sudah dibayar (pembayaran terkonfirmasi): ${a}`,
    outstanding: (a) => `Belum dibayar dari invoice terbit: ${a}`,
    overdue: (a) => `Lewat jatuh tempo: ${a}`,
    uninvoiced: (a) => `Belum ditagihkan: ${a}`,
    invoiceLine: (p) =>
      `${p.number} ${p.title}: ${p.status}, sisa ${p.balance}${p.due ? `, jatuh tempo ${p.due}` : ""}`,
    termLine: (l, a, i) => `Jadwal: ${l} ${a}${i ? " (sudah diinvoice)" : ""}`,
    statusNames: {
      draft: "draft",
      issued: "terbit",
      sent: "terkirim",
      partially_paid: "dibayar sebagian",
      paid: "lunas",
      overdue: "lewat jatuh tempo",
      cancelled: "dibatalkan",
    },
    paymentHint:
      "Pembayaran dicatat dari halaman Billing dengan nominal dan referensi dari catatan Anda.",
  },
  setup: {
    needsValue: "Berapa nilai project-nya? Contoh: 25 juta atau Rp25.000.000.",
    needsTerms: "Client membayar dengan skema apa?",
    termOptions: ["DP 50%, pelunasan 50%", "DP 40%, sisanya dua termin", "Bayar penuh"],
    title: (v) => `Jadwal pembayaran untuk ${v}`,
    describe:
      "Mengatur nilai project dan termin pembayaran. Tidak ada invoice yang dibuat atau dikirim.",
    dp: "DP",
    installment: (n) => `Termin ${n}`,
    final: "Pelunasan",
    locked:
      "Sebagian termin sudah diinvoice. Ubah sisa termin di halaman Billing agar nominal yang sudah ditagih tetap utuh.",
  },
  invoice: {
    noTerms:
      'Belum ada jadwal pembayaran. Atur dulu, misalnya: "nilai 25 juta, DP 40%, sisanya dua termin".',
    allInvoiced: "Semua termin sudah punya invoice.",
    whichTerm: "Invoice untuk termin yang mana?",
    title: (l, a) => `Draft invoice: ${l} (${a})`,
    describe:
      "Membuat draft invoice dari jadwal pembayaran. Belum diterbitkan atau dikirim ke client.",
  },
  scope: {
    title: "Scope project",
    empty:
      "Belum ada scope yang tercatat. Tambahkan fitur yang termasuk dan tidak termasuk di halaman Fitur.",
    categories: {
      included: "Termasuk",
      excluded: "Tidak termasuk",
      optional: "Opsional",
      future: "Nanti",
    },
    line: (c, t) => `${c}: ${t}`,
    verdict: {
      included: (i) => `Ya. "${i}" termasuk scope yang disepakati.`,
      excluded: (i) =>
        `Tidak. "${i}" tercatat sebagai Tidak termasuk, jadi di luar scope saat ini.`,
      optional: (i) =>
        `"${i}" tercatat sebagai Opsional: perlu kesepakatan terpisah sebelum dikerjakan.`,
      future: (i) => `"${i}" direncanakan untuk fase berikutnya, bukan scope saat ini.`,
    },
    unknown: (f) =>
      `"${f}" tidak disebut di scope yang tercatat, jadi saya tidak bisa bilang itu termasuk.`,
    conflict: (f, i, c) =>
      `"${f}" sepertinya di luar scope saat ini (${c}: "${i}"). Saya tidak menambahkannya. Change request hadir di pembaruan berikutnya; untuk sekarang Anda bisa memindahkan item di halaman Fitur atau minta saya menambahkannya ke Termasuk.`,
    needsItem: "Fitur apa yang perlu ditambahkan ke scope?",
    addTitle: (t, c) => `Tambahkan "${t}" ke ${c}`,
    describeAdd:
      "Mengubah scope yang tercatat. Client melihatnya jika item ditampilkan untuk client.",
  },
  change: {
    title: (f) => `Change request: ${f}`,
    describe:
      "Membuat draft change request. Isi biaya dan waktu tambahan sebelum dikirim ke client; tidak ada yang ditagih atau dijadwalkan sebelum client menyetujui.",
    outOfScope: (f, i, c) =>
      `"${f}" sepertinya di luar scope saat ini (${c}: "${i}"). Saya tidak menambahkannya ke project. Setujui ini untuk membuat draft change request.`,
    needsFeature: "Change request untuk apa?",
  },
  document: {
    names: {
      proposal: "Proposal",
      agreement: "Draft perjanjian",
      handover: "Dokumen serah terima",
      maintenance_agreement: "Draft perjanjian maintenance",
    },
    title: (n) => `Buat ${n}`,
    describe:
      "Menyusun dokumen dari scope, jadwal pembayaran, dan milestone project sebagai draft. Data yang belum ada tetap sebagai [PLACEHOLDER]. Ini bukan nasihat hukum dan tidak ada yang dikirim.",
    needsKind: "Dokumen apa yang perlu saya siapkan?",
    options: ["Proposal", "Perjanjian", "Dokumen serah terima", "Perjanjian maintenance"],
  },
  maintenance: {
    title: "Maintenance dan garansi",
    none: "Belum ada maintenance plan atau tanggal garansi yang tercatat untuk project ini.",
    warranty: (u, d) => `Garansi berlaku sampai ${u} (sisa ${d} hari).`,
    warrantyEnded: (u) => `Garansi berakhir pada ${u}.`,
    noWarranty: "Tanggal garansi belum tercatat.",
    plan: (p) => `${p.name}: ${p.start} sampai ${p.end}, ${p.fee}. Sisa ${p.days} hari.`,
    ended: (n, e) => `${n} berakhir pada ${e}.`,
    upcoming: (p) => `${p.name}: mulai ${p.start}, berlaku sampai ${p.end}, ${p.fee}.`,
  },
  remind: {
    title: (l) => `Ingatkan client: ${l}`,
    describe: (n) =>
      `Mengirim pengingat di aplikasi (dan email bila email dikonfigurasi) ke ${n} user portal client. Maksimal sekali sehari per item.`,
    nothingOpen: "Tidak ada yang perlu diingatkan ke client saat ini.",
    noPortal: "Client belum punya akses portal di project ini, jadi pengingat tidak bisa sampai.",
    invoice: (n, a) => `invoice ${n}, sisa ${a}`,
    approval: (t) => `persetujuan "${t}"`,
    changeRequest: (n, t) => `${n} ${t}`,
  },
};
