-- Legacy images retain a stable fallback frame until dimensions are available.
alter table public.post_media
 add column width integer,
 add column height integer,
 add constraint post_media_dimensions check (
   (width is null and height is null) or
   (width is not null and height is not null and width between 1 and 40000 and height between 1 and 40000)
 );

create or replace function public.attach_media(data jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
 target uuid := (data->>'post_id')::uuid;
 media_id uuid;
 path text := data->>'storage_path';
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 perform 1 from public.posts where id=target and post_type='normal'
   and (author_user_id=auth.uid() or public.current_role()='admin') for update;
 if not found then raise exception 'not_authorized'; end if;
 if not exists(select 1 from storage.objects where bucket_id='post-images'
   and name=path and owner_id=auth.uid()::text) then raise exception 'invalid_media'; end if;
 select id into media_id from public.post_media where post_id=target and storage_path=path;
 if found then return media_id; end if;
 if (select count(*) from public.post_media where post_id=target) >= 10 then
   raise exception 'too_many_post_images';
 end if;
 insert into public.post_media(post_id,storage_path,mime_type,size_bytes,alt_text,sort_order,width,height)
 values(target,path,data->>'mime_type',(data->>'size_bytes')::integer,coalesce(data->>'alt_text',''),
   (select coalesce(max(sort_order),-1)+1 from public.post_media where post_id=target),
   (data->>'width')::integer,(data->>'height')::integer)
 returning id into media_id;
 return media_id;
end $$;
