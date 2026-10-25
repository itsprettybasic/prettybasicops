-- Rekam Packing + role user (admin / supervisor / petugas).
-- Admin: semua menu. Supervisor & petugas: hanya menu Packing.

-- ── Profil & role ──────────────────────────────────
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  username text not null unique,
  role text not null default 'petugas' check (role in ('admin', 'supervisor', 'petugas')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- User yang sudah ada sebelum fitur ini = admin
insert into profiles (id, full_name, username, role)
select u.id,
       coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), split_part(u.email, '@', 1)),
       split_part(u.email, '@', 1) || case when count(*) over (partition by split_part(u.email, '@', 1)) > 1
                                           then '-' || left(u.id::text, 4) else '' end,
       'admin'
from auth.users u
on conflict (id) do nothing;

-- Role user yang sedang login; null kalau belum punya profil atau dinonaktifkan.
create or replace function app_role() returns text
language sql stable security definer set search_path = public as $$
  select role from profiles where id = auth.uid() and is_active
$$;

create or replace function is_pack_manager() returns boolean
language sql stable as $$ select coalesce(app_role() in ('admin', 'supervisor'), false) $$;

alter table profiles enable row level security;
create policy "profile select" on profiles for select to authenticated
  using (id = auth.uid() or app_role() = 'admin');
-- Tambah/ubah profil hanya lewat Edge Function pack-staff (service role).

-- Menu stock/PPIC sekarang khusus admin (sebelumnya semua user login)
do $$
declare t text;
begin
  foreach t in array array['products','skus','konveksi','production_batches','production_batch_lines',
                           'stock_documents','stock_document_lines','ppic_parameters']
  loop
    execute format('drop policy if exists "auth select" on %I', t);
    execute format('drop policy if exists "auth insert" on %I', t);
    execute format('drop policy if exists "auth update" on %I', t);
    execute format('create policy "admin select" on %I for select to authenticated using (app_role() = ''admin'')', t);
    execute format('create policy "admin insert" on %I for insert to authenticated with check (app_role() = ''admin'')', t);
    execute format('create policy "admin update" on %I for update to authenticated using (app_role() = ''admin'') with check (app_role() = ''admin'')', t);
  end loop;
end $$;
drop policy if exists "auth delete draft lines" on production_batch_lines;
create policy "admin delete draft lines" on production_batch_lines for delete to authenticated
  using (app_role() = 'admin' and exists (select 1 from production_batches b where b.id = batch_id and b.status = 'draft'));

-- ── Pengaturan packing (satu baris) ────────────────
create table pack_settings (
  id boolean primary key default true check (id),
  retention_days int not null default 14 check (retention_days between 1 and 365),
  max_duration_sec int not null default 600 check (max_duration_sec between 30 and 3600),
  min_duration_sec int not null default 5 check (min_duration_sec between 0 and 120),
  quality text not null default 'hemat' check (quality in ('hemat', 'standar', 'tinggi')),
  marketplaces text[] not null default array['Shopee', 'TikTok Shop'] check (cardinality(marketplaces) >= 1),
  duplicate_warning boolean not null default true,
  record_audio boolean not null default false,
  storage_quota_gb numeric not null default 1 check (storage_quota_gb > 0),
  updated_at timestamptz not null default now(),
  updated_by_name text
);
insert into pack_settings default values;

alter table pack_settings enable row level security;
create policy "settings select" on pack_settings for select to authenticated using (app_role() is not null);
create policy "settings update" on pack_settings for update to authenticated
  using (is_pack_manager()) with check (is_pack_manager());

-- ── Catatan paket ──────────────────────────────────
create table pack_records (
  id uuid primary key default gen_random_uuid(),
  resi text not null check (length(resi) between 3 and 64),
  marketplace text not null,
  packer_id uuid not null default auth.uid() references auth.users(id),
  packer_name text not null default current_user_name(),
  version int not null default 1,          -- rekam ulang resi yang sama = versi berikutnya
  started_at timestamptz not null,
  finished_at timestamptz,
  duration_sec int check (duration_sec >= 0),
  status text not null default 'merekam'
    check (status in ('merekam', 'selesai', 'dibatalkan', 'dihentikan_otomatis', 'terputus')),
  video_path text unique,
  video_size bigint,
  video_mime text,
  video_uploaded_at timestamptz,
  video_expires_at timestamptz,
  video_deleted_at timestamptz,
  order_id text,                           -- tahap berikutnya: cocokkan dengan pesanan Shopee/TikTok
  created_at timestamptz not null default now()
);
create index pack_records_resi_idx on pack_records (resi);
create index pack_records_created_idx on pack_records (created_at desc);
create index pack_records_expires_idx on pack_records (video_expires_at) where video_deleted_at is null;
create index pack_records_packer_idx on pack_records (packer_id, created_at desc);

alter table pack_records enable row level security;
create policy "pack select" on pack_records for select to authenticated
  using (app_role() is not null and (packer_id = auth.uid() or is_pack_manager()));
-- Insert/update hanya lewat RPC di bawah (security definer + cek pemilik).

create table pack_cleanup_runs (
  id bigint generated always as identity primary key,
  ran_at timestamptz not null default now(),
  deleted_count int not null default 0,
  stale_count int not null default 0,
  note text
);
alter table pack_cleanup_runs enable row level security;
create policy "cleanup select" on pack_cleanup_runs for select to authenticated using (is_pack_manager());

-- ── RPC ────────────────────────────────────────────

-- Kedaluwarsa video = jam selesai + lama simpan yang berlaku saat itu.
create or replace function pack_expiry(p_finished timestamptz, p_days int) returns timestamptz
language sql immutable as $$ select p_finished + make_interval(days => p_days) $$;

-- Cek resi yang sudah pernah direkam (semua petugas) — hanya jumlah & waktu terakhir, tanpa detail.
create or replace function pack_resi_history(p_resi text)
returns table (record_count int, last_finished_at timestamptz, last_packer_name text)
language sql stable security definer set search_path = public as $$
  select count(*)::int, max(finished_at),
         (array_agg(packer_name order by finished_at desc nulls last))[1]
  from pack_records
  where app_role() is not null and resi = upper(trim(p_resi)) and status <> 'dibatalkan'
$$;

-- Simpan catatan paket (dipanggil saat selesai / dibatalkan / terputus). Idempotent per p_id,
-- supaya aman dikirim ulang dari antrean offline.
create or replace function save_pack_record(
  p_id uuid, p_resi text, p_marketplace text, p_status text,
  p_started_at timestamptz, p_finished_at timestamptz, p_duration_sec int
) returns pack_records
language plpgsql security definer set search_path = public as $$
declare v_role text := app_role(); v_rec pack_records; v_set pack_settings; v_resi text := upper(trim(p_resi));
begin
  if v_role is null then raise exception 'Akun tidak punya akses packing'; end if;
  if p_status not in ('merekam', 'selesai', 'dibatalkan', 'dihentikan_otomatis', 'terputus') then
    raise exception 'Status tidak valid';
  end if;
  select * into v_set from pack_settings;

  select * into v_rec from pack_records where id = p_id for update;
  if found then
    if v_rec.packer_id <> auth.uid() then raise exception 'Bukan rekaman Anda'; end if;
    if v_rec.status <> 'merekam' then return v_rec; end if;  -- sudah final, abaikan kiriman ulang
  else
    insert into pack_records (id, resi, marketplace, started_at, status, packer_name, version)
    values (p_id, v_resi, p_marketplace, p_started_at, 'merekam',
            coalesce((select full_name from profiles where id = auth.uid()), current_user_name()),
            1 + (select count(*) from pack_records where resi = v_resi and status <> 'dibatalkan'))
    returning * into v_rec;
  end if;

  if p_status <> 'merekam' then
    update pack_records set
      status = p_status,
      finished_at = coalesce(p_finished_at, now()),
      duration_sec = greatest(0, coalesce(p_duration_sec, 0)),
      video_expires_at = case when p_status = 'dibatalkan' then null
                              else pack_expiry(coalesce(p_finished_at, now()), v_set.retention_days) end
    where id = p_id
    returning * into v_rec;
  end if;
  return v_rec;
end $$;

-- Tandai video sudah terupload. Path harus <tahun>/<bulan>/<resi>_<timestamp>.<ext>.
create or replace function attach_pack_video(p_id uuid, p_path text, p_size bigint, p_mime text)
returns void language plpgsql security definer set search_path = public as $$
declare v_rec pack_records;
begin
  select * into v_rec from pack_records where id = p_id for update;
  if not found or v_rec.packer_id <> auth.uid() then raise exception 'Rekaman tidak ditemukan'; end if;
  if v_rec.status = 'dibatalkan' then raise exception 'Rekaman dibatalkan'; end if;
  if p_path !~ '^\d{4}/\d{2}/[A-Za-z0-9_-]+_\d+\.(mp4|webm)$' then raise exception 'Nama file tidak valid'; end if;
  update pack_records set video_path = p_path, video_size = p_size, video_mime = p_mime, video_uploaded_at = now()
  where id = p_id;
end $$;

-- Terapkan lama simpan sekarang ke video yang sudah ada (opsi terpisah di Settings).
create or replace function apply_pack_retention_to_existing() returns int
language plpgsql security definer set search_path = public as $$
declare v_days int; v_count int;
begin
  if not is_pack_manager() then raise exception 'Hanya admin/supervisor'; end if;
  select retention_days into v_days from pack_settings;
  update pack_records set video_expires_at = pack_expiry(finished_at, v_days)
  where video_deleted_at is null and finished_at is not null and status <> 'dibatalkan';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Ringkasan storage untuk halaman Settings.
create or replace function pack_storage_summary()
returns table (video_count int, total_bytes bigint, oldest_at timestamptz, last_cleanup_at timestamptz, last_cleanup_deleted int)
language sql stable security definer set search_path = public as $$
  select count(*)::int, coalesce(sum(video_size), 0)::bigint, min(finished_at),
         (select ran_at from pack_cleanup_runs order by ran_at desc limit 1),
         (select deleted_count from pack_cleanup_runs order by ran_at desc limit 1)
  from pack_records
  where is_pack_manager() and video_path is not null and video_deleted_at is null
$$;

-- Dipakai job harian (service role): tandai rekaman yang menggantung 'merekam' jadi 'terputus'.
create or replace function pack_mark_stale() returns int
language plpgsql security definer set search_path = public as $$
declare v_count int; v_set pack_settings;
begin
  select * into v_set from pack_settings;
  update pack_records set status = 'terputus',
         finished_at = started_at + make_interval(secs => v_set.max_duration_sec),
         duration_sec = v_set.max_duration_sec,
         video_expires_at = pack_expiry(started_at + make_interval(secs => v_set.max_duration_sec), v_set.retention_days)
  where status = 'merekam' and started_at < now() - interval '1 day';
  get diagnostics v_count = row_count;
  return v_count;
end $$;

grant execute on function app_role, is_pack_manager, pack_expiry, pack_resi_history, save_pack_record,
  attach_pack_video, apply_pack_retention_to_existing, pack_storage_summary to authenticated;
revoke execute on function pack_mark_stale from public, anon, authenticated;
revoke execute on function save_pack_record, attach_pack_video, apply_pack_retention_to_existing from anon;
