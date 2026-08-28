-- =============================================================================
-- Cuidar GC :: 0010 - senha provisoria com troca obrigatoria
--
-- A liderança conhece cada integrante pessoalmente e entrega o acesso na mão.
-- Nesse cenario, criar a conta com uma senha provisoria e mais simples do que
-- mandar um link - mas so vale se a troca for obrigatoria e se, ate ela
-- acontecer, a conta nao servir para mais nada.
--
-- E por isso que o marcador vive aqui, e nao numa preferencia do aplicativo:
-- e o mesmo lugar onde mora a senha.
-- =============================================================================

alter table auth.users
  add column if not exists must_change_password boolean not null default false;

-- Quem esta com senha provisoria nao recebe sessao no login: recebe apenas
-- permissao para definir a propria senha. A regra e aplicada pelo servico de
-- autenticacao, que le esta coluna.
comment on column auth.users.must_change_password is
  'Senha entregue pela lideranca. Enquanto verdadeiro, o login nao devolve sessao - so o direito de trocar a senha.';
