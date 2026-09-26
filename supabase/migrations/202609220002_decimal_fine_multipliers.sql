alter table public.fines drop constraint fine_multiplier_amount;
alter table public.fine_multipliers
 drop constraint fine_multipliers_factor_check,
 alter column factor type numeric using factor::numeric,
 add constraint fine_multipliers_factor_check check(factor between 0.01 and 100 and factor=round(factor,2));
alter table public.fines
 drop constraint fines_multiplier_factor_snapshot_check,
 alter column multiplier_factor_snapshot type numeric using multiplier_factor_snapshot::numeric,
 add constraint fines_multiplier_factor_snapshot_check check(multiplier_factor_snapshot between 0.01 and 100 and multiplier_factor_snapshot=round(multiplier_factor_snapshot,2)),
 add constraint fine_multiplier_amount check(amount_ore=round(base_amount_ore::numeric*multiplier_factor_snapshot));

create or replace function public.save_fine_multiplier(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare target uuid=(data->>'id')::uuid; factor_value numeric=(data->>'factor')::numeric; current_version integer;
begin
 if not public.can_manage_fines() then raise exception 'not_authorized'; end if;
 if jsonb_typeof(data->'factor') is distinct from 'number' or factor_value<0.01 or factor_value>100 or factor_value<>round(factor_value,2)
  or jsonb_typeof(data->'active') is distinct from 'boolean' then raise exception 'invalid_fine_multiplier'; end if;
 if target is null then
  insert into public.fine_multipliers(name,description,factor,active)
  values(trim(data->>'name'),trim(coalesce(data->>'description','')),factor_value,(data->>'active')::boolean) returning id into target;
 else
  select version into current_version from public.fine_multipliers where id=target for update;
  if not found then raise exception 'invalid_fine_multiplier'; end if;
  if (data->>'expected_version')::integer is distinct from current_version then raise exception 'stale_record'; end if;
  update public.fine_multipliers set name=trim(data->>'name'),description=trim(coalesce(data->>'description','')),
   factor=factor_value,active=(data->>'active')::boolean,version=version+1 where id=target;
 end if;
 return target;
end $$;

create or replace function public.apply_fine(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare request_id uuid=(data->>'id')::uuid; recipient uuid=(data->>'user_id')::uuid;
 multiplier_id uuid=(data->>'multiplier_id')::uuid;
 extra public.fine_multipliers; factor numeric=1; extra_name text='Vanlig'; extra_version integer;
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
  total_amount=round(base_amount::numeric*factor);
  if total_amount<1 then raise exception 'fine_amount_too_small'; end if;
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


