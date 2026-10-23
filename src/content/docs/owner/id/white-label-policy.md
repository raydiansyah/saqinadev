---
title: Kebijakan white label
description: Apa yang boleh diberi merek sendiri di portal client, apa yang tidak pernah disembunyikan, dan siapa yang memutuskan.
order: 3
updated: 2026-10-23
kind: policy
---

White label berarti agensi atau studio yang memakai Saqina menampilkan **portal client** dengan nama, logo, dan warnanya sendiri. Itu tidak mengubah siapa yang bertanggung jawab atas data, dan tidak boleh menyembunyikan hal yang dibutuhkan client untuk mempercayai portal.

**Status saat ini.** Pengaturan merek belum ada di produk: portal masih tampil sebagai Saqina Dev. Kebijakan ini sudah berlaku untuk setiap perubahan pada layar yang dilihat client, dan menjadi dasar fitur pengaturan merek ketika dibuat. Standar teknisnya ada di repository: `docs/standards/white-label.md`.

## Kunci: kapan white label terbuka

**White label terkunci secara default.** Ia hanya terbuka untuk satu organisasi dengan salah satu dari dua dasar, dan keduanya meninggalkan catatan tertulis:

1. **Paket berbayar** yang syaratnya mencakup white label. Catatannya menyebut kode paketnya.
2. **Perjanjian tertulis yang ditandatangani kedua pihak**, Saqina dan organisasi Anda (perjanjian reseller atau white label). Catatannya menyebut nomor referensi perjanjian, misalnya `AGR-2027-004`.

Hanya pemilik platform yang bisa membukanya, setelah salah satu dasar itu ada. Pembukaan tercatat di log audit, dan nomor referensinya terlihat oleh organisasi di **Pengaturan > White label**.

Ia **terkunci lagi** bila: paket atau perjanjian berakhir atau dilanggar, pemilik platform mencabutnya, atau tanggal akhirnya lewat (tanggal akhir itu sendiri masih terbuka; terkunci mulai hari berikutnya, misalnya setelah 27 Februari 2027). Mengunci tidak menghapus apa pun: portal kembali memakai merek Saqina bawaan, dan pengaturan merek disimpan untuk dipakai lagi bila dibuka kembali.

Selama terkunci, setiap dokumen tetap membawa logo Saqina bawaan sebagai kop dan Saqina sebagai pemilik layanan.

**Mengapa begini.** Dalam praktik umum white label adalah lisensi merek yang sempit dan dapat dicabut, diberikan lewat perjanjian atau paket tertentu, dengan tanda "powered by" hanya bila disepakati kedua pihak, dan semua merek penyedia dihapus ketika hubungan berakhir. Rujukan (ringkasan hasil pencarian, bukan nasihat hukum; contoh klausul dan panduan umum):

- [Perjanjian reseller white label WriteSea](https://writesea.com/reseller-agreement/): merek diterapkan per pesanan dengan biaya tertentu; tanda "powered by" hanya bila disepakati bersama.
- [Aber Law Firm, model perjanjian saluran SaaS](https://www.aberlawfirm.com/saas-reseller-agreement-and-saas-oem-agreement-models/): lisensi merek dibuat sempit dan dapat dicabut; waspada lisensi tanpa pengawasan.
- [ActiveCampaign, perjanjian mitra reseller](https://www.activecampaign.com/legal/reseller-partner-agreement): program white label dibuka lewat perjanjian yang disetujui.
- [Solv Legal, panduan perjanjian white label SaaS](https://solvlegal.com/blogs/white-label-saas-agreement-explained-2026/): hak merek, masa berlaku, dan penghapusan merek saat berakhir.
- [LicenseSaaS, hal yang diperiksa sebelum membeli white label](https://licensesaas.com/resources/white-label-saas-things-to-check-before-buying): rebrand penuh dibandingkan tanda "powered by" sebagian.

## Yang boleh diberi merek

- **Nama, logo, dan warna aksen portal.** Diatur per organisasi oleh owner atau admin, bukan oleh client.
- **Domain portal.** Boleh memakai domain milik organisasi setelah kepemilikannya dibuktikan lewat DNS. Tidak ada domain wildcard, dan cookie tidak dibagi antar domain.
- **Email ke client** (invoice, pengingat, persetujuan): nama dan logo pengirim. Email tetap dikirim dari domain pengirim platform kecuali organisasi memverifikasi domainnya sendiri (SPF dan DKIM).
- **Invoice dan dokumen untuk client:** kop, logo, nama hukum, dan nomor pajak **agensi**. Agensi adalah penerbitnya. Saqina tidak pernah disebut sebagai penjual.

## Yang tidak pernah disembunyikan atau diubah

- **Halaman masuk dan keamanan** bekerja sama persis: bentuk form, captcha, aturan kata sandi, dan kalimat error tidak berubah. Merek hanya mengganti warna dan logo.
- **Tautan privasi dan syarat** tetap ada. Portal menyebut agensi sebagai pengendali data dan Saqina sebagai pemroses.
- **Tidak boleh menyamar.** Organisasi tidak bisa tampil sebagai perusahaan lain. Nama tampilan dicocokkan dengan nama hukum organisasi.
- **Penanda AI tetap tampil.** Teks atau jawaban yang dibuat AI tetap diberi tanda di portal.
- **Cara melapor masalah** (kontak penyalahgunaan dan keamanan) selalu terlihat.
- **Area tim** (dashboard dan workspace project) selalu Saqina. Itu alatnya, bukan tampilan client.

## Keterpisahan

- Merek adalah data satu organisasi. Portal hanya membaca merek organisasinya sendiri; permintaan merek atau aset organisasi lain dijawab "tidak ditemukan".
- Logo divalidasi di server: jenis, ukuran, dan dimensi. SVG tidak pernah dimasukkan sebagai HTML, hanya ditampilkan sebagai gambar.
- Warna diperiksa kontrasnya (WCAG 2.1 AA) sebelum disimpan, supaya merek tidak membuat portal tak terbaca.
- Domain khusus dicatat di satu tempat dan dihapus bersama organisasi. Domain yang dilepas langsung berhenti melayani.

## Siapa yang memutuskan

- Hanya owner atau admin organisasi yang boleh mengubah merek atau domain. Setiap perubahan tercatat di log audit tanpa rahasia.
- Mengaktifkan merek adalah perubahan berisiko tinggi (identitas, domain, email) dan butuh peninjau manusia.
- Pemilik platform dapat menonaktifkan merek yang melanggar aturan ini. Portal kembali ke tampilan Saqina, dan tidak ada data yang dihapus.

## Daftar periksa untuk perubahan pada portal

- [ ] Area tim tidak berubah oleh pengaturan merek.
- [ ] Orang asing dan client organisasi lain tidak bisa membaca merek atau aset organisasi ini.
- [ ] Kontras warna merek diperiksa, dan layar berfungsi di 320, 768, dan 1280 px.
- [ ] Privasi, syarat, kontak penyalahgunaan, dan penanda AI tetap tampil.
- [ ] Email dan invoice menyebut agensi sebagai penerbit.
- [ ] Input logo dan domain divalidasi di server, dan perubahannya tercatat.
