-- Daftar nama yang packing (mis. Lulu, Lala) — dipilih sebelum mulai rekam, bisa beda dari akun login.

alter table pack_settings add column if not exists packers text[] not null default '{}';
create index if not exists pack_records_packer_name_idx on pack_records (packer_name, created_at desc);

drop function if exists save_pack_record(uuid, text, text, text, timestamptz, timestamptz, int);

create or replace function save_pack_record(
  p_id uuid, p_resi text, p_marketplace text, p_status text,
  p_started_at timestamptz, p_finished_at timestamptz, p_duration_sec int,
  p_packer_name text default null
) returns pack_records
language plpgsql security definer set search_path = public as $$
declare v_role text := app_role(); v_rec pack_records; v_set pack_settings; v_resi text := upper(trim(p_resi));
        v_name text := nullif(trim(p_packer_name), '');
begin
  if v_role is null then raise exception 'Akun tidak punya akses packing'; end if;
  if p_status not in ('merekam', 'selesai', 'dibatalkan', 'dihentikan_otomatis', 'terputus') then
    raise exception 'Status tidak valid';
  end if;
  if v_name is not null and length(v_name) > 50 then raise exception 'Nama packing terlalu panjang'; end if;
  select * into v_set from pack_settings;

  select * into v_rec from pack_records where id = p_id for update;
  if found then
    if v_rec.packer_id <> auth.uid() then raise exception 'Bukan rekaman Anda'; end if;
    if v_rec.status <> 'merekam' then return v_rec; end if;  -- sudah final, abaikan kiriman ulang
  else
    insert into pack_records (id, resi, marketplace, started_at, status, packer_name, version)
    values (p_id, v_resi, p_marketplace, p_started_at, 'merekam',
            coalesce(v_name, (select full_name from profiles where id = auth.uid()), current_user_name()),
            1 + (select count(*) from pack_records where resi = v_resi and status <> 'dibatalkan'))
    returning * into v_rec;
  end if;

  if p_status <> 'merekam' then
    update pack_records set
      status = p_status,
      packer_name = coalesce(v_name, packer_name),
      finished_at = coalesce(p_finished_at, now()),
      duration_sec = greatest(0, coalesce(p_duration_sec, 0)),
      video_expires_at = case when p_status = 'dibatalkan' then null
                              else pack_expiry(coalesce(p_finished_at, now()), v_set.retention_days) end
    where id = p_id
    returning * into v_rec;
  end if;
  return v_rec;
end $$;

grant execute on function save_pack_record to authenticated;
revoke execute on function save_pack_record from anon;
