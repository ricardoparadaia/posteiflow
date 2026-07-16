-- PosteiFlow — agendamento dos jobs via pg_cron + pg_net
--
-- Rode este arquivo DEPOIS de:
--   1. Rodar 0001_init.sql
--   2. Fazer o deploy do app (Vercel) e ter a URL pública (ex: https://posteiflow.vercel.app)
--   3. Definir CRON_SECRET nas variáveis de ambiente do app
--
-- Troque os dois placeholders abaixo antes de rodar:
--   <APP_URL>      -> ex: https://posteiflow.vercel.app  (sem barra no final)
--   <CRON_SECRET>  -> o mesmo valor da env var CRON_SECRET do app
--
-- Para testar localmente antes do deploy, você pode expor o `next dev` com um
-- túnel (ex: ngrok/cloudflared) e usar essa URL temporária aqui — ou, mais
-- simples, chamar as rotas manualmente com curl/Postman durante o
-- desenvolvimento (veja o README, seção "Rodando localmente").

-- pg_cron fixa o schema "cron" no próprio control file da extensão — não dá
-- pra passar "with schema" pra ele (erraria). pg_net vai em "extensions",
-- que é o padrão do Supabase quando habilitado pela UI.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;

-- 1) Scheduler de publicação — roda a cada minuto
--    Verifica posts pendentes na hora, cria container / faz polling / publica
select cron.schedule(
  'posteiflow-scheduler',
  '* * * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/scheduler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- 2) Coleta de métricas — roda a cada 2 horas
--    Busca views/likes/comments/shares dos Reels publicados recentes
select cron.schedule(
  'posteiflow-analytics',
  '0 */2 * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/analytics',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- 3) Checagem diária do token do Instagram — roda 1x por dia às 09:00 UTC
--    Alerta via Telegram (se configurado) ~7 dias antes do token expirar
select cron.schedule(
  'posteiflow-token-check',
  '0 9 * * *',
  $$
  select net.http_post(
    url := '<APP_URL>/api/cron/token-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <CRON_SECRET>'
    ),
    body := '{}'::jsonb
  ) as request_id;
  $$
);

-- Para conferir os jobs agendados:
--   select * from cron.job;
-- Para ver o histórico de execuções:
--   select * from cron.job_run_details order by start_time desc limit 20;
-- Para remover um job (ex: antes de reagendar com uma nova URL):
--   select cron.unschedule('posteiflow-scheduler');
