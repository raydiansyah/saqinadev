import type { AssistantCopy } from "./types";

export const id: AssistantCopy = {
  help: [
    "Saya bekerja di workspace proyek ini. Anda bisa meminta saya untuk:",
    "- menjawab pertanyaan tentang proyek, PRD, task, requirement, dan keputusan",
    "- membuat atau mengubah task, memory, dan keputusan",
    "- menambah fitur atau role (saya usulkan dulu perubahan requirement, PRD, dan task)",
    "- menganalisa PRD, requirement, atau task yang blocked",
    "- menugaskan task ke agent",
  ].join("\n"),
  viewerForbidden:
    "Anda punya akses lihat saja di proyek ini, jadi saya bisa menjawab pertanyaan tetapi tidak bisa mengubah apa pun.",
  needsTask: "Task yang mana? Buka task-nya dulu atau tanyakan dari task tersebut.",
  needsTitle: "Task ini mau diberi judul apa?",
  needsPriority: "Prioritasnya mau apa?",
  pendingApprovals: (n) =>
    n === 0
      ? "Tidak ada yang menunggu persetujuan Anda."
      : `${n} usulan menunggu persetujuan Anda.`,
  needsFeature: "Fitur apa yang ingin ditambahkan?",
  noAgent: "Tidak ada agent di proyek ini yang punya kemampuan untuk task tersebut.",
  executed: (n) =>
    n === 1 ? "Selesai. 1 perubahan diterapkan." : `Selesai. ${n} perubahan diterapkan.`,
  proposalIntro:
    "Ini mengubah isi proyek, jadi menunggu persetujuan Anda. Belum ada yang diterapkan.",
  proposalDestructive:
    "Ini menghapus data, jadi perlu persetujuan Anda. Periksa setiap item sebelum menyetujui.",
  revisionAsk: (title, note) =>
    `Dicatat. Apa yang perlu diubah pada "${title}"?${note ? ` Catatan Anda: ${note}` : ""} Sampaikan dan saya siapkan usulan baru.`,
  modelFallback: "Model bahasa sedang tidak tersedia, jadi jawaban ini hanya dari data proyek.",

  project: (p) =>
    [
      `${p.name} sedang di tahap ${p.status}.`,
      `${p.requirements} requirement (${p.open} masih terbuka), ${p.tasks} task (${p.done} selesai, ${p.blocked} blocked).`,
      p.pending ? `${p.pending} usulan menunggu review Anda.` : "",
      `Langkah berikutnya: ${p.next}.`,
    ]
      .filter(Boolean)
      .join(" "),

  decision: {
    found: (n, q, s, r) =>
      `Keputusan #${String(n).padStart(3, "0")}: "${q}" Dipilih: ${s}. Alasan yang tercatat: ${r}`,
    recommendation: (k, v, r) => `Rekomendasi ${k} adalah ${v}. ${r}`,
    memory: (t, c) => `Memory proyek "${t}": ${c}`,
    unknown: (topic) =>
      `Saya tidak menemukan keputusan atau rekomendasi tercatat tentang ${topic}. Saya tidak akan menebak alasannya; Anda bisa mencatatnya sebagai keputusan.`,
    list: (n) => `Proyek ini punya ${n} keputusan tercatat.`,
  },

  analysis: {
    prdTitle: "Review PRD",
    requirementsTitle: "Review requirement",
    tasksTitle: "Review task",
    projectTitle: "Review proyek",
    unknownRequirement: (t) => `"${t}" masih belum diketahui.`,
    conflictingRequirement: (t) => `"${t}" punya jawaban yang bertentangan.`,
    inferredRequirement: (t) => `"${t}" hasil kesimpulan dan belum Anda konfirmasi.`,
    prdMissing: (t) => `Requirement "${t}" belum disebut di PRD.`,
    prdPlaceholder: (h) => `Bagian PRD "${h}" masih kosong atau placeholder.`,
    prdNotApproved: "PRD belum disetujui.",
    noPrd: "Proyek ini belum punya PRD.",
    taskBlocked: (t) => `"${t}" sedang blocked.`,
    taskStale: (t, d) => `"${t}" sudah ${d} hari in progress tanpa pembaruan.`,
    taskInReview: (t) => `"${t}" menunggu review.`,
    noIssues: "Saya tidak menemukan masalah di data proyek.",
    found: (n) => `Saya menemukan ${n} hal yang perlu diperhatikan.`,
    recommendResolve: "Selesaikan requirement yang terbuka dan bertentangan sebelum dibangun.",
    recommendUnblock:
      "Buka blokir task ini dulu: pekerjaan yang blocked menahan semua yang setelahnya.",
    recommendApprovePrd:
      "Review dan setujui PRD agar rencana berdiri di atas scope yang disepakati.",
  },

  task: {
    summary: (t) =>
      `"${t.title}" ${t.status} dengan prioritas ${t.priority}.${t.description ? ` ${t.description}` : " Belum ada deskripsi."}`,
    priorityNames: { critical: "kritis", high: "tinggi", medium: "sedang", low: "rendah" },
    statusNames: {
      backlog: "ada di backlog",
      todo: "belum dimulai",
      in_progress: "sedang dikerjakan",
      review: "sedang direview",
      done: "selesai",
      blocked: "blocked",
    },
  },

  memory: {
    list: (n) => `Memory proyek berisi ${n} item. Yang terbaru:`,
    empty: "Memory proyek masih kosong.",
    titleFrom: (text) => (text.length > 60 ? `${text.slice(0, 57)}...` : text),
    category: "product",
  },

  plan: {
    featureRequirement: (f) => ({
      title: f,
      description: `Pengguna dapat menggunakan ${f}. Ditambahkan dari percakapan dengan Saqina.`,
    }),
    prdSection: (f, detail) => ({
      heading: f,
      body: `- Tambahkan ${f} ke scope produk.${detail ? `\n- ${detail}` : ""}\n- Kriteria terima: fitur berjalan dari awal sampai akhir dan tercakup test.`,
    }),
    implementationTask: (f) => ({
      title: `Implementasi ${f}`,
      description: `Bangun ${f} sesuai bagian PRD dengan nama yang sama.`,
    }),
    qaTask: (f) => ({
      title: `Uji ${f}`,
      description: `Tulis dan jalankan test untuk ${f}: alur utama, error, dan hak akses.`,
    }),
    subtasks: (t) => [`${t}: desain`, `${t}: implementasi`, `${t}: test`, `${t}: dokumentasi`],
    planTasks: (f) => [
      {
        title: `Tentukan scope ${f}`,
        description: `Sepakati apa yang harus dan tidak dilakukan ${f}.`,
      },
      { title: `Desain ${f}`, description: `Layar, data, dan state untuk ${f}.` },
      { title: `Implementasi ${f}`, description: `Bangun ${f} sesuai desain.` },
      { title: `Uji ${f}`, description: `Cakup alur utama, error, dan hak akses.` },
    ],
    roleRequirement: (r) => ({
      title: `Role: ${r}`,
      description: `Role ${r} dengan hak akses sendiri. Hak akses persisnya masih perlu dikonfirmasi.`,
    }),
    decisionReason: "Dicatat dari percakapan dengan Saqina.",
    instructions: (t) =>
      `Kerjakan "${t}" berdasarkan PRD dan requirement proyek. Usulkan perubahan; jangan terapkan langsung.`,
  },

  proposals: {
    addFeature: (f) => `Tambah ${f}`,
    addRole: (r) => `Tambah role ${r}`,
    deleteTasks: (n) => `Hapus ${n} task`,
    updateRequirement: (t) => `Ubah requirement "${t}"`,
    splitTask: (t) => `Pecah "${t}" menjadi subtask`,
    plan: (f) => `Rencana implementasi ${f}`,
    assign: (t, a) => `Tugaskan "${t}" ke ${a}`,
    describeFeature: "Menambah requirement, bagian PRD, serta task implementasi dan pengujian.",
    describeDelete: "Menghapus permanen task di bawah ini. Tidak bisa dibatalkan.",
    describeRequirement:
      "Mengubah requirement yang ada. Nilai lama ditampilkan untuk perbandingan.",
    describeAssign:
      "Menyerahkan task ke agent. Agent Saqina merencanakan dengan model yang dikonfigurasi (atau simulasi berlabel tanpa model); agent eksternal mendapat handoff untuk Anda ekspor.",
    agentResult: (a, t) => `Hasil ${a} untuk "${t}"`,
  },

  clarifications: {
    refund: {
      question: "Apakah refund perlu approval manager?",
      options: [
        "Kasir boleh refund tanpa approval",
        "Selalu perlu approval manager",
        "Tergantung nilai transaksi",
        "Belum ditentukan",
      ],
      requirementTitle: "Approval refund",
      group: "business_rules",
    },
    payment: {
      question: "Metode pembayaran apa yang harus didukung lebih dulu?",
      options: ["Transfer bank", "E-wallet dan QRIS", "Kartu kredit", "Belum ditentukan"],
      requirementTitle: "Metode pembayaran",
      group: "business_rules",
    },
    auth: {
      question: "Siapa yang boleh masuk dengan cara ini?",
      options: ["Semua pengguna", "Hanya staf", "Hanya pelanggan", "Belum ditentukan"],
      requirementTitle: "Pengguna yang boleh masuk",
      group: "authentication",
    },
    roles: {
      question: "Apakah role ini boleh mengubah data pengguna lain?",
      options: ["Ya, dalam timnya", "Hanya membaca", "Hanya data miliknya", "Belum ditentukan"],
      requirementTitle: "Hak akses role",
      group: "users_roles",
    },
  },
  requirementUpdate: {
    question: (t) => `Apa yang perlu diubah pada "${t}"?`,
    noMatch: (topic) =>
      `Saya tidak menemukan requirement tentang ${topic}. Cek halaman Requirements untuk nama persisnya.`,
  },

  repository: {
    title: "Repository",
    notConnected:
      "Belum ada repository yang terhubung ke proyek ini. Hubungkan di Settings agar saya bisa membacanya.",
    summary: (name: string, branch: string, head: string) => `${name} di ${branch}, head ${head}.`,
    readNow: "Saya baru saja membaca file manifest repository.",
    readFailed: (code: string) =>
      `Saya tidak bisa membaca repository (${code}). Jawaban ini memakai kondisi sinkron terakhir.`,
    detected: (key: string, value: string) => `${key} di repository: ${value}`,
    intended: (key: string, value: string) => `${key} di proyek: ${value}`,
    mismatch: (key: string, project: string, repo: string) =>
      `Potensi ketidakcocokan pada ${key}: proyek menyebut ${project}, repository memakai ${repo}.`,
    mismatchFound: (n: number) =>
      `Saya menemukan ${n} perbedaan antara rencana proyek dan repository.`,
    noMismatch: "Rencana proyek dan repository sejalan untuk semua hal yang disebut keduanya.",
    resolveHint:
      "Selesaikan tiap perbedaan di overview proyek: pertahankan rencana atau ikuti repository.",
  },
  handoff: {
    needsTask:
      "Task mana yang ingin diserahkan? Buka task-nya dulu atau tanyakan dari task tersebut.",
    unknownAgent: (name: string, list: string) =>
      `Tidak ada agent bernama ${name} di proyek ini. Tersedia: ${list}.`,
    title: (agent: string, task: string) => `Serahkan "${task}" ke ${agent}`,
    describe:
      "Membuat paket konteks dari kondisi proyek saat ini dan menyerahkannya ke agent. Hanya file yang tercantum yang disertakan.",
  },

  agent: {
    summary: (role, t) =>
      `${role} meninjau "${t}" terhadap PRD dan requirement, lalu menyiapkan perubahan di bawah.`,
    handoffReady: (agent) =>
      `Handoff untuk ${agent} siap. Ekspor dari halaman run, lalu tempel hasilnya kembali.`,
    handoffSent: (agent) => `Handoff terkirim ke ${agent}. Menunggu laporannya.`,
    failedSummary: "Run tidak bisa diselesaikan.",
    unavailable:
      "Lingkungan eksekusi tidak tersedia: agent ini belum terhubung ke Saqina, jadi tidak ada yang dijalankan.",
    simulated:
      "Run simulasi: Saqina menyiapkan ini dari data proyek. Tidak ada kode, repository, atau deployment yang disentuh.",
    memoryTitle: (t) => `Checklist QA: ${t}`,
    checklist: (t) =>
      [
        `- Alur utama "${t}" berjalan`,
        "- Error menampilkan pesan yang jelas",
        "- Hak akses ditegakkan",
        "- Berjalan di mobile",
      ].join("\n"),
    roleTasks: {
      planner: (t) => [`${t}: konfirmasi scope`, `${t}: pecah pekerjaan`],
      frontend: (t) => [`${t}: state UI (loading, kosong, error)`, `${t}: cek aksesibilitas`],
      backend: (t) => [`${t}: API dan validasi`, `${t}: pemeriksaan otorisasi`],
      qa: (t) => [`${t}: test regresi`],
      docs: (t) => [`${t}: dokumentasi pengguna`],
      general: (t) => [`${t}: tindak lanjut`],
    },
    issues: {
      noPrd: "Proyek belum punya PRD, jadi agent bekerja dari task saja.",
      noRequirements: "Tidak ada requirement yang cocok dengan task ini.",
    },
    recommendation: "Review perubahan yang diusulkan, lalu setujui atau minta revisi.",
  },
};
