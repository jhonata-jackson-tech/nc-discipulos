-- =============================================================================
-- Cuidar GC :: 0000 - identidade da sessao em Postgres puro
--
-- Esta migration substitui o que o Supabase entregava pronto: o schema `auth`,
-- a tabela de contas e a funcao `auth.uid()`. Tudo o que vem depois - RLS,
-- funcoes de servidor, o gatilho que exige convite - continua escrito contra
-- exatamente o mesmo contrato, sem uma linha alterada.
--
-- O contrato e o do PostgREST: a cada requisicao ele valida o JWT e publica as
-- claims em `request.jwt.claims`. `auth.uid()` le o `sub` dali. Quem assina
-- esse JWT e o servico de autenticacao (server/), com o mesmo segredo.
-- =============================================================================

-- ------------------------------------------------------------------ extensoes
-- As migrations chamam `extensions.digest` e `extensions.gen_random_bytes`
-- (hash do convite e geracao do token). No Supabase o pgcrypto morava nesse
-- schema; aqui reproduzimos o mesmo endereco.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- --------------------------------------------------------------------- papeis
-- `authenticator` e o papel de conexao do PostgREST: entra sem privilegio
-- nenhum e assume `anon` ou `authenticated` conforme a claim `role` do JWT.
-- Por isso ele e NOINHERIT - nao herda nada por acidente.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  -- Usado apenas por rotinas administrativas (seed, scripts de manutencao,
  -- testes). Ignora RLS de proposito e nunca e exposto pela API.
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------- schema auth
create schema if not exists auth;
grant usage on schema auth to authenticated, service_role;

-- Conta de acesso. Existe separada de `public.profiles` porque um integrante
-- do GC existe antes de ter login - e alguns nunca terao.
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  -- Hash bcrypt gerado por `extensions.crypt(senha, gen_salt('bf'))`. A senha
  -- em claro nunca sai do request: o hash e feito no banco.
  encrypted_password text not null,
  -- O gatilho `app.handle_new_user` le `invite_token` daqui.
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  last_sign_in_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists users_email_unique_idx on auth.users (lower(email));

-- Sessao renovavel. O token de acesso e curto (1h) e vive so na memoria do
-- navegador; este e o token longo que permite renovar sem pedir a senha de
-- novo. Guardamos apenas o hash - vazamento de banco nao vira sessao ativa.
create table if not exists auth.refresh_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists refresh_tokens_user_idx on auth.refresh_tokens (user_id);

-- ------------------------------------------------------------------ identidade
-- Assinatura identica a do Supabase: e o que permite que `helpers_rls.sql`,
-- `rpc.sql` e todas as politicas continuem exatamente como foram escritos.
-- O `coalesce(nullif(..., ''), '{}')` nao e zelo excessivo: um GUC
-- personalizado que ja foi definido alguma vez na sessao volta para a string
-- vazia - nao para NULL - quando a transacao termina. Sem essa protecao,
-- `''::jsonb` derruba com 22P02 a proxima consulta que rodar naquela mesma
-- conexao do pool, e o erro aparece longe daqui, dentro de um gatilho.
create or replace function auth.claims()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb;
$$;

create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(auth.claims() ->> 'sub', '')::uuid;
$$;

create or replace function auth.email()
returns text
language sql
stable
as $$
  select nullif(auth.claims() ->> 'email', '');
$$;

grant execute on function auth.claims(), auth.uid(), auth.email()
  to anon, authenticated, service_role;

-- A tabela de contas nunca e exposta pela API: o PostgREST so publica `public`,
-- e ainda assim tiramos qualquer privilegio de `anon` e `authenticated`.
revoke all on auth.users from anon, authenticated;
revoke all on auth.refresh_tokens from anon, authenticated;
