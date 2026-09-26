create table public.volunteer_work_points (
 player_user_id uuid primary key references public.profiles(id),
 points integer not null default 0 check (points >= 0),
 version integer not null default 0 check (version >= 0),
 updated_by uuid not null references public.profiles(id),
 updated_at timestamptz not null default now()
);
alter table public.volunteer_work_points enable row level security;
revoke all on public.volunteer_work_points from anon, authenticated;
grant select on public.volunteer_work_points to authenticated;
create policy volunteer_points_read on public.volunteer_work_points for select to authenticated
 using (public.is_approved() and exists (
  select 1 from public.profiles p where p.id=player_user_id and p.base_role='player' and p.account_status='approved'
 ));

create function public.set_volunteer_work_points(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare
 target uuid=(data->>'id')::uuid;
 points_value numeric=(data->>'points')::numeric;
 current_version integer;
begin
 if not public.can_manage_event('volunteer_work') then raise exception 'not_authorized'; end if;
 if jsonb_typeof(data->'points') is distinct from 'number' or points_value < 0
  or points_value > 2147483647 or points_value <> trunc(points_value) then
  raise exception 'invalid_points';
 end if;
 -- Lock the player even before their first points record exists.
 perform 1 from public.profiles where id=target and base_role='player' and account_status='approved' for update;
 if not found then raise exception 'invalid_player'; end if;
 select version into current_version from public.volunteer_work_points where player_user_id=target for update;
 if (data->>'expected_version')::integer is distinct from coalesce(current_version,0) then raise exception 'stale_record'; end if;
 insert into public.volunteer_work_points(player_user_id,points,version,updated_by)
 values(target,points_value::integer,1,auth.uid())
 on conflict(player_user_id) do update set points=excluded.points,
  version=volunteer_work_points.version+1,updated_by=auth.uid(),updated_at=now();
 return target;
end $$;
revoke execute on function public.set_volunteer_work_points(jsonb) from public,anon;
grant execute on function public.set_volunteer_work_points(jsonb) to authenticated;
