create table public.profile_photos (
  user_id uuid primary key references public.profiles(id),
  storage_path text not null unique
);
alter table public.profile_photos enable row level security;
revoke all on public.profile_photos from anon, authenticated;
grant select on public.profile_photos to authenticated;
create policy profile_photo_read on public.profile_photos for select to authenticated
  using (public.is_approved());

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('profile-photos','profile-photos',false,3145728,array['image/jpeg','image/png','image/webp']);
create policy profile_photo_file_read on storage.objects for select to authenticated using (
  bucket_id='profile-photos' and public.is_approved() and
  (owner_id=auth.uid()::text or exists(select 1 from public.profile_photos p where p.storage_path=name))
);
create policy profile_photo_file_upload on storage.objects for insert to authenticated with check (
  bucket_id='profile-photos' and public.is_approved() and
  (storage.foldername(name))[1]=auth.uid()::text and
  name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpeg|png|webp)$'
);
create policy profile_photo_file_delete on storage.objects for delete to authenticated using (
  bucket_id='profile-photos' and public.is_approved() and owner_id=auth.uid()::text and
  not exists(select 1 from public.profile_photos p where p.storage_path=name)
);

create function public.set_profile_photo(data jsonb) returns text
language plpgsql security definer set search_path='' as $$
declare previous_path text; new_path text := data->>'storage_path';
begin
  if not public.is_approved() then raise exception 'not_authorized'; end if;
  -- Lock the profile even when there is no photo yet, serializing concurrent changes.
  perform 1 from public.profiles where id=auth.uid() for update;
  select storage_path into previous_path from public.profile_photos where user_id=auth.uid();
  if previous_path is distinct from (data->>'expected_path') then raise exception 'stale_profile_photo'; end if;
  if new_path is null then
    delete from public.profile_photos where user_id=auth.uid();
  else
    if (storage.foldername(new_path))[1] is distinct from auth.uid()::text or
      not exists(select 1 from storage.objects where bucket_id='profile-photos' and name=new_path and owner_id=auth.uid()::text)
      then raise exception 'invalid_media'; end if;
    insert into public.profile_photos(user_id,storage_path) values(auth.uid(),new_path)
    on conflict(user_id) do update set storage_path=excluded.storage_path;
  end if;
  return previous_path;
end $$;
revoke execute on function public.set_profile_photo(jsonb) from public, anon;
grant execute on function public.set_profile_photo(jsonb) to authenticated;
