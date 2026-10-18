# Pretty Basic — PPIC System

Web operasional untuk stock, barang masuk/keluar, batch produksi, dan rekomendasi produksi (PPIC).

- **Online:** https://prettybasicops.vercel.app
- **Stack:** Next.js 15 (App Router) · Supabase (Postgres + Auth) · Vercel · Tailwind v4
- **Spec:** `docs/PRETTY_BASIC_PPIC_SPEC.md` · catatan desain: `docs/DESIGN-NOTES.md`

## Halaman

| Menu | Isi |
|---|---|
| Rekomendasi Produksi | Status PPIC per SKU (Habis/Produksi/Aman/…), ranking A/B/C, saran qty, buat batch |
| Stock Live | Stock real-time per SKU, + Barang Masuk / – Barang Keluar |
| Barang Masuk / Keluar | Riwayat catatan (1 catatan = banyak SKU), upload Excel, batalkan catatan |
| Batch Produksi | Batch di konveksi, terima barang sebagian/penuh, export surat order |
| Ringkasan Produk | Rekap per produk (semua warna & size) |
| Riwayat Mutasi | Timeline semua pergerakan stock + kartu stock per SKU |
| Master SKU | Tambah/edit SKU, upload Excel, nonaktifkan SKU |
| Parameter PPIC | Min/Max cover days, lead time, bobot forecast, batas ranking |

## Setup lokal

```bash
npm install
cp .env.example .env.local   # isi URL + publishable key Supabase
npm run dev                  # http://localhost:3000
```

Env yang dibutuhkan (lihat `.env.example`):

| Nama | Keterangan |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publishable key (`sb_publishable_…`) |
| `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` / `SEED_ADMIN_NAME` | Hanya untuk script seed lokal |
| `SUPABASE_SERVICE_ROLE_KEY` | Opsional, hanya lokal. **Jangan** pernah dipasang di Vercel/di-commit |

## Database

Skema lengkap ada di `supabase/migrations/0001_init.sql` (tabel, view, RLS, fungsi RPC).
Jalankan sekali di Supabase → SQL Editor. Uji lokal tanpa Supabase: `npm run test:migration`.

## Script

| Perintah | Fungsi |
|---|---|
| `npm test` | Unit test rumus PPIC & parser Excel |
| `npm run seed:demo` | Isi data contoh (8 produk, 58 SKU, ±4 bulan transaksi) |
| `npm run seed:reset` | Hapus data contoh (butuh `ALLOW_RESET=true` + service role key) |
| `npm run seed:admin` | Buat user admin (butuh service role key) |

Tanpa service role key, data contoh bisa dihapus dengan menjalankan `supabase/reset-demo.sql` di SQL Editor.

## Deploy

Setiap push ke branch `main` di GitHub otomatis di-deploy Vercel. Env di Vercel cukup
`NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Checklist sebelum dipakai sungguhan (go-live)

1. Hapus data contoh: jalankan `supabase/reset-demo.sql` di SQL Editor.
2. Masukkan SKU asli lewat **Master SKU → Upload Excel**.
3. Catat stock awal lewat **Barang Masuk → Adjustment +** (bisa upload Excel).
4. Ganti password admin: ikon kunci di kiri bawah sidebar.
5. Tambah user staf: Supabase → Authentication → Users → Add user (centang Auto Confirm).
   Pendaftaran publik sudah dimatikan, jadi hanya user yang dibuat admin yang bisa login.
