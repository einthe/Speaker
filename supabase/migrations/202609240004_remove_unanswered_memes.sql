-- Keep a deleted meme's place in the thread only when it has replies.
create or replace function public.delete_comment(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.discussion_comments;
begin
 perform public.check_discussion_target(data->>'target_type',(data->>'target_id')::uuid);
 -- Reply creation takes a shared lock on this row, so it cannot race this check.
 select * into existing from public.discussion_comments where id=(data->>'id')::uuid for update;
 if not found or (existing.author_user_id<>auth.uid() and public.current_role()<>'admin') then raise exception 'not_authorized'; end if;
 if (data->>'target_type'='post' and existing.post_id is distinct from (data->>'target_id')::uuid)
  or (data->>'target_type'='event' and existing.event_id is distinct from (data->>'target_id')::uuid) then raise exception 'invalid_target'; end if;
 if existing.deleted_at is not null then return existing.id; end if;
 if existing.version is distinct from (data->>'expected_version')::integer then raise exception 'stale_comment'; end if;
 if existing.giphy_id is not null and not exists (
  select 1 from public.discussion_comments where parent_id=existing.id
 ) then
  delete from public.discussion_comments where id=existing.id;
 else
  update public.discussion_comments set body='',giphy_id=null,deleted_at=now(),updated_at=now(),version=version+1 where id=existing.id;
 end if;
 return existing.id;
end $$;
