-- Save a settings card atomically, retaining the existing validation and queue cancellation.
create function public.set_notification_rules(data jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare rule jsonb;
begin
 if public.current_role() is distinct from 'admin' then raise exception 'not_authorized'; end if;
 if jsonb_typeof(data) is distinct from 'array' then raise exception 'invalid_notification_rule'; end if;
 if jsonb_array_length(data) not between 1 and 100 then raise exception 'invalid_notification_rule'; end if;
 if exists (
  select 1 from jsonb_array_elements(data) item group by item->>'trigger_key' having count(*)>1
 ) then raise exception 'invalid_notification_rule'; end if;
 for rule in select value from jsonb_array_elements(data) order by value->>'trigger_key'
 loop
  perform public.set_notification_rule(rule);
 end loop;
end $$;
revoke execute on function public.set_notification_rules(jsonb) from public,anon;
grant execute on function public.set_notification_rules(jsonb) to authenticated;
