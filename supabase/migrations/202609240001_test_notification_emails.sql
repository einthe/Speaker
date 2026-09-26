-- Explicit admin simulations use the normal private delivery queue.
alter table public.notification_email_queue
 add column test_requested_by uuid references public.profiles(id),
 add column test_request_id uuid,
 add constraint notification_email_test_identity check ((test_requested_by is null) = (test_request_id is null)),
 add constraint notification_email_test_request unique(test_requested_by,test_request_id);
create index notification_email_test_recent on public.notification_email_queue(test_requested_by,created_at) where test_requested_by is not null;

create function public.send_test_notification_email(data jsonb) returns uuid
language plpgsql security definer set search_path='' as $$
declare recipient uuid := (data->>'user_id')::uuid; request_id uuid := (data->>'request_id')::uuid;
 existing public.notification_email_queue; result uuid; email text;
begin
 if public.current_role() is distinct from 'admin' then raise exception 'not_authorized'; end if;
 -- Serialize submissions from this admin, including concurrent double clicks.
 perform 1 from public.profiles where id=auth.uid() for update;
 if recipient is null or request_id is null
  or not exists(select 1 from public.notification_rules where trigger_key=data->>'trigger_key')
  or coalesce(length(btrim(data->>'title')),0) not between 1 and 160
  or coalesce(length(btrim(data->>'body')),0) not between 1 and 1000
  or coalesce(data->>'target_type','') not in ('post','event','fine','volunteer_points') then
  raise exception 'invalid_test_notification';
 end if;
 select * into existing from public.notification_email_queue
 where test_requested_by=auth.uid() and test_request_id=request_id;
 if found then
  if existing.user_id<>recipient or existing.trigger_key<>data->>'trigger_key' then
   raise exception 'invalid_test_notification';
  end if;
  return existing.id;
 end if;
 select u.email into email from auth.users u join public.profiles p on p.id=u.id
 where p.id=recipient and p.account_status='approved' and nullif(btrim(u.email),'') is not null
 and (to_jsonb(u)->>'email_confirmed_at') is not null;
 if email is null then raise exception 'invalid_test_recipient'; end if;
 if exists(select 1 from public.notification_email_queue
  where test_requested_by=auth.uid() and created_at>now()-interval '10 seconds') then
  raise exception 'test_notification_rate_limit';
 end if;
 insert into public.notification_email_queue(user_id,trigger_key,title,body,target_type,recipient_email,test_requested_by,test_request_id)
 values(recipient,data->>'trigger_key','[TEST] '||btrim(data->>'title'),
  'Dette er en test fra administrator. Ingen aktivitet eller endring er registrert. Eksempel: '||btrim(data->>'body'),
  data->>'target_type',email,auth.uid(),request_id) returning id into result;
 return result;
end $$;
revoke execute on function public.send_test_notification_email(jsonb) from public,anon;
grant execute on function public.send_test_notification_email(jsonb) to authenticated;

create or replace function public.set_notification_rule(data jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 if public.current_role() is distinct from 'admin' then raise exception 'not_authorized'; end if;
 if jsonb_typeof(data->'enabled') is distinct from 'boolean'
  or (data ? 'email_enabled' and jsonb_typeof(data->'email_enabled') is distinct from 'boolean') then
  raise exception 'invalid_notification_rule';
 end if;
 update public.notification_rules set enabled=(data->>'enabled')::boolean,
  email_enabled=coalesce((data->>'email_enabled')::boolean,email_enabled),updated_at=now(),updated_by=auth.uid()
 where trigger_key=data->>'trigger_key';
 if not found then raise exception 'invalid_notification_rule'; end if;
 if data->>'email_enabled'='false' then
  update public.notification_email_queue set status='cancelled',last_error='rule_disabled'
   where trigger_key=data->>'trigger_key' and status='pending' and test_requested_by is null;
 end if;
end $$;

create or replace function public.claim_notification_emails(data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare item public.notification_email_queue; result jsonb='[]'; email text; verified boolean;
begin
 for item in select * from public.notification_email_queue q
  where (q.status='pending' and q.available_at<=now()) or (q.status='sending' and q.lease_until<now())
  order by q.created_at for update skip locked limit least(greatest(coalesce((data->>'limit')::int,20),1),50)
 loop
  select u.email,(to_jsonb(u)->>'email_confirmed_at') is not null into email,verified
   from auth.users u join public.profiles p on p.id=u.id where u.id=item.user_id and p.account_status='approved';
  if email is null or btrim(email)='' or not coalesce(verified,false)
   or (item.recipient_email is not null and item.recipient_email<>email)
   or (item.test_requested_by is null and not exists(select 1 from public.notification_rules where trigger_key=item.trigger_key and email_enabled))
   or (item.test_requested_by is null and item.target_type='post' and not exists(select 1 from public.posts where id=item.target_id))
   or (item.test_requested_by is null and item.target_type='event' and not exists(select 1 from public.schedule_events where id=item.target_id))
   or (item.test_requested_by is null and item.target_type='fine' and not exists(select 1 from public.fines where id=item.target_id and cancelled_at is null)) then
   update public.notification_email_queue set status='cancelled',last_error='recipient_or_content_unavailable' where id=item.id;
  elsif item.attempts>=8 or item.first_attempt_at<now()-interval '23 hours' then
   -- Resend keeps idempotency keys for 24h. Never retry uncertain sends beyond that window.
   update public.notification_email_queue set status='failed',last_error='retry_window_exhausted' where id=item.id;
  else
   update public.notification_email_queue set status='sending',attempts=attempts+1,
    first_attempt_at=coalesce(first_attempt_at,now()),recipient_email=email,
    lease_id=gen_random_uuid(),lease_until=now()+interval '2 minutes'
    where id=item.id returning * into item;
   result=result||jsonb_build_array(to_jsonb(item));
  end if;
 end loop;
 return result;
end $$;
create or replace function public.prepare_notification_email(data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update public.notification_email_queue q set payload=coalesce(q.payload,data->'payload')
 where q.id=(data->>'id')::uuid and q.lease_id=(data->>'lease_id')::uuid and q.status='sending' and q.lease_until>now()
 and exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=q.user_id and p.account_status='approved' and u.email=q.recipient_email
  and (to_jsonb(u)->>'email_confirmed_at') is not null)
 and (q.test_requested_by is not null or exists(select 1 from public.notification_rules r where r.trigger_key=q.trigger_key and r.email_enabled))
 and (q.test_requested_by is not null or q.target_type<>'post' or exists(select 1 from public.posts where id=q.target_id))
 and (q.test_requested_by is not null or q.target_type<>'event' or exists(select 1 from public.schedule_events where id=q.target_id))
 and (q.test_requested_by is not null or q.target_type<>'fine' or exists(select 1 from public.fines where id=q.target_id and cancelled_at is null))
 returning payload into result;
 return result;
end $$;
create or replace function public.notification_email_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if public.current_role() is distinct from 'admin' then raise exception 'not_authorized'; end if;
 return jsonb_build_object(
  'recipients',coalesce((select jsonb_agg(t) from (
    select p.id,p.full_name,u.email from public.profiles p join auth.users u on u.id=p.id
    where p.account_status='approved' and nullif(btrim(u.email),'') is not null
    and (to_jsonb(u)->>'email_confirmed_at') is not null order by p.full_name,p.id
  ) t),'[]'::jsonb),
  'pending',(select count(*) from public.notification_email_queue where status in ('pending','sending')),
  'sent',(select count(*) from public.notification_email_queue where status='sent'),
  'failed',(select count(*) from public.notification_email_queue where status='failed'),
  'recent',coalesce((select jsonb_agg(t) from (
    select q.id,q.title,q.body,q.status,q.last_error,q.created_at,p.full_name
    from public.notification_email_queue q join public.profiles p on p.id=q.user_id
    order by q.created_at desc,q.id limit 5
  ) t),'[]'::jsonb));
end $$;
revoke execute on function public.notification_email_status() from public,anon;
grant execute on function public.notification_email_status() to authenticated;

revoke execute on function public.claim_notification_emails(jsonb),public.prepare_notification_email(jsonb) from public,anon,authenticated;
grant execute on function public.claim_notification_emails(jsonb),public.prepare_notification_email(jsonb) to service_role;
