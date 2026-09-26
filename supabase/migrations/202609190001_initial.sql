-- Private single-team application. All writes go through validated RPCs.
create type public.base_role as enum ('admin', 'coach', 'player');
create type public.account_status as enum ('pending', 'approved', 'rejected', 'disabled');
create type public.secondary_role as enum ('captain','vice_captain','social_media_manager','team_manager','travel_coordinator','social_coordinator','financial_manager','volunteer_work_coordinator');
create type public.volleyball_position as enum ('outside_hitter','middle_blocker','opposite','setter','libero');
create type public.event_type as enum ('match','practice','social','volunteer_work','travel','team_logistics','finance','other');

create table public.profiles (
  id uuid primary key references auth.users(id),
  full_name text not null check (char_length(full_name) between 2 and 100),
  base_role public.base_role,
  account_status public.account_status not null default 'pending',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  approved_at timestamptz, approved_by uuid references public.profiles(id),
  check (account_status <> 'approved' or base_role is not null)
);
create table public.player_profiles (
  user_id uuid primary key references public.profiles(id),
  jersey_number integer unique check (jersey_number between 0 and 99)
);
create table public.player_secondary_roles (
  player_user_id uuid references public.profiles(id), role_key public.secondary_role,
  assigned_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  primary key (player_user_id, role_key)
);
create table public.player_positions (
  player_user_id uuid references public.profiles(id), position_key public.volleyball_position,
  is_primary boolean not null default false, assigned_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), primary key (player_user_id, position_key)
);
create unique index one_primary_position on public.player_positions(player_user_id) where is_primary;
create table public.schedule_events (
  id uuid primary key default gen_random_uuid(), event_type public.event_type not null,
  title text not null check (char_length(trim(title)) between 1 and 160),
  description text check (char_length(description) <= 10000),
  starts_at timestamptz not null, ends_at timestamptz, location text check (char_length(location) <= 200),
  created_by_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  external_source text, external_event_id text, last_synced_at timestamptz,
  check (ends_at is null or ends_at > starts_at), unique(external_source, external_event_id)
);
create table public.match_details (
  event_id uuid primary key references public.schedule_events(id) on delete cascade,
  opponent text not null check (char_length(trim(opponent)) between 1 and 100),
  home_away text not null check(home_away in ('home','away','neutral')),
  team_sets integer check (team_sets between 0 and 3), opponent_sets integer check (opponent_sets between 0 and 3),
  check ((team_sets is null) = (opponent_sets is null))
);
create table public.volunteer_assignments (
  event_id uuid references public.schedule_events(id) on delete cascade,
  player_user_id uuid references public.profiles(id), assigned_by_user_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now(), primary key (event_id, player_user_id)
);
create table public.lineups (
  id uuid primary key default gen_random_uuid(), match_event_id uuid not null unique references public.schedule_events(id),
  created_by_user_id uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create table public.lineup_revisions (
  id uuid primary key default gen_random_uuid(), lineup_id uuid not null references public.lineups(id),
  revision_number integer not null check(revision_number > 0), status text not null check(status in ('draft','published')),
  created_by_user_id uuid not null references public.profiles(id), created_at timestamptz not null default now(),
  published_at timestamptz, is_current_published boolean not null default false,
  unique(lineup_id, revision_number), check(not is_current_published or status = 'published')
);
create unique index one_current_revision on public.lineup_revisions(lineup_id) where is_current_published;
create table public.lineup_revision_slots (
  id uuid primary key default gen_random_uuid(), lineup_revision_id uuid not null references public.lineup_revisions(id),
  player_user_id uuid not null references public.profiles(id), court_position integer check(court_position between 1 and 6),
  is_libero boolean not null default false, full_name_snapshot text, jersey_number_snapshot integer,
  primary_position_snapshot public.volleyball_position,
  check (is_libero = (court_position is null)),
  unique(lineup_revision_id, player_user_id), unique(lineup_revision_id, court_position)
);
create unique index one_libero on public.lineup_revision_slots(lineup_revision_id) where is_libero;
create table public.posts (
  id uuid primary key default gen_random_uuid(), author_user_id uuid not null references public.profiles(id),
  author_name_snapshot text not null, post_type text not null check(post_type in ('normal','lineup')),
  title text not null check (char_length(trim(title)) between 1 and 160), body text not null default '' check(char_length(body) <= 10000),
  base_role_snapshot public.base_role not null, secondary_role_context_key public.secondary_role,
  secondary_role_context_label_snapshot text, lineup_id uuid unique references public.lineups(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), edited_at timestamptz,
  check ((post_type = 'lineup') = (lineup_id is not null)),
  check (post_type <> 'normal' or char_length(trim(body)) > 0),
  check ((secondary_role_context_key is null) = (secondary_role_context_label_snapshot is null))
);
create table public.post_media (
  id uuid primary key default gen_random_uuid(), post_id uuid not null unique references public.posts(id) on delete cascade,
  storage_path text not null unique, mime_type text not null check(mime_type in ('image/jpeg','image/png','image/webp')),
  size_bytes integer not null check(size_bytes between 1 and 10485760), alt_text text not null default '' check(char_length(alt_text) <= 300),
  created_at timestamptz not null default now()
);
create table public.notification_rules (
  trigger_key text primary key, enabled boolean not null default false,
  updated_by uuid references public.profiles(id), updated_at timestamptz not null default now()
);
insert into public.notification_rules(trigger_key) values
 ('normal_post_created'),('role_context_post_created'),('match_created'),('match_updated'),('practice_created'),('practice_updated'),
 ('lineup_published'),('social_event_created'),('travel_event_created'),('team_logistics_event_created'),('finance_event_created'),('volunteer_event_created'),('volunteer_assignment_created');
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id),
  trigger_key text not null references public.notification_rules(trigger_key), title text not null, body text not null default '',
  target_type text check(target_type in ('post','event')), target_id uuid,
  created_at timestamptz not null default now(), read_at timestamptz
);
create index profiles_status on public.profiles(account_status, base_role, full_name);
create index posts_feed on public.posts(created_at desc, id desc);
create index posts_author on public.posts(author_user_id);
create index schedule_date on public.schedule_events(starts_at);
create index schedule_creator on public.schedule_events(created_by_user_id, event_type);
create index notifications_user on public.notifications(user_id, created_at desc);
create index notifications_unread on public.notifications(user_id, read_at);

create function public.on_auth_user_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, full_name) values(new.id, left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'Nytt medlem'),100));
  return new;
end $$;
create trigger create_profile after insert on auth.users for each row execute function public.on_auth_user_created();

create function public.current_role() returns public.base_role language sql stable security definer set search_path = '' as $$
  select base_role from public.profiles where id = auth.uid() and account_status = 'approved';
$$;
create function public.is_approved() returns boolean language sql stable security definer set search_path = '' as $$ select public.current_role() is not null; $$;
create function public.can_coach() returns boolean language sql stable security definer set search_path = '' as $$ select coalesce(public.current_role() in ('admin','coach'),false); $$;
create function public.can_manage_event(kind public.event_type, creator uuid default null) returns boolean language sql stable security definer set search_path = '' as $$
 select coalesce(public.current_role() = 'admin' or (public.current_role() = 'coach' and kind in ('match','practice')) or
 (public.current_role() = 'player' and (creator is null or creator = auth.uid()) and exists (
 select 1 from public.player_secondary_roles where player_user_id = auth.uid() and role_key::text = case kind
 when 'team_logistics' then 'team_manager' when 'travel' then 'travel_coordinator' when 'social' then 'social_coordinator'
 when 'finance' then 'financial_manager' when 'volunteer_work' then 'volunteer_work_coordinator' else '' end)), false);
$$;

-- Policies allow safe reads only; no client can directly write a privileged or snapshot column.
do $$ declare t text; begin
 foreach t in array array['profiles','player_profiles','player_secondary_roles','player_positions','schedule_events','match_details','volunteer_assignments','lineups','lineup_revisions','lineup_revision_slots','posts','post_media','notification_rules','notifications'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from anon, authenticated',t);
   execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy profile_read on public.profiles for select to authenticated using (
 id = auth.uid() or public.current_role() = 'admin' or (public.is_approved() and account_status = 'approved' and base_role in ('player','coach'))
);
create policy player_read on public.player_profiles for select to authenticated using(public.is_approved() and exists(select 1 from public.profiles p where p.id=user_id and (p.account_status='approved' or public.current_role()='admin')));
create policy roles_read on public.player_secondary_roles for select to authenticated using(public.is_approved() and exists(select 1 from public.profiles p where p.id=player_user_id));
create policy positions_read on public.player_positions for select to authenticated using(public.is_approved() and exists(select 1 from public.profiles p where p.id=player_user_id));
create policy events_read on public.schedule_events for select to authenticated using(public.is_approved());
create policy matches_read on public.match_details for select to authenticated using(public.is_approved());
create policy assignments_read on public.volunteer_assignments for select to authenticated using(public.is_approved());
create policy posts_read on public.posts for select to authenticated using(public.is_approved());
create policy media_read on public.post_media for select to authenticated using(public.is_approved());
create policy lineups_read on public.lineups for select to authenticated using(public.is_approved() and (public.can_coach() or exists(select 1 from public.lineup_revisions r where r.lineup_id=lineups.id and r.status='published')));
create policy revision_read on public.lineup_revisions for select to authenticated using(public.is_approved() and (status='published' or public.can_coach()));
create policy slots_read on public.lineup_revision_slots for select to authenticated using(public.is_approved() and exists(select 1 from public.lineup_revisions r where r.id=lineup_revision_id));
create policy rules_read on public.notification_rules for select to authenticated using(public.current_role()='admin');
create policy notification_read on public.notifications for select to authenticated using(public.is_approved() and user_id=auth.uid());

-- Internal helper, deliberately not executable by API roles.
create function public.emit_notification(trigger_name text, heading text, content text, target_kind text, target uuid, recipient uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
 if exists(select 1 from public.notification_rules where trigger_key=trigger_name and enabled) then
  insert into public.notifications(user_id,trigger_key,title,body,target_type,target_id)
  select id,trigger_name,heading,content,target_kind,target from public.profiles
  where account_status='approved' and id<>auth.uid() and (recipient is null or id=recipient);
 end if;
end $$;

create function public.admin_users() returns table(id uuid, full_name text, email text, base_role public.base_role, account_status public.account_status, created_at timestamptz)
language plpgsql security definer set search_path = '' as $$
begin
 if public.current_role() is distinct from 'admin' then raise exception 'not_authorized'; end if;
 return query select p.id,p.full_name,u.email::text,p.base_role,p.account_status,p.created_at from public.profiles p join auth.users u on u.id=p.id where p.base_role is distinct from 'admin' order by p.created_at desc;
end $$;

create function public.manage_user(data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid := (data->>'id')::uuid; next_role public.base_role := (data->>'base_role')::public.base_role; next_status public.account_status := (data->>'account_status')::public.account_status; old public.profiles; role text;
begin
 if public.current_role() is distinct from 'admin' then raise exception 'not_authorized'; end if;
 select * into strict old from public.profiles where id=target for update;
 if old.base_role='admin' or next_role is null or next_role='admin' or next_status is null or next_status='pending' then raise exception 'invalid_role_or_status'; end if;
 update public.profiles set full_name=trim(data->>'full_name'),base_role=next_role,account_status=next_status,updated_at=now(),
  approved_at=case when next_status='approved' then coalesce(approved_at,now()) else approved_at end,
  approved_by=case when next_status='approved' then coalesce(approved_by,auth.uid()) else approved_by end where id=target;
 delete from public.player_secondary_roles where player_user_id=target;
 if next_role='player' then
  insert into public.player_profiles(user_id,jersey_number) values(target,(data->>'jersey_number')::integer)
  on conflict(user_id) do update set jersey_number=excluded.jersey_number;
  if next_status='approved' then
   for role in select jsonb_array_elements_text(coalesce(data->'roles','[]')) loop
    insert into public.player_secondary_roles(player_user_id,role_key,assigned_by) values(target,role::public.secondary_role,auth.uid());
   end loop;
  end if;
 else
  delete from public.player_positions where player_user_id=target;
  delete from public.player_profiles where user_id=target;
 end if;
 return target;
end $$;

create function public.set_positions(data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid := (data->>'id')::uuid; pos text;
begin
 if not public.can_coach() then raise exception 'not_authorized'; end if;
 perform 1 from public.profiles where id=target and base_role='player' and account_status='approved' for update;
 if not found then raise exception 'invalid_player'; end if;
 delete from public.player_positions where player_user_id=target;
 if data->>'primary' is not null then insert into public.player_positions values(target,(data->>'primary')::public.volleyball_position,true,auth.uid(),now()); end if;
 for pos in select jsonb_array_elements_text(data->'secondary') loop
  insert into public.player_positions values(target,pos::public.volleyball_position,false,auth.uid(),now());
 end loop;
 return target;
end $$;

create function public.save_post(data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid := (data->>'id')::uuid; actor public.profiles; old public.posts; context public.secondary_role := (data->>'role_context')::public.secondary_role; label text;
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 select * into strict actor from public.profiles where id=auth.uid();
 if target is not null then
  select * into strict old from public.posts where id=target for update;
  if old.post_type<>'normal' or (old.author_user_id<>auth.uid() and actor.base_role<>'admin') then raise exception 'not_authorized'; end if;
  if (data->>'expected_updated_at')::timestamptz is distinct from old.updated_at then raise exception 'stale_record'; end if;
  update public.posts set title=trim(data->>'title'),body=trim(data->>'body'),edited_at=now(),updated_at=now() where id=target;
 else
  if context is not null then
   if actor.base_role<>'player' or not exists(select 1 from public.player_secondary_roles where player_user_id=actor.id and role_key=context) then raise exception 'invalid_role_context'; end if;
   label := case context when 'captain' then 'Kaptein' when 'vice_captain' then 'Visekaptein' when 'social_media_manager' then 'SoMe' when 'team_manager' then 'Oppmann' when 'travel_coordinator' then 'Reiseansvarlig' when 'social_coordinator' then 'Sosialansvarlig' when 'financial_manager' then 'Økonomiansvarlig' when 'volunteer_work_coordinator' then 'Dugnadsansvarlig' end;
  end if;
  insert into public.posts(author_user_id,author_name_snapshot,post_type,title,body,base_role_snapshot,secondary_role_context_key,secondary_role_context_label_snapshot)
  values(actor.id,actor.full_name,'normal',trim(data->>'title'),trim(data->>'body'),actor.base_role,context,label) returning id into target;
  perform public.emit_notification(case when context is null then 'normal_post_created' else 'role_context_post_created' end,data->>'title',actor.full_name,'post',target);
 end if;
 return target;
end $$;

create function public.delete_post(target uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 delete from public.posts where id=target and (public.current_role()='admin' or (post_type='normal' and author_user_id=auth.uid()));
 if not found then raise exception 'not_authorized'; end if;
end $$;

create function public.save_event(data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid := (data->>'id')::uuid; kind public.event_type := (data->>'event_type')::public.event_type; old public.schedule_events; is_new boolean := target is null; player text; trigger_name text;
begin
 if target is not null then
  select * into strict old from public.schedule_events where id=target for update;
  if kind<>old.event_type then raise exception 'event_type_immutable'; end if;
  if not public.can_manage_event(old.event_type,old.created_by_user_id) then raise exception 'not_authorized'; end if;
  if (data->>'expected_updated_at')::timestamptz is distinct from old.updated_at then raise exception 'stale_record'; end if;
 else
  if not public.can_manage_event(kind) then raise exception 'not_authorized'; end if;
  target := gen_random_uuid();
 end if;
 insert into public.schedule_events(id,event_type,title,description,starts_at,ends_at,location,created_by_user_id)
 values(target,kind,trim(data->>'title'),data->>'description',(data->>'starts_at')::timestamptz,(data->>'ends_at')::timestamptz,data->>'location',auth.uid())
 on conflict(id) do update set title=excluded.title,description=excluded.description,starts_at=excluded.starts_at,ends_at=excluded.ends_at,location=excluded.location,updated_at=now();
 if kind='match' then
  insert into public.match_details values(target,trim(data->>'opponent'),data->>'home_away',(data->>'team_sets')::integer,(data->>'opponent_sets')::integer)
  on conflict(event_id) do update set opponent=excluded.opponent,home_away=excluded.home_away,team_sets=excluded.team_sets,opponent_sets=excluded.opponent_sets;
 end if;
 if kind='volunteer_work' then
  delete from public.volunteer_assignments where event_id=target and player_user_id not in(select value::uuid from jsonb_array_elements_text(coalesce(data->'assignments','[]')));
  for player in select jsonb_array_elements_text(coalesce(data->'assignments','[]')) loop
   perform 1 from public.profiles where id=player::uuid and account_status='approved' and base_role='player' for share;
   if not found then raise exception 'invalid_player'; end if;
   insert into public.volunteer_assignments values(target,player::uuid,auth.uid(),now()) on conflict do nothing;
   if found then perform public.emit_notification('volunteer_assignment_created','Du er satt opp på dugnad',data->>'title','event',target,player::uuid); end if;
  end loop;
 end if;
 trigger_name := case kind when 'match' then case when is_new then 'match_created' else 'match_updated' end when 'practice' then case when is_new then 'practice_created' else 'practice_updated' end
 when 'social' then 'social_event_created' when 'travel' then 'travel_event_created' when 'team_logistics' then 'team_logistics_event_created' when 'finance' then 'finance_event_created' when 'volunteer_work' then 'volunteer_event_created' end;
 if is_new or kind in ('match','practice') then perform public.emit_notification(trigger_name,data->>'title','Se terminlisten for detaljer.','event',target); end if;
 return target;
end $$;

create function public.delete_event(target uuid) returns void language plpgsql security definer set search_path = '' as $$
declare old public.schedule_events;
begin
 select * into strict old from public.schedule_events where id=target for update;
 if not public.can_manage_event(old.event_type,old.created_by_user_id) then raise exception 'not_authorized'; end if;
 if exists(select 1 from public.lineups where match_event_id=target) then raise exception 'lineup_history_exists'; end if;
 delete from public.schedule_events where id=target;
end $$;

create function public.save_lineup(data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare match_id uuid := (data->>'match_id')::uuid; logical_id uuid; revision_id uuid; version integer; slot jsonb; player public.profiles; jersey integer; position public.volleyball_position; publishing boolean := coalesce((data->>'publish')::boolean,false); event public.schedule_events; post_id uuid; actor public.profiles;
begin
 if not public.can_coach() then raise exception 'not_authorized'; end if;
 select * into strict event from public.schedule_events where id=match_id and event_type='match' for update;
 insert into public.lineups(match_event_id,created_by_user_id) values(match_id,auth.uid()) on conflict(match_event_id) do nothing;
 select id into strict logical_id from public.lineups where match_event_id=match_id;
 select coalesce(max(revision_number),0) into version from public.lineup_revisions where lineup_id=logical_id;
 if (data->>'expected_revision')::integer is distinct from version then raise exception 'stale_revision'; end if;
 if jsonb_typeof(data->'slots') is distinct from 'array' or jsonb_array_length(data->'slots')>7 then raise exception 'invalid_lineup'; end if;
 if publishing and (select count(*) from jsonb_array_elements(data->'slots') s where not (s->>'is_libero')::boolean)<>6 then raise exception 'six_starters_required'; end if;
 insert into public.lineup_revisions(lineup_id,revision_number,status,created_by_user_id,published_at)
 values(logical_id,version+1,case when publishing then 'published' else 'draft' end,auth.uid(),case when publishing then now() end) returning id into revision_id;
 for slot in select * from jsonb_array_elements(data->'slots') loop
  select * into strict player from public.profiles where id=(slot->>'player_user_id')::uuid and account_status='approved' and base_role='player' for share;
  select jersey_number into jersey from public.player_profiles where user_id=player.id;
  select position_key into position from public.player_positions where player_user_id=player.id and is_primary;
  insert into public.lineup_revision_slots(lineup_revision_id,player_user_id,court_position,is_libero,full_name_snapshot,jersey_number_snapshot,primary_position_snapshot)
  values(revision_id,player.id,(slot->>'court_position')::integer,(slot->>'is_libero')::boolean,player.full_name,jersey,position);
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

create function public.set_notification_rule(data jsonb) returns void language plpgsql security definer set search_path = '' as $$
begin
 if public.current_role() is distinct from 'admin' then raise exception 'not_authorized'; end if;
 update public.notification_rules set enabled=(data->>'enabled')::boolean,updated_at=now(),updated_by=auth.uid() where trigger_key=data->>'trigger_key';
 if not found then raise exception 'invalid_trigger'; end if;
end $$;
create function public.mark_notification_read(target uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 update public.notifications set read_at=coalesce(read_at,now()) where id=target and user_id=auth.uid();
 if not found then raise exception 'not_authorized'; end if;
end $$;

-- A private bucket. Storage reads require an approved account and attached post.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('post-images','post-images',false,10485760,array['image/jpeg','image/png','image/webp']);
create policy private_image_read on storage.objects for select to authenticated using (
 bucket_id='post-images' and public.is_approved() and (exists(select 1 from public.post_media m where m.storage_path=name) or owner_id=auth.uid()::text)
);
create policy private_image_upload on storage.objects for insert to authenticated with check (
 bucket_id='post-images' and public.is_approved() and (storage.foldername(name))[1]=auth.uid()::text
 and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpeg|png|webp)$'
);
create policy private_image_delete on storage.objects for delete to authenticated using (
 bucket_id='post-images' and public.is_approved() and (owner_id=auth.uid()::text or public.current_role()='admin')
);
create function public.attach_media(data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
declare target uuid := (data->>'post_id')::uuid; media_id uuid; path text := data->>'storage_path';
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 perform 1 from public.posts where id=target and post_type='normal' and (author_user_id=auth.uid() or public.current_role()='admin') for update;
 if not found then raise exception 'not_authorized'; end if;
 if not exists(select 1 from storage.objects where bucket_id='post-images' and name=path and owner_id=auth.uid()::text) then raise exception 'invalid_media'; end if;
 insert into public.post_media(post_id,storage_path,mime_type,size_bytes,alt_text)
 values(target,path,data->>'mime_type',(data->>'size_bytes')::integer,coalesce(data->>'alt_text','')) returning id into media_id;
 return media_id;
end $$;
create function public.remove_media(target uuid) returns text language plpgsql security definer set search_path = '' as $$
declare path text;
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 delete from public.post_media m using public.posts p where m.id=target and p.id=m.post_id and (p.author_user_id=auth.uid() or public.current_role()='admin') returning storage_path into path;
 if path is null then raise exception 'not_authorized'; end if;
 return path;
end $$;

-- PostgreSQL grants execute to PUBLIC by default: revoke before exposing only reviewed RPCs.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function public.current_role(), public.is_approved(), public.can_coach(), public.can_manage_event(public.event_type,uuid) to authenticated;
grant execute on function public.admin_users(), public.manage_user(jsonb), public.set_positions(jsonb), public.save_post(jsonb), public.delete_post(uuid), public.save_event(jsonb), public.delete_event(uuid), public.save_lineup(jsonb), public.set_notification_rule(jsonb), public.mark_notification_read(uuid), public.attach_media(jsonb), public.remove_media(uuid) to authenticated;
