# PosteiFlow

Dashboard pessoal para agendar Reels no Instagram (@humordeporco) e acompanhar métricas. MVP v1.0 — escopo estritamente limitado a **agendar Reels** e **ver métricas**.

Stack: Next.js (App Router) + TypeScript + Tailwind + shadcn/ui, Supabase (Postgres + Storage), Instagram API with Instagram Login (`graph.instagram.com`), deploy na Vercel (plano Hobby).

## Como o scheduler roda a cada minuto

A Vercel é serverless — não há processo contínuo rodando em background. O agendamento funciona assim:

- **Gatilho:** um job `pg_cron` no Postgres do Supabase chama, a cada minuto, uma API route (`/api/cron/scheduler`) via `pg_net`, protegida por um `CRON_SECRET`. Isso independe do plano da Vercel (não precisa do Pro).
- **Execução em passos curtos:** para não estourar o timeout de uma função serverless, o worker nunca fica em polling bloqueante. Cada post agendado avança no máximo um passo por minuto na máquina de estados:
  `pendente` → (cria o container REELS) → `processando` → (container `FINISHED`, publica) → `publicado`, ou `erro` se algo falhar.
- **`erro` é um estado terminal** — o scheduler nunca reprocessa um post em erro sozinho (sem retry automático em loop). Se quiser tentar de novo, use o botão "Reprocessar" na tela Agendar (ele volta o post para `pendente`, limpando `ig_container_id`/`ig_media_id`/`error_message`, mantendo o horário original).
- **Timeout de container travado:** se um post fica em `processando` por mais de 30 minutos sem o container sair de `IN_PROGRESS` do lado do Instagram, ele é marcado `erro` automaticamente (ajustável via `PROCESSING_TIMEOUT_MS` em `scheduler.ts`).
- **Lock contra ticks sobrepostos:** cada execução reivindica um lock atômico (tabela `scheduler_lock`, janela de 55s) antes de processar qualquer post — se um tick anterior ainda estiver rodando quando o próximo disparar, o novo tick não faz nada e sai (visível como `skipped` no retorno da rota).
- Veja o código em [`src/lib/scheduler.ts`](src/lib/scheduler.ts).

Outros dois jobs `pg_cron` cuidam de:
- **Coleta de métricas** (`/api/cron/analytics`) a cada 2h — busca views/likes/comments/shares de cada Reels publicado.
- **Checagem de expiração de token** (`/api/cron/token-check`) 1x/dia — alerta no Telegram (se configurado) ~7 dias antes do token expirar.

## 1. Pré-requisitos

- Node.js 18+
- Um projeto Supabase novo e dedicado (Postgres + Storage)
- App "PosteiFlow-IG" já criado no Meta for Developers, com o produto **Instagram API with Instagram Login** habilitado
- Um token de acesso de curta duração gerado no painel do Meta para @humordeporco

## 2. Configurar o `.env`

Copie o template e preencha:

```bash
cp .env.example .env.local
```

Variáveis:

| Variável | Onde conseguir | Observação |
|---|---|---|
| `SUPABASE_URL` | Supabase > Settings > API > Project URL | |
| `SUPABASE_SERVICE_KEY` | Supabase > Settings > API > `service_role` key | Secreta — nunca commitar |
| `NEXT_PUBLIC_SUPABASE_URL` | mesmo valor de `SUPABASE_URL` | Exposta ao browser (só para upload direto ao Storage — veja nota abaixo) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase > Settings > API > `anon` / `public` key | Segura para expor: RLS está habilitado sem policies em todas as tabelas |
| `IG_APP_ID` | Meta for Developers > app PosteiFlow-IG | Guardado como referência; não é usado diretamente pelas chamadas implementadas |
| `IG_APP_SECRET` | Meta for Developers > app PosteiFlow-IG | Usado na troca de token curto → longo |
| `IG_USER_ID` | `17841448692415302` | ID da conta @humordeporco |
| `IG_ACCESS_TOKEN` | Painel do Meta (token de curta duração, ~1h) | Só é lido ao clicar em "Conectar" em Configurações |
| `IG_GRAPH_API_VERSION` | opcional, padrão `v25.0` | Ajuste se a Meta depreciar a versão. Só afeta endpoints versionados (container, publish, insights, conta) — os de token (exchange/refresh) nunca levam versão na URL |
| `APP_USERNAME` / `APP_PASSWORD` | você escolhe | Login do Basic Auth que protege o app inteiro — veja seção 8 |
| `CRON_SECRET` | gere um valor aleatório qualquer | Protege as rotas `/api/cron/*` |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` | opcional (bot já usado em outro projeto) | Deixe em branco para desativar o alerta sem erro |

**Por que existe uma anon key no client, se só me pediu `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`?** A Content Publishing API do Instagram exige URL pública do vídeo, e a Vercel limita o tamanho do corpo de requisição de uma Serverless Function bem abaixo do tamanho normal de um Reels. Por isso o vídeo vai **direto do browser para o Supabase Storage** via signed upload URL (gerada no servidor com a service key), e não passa pela nossa API — daí a necessidade de uma chave pública no client só para essa chamada de upload.

## 3. Rodar a migration SQL

No SQL Editor do Supabase, rode nesta ordem (não é executado automaticamente por este projeto):

1. `supabase/migrations/0001_init.sql` — cria as tabelas (`users`, `instagram_accounts`, `videos`, `posts`, `analytics`, `account_stats_daily`, `scheduler_lock`) com RLS habilitado.
2. `supabase/migrations/0003_storage_bucket.sql` — cria o bucket público `videos` (alternativa por SQL ao passo 4 abaixo).
3. `supabase/migrations/0004_instagram_accounts_token_source.sql` — adiciona a coluna `token_source` em `instagram_accounts` (rastreia se o token foi obtido por troca, renovação direta ou fallback estimado — veja seção 6).
4. `supabase/migrations/0002_cron_jobs.sql` — **só depois do deploy** (veja seção 7), pois precisa da URL pública do app.

## 4. Criar o bucket público no Supabase Storage (via UI, alternativa ao passo acima)

1. Supabase > Storage > **New bucket**
2. Nome: `videos`
3. Marque **Public bucket**
4. Crie. Não são necessárias policies adicionais — todo upload/delete passa pela `service_role` no servidor (RLS/policies não se aplicam a ela), e leitura pública já vem do bucket ser público.
5. Se seus Reels forem grandes, confira o **File size limit** do bucket nas configurações (padrão pode ser baixo no plano free).

## 5. Rodar localmente

```bash
npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000).

- **Configuração:** clique em "Conectar" para obter um token de longa duração a partir do `IG_ACCESS_TOKEN` do `.env`, salvo em `instagram_accounts` (veja seção 6 para os detalhes de como isso funciona).
- **Biblioteca:** envie um vídeo — a duração/resolução/thumbnail são extraídas no próprio browser.
- **Agendar:** escolha vídeo, data e hora.
- **Scheduler em dev:** como o `pg_cron` só faz sentido depois do deploy (precisa de uma URL pública), teste o tick manualmente:

  ```bash
  curl -X POST http://localhost:3000/api/cron/scheduler \
    -H "Authorization: Bearer SEU_CRON_SECRET"
  ```

  O mesmo vale para `/api/cron/analytics` e `/api/cron/token-check`. Se quiser testar o `pg_cron` de ponta a ponta antes do deploy, exponha o `next dev` com um túnel (ex: `cloudflared tunnel --url http://localhost:3000` ou `ngrok http 3000`) e use essa URL temporária no passo 7.

## 6. Renovação de token

O botão "Conectar" (`POST /api/instagram/connect`) primeiro valida que o `IG_ACCESS_TOKEN` do `.env` funciona de verdade, depois tenta obter uma expiração real nesta ordem:

1. **`exchanged`** — troca oficial curto → longo via `ig_exchange_token` (usa `IG_APP_SECRET`). Expiração real.
2. **`refreshed_direct`** — se a troca falhar especificamente com "tipo de token inválido" (a Meta retorna esse erro quando o token já é long-lived, por exemplo quando foi gerado direto no painel do Meta em vez de via fluxo OAuth), tenta renovar o token recebido diretamente via `ig_refresh_token` (não usa `client_secret`). Expiração real.
3. **`fallback_unverified`** — se nem troca nem renovação direta funcionarem (ex: token emitido há menos de 24h, ainda não elegível para renovação), usa o token como está com expiração **estimada** em 60 dias. Único caso em que a tela de Configuração mostra o aviso de "expiração estimada, não confirmada".

Qualquer falha na troca que **não** seja esse erro específico de tipo de token (ex: `IG_APP_SECRET` genuinamente errado, erro de rede) faz o "Conectar" abortar com erro claro — não cai silenciosamente em nenhum fallback. A origem do token (`token_source`) fica visível na tela de Configuração.

- **Renovação manual** (token longo só pode ser renovado depois de 24h da última emissão, e antes de expirar): botão "Renovar Token", ou `POST /api/instagram/refresh` — sempre usa `ig_refresh_token` (sem `client_secret`) e sempre resulta em expiração real (`token_source = refreshed_direct`), então é a forma de "confirmar" um token que ficou em `fallback_unverified`.
- Se o token expirar de vez, gere um novo token curto no painel do Meta, atualize `IG_ACCESS_TOKEN` no `.env`/env vars da Vercel, e clique em "Conectar" de novo.

**Nota sobre rotação de token durante debug:** chamar `ig_refresh_token` (mesmo manualmente, via curl, para diagnóstico) gera um token novo — a Meta pode invalidar o anterior. Se o "Conectar" passar a falhar com erro de token inválido logo depois de você (ou alguém) ter testado o refresh manualmente fora do app, a causa mais provável **não é bug de código** — é o `IG_ACCESS_TOKEN` do `.env` ter sido rotacionado por fora. Solução: gere um token fresco no painel do Meta (Auxiliar de integração de API, ou a seção de gerar tokens do produto Instagram), cole em `IG_ACCESS_TOKEN`, e clique em "Conectar" de novo.

## 7. Deploy na Vercel

1. Suba o repositório (GitHub/GitLab/Bitbucket) e importe na Vercel, ou `vercel deploy` pela CLI.
2. Em **Project Settings > Environment Variables**, adicione todas as variáveis da seção 2 (Production e Preview) — incluindo `APP_USERNAME`/`APP_PASSWORD` (seção 8) e `CRON_SECRET`.
3. Faça o deploy e anote a URL pública (ex: `https://posteiflow.vercel.app`).
4. No SQL Editor do Supabase, abra `supabase/migrations/0002_cron_jobs.sql`, troque `<APP_URL>` pela URL do passo 3 e `<CRON_SECRET>` pelo mesmo valor da env var, e rode.
5. Confirme os jobs: `select * from cron.job;` no SQL Editor.
6. Acesse `/settings` no app publicado (vai pedir o login do Basic Auth primeiro) e clique em "Conectar" para gravar o token de longa duração.

Se depois trocar a URL do deploy (novo domínio), rode `select cron.unschedule('posteiflow-scheduler');` (e os outros dois nomes de job) e reagende com a URL nova.

## 8. Autenticação (Basic Auth)

O app é publicado numa URL pública da Vercel, sem nenhum controle de acesso próprio — então todo o app (páginas e API, exceto `/api/cron/*`) fica atrás de HTTP Basic Auth simples, implementado em [`src/proxy.ts`](src/proxy.ts).

**Por que `proxy.ts` e não `middleware.ts`:** no Next.js 16 (a versão deste projeto), o arquivo `middleware.ts` foi renomeado para `proxy.ts` (e a função exportada de `middleware` para `proxy`) — `middleware.ts` está deprecado e pode não ser nem reconhecido. Funcionalmente é a mesma coisa que "middleware" em versões anteriores do Next.js.

Como funciona:
- Protege **todas** as rotas exceto `/api/cron/*` (que já usa `CRON_SECRET` via Bearer token — não faz sentido pedir duas autenticações diferentes na mesma rota) e os assets internos do Next (`_next/static`, `_next/image`, `favicon.ico`).
- Sem `APP_USERNAME`/`APP_PASSWORD` configurados, o proxy nega acesso a tudo (fail closed) — nunca libera o app por engano por falta de configuração.
- Isso vale em produção **e** em `next dev` — depois de configurar essas duas env vars, o navegador vai pedir login também ao rodar localmente.

**Para trocar a senha:** gere um novo valor (ex: `node -e "console.log(require('crypto').randomBytes(18).toString('base64url'))"`), atualize `APP_PASSWORD` no `.env.local` e nas Environment Variables da Vercel (redeploy necessário para produção), e informe o usuário/senha novos pra quem precisar acessar. Não há usuários múltiplos nem hash de senha — é literalmente um único login fixo comparado por igualdade, adequado só porque é uso pessoal.

## Limitações conhecidas do v1

- Single-user/single-conta: assume sempre a conta do Instagram mais recente conectada em `instagram_accounts`.
- O lock de execução (`scheduler_lock`) protege contra ticks sobrepostos, mas é local a esta tabela — se você rodar `/api/cron/scheduler` manualmente ao mesmo tempo que o `pg_cron` dispara, o mesmo lock também vale para essa chamada manual (uma delas vai sair cedo com `skipped`).
- Rejeição do 51º post em 24h: o post é automaticamente reagendado para o próximo horário livre (calculado a partir do publish mais antigo na janela de 24h), sem intervenção manual. Esse cálculo assume que toda publicação passa por este app — um Reels publicado manualmente pelo app do Instagram conta para a cota real da Meta mas não entra nesse cálculo local.
- Suporta apenas Reels (sem Stories/carrossel) e apenas a conta @humordeporco, por design.
