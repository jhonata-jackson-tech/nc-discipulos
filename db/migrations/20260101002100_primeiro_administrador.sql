-- =============================================================================
-- Cuidar GC :: 0021 - o primeiro administrador, agora achando a pessoa certa
--
-- A 0020 marcava o primeiro administrador por `full_name = 'Jhonata Jackson'`,
-- que e a grafia do seed. So que o seed nasce com o nome curto e a lideranca
-- completa o cadastro no primeiro acesso: no banco que ja esta rodando o nome
-- virou "Jhonata Jackson Monteiro Motta", e o casamento exato nao pegou
-- ninguem - o sistema ficou sem nenhum administrador.
--
-- "O lider mais antigo" tambem nao resolve: o seed insere todo mundo na mesma
-- transacao, entao os dois lideres tem exatamente o mesmo `created_at` e o
-- desempate cairia na ordem alfabetica, que aponta para outra pessoa.
--
-- Fica o prefixo, e fica explicito: quem montou o GC e quem responde pelo
-- sistema. Daqui para frente a marca so anda pela tela, de administrador para
-- administrador.
-- =============================================================================

do $$
declare
  v_id uuid;
begin
  -- Se alguem ja administra, nao mexe: a marca e concedida por quem a tem, e
  -- esta migration nao pode desfazer uma decisao tomada na tela.
  if exists (select 1 from public.profiles where is_admin) then
    raise notice 'ja existe administrador: nada a fazer';
    return;
  end if;

  select id into v_id
    from public.profiles
   where role = 'leader'
     and deleted_at is null
     and (full_name like 'Jhonata Jackson%' or display_name = 'Jhonata Jackson')
   order by full_name
   limit 1;

  if v_id is null then
    raise notice 'nenhum candidato a primeiro administrador neste banco';
    return;
  end if;

  -- O mesmo sinal que `public.definir_admin` usa: a marca nao muda por escrita
  -- direta na tabela, nem aqui.
  perform set_config('app.definindo_admin', 'on', true);
  update public.profiles set is_admin = true where id = v_id;
  perform set_config('app.definindo_admin', 'off', true);

  raise notice 'primeiro administrador definido';
end
$$;
