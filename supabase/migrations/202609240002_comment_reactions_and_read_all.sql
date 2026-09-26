-- Comment reactions are separate from reactions to the containing post/event.
create table public.comment_meme_reactions (
 id uuid primary key default gen_random_uuid(),
 comment_id uuid not null references public.discussion_comments(id) on delete cascade,
 author_user_id uuid not null references public.profiles(id),
 author_name_snapshot text not null,
 giphy_id text not null check (giphy_id ~ '^[A-Za-z0-9]{1,64}$'),
 created_at timestamptz not null default now(),
 unique(comment_id,author_user_id,giphy_id)
);
alter table public.comment_meme_reactions enable row level security;
revoke all on public.comment_meme_reactions from anon,authenticated;
grant select on public.comment_meme_reactions to authenticated;
create policy comment_reactions_read on public.comment_meme_reactions for select to authenticated
 using(public.is_approved() and exists (
  select 1 from public.discussion_comments c where c.id=comment_id and c.deleted_at is null
 ));

create function public.set_comment_meme_reaction(data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare
 target uuid=(data->>'target_id')::uuid; kind text=data->>'target_type';
 target_comment uuid=(data->>'comment_id')::uuid; gif text=data->>'giphy_id';
 existing public.discussion_comments;
begin
 perform public.check_discussion_target(kind,target);
 if gif is null or gif !~ '^[A-Za-z0-9]{1,64}$'
  or jsonb_typeof(data->'active') is distinct from 'boolean' then raise exception 'invalid_reaction'; end if;
 select * into existing from public.discussion_comments where id=target_comment for share;
 if not found or existing.deleted_at is not null then raise exception 'stale_comment'; end if;
 if (kind='post' and existing.post_id is distinct from target)
  or (kind='event' and existing.event_id is distinct from target) then raise exception 'invalid_target'; end if;
 if (data->>'active')::boolean then
  insert into public.comment_meme_reactions(comment_id,author_user_id,author_name_snapshot,giphy_id)
  select target_comment,id,full_name,gif from public.profiles where id=auth.uid()
  on conflict do nothing;
 else
  delete from public.comment_meme_reactions where comment_id=target_comment
   and author_user_id=auth.uid() and giphy_id=gif;
 end if;
end $$;
revoke all on function public.set_comment_meme_reaction(jsonb) from public,anon;
grant execute on function public.set_comment_meme_reaction(jsonb) to authenticated;

create or replace function public.get_discussion(data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare target uuid=(data->>'target_id')::uuid; kind text=data->>'target_type'; result jsonb;
begin
 perform public.check_discussion_target(kind,target);
 select jsonb_build_object(
  'comments',coalesce((select jsonb_agg(
   to_jsonb(c) || jsonb_build_object('reactions',case when c.deleted_at is not null then '[]'::jsonb else
    coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id)
     from public.comment_meme_reactions r where r.comment_id=c.id),'[]'::jsonb) end)
   order by c.created_at,c.id)
   from public.discussion_comments c where (kind='post' and c.post_id=target) or (kind='event' and c.event_id=target)),'[]'::jsonb),
  'reactions',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at,r.id)
   from public.meme_reactions r where (kind='post' and r.post_id=target) or (kind='event' and r.event_id=target)),'[]'::jsonb)
 ) into result;
 return result;
end $$;

-- No client-supplied recipient or list: update every unread row owned by the caller.
create function public.mark_all_notifications_read() returns integer
language plpgsql security definer set search_path='' as $$
declare changed integer;
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 update public.notifications set read_at=now() where user_id=auth.uid() and read_at is null;
 get diagnostics changed = row_count;
 return changed;
end $$;
revoke all on function public.mark_all_notifications_read() from public,anon;
grant execute on function public.mark_all_notifications_read() to authenticated;
