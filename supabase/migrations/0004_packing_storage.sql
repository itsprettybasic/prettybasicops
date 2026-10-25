-- test:skip (butuh skema storage, vault, pg_cron, pg_net milik Supabase)
-- Storage video packing (private) + job hapus otomatis harian.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pack-videos', 'pack-videos', false, 52428800, array['video/mp4', 'video/webm'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Upload: user yang punya akses packing, nama file <tahun>/<bulan>/<resi>_<timestamp>.<ext>
create policy "pack video upload" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'pack-videos' and public.app_role() is not null
    and name ~ '^\d{4}/\d{2}/[A-Za-z0-9_-]+_\d+\.(mp4|webm)$'
  );
-- Lihat (signed URL): pemilik rekaman, atau admin/supervisor
create policy "pack video read" on storage.objects for select to authenticated
  using (
    bucket_id = 'pack-videos' and (
      owner = auth.uid()
      or exists (select 1 from public.pack_records r
                 where r.video_path = name and (r.packer_id = auth.uid() or public.is_pack_manager()))
    )
  );
-- Tidak ada policy update/delete: file hanya dihapus job harian (service role).

-- Secret untuk memanggil Edge Function pack-cleanup dari pg_cron
create extension if not exists pg_cron;
create extension if not exists pg_net;
select vault.create_secret(encode(extensions.gen_random_bytes(24), 'hex'), 'pack_cron_secret')
where not exists (select 1 from vault.secrets where name = 'pack_cron_secret');

create or replace function public.pack_cron_secret_ok(p_secret text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'pack_cron_secret' and decrypted_secret = p_secret)
$$;
revoke execute on function public.pack_cron_secret_ok from public, anon, authenticated;
grant execute on function public.pack_cron_secret_ok, public.pack_mark_stale to service_role;

-- Tiap hari 03.00 WIB (20.00 UTC)
select cron.unschedule('pack-cleanup-daily') where exists (select 1 from cron.job where jobname = 'pack-cleanup-daily');
select cron.schedule('pack-cleanup-daily', '0 20 * * *', $cron$
  select net.http_post(
    url := 'https://dfgujuuyndqjiecgvfjb.supabase.co/functions/v1/pack-cleanup',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'pack_cron_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  )
$cron$);
