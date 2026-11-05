---
title: Pencarian semantik di Memory
description: Aktifkan pencarian berdasarkan makna untuk sebuah proyek, lihat apa yang dikirim dan ke siapa, pahami statusnya, dan matikan lagi.
order: 7
updated: 2026-11-05
---

Pencarian semantik menemukan memory atau potongan wiki berdasarkan maknanya, bukan hanya kata di dalamnya. Tanyakan "siapa yang bayar hosting" dan ia bisa menemukan memory "client menanggung tagihan Vercel", yang tidak punya satu kata pun yang sama dengan pertanyaan itu. Tanpa fitur ini, Memory mencari lewat kata dan pencocokan persis (nama, id, path file).

Fitur ini **mati** untuk setiap proyek sampai admin proyek mengaktifkannya. Pemilik platform yang menentukan model embedding yang dipakai.

## Apa yang dikirim, dan ke siapa

- **Dikirim:** teks memory dan potongan wiki yang sudah disetujui dan bisa dibaca seluruh proyek. Setiap teks dipotong pada 6000 karakter. Saat seseorang bertanya, pertanyaannya ikut dikirim.
- **Ke siapa:** penyedia embedding yang dipilih pemilik platform di AI & Model. Penyedia mengembalikan deretan angka (vektor) untuk setiap teks. Saqina menyimpan angka itu di samping memory dan memakainya untuk membandingkan makna.
- **Tidak disertakan:** item privat, item yang dibatasi untuk orang atau agent tertentu, item yang masih menunggu tinjauan, dan item yang sudah kedaluwarsa tidak di-embed. Bila sebuah item dijadikan privat saat proses pengindeksan sedang berjalan, dalam jeda yang sempit item itu masih bisa terkirim dalam proses tersebut; setelah itu ia tidak disimpan.
- **Tidak masuk log:** teks memory dan pertanyaan. Catatan pemakaian hanya menyimpan model, jumlah token, dan waktu.

## Langkah 1: pemilik platform memilih model embedding

Hanya pemilik platform yang melihat halaman ini.

1. Buka **AI & Model**.
2. Di bagian **Model embedding**, pilih satu model dari daftar. Daftar hanya berisi model yang bisa membuat embedding, dari endpoint kompatibel OpenAI atau Gemini. Anthropic tidak punya model embedding.
3. Tekan **Simpan model embedding**.

![Bagian Embedding model di AI & Model dengan satu model embedding terpilih dan tombol Save embedding model](/api/docs/assets/owner/semantic-01-embedding-model.png)

Bila daftar kosong, tambahkan dulu penyedia yang punya model embedding. Pilih **Tidak ada** lalu simpan untuk menghentikan pencarian semantik di seluruh platform; vektor yang tersimpan di setiap proyek lalu dihapus.

Mengganti model membuat setiap proyek yang memakai pencarian semantik meng-embed ulang teksnya. Sampai selesai, pencarian lebih bertumpu pada kata dan pencocokan persis.

## Langkah 2: admin proyek mengaktifkannya

1. Buka proyek, lalu **Memory**. Anda masuk ke **Ringkasan**.
2. Cari **Pencarian semantik** dan tekan **Aktifkan pencarian semantik**.
![Ringkasan Memory dengan baris Semantic search berstatus Off](/api/docs/assets/owner/semantic-02-overview-off.png)

3. Baca teks persetujuan: "Kirim teks proyek ke penyedia embedding?" Teks itu menyebut nama penyedia tujuan teks Anda dan mengulang apa yang ada di halaman ini. Bila pemilik platform kelak berganti ke penyedia lain, teks Anda dikirim ke penyedia itu tanpa permintaan persetujuan baru. Tekan **Aktifkan**.

![Dialog persetujuan untuk mengirim teks proyek ke penyedia embedding, dengan tombol Cancel dan Turn on](/api/docs/assets/owner/semantic-03-consent.png)

Saqina mencatat siapa yang mengaktifkan, kapan, dan versi teks persetujuan yang ia lihat. Pengindeksan berjalan di latar belakang.

## Arti setiap status

Baris **Pencarian semantik** di Ringkasan menampilkan **Aktif**, **Aktif, sedang diindeks: x dari y**, atau **Mati**. Mati punya dua varian: Mati biasa, dan Mati karena pemilik platform belum memilih model embedding.

| Yang Anda lihat | Artinya |
|---|---|
| **Aktif. Memory dan wiki juga dicari berdasarkan makna.** | Setiap item yang memenuhi syarat sudah punya vektor. |
| **Aktif, sedang diindeks: x dari y item siap.** | Saqina masih membuat vektor. Sampai selesai, item yang belum siap hanya ditemukan lewat kata dan pencocokan persis. |
| **Mati. Memory dicari lewat kata dan pencocokan persis.** | Sakelar dimatikan. |
| **Mati. Pemilik platform belum memilih model embedding.** | Sakelar mungkin aktif, tetapi tanpa model tidak ada yang dicari berdasarkan makna. |

**Degraded (menurun)** tidak pernah tampil di Ringkasan. Ia hanya muncul di hasil pencarian, termasuk yang diterima klien MCP, ketika pertanyaan tidak sempat di-embed tepat waktu dan jawabannya hanya memakai kata. Saat asisten atau agent mencari di memory, hasilnya juga menyebut apakah pencarian semantik dipakai: `on`, `off`, atau `degraded`. `degraded` berarti pencarian itu seharusnya memakai makna, tetapi penyedia embedding tidak menjawab dalam 0,9 detik atau mengembalikan galat. Jawabannya tetap benar untuk kata dan pencocokan persis; ia bisa melewatkan memory yang hanya bisa ditemukan lewat makna. Coba lagi nanti. Bila terus terjadi, beri tahu pemilik platform.

## Mematikannya

1. Buka **Memory** dan cari **Pencarian semantik**.
2. Tekan **Matikan pencarian semantik** lalu konfirmasi.

Mematikannya menghapus vektor proyek yang tersimpan dan menghentikan permintaan baru ke penyedia; permintaan yang sudah berjalan tidak bisa ditarik kembali. Pencarian kembali ke kata dan pencocokan persis. Memory dan halaman wiki itu sendiri tidak disentuh. Mengaktifkannya lagi mengindeks semuanya dari awal.

## Masalah umum

- **Tombol Aktifkan tidak terlihat.** Entah Anda bukan admin proyek (minta admin proyek), atau pemilik platform belum memilih model embedding. Ringkasan menyebutkannya dan tombolnya disembunyikan.
- **Halaman berkata "Pemilik platform belum memilih model embedding."** Minta pemilik platform mengerjakan langkah 1.
- **Terus di "Aktif, sedang diindeks".** Kemungkinan penyedia sedang gagal (kunci salah, kuota habis, model dihapus). Buka **Memory**, lalu **Pemrosesan**. Job bernama "Indeks untuk pencarian semantik" menunjukkan statusnya, misalnya "Akan dicoba lagi" atau "Gagal". Beri tahu pemilik platform, yang memeriksa penyedia di AI & Model. Sementara itu pencarian lewat kata tetap berjalan.
