# Pretty Basic — PPIC System · Build Spec untuk Claude Code

> **Cara pakai file ini:** Taruh file ini dan `mockup-reference.html` di root folder project kosong, lalu jalankan Claude Code dengan prompt:
>
> *"Baca `PRETTY_BASIC_PPIC_SPEC.md` dan `mockup-reference.html`. Bangun aplikasi sesuai spec ini dari awal sampai selesai, ikuti urutan di Bagian 14. Tampilan harus sama persis dengan mockup. Jangan berhenti sampai semua checklist di Bagian 15 lolos."*

---

## Daftar Isi

1. Ringkasan Produk
2. Tech Stack
3. Login & Keamanan
4. Design System (wajib sama dengan mockup)
5. Layout & Navigasi
6. Halaman-halaman (detail per halaman)
7. Database Schema (Supabase / Postgres)
8. Logic PPIC (rumus lengkap + contoh angka)
9. Barang Masuk & Barang Keluar (multi-SKU)
10. Upload Excel (format, validasi, preview)
11. Batch Produksi
12. Seed Data & Import Awal
13. Struktur Folder
14. Urutan Pengerjaan
15. Acceptance Checklist
16. Hal yang TIDAK boleh dilakukan

---

## 1. Ringkasan Produk

Web app internal untuk **PPIC (Production Planning & Inventory Control)** brand fashion **Pretty Basic**. Tujuannya:

- Tahu **stock real-time** setiap SKU (produk × warna × size).
- Tahu **kapan harus restock / produksi ulang** dan **berapa qty-nya**, berdasarkan forecast penjualan.
- Admin mencatat **Barang Masuk** (produksi selesai, retur, adjustment) dan **Barang Keluar** (sales, damage, giveaway, adjustment) — secara manual multi-SKU atau lewat **upload Excel**.
- Mencegah stock habis untuk SKU laris (Ranking A) dan mencegah overstock/deadstock.

Pengguna: admin internal (1 akun dulu). Bahasa UI: **Bahasa Indonesia**. Desktop landscape (min-width 1280px), tidak perlu versi mobile.

**Konsep penting:** pencatatan **bukan per pesanan**. Satu "catatan" (dokumen) = satu kejadian (misal "Rekap sales Shopee 17 Okt" atau "Batch produksi 034 selesai") yang berisi **banyak SKU sekaligus**. Tidak ada field nomor order.

---

## 2. Tech Stack

| Bagian | Pilihan |
|---|---|
| Framework | **Next.js 14** (App Router) + **TypeScript** (strict) |
| Styling | **Tailwind CSS** dengan design token di Bagian 4 |
| Komponen UI | **shadcn/ui** (Dialog, Popover, Command untuk combobox, Select, Checkbox, Toast) — di-styling ulang supaya sama dengan mockup |
| Tabel | **@tanstack/react-table** (sort, filter, pagination, row selection) |
| Database & Auth | **Supabase** (Postgres + Supabase Auth email/password) via `@supabase/ssr` |
| Excel | **exceljs** (parse upload + generate template & export) |
| Validasi | **zod** |
| Tanggal | **date-fns** + `date-fns-tz`, timezone **Asia/Jakarta** |
| Test | **vitest** untuk logic PPIC |
| Font | **Plus Jakarta Sans** (Google Fonts via `next/font/google`) |
| Hosting | **Vercel** |

Semua angka diformat `id-ID` (titik ribuan, koma desimal: `1.047`, `128,5`). Tanggal tampil seperti `Sabtu, 17 Oktober 2026` dan di tabel `17 Okt 2026`.

---

## 3. Login & Keamanan

### Akun admin awal
- **Email:** `admin@prettybasic.id`
- **Password:** `pretty123`

Akun **dibuat lewat seed script** (`scripts/seed-admin.ts`) yang membaca env var, **bukan di-hardcode di source code**:

```env
# .env.local  (JANGAN di-commit — pastikan .env* ada di .gitignore)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
SEED_ADMIN_EMAIL=admin@prettybasic.id
SEED_ADMIN_PASSWORD=pretty123
SEED_ADMIN_NAME=Jose Putra
```

Seed script memakai `supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name } })`. Kalau user sudah ada, skip (idempotent).

### Aturan auth
- **Public sign-up dimatikan** (Supabase Dashboard → Auth → Providers → Email → disable "Allow new users to sign up"). Tulis instruksi ini di README.
- Semua route selain `/login` dilindungi `middleware.ts` → redirect ke `/login` kalau belum login.
- Setelah login → redirect ke `/ppic`.
- Tombol **Logout** di sidebar footer (icon keluar di sebelah nama user).
- Nama & role di sidebar footer diambil dari `user_metadata.full_name` (fallback: "Admin") dan role "Owner".
- **Row Level Security aktif di semua tabel**: policy `authenticated` boleh select/insert/update; delete hanya lewat fungsi yang melakukan soft-delete (void).
- Service role key **hanya** dipakai di script seed & server action tertentu, tidak pernah dikirim ke browser.
- Tambahkan halaman kecil **Ganti Password** (di menu user di sidebar footer) memakai `supabase.auth.updateUser({ password })`. Di README beri catatan: ganti password `pretty123` setelah login pertama.

### Halaman Login (`/login`)
- Background `--bg`, card putih di tengah (width 400px, radius 16px, padding 32px, border `--line`).
- Logo box "PB" (navy, 48×48, radius 12) + "Pretty Basic" + subtitle "PPIC System".
- Field Email, Password (dengan toggle lihat password), tombol **Masuk** (navy full-width).
- Error message merah di bawah form: "Email atau password salah."
- Loading state di tombol saat submit.

---

## 4. Design System (wajib sama dengan mockup)

`mockup-reference.html` adalah **sumber kebenaran visual**. Buka file itu, samakan warna, ukuran font, radius, spacing, dan komponen. Token di bawah diambil langsung dari mockup.

### 4.1 Warna (masukkan ke `tailwind.config.ts` → `theme.extend.colors`)

```ts
colors: {
  bg: '#F7F8FA',
  white: '#FFFFFF',
  ink: { DEFAULT: '#0F172A', 2: '#1E293B', 3: '#475569' },
  grey: { 1: '#64748B', 2: '#94A3B8', 3: '#CBD5E1' },
  line: { DEFAULT: '#E2E8F0', 2: '#F1F5F9' },
  primary: { DEFAULT: '#1E3A5F', 2: '#2563EB', tint: '#EFF6FF', hover: '#16304F' },
  pos: { DEFAULT: '#16A34A', tint: '#DCFCE7', text: '#166534' },
  warn: { DEFAULT: '#EA580C', tint: '#FFEDD5', text: '#9A3412' },
  neg: { DEFAULT: '#DC2626', tint: '#FEE2E2', text: '#991B1B' },
  yellow: { DEFAULT: '#CA8A04', tint: '#FEF9C3', text: '#854D0E' },
  purple: { DEFAULT: '#7C3AED', tint: '#EDE9FE', text: '#6B21A8' },
}
```

### 4.2 Tipografi
- Font: **Plus Jakarta Sans**, weight 400/500/600/700/800. Base 14px, line-height 1.5, antialiased.
- Page title: 24px / 700 / letter-spacing −0.02em
- Page subtitle: 13.5px / grey-1
- Panel title: 15px / 700
- Panel subtitle: 12.5px / grey-1
- Stat label: 10.5px / 700 / UPPERCASE / letter-spacing 0.08em / grey-1, dengan **dot 6px** berwarna di depannya
- Stat value: 28px / 800 / letter-spacing −0.03em
- Table header: 10.5px / 700 / UPPERCASE / letter-spacing 0.06em / grey-1 / background `bg`
- Table body: 13px; angka pakai `font-variant-numeric: tabular-nums` dan rata kanan
- Form label: 11px / 700 / UPPERCASE / grey-1

### 4.3 Komponen
| Komponen | Spesifikasi |
|---|---|
| Stat card | putih, border `line`, radius 14px, padding 18×20 |
| Panel | putih, border `line`, radius 14px, padding 20×22, margin-bottom 16 |
| Tombol primary | navy `#1E3A5F`, teks putih, radius 10px, padding 9×18, 13px/600 |
| Tombol biru | `#2563EB` (dipakai untuk "Buat Batch Produksi") |
| Tombol hijau | `#16A34A` (Barang Masuk) · Tombol merah `#DC2626` (Barang Keluar) |
| Tombol secondary | putih, border `line`, hover border `grey-3` |
| Filter chip | pill radius 100px; aktif = navy solid teks putih; berisi count bubble |
| Search input | radius 10px, icon kaca pembesar di kiri, width 280px |
| Badge status | pill radius 100px, 11px/700, warna tint + text (lihat 4.4) |
| Ranking badge | kotak 22×22 radius 6: **A** = navy solid putih, **B** = `#DBEAFE` teks navy, **C** = `line-2` teks grey |
| Modal | overlay `rgba(15,23,42,0.5)`, card putih radius 16, padding 28×32, max-width 820 (wide: 980), tombol ✕ kotak 32px di kanan atas, footer actions dipisah border-top |
| Info banner | bg `primary-tint`, border `#DBEAFE`, radius 10, padding 12×16 (varian hijau untuk logic produk baru) |
| Progress bar kapasitas | track 60×5px radius full, isi warna sesuai status |

### 4.4 Warna status (harus konsisten di seluruh app)
| Status | Badge |
|---|---|
| HABIS | neg (merah) |
| PRODUKSI | warn (oranye) |
| AMAN | pos (hijau) |
| OVERSTOCK | yellow |
| SLOW MOVING | purple |
| DEADSTOCK | purple |
| STOP | grey |
| BARU | primary-tint (biru muda) — produk < 7 hari, belum ada forecast |

Tipe mutasi: Produksi = hijau, Retur = yellow, Adjustment = grey, Transfer = biru, Sales = biru (info), Damage = oranye, Giveaway = purple.

---

## 5. Layout & Navigasi

### Sidebar (kiri, fixed)
- Width **240px**, bisa **di-collapse ke 68px** (icon-only) lewat tombol bulat 28px yang menempel di tepi kanan sidebar (icon chevron, berputar 180° saat collapsed). Transisi 0.22s.
- Status collapse disimpan di `localStorage` (bungkus try/catch).
- Saat collapsed: label & section title hilang, hover icon → tooltip gelap berisi nama menu.
- Item aktif: bg `primary-tint`, teks navy, border-left 3px navy.
- Badge merah di "Rekomendasi Produksi" = jumlah SKU status HABIS + PRODUKSI.

Struktur menu:

```
[PB] Pretty Basic / PPIC System

PPIC
  📦 Rekomendasi Produksi   (badge merah)   → /ppic
  ▦  Stock Live                              → /stock
  ↓  Barang Masuk                            → /barang-masuk
  ↑  Barang Keluar                           → /barang-keluar
  🏭 Batch Produksi                          → /batch

ANALISIS
  📈 Ringkasan Produk                        → /ringkasan
  ⇄  Riwayat Mutasi                          → /mutasi

PENGATURAN
  🏷  Master SKU                             → /master-sku
  ⚙  Parameter PPIC                          → /parameter

[J] Jose Putra · Owner        [ganti password] [logout]
```

Pakai icon **lucide-react** (Box, Table, ArrowDown, ArrowUp, Factory, LineChart, ArrowLeftRight, Tags, Settings, LogOut, KeyRound).

### Header halaman
Kiri: judul + subtitle. Kanan: pill tanggal hari ini (`Sabtu, 17 Oktober 2026`, timezone Jakarta).

### Area konten
`padding 28px 36px`, background `bg`. Pola setiap halaman: **Header → Stat cards (mini dashboard) → Panel berisi toolbar + tabel**. Usahakan konten utama muat di layar tanpa scroll berlebihan; tabel panjang pakai pagination (25 baris/halaman, bisa pilih 50/100).

---

## 6. Halaman-halaman

### 6.1 `/ppic` — Rekomendasi Produksi (halaman default)

**Subtitle:** "Forecast berdasarkan bobot 3 bulan terakhir · Lead time {lead_time} hari"

**Stat cards (6 kolom):** Habis · Produksi · Aman · Overstock · Slow/Dead (slow+dead) · Total Saran Produksi (pcs, sub: "Dari N SKU prioritas"). Klik stat card = set filter status.

**Panel "Daftar SKU — Status PPIC"**
- Subtitle menjelaskan ranking: "**Ranking A** = top 70% penjualan · **B** = 20% berikutnya · **C** = 10% sisanya"
- Tombol kanan: **Export Excel** · **Buat Batch Produksi (N)** (biru, N = jumlah baris dicentang; jika 0 → toast "Pilih minimal 1 SKU dulu").
- Toolbar: search (SKU/produk/warna) · chip status dengan count (Semua, Habis, Produksi, Aman, Overstock, Slow/Dead, Baru) · dropdown Ranking (Semua/A/B/C) · dropdown Produk.
- Kolom tabel: ☐ · Produk/SKU (nama tebal + kode SKU abu di bawahnya) · Ranking · Forecast/bln · Min · Max · Stok · Produksi (qty sedang diproduksi) · Hari Cover · Status · Saran.
- Warna angka stok: merah jika 0, oranye jika ≤ Min.
- Default sort: prioritas status (HABIS → PRODUKSI → AMAN → OVERSTOCK → SLOW/DEAD → STOP → BARU), lalu Ranking A→C, lalu Saran terbesar.
- Default tercentang: tidak ada. Ada tombol kecil "Centang semua HABIS & PRODUKSI".
- Klik baris → **Modal SKU Detail** (bukan drawer samping).

**Modal SKU Detail** (pop-up tengah)
- Eyebrow "PPIC DETAIL", judul nama SKU, sub "SKU: KODE · Ranking A" (+ label "(override)" kalau ranking di-override).
- Grid 3×2: Stock Sekarang · Min Stock · Max Stock · Forecast/Bulan · Hari Cover · Saran Qty.
- Baris kecil: "Penjualan H-3 / H-2 / H-1 / Bulan berjalan: 39 · 76 · 75 · 37" + "Rumus forecast: bobot normal / 2 bulan / prorata mingguan".
- Dropdown **Override Ranking** (Otomatis / A / B / C) → simpan ke `skus.rank_override`.
- Tombol hijau **+ Barang Masuk** & merah **− Barang Keluar** (buka modal dengan SKU ini sudah terisi di baris pertama).
- "Riwayat Mutasi 30 Hari": list tanggal · tipe + catatan · qty (+hijau/−merah) · saldo berjalan.

### 6.2 `/stock` — Stock Live
- Stat cards (5): Total SKU (sub: dari N produk) · Total Stock pcs (sub: nilai Rp jika `unit_cost` ada) · Masuk 7 Hari · Keluar 7 Hari · Net Movement.
- Tombol: **+ Barang Masuk** · **− Barang Keluar**.
- Toolbar: search · chip (Semua, Stok = 0, Stok 1–10, Stok > 10) · sort (Stock terendah/tertinggi/nama).
- Kolom: Produk/SKU · Ranking · Stock · Min · Max · % Kapasitas (progress bar: stock/max, label %; >100% warna yellow) · Masuk 7d · Keluar 7d · Status.
- Klik baris → Modal SKU Detail yang sama.

### 6.3 `/barang-masuk` & 6.4 `/barang-keluar`
Detail di **Bagian 9**. Ringkasnya:
- Stat cards (4): Hari Ini · 7 Hari · Bulan Ini · (Masuk: Batch Pending) / (Keluar: Damage bulan ini + % dari sales).
- Tombol: **Upload Excel** (secondary dengan icon upload) · **+ Catat Barang Masuk** (hijau) / **− Catat Barang Keluar** (merah).
- Toolbar: search · chip tipe · date range (default awal bulan s/d hari ini).
- Tabel **1 baris = 1 catatan**: Tanggal (+ jam di bawah) · Tipe (badge) · Ref Batch (masuk) / Channel (keluar) · **SKU dalam Catatan** ("7 SKU" tebal + "Solea Mini Skort, Polly Tanktop, +4 lainnya") · Total Qty (+/−) · Catatan · Admin · Sumber (Manual/Excel badge kecil).
- Klik baris → **Modal Detail Catatan**: header info + tabel semua SKU & qty + tombol **Batalkan Catatan** (void, wajib isi alasan, konfirmasi).

### 6.5 `/batch` — Batch Produksi
- Stat cards (4): Batch Aktif · Pcs Sedang Diproduksi · Selesai Bulan Ini · Estimasi Selesai Terdekat.
- Tabel: No Batch · Konveksi · Tanggal Kirim · Est. Selesai · Jumlah SKU · Qty Rencana · Qty Diterima · Progress (bar %) · Status.
- Klik baris → modal detail batch per SKU (rencana vs diterima) + tombol **Terima Barang** (buka modal Barang Masuk tipe Produksi dengan ref batch & semua SKU sisa terisi) + **Tandai Selesai** + **Batalkan**.
- Detail di Bagian 11.

### 6.6 `/ringkasan` — Ringkasan per Produk
- Agregat semua SKU per produk. Urut forecast terbesar.
- Kolom: Produk · Jml Varian · **H-3 bln** · **H-2 bln** · **H-1 bln** · **Bln berjalan** · Forecast/bln · Stock · Habis · Produksi · Over/Slow/Dead · Saran Total.
- Header kolom bulan menampilkan nama bulan aslinya sebagai tooltip/sub-label kecil (misal "H-1 bln" dengan "Sep" kecil di bawahnya).
- Klik baris → expand/collapse menampilkan SKU-SKU produk itu.
- Tombol **Export Excel**.

### 6.7 `/mutasi` — Riwayat Mutasi
- Stat cards (4): Total Masuk Bulan Ini · Total Keluar Bulan Ini · Net · Jumlah Adjustment.
- Toolbar: search · chip (Semua/Masuk/Keluar) · date range · filter SKU (combobox).
- **Mode default:** timeline per catatan (seperti mockup). **Jika filter SKU dipilih:** tampil kartu stok SKU itu — per baris: tanggal, tipe, catatan, qty, **saldo berjalan**.

### 6.8 `/master-sku` — Master SKU
- Tabel: Produk · Warna · Size · Kode SKU · Tanggal Launch · Ranking (auto / override) · Harga Pokok (opsional) · Aktif.
- Tombol **+ Tambah SKU** (modal: pilih/ketik produk baru, warna, size, kode SKU auto-suggest `NAMAPRODUK-WARNA-SIZE` uppercase tanpa spasi, tanggal launch, harga pokok) · **Upload Excel Master SKU** · **Export**.
- SKU nonaktif tidak muncul di combobox & PPIC (tapi riwayat tetap ada).
- Kode SKU unik; validasi zod.

### 6.9 `/parameter` — Parameter PPIC
Dua panel berdampingan + satu panel referensi (lihat mockup):

**Panel kiri — Rumus Min & Max Stock**
- Info banner "RUMUS AKTIF" yang update live saat input diubah:
  `Min Stock = ⌈ Forecast/hari × 21 hari ⌉` dan `Max Stock = ⌈ Forecast/hari × 35 hari ⌉`
- Field: Min Stock cover berapa hari (default **21**) · Max Stock cover berapa hari (default **35**) · Lead Time Produksi hari (default **14**, dipakai untuk estimasi tanggal selesai batch) · MOQ per varian pcs (default **1**) · Pembulatan (default **Ke atas / CEILING**; opsi Ke bawah, Normal).
- Validasi: Max > Min.

**Panel kanan — Bobot Forecast**
- Bobot **H-3 Bulan** 20% · **H-2 Bulan** 30% · **H-1 Bulan** 50% (hint di bawah tiap field = nama bulan aktualnya, mis. "Juli 2026"). Validasi total = 100%.
- Bobot produk umur 2 bulan: **H-2 40%** · **H-1 60%** (total 100%).
- Info banner hijau "LOGIC PRODUK BARU" (teks persis seperti Bagian 8.3).
- Batas Overstock (× Max) default **1,5** · Minimal forecast agar layak produksi (pcs/bulan) default **6** · Hari tanpa penjualan untuk DEADSTOCK default **60** · Minimal umur produk sebelum ada forecast (hari) default **7** · Batas Ranking A (%) **70** · Batas Ranking B (%) **20**.
- Tombol **Reset ke Default** · **Simpan Parameter** (toast sukses; semua angka PPIC langsung pakai parameter baru).

**Panel bawah — Aturan Status PPIC** (tabel referensi: Status · Arti · Tindakan) — isi dari Bagian 8.6.

---

## 7. Database Schema (Supabase / Postgres)

Buat sebagai migration SQL di `supabase/migrations/0001_init.sql`.

```sql
create extension if not exists pgcrypto;

create type movement_direction as enum ('in', 'out');
create type movement_type as enum (
  'produksi', 'retur', 'adjustment_in', 'transfer_in',            -- masuk
  'sales', 'damage', 'giveaway', 'adjustment_out', 'transfer_out' -- keluar
);
create type sales_channel as enum ('shopee', 'tiktok', 'instagram', 'website', 'offline', 'lainnya');
create type batch_status as enum ('draft', 'in_production', 'done', 'cancelled');
create type rank_class as enum ('A', 'B', 'C');

-- ── Master ─────────────────────────────────────────
create table products (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table skus (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references products(id),
  code text not null unique,              -- contoh: SOLEASKORT-BLACK-XSS
  color text not null,
  size text not null,                     -- XS/S, S/M, M/L, All size
  launch_date date not null,              -- dipakai untuk logic produk baru
  rank_override rank_class,               -- null = pakai ranking otomatis
  unit_cost numeric(12,2),                -- opsional, untuk nilai stock
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index on skus(product_id);

create table konveksi (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  capacity_per_day int,
  is_active boolean not null default true
);

-- ── Batch produksi ─────────────────────────────────
create table production_batches (
  id uuid primary key default gen_random_uuid(),
  batch_no text not null unique,          -- BATCH-2026-035
  konveksi_id uuid not null references konveksi(id),
  sent_date date not null,
  est_done_date date,
  status batch_status not null default 'in_production',
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table production_batch_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references production_batches(id) on delete cascade,
  sku_id uuid not null references skus(id),
  qty_suggested int not null default 0,
  qty_planned int not null check (qty_planned > 0),
  unique (batch_id, sku_id)
);

-- ── Mutasi stock (dokumen + baris) ─────────────────
create table stock_documents (
  id uuid primary key default gen_random_uuid(),
  doc_no text not null unique,            -- IN-20261017-001 / OUT-20261017-001
  direction movement_direction not null,
  type movement_type not null,
  doc_date date not null,
  channel sales_channel,                  -- hanya untuk keluar
  batch_id uuid references production_batches(id),  -- hanya untuk masuk tipe produksi
  note text,
  source text not null default 'manual' check (source in ('manual', 'excel', 'seed')),
  voided_at timestamptz,
  void_reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint direction_matches_type check (
    (direction = 'in'  and type in ('produksi','retur','adjustment_in','transfer_in')) or
    (direction = 'out' and type in ('sales','damage','giveaway','adjustment_out','transfer_out'))
  )
);
create index on stock_documents(doc_date);
create index on stock_documents(type);

create table stock_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references stock_documents(id) on delete cascade,
  sku_id uuid not null references skus(id),
  qty int not null check (qty > 0),        -- selalu positif; arah dari direction
  unique (document_id, sku_id)
);
create index on stock_document_lines(sku_id);

-- ── Parameter (1 baris saja) ───────────────────────
create table ppic_parameters (
  id int primary key default 1 check (id = 1),
  min_cover_days int not null default 21,
  max_cover_days int not null default 35,
  lead_time_days int not null default 14,
  moq int not null default 1,
  rounding text not null default 'ceil' check (rounding in ('ceil','floor','round')),
  weight_h3 numeric not null default 20,
  weight_h2 numeric not null default 30,
  weight_h1 numeric not null default 50,
  weight2_h2 numeric not null default 40,
  weight2_h1 numeric not null default 60,
  overstock_multiplier numeric not null default 1.5,
  min_forecast_to_produce numeric not null default 6,
  deadstock_days int not null default 60,
  new_product_min_days int not null default 7,
  rank_a_pct numeric not null default 70,
  rank_b_pct numeric not null default 20,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
insert into ppic_parameters (id) values (1) on conflict do nothing;

-- ── Views ──────────────────────────────────────────
create view v_sku_stock as
select s.id as sku_id,
  coalesce(sum(case when d.direction = 'in' then l.qty else -l.qty end), 0)::int as stock
from skus s
left join stock_document_lines l on l.sku_id = s.id
left join stock_documents d on d.id = l.document_id and d.voided_at is null
group by s.id;

-- qty diterima per batch per SKU (dari barang masuk tipe produksi yang mereferensikan batch)
create view v_batch_received as
select d.batch_id, l.sku_id, sum(l.qty)::int as qty_received
from stock_documents d
join stock_document_lines l on l.document_id = d.id
where d.type = 'produksi' and d.batch_id is not null and d.voided_at is null
group by d.batch_id, l.sku_id;

-- qty sedang produksi per SKU = rencana - diterima, untuk batch berstatus in_production
create view v_sku_in_production as
select bl.sku_id,
  sum(greatest(bl.qty_planned - coalesce(r.qty_received, 0), 0))::int as in_production
from production_batch_lines bl
join production_batches b on b.id = bl.batch_id and b.status = 'in_production'
left join v_batch_received r on r.batch_id = bl.batch_id and r.sku_id = bl.sku_id
group by bl.sku_id;

-- penjualan per SKU per bulan (HANYA tipe 'sales' — damage/giveaway tidak dihitung ke forecast)
create view v_sku_monthly_sales as
select l.sku_id, date_trunc('month', d.doc_date)::date as month, sum(l.qty)::int as qty
from stock_documents d
join stock_document_lines l on l.document_id = d.id
where d.type = 'sales' and d.voided_at is null
group by l.sku_id, date_trunc('month', d.doc_date);
```

**RLS:** aktifkan di semua tabel; policy `to authenticated using (true) with check (true)` untuk select/insert/update. Tidak ada policy delete untuk `stock_documents` (pakai void). Views pakai `security_invoker = true`.

**Fungsi RPC atomik** (agar dokumen + baris tersimpan dalam 1 transaksi):

```sql
create or replace function create_stock_document(
  p_direction movement_direction, p_type movement_type, p_doc_date date,
  p_channel sales_channel, p_batch_id uuid, p_note text, p_source text,
  p_lines jsonb   -- [{ "sku_id": "...", "qty": 12 }, ...]
) returns uuid language plpgsql security invoker as $$
declare v_id uuid; v_prefix text; v_seq int; v_doc_no text;
begin
  if jsonb_array_length(p_lines) = 0 then raise exception 'Minimal 1 SKU'; end if;
  v_prefix := case when p_direction = 'in' then 'IN-' else 'OUT-' end || to_char(p_doc_date, 'YYYYMMDD');
  select count(*) + 1 into v_seq from stock_documents where doc_no like v_prefix || '-%';
  v_doc_no := v_prefix || '-' || lpad(v_seq::text, 3, '0');
  insert into stock_documents (doc_no, direction, type, doc_date, channel, batch_id, note, source, created_by)
  values (v_doc_no, p_direction, p_type, p_doc_date, p_channel, p_batch_id, p_note, p_source, auth.uid())
  returning id into v_id;
  insert into stock_document_lines (document_id, sku_id, qty)
  select v_id, (x->>'sku_id')::uuid, sum((x->>'qty')::int)   -- SKU duplikat digabung
  from jsonb_array_elements(p_lines) x group by (x->>'sku_id')::uuid;
  return v_id;
end $$;
```

Buat juga `void_stock_document(p_id uuid, p_reason text)` dan `create_production_batch(...)` dengan pola yang sama. Setelah Barang Masuk tipe produksi tersimpan, jika semua SKU di batch sudah diterima ≥ rencana → status batch otomatis `done`.

---

## 8. Logic PPIC (rumus lengkap)

Semua logic di `lib/ppic/` sebagai **pure function TypeScript** (tanpa akses DB) supaya bisa di-unit-test. Data mentah diambil dari views, lalu dihitung di server (server component / route handler). 270+ SKU masih ringan dihitung on-the-fly; tidak perlu tabel cache.

### 8.1 Definisi waktu
- "Hari ini" = tanggal sekarang di **Asia/Jakarta**.
- **Bulan berjalan** = bulan kalender hari ini (mis. Oktober 2026).
- **H-1** = bulan kalender sebelumnya (September 2026), **H-2** = Agustus 2026, **H-3** = Juli 2026.
- `days_live` = jumlah hari dari `launch_date` sampai hari ini (`differenceInCalendarDays(today, launch_date)`).

### 8.2 Penjualan bulanan yang dipakai
- Sumber: `v_sku_monthly_sales` (**hanya tipe `sales`**).
- **Bulan yang dihitung** untuk sebuah SKU = bulan H-3, H-2, H-1 yang **sudah ada SKU-nya** (bulan sebelum launch diabaikan).
- **Bulan launch yang tidak penuh** (launch di tengah bulan) → di-prorata ke sebulan penuh:
  `sales_bulan_itu ÷ hari_live_di_bulan_itu × jumlah_hari_bulan_itu`.
  Jika hari live di bulan itu < `new_product_min_days` (7) → bulan itu **tidak dihitung** (datanya terlalu sedikit).

### 8.3 Forecast per bulan (`forecast_month`)
Hitung `n` = jumlah bulan yang dihitung (dari 8.2) di antara H-3, H-2, H-1.

| Kondisi | Rumus | Teks di banner |
|---|---|---|
| `n = 3` | `w_h3×H3 + w_h2×H2 + w_h1×H1` (default 20/30/50%) | Umur ≥ 3 bulan: pakai bobot normal 20% + 30% + 50% |
| `n = 2` (H-2 & H-1) | `w2_h2×H2 + w2_h1×H1` (default 40/60%) | Umur 2 bulan: pakai H-2 (40%) + H-1 (60%) |
| `n = 1` (H-1 saja) | `H1` (100%) | Umur 1 bulan: pakai H-1 saja (100%) |
| `n = 0` dan `days_live ≥ 7` (launch di bulan berjalan) | **Prorata mingguan:** `sales_sejak_launch ÷ floor(days_live ÷ 7) × 4` | Umur 1–4 minggu: prorata (rata-rata sales per minggu × 4) |
| `n = 0` dan `days_live < 7` | **Tidak ada forecast** → status **BARU** | Umur < 1 minggu: belum ada forecast, tunggu 1 minggu dulu |

Catatan: untuk kasus prorata mingguan, `sales_sejak_launch` mengambil semua sales dari `launch_date` s/d hari ini. Contoh dari owner: 1 minggu laku 5 → sebulan 20.

- `forecast_day = forecast_month ÷ 30`
- Forecast disimpan desimal; di UI ditampilkan dibulatkan (tanpa desimal).

### 8.4 Min, Max, Hari Cover, Saran
```
round(x) = Math.ceil / Math.floor / Math.round sesuai parameter (default ceil)

min_stock   = round(forecast_day × min_cover_days)        // default 21 hari
max_stock   = round(forecast_day × max_cover_days)        // default 35 hari
available   = stock + in_production
hari_cover  = forecast_day > 0 ? floor(stock ÷ forecast_day) : null   // tampil "—" jika null
saran_qty   = status ∈ {HABIS, PRODUKSI}
              ? roundUpToMultiple(max(0, max_stock − available), moq)
              : 0
```
`roundUpToMultiple(x, m) = ceil(x / m) × m`.

### 8.5 Ranking A/B/C (Pareto, otomatis + override)
1. Ambil semua SKU aktif. Nilai = total sales **H-3 + H-2 + H-1** (qty).
2. Urutkan menurun. Hitung persentase kumulatif terhadap total.
3. Kumulatif ≤ `rank_a_pct` (70%) → **A**; ≤ `rank_a_pct + rank_b_pct` (90%) → **B**; sisanya → **C**. Pengecualian: SKU teratas selalu **A** (walaupun sendirian sudah > 70%), supaya kelas A tidak pernah kosong.
4. SKU dengan total 0 → **C**.
5. Jika `skus.rank_override` tidak null → pakai override (tampilkan penanda kecil "override").

Ranking hanya label prioritas (sort & highlight); **tidak mengubah rumus Min/Max**.

### 8.6 Status (evaluasi berurutan, ambil yang pertama cocok)
| Urutan | Status | Kondisi | Tindakan (untuk tabel referensi) |
|---|---|---|---|
| 1 | **BARU** | Tidak ada forecast (umur < 7 hari) | Tunggu data 1 minggu |
| 2 | **STOP** | `forecast_month < min_forecast_to_produce` **dan** stock = 0 | SKU tidak diproduksi lagi |
| 3 | **DEADSTOCK** | stock > 0 **dan** tidak ada sales dalam `deadstock_days` (60) hari terakhir **dan** `days_live ≥ deadstock_days` | Diskon / bundling / live selling |
| 4 | **SLOW MOVING** | `forecast_month < min_forecast_to_produce` dan stock > 0 | Jangan produksi ulang, habiskan stock |
| 5 | **HABIS** | stock = 0 | Produksi segera (prioritas 1), pertimbangkan pre-order |
| 6 | **PRODUKSI** | `available ≤ min_stock` | Buat batch produksi sebesar Saran minggu ini |
| 7 | **OVERSTOCK** | `stock > max_stock × overstock_multiplier` | Jangan produksi, pertimbangkan promo |
| 8 | **AMAN** | selain itu | Pantau di review berikutnya |

Catatan: SKU berstatus HABIS yang `in_production > 0` tetap HABIS, tapi saran dikurangi qty yang sedang diproduksi (sesuai rumus `available`).

### 8.7 Contoh angka (wajib dijadikan unit test di `lib/ppic/__tests__/ppic.test.ts`)
Parameter default. Hari ini = 2026-10-17.

**Contoh 1 — produk lama**
SKU launch 2026-01-10. Sales Jul 39, Agu 76, Sep 75, Okt (berjalan) 37. Stock 4, in production 0.
- forecast_month = 0,2×39 + 0,3×76 + 0,5×75 = 7,8 + 22,8 + 37,5 = **68,1**
- forecast_day = 68,1 ÷ 30 = 2,27
- min = ceil(2,27 × 21) = ceil(47,67) = **48**
- max = ceil(2,27 × 35) = ceil(79,45) = **80**
- available 4 ≤ 48 → **PRODUKSI**
- saran = 80 − 4 = **76**
- hari_cover = floor(4 ÷ 2,27) = **1**

**Contoh 2 — umur 2 bulan**
Launch 2026-08-01. Sales Agu 20, Sep 30. → forecast = 0,4×20 + 0,6×30 = **26**.

**Contoh 3 — launch di tengah bulan**
Launch 2026-08-15 (live 17 hari di Agustus, 31 hari). Sales Agu 10, Sep 30.
Agustus prorata = 10 ÷ 17 × 31 = 18,24 → n = 2 → forecast = 0,4×18,24 + 0,6×30 = **25,29**.

**Contoh 4 — produk baru bulan berjalan (prorata mingguan)**
Launch 2026-10-03 → days_live 14 → 2 minggu. Sales sejak launch 10 → forecast = 10 ÷ 2 × 4 = **20**.

**Contoh 5 — produk sangat baru**
Launch 2026-10-12 → days_live 5 < 7 → **BARU**, forecast kosong, min/max/saran "—".

**Contoh 6 — overstock**
forecast_month 21 → forecast_day 0,7 → max = ceil(24,5) = 25. Stock 62 > 25 × 1,5 = 37,5 → **OVERSTOCK**, saran 0.

**Contoh 7 — MOQ**
MOQ = 6, kebutuhan 76 → saran = ceil(76/6)×6 = **78**.

**Contoh 8 — ranking**
4 SKU dengan total sales 3 bulan: 700, 200, 60, 40 (total 1000). Kumulatif: 70%, 90%, 96%, 100% → **A, B, C, C**.

---

## 9. Barang Masuk & Barang Keluar (multi-SKU)

### 9.1 Modal "+ Catat Barang Masuk" (wide, 980px)
Header field (grid 3 kolom):
- **Tipe Barang Masuk** — combobox ketik+pilih: Produksi Selesai · Retur · Adjustment + (Stock Opname) · Transfer Masuk
- **Tanggal** — default hari ini
- **Ref Batch** — combobox batch berstatus `in_production` (hanya aktif & wajib jika tipe = Produksi Selesai). Saat dipilih → tabel SKU otomatis terisi semua SKU sisa batch itu (qty = rencana − sudah diterima), bisa diedit/hapus.

Field **Catatan** (opsional, 1 baris).

**Tabel SKU dalam Catatan:**
- Kolom: SKU (combobox) · Stock Sekarang (info, abu) · Qty (pcs) · hapus (✕).
- Default 1 baris kosong. Tombol **+ Tambah SKU** menambah baris. Menekan **Enter** di kolom Qty baris terakhir juga menambah baris baru dan fokus ke combobox baris baru (supaya input cepat pakai keyboard).
- Baris footer: **Total: N SKU · X pcs**.
- Minimal 1 baris; SKU duplikat → peringatan "SKU sudah ada di baris N" dan tidak boleh disimpan sebelum digabung.

Footer: kiri **Upload Excel** (pindah ke modal upload) · kanan **Batal** · **Simpan Barang Masuk** (hijau). Setelah simpan: toast "Barang masuk tersimpan · 7 SKU · +248 pcs", tabel & angka PPIC refresh.

### 9.2 Modal "− Catat Barang Keluar"
Sama dengan 9.1, bedanya:
- **Tipe Barang Keluar** — combobox: Sales · Damage / Reject · Giveaway / Marketing · Adjustment − (Stock Opname) · Transfer Keluar
- **Channel** — combobox: Shopee · TikTok Shop · Instagram · Website PB · Offline · Lainnya (wajib jika tipe = Sales; opsional selain itu)
- **Tidak ada** field nomor order.
- Validasi stock: jika qty > stock sekarang → baris ditandai merah + pesan "Melebihi stock (tersisa N)". Untuk tipe **Adjustment −** boleh lanjut; untuk tipe lain tampilkan dialog konfirmasi "Stock akan menjadi minus. Lanjutkan?" (data marketplace kadang lebih cepat dari pencatatan barang masuk).

### 9.3 Combobox (dipakai di semua pilihan: SKU, Tipe, Channel, Batch, Produk, Konveksi)
- Satu komponen reusable `<Combobox>` berbasis shadcn `Command` + `Popover`.
- **Bisa diketik**: ketikan langsung memfilter opsi (case-insensitive, cocok di mana saja dalam teks). Untuk SKU, pencarian mencocokkan **kode SKU + nama produk + warna + size** (mis. ketik "polly blue" → muncul POLLYTOP-BLUE-XSS & POLLYTOP-BLUE-SM).
- Opsi SKU tampil 2 baris: nama (tebal) dan kode SKU (abu kecil) + stock di kanan.
- Navigasi keyboard: ↑ ↓ Enter Esc. Maks 50 hasil ditampilkan; tampil "Tidak ditemukan" jika kosong.
- SKU nonaktif tidak muncul.

### 9.4 Tabel riwayat (1 baris = 1 catatan)
Lihat 6.3. "SKU dalam Catatan" = `{jumlah} SKU` + 3 nama produk unik pertama + `+N lainnya`. Catatan yang di-void tampil abu dengan badge "Dibatalkan" (filter default menyembunyikannya; ada toggle "Tampilkan yang dibatalkan").

---

## 10. Upload Excel

Tersedia di halaman Barang Masuk, Barang Keluar, dan Master SKU. Alurnya 3 langkah dalam 1 modal:

**Langkah 1 — Pilih file**
- Area drag & drop (border dashed 2px, radius 12) + link **Download Template**.
- Terima `.xlsx` dan `.csv`, maks 5 MB. Baca sheet pertama. Header dicocokkan **case-insensitive & abaikan spasi**.

**Langkah 2 — Preview & validasi**
- Tabel preview semua baris dengan kolom status: ✓ valid / ✗ error (alasan).
- Error yang dicek: SKU tidak ditemukan / nonaktif · Qty bukan bilangan bulat > 0 · Tipe tidak dikenal · Tanggal tidak valid · Channel kosong untuk Sales · Ref Batch tidak ditemukan.
- Ringkasan: "120 baris · 118 valid · 2 error". Tombol **Download baris error** (Excel berisi baris bermasalah + kolom alasan).
- Peringatan (bukan error): stock jadi minus.

**Langkah 3 — Import**
- Hanya baris valid yang diimport (tombol disable jika 0 valid).
- Baris **dikelompokkan jadi catatan**:
  - Barang Masuk → 1 catatan per kombinasi (Tanggal, Tipe, Ref Batch)
  - Barang Keluar → 1 catatan per kombinasi (Tanggal, Tipe, Channel)
  - SKU sama di 1 catatan → qty dijumlah.
- `source = 'excel'`. Toast: "Import selesai · 4 catatan · 118 baris · −312 pcs".

### Template Barang Masuk (`template-barang-masuk.xlsx`)
| Tanggal | Tipe | Ref Batch | SKU | Qty | Catatan |
|---|---|---|---|---|---|
| 2026-10-17 | Produksi | BATCH-2026-034 | SOLEASKORT-BLACK-ML | 45 | Konveksi GKS |
| 2026-10-17 | Retur | | COASTALTOP-WHITE-ML | 2 | Size tidak cocok |

Nilai Tipe yang diterima: `Produksi`, `Retur`, `Adjustment`, `Transfer`.

### Template Barang Keluar (`template-barang-keluar.xlsx`)
| Tanggal | Tipe | Channel | SKU | Qty | Catatan |
|---|---|---|---|---|---|
| 2026-10-17 | Sales | Shopee | POLLYTOP-BLUE-XSS | 2 | Rekap harian |
| 2026-10-17 | Damage | | COASTALTOP-GRAY-ML | 2 | Jahitan bolong |

Nilai Tipe: `Sales`, `Damage`, `Giveaway`, `Adjustment`, `Transfer`. Channel: `Shopee`, `TikTok`, `Instagram`, `Website`, `Offline`, `Lainnya`.

### Template Master SKU (`template-master-sku.xlsx`)
| Produk | Warna | Size | SKU | Tanggal Launch | Harga Pokok |
|---|---|---|---|---|---|

Upload master SKU = upsert berdasarkan kode SKU (produk baru dibuat otomatis).

Template dibuat dengan exceljs: header bold, baris header bg `#F1F5F9`, kolom diberi lebar yang enak dibaca, sheet kedua "Petunjuk" berisi daftar nilai Tipe/Channel yang valid. Kolom Tanggal format `yyyy-mm-dd`; parser juga menerima `dd/mm/yyyy` dan tanggal serial Excel.

### Export Excel
Tombol Export di PPIC, Stock Live, Ringkasan, Riwayat → download `.xlsx` sesuai filter yang sedang aktif, nama file `pretty-basic-{halaman}-{yyyy-mm-dd}.xlsx`.

---

## 11. Batch Produksi

1. Di `/ppic`, centang SKU → **Buat Batch Produksi (N)** → modal wide:
   - Info banner: "**3 SKU** terpilih · Total **104 pcs** · Estimasi selesai **31 Okt 2026**" (tanggal kirim + lead time; update live).
   - Field: No Batch (auto `BATCH-YYYY-NNN`, bisa diedit, unik) · Tanggal Kirim (default hari ini) · Konveksi (combobox, tampilkan kapasitas/hari; ada opsi "+ Tambah konveksi baru").
   - Tabel: SKU · Saran · **Qty Final** (editable, default = saran) · ✕. Tombol "+ Tambah SKU" (combobox) untuk SKU di luar centangan.
   - Catatan untuk konveksi.
   - **Kirim ke Konveksi** → batch `in_production`. Qty langsung masuk kolom "Produksi" di PPIC, sehingga status/saran SKU itu ter-update.
   - Opsi **Simpan sebagai Draft** (tidak dihitung ke in_production).
2. Saat barang jadi datang → Barang Masuk tipe Produksi dengan Ref Batch (lihat 9.1). Penerimaan boleh bertahap (partial).
3. Batch otomatis `done` saat semua SKU diterima ≥ rencana; atau manual **Tandai Selesai** (sisa yang belum diterima dianggap batal & tidak lagi dihitung in_production).
4. **Export PDF/Excel Surat Order** per batch (daftar SKU & qty untuk dikirim ke konveksi) — Excel cukup untuk versi pertama.

Seed konveksi: **Konveksi GKS** (60 pcs/hari), **Konveksi Nusa** (45 pcs/hari).

---

## 12. Seed Data & Import Awal

### 12.1 Script
- `scripts/seed-admin.ts` → buat user admin (Bagian 3).
- `scripts/seed-demo.ts` → data demo agar semua halaman terisi saat pertama dibuka:
  - Produk & SKU berikut (minimal), launch_date bervariasi supaya semua status & semua logic forecast terlihat:

| Produk | Warna × Size |
|---|---|
| Solea Mini Skort | Black, Blue teal, Broken white, Brown × XS/S, S/M |
| Coastal Longsleeve Top | Baby blue, Baby pink, Black, Broken white, Brown, Butter yellow, Gray × XS/S, S/M |
| Polly Tanktop | Black, Blue, Butter yellow, Mint, Pink, White × XS/S, S/M |
| Eloise Midi Skirt | Black, Brown, Two tone brown, White × All size |
| Monaco Linen Top | Black, Broken white, Butter yellow × XS/S, S/M |
| Lyn Off Shoulder Tee | Black, Broken white, Brown, Butter yellow, Denim × All size |
| Claudie Midi Skirt | Black, Broken white, Fuschia × XS/S, S/M |

  - Kode SKU format `{PRODUK}-{WARNA}-{SIZE}` (contoh `SOLEASKORT-BLACK-XSS`, `ELOISESKIRT-WHITE-AS`).
  - Riwayat sales harian 3–4 bulan terakhir (dokumen keluar tipe Sales per channel per hari, random tapi realistis), beberapa damage/giveaway, batch produksi selesai & 1 batch in_production, stock awal via Adjustment +.
  - Tambahkan 1 SKU launch 5 hari lalu (status BARU), 1 SKU launch 2 minggu lalu (prorata mingguan), 1 SKU launch 2 bulan lalu.
- Command: `npm run seed:admin`, `npm run seed:demo`, dan `npm run seed:reset` (hapus data demo; hanya jalan jika `ALLOW_RESET=true`).

### 12.2 Import data asli (opsional, untuk go-live)
Halaman **Master SKU → Upload Excel** untuk SKU, lalu **Barang Keluar → Upload Excel** untuk riwayat sales per bulan (boleh 1 baris per SKU per bulan dengan tanggal tanggal 15 bulan itu, tipe Sales, channel Lainnya), lalu **Barang Masuk → Adjustment** untuk stock awal hasil opname. Tulis langkah ini di README sebagai "Panduan Go-Live".

---

## 13. Struktur Folder

```
/app
  /(auth)/login/page.tsx
  /(app)/layout.tsx              ← sidebar + header + auth guard
  /(app)/ppic/page.tsx
  /(app)/stock/page.tsx
  /(app)/barang-masuk/page.tsx
  /(app)/barang-keluar/page.tsx
  /(app)/batch/page.tsx
  /(app)/ringkasan/page.tsx
  /(app)/mutasi/page.tsx
  /(app)/master-sku/page.tsx
  /(app)/parameter/page.tsx
  /(app)/akun/password/page.tsx
  /api/export/[type]/route.ts
  /api/template/[type]/route.ts
/components
  /layout  (Sidebar, SidebarToggle, PageHeader, DatePill)
  /ui      (shadcn + StatCard, Panel, Badge, RankBadge, FilterChip, SearchInput, Combobox, CapacityBar, InfoBanner)
  /stock   (StockDocumentModal, SkuLinesTable, ExcelUploadModal, DocumentDetailModal)
  /ppic    (PpicTable, SkuDetailModal, BatchModal)
/lib
  /supabase (server.ts, client.ts, middleware.ts)
  /ppic     (forecast.ts, minmax.ts, status.ts, ranking.ts, index.ts, __tests__/ppic.test.ts)
  /excel    (parse.ts, templates.ts, export.ts)
  format.ts  (angka & tanggal id-ID, timezone Jakarta)
  validators.ts (zod schema)
/supabase/migrations/0001_init.sql
/scripts (seed-admin.ts, seed-demo.ts, seed-reset.ts)
middleware.ts
README.md
.env.example
```

Server actions untuk semua mutasi (create document, void, create batch, update parameter, override ranking, upsert SKU). Setelah mutasi panggil `revalidatePath` untuk halaman terkait.

---

## 14. Urutan Pengerjaan

1. Init Next.js 14 + TS + Tailwind + shadcn/ui + font. Pasang token warna & tipografi (Bagian 4).
2. Supabase client SSR, migration SQL (Bagian 7), RLS, RPC.
3. Login, middleware, logout, ganti password, seed admin.
4. Layout: sidebar (termasuk collapse), header, date pill. Bandingkan dengan `mockup-reference.html`.
5. Komponen dasar: StatCard, Panel, Badge, RankBadge, FilterChip, SearchInput, Combobox, Modal, InfoBanner, tabel.
6. Master SKU (CRUD + upload) — supaya ada data.
7. `lib/ppic` + unit test semua contoh Bagian 8.7 (harus lulus sebelum lanjut).
8. Barang Masuk & Barang Keluar: modal multi-SKU, combobox, riwayat, detail, void.
9. Upload Excel (template, parse, preview, import, download error) + Export.
10. Halaman PPIC + modal SKU detail + override ranking.
11. Batch produksi (buat dari PPIC, terima barang, selesai).
12. Stock Live, Ringkasan, Riwayat Mutasi.
13. Parameter PPIC (live preview rumus, validasi).
14. Seed demo, README (setup lokal, env, deploy Vercel, panduan go-live, matikan sign-up, ganti password).
15. Jalankan `npm run build`, `npm run lint`, `npm test` — semua harus bersih. Cek visual setiap halaman vs mockup.

---

## 15. Acceptance Checklist

**Auth**
- [ ] Login `admin@prettybasic.id` / `pretty123` berhasil (setelah `seed:admin`), salah password → pesan error.
- [ ] Akses `/ppic` tanpa login → redirect `/login`. Logout berfungsi.
- [ ] Tidak ada password/secret di source code atau git; `.env.example` hanya berisi nama variabel.

**Tampilan**
- [ ] Warna, font, radius, spacing sama dengan `mockup-reference.html`.
- [ ] Sidebar collapse ke 68px dengan tooltip; status tersimpan setelah refresh.
- [ ] Detail SKU tampil sebagai **pop-up modal di tengah**, bukan drawer samping.
- [ ] Angka & tanggal format Indonesia; tanggal hari ini di header benar (Asia/Jakarta).

**Barang Masuk / Keluar**
- [ ] 1 catatan bisa berisi banyak SKU; tambah/hapus baris; total SKU & pcs muncul.
- [ ] Semua pilihan (SKU, tipe, channel, batch) berupa combobox yang bisa diketik untuk filter.
- [ ] Tidak ada field nomor order.
- [ ] Riwayat tampil 1 baris per catatan dengan ringkasan "N SKU · nama, +N lainnya".
- [ ] Void catatan mengembalikan stock.
- [ ] Upload Excel: template bisa di-download, preview menampilkan error per baris, hanya baris valid yang diimport, dikelompokkan jadi catatan.

**PPIC**
- [ ] Semua unit test Bagian 8.7 lulus.
- [ ] Ubah parameter (mis. Min 21 → 28) → Min/Max/Status/Saran di halaman PPIC ikut berubah.
- [ ] Label bobot memakai H-1/H-2/H-3 bulan (dengan hint nama bulan aktual).
- [ ] SKU umur < 7 hari berstatus BARU; umur 1–4 minggu memakai prorata mingguan.
- [ ] Ranking A/B/C otomatis; override dari modal SKU tersimpan dan terlihat.
- [ ] Tombol **Buat Batch Produksi** berfungsi; qty batch muncul di kolom Produksi; terima barang via Barang Masuk mengurangi kolom Produksi dan menambah Stok.

**Kualitas**
- [ ] `npm run build`, `npm run lint`, `npm test` tanpa error.
- [ ] Loading state (skeleton) & empty state ("Belum ada barang masuk. Catat yang pertama →") di setiap tabel.
- [ ] Toast sukses/gagal untuk setiap aksi simpan.

---

## 16. Hal yang TIDAK boleh dilakukan

- Jangan hardcode email/password atau Supabase key di kode.
- Jangan pakai drawer samping untuk detail — selalu modal tengah.
- Jangan buat input per nomor pesanan.
- Jangan hitung damage/giveaway/adjustment ke dalam forecast penjualan.
- Jangan hapus data mutasi secara permanen — pakai void.
- Jangan pakai font serif atau dekoratif; tetap Plus Jakarta Sans.
- Jangan ubah nama status, label menu, atau istilah (Barang Masuk, Barang Keluar, Saran, Ranking, H-1 bulan, dst.) tanpa instruksi.
