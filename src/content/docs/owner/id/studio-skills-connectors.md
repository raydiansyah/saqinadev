---
title: Studio, skill dan konektor
description: Mulai mengerjakan dari PRD yang disetujui, bekerja di Studio, generate PRD dengan Enhance, dan siapkan skill, konektor dan model agen.
order: 5
updated: 2026-10-29
---

Panduan ini membahas jalan dari PRD yang sudah disepakati sampai pekerjaan berjalan, serta pengaturan platform yang dipakai asisten dan agen di semua project.

## Generate PRD

Di halaman **PRD**, tekan **Generate PRD**. Form-nya punya satu isian per bagian, diisi dari PRD saat ini atau, kalau belum ada, dari interview project.

- **Enhance** membuat satu bagian lebih spesifik. Kalau model AI sudah disiapkan, model menulis ulang bagian itu mengikuti skill Superpowers *brainstorming*; kalau belum, Saqina merapikan teksnya dengan aturan dan tidak menambah isi baru.
- **Enhance semua bagian** memproses semuanya satu per satu.
- **Simpan sebagai PRD** menulis versi baru. Tanda tangan dihapus dan PRD kembali ke draft, jadi disetujui lagi sebelum agen bekerja berdasarkan PRD itu.

Setelah interview, kalau model sudah disiapkan, Saqina juga menyempurnakan PRD dan plan yang dibuat dengan skill Superpowers dan memberi nama project dari plan-nya. Dokumen yang disempurnakan menunggu di **Persetujuan**; tidak ada yang berubah sampai Anda setujui. Nama yang Anda ketik sendiri tidak pernah diganti.

![Form Generate PRD dengan satu isian per bagian dan tombol Enhance di bawahnya](/api/docs/assets/owner/studio-01-generate-prd.png)

## Kerjakan sekarang

Begitu PRD atau plan **disetujui**, atau perjanjian sudah ditandatangani kedua pihak, dokumen menampilkan **Kerjakan sekarang**.

- Kalau project dibangun di Saqina, setiap task yang masih terbuka diberikan ke agen tim yang perannya paling cocok, lalu agen mulai bekerja. Setiap hasil menjadi proposal di **Persetujuan**.
- Kalau project dibangun di luar Saqina, tombol ini hanya membuka Studio.

Menekan tombol lagi tidak memberikan satu task ke dua agen.

## Studio

Studio menempatkan chat di samping area kerja.

- **Plan** menampilkan milestone dan task. Saat Anda meminta plan lewat chat, area kerja pindah ke tab ini.
- **Agen** menampilkan agen yang sedang bekerja dan tautan ke setiap run.
- **Kode**, **Preview**, **Git** dan **Publish** menyusul berikutnya.

Kalau asisten kurang yakin maksud permintaan yang mengubah data, ia bertanya dulu di chat dan tidak melakukan apa pun sampai Anda menjawab **Ya, lanjutkan**.

![Studio: chat di kiri, area kerja dengan Plan, Agen dan tab yang menyusul di kanan](/api/docs/assets/owner/studio-02-studio.png)

## File dan konteks di chat

Di chat Studio (dan halaman Saqina):

- **Lampirkan** (ikon klip) menambahkan file: gambar, PDF, atau file teks seperti Markdown, CSV atau kode, maksimal 5 MB dan 5 file per pesan. File juga bisa diseret ke chat, atau gambar ditempel langsung. File teks dibaca ke dalam percakapan; gambar dan PDF hanya terbaca bila model AI project bisa melihatnya, dan kalau tidak, balasannya mengatakan begitu.
- **+ Konteks** memilih skill dan konektor untuk pesan-pesan berikutnya. Skill yang dipilih selalu memandu jawaban. Dengan konektor terpilih, Saqina memakai tool-nya untuk menjawab dan menampilkan hasil dari tool itu. Tool yang bisa mengubah sesuatu di luar Saqina menunggu persetujuan Anda lebih dulu.
- **Kelola konektor** di menu yang sama membuka pengaturan konektor, untuk owner platform dan admin project.

![Menu + Konteks dengan skill, konektor dan Kelola konektor](/api/docs/assets/owner/studio-05-chat-context.png)

File disimpan di penyimpanan privat dan hanya bisa dibuka anggota project.

## Skill dan konektor (owner platform)

Di **AI & Model**:

- **Skill**: metode kerja berformat SKILL.md yang dipakai di semua project. Superpowers sudah terpasang bawaan. Pasang yang lain dengan menempel SKILL.md atau menautkan ke GitHub, lalu pilih untuk apa skill itu dipakai. Saqina hanya membaca teks skill; tidak ada yang dijalankan dari skill.
- **Konektor**: server MCP yang dihubungkan sekali untuk semua project. Firecrawl, Exa dan Context7 cukup satu klik ditambah API key; server lain bisa ditambahkan sebagai MCP kustom. Tool yang menyatakan tidak mengubah apa pun langsung menyala; sisanya menunggu keputusan Anda. Key disimpan terenkripsi dan tidak pernah ditampilkan lagi.

![Skill di AI & Model, dengan Superpowers terpasang bawaan](/api/docs/assets/owner/studio-03-skills.png)

![Konektor di AI & Model: Firecrawl, Exa, Context7 dan server MCP kustom](/api/docs/assets/owner/studio-04-connectors.png)

## Model agen

Di halaman **Agent**, **Atur** memungkinkan Anda memilih model dari yang sudah disiapkan di AI & Model, atau **Otomatis**, yang mengikuti default project dan platform. Tidak ada isian untuk mengetik nama model.
