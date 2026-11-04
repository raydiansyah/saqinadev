# Caching permukaan publik untuk menurunkan beban Vercel

Tanggal: 2026-11-04
Status: disetujui, siap plan

## Masalah

Biaya Vercel naik di dua metrik: **Fast Origin Transfer** (byte keluar dari origin) dan **Fluid Active CPU** (waktu CPU saat fungsi merender). Penyebabnya satu: tidak ada satu pun response HTML yang mengirim `Cache-Control` yang bisa ditahan CDN, dan empat halaman publik dengan traffic terbesar dipaksa render ulang tiap request. Cloudflare free di depan hanya mem-proxy, jadi setiap kunjungan menembus ke origin.

Bukti dari kode (per 2026-11-04):

- `src/app/[locale]/(marketing)/services/page.tsx` dan `services/[slug]/page.tsx`: `export const dynamic = "force-dynamic"`.
- `next.config.ts` `headers()` hanya mengirim security headers ke `/:path*`; tidak ada `Cache-Control` publik di mana pun. Route API memang `no-store`/`private` dan itu benar.
- `src/proxy.ts` jalan di tiap page view (routing locale + cek cookie), menambah Fluid Active CPU.

## Prinsip klasifikasi

Satu aturan menentukan mana yang boleh di-cache CDN: **konten sama untuk semua orang dan tidak bergantung sesi.** Begitu sebuah route dibaca di balik `getActor()` (validasi sesi ke DB di `(app)/layout.tsx`) atau menampilkan data per-user/tenant, ia wajib tetap dinamis dan `no-store`. Meng-cache route seperti itu di shared cache berisiko menyerahkan data satu user ke user lain.

## Klasifikasi rute

Boleh di-cache publik:

- `/[locale]` (landing) — konten dari file.
- `/[locale]/themes` — tidak membaca DB.
- `/[locale]/services` dan `/[locale]/services/[slug]` — publik, dari DB, jarang berubah.
- `/[locale]/privacy`, `/[locale]/terms` — statis.
- `sitemap.ts`, `robots.ts`, `manifest.ts` — untuk crawler.

Wajib tetap dinamis, `no-store`, tidak pernah di shared cache:

- `(auth)/*` — form sesi.
- `(app)/dashboard/*` — di balik `getActor()`, data user.
- `(app)/project/[slug]/*` termasuk `studio`, `agents`, `assistant`, `tasks`, `plan`, `prd`, `memory`, dan seluruh turunannya — **state AI agentic orchestrator per-tenant yang hidup**. Ini kelas yang paling tidak boleh di-cache.
- `(portal)/portal/*` — data per-klien.
- `/api/*` — biarkan sebagaimana adanya (sudah benar).

## Perubahan

1. **Route segment config, halaman publik**
   - `services/page.tsx` dan `services/[slug]/page.tsx`: ganti `dynamic = "force-dynamic"` menjadi `export const revalidate = 3600` (ISR, 1 jam). Perubahan publikasi admin tampil paling lambat 1 jam kemudian — trade-off yang diterima.
   - `themes`, `privacy`, `terms`, landing: pastikan tidak `force-dynamic`; biarkan default static atau beri `revalidate` panjang.

2. **`Cache-Control` selektif di `next.config.ts`**
   Tambah entri `headers()` khusus path publik yang mengirim `public, s-maxage=<window>, stale-while-revalidate=<grace>` agar Cloudflare free menahannya. Path privat tidak disentuh. Titik paling sensitif: pola path harus tidak pernah mengenai `dashboard`, `project`, `portal`, `sign-in`, `sign-up`, `invite`, atau `/api`.

3. **Pengaman area privat**
   Tandai layout `(app)` dan `(portal)` sebagai dinamis (`export const dynamic = "force-dynamic"`) supaya studio/project tidak pernah terprerender atau ter-cache, apa pun perubahan default Next.js di masa depan.

4. **Panduan Cloudflare (dokumen)**
   Cloudflare free tidak meng-cache HTML secara default. Langkah: Cache Rule untuk path publik + "respect origin Cache-Control" + pastikan request publik tanpa cookie sesi. Ditulis di runbook.

## Bukan bagian dari pekerjaan ini (YAGNI)

- On-demand revalidation dari alur admin publish. User memilih cache dengan jeda.
- Perubahan apa pun pada route API.
- Refactor yang tidak terkait caching.

## Verifikasi

- `pnpm typecheck` lulus.
- `pnpm build` lulus; output build menunjukkan label render tiap route (static / ISR / dynamic). Halaman publik harus tidak lagi "dynamic"; project/studio/dashboard harus tetap dinamis.
- Konfirmasi `cf-cache-status: HIT` dan grafik Vercel setelah deploy — di luar jangkauan perubahan kode ini.
