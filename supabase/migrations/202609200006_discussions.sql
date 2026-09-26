create table public.discussion_comments (
 id uuid primary key default gen_random_uuid(),
 post_id uuid references public.posts(id) on delete cascade,
 event_id uuid references public.schedule_events(id) on delete cascade,
 parent_id uuid references public.discussion_comments(id) on delete cascade,
 depth integer not null default 0 check (depth between 0 and 32),
 author_user_id uuid not null references public.profiles(id),
 author_name_snapshot text not null,
 body text not null,
 version integer not null default 0,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 deleted_at timestamptz,
 check (num_nonnulls(post_id,event_id)=1),
 check ((deleted_at is null and char_length(btrim(body)) between 1 and 3000)
  or (deleted_at is not null and body=''))
);
create index discussion_comments_post on public.discussion_comments(post_id,created_at);
create index discussion_comments_event on public.discussion_comments(event_id,created_at);
create index discussion_comments_parent on public.discussion_comments(parent_id);

create table public.meme_reactions (
 id uuid primary key default gen_random_uuid(),
 post_id uuid references public.posts(id) on delete cascade,
 event_id uuid references public.schedule_events(id) on delete cascade,
 author_user_id uuid not null references public.profiles(id),
 author_name_snapshot text not null,
 giphy_id text not null check (giphy_id ~ '^[A-Za-z0-9]{1,64}$'),
 created_at timestamptz not null default now(),
 check (num_nonnulls(post_id,event_id)=1),
 unique(post_id,author_user_id,giphy_id),
 unique(event_id,author_user_id,giphy_id)
);
alter table public.discussion_comments enable row level security;
alter table public.meme_reactions enable row level security;
revoke all on public.discussion_comments,public.meme_reactions from anon,authenticated;
grant select on public.discussion_comments,public.meme_reactions to authenticated;
create policy comments_read on public.discussion_comments for select to authenticated using(public.is_approved());
create policy reactions_read on public.meme_reactions for select to authenticated using(public.is_approved());

-- Reused inside the guarded RPCs; never callable by API users directly.
create function public.check_discussion_target(kind text,target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 if kind='post' then
  perform 1 from public.posts where id=target;
 elsif kind='event' then
  perform 1 from public.schedule_events where id=target;
 else raise exception 'invalid_target';
 end if;
 if not found then raise exception 'invalid_target'; end if;
end $$;
revoke all on function public.check_discussion_target(text,uuid) from public,anon,authenticated;

create function public.get_discussion(data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid=(data->>'target_id')::uuid; kind text=data->>'target_type'; result jsonb;
begin
 perform public.check_discussion_target(kind,target);
 select jsonb_build_object(
  'comments',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at,c.id)
   from public.discussion_comments c where (kind='post' and c.post_id=target) or (kind='event' and c.event_id=target)),'[]'::jsonb),
  'reactions',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id)
   from public.meme_reactions r where (kind='post' and r.post_id=target) or (kind='event' and r.event_id=target)),'[]'::jsonb)
 ) into result;
 return result;
end $$;

create function public.save_comment(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 target uuid=(data->>'target_id')::uuid; kind text=data->>'target_type';
 comment_id uuid=(data->>'id')::uuid; parent uuid=(data->>'parent_id')::uuid;
 content text=btrim(data->>'body'); parent_comment public.discussion_comments;
 existing public.discussion_comments; author_name text;
begin
 perform public.check_discussion_target(kind,target);
 if comment_id is null or content is null or char_length(content) not between 1 and 3000 then raise exception 'invalid_comment'; end if;
 if data->>'expected_version' is not null then
  select * into existing from public.discussion_comments where id=comment_id for update;
  if not found or existing.author_user_id<>auth.uid() then raise exception 'not_authorized'; end if;
  if (kind='post' and existing.post_id is distinct from target) or (kind='event' and existing.event_id is distinct from target) then raise exception 'invalid_target'; end if;
  if existing.deleted_at is not null or existing.version<>(data->>'expected_version')::integer then raise exception 'stale_comment'; end if;
  update public.discussion_comments set body=content,version=version+1,updated_at=now() where id=comment_id;
 else
  if parent is not null then
   select * into parent_comment from public.discussion_comments where id=parent for share;
   if not found or parent_comment.deleted_at is not null then raise exception 'stale_comment'; end if;
   if (kind='post' and parent_comment.post_id is distinct from target) or (kind='event' and parent_comment.event_id is distinct from target) then raise exception 'invalid_parent'; end if;
   if parent_comment.depth>=32 then raise exception 'thread_too_deep'; end if;
  end if;
  select full_name into author_name from public.profiles where id=auth.uid();
  insert into public.discussion_comments(id,post_id,event_id,parent_id,depth,author_user_id,author_name_snapshot,body)
  values(comment_id,case when kind='post' then target end,case when kind='event' then target end,parent,
   coalesce(parent_comment.depth+1,0),auth.uid(),author_name,content) on conflict(id) do nothing;
  -- A retried request may reuse its ID, but may never overwrite somebody else's comment.
  select * into existing from public.discussion_comments where id=comment_id;
  if existing.author_user_id<>auth.uid() or existing.body<>content or existing.deleted_at is not null
   or existing.parent_id is distinct from parent
   or (kind='post' and existing.post_id is distinct from target) or (kind='event' and existing.event_id is distinct from target)
   then raise exception 'stale_comment'; end if;
 end if;
 return comment_id;
end $$;

create function public.delete_comment(data jsonb) returns uuid
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
 update public.discussion_comments set body='',deleted_at=now(),updated_at=now(),version=version+1 where id=existing.id;
 return existing.id;
end $$;

create function public.set_meme_reaction(data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare target uuid=(data->>'target_id')::uuid; kind text=data->>'target_type'; gif text=data->>'giphy_id';
begin
 perform public.check_discussion_target(kind,target);
 if gif is null or gif !~ '^[A-Za-z0-9]{1,64}$' or jsonb_typeof(data->'active') is distinct from 'boolean' then raise exception 'invalid_reaction'; end if;
 if (data->>'active')::boolean then
  insert into public.meme_reactions(post_id,event_id,author_user_id,author_name_snapshot,giphy_id)
  select case when kind='post' then target end,case when kind='event' then target end,id,full_name,gif
  from public.profiles where id=auth.uid() on conflict do nothing;
 else
  delete from public.meme_reactions where author_user_id=auth.uid() and giphy_id=gif
   and ((kind='post' and post_id=target) or (kind='event' and event_id=target));
 end if;
end $$;
revoke execute on function public.get_discussion(jsonb),public.save_comment(jsonb),public.delete_comment(jsonb),public.set_meme_reaction(jsonb) from public,anon;
grant execute on function public.get_discussion(jsonb),public.save_comment(jsonb),public.delete_comment(jsonb),public.set_meme_reaction(jsonb) to authenticated;
