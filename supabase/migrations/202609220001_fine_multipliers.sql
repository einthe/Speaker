create table public.fine_multipliers (
 id uuid primary key default gen_random_uuid(),
 name text not null check(char_length(trim(name)) between 1 and 100),
 description text not null default '' check(char_length(description)<=2000),
 factor integer not null check(factor between 1 and 100),
 active boolean not null default true,
 version integer not null default 0 check(version>=0)
);
create unique index fine_multipliers_name on public.fine_multipliers(lower(trim(name)));
alter table public.fine_multipliers enable row level security;
revoke all on public.fine_multipliers from anon,authenticated;
grant select on public.fine_multipliers to authenticated;
create policy fine_multipliers_read on public.fine_multipliers for select to authenticated using(public.is_approved());

alter table public.fines
 add column base_amount_ore integer,
 add column multiplier_id uuid references public.fine_multipliers(id),
 add column multiplier_version integer,
 add column multiplier_name_snapshot text not null default 'Vanlig',
 add column multiplier_factor_snapshot integer not null default 1 check(multiplier_factor_snapshot between 1 and 100);
update public.fines set base_amount_ore=amount_ore;
alter table public.fines
 alter column base_amount_ore set not null,
 add constraint fine_base_amount_positive check(base_amount_ore between 1 and 100000000),
 add constraint fine_multiplier_amount check(amount_ore::bigint=base_amount_ore::bigint*multiplier_factor_snapshot);

create function public.save_fine_multiplier(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid=(data->>'id')::uuid; factor_value numeric=(data->>'factor')::numeric; current_version integer;
begin
 if not public.can_manage_fines() then raise exception 'not_authorized'; end if;
 if jsonb_typeof(data->'factor') is distinct from 'number' or factor_value<1 or factor_value>100 or factor_value<>trunc(factor_value)
  or jsonb_typeof(data->'active') is distinct from 'boolean' then raise exception 'invalid_fine_multiplier'; end if;
 if target is null then
  insert into public.fine_multipliers(name,description,factor,active)
  values(trim(data->>'name'),trim(coalesce(data->>'description','')),factor_value::integer,(data->>'active')::boolean) returning id into target;
 else
  select version into current_version from public.fine_multipliers where id=target for update;
  if not found then raise exception 'invalid_fine_multiplier'; end if;
  if (data->>'expected_version')::integer is distinct from current_version then raise exception 'stale_record'; end if;
  update public.fine_multipliers set name=trim(data->>'name'),description=trim(coalesce(data->>'description','')),
   factor=factor_value::integer,active=(data->>'active')::boolean,version=version+1 where id=target;
 end if;
 return target;
end $$;
revoke execute on function public.save_fine_multiplier(jsonb) from public,anon;
grant execute on function public.save_fine_multiplier(jsonb) to authenticated;

create or replace function public.apply_fine(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare request_id uuid=(data->>'id')::uuid; recipient uuid=(data->>'user_id')::uuid;
 multiplier_id uuid=(data->>'multiplier_id')::uuid;
 extra public.fine_multipliers; factor integer=1; extra_name text='Vanlig'; extra_version integer;
 base_amount integer; total_amount bigint;
 kind public.fine_types; previous public.fines; note_value text=trim(coalesce(data->>'note',''));
begin
 if not public.can_manage_fines() then raise exception 'not_authorized'; end if;
 if request_id is null or char_length(note_value)>1000 then raise exception 'invalid_fine'; end if;
 select * into previous from public.fines where id=request_id;
 if not found then
  perform 1 from public.profiles where id=recipient and account_status='approved' and base_role in ('player','coach') for share;
  if not found then raise exception 'invalid_fine_recipient'; end if;
  select * into kind from public.fine_types where id=(data->>'fine_type_id')::uuid for share;
  if not found or not kind.active then raise exception 'invalid_fine_type'; end if;
  if (data->>'expected_type_version')::integer is distinct from kind.version then raise exception 'stale_record'; end if;
  if multiplier_id is not null then
   select * into extra from public.fine_multipliers where id=multiplier_id for share;
   if not found or not extra.active then raise exception 'invalid_fine_multiplier'; end if;
   if (data->>'expected_multiplier_version')::integer is distinct from extra.version then raise exception 'stale_record'; end if;
   factor=extra.factor; extra_name=extra.name; extra_version=extra.version;
  elsif (data->>'expected_multiplier_version') is not null then
   raise exception 'invalid_fine_multiplier';
  end if;
  base_amount=kind.amount_ore;
  total_amount=base_amount::bigint*factor;
  if total_amount>100000000 then raise exception 'fine_amount_too_large'; end if;
  insert into public.fines(id,user_id,fine_type_id,fine_type_version,type_name_snapshot,amount_ore,note,issued_by,issued_by_name_snapshot,base_amount_ore,multiplier_id,multiplier_version,multiplier_name_snapshot,multiplier_factor_snapshot)
  values(request_id,recipient,kind.id,kind.version,kind.name,total_amount,note_value,auth.uid(),
   (select full_name from public.profiles where id=auth.uid()),base_amount,multiplier_id,extra_version,extra_name,factor) on conflict(id) do nothing;
  select * into previous from public.fines where id=request_id;
 end if;
 -- Retries of the same submission must never charge the recipient twice.
 if previous.issued_by is distinct from auth.uid() or previous.user_id is distinct from recipient
  or previous.fine_type_id is distinct from (data->>'fine_type_id')::uuid
  or previous.fine_type_version is distinct from (data->>'expected_type_version')::integer
  or previous.multiplier_id is distinct from multiplier_id
  or previous.multiplier_version is distinct from (data->>'expected_multiplier_version')::integer
  or previous.note is distinct from note_value then raise exception 'invalid_fine_request'; end if;
 return request_id;
end $$;


create or replace function public.get_fines() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare members jsonb; types jsonb; rules jsonb; multipliers jsonb;
begin
 if not public.is_approved() then raise exception 'not_authorized'; end if;
 select coalesce(jsonb_agg(to_jsonb(r) order by r.total_ore desc,r.full_name,r.id),'[]'::jsonb) into members from (
  select p.id,p.full_name,p.base_role,
   coalesce((select sum(f.amount_ore) from public.fines f where f.user_id=p.id and f.cancelled_at is null),0) as total_ore,
   coalesce((select jsonb_agg(to_jsonb(f) order by f.created_at desc,f.id) from public.fines f where f.user_id=p.id),'[]'::jsonb) as fines
  from public.profiles p where p.account_status='approved' and p.base_role in ('player','coach')
 ) r;
 select coalesce(jsonb_agg(to_jsonb(t) order by t.active desc,t.name,t.id),'[]'::jsonb) into types from public.fine_types t;
 select jsonb_build_object('body',body,'version',version) into rules from public.fine_rules where id=true;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.active desc,m.name,m.id),'[]'::jsonb) into multipliers from public.fine_multipliers m;
 return jsonb_build_object('multipliers',multipliers,'members',members,'types',types,'rules',rules);
end $$;

