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
    secondaryCta: "Lihat Fiturnya",
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
  },
  footer: { tagline: ["Invoice.", "Kwitansi.", "Kontrak.", "Pengingat."] },
};
