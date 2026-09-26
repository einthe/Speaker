-- Source-managed events remain real matches, so their IDs and lineups survive updates.
create table public.volleyball_sync_state (
  sync_key text primary key,
  next_attempt_at timestamptz not null default now(),
  lease_id uuid,
  lease_until timestamptz,
  last_success_at timestamptz,
  last_error boolean not null default false
);
alter table public.volleyball_sync_state enable row level security;
revoke all on public.volleyball_sync_state from public, anon, authenticated;

alter table public.schedule_events alter column created_by_user_id drop not null;
alter table public.schedule_events alter column starts_at drop not null;
alter table public.schedule_events add column external_sync_key text references public.volleyball_sync_state(sync_key);
alter table public.schedule_events add column external_source_url text;
alter table public.schedule_events add column external_status text check (external_status in ('scheduled','postponed','cancelled','unavailable'));
alter table public.schedule_events add column external_time_unknown boolean not null default false;
alter table public.schedule_events add constraint manual_event_author check (created_by_user_id is not null or external_source is not distinct from 'volleyballlive');
alter table public.schedule_events add constraint manual_event_date check (starts_at is not null or external_source is not distinct from 'volleyballlive');

create function public.claim_volleyball_sync(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare key text := data->>'sync_key'; token uuid;
begin
 if key is null or length(key)>100 then raise exception 'invalid_sync_key'; end if;
 insert into public.volleyball_sync_state(sync_key) values(key) on conflict do nothing;
 update public.volleyball_sync_state set lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
 where sync_key=key and next_attempt_at<=now() and (lease_until is null or lease_until<now())
 returning lease_id into token;
 return token;
end $$;

create function public.finish_volleyball_sync(data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare key text := data->>'sync_key'; token uuid := (data->>'lease_id')::uuid;
 item jsonb; target uuid; imported integer := 0;
begin
 perform 1 from public.volleyball_sync_state where sync_key=key and lease_id=token and lease_until>now() for update;
 if not found then raise exception 'sync_lease_expired'; end if;
 if coalesce((data->>'failed')::boolean,false) then
  update public.volleyball_sync_state set lease_id=null,lease_until=null,next_attempt_at=now()+interval '1 hour',last_error=true where sync_key=key;
  return 0;
 end if;
 if jsonb_typeof(data->'matches') is distinct from 'array' then raise exception 'invalid_matches'; end if;
 for item in select value from jsonb_array_elements(data->'matches') loop
  if item->>'external_event_id' is null then raise exception 'invalid_match_id'; end if;
  insert into public.schedule_events(event_type,title,starts_at,ends_at,location,created_by_user_id,
   external_source,external_event_id,external_sync_key,external_source_url,external_status,external_time_unknown,last_synced_at)
  values('match',item->>'title',(item->>'starts_at')::timestamptz,(item->>'ends_at')::timestamptz,item->>'location',null,
   'volleyballlive',item->>'external_event_id',key,data->>'source_url',item->>'status',(item->>'time_unknown')::boolean,now())
  on conflict(external_source,external_event_id) do update set
   title=excluded.title,starts_at=excluded.starts_at,ends_at=excluded.ends_at,location=excluded.location,
   external_sync_key=excluded.external_sync_key,external_source_url=excluded.external_source_url,
   external_status=excluded.external_status,external_time_unknown=excluded.external_time_unknown,last_synced_at=now(),updated_at=now()
  returning id into target;
  insert into public.match_details(event_id,opponent,home_away,team_sets,opponent_sets)
  values(target,item->>'opponent',item->>'home_away',(item->>'team_sets')::integer,(item->>'opponent_sets')::integer)
  on conflict(event_id) do update set opponent=excluded.opponent,home_away=excluded.home_away,
   team_sets=excluded.team_sets,opponent_sets=excluded.opponent_sets;
  imported := imported + 1;
 end loop;
 -- Never delete missing matches: existing lineups and published history must survive.
 update public.schedule_events set external_status='unavailable',last_synced_at=now(),updated_at=now()
 where external_sync_key=key and external_source='volleyballlive'
 and external_event_id not in (select value->>'external_event_id' from jsonb_array_elements(data->'matches'));
 update public.volleyball_sync_state set lease_id=null,lease_until=null,last_success_at=now(),last_error=false,
  next_attempt_at=(date_trunc('day',now() at time zone 'UTC')+interval '1 day') at time zone 'UTC' where sync_key=key;
 return imported;
end $$;

revoke execute on function public.claim_volleyball_sync(jsonb), public.finish_volleyball_sync(jsonb) from public,anon,authenticated;
grant execute on function public.claim_volleyball_sync(jsonb), public.finish_volleyball_sync(jsonb) to service_role;

-- Keep all existing manual-event checks; deny edits/deletion of provider-owned records.
alter function public.save_event(jsonb) rename to save_manual_event;
alter function public.delete_event(uuid) rename to delete_manual_event;
revoke execute on function public.save_manual_event(jsonb),public.delete_manual_event(uuid) from public,anon,authenticated;
create function public.save_event(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 perform 1 from public.schedule_events where id=(data->>'id')::uuid and external_source='volleyballlive' for update;
 if found then raise exception 'external_event_readonly'; end if;
 return public.save_manual_event(data);
end $$;
create function public.delete_event(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 perform 1 from public.schedule_events where id=target and external_source='volleyballlive' for update;
 if found then raise exception 'external_event_readonly'; end if;
 perform public.delete_manual_event(target);
end $$;
revoke execute on function public.save_event(jsonb),public.delete_event(uuid) from public,anon;
grant execute on function public.save_event(jsonb),public.delete_event(uuid) to authenticated;
