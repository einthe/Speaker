-- Return only totals for the visible page, without downloading comment bodies or GIF IDs.
create function public.get_discussion_counts(data jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare kind text=data->>'target_type'; result jsonb;
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 if kind is null or kind not in ('post','event') or jsonb_typeof(data->'ids') is distinct from 'array' then
  raise exception 'invalid_target';
 end if;
 if jsonb_array_length(data->'ids')>100 then raise exception 'too_many_targets'; end if;
 select coalesce(jsonb_object_agg(target.id,jsonb_build_object(
  'comment_count',(select count(*) from public.discussion_comments c where c.deleted_at is null
   and ((kind='post' and c.post_id=target.id) or (kind='event' and c.event_id=target.id))),
  'reaction_count',(select count(*) from public.meme_reactions r
   where (kind='post' and r.post_id=target.id) or (kind='event' and r.event_id=target.id))
 )), '{}'::jsonb) into result
 from (select distinct value::uuid as id from jsonb_array_elements_text(data->'ids')) target;
 return result;
end $$;
revoke execute on function public.get_discussion_counts(jsonb) from public,anon;
grant execute on function public.get_discussion_counts(jsonb) to authenticated;
