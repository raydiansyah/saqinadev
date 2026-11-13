---
title: Invoice, pembayaran, dan kwitansi
description: Tagih klien dari termin pembayaran atau baris buatan sendiri, catat pembayaran yang masuk, dan beri klien kwitansi bernomor untuk setiap pembayaran.
order: 1
updated: 2026-11-12
---

Penagihan ada di dalam proyek, di menu **Tagihan**. Satu proyek memuat jadwal pembayaran, invoice, dan riwayat pembayarannya. Semua angka di halaman dijumlahkan dari catatan itu.

## Membuat invoice

1. Di **Tagihan**, isi nilai proyek lalu bagi menjadi termin pembayaran (persentase atau nominal tetap, dengan tanggal jatuh tempo). Termin yang sudah punya invoice terkunci.
2. Buat draf invoice dari sebuah termin, atau tulis barisnya sendiri dengan deskripsi, jumlah, dan harga. Draf hanya terlihat oleh tim Anda.
3. Tekan **Terbitkan**. Invoice mendapat nomor seperti `INV-2026-001` dan terlihat oleh klien. Nomor terbit sekali dan tidak dipakai ulang, dan draf belum punya nomor.
4. Tekan **Tandai terkirim** jika Anda sudah mengirimnya sendiri. Klien juga melihatnya di portal dan menerima email dengan invoice dalam bentuk PDF.

Invoice yang belum punya pembayaran bisa dibatalkan. Jika sudah ada pembayaran, batalkan pembayarannya dulu.

## Mencatat pembayaran

Buka invoice yang sudah terbit di **Tagihan** lalu tekan **Catat pembayaran**. Isi jumlah, tanggal, metode, dan referensi seperti nomor transfer bank. Jumlah tidak boleh melebihi sisa tagihan. Status invoice berubah sendiri menjadi dibayar sebagian atau lunas.

![Riwayat transaksi dengan setiap pembayaran dan nomor kwitansinya](/api/docs/assets/owner/invoices-01-ledger.png)

## Kwitansi

Mencatat pembayaran langsung menerbitkan kwitansinya, bernomor seperti `KWT-2026-001`. Kwitansi menyalin jumlah, tanggal, metode, dan referensi dari pembayaran, dan menulis jumlahnya dengan huruf. Klien mendapat pemberitahuan, menerima kwitansi sebagai PDF lewat email, dan menemukannya di **Pembayaran** pada portal.

![Kwitansi dengan jumlah dalam huruf, invoice yang dibayar, dan penerbitnya](/api/docs/assets/owner/invoices-02-receipt.png)

Pakai **Cetak atau simpan sebagai PDF** atau **Unduh PDF** di halaman kwitansi atau invoice.

Pembayaran yang dicatat sebelum fitur kwitansi ada menampilkan **Terbitkan kwitansi** di riwayat. Tekan sekali untuk membuat kwitansinya.

## Memperbaiki kesalahan

Pembayaran tidak pernah dihapus. Tekan **Batalkan** pada pembayaran dan tulis alasannya. Barisnya tetap ada di riwayat dengan coretan, sisa tagihan dihitung ulang, dan kwitansinya ikut dibatalkan. Nomornya tidak dipakai lagi. Klien tidak lagi melihat kwitansi yang dibatalkan. Catat ulang pembayaran jika salah isi.

## Perlu diketahui

- Mata uang proyek tidak bisa diubah setelah ada invoice.
- Hanya owner dan admin yang bisa menerbitkan, membatalkan, atau mencatat pembayaran. Editor dan viewer hanya membaca.
- Penerbit pada invoice dan kwitansi adalah organisasi Anda. Saat white label terbuka, yang tercetak adalah nama hukum, NPWP, dan alamat Anda (lihat kebijakan white label).
