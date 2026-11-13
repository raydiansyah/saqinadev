---
title: Pengingat pembayaran dan tanda tangan
description: Atur kapan Saqina mengingatkan Anda dan klien tentang invoice yang belum dibayar, perjanjian yang menunggu tanda tangan, dan perpanjangan pemeliharaan.
order: 3
updated: 2026-11-12
---

Pengingat berjalan sekali sehari dan tidak butuh tindakan setelah aturannya diatur. Buka **Pengingat** di dashboard.

![Aturan pengingat dikelompokkan per jenis, masing-masing dengan sakelar aktif dan mati](/api/docs/assets/owner/reminders-01-rules.png)

## Aturan

Setiap aturan menyebut berapa hari sebelum atau sesudah suatu tanggal ia berjalan dan siapa penerimanya.

- Invoice jatuh tempo: sebelum tanggal jatuh tempo, misalnya 7 dan 3 hari sebelumnya dan pada harinya.
- Invoice lewat jatuh tempo: sesudah tanggal jatuh tempo, misalnya 1 dan 7 hari sesudahnya.
- Perjanjian menunggu tanda tangan: setelah tim menyetujui perjanjian yang dibagikan dan klien belum menandatangani, misalnya 3 dan 7 hari sesudahnya.
- Perpanjangan pemeliharaan: sebelum paket pemeliharaan berakhir.

Setiap aturan dikirim ke tim, klien, atau keduanya. Klien hanya menerima pengingat selama portal terbuka untuk proyek itu. Matikan aturan untuk menghentikannya. Jika tugas harian sempat mati seminggu, yang terkirim adalah aturan terakhir yang berlaku, bukan satu pesan per hari yang terlewat. Pengingat yang sama tidak pernah dikirim dua kali untuk item yang sama.

## Ke mana pengingat sampai

Setiap pengingat muncul di notifikasi. Pengingat juga dikirim lewat email jika penyedia email sudah diatur. Aturan yang ditujukan ke klien bisa juga mengirim pesan WhatsApp ke nomor telepon klien: aktifkan **WhatsApp** di sebelahnya. Nomor diambil dari data klien dan dibaca dalam bentuk `0812...`, `+62 812...`, dan `62812...`. Klien tanpa nomor yang bisa dipakai dilewati, dan pelewatan itu dicatat.

WhatsApp belum punya penyedia yang terhubung, jadi untuk sekarang aturan yang memintanya dicatat sebagai dilewati di produksi.

## Jalankan sekarang

Tekan **Jalankan sekarang** untuk menjalankan tugas yang sama bagi organisasi Anda saat itu juga. Hasilnya menyebut berapa pengingat terkirim dan berapa yang sudah pernah dikirim.
