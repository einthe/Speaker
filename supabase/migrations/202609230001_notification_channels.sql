alter table public.notification_rules add column email_enabled boolean not null default false;
alter table public.notifications drop constraint notifications_target_type_check;
alter table public.notifications add constraint notifications_target_type_check
 check(target_type in ('post','event','fine','volunteer_points'));

insert into public.notification_rules(trigger_key) values
 ('post_by_coach'),('event_by_coach'),('other_event_created'),
 ('post_comment_created'),('event_comment_created'),('comment_reply_created'),
 ('post_reaction_created'),('event_reaction_created'),('fine_received'),('volunteer_points_changed');
insert into public.notification_rules(trigger_key)
 select 'post_by_'||r from unnest(array['captain','vice_captain','social_media_manager','team_manager','travel_coordinator','social_coordinator','financial_manager','volunteer_work_coordinator','fine_manager']) r;
insert into public.notification_rules(trigger_key)
 select 'event_by_'||r from unnest(array['team_manager','travel_coordinator','social_coordinator','financial_manager','volunteer_work_coordinator']) r;
-- Preserve the previous behavior for coach posts when generic post notifications were enabled.
update public.notification_rules set enabled=(select enabled from public.notification_rules where trigger_key='normal_post_created') where trigger_key='post_by_coach';

create table public.notification_email_queue (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id),
 trigger_key text not null references public.notification_rules(trigger_key),
 title text not null, body text not null default '',
 target_type text not null check(target_type in ('post','event','fine','volunteer_points')),
 target_id uuid,
 status text not null default 'pending' check(status in ('pending','sending','sent','cancelled','failed')),
 attempts integer not null default 0,
 available_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 first_attempt_at timestamptz,
 lease_id uuid, lease_until timestamptz,
 recipient_email text, payload jsonb,
 provider_id text, sent_at timestamptz, last_error text
);
alter table public.notification_email_queue enable row level security;
revoke all on public.notification_email_queue from public,anon,authenticated;
create index notification_email_pending on public.notification_email_queue(available_at,created_at) where status in ('pending','sending');

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
   where trigger_key=data->>'trigger_key' and status='pending';
 end if;
end $$;

create or replace function public.emit_notification(trigger_name text, heading text, content text, target_kind text, target uuid, recipient uuid default null) returns void
language plpgsql security definer set search_path='' as $$
declare keys text[]=array[trigger_name]; role_key text; author_role public.base_role;
 in_app_key text; email_key text;
begin
 if target_kind='post' and trigger_name in ('normal_post_created','role_context_post_created') then
  select base_role_snapshot,secondary_role_context_key into author_role,role_key from public.posts where id=target;
  if role_key is not null then keys=array['post_by_'||role_key,'role_context_post_created'];
  elsif author_role='coach' then keys=array['post_by_coach']; end if;
 elsif target_kind='post' and trigger_name='lineup_published' then
  if exists(select 1 from public.posts where id=target and base_role_snapshot='coach') then
   keys=array['lineup_published','post_by_coach'];
  end if;
 elsif target_kind='event' and (trigger_name is null or trigger_name in ('match_created','practice_created','social_event_created','travel_event_created','team_logistics_event_created','finance_event_created','volunteer_event_created')) then
  select creator_base_role_snapshot,case event_type
   when 'social' then 'social_coordinator' when 'travel' then 'travel_coordinator'
   when 'team_logistics' then 'team_manager' when 'finance' then 'financial_manager'
   when 'volunteer_work' then 'volunteer_work_coordinator' end
   into author_role,role_key from public.schedule_events where id=target;
  keys=array[coalesce(trigger_name,'other_event_created')];
  if author_role='coach' then keys=array_prepend('event_by_coach',keys);
  elsif role_key is not null then keys=array_prepend('event_by_'||role_key,keys); end if;
 end if;
 select r.trigger_key into in_app_key from unnest(keys) with ordinality k(key,ord)
 join public.notification_rules r on r.trigger_key=k.key where r.enabled order by k.ord limit 1;
 select r.trigger_key into email_key from unnest(keys) with ordinality k(key,ord)
 join public.notification_rules r on r.trigger_key=k.key where r.email_enabled order by k.ord limit 1;
 if in_app_key is not null then
  insert into public.notifications(user_id,trigger_key,title,body,target_type,target_id)
  select id,in_app_key,heading,coalesce(content,''),target_kind,target from public.profiles
  where account_status='approved' and (recipient is not null or id is distinct from auth.uid()) and (recipient is null or id=recipient);
 end if;
 if email_key is not null then
  insert into public.notification_email_queue(user_id,trigger_key,title,body,target_type,target_id)
  select id,email_key,heading,coalesce(content,''),target_kind,target from public.profiles
  where account_status='approved' and (recipient is not null or id is distinct from auth.uid()) and (recipient is null or id=recipient);
 end if;
end $$;

create function public.notify_discussion_activity() returns trigger
language plpgsql security definer set search_path='' as $$
declare recipient uuid; heading text; rule text; kind text; target uuid;
begin
 kind=case when new.post_id is not null then 'post' else 'event' end;
 target=coalesce(new.post_id,new.event_id);
 if kind='post' then select author_user_id,title into recipient,heading from public.posts where id=target;
 else select created_by_user_id,title into recipient,heading from public.schedule_events where id=target; end if;
 if tg_table_name='discussion_comments' then
  if new.parent_id is not null then
   select author_user_id into recipient from public.discussion_comments where id=new.parent_id;
   rule='comment_reply_created';
   heading='Nytt svar på kommentaren din';
  else rule=kind||'_comment_created'; heading='Ny kommentar: '||heading; end if;
 else rule=kind||'_reaction_created'; heading='Ny reaksjon: '||heading; end if;
 if recipient is not null and recipient<>new.author_user_id then
  perform public.emit_notification(rule,heading,new.author_name_snapshot,kind,target,recipient);
 end if;
 return new;
end $$;
create trigger notify_new_comment after insert on public.discussion_comments for each row execute function public.notify_discussion_activity();
create trigger notify_new_reaction after insert on public.meme_reactions for each row execute function public.notify_discussion_activity();

create function public.notify_personal_award() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='fines' then
  perform public.emit_notification('fine_received','Du har fått en bot',new.type_name_snapshot||' · '||round(new.amount_ore/100.0)::text||' kr','fine',new.id,new.user_id);
 elsif (tg_op='INSERT' and new.points<>0) or (tg_op='UPDATE' and new.points is distinct from old.points) then
  perform public.emit_notification('volunteer_points_changed','Dugnadspoengene dine er oppdatert','Du har nå '||new.points||' dugnadspoeng.','volunteer_points',new.player_user_id,new.player_user_id);
 end if;
 return new;
end $$;
create trigger notify_new_fine after insert on public.fines for each row execute function public.notify_personal_award();
create trigger notify_changed_points after insert or update on public.volunteer_work_points for each row execute function public.notify_personal_award();

-- Queue functions are available only to the server's service role, never browser sessions.
create function public.claim_notification_emails(data jsonb) returns jsonb
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
   or not exists(select 1 from public.notification_rules where trigger_key=item.trigger_key and email_enabled)
   or (item.target_type='post' and not exists(select 1 from public.posts where id=item.target_id))
   or (item.target_type='event' and not exists(select 1 from public.schedule_events where id=item.target_id))
   or (item.target_type='fine' and not exists(select 1 from public.fines where id=item.target_id and cancelled_at is null)) then
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
create function public.prepare_notification_email(data jsonb) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 update public.notification_email_queue q set payload=coalesce(q.payload,data->'payload')
 where q.id=(data->>'id')::uuid and q.lease_id=(data->>'lease_id')::uuid and q.status='sending' and q.lease_until>now()
 and exists(select 1 from public.profiles p join auth.users u on u.id=p.id
  where p.id=q.user_id and p.account_status='approved' and u.email=q.recipient_email
  and (to_jsonb(u)->>'email_confirmed_at') is not null)
 and exists(select 1 from public.notification_rules r where r.trigger_key=q.trigger_key and r.email_enabled)
 and (q.target_type<>'post' or exists(select 1 from public.posts where id=q.target_id))
 and (q.target_type<>'event' or exists(select 1 from public.schedule_events where id=q.target_id))
 and (q.target_type<>'fine' or exists(select 1 from public.fines where id=q.target_id and cancelled_at is null))
 returning payload into result;
 return result;
end $$;
create function public.finish_notification_email(data jsonb) returns void
language plpgsql security definer set search_path='' as $$
begin
 update public.notification_email_queue set
  status=case when data->>'status'='sent' then 'sent' when data->>'status'='cancelled' then 'cancelled'
   when data->>'status'='failed' or attempts>=8 then 'failed' else 'pending' end,
  sent_at=case when data->>'status'='sent' then now() else null end,
  provider_id=data->>'provider_id',last_error=left(data->>'error',160),
  available_at=now()+make_interval(secs=>least(3600,30*power(2,attempts)::int)),lease_until=null
 where id=(data->>'id')::uuid and lease_id=(data->>'lease_id')::uuid and status='sending';
end $$;
revoke execute on function public.notify_discussion_activity(),public.notify_personal_award(),
 public.claim_notification_emails(jsonb),public.prepare_notification_email(jsonb),public.finish_notification_email(jsonb) from public,anon,authenticated;
grant execute on function public.claim_notification_emails(jsonb),public.prepare_notification_email(jsonb),public.finish_notification_email(jsonb) to service_role;

create function public.notification_email_status() returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if public.current_role() is distinct from 'admin' then raise exception 'not_authorized'; end if;
 return jsonb_build_object(
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
