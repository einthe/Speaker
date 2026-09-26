create function public.can_manage_fines() returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(public.current_role()='admin' or (public.current_role()='player' and exists (
  select 1 from public.player_secondary_roles where player_user_id=auth.uid() and role_key='fine_manager'
 )),false);
$$;

create table public.fine_types (
 id uuid primary key default gen_random_uuid(),
 name text not null check (char_length(trim(name)) between 1 and 100),
 description text not null default '' check (char_length(description)<=2000),
 amount_ore integer not null check (amount_ore between 1 and 100000000),
 active boolean not null default true,
 version integer not null default 0 check (version>=0)
);
create unique index fine_types_name on public.fine_types(lower(trim(name)));
create table public.fine_rules (
 id boolean primary key default true check(id),
 body text not null default '' check (char_length(body)<=10000),
 version integer not null default 0 check (version>=0)
);
insert into public.fine_rules(id) values(true);
create table public.fines (
 id uuid primary key,
 user_id uuid not null references public.profiles(id),
 fine_type_id uuid not null references public.fine_types(id),
 fine_type_version integer not null,
 type_name_snapshot text not null,
 amount_ore integer not null check(amount_ore between 1 and 100000000),
 note text not null default '' check(char_length(note)<=1000),
 issued_by uuid not null references public.profiles(id),
 issued_by_name_snapshot text not null,
 created_at timestamptz not null default now(),
 cancelled_at timestamptz,
 cancelled_by uuid references public.profiles(id),
 check ((cancelled_at is null)=(cancelled_by is null))
);
create index fines_user_date on public.fines(user_id,created_at desc,id);

do $$ declare t text; begin
 foreach t in array array['fine_types','fine_rules','fines'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy fine_types_read on public.fine_types for select to authenticated using(public.is_approved());
create policy fine_rules_read on public.fine_rules for select to authenticated using(public.is_approved());
create policy fines_read on public.fines for select to authenticated using(public.is_approved() and exists (
 select 1 from public.profiles p where p.id=user_id and p.account_status='approved' and p.base_role in ('player','coach')
));

create function public.save_fine_type(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid=(data->>'id')::uuid; amount numeric=(data->>'amount_ore')::numeric; current_version integer;
begin
 if not public.can_manage_fines() then raise exception 'not_authorized'; end if;
 if jsonb_typeof(data->'amount_ore') is distinct from 'number' or amount<1 or amount>100000000 or amount<>trunc(amount)
  or jsonb_typeof(data->'active') is distinct from 'boolean' then raise exception 'invalid_fine_type'; end if;
 if target is null then
  insert into public.fine_types(name,description,amount_ore,active)
  values(trim(data->>'name'),trim(coalesce(data->>'description','')),amount::integer,(data->>'active')::boolean) returning id into target;
 else
  select version into current_version from public.fine_types where id=target for update;
  if not found then raise exception 'invalid_fine_type'; end if;
  if (data->>'expected_version')::integer is distinct from current_version then raise exception 'stale_record'; end if;
  update public.fine_types set name=trim(data->>'name'),description=trim(coalesce(data->>'description','')),
   amount_ore=amount::integer,active=(data->>'active')::boolean,version=version+1 where id=target;
 end if;
 return target;
end $$;

create function public.save_fine_rules(data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare current_version integer;
begin
 if not public.can_manage_fines() then raise exception 'not_authorized'; end if;
 select version into current_version from public.fine_rules where id=true for update;
 if (data->>'expected_version')::integer is distinct from current_version then raise exception 'stale_record'; end if;
 update public.fine_rules set body=trim(data->>'body'),version=version+1 where id=true;
end $$;

create function public.apply_fine(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare request_id uuid=(data->>'id')::uuid; recipient uuid=(data->>'user_id')::uuid;
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
  insert into public.fines(id,user_id,fine_type_id,fine_type_version,type_name_snapshot,amount_ore,note,issued_by,issued_by_name_snapshot)
  values(request_id,recipient,kind.id,kind.version,kind.name,kind.amount_ore,note_value,auth.uid(),
   (select full_name from public.profiles where id=auth.uid())) on conflict(id) do nothing;
  select * into previous from public.fines where id=request_id;
 end if;
 -- Retries of the same submission must never charge the recipient twice.
 if previous.issued_by is distinct from auth.uid() or previous.user_id is distinct from recipient
  or previous.fine_type_id is distinct from (data->>'fine_type_id')::uuid
  or previous.fine_type_version is distinct from (data->>'expected_type_version')::integer
  or previous.note is distinct from note_value then raise exception 'invalid_fine_request'; end if;
 return request_id;
end $$;

create function public.cancel_fine(target uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not public.can_manage_fines() then raise exception 'not_authorized'; end if;
 update public.fines set cancelled_at=coalesce(cancelled_at,now()),cancelled_by=coalesce(cancelled_by,auth.uid()) where id=target;
 if not found then raise exception 'invalid_fine'; end if;
end $$;

create function public.get_fines() returns jsonb
language plpgsql stable security invoker set search_path='' as $$
declare members jsonb; types jsonb; rules jsonb;
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
 return jsonb_build_object('members',members,'types',types,'rules',rules);
end $$;

revoke execute on function public.can_manage_fines(),public.save_fine_type(jsonb),public.save_fine_rules(jsonb),public.apply_fine(jsonb),public.cancel_fine(uuid),public.get_fines() from public,anon;
grant execute on function public.can_manage_fines(),public.save_fine_type(jsonb),public.save_fine_rules(jsonb),public.apply_fine(jsonb),public.cancel_fine(uuid),public.get_fines() to authenticated;

-- Preserve role-post snapshots for the newly added responsibility.
create or replace function public.save_post(data jsonb) returns uuid language plpgsql security definer set search_path = '' as $$
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
   label := case context when 'captain' then 'Kaptein' when 'vice_captain' then 'Visekaptein' when 'social_media_manager' then 'SoMe' when 'team_manager' then 'Oppmann' when 'travel_coordinator' then 'Reiseansvarlig' when 'social_coordinator' then 'Sosialansvarlig' when 'financial_manager' then 'Økonomiansvarlig' when 'volunteer_work_coordinator' then 'Dugnadsansvarlig' when 'fine_manager' then 'Botsjef' end;
  end if;
  insert into public.posts(author_user_id,author_name_snapshot,post_type,title,body,base_role_snapshot,secondary_role_context_key,secondary_role_context_label_snapshot)
  values(actor.id,actor.full_name,'normal',trim(data->>'title'),trim(data->>'body'),actor.base_role,context,label) returning id into target;
  perform public.emit_notification(case when context is null then 'normal_post_created' else 'role_context_post_created' end,data->>'title',actor.full_name,'post',target);
 end if;
 return target;
end $$;
