alter table public.schedule_events add column external_title_override text
 check (external_title_override is null or length(trim(external_title_override)) between 1 and 160);

create function public.preserve_imported_match_title() returns trigger
language plpgsql set search_path='' as $$
begin
 if new.external_source='volleyballlive' and new.external_title_override is not null then
  new.title=new.external_title_override;
 end if;
 return new;
end $$;
create trigger preserve_imported_match_title before insert or update on public.schedule_events
 for each row execute function public.preserve_imported_match_title();

-- All matches currently use neutral venues, including manual and future imports.
create function public.neutral_match_venue() returns trigger
language plpgsql set search_path='' as $$
begin
 new.home_away='neutral';
 return new;
end $$;
create trigger neutral_match_venue before insert or update on public.match_details
 for each row execute function public.neutral_match_venue();
update public.match_details set home_away='neutral';

-- Repair previously imported labels without replacing events or attached lineups.
update public.match_details m set opponent=case
 when m.opponent ~* '\s*-\s*[KM]\s*1$' then regexp_replace(m.opponent,'\s*-\s*[KM]\s*1$','','i')
 else regexp_replace(m.opponent,'\s*-\s*[KM]\s*(\d+)$',' \1','i') end
from public.schedule_events e where e.id=m.event_id and e.external_source='volleyballlive';
update public.schedule_events e set title='NTNUI D2A – ' || m.opponent, updated_at=now()
from public.match_details m where m.event_id=e.id and e.external_source='volleyballlive';

create function public.set_imported_match_title(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 old public.schedule_events;
 title_value text=trim(data->>'title');
begin
 if not public.can_coach() then raise exception 'not_authorized'; end if;
 select * into old from public.schedule_events
  where id=(data->>'id')::uuid and external_source='volleyballlive' and event_type='match' for update;
 if not found then raise exception 'not_found'; end if;
 if (data->>'expected_updated_at')::timestamptz is distinct from old.updated_at then raise exception 'stale_record'; end if;
 if title_value is null or length(title_value) not between 1 and 160 then raise exception 'invalid_title'; end if;
 update public.schedule_events set title=title_value,external_title_override=title_value,updated_at=now() where id=old.id;
 return old.id;
end $$;
revoke execute on function public.set_imported_match_title(jsonb) from public,anon;
grant execute on function public.set_imported_match_title(jsonb) to authenticated;
revoke execute on function public.preserve_imported_match_title(),public.neutral_match_venue() from public,anon,authenticated;
