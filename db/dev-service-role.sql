-- =============================================================================
-- SOMENTE DESENVOLVIMENTO
--
-- Libera o papel `service_role` (que ignora RLS) para ser assumido via API.
-- E o que permite aos scripts de demonstracao e aos testes montarem cenario
-- pelo mesmo PostgREST que a aplicacao usa.
--
-- Em producao este arquivo nunca roda: o `migrate.sh` so o aplica quando
-- ENABLE_SERVICE_ROLE_API=true, e isso vive apenas no compose de dev. Sem
-- ele, nem com o segredo do JWT em maos alguem alcanca a RLS por fora.
-- =============================================================================
\set ON_ERROR_STOP on

grant service_role to authenticator;

grant usage on schema public, extensions to service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;
