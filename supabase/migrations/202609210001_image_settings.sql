create table public.image_settings (
 id boolean primary key default true check (id),
 responsive_images boolean not null default true,
 version integer not null default 0 check (version >= 0)
);
insert into public.image_settings(id) values(true);
alter table public.image_settings enable row level security;
revoke all on public.image_settings from anon, authenticated;
grant select on public.image_settings to authenticated;
create policy image_settings_read on public.image_settings for select to authenticated
 using (public.is_approved());

create function public.set_image_settings(data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare current_version integer;
begin
 if not public.is_approved() or public.current_role() is distinct from 'admin' then
  raise exception 'not_authorized';
 end if;
 if jsonb_typeof(data->'responsive_images') is distinct from 'boolean' then
  raise exception 'invalid_setting';
 end if;
 select version into current_version from public.image_settings where id=true for update;
 if (data->>'expected_version')::integer is distinct from current_version then
  raise exception 'stale_record';
 end if;
 update public.image_settings set responsive_images=(data->>'responsive_images')::boolean,
  version=version+1 where id=true;
end $$;
revoke execute on function public.set_image_settings(jsonb) from public, anon;
grant execute on function public.set_image_settings(jsonb) to authenticated;
