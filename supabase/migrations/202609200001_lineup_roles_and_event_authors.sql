-- Preserve existing revisions. New revisions store the setter start and assigned playing roles.
alter table public.lineup_revisions add column setter_position integer check (setter_position between 1 and 6);
alter table public.lineup_revision_slots add column lineup_role text check (lineup_role in ('setter','k1','m1','opposite','k2','m2','libero'));
alter table public.lineup_revision_slots add constraint unique_revision_role unique(lineup_revision_id,lineup_role);

-- Older events have no author-role history; backfill from their creator's current profile.
alter table public.schedule_events add column creator_base_role_snapshot public.base_role;
update public.schedule_events e set creator_base_role_snapshot=p.base_role from public.profiles p where p.id=e.created_by_user_id;
create function public.snapshot_event_author() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='INSERT' then
  select base_role into new.creator_base_role_snapshot from public.profiles where id=new.created_by_user_id;
 else
  new.creator_base_role_snapshot := old.creator_base_role_snapshot;
 end if;
 return new;
end $$;
revoke execute on function public.snapshot_event_author() from public, anon, authenticated;
create trigger snapshot_event_author before insert or update on public.schedule_events for each row execute function public.snapshot_event_author();

create or replace function public.save_lineup(data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare match_id uuid := (data->>'match_id')::uuid; logical_id uuid; revision_id uuid; version integer; slot jsonb; player public.profiles; jersey integer; position public.volleyball_position; publishing boolean := coalesce((data->>'publish')::boolean,false); event public.schedule_events; post_id uuid; actor public.profiles; setter_start integer := (data->>'setter_position')::integer; role_key text; role_offset integer; required_position public.volleyball_position;
begin
 if not public.can_coach() then raise exception 'not_authorized'; end if;
 select * into strict event from public.schedule_events where id=match_id and event_type='match' for update;
 insert into public.lineups(match_event_id,created_by_user_id) values(match_id,auth.uid()) on conflict(match_event_id) do nothing;
 select id into strict logical_id from public.lineups where match_event_id=match_id;
 select coalesce(max(revision_number),0) into version from public.lineup_revisions where lineup_id=logical_id;
 if (data->>'expected_revision')::integer is distinct from version then raise exception 'stale_revision'; end if;
 if jsonb_typeof(data->'slots') is distinct from 'array' or jsonb_array_length(data->'slots')>7 then raise exception 'invalid_lineup'; end if;
 if publishing and (select count(*) from jsonb_array_elements(data->'slots') s where not (s->>'is_libero')::boolean)<>6 then raise exception 'six_starters_required'; end if;
 if setter_start is null or setter_start not between 1 and 6 then raise exception 'invalid_setter_position'; end if;
 insert into public.lineup_revisions(lineup_id,revision_number,status,created_by_user_id,published_at,setter_position)
 values(logical_id,version+1,case when publishing then 'published' else 'draft' end,auth.uid(),case when publishing then now() end,setter_start) returning id into revision_id;
 for slot in select * from jsonb_array_elements(data->'slots') loop
  role_key := slot->>'lineup_role';
  role_offset := case role_key when 'setter' then 0 when 'k1' then 1 when 'm1' then 2 when 'opposite' then 3 when 'k2' then 4 when 'm2' then 5 when 'libero' then 6 end;
  if role_offset is null then raise exception 'invalid_lineup_role'; end if;
  if (slot->>'is_libero')::boolean is distinct from (role_key='libero') or
    (slot->>'court_position')::integer is distinct from (case when role_key='libero' then null else ((setter_start-1+role_offset)%6)+1 end)
    then raise exception 'invalid_lineup_rotation'; end if;
  required_position := case role_key when 'setter' then 'setter' when 'opposite' then 'opposite' when 'libero' then 'libero' when 'k1' then 'outside_hitter' when 'k2' then 'outside_hitter' else 'middle_blocker' end;

  select * into strict player from public.profiles where id=(slot->>'player_user_id')::uuid and account_status='approved' and base_role='player' for share;
  if not exists(select 1 from public.player_positions where player_user_id=player.id and position_key=required_position) then raise exception 'invalid_player_position'; end if;
  select jersey_number into jersey from public.player_profiles where user_id=player.id;
  select position_key into position from public.player_positions where player_user_id=player.id and is_primary;
  insert into public.lineup_revision_slots(lineup_revision_id,player_user_id,court_position,is_libero,full_name_snapshot,jersey_number_snapshot,primary_position_snapshot,lineup_role)
  values(revision_id,player.id,(slot->>'court_position')::integer,(slot->>'is_libero')::boolean,player.full_name,jersey,position,role_key);
 end loop;
 if publishing then
  update public.lineup_revisions set is_current_published=false where lineup_id=logical_id and is_current_published;
  update public.lineup_revisions set is_current_published=true where id=revision_id;
  select * into strict actor from public.profiles where id=auth.uid();
  insert into public.posts(author_user_id,author_name_snapshot,post_type,title,body,base_role_snapshot,lineup_id)
  values(actor.id,actor.full_name,'lineup','Kampoppstilling','',actor.base_role,logical_id)
  on conflict(lineup_id) do update set edited_at=now(),updated_at=now(),author_user_id=excluded.author_user_id,author_name_snapshot=excluded.author_name_snapshot,base_role_snapshot=excluded.base_role_snapshot returning id into post_id;
  perform public.emit_notification('lineup_published','Kampoppstillingen er klar',event.title,'post',post_id);
 end if;
 return revision_id;
end $$;

