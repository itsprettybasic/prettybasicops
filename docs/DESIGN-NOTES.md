# Catatan Desain (wajib dibaca sebelum membuat halaman)

Permintaan owner: **"bikin yang bagus, jangan kampungan, simpel aja."**
Pakai struktur & token dari `docs/mockup-reference.html`, tapi eksekusinya bersih dan tenang:

- Layout setiap halaman: `PageHeader` → `StatGrid` + `StatCard` → `Panel` (toolbar + tabel `.data-table`).
- Pakai komponen yang sudah ada di `src/components/ui/*` — jangan bikin varian tombol/badge/warna baru.
- Tidak ada emoji, gradient, shadow tebal, atau warna di luar token di `src/app/globals.css`.
- Warna hanya untuk makna (status, masuk = hijau, keluar = merah). Angka biasa tetap `text-ink-2`.
- Angka di tabel: `className="num"` (rata kanan, tabular). Format pakai `src/lib/format.ts` (fmtInt, fmtSigned, fmtDate...).
- Teks UI Bahasa Indonesia, singkat. Istilah tetap: Barang Masuk, Barang Keluar, Saran, Ranking, H-1 bln, dst.
- Ranking pakai `RankBadge` (sudah didesain ulang: ringan, ring tipis). Status pakai `StatusBadge`.
- Detail selalu **modal di tengah** (`Modal`), bukan drawer.
- Semua pilihan pakai `Combobox` (bisa diketik). Filter chip pakai `FilterChip` dengan count.
- Setiap tabel: skeleton/empty state ("Belum ada ... Catat yang pertama →"), pagination 25/50/100 (`Pagination`).
- Toast (`sonner`) untuk setiap aksi simpan sukses/gagal.
