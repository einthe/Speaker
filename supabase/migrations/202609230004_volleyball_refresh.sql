-- Refresh imported fixtures every five minutes while preserving atomic updates and leases.
create or replace function public.finish_volleyball_sync(data jsonb) returns integer
language plpgsql security definer set search_path='' as $$
declare key text := data->>'sync_key'; token uuid := (data->>'lease_id')::uuid;
 item jsonb; target uuid; imported integer := 0;
begin
 perform 1 from public.volleyball_sync_state where sync_key=key and lease_id=token and lease_until>now() for update;
 if not found then raise exception 'sync_lease_expired'; end if;
 if coalesce((data->>'failed')::boolean,false) then
  update public.volleyball_sync_state set lease_id=null,lease_until=null,next_attempt_at=now()+interval '5 minutes',last_error=true where sync_key=key;
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
  next_attempt_at=now()+interval '5 minutes' where sync_key=key;
 return imported;
end $$;

-- Existing installations must not retain their old daily cooldown.
-- Preserve active leases and any attempt that is already due.
update public.volleyball_sync_state
set next_attempt_at=least(next_attempt_at, coalesce(last_success_at, now())+interval '5 minutes', now()+interval '5 minutes');

revoke execute on function public.finish_volleyball_sync(jsonb) from public,anon,authenticated;
grant execute on function public.finish_volleyball_sync(jsonb) to service_role;
