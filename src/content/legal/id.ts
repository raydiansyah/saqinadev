import type { LegalDocId, LegalDocument } from "./types";

/**
 * Menjelaskan apa yang benar-benar dilakukan Saqina Dev saat ini (akun dan workspace proyek,
 * tanpa panggilan AI). Kolom dalam kurung siku adalah placeholder yang wajib diisi operator,
 * dan seluruh teks perlu ditinjau ahli hukum sebelum peluncuran.
 */
export const id: Record<LegalDocId, LegalDocument> = {
  privacy: {
    title: "Kebijakan Privasi",
    description:
      "Cara Saqina Dev menangani data Anda: akun, proyek, apa yang tetap di browser, dan hak Anda.",
    updated: "2026-10-09",
    intro:
      "Kebijakan ini menjelaskan cara Saqina Dev menangani data pribadi di situs ini: halaman publik dan pratinjau, akun Anda, serta workspace proyek yang Anda buat.",
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
            p: "Akun. Saat Anda membuat akun, kami menyimpan nama, alamat email, dan hash satu arah dari kata sandi Anda; kata sandinya sendiri tidak pernah kami simpan. Jika Anda masuk dengan Google, kami menerima nama, alamat email, dan foto profil Anda dari Google.",
          },
          {
            p: "Proyek. Semua yang Anda masukkan ke proyek disimpan di database kami agar tetap ada saat Anda kembali: jawaban interview, requirement, dokumen seperti PRD dan plan, task, memory, keputusan, preferensi agent, pengaturan proyek, dan catatan perubahan (siapa mengubah apa dan kapan).",
          },
          {
            p: "Percakapan dengan Saqina. Pesan Anda ke asisten di aplikasi, balasannya, perubahan yang diusulkannya, dan log run agent disimpan bersama proyek. Percakapan hanya terlihat oleh Anda; perubahan yang dihasilkannya tercatat di log aktivitas proyek yang bisa dilihat semua anggota proyek.",
          },
          {
            p: "Integrasi. Jika Anda menghubungkan repository, server MCP, atau agent eksternal, kami menyimpan alamatnya serta access token atau signing secret dalam bentuk terenkripsi. Kami membaca file repository hanya saat sebuah task membutuhkannya (repository Anda tidak disalin), menulis hanya ke branch agent setelah anggota proyek menyetujui perubahannya, dan tidak pernah melakukan merge atau deploy. Server MCP yang Anda hubungkan menerima input dari tool yang Anda aktifkan. Agent eksternal hanya menerima paket konteks yang Anda periksa dan setujui, dengan secret yang dikenali sudah dihapus.",
          },
          {
            p: "Client dan billing. Jika Anda mengelola client di Saqina Dev, kami menyimpan data client yang Anda masukkan (nama, perusahaan, kontak, dan catatan internal), scope proyek, jadwal pembayaran, invoice, dan pembayaran yang Anda catat. Catatan pembayaran Anda masukkan sendiri dari mutasi rekening atau bukti bayar; Saqina Dev tidak memproses pembayaran, tidak menyimpan dana, dan tidak terhubung ke bank Anda. Pembayaran tidak pernah dihapus: entri yang dikoreksi dibatalkan (void) dengan alasan agar riwayat tetap lengkap.",
          },
          {
            p: "Portal client. Jika Anda mengundang client, kami menyimpan alamat email yang diundang dan hash dari tautan undangan sekali pakai. Client yang menerima undangan hanya melihat proyek yang Anda aktifkan untuk portal, dan pada proyek itu hanya progres, item scope yang ditampilkan, dokumen yang disetujui dan dibagikan, invoice yang sudah terbit, serta pembayaran yang terkonfirmasi. Catatan internal, task, detail AI dan agent, integrasi, dan draft invoice tidak pernah ditampilkan ke client. Anda bertanggung jawab memiliki dasar hukum yang sah untuk memasukkan data pribadi client Anda.",
          },
          {
            p: "Sesi dan keamanan. Kami menyimpan sesi aktif Anda beserta alamat IP dan jenis browser yang dipakai untuk masuk, agar Anda tetap masuk dan agar akun dapat dilindungi.",
          },
          {
            p: "Email. Kami hanya mengirim email transaksional: tautan verifikasi email dan atur ulang kata sandi. Email ini dikirim melalui [PENYEDIA EMAIL].",
          },
          {
            p: "Pratinjau publik. Interview di halaman publik /start dan demo di landing page berjalan di browser Anda. Jawabannya tetap di session storage browser sampai tab ditutup, kecuali Anda memilih mengimpornya ke proyek baru setelah masuk.",
          },
          {
            p: "Log server. Penyedia hosting kami, [PENYEDIA HOSTING], memproses data teknis yang diperlukan untuk menyajikan dan melindungi situs, seperti alamat IP, jenis browser, halaman yang diminta, dan waktu permintaan. Log ini disimpan selama [MASA SIMPAN LOG].",
          },
        ],
      },
      {
        id: "cookies",
        heading: "Cookie",
        blocks: [
          {
            list: [
              "Cookie sesi (better-auth.session_token): menjaga Anda tetap masuk. Tidak dapat dibaca oleh skrip di halaman dan berakhir setelah 30 hari atau saat Anda keluar.",
              "Cookie masuk berumur pendek: hanya dipasang selama proses masuk dengan Google berlangsung, untuk melindungi proses itu.",
              "Bahasa (NEXT_LOCALE): hanya menyimpan kode bahasa pilihan Anda (en atau id) dan dihapus saat browser ditutup.",
            ],
          },
          { p: "Kami tidak memakai cookie analitik, iklan, atau pelacakan." },
        ],
      },
      {
        id: "what-we-do-not-do",
        heading: "Yang tidak kami lakukan",
        blocks: [
          {
            list: [
              "Kami tidak memakai analitik, iklan, atau pelacak media sosial.",
              "Kami tidak menjual atau menyewakan data pribadi.",
              "Kami tidak memuat font atau skrip dari server pihak ketiga; font disajikan dari domain kami sendiri.",
              "Kami tidak mengirim data proyek Anda ke penyedia AI kecuali owner platform telah mengonfigurasinya. Jika penyedia dikonfigurasi, hanya konteks proyek yang diperlukan untuk sebuah permintaan yang dikirim ([PENYEDIA AI], [KONFIRMASI: ketentuan penyimpanan data dan pelatihan model dari tiap penyedia]). Tanpa itu, jawaban berasal dari aturan deterministik di server kami. Perubahan pada proyek Anda selalu divalidasi oleh aturan kami sendiri sebelum diterapkan.",
            ],
          },
        ],
      },
      {
        id: "legal-basis",
        heading: "Mengapa kami memproses data",
        blocks: [
          {
            p: "Kami memproses data akun dan proyek untuk menyediakan layanan yang Anda daftarkan, yaitu pemenuhan perjanjian kami dengan Anda. Kami memproses log server dan data sesi atas dasar kepentingan yang sah untuk mengoperasikan dan mengamankan layanan, serta untuk memenuhi kewajiban hukum.",
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
            p: "Data diproses atas nama kami oleh [PENYEDIA HOSTING] (hosting), [PENYEDIA DATABASE] (database), [PENYEDIA EMAIL] (email transaksional), penyedia AI yang dikonfigurasi owner platform ([PENYEDIA AI]), serta host Git, server MCP, dan agent yang Anda hubungkan sendiri, sebagai prosesor data atau atas instruksi Anda. Jika Anda masuk dengan Google, Google memproses proses masuk itu berdasarkan ketentuannya sendiri. Kami mengungkapkan data kepada otoritas hanya jika diwajibkan hukum Indonesia.",
          },
          {
            p: "Penyedia ini dapat menyimpan data di luar Indonesia, di [WILAYAH HOSTING]. Jika data keluar dari Indonesia, kami mengandalkan perlindungan yang diwajibkan UU PDP untuk transfer lintas negara.",
          },
        ],
      },
      {
        id: "retention",
        heading: "Berapa lama data disimpan",
        blocks: [
          {
            p: "Data proyek disimpan sampai Anda menghapus proyek; penghapusan di pengaturan proyek berlaku langsung dan permanen. Data akun disimpan selama akun Anda ada. Setelah akun dihapus, salinan sisa di cadangan dihapus dalam [MASA SIMPAN CADANGAN].",
          },
        ],
      },
      {
        id: "your-rights",
        heading: "Hak Anda",
        blocks: [
          { p: "Berdasarkan UU PDP, Anda antara lain berhak:" },
          {
            list: [
              "menanyakan data pribadi apa yang kami simpan tentang Anda dan menerima salinannya;",
              "meminta kami memperbaiki atau melengkapi data yang tidak akurat;",
              "meminta kami menghapus data atau menghentikan pemrosesannya;",
              "menarik persetujuan yang pernah Anda berikan;",
              "menolak pemrosesan yang didasarkan pada kepentingan sah kami;",
              "mengajukan pengaduan kepada otoritas pelindungan data pribadi yang berwenang di Indonesia.",
            ],
          },
          {
            p: "Anda dapat mengubah atau menghapus proyek sendiri kapan saja. Penghapusan akun secara mandiri belum tersedia: kirim permintaan ke [EMAIL KONTAK] dan kami akan menghapus akun Anda dalam jangka waktu yang ditetapkan hukum.",
          },
        ],
      },
      {
        id: "security",
        heading: "Keamanan",
        blocks: [
          {
            p: "Situs disajikan melalui HTTPS [KONFIRMASI SAAT DEPLOYMENT]. Kata sandi hanya disimpan sebagai hash satu arah, sesi divalidasi di server pada setiap permintaan, dan setiap operasi proyek memeriksa bahwa Anda adalah anggota proyek itu. Akses ke data produksi dibatasi bagi orang yang memerlukannya untuk mengoperasikan layanan.",
          },
        ],
      },
      {
        id: "children",
        heading: "Anak-anak",
        blocks: [
          {
            p: "Saqina Dev ditujukan bagi orang dewasa yang merencanakan proyek perangkat lunak. Jika Anda berusia di bawah 18 tahun, gunakan dengan keterlibatan orang tua atau wali.",
          },
        ],
      },
      {
        id: "changes",
        heading: "Perubahan kebijakan ini",
        blocks: [
          {
            p: "Eksekusi agent sungguhan, integrasi dengan layanan seperti GitHub atau Vercel, dan pembayaran hadir di fase berikutnya dan akan mengubah data yang kami proses. Kami akan memperbarui kebijakan ini sebelum fitur tersebut aktif dan menampilkan tanggal baru di bagian atas halaman ini.",
          },
        ],
      },
    ],
  },

  terms: {
    title: "Syarat dan Ketentuan",
    description:
      "Ketentuan penggunaan Saqina Dev: akun, proyek, apa layanan ini dan apa yang bukan, serta aturan yang berlaku.",
    updated: "2026-10-09",
    intro:
      "Ketentuan ini berlaku untuk penggunaan situs dan layanan Saqina Dev. Dengan membuat akun atau memakai situs, Anda menyetujuinya. Jika tidak setuju, mohon jangan memakai Saqina Dev.",
    sections: [
      {
        id: "operator",
        heading: "Penyedia layanan",
        blocks: [
          {
            p: 'Layanan disediakan oleh [NAMA PERUSAHAAN], [ALAMAT TERDAFTAR], Indonesia ("kami"). Kontak: [EMAIL KONTAK].',
          },
        ],
      },
      {
        id: "service",
        heading: "Apa layanan ini",
        blocks: [
          {
            p: "Saqina Dev mengubah ide proyek menjadi workspace proyek yang terstruktur: interview, requirement, rekomendasi, PRD, plan, task, memory proyek, keputusan, asisten (Saqina) yang bisa menjawab pertanyaan serta mengusulkan atau menerapkan perubahan, antrean persetujuan, dan penugasan agent.",
          },
          {
            p: "Agent Saqina dapat merencanakan pekerjaan dengan model AI yang dikonfigurasi owner platform dan mengusulkan perubahan, termasuk commit ke branch kerja di repository yang Anda hubungkan. Tidak ada yang diterapkan ke proyek atau repository sampai anggota proyek menyetujuinya, Saqina tidak pernah melakukan merge atau deploy, dan agent eksternal (Claude, Codex, dan lainnya) tidak dijalankan oleh Saqina: Anda menyerahkan pekerjaan ke mereka dan mengimpor hasilnya.",
          },
          { p: "Saat ini tidak ada langganan atau pembayaran." },
        ],
      },
      {
        id: "account",
        heading: "Akun Anda",
        blocks: [
          {
            p: "Anda wajib memberikan informasi yang akurat dan menjaga kata sandi Anda. Anda bertanggung jawab atas aktivitas di akun Anda. Beri tahu kami di [EMAIL KONTAK] jika Anda yakin akun Anda diakses tanpa izin.",
          },
        ],
      },
      {
        id: "recommendations",
        heading: "Rekomendasi bukan nasihat profesional",
        blocks: [
          {
            p: "Rekomendasi, dokumen yang dibuat, jawaban Saqina, dan hasil agent berasal dari mesin aturan deterministik dan, jika diaktifkan, model AI. Itu adalah titik awal perencanaan, bukan nasihat hukum, keuangan, keamanan, atau teknik, dan bisa saja tidak lengkap atau tidak tepat untuk situasi Anda. Perubahan yang perlu persetujuan hanya diterapkan setelah anggota proyek menyetujuinya.",
          },
          {
            p: "Anda tetap bertanggung jawab atas keputusan yang Anda ambil dan untuk memeriksa rekomendasi sebelum mengandalkannya.",
          },
        ],
      },
      {
        id: "your-content",
        heading: "Proyek dan konten Anda",
        blocks: [
          {
            p: "Apa yang Anda masukkan ke Saqina Dev tetap milik Anda. Anda memberi kami izin untuk menyimpan, memproses, dan menampilkannya hanya sejauh diperlukan untuk menyediakan layanan kepada Anda. Anda dapat mengekspornya dengan menyalin dokumen dan konteks agent, dan menghapusnya dengan menghapus proyek.",
          },
          {
            p: "Jangan mengunggah konten yang tidak berhak Anda pakai, atau data pribadi orang lain tanpa dasar hukum yang sah.",
          },
          {
            p: "Proposal, ringkasan scope, deskripsi invoice, dan teks lain yang disusun Saqina Dev untuk Anda adalah draft. Itu bukan nasihat hukum, pajak, atau akuntansi; periksa sebelum Anda mengandalkannya atau mengirimkannya ke client. Angka billing hanya berasal dari catatan yang Anda masukkan.",
          },
        ],
      },
      {
        id: "our-content",
        heading: "Konten kami",
        blocks: [
          {
            p: "Desain, teks, kode situs, dan nama Saqina Dev milik [NAMA PERUSAHAAN] atau pemberi lisensinya. Anda boleh memakai layanan untuk keperluan pribadi atau internal bisnis. Jangan menyalin, menjual kembali, atau mengakuinya sebagai milik Anda.",
          },
        ],
      },
      {
        id: "acceptable-use",
        heading: "Penggunaan yang diperbolehkan",
        blocks: [
          { p: "Saat memakai Saqina Dev, jangan:" },
          {
            list: [
              "mencoba mengganggu, membebani, atau mengakses tanpa izin layanan, akun lain, atau infrastrukturnya;",
              "memakai alat otomatis dengan cara yang merugikan ketersediaan layanan;",
              "memakai layanan untuk hal yang melanggar hukum Indonesia.",
            ],
          },
          {
            p: "Kami dapat menangguhkan akun yang melanggar aturan ini dan akan memberi tahu alasannya kecuali dilarang hukum.",
          },
        ],
      },
      {
        id: "third-parties",
        heading: "Nama pihak ketiga",
        blocks: [
          {
            p: "Situs ini menyebut produk seperti Claude, Codex, Cursor, Kiro, Hermes, Antigravity, OpenClaw, Vercel, Supabase, GitHub, GitLab, dan Bitbucket untuk menjelaskan kompatibilitas. Nama-nama tersebut milik pemiliknya masing-masing. Penyebutan tersebut tidak berarti mereka mendukung atau berafiliasi dengan Saqina Dev. Saat Anda memakai layanan tersebut, ketentuan mereka sendiri yang berlaku.",
          },
        ],
      },
      {
        id: "availability",
        heading: "Ketersediaan dan perubahan",
        blocks: [
          {
            p: "Layanan disediakan sebagaimana adanya dan sebagaimana tersedia selama masih dalam tahap pengembangan awal. Kami dapat mengubah, menjeda, atau menghentikan fitur, dan akan memberi pemberitahuan yang wajar sebelum menghentikan layanan agar Anda dapat menyalin dokumen proyek.",
          },
        ],
      },
      {
        id: "liability",
        heading: "Batasan tanggung jawab",
        blocks: [
          {
            p: "Sejauh diizinkan hukum Indonesia, kami tidak bertanggung jawab atas kerugian tidak langsung atau konsekuensial yang timbul dari penggunaan layanan atau dari mengandalkan rekomendasinya. Tidak ada dalam ketentuan ini yang membatasi tanggung jawab yang tidak dapat dibatasi menurut hukum.",
          },
        ],
      },
      {
        id: "law",
        heading: "Hukum yang berlaku dan sengketa",
        blocks: [
          {
            p: "Ketentuan ini tunduk pada hukum Republik Indonesia. Kami akan terlebih dahulu berupaya menyelesaikan sengketa secara musyawarah. Jika tidak berhasil, sengketa akan diselesaikan melalui [PENGADILAN ATAU LEMBAGA ARBITRASE].",
          },
          {
            p: "Ketentuan ini tersedia dalam bahasa Inggris dan Indonesia. [KONFIRMASI DENGAN AHLI HUKUM: versi bahasa mana yang berlaku jika terdapat perbedaan.]",
          },
        ],
      },
      {
        id: "changes",
        heading: "Perubahan ketentuan ini",
        blocks: [
          {
            p: "Kami akan memperbarui ketentuan ini sebelum pembayaran, eksekusi agent sungguhan, atau integrasi tersedia, menampilkan tanggal baru di bagian atas halaman ini, dan memberi tahu pemilik akun melalui email tentang perubahan yang material.",
          },
        ],
      },
    ],
  },
};
