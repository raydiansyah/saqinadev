---
title: Mengimpor project dari GitHub
description: Dari repository yang sudah ada menjadi workspace Saqina: dokumen, PRD, tahap build/review/deploy, dan tampilan untuk client.
order: 1
updated: 2026-10-29
---

Gunakan impor kalau sistem Anda **sudah punya repository di GitHub**, mungkin sudah berjalan, sedang di-review, atau masih dibangun. Saqina membaca README dan isi folder dokumentasi, lalu menyiapkan workspace tanpa Anda mengisi interview dari nol. GitHub tetap menjadi sumber dokumen: Saqina hanya membaca dan tidak pernah menulis ke repository Anda.

```mermaid
flowchart LR
  A[Pilih repository] --> B[Saqina membaca README dan folder docs]
  B --> C{Ada PRD?}
  C -- Ya --> D[PRD terpasang otomatis]
  C -- Tidak --> E[Anda memilih, menempel, atau mengunggah]
  D --> F[Jawab: sudah sampai mana sistemnya?]
  E --> F
  F --> G[Tahapan, progres, dan task menyesuaikan]
```

## Sebelum mulai

- Nama repository di GitHub, misalnya `acme/restaurant-pos`, atau URL-nya.
- Repository **publik** tidak butuh apa-apa lagi. Repository **privat** butuh akun GitHub yang dihubungkan, atau token akses baca.
- Dokumen yang ingin dibaca client sebaiknya ada di satu folder, biasanya `docs`.

## Langkah 1. Buka Proyek baru

Dari dashboard, pilih **Proyek baru**. Halaman pertama menawarkan dua cara memulai.

![Halaman Proyek baru dengan dua pilihan: Dari sebuah ide dan Impor dari GitHub](/api/docs/assets/owner/import-01-new-project.png)

## Langkah 2. Pilih tab Impor dari GitHub

Tab ini menjelaskan apa yang dibaca Saqina. Anda bisa menekan **Hubungkan dengan GitHub** untuk memilih repository dari daftar akun Anda, termasuk yang privat, tanpa menyalin token. Anda juga bisa mengetik nama repository langsung.

![Tab Impor dari GitHub dengan kolom Repository GitHub terisi tj/commander.js](/api/docs/assets/owner/import-02-import-tab.png)

## Langkah 3. Isi opsi impor

Di bawah kolom repository ada tiga isian dan satu pilihan.

- **Token akses** hanya untuk repository privat. Buat token fine-grained dengan akses baca ke Contents. Token disimpan terenkripsi dan menghubungkan repository ke project.
- **Folder dokumentasi** bersifat opsional. Kosongkan untuk memakai `docs`. Semua isi folder ini dibaca (sampai 200 file dan 6 tingkat), ditampilkan di Saqina, dan bisa dibaca client. Teks yang tampak seperti rahasia, misalnya kunci akses, tetap diimpor tetapi tidak dibagikan ke client.
- **Izinkan AI membaca dokumen** mati secara default. Kalau dimatikan, Saqina memakai aturan sederhana dan tidak ada data yang keluar dari server.

Tekan **Impor dan tinjau**.

![Isian Token akses, Folder dokumentasi, pilihan AI, dan tombol Impor dan tinjau](/api/docs/assets/owner/import-03-import-options.png)

Selama membaca, tombol berubah menjadi **Membaca repository…**. Repository publik tanpa token dibatasi GitHub sekitar 60 permintaan per jam, jadi jangan mengulang impor berkali-kali dalam waktu singkat.

![Tombol berubah menjadi Membaca repository saat impor berjalan](/api/docs/assets/owner/import-04-importing.png)

## Langkah 4. Jawab: sudah sampai mana sistemnya?

Setelah impor selesai Anda langsung masuk ke halaman **Progres**. Saqina sengaja **tidak** menganggap project ini baru mulai dibangun, karena sistem yang diimpor bisa saja sudah berjalan. Jawab tiga pertanyaan:

- Apakah sistem sudah selesai di-build?
- Apakah sistem sudah di-review?
- Apakah sistem sudah di-deploy?

![Halaman Progres dengan kartu Apakah sistem sudah siap dan tiga pertanyaan](/api/docs/assets/owner/import-05-progress-question.png)

Sampai ada jawaban, beranda project menampilkan langkah berikutnya **Jawab sudah sampai mana sistemnya**, dan tahap Build, Review, dan Deploy belum menyala.

![Beranda project dengan tombol Jawab sudah sampai mana sistemnya dan tahapan yang belum aktif](/api/docs/assets/owner/import-06-overview-awaiting.png)

Setiap pertanyaan dijawab sendiri-sendiri: mengubah satu jawaban tidak pernah mengubah jawaban lain. Kalau jawabannya bertentangan, misalnya review **Ya** sementara build **Belum**, halaman menampilkan peringatan dan langkah berikutnya project meminta Anda memperbaikinya.

Kalau project sudah punya task, Saqina menawarkan untuk menyesuaikan task dengan jawaban Anda:

- build **Ya**: task yang masih terbuka dipindah ke status review,
- review **Ya**: semua task yang belum selesai menjadi selesai.

Pilihannya **Batal**, **Jawab saja**, atau **Jawab dan sesuaikan task**. Task hanya bergerak maju dan tidak pernah dibuka kembali, dan setiap task tetap bisa Anda ubah sendiri sesudahnya. Kalau repository tidak punya daftar task, tidak ada task yang dibuat otomatis.

![Halaman Progres setelah build dijawab Ya](/api/docs/assets/owner/import-11-answered.png)

Stepper di beranda dan langkah berikutnya ikut berubah: setelah build dijawab **Ya**, tahap Review yang aktif.

![Beranda project setelah build dijawab Ya, tahap Review aktif](/api/docs/assets/owner/import-12-overview-answered.png)

## Langkah 5. Pasang PRD

Saqina mencari PRD di seluruh folder dokumentasi, termasuk subfolder. Nama seperti `prd.md`, `project-prd.md`, atau `01-prd.md` dikenali. Kalau ketemu, PRD langsung terpasang dan terus mengikuti GitHub.

Kalau tidak ketemu, halaman **PRD** bertanya dokumen mana yang PRD. Ada dua cara.

**Dari repository.** Pilih salah satu file yang sudah dibaca. File itu menjadi PRD dan tetap mengikuti GitHub.

![Kartu Dokumen mana yang PRD dengan tab Dari repository](/api/docs/assets/owner/import-07-prd-choose.png)

**Tempel atau unggah.** Unggah file `.md`, `.markdown`, atau `.txt` (maksimal 200 KB), atau tempel teksnya. Isi file masuk ke kotak teks lebih dulu supaya Anda bisa memeriksanya sebelum menyimpan.

![Tab Tempel atau unggah dengan kotak teks berisi PRD](/api/docs/assets/owner/import-08-prd-paste.png)

PRD yang sudah ada tidak pernah ditimpa. Kalau PRD memang belum ada, biarkan kosong: Saqina tidak membuat PRD sendiri untuk project hasil impor.

Semua dokumen Markdown mendukung diagram **Mermaid**. Tulis blok kode dengan bahasa `mermaid` dan diagramnya tampil di pratinjau dan di portal client. Kalau teks diagram tidak valid, sumbernya ditampilkan bersama pesan.

![PRD dengan diagram Mermaid Definisikan opsi, Parse argumen, Jalankan perintah](/api/docs/assets/owner/import-09-prd-mermaid.png)

## Langkah 6. Periksa Dokumen

Halaman **Dokumen** memuat semua file yang dibaca.

- File di folder dokumentasi berstatus **Disetujui** dan **Dibagikan**, jadi client bisa membacanya di portal.
- File di luar folder itu, seperti README, berstatus **Draf** dan tetap internal. Anda bisa membagikannya sendiri setelah menyetujuinya.

![Daftar dokumen: file di folder docs Disetujui dan Dibagikan, README tetap Draf](/api/docs/assets/owner/import-10-documents-shared.png)

## Bagaimana dokumen mengikuti GitHub

- **Satu arah.** Saqina hanya menarik dari GitHub dan tidak mengirim apa pun balik: tidak ada branch atau pull request.
- **Kapan menarik.** Saat halaman Dokumen dibuka dan tarikan terakhir lebih dari 10 menit lalu, sebelum menyimpan edit, dan sekali sehari lewat cron.
- **File baru** di folder dokumentasi otomatis muncul sebagai dokumen baru, dan ikut terlihat oleh client.
- **Kalau dua sisi berubah**, yang paling baru menang. Kalau GitHub lebih baru, teksnya dipakai dan teks Saqina tetap ada di riwayat versi. Kalau teks Saqina lebih baru, teks itu dipertahankan.
- **Jawaban build, review, deploy** tidak otomatis kedaluwarsa karena perubahan dari GitHub. Kalau task atau milestone berubah setelah jawaban, jawabannya diberi tanda untuk dikonfirmasi ulang.

## Masalah umum

- **Repository tidak ditemukan.** Periksa penulisan `pemilik/nama`. Untuk repository privat, hubungkan GitHub atau isi token.
- **GitHub membatasi permintaan.** Tunggu beberapa menit, atau hubungkan akun GitHub supaya batasnya lebih longgar.
- **PRD tidak terdeteksi.** Pakai kartu pertanyaan PRD di halaman PRD untuk memilih, menempel, atau mengunggah.
- **Dokumen tidak muncul untuk client.** Hanya dokumen berstatus Disetujui yang bisa dibagikan, dan hanya file di folder dokumentasi yang dibagikan otomatis.
- **Folder dokumentasi tidak bernama `docs`.** Isi nama foldernya di langkah 3, misalnya `documentation/product`.
