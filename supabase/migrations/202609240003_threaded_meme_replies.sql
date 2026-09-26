-- Text and meme replies use the same parent/child model.
alter table public.discussion_comments add column giphy_id text
 check (giphy_id is null or giphy_id ~ '^[A-Za-z0-9]{1,64}$');
do $$
declare constraint_name text;
begin
 for constraint_name in select conname from pg_constraint
  where conrelid='public.discussion_comments'::regclass and contype='c'
   and pg_get_constraintdef(oid) like '%btrim(body)%'
 loop execute format('alter table public.discussion_comments drop constraint %I',constraint_name); end loop;
end $$;

alter table public.discussion_comments add constraint discussion_entry_content check (
 (deleted_at is null and (
  (giphy_id is null and char_length(btrim(body)) between 1 and 3000)
  or (giphy_id is not null and body='')
 )) or (deleted_at is not null and body='' and giphy_id is null)
);
-- Leave room for memes attached to the deepest existing comment threads.
alter table public.discussion_comments drop constraint discussion_comments_depth_check;
alter table public.discussion_comments add constraint discussion_comments_depth_check check(depth between 0 and 64);

create or replace function public.save_comment(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 target uuid=(data->>'target_id')::uuid; kind text=data->>'target_type';
 comment_id uuid=(data->>'id')::uuid; parent uuid=(data->>'parent_id')::uuid;
 content text=btrim(coalesce(data->>'body','')); gif text=data->>'giphy_id';
 parent_comment public.discussion_comments; existing public.discussion_comments; author_name text;
begin
 perform public.check_discussion_target(kind,target);
 if comment_id is null or (gif is null and char_length(content) not between 1 and 3000)
  or (gif is not null and (parent is null or gif !~ '^[A-Za-z0-9]{1,64}$' or content<>'')) then raise exception 'invalid_comment'; end if;
 if data->>'expected_version' is not null then
  select * into existing from public.discussion_comments where id=comment_id for update;
  if not found or existing.author_user_id<>auth.uid() then raise exception 'not_authorized'; end if;
  if (kind='post' and existing.post_id is distinct from target) or (kind='event' and existing.event_id is distinct from target) then raise exception 'invalid_target'; end if;
  if existing.deleted_at is not null or existing.version<>(data->>'expected_version')::integer then raise exception 'stale_comment'; end if;
  if existing.giphy_id is not null or gif is not null then raise exception 'invalid_comment'; end if;
  update public.discussion_comments set body=content,version=version+1,updated_at=now() where id=comment_id;
 else
  if parent is not null then
   select * into parent_comment from public.discussion_comments where id=parent for share;
   if not found or parent_comment.deleted_at is not null then raise exception 'stale_comment'; end if;
   if (kind='post' and parent_comment.post_id is distinct from target) or (kind='event' and parent_comment.event_id is distinct from target) then raise exception 'invalid_parent'; end if;
   if parent_comment.depth>=64 then raise exception 'thread_too_deep'; end if;
  end if;
  select full_name into author_name from public.profiles where id=auth.uid();
  insert into public.discussion_comments(id,post_id,event_id,parent_id,depth,author_user_id,author_name_snapshot,body,giphy_id)
  values(comment_id,case when kind='post' then target end,case when kind='event' then target end,parent,
   coalesce(parent_comment.depth+1,0),auth.uid(),author_name,content,gif) on conflict(id) do nothing;
  select * into existing from public.discussion_comments where id=comment_id;
  if existing.author_user_id<>auth.uid() or existing.body<>content or existing.giphy_id is distinct from gif
   or existing.deleted_at is not null or existing.parent_id is distinct from parent
   or (kind='post' and existing.post_id is distinct from target) or (kind='event' and existing.event_id is distinct from target)
   then raise exception 'stale_comment'; end if;
 end if;
 return comment_id;
end $$;

create or replace function public.delete_comment(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare existing public.discussion_comments;
begin
 perform public.check_discussion_target(data->>'target_type',(data->>'target_id')::uuid);
 select * into existing from public.discussion_comments where id=(data->>'id')::uuid for update;
 if not found or (existing.author_user_id<>auth.uid() and public.current_role()<>'admin') then raise exception 'not_authorized'; end if;
 if (data->>'target_type'='post' and existing.post_id is distinct from (data->>'target_id')::uuid)
  or (data->>'target_type'='event' and existing.event_id is distinct from (data->>'target_id')::uuid) then raise exception 'invalid_target'; end if;
 if existing.deleted_at is not null then return existing.id; end if;
 if existing.version is distinct from (data->>'expected_version')::integer then raise exception 'stale_comment'; end if;
 update public.discussion_comments set body='',giphy_id=null,deleted_at=now(),updated_at=now(),version=version+1 where id=existing.id;
 return existing.id;
end $$;

-- Copy historical reactions without replaying notifications. Preserve authors and dates.
alter table public.discussion_comments disable trigger notify_new_comment;
insert into public.discussion_comments(id,post_id,event_id,parent_id,depth,author_user_id,author_name_snapshot,body,giphy_id,created_at,updated_at,deleted_at)
 select r.id,c.post_id,c.event_id,c.id,c.depth+1,r.author_user_id,r.author_name_snapshot,'',
  case when c.deleted_at is null then r.giphy_id end,r.created_at,r.created_at,c.deleted_at
 from public.comment_meme_reactions r join public.discussion_comments c on c.id=r.comment_id;
-- Keep one authoritative copy, including when a migrated meme is later deleted.
delete from public.comment_meme_reactions;
alter table public.discussion_comments enable trigger notify_new_comment;

-- Keep older clients functional while they update to threaded memes.
create function public.set_thread_meme_reaction(data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
 target uuid=(data->>'target_id')::uuid; kind text=data->>'target_type';
 parent uuid=(data->>'comment_id')::uuid; gif text=data->>'giphy_id';
 existing public.discussion_comments; parent_comment public.discussion_comments;
begin
 perform public.check_discussion_target(kind,target);
 if gif is null or gif !~ '^[A-Za-z0-9]{1,64}$' or jsonb_typeof(data->'active') is distinct from 'boolean' then raise exception 'invalid_reaction'; end if;
 if parent is not null then
  select * into parent_comment from public.discussion_comments where id=parent for share;
  if not found or parent_comment.deleted_at is not null then raise exception 'stale_comment'; end if;
  if (kind='post' and parent_comment.post_id is distinct from target) or (kind='event' and parent_comment.event_id is distinct from target) then raise exception 'invalid_target'; end if;
 end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 select * into existing from public.discussion_comments where author_user_id=auth.uid()
  and parent_id is not distinct from parent and giphy_id=gif and deleted_at is null
  and ((kind='post' and post_id=target) or (kind='event' and event_id=target)) order by created_at limit 1 for update;
 if (data->>'active')::boolean then
  if existing.id is null then
   perform public.save_comment(data || jsonb_build_object('id',gen_random_uuid(),'parent_id',parent,'body','','expected_version',null));
  end if;
 elsif existing.id is not null then
  perform public.delete_comment(data || jsonb_build_object('id',existing.id,'expected_version',existing.version));
 end if;
end $$;
revoke all on function public.set_thread_meme_reaction(jsonb) from public,anon,authenticated;
create or replace function public.set_comment_meme_reaction(data jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if data->>'comment_id' is null then raise exception 'invalid_target'; end if;
 perform public.set_thread_meme_reaction(data);
end $$;

create or replace function public.get_discussion(data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid=(data->>'target_id')::uuid; kind text=data->>'target_type';
begin
 perform public.check_discussion_target(kind,target);
 return jsonb_build_object(
  'comments',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id)
   from public.discussion_comments c where (kind='post' and c.post_id=target) or (kind='event' and c.event_id=target)),'[]'::jsonb),
  'reactions',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id)
   from public.meme_reactions c where (kind='post' and c.post_id=target) or (kind='event' and c.event_id=target)),'[]'::jsonb)
 );
end $$;

create or replace function public.get_discussion_counts(data jsonb) returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare kind text=data->>'target_type'; result jsonb;
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 if kind is null or kind not in ('post','event') or jsonb_typeof(data->'ids') is distinct from 'array' then raise exception 'invalid_target'; end if;
 if jsonb_array_length(data->'ids')>100 then raise exception 'too_many_targets'; end if;
 select coalesce(jsonb_object_agg(target.id,jsonb_build_object(
  'comment_count',(select count(*) from public.discussion_comments c where c.deleted_at is null and c.giphy_id is null
   and ((kind='post' and c.post_id=target.id) or (kind='event' and c.event_id=target.id))),
  'reaction_count',(select count(*) from public.meme_reactions c
   where (kind='post' and c.post_id=target.id) or (kind='event' and c.event_id=target.id))
 )), '{}'::jsonb) into result
 from (select distinct value::uuid as id from jsonb_array_elements_text(data->'ids')) target;
 return result;
end $$;
