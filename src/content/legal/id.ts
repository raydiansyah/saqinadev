import type { LegalDocId, LegalDocument } from "./types";

/**
 * Menjelaskan apa yang benar-benar dilakukan pratinjau Fase 1. Kolom dalam kurung siku
 * adalah placeholder yang wajib diisi operator, dan seluruh teks perlu ditinjau ahli hukum
 * sebelum peluncuran.
 */
export const id: Record<LegalDocId, LegalDocument> = {
  privacy: {
    title: "Kebijakan Privasi",
    description:
      "Cara pratinjau Saqina Dev menangani data Anda: apa yang tetap di browser, apa yang sampai ke server, dan hak Anda.",
    updated: "2026-10-07",
    intro:
      "Kebijakan ini menjelaskan cara Saqina Dev menangani data pribadi selama pratinjau Fase 1, yang terdiri dari situs ini, demo di landing page dan interview proyek. Belum ada akun pengguna di fase ini.",
    sections: [
      {
        id: "who-we-are",
        heading: "Siapa kami",
        blocks: [
          {
            p: "Saqina Dev dioperasikan oleh [NAMA PERUSAHAAN], [ALAMAT TERDAFTAR], Indonesia. Untuk pertanyaan tentang kebijakan ini atau data Anda, hubungi kami di [EMAIL KONTAK].",
          },
        ],
      },
      {
        id: "what-we-process",
        heading: "Data yang kami proses",
        blocks: [
          {
            p: "Interview proyek. Jawaban Anda hanya disimpan di session storage browser Anda agar tidak hilang saat halaman dimuat ulang. Jawaban tidak dikirim ke server kami, dan terhapus saat Anda menutup tab atau memilih Mulai Ulang.",
          },
          {
            p: "Demo di landing page. Ide yang Anda ketik dibaca oleh engine pratinjau yang berjalan di browser Anda. Tidak ada yang dikirim atau disimpan.",
          },
          {
            p: "Salin dan unduh brief. Menyalin brief ke clipboard dan mengunduh file Markdown terjadi di perangkat Anda.",
          },
          {
            p: "Preferensi bahasa. Kami memasang satu cookie, NEXT_LOCALE, yang hanya menyimpan kode bahasa pilihan Anda (en atau id). Cookie ini adalah session cookie dan terhapus saat browser ditutup.",
          },
          {
            p: "Log server. Penyedia hosting kami, [PENYEDIA HOSTING], memproses data teknis yang diperlukan untuk menyajikan dan melindungi situs, seperti alamat IP, jenis browser, halaman yang diminta dan waktu permintaan. Log ini disimpan selama [MASA SIMPAN LOG].",
          },
        ],
      },
      {
        id: "what-we-do-not-do",
        heading: "Yang tidak kami lakukan",
        blocks: [
          {
            list: [
              "Kami tidak memakai analitik, pelacak iklan atau pelacak media sosial di fase ini.",
              "Kami tidak menjual atau menyewakan data pribadi.",
              "Kami tidak memuat font atau script dari server pihak ketiga; font disajikan dari domain kami sendiri.",
              "Kami tidak mengirim jawaban interview atau teks demo ke penyedia AI mana pun. Engine pratinjau bersifat deterministik dan berjalan di browser Anda.",
            ],
          },
        ],
      },
      {
        id: "legal-basis",
        heading: "Mengapa kami memproses data",
        blocks: [
          {
            p: "Kami memproses data log server berdasarkan kepentingan sah kami untuk mengoperasikan dan mengamankan situs, serta untuk memenuhi kewajiban hukum. Data yang tetap di browser Anda diproses atas permintaan Anda dan berada di bawah kendali Anda.",
          },
          {
            p: "Kami menangani data pribadi sesuai Undang-Undang Republik Indonesia Nomor 27 Tahun 2022 tentang Pelindungan Data Pribadi (UU PDP) beserta peraturan pelaksananya.",
          },
        ],
      },
      {
        id: "sharing",
        heading: "Siapa yang menerima data",
        blocks: [
          {
            p: "Data log server diproses oleh [PENYEDIA HOSTING] atas nama kami sebagai prosesor data. Kami hanya mengungkapkan data kepada pihak berwenang jika diwajibkan oleh hukum Indonesia.",
          },
          {
            p: "Penyedia hosting kami dapat menyimpan log di luar Indonesia, di [WILAYAH HOSTING]. Jika data keluar dari Indonesia, kami menerapkan pelindungan yang disyaratkan UU PDP untuk transfer data lintas negara.",
          },
        ],
      },
      {
        id: "your-rights",
        heading: "Hak Anda",
        blocks: [
          { p: "Berdasarkan UU PDP, antara lain Anda berhak untuk:" },
          {
            list: [
              "mengetahui data pribadi apa yang kami simpan tentang Anda dan mendapatkan salinannya;",
              "meminta kami memperbaiki atau melengkapi data yang tidak akurat;",
              "meminta kami menghapus data atau menghentikan pemrosesannya;",
              "menarik kembali persetujuan yang telah Anda berikan;",
              "keberatan atas pemrosesan yang didasarkan pada kepentingan sah kami;",
              "mengajukan pengaduan kepada lembaga pelindungan data pribadi yang berwenang di Indonesia.",
            ],
          },
          {
            p: "Jawaban interview tidak pernah sampai ke kami, jadi Anda bisa menghapusnya sendiri kapan saja dengan menutup tab atau memilih Mulai Ulang. Untuk log server, kirim email ke [EMAIL KONTAK]; kami menanggapi dalam jangka waktu yang ditetapkan peraturan.",
          },
        ],
      },
      {
        id: "security",
        heading: "Keamanan",
        blocks: [
          {
            p: "Situs disajikan melalui HTTPS [KONFIRMASI SAAT DEPLOYMENT]. Akses ke log server dibatasi hanya untuk orang yang membutuhkannya untuk mengoperasikan layanan.",
          },
        ],
      },
      {
        id: "children",
        heading: "Anak-anak",
        blocks: [
          {
            p: "Pratinjau ini ditujukan untuk orang dewasa yang merencanakan proyek software. Jika Anda berusia di bawah 18 tahun, gunakan dengan pendampingan orang tua atau wali.",
          },
        ],
      },
      {
        id: "changes",
        heading: "Perubahan kebijakan ini",
        blocks: [
          {
            p: "Akun, penyimpanan proyek dan integrasi hadir di fase berikutnya dan akan mengubah data yang kami proses. Kami akan memperbarui kebijakan ini sebelum fitur tersebut aktif dan menampilkan tanggal terbaru di bagian atas halaman ini.",
          },
        ],
      },
    ],
  },

  terms: {
    title: "Syarat dan Ketentuan",
    description:
      "Ketentuan penggunaan pratinjau Saqina Dev: apa layanan ini, apa yang bukan, dan aturan yang berlaku.",
    updated: "2026-10-07",
    intro:
      "Ketentuan ini berlaku untuk penggunaan situs Saqina Dev selama pratinjau Fase 1. Dengan menggunakan situs ini, Anda menyetujuinya. Jika tidak setuju, mohon jangan menggunakan situs ini.",
    sections: [
      {
        id: "operator",
        heading: "Penyedia layanan",
        blocks: [
          {
            p: 'Situs ini disediakan oleh [NAMA PERUSAHAAN], [ALAMAT TERDAFTAR], Indonesia ("kami"). Kontak: [EMAIL KONTAK].',
          },
        ],
      },
      {
        id: "preview",
        heading: "Apa itu pratinjau ini",
        blocks: [
          {
            p: "Fase 1 adalah pratinjau publik. Anda dapat membaca tentang produk, mencoba demo di landing page dan menyelesaikan interview proyek yang menghasilkan rekomendasi dan brief Markdown.",
          },
          {
            p: "Fitur berlabel Direncanakan atau Demo, seperti pembangunan aplikasi, Git, CI/CD, MCP, persetujuan dan deployment, adalah ilustrasi fungsi masa depan. Fitur tersebut belum tersedia, dan tidak ada proyek, repository atau deployment yang dibuat.",
          },
          { p: "Belum ada akun, langganan atau pembayaran di fase ini." },
        ],
      },
      {
        id: "recommendations",
        heading: "Rekomendasi bukan nasihat profesional",
        blocks: [
          {
            p: "Rekomendasi berasal dari engine aturan deterministik yang berjalan di browser Anda. Rekomendasi adalah titik awal perencanaan, bukan nasihat hukum, keuangan, keamanan atau rekayasa, dan bisa tidak lengkap atau tidak tepat untuk situasi Anda.",
          },
          {
            p: "Anda tetap bertanggung jawab atas keputusan yang Anda ambil dan untuk memeriksa setiap rekomendasi sebelum mengandalkannya.",
          },
        ],
      },
      {
        id: "your-content",
        heading: "Ide dan brief Anda",
        blocks: [
          {
            p: "Apa yang Anda ketik di interview atau demo tetap milik Anda. Isinya tetap di browser Anda dan tidak dikirim ke kami. Brief Markdown yang Anda salin atau unduh bebas Anda gunakan, ubah dan bagikan.",
          },
        ],
      },
      {
        id: "our-content",
        heading: "Konten kami",
        blocks: [
          {
            p: "Desain, teks, kode situs dan nama Saqina Dev adalah milik [NAMA PERUSAHAAN] atau pemberi lisensinya. Anda boleh melihat dan membagikan situs untuk keperluan pribadi atau internal bisnis. Jangan menyalin, menjual kembali atau mengakuinya sebagai milik Anda.",
          },
        ],
      },
      {
        id: "acceptable-use",
        heading: "Penggunaan yang diperbolehkan",
        blocks: [
          { p: "Saat menggunakan situs, jangan:" },
          {
            list: [
              "mencoba mengganggu, membebani atau mendapatkan akses tanpa izin ke situs atau infrastrukturnya;",
              "memakai alat otomatis dengan cara yang merusak ketersediaan situs;",
              "memakai situs untuk tujuan yang melanggar hukum Indonesia.",
            ],
          },
        ],
      },
      {
        id: "third-parties",
        heading: "Nama pihak ketiga",
        blocks: [
          {
            p: "Situs ini menyebut produk seperti Claude, Codex, Cursor, Kiro, Hermes, Antigravity, OpenClaw, Vercel, Supabase, GitHub, GitLab dan Bitbucket untuk menjelaskan kompatibilitas. Nama-nama tersebut milik pemiliknya masing-masing. Penyebutannya tidak berarti mereka mendukung atau berafiliasi dengan Saqina Dev. Saat Anda memakai layanan tersebut, ketentuan mereka sendiri yang berlaku.",
          },
        ],
      },
      {
        id: "availability",
        heading: "Ketersediaan dan perubahan",
        blocks: [
          {
            p: "Pratinjau disediakan sebagaimana adanya dan sebagaimana tersedia. Kami dapat mengubah, menghentikan sementara atau mengakhirinya kapan saja, termasuk interview dan rekomendasinya.",
          },
        ],
      },
      {
        id: "liability",
        heading: "Batasan tanggung jawab",
        blocks: [
          {
            p: "Sejauh diizinkan hukum Indonesia, kami tidak bertanggung jawab atas kerugian tidak langsung atau kerugian lanjutan yang timbul dari penggunaan pratinjau atau dari mengandalkan rekomendasinya. Tidak ada bagian dari ketentuan ini yang membatasi tanggung jawab yang menurut hukum tidak dapat dibatasi.",
          },
        ],
      },
      {
        id: "law",
        heading: "Hukum yang berlaku dan sengketa",
        blocks: [
          {
            p: "Ketentuan ini tunduk pada hukum Republik Indonesia. Setiap sengketa akan lebih dulu diselesaikan secara musyawarah. Jika tidak tercapai kesepakatan, sengketa diselesaikan melalui [PENGADILAN ATAU LEMBAGA ARBITRASE].",
          },
          {
            p: "Ketentuan ini tersedia dalam bahasa Inggris dan bahasa Indonesia. [KONFIRMASI DENGAN AHLI HUKUM: versi bahasa mana yang berlaku jika terdapat perbedaan.]",
          },
        ],
      },
      {
        id: "changes",
        heading: "Perubahan ketentuan ini",
        blocks: [
          {
            p: "Kami akan memperbarui ketentuan ini sebelum akun, penyimpanan proyek, pembayaran atau integrasi tersedia, dan menampilkan tanggal terbaru di bagian atas halaman ini.",
          },
        ],
      },
    ],
  },
};
