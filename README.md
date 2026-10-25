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
| Stock Opname | Hitung fisik → stock sistem otomatis disesuaikan (Adjustment +/−) |
| Rekam Packing | Scan resi → rekam video packing → scan resi yang sama → video diupload (HP) |
| Riwayat Packing | Cari resi, filter tanggal/marketplace/petugas, putar & unduh video |
| Pengaturan Packing | Lama simpan video, durasi, kualitas, marketplace, ringkasan storage |
| Kelola Petugas | Buat akun petugas (username + password), role, aktif/nonaktif |

## Role

| Role | Akses |
|---|---|
| Admin | Semua menu |
| Supervisor | Menu Packing: semua rekaman + Pengaturan Packing |
| Petugas Packing | Rekam Packing + riwayat rekamannya sendiri |

Petugas login pakai **username** (di Supabase Auth tersimpan sebagai `<username>@petugas.prettybasic.id`, tidak pernah dikirimi email).
Akun dibuat admin di menu Kelola Petugas lewat Edge Function `pack-staff` (service role hanya ada di Supabase).

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

Skema ada di `supabase/migrations/` (urut 0001 → 0004). `0004_packing_storage.sql` butuh fitur Supabase
(storage, vault, pg_cron, pg_net) jadi dilewati oleh test lokal.
Jalankan sekali di Supabase → SQL Editor. Uji lokal tanpa Supabase: `npm run test:migration`.

## Rekam Packing — cara kerja

- Kamera belakang dipakai sekaligus untuk scan barcode (BarcodeDetector / ZXing) dan rekam (MediaRecorder: mp4 di iPhone, webm/mp4 di Android).
- Potongan video disimpan tiap detik di IndexedDB. Tab tertutup → saat dibuka lagi rekaman dikirim dengan status **Terputus**.
- Upload langsung dari browser ke bucket private `pack-videos` (progress + coba ulang otomatis, antre saat offline).
- Video diputar lewat signed URL 10 menit. Kedaluwarsa = jam selesai + lama simpan saat itu.
- Job harian 03.00 WIB (pg_cron → Edge Function `pack-cleanup`) menghapus file kedaluwarsa; catatan paket tetap ada.
- Pasang/perbarui di Supabase: `SUPABASE_ACCESS_TOKEN=sbp_… node scripts/deploy-packing.mjs`.

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
