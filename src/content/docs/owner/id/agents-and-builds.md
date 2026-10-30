---
title: Plan dan Build dengan agen
description: Minta Saqina merencanakan atau membangun dari chat Studio, ikuti agen yang bekerja, hentikan atau coba lagi, baca perubahan kode yang sebenarnya, dan (untuk owner platform) atur siapa agen itu dan apa yang boleh mereka lakukan.
order: 6
updated: 2026-10-30
---

Di Studio Anda bisa meminta Saqina merencanakan sebuah pekerjaan atau membangunnya. Sebuah tim agen mengerjakannya, masing-masing dengan tugasnya sendiri, dan setiap layar menunjukkan apa yang benar-benar mereka lakukan. Panduan ini membahas cara memakai Plan dan Build, membaca hasilnya, dan, untuk owner platform, mengelola agen.

## Chat, Plan, atau Build

Di bawah kotak pesan ada pilihan dengan tiga opsi. Apa yang Anda ketik diperlakukan sesuai pilihan itu.

| Pilihan | Yang terjadi |
|---|---|
| **Chat** | Saqina menjawab dan membahasnya. Tidak ada yang diubah. |
| **Plan** | Saqina menyusun tugas dan siapa yang mengerjakannya. Tidak ada yang dibangun sampai Anda menekan **Bangun rencana ini**. |
| **Build** | Agen langsung mulai bekerja, di sebuah branch kerja. Anda tidak perlu menekan apa pun pada agen. |

![Kotak pesan dengan pilihan Chat, Plan, dan Build](/api/docs/assets/owner/agents-03-composer-modes.png)

Instruksi Anda muncul di chat bersama kartu yang menunjukkan keadaan pekerjaan. Pilihan diingat di browser ini untuk proyek ini. Orang dengan akses lihat saja hanya bisa chat.

## Mengikuti sebuah build

Saat build dimulai, area kerja beralih ke **Agen** dan menjadi lebih lebar. Tidak perlu memuat ulang: layar mengikuti server.

- Setiap agen menunjukkan apa yang sedang dikerjakannya: **Berjalan**, **Menunggu agen** (ia butuh hasil agen lain dulu), **Meninjau**, **Terhambat**, **Berhasil**, **Gagal**, atau **Menganggur**. Keadaan itu berasal dari tugas agen, bukan dari timer.
- Baris di atas menunjukkan keadaan seluruh eksekusi, waktu yang sudah berjalan, dan berapa tugas selesai dari semua tugas. Hanya tugas yang benar-benar selesai yang dihitung.
- **Serah terima dan pesan** memuat apa yang agen sampaikan satu sama lain, misalnya permintaan tinjauan. **Aktivitas** memuat apa yang terjadi, berurutan.

![Tab Agen saat build berjalan: Backend Developer berjalan dan Frontend Developer menunggunya](/api/docs/assets/owner/agents-04-running.png)

Jika koneksi terputus, sebuah pemberitahuan mengatakannya dan Saqina terus memeriksa setiap beberapa detik. Jika Anda pergi lalu kembali, atau memuat ulang, keadaan yang sama ada di sana: ia disimpan di server.

## Rencana

Tab **Plan** menunjukkan tujuan, risiko yang dilihat perencana, dan tugas dalam langkah-langkah. Tugas di langkah 2 menunggu tugas yang menjadi dependensinya di langkah 1; dua tugas yang menulis berkas yang sama tidak pernah berjalan bersamaan. Setiap tugas menunjukkan pemiliknya, keadaannya, apa yang ditunggunya, dan kriteria penerimaannya. Ketika sebuah tugas berhenti, alasannya ditulis dengan kata-kata biasa.

![Tab Plan: tujuan dan tugas dalam langkah-langkah, masing-masing dengan pemilik dan keadaannya](/api/docs/assets/owner/agents-05-plan.png)

Rencana yang dibuat dengan **Plan** menunggu Anda.

![Rencana yang siap dan menunggu: Bangun rencana ini dan Ubah rencana](/api/docs/assets/owner/agents-07-plan-mode.png)

- **Bangun rencana ini** memulai agen pada tugas-tugas sesuai rencana.
- **Ubah rencana** menerima kata-kata baru dan merencanakan ulang. Tugas lama disisihkan; tidak dihapus. Rencana yang sedang dibangun tidak bisa diubah dengan cara ini: hentikan lalu mulai lagi.

## Menghentikan dan mencoba lagi

- **Hentikan** mengakhiri sebuah eksekusi. Pekerjaan yang tidak sedang dikerjakan berhenti seketika. Tugas yang sedang dijalankan agen menyelesaikan langkahnya dulu, jadi keadaannya tertulis **Membatalkan** sampai ia berhenti. Saqina tidak pernah menyatakan berhenti sebelum benar-benar berhenti.
- Tugas yang **gagal** atau **terhambat** punya **Coba lagi**. Tugas yang menunggu di belakangnya dilepas dan diperiksa lagi. Pekerjaan yang sudah berhasil tidak dikerjakan dua kali.
- Saqina juga mencoba lagi sendiri, beberapa kali dan dengan jeda, ketika kegagalan mungkin lewat (layanan sibuk, gangguan singkat). Ia tidak mencoba lagi kegagalan yang tidak akan membaik.
- Tinjauan yang gagal tidak mengakhiri pekerjaan: penulisnya mendapat temuan dan tugas revisi, lalu tinjauan dijalankan lagi. Ini hanya berulang beberapa kali, kemudian eksekusi gagal dan mengatakannya.

## Kode yang diubah agen

Agen menulis kode ke **branch kerja** di repositori Anda, bernama `saqina/exec-` dan kode pendek. Mereka tidak pernah menyentuh branch utama Anda, membuka pull request, atau melakukan deploy. Merge dan publish tetap di tangan Anda.

- **Kode** memuat berkas yang diubah branch kerja dibanding branch utama Anda, dengan baris yang ditambah dan dihapus, serta diff setiap berkas. Datanya dari repositori itu sendiri. Sebelum commit pertama, tab ini mengatakan belum ada perubahan kode.
- **Git** menunjukkan branch, commit, dan hasil CI untuk branch itu. Untuk repositori di mesin ini, tab ini mengatakan tidak ada yang di-push ke mana pun.
- **Preview** menunjukkan preview branch kerja ketika repositori Anda terhubung ke Vercel dan ada build branch itu. Jika belum ada, tab ini mengatakannya dan apa yang perlu diperiksa. Ia mempertahankan satu frame dan mengganti alamatnya saat build yang lebih baru siap.
- **Publish** menunjukkan lima fakta terpisah: kode ditulis, build lulus, preview siap, siap deploy, terbit. Tahap yang tidak dilaporkan siapa pun tertulis **belum diketahui**; Saqina tidak menebak. Publish itu sendiri tetap langkah Anda.

![Tab Kode: berkas yang diubah agen dan diff salah satunya](/api/docs/assets/owner/agents-06-code-diff.png)

## Yang tidak boleh dilakukan agen

- Mereka hanya menulis berkas yang tercantum di tugasnya, tidak pernah berkas rahasia, tidak pernah berkas yang berisi rahasia, dan tidak pernah di luar branch kerja.
- Mereka tidak bisa merge, membuka pull request, mengubah branch lain, atau melakukan deploy. Permintaan seperti itu menjadi usulan untuk Anda di **Persetujuan**, atau ditolak.
- Teks yang ditemukan di berkas Anda, di hasil kerja agen lain, atau di sebuah pesan dibaca sebagai informasi. Teks itu tidak bisa memberi agen izin baru atau perintah baru.
- Setiap agen hanya bisa memakai tool yang tercantum di definisinya.

## Ketika berhenti

| Yang Anda lihat | Artinya | Yang dilakukan |
|---|---|---|
| Belum ada model AI yang diatur | Tidak ada yang bisa direncanakan atau ditulis | Minta owner platform menambahkan model di AI & Model |
| Belum ada repositori yang terhubung | Agen tidak punya tempat menulis kode | Hubungkan satu di tab Git |
| Tidak ada agen yang menyala untuk sebuah peran | Rencana menyebut peran yang tidak dipegang agen mana pun, atau ada agen yang dimatikan | Owner platform menyalakan agen; jalankan lagi |
| Rencana ditolak | Rencana punya lingkaran, terlalu banyak tugas, atau peran tak dikenal | Rencanakan ulang dengan permintaan yang lebih jelas |
| Sebuah perubahan ditolak sebelum ditulis | Agen mencoba berkas di luar tugasnya atau berisi rahasia | Coba lagi, atau ubah tugasnya |
| Repositori menolak operasi itu | Host menolak (akses, branch sibuk) | Periksa koneksi repositori, lalu coba lagi |
| Batas waktu habis | Agen atau seluruh eksekusi terlalu lama | Coba lagi, atau pecah pekerjaannya |

## Untuk owner platform: registri agen

Di **AI & Model**, **Agen** memuat setiap jenis agen yang dimiliki Saqina. Hanya owner platform yang melihat halaman ini. Proyek mengikuti definisi ini; proyek tidak dapat mengubahnya.

![Registri agen: sembilan agen, masing-masing dengan peran, versi, dan keadaannya](/api/docs/assets/owner/agents-01-registry.png)

Sembilan agen sudah tersedia di awal: Planner, Architect, Backend Developer, Frontend Developer, Database Engineer, QA Engineer, Code Reviewer, DevOps Engineer, dan Docs Writer. Ini hanya titik awal: ubah, matikan, arsipkan, atau tambah milik Anda sendiri dengan **Agen baru**.

Sebuah definisi menyatakan siapa agen itu dan apa yang boleh dilakukannya:

- **Instruksi**, **tanggung jawab**, **lingkup yang diizinkan**, **pekerjaan terlarang**, **masukan yang dibutuhkan**, **keluaran yang diberikan**, dan **kriteria selesai**.
- **Model**: model miliknya sendiri, atau model peran dari **Pemetaan agent**.
- **Tool** dan **izin**: hanya yang dicentang yang bisa dipakai. Merge, deploy, dan menghapus proyek tidak bisa dicentang.
- **Boleh menyerahkan pekerjaan ke**: agen yang boleh menerima pekerjaan darinya.
- **Percobaan per tugas**, **batas waktu**, dan **prioritas**.

![Definisi sebuah agen: instruksi dan kolom yang membatasinya](/api/docs/assets/owner/agents-02-edit.png)

Perlu diketahui:

- Setiap simpan adalah **versi** baru dengan salinan lengkap, dan halaman mencatat siapa mengubah apa dan kapan. Jejak audit mencatat kolom mana yang berubah, tidak pernah teks instruksinya.
- Perubahan berlaku untuk eksekusi **baru**. Eksekusi yang sedang berjalan tetap memakai definisi saat ia dimulai.
- **Matikan** menghentikan agen menerima tugas baru di mana pun. **Arsipkan** juga mengeluarkannya dari tim setiap proyek. Pulihkan mengembalikannya.
- Setiap kartu menunjukkan seberapa sering agen berjalan, selesai, dan gagal, di semua proyek. Itu hanya angka: pesan dan berkas proyek klien tetap berada di proyek itu.

## Untuk yang menjalankan Saqina

Agen berjalan di antrean latar belakang. Antrean dikerjakan setelah setiap permintaan, dan panggilan terjadwal ke `/api/cron/executions` menangkap sisanya. Jadwalnya, dan apa yang dilakukan ketika sebuah eksekusi tampak macet, ada di `docs/runbook.md` di repositori.
