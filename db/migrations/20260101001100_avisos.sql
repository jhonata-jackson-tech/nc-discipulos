-- =============================================================================
-- Cuidar GC :: 0011 - avisos que levam ao lugar certo, e que dá para apagar
--
-- Dois acertos na central de avisos:
--
-- 1. O destino estava errado. Os avisos da semana apontavam para
--    `/minha-semana`, endereco que nunca existiu - a tela mora na raiz. Quem
--    tocava no aviso caia em "pagina nao encontrada". Corrigimos a origem e os
--    avisos ja enviados.
-- 2. Nao havia como apagar. A central so crescia, e um aviso lido de tres
--    semanas atras nao serve para nada alem de esconder o de hoje.
-- =============================================================================

-- ------------------------------------------------------- o destino correto
update public.notifications set link = '/' where link = '/minha-semana';

-- As funcoes que criam os avisos da semana. Sao as mesmas de `..._rpc_week`,
-- com o endereco corrigido - redefinidas aqui para valer no banco que ja esta
-- rodando, sem precisar recriar nada.
do $$
declare
  fonte text;
  nova text;
  alvo record;
begin
  for alvo in
    -- `prokind = 'f'`: agregadas e de janela nao tem definicao recuperavel, e
    -- pedir a delas aborta a consulta inteira.
    select p.oid, p.proname, pg_get_functiondef(p.oid) as definicao
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname in ('public', 'app')
       and p.prokind = 'f'
       and pg_get_functiondef(p.oid) like '%/minha-semana%'
  loop
    fonte := alvo.definicao;
    nova := replace(fonte, '''/minha-semana''', '''/''');
    execute nova;
    raise notice 'endereco corrigido em %', alvo.proname;
  end loop;
end
$$;

-- ---------------------------------------------------------- apagar avisos
-- Cada pessoa apaga os proprios avisos, e so os proprios: a central e pessoal.
grant delete on public.notifications to authenticated;

create policy notifications_delete on public.notifications
  for delete to authenticated using (profile_id = app.current_profile_id());
