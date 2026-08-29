-- =============================================================================
-- Cuidar GC :: papeis de conexao
--
-- Rodado pelo container `migrate` a cada subida, com as senhas vindas do
-- ambiente. Fica fora de `migrations/` de proposito: migration nao deve
-- depender de segredo, e assim `verify:db` continua rodando sem nenhum.
--
--   psql -v authenticator_password=... -v auth_service_password=... -f roles.sql
--
-- `authenticator` e o papel do PostgREST: entra sem poder nenhum e assume
-- `anon` ou `authenticated` conforme a claim do JWT. `service_role` nao e
-- concedido a ele - quem precisa ignorar RLS (seed, manutencao) conecta
-- direto no Postgres, nunca pela API publica.
-- =============================================================================
\set ON_ERROR_STOP on

select 'create role authenticator login noinherit'
 where not exists (select 1 from pg_roles where rolname = 'authenticator') \gexec

select format('alter role authenticator with login noinherit password %L', :'authenticator_password') \gexec

grant anon, authenticated to authenticator;

-- Papel do servico de autenticacao: mexe em contas e nada mais. Para todo o
-- resto ele assume `authenticated` e passa pela RLS como qualquer usuario.
select 'create role auth_service login noinherit'
 where not exists (select 1 from pg_roles where rolname = 'auth_service') \gexec

select format('alter role auth_service with login noinherit password %L', :'auth_service_password') \gexec

grant authenticated to auth_service;
grant usage on schema auth to auth_service;
grant select, insert, update on auth.users to auth_service;
grant select, insert, update on auth.refresh_tokens to auth_service;

-- Entrega das notificacoes push. Sao duas funcoes estreitas de proposito: o
-- servico nunca ganha leitura sobre `notifications` nem sobre a lista de
-- aparelhos - recebe o texto ja filtrado e devolve se entregou.
grant usage on schema app to auth_service;
grant execute on function app.push_targets(uuid), app.push_result(uuid, boolean) to auth_service;

-- O relogio dos avisos com hora marcada. O servico so pergunta "esta na hora?";
-- quem decide, e quem garante que nao repete, e o banco.
grant execute on function app.rodar_avisos_agendados() to auth_service;
