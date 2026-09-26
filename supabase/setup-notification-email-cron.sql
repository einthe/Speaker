-- Run once in the hosted Supabase SQL editor after adding these Vault secrets:
-- notification_email_url = https://YOUR-DOMAIN/api/cron/notifications
-- notification_email_cron_secret = the same CRON_SECRET configured in Vercel
-- Enable pg_cron (Cron) and pg_net in Supabase first. No secret values belong in this file.
select cron.schedule('notification-email-delivery','*/5 * * * *',$job$
 select net.http_post(
  url := (select decrypted_secret from vault.decrypted_secrets where name='notification_email_url'),
  headers := jsonb_build_object('Content-Type','application/json','Authorization',
   'Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='notification_email_cron_secret')),
  body := '{}'::jsonb,
  timeout_milliseconds := 55000
 );
$job$);
