-- PosteiFlow — bucket público de vídeos no Supabase Storage
--
-- Alternativa via SQL ao passo manual do dashboard (Storage > New bucket).
-- Pode rodar este arquivo OU criar o bucket pela UI — os dois têm o mesmo efeito.
-- Veja o README para o passo a passo pela UI.

insert into storage.buckets (id, name, public)
values ('videos', 'videos', true)
on conflict (id) do nothing;

-- Bucket público: downloads (GET) não passam por RLS, então qualquer um com a
-- URL consegue assistir ao vídeo — necessário porque a Content Publishing API
-- do Instagram precisa buscar o vídeo via URL pública (video_url).
--
-- Uploads (INSERT/UPDATE/DELETE) só acontecem pela API route do app, usando a
-- SUPABASE_SERVICE_KEY (service_role), que ignora RLS — por isso não é preciso
-- criar policies de escrita aqui.
