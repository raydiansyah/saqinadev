import type { SiteContent } from "./types";

export const id: SiteContent = {
  meta: {
    title: "Saqina Dev: invoice, kwitansi, kontrak, dan pengingat pembayaran",
    description:
      "Kirim invoice, terbitkan kwitansi, tanda tangani kontrak, dan ingatkan klien membayar, semuanya dari satu tempat. Klien Anda masuk lewat portal atas nama Anda sendiri.",
    tagline: "Invoice, kwitansi, kontrak, pengingat.",
    ogSubtitle: "Dibayar tepat waktu. Semua berkas rapi di satu tempat.",
    ogFooter: "Invoice · Kwitansi · Kontrak · Pengingat",
  },
  hero: {
    title: "Tagih klien, tanda tangani kontrak, dan terima pembayaran tepat waktu.",
    lead: "Saqina menyimpan berkas antara Anda dan klien di satu tempat: invoice, kwitansi, perjanjian bertanda tangan, dan pengingat pembayaran.",
    points: [
      "Invoice dan kwitansi bernomor per tahun",
      "Kontrak ditandatangani kedua pihak",
      "Pengingat sebelum dan sesudah jatuh tempo",
    ],
    primaryCta: "Mulai Proyek",
    secondaryCta: "Lihat Cara Kerjanya",
    cards: [
      { label: "Invoice", value: "INV-2026-014 · lunas" },
      { label: "Kwitansi", value: "KWT-2026-009 · terbit" },
      { label: "Kontrak", value: "AGR-2026-003 · diteken" },
      { label: "Pengingat", value: "3 hari sebelum jatuh tempo" },
      { label: "Merek", value: "Nama agensi Anda" },
    ],
  },
  lifecycle: {
    file: "cara kerja",
    title: "Tujuh langkah, satu proyek.",
    steps: [
      { name: "Proyek", point: "Klien dan termin pembayaran, dari formulir singkat." },
      { name: "Kontrak", point: "Susun perjanjian dari proyek." },
      { name: "Tanda tangan", point: "Anda menandatangani dulu, lalu klien." },
      { name: "Invoice", point: "Terbit dari termin pembayaran, bernomor sekali." },
      { name: "Pembayaran", point: "Anda mencatatnya. Pembayaran berlebih ditolak." },
      { name: "Kwitansi", point: "Terbit pada langkah yang sama dengan pembayaran." },
      { name: "Pengingat", point: "Sebelum dan sesudah jatuh tempo, masing-masing sekali." },
    ],
    pause: "Jeda",
    play: "Putar",
  },
  pillars: {
    file: "yang Anda dapat",
    title: "Tiga hal yang saling terhubung.",
    items: [
      {
        id: "project",
        name: "Satu proyek",
        points: [
          "Klien, kontrak, dan uang di satu tempat",
          "Nomor terbit sekali, tidak dipakai ulang",
          "Tidak ada yang tertinggal di obrolan",
        ],
      },
      {
        id: "portal",
        name: "Portal klien",
        points: [
          "Invoice, pembayaran, dan kwitansi",
          "Perjanjian ditandatangani online",
          "Daftar singkat hal yang perlu klien kerjakan",
        ],
      },
      {
        id: "brand",
        name: "Merek Anda",
        points: [
          "Nama, logo, dan warna Anda di setiap halaman dan email",
          "Kredit kecil Saqina tetap ada di footer",
          "Terbuka di paket berbayar atau dengan perjanjian yang ditandatangani",
        ],
      },
    ],
    orbit: ["Klien", "Kontrak", "Invoice", "Bayar", "Kwitansi", "Pengingat"],
    portal: { label: "Sudah dibayar", value: "Rp 8.250.000", due: "Jatuh tempo 30 Nov" },
    brand: { name: "Nama agensi Anda", credit: "Didukung Saqina" },
  },
  demo: {
    file: "coba",
    title: "Ketik nominal, kwitansi langsung jadi.",
    body: "Ini berjalan di browser Anda. Tidak ada yang dikirim atau disimpan.",
    clientLabel: "Nama klien",
    clientPlaceholder: "Nama klien",
    amountLabel: "Nominal dalam rupiah",
    amountError: "Isi nominal di atas nol.",
    invoice: "Invoice",
    receipt: "Kwitansi",
    sent: "Terkirim",
    paid: "Lunas",
    record: "Catat pembayaran",
    reset: "Ulangi",
    words: "Terbilang",
    waiting: "Kwitansi muncul saat Anda mencatat pembayaran.",
    note: "Nomor contoh. Nomor Anda mengikuti hitungan Anda sendiri.",
  },
  features: {
    file: "fitur",
    title: "Lima pekerjaan, satu tempat.",
    intro:
      "Setiap proyek klien menyimpan invoice, kwitansi, dan kontraknya sendiri, jadi tidak ada yang tercecer di obrolan.",
    items: [
      {
        id: "invoices",
        name: "Invoice",
        points: [
          "Tagih dari termin pembayaran atau tulis sendiri barisnya",
          "Nomor seperti INV-2026-001, terbit sekali dan tidak dipakai ulang",
          "Cetak atau simpan sebagai PDF",
        ],
      },
      {
        id: "receipts",
        name: "Kwitansi",
        points: [
          "Satu kwitansi untuk setiap pembayaran yang Anda catat",
          "Nomor seperti KWT-2026-001",
          "Pembayaran dibatalkan, kwitansinya ikut dibatalkan",
        ],
      },
      {
        id: "contracts",
        name: "Kontrak",
        points: [
          "Susun proposal, perjanjian, atau serah terima dari proyek",
          "Anda menandatangani dulu, lalu klien",
          "Setiap perubahan menghapus tanda tangan",
        ],
      },
      {
        id: "reminders",
        name: "Pengingat pembayaran",
        points: [
          "Aturan berdasarkan hari sebelum atau sesudah jatuh tempo",
          "Dikirim ke Anda, klien, atau keduanya",
          "Setiap pengingat hanya dikirim sekali",
        ],
      },
      {
        id: "whitelabel",
        name: "White label",
        points: [
          "Nama, logo, dan warna Anda di portal, email, dan dokumen",
          "Kredit kecil Saqina tetap ada di footer",
          "Terbuka di paket berbayar atau dengan perjanjian yang ditandatangani",
        ],
      },
    ],
  },
  finalCta: {
    title: "Mulai dari satu klien.",
    body: "Buat proyek, kirim invoice pertama, dan lihat mana yang belum dibayar.",
    primary: "Mulai Proyek",
    secondary: "Coba kwitansinya",
  },
  footer: { tagline: ["Invoice.", "Kwitansi.", "Kontrak.", "Pengingat."] },
};
