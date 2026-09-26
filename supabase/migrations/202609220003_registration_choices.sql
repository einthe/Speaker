-- Signup choices are requests, not permissions. Only manage_user activates them.
create table public.registration_requests (
 user_id uuid primary key references public.profiles(id),
 base_role public.base_role not null check(base_role in ('player','coach')),
 jersey_number integer check(jersey_number between 0 and 99),
 roles public.secondary_role[] not null default '{}',
 check(cardinality(roles)<=7 and roles <@ array['social_media_manager','team_manager','travel_coordinator','social_coordinator','financial_manager','volunteer_work_coordinator','fine_manager']::public.secondary_role[]),
 check((base_role='player' and jersey_number is not null) or (base_role='coach' and jersey_number is null and cardinality(roles)=0))
);
alter table public.registration_requests enable row level security;
revoke all on public.registration_requests from anon,authenticated;
grant select on public.registration_requests to authenticated;
create policy registration_requests_read on public.registration_requests for select to authenticated
 using(user_id=auth.uid() or public.current_role()='admin');

create or replace function public.on_auth_user_created() returns trigger
language plpgsql security definer set search_path='' as $$
declare request jsonb=new.raw_user_meta_data->'registration'; requested_role text;
 requested_jersey numeric; requested_roles public.secondary_role[]='{}';
begin
 insert into public.profiles(id,full_name)
 values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'),''),'Nytt medlem'),100));
 -- Legacy/admin-created accounts need not supply registration choices.
 if request is null then return new; end if;
 if jsonb_typeof(request) is distinct from 'object' then raise exception 'invalid_registration'; end if;
 requested_role=request->>'base_role';
 if requested_role is null or requested_role not in ('player','coach') then raise exception 'invalid_registration'; end if;
 if requested_role='player' then
  if jsonb_typeof(request->'jersey_number') is distinct from 'number' then raise exception 'invalid_registration'; end if;
  requested_jersey=(request->>'jersey_number')::numeric;
  if requested_jersey<0 or requested_jersey>99 or requested_jersey<>trunc(requested_jersey) then raise exception 'invalid_registration'; end if;
  if jsonb_typeof(coalesce(request->'roles','[]'::jsonb)) is distinct from 'array' then raise exception 'invalid_registration'; end if;
  if jsonb_array_length(coalesce(request->'roles','[]'::jsonb))>7 then raise exception 'invalid_registration'; end if;
  select coalesce(array_agg(distinct r::public.secondary_role),'{}') into requested_roles
   from jsonb_array_elements_text(coalesce(request->'roles','[]'::jsonb)) r;
  if array_position(requested_roles,null) is not null then raise exception 'invalid_registration'; end if;
 end if;
 insert into public.registration_requests(user_id,base_role,jersey_number,roles)
 values(new.id,requested_role::public.base_role,requested_jersey::integer,requested_roles);
 return new;
end $$;

drop function public.admin_users();
create function public.admin_users() returns table(id uuid, full_name text, email text, base_role public.base_role, account_status public.account_status, created_at timestamptz, registration_request jsonb)
language plpgsql security definer set search_path='' as $$
begin
 if public.current_role() is distinct from 'admin' then raise exception 'not_authorized'; end if;
 return query select p.id,p.full_name,u.email::text,p.base_role,p.account_status,p.created_at,
  case when r.user_id is not null then jsonb_build_object('base_role',r.base_role,'jersey_number',r.jersey_number,'roles',r.roles) end
 from public.profiles p join auth.users u on u.id=p.id
 left join public.registration_requests r on r.user_id=p.id
 where p.base_role is distinct from 'admin' order by p.created_at desc;
end $$;
revoke execute on function public.admin_users() from public,anon;
grant execute on function public.admin_users() to authenticated;
