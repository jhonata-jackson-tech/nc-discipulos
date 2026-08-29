-- =============================================================================
-- Cuidar GC :: verificacao das regras aplicadas pelo banco
--
-- Roda em um Postgres descartavel (scripts/verify-migrations.sh). Cada bloco
-- exercita uma regra que o produto nao pode perder, mesmo que a interface
-- envie qualquer coisa.
-- =============================================================================
\set ON_ERROR_STOP on

do $$
declare
  v_group uuid;
  v_week uuid;
  lider_m uuid;
  lider_f uuid;
  disc_m uuid;
  irmao uuid;
  irma uuid;
  inativo uuid;
  v_assignment uuid;
  falhou boolean;

  -- Executa um comando esperando que ele seja recusado pelo banco.
  procedure_note text;
begin
  select id into v_group from public.groups limit 1;

  select id into lider_m from public.profiles where full_name = 'Jhonata Jackson';
  select id into lider_f from public.profiles where full_name = 'Jenifer Messias';
  select id into disc_m from public.profiles where full_name = 'Felipe Freitas';
  select id into irmao from public.profiles where full_name = 'Anderson';
  select id into irma from public.profiles where full_name = 'Camila';
  select id into inativo from public.profiles where full_name = 'Robson';

  update public.profiles set care_gender = 'male'
   where id in (lider_m, disc_m, irmao, inativo);
  update public.profiles set care_gender = 'female' where id in (lider_f, irma);
  update public.profiles set status = 'inactive' where id = inativo;

  insert into public.care_weeks (group_id, starts_on, ends_on, seed)
  values (v_group, date '2026-08-24', date '2026-08-30', 'teste')
  returning id into v_week;

  -- 1. cuidado entre generos diferentes ---------------------------------------
  falhou := false;
  begin
    insert into public.care_assignments (week_id, caregiver_id, cared_for_id)
    values (v_week, disc_m, irma);
  exception when others then
    falhou := true;
    procedure_note := sqlerrm;
  end;
  if not falhou then raise exception 'FALHA: aceitou cuidado entre generos diferentes'; end if;
  if procedure_note not like '%mesmo genero de cuidado%' then
    raise exception 'FALHA: mensagem inesperada -> %', procedure_note;
  end if;

  -- 2. ninguem cuida de si mesmo ----------------------------------------------
  falhou := false;
  begin
    insert into public.care_assignments (week_id, caregiver_id, cared_for_id)
    values (v_week, disc_m, disc_m);
  exception when others then falhou := true; end;
  if not falhou then raise exception 'FALHA: aceitou autoatribuicao'; end if;

  -- 3. cuidador precisa ser lider ou discipulo --------------------------------
  falhou := false;
  begin
    insert into public.care_assignments (week_id, caregiver_id, cared_for_id)
    values (v_week, irmao, disc_m);
  exception when others then falhou := true; end;
  if not falhou then raise exception 'FALHA: aceitou irmao como cuidador'; end if;

  -- 4. pessoa inativa fica fora ------------------------------------------------
  falhou := false;
  begin
    insert into public.care_assignments (week_id, caregiver_id, cared_for_id)
    values (v_week, disc_m, inativo);
  exception when others then falhou := true; end;
  if not falhou then raise exception 'FALHA: aceitou pessoa inativa no cuidado'; end if;

  -- 5. atribuicao valida passa -------------------------------------------------
  insert into public.care_assignments (week_id, caregiver_id, cared_for_id)
  values (v_week, disc_m, irmao)
  returning id into v_assignment;

  -- 6. uma atribuicao por pessoa cuidada na semana -----------------------------
  falhou := false;
  begin
    insert into public.care_assignments (week_id, caregiver_id, cared_for_id)
    values (v_week, lider_m, irmao);
  exception when unique_violation then falhou := true; end;
  if not falhou then raise exception 'FALHA: aceitou a mesma pessoa cuidada duas vezes'; end if;

  -- 7. restricao de par bloqueia, inclusive invertida --------------------------
  insert into public.pairing_restrictions (group_id, profile_a, profile_b, reason)
  values (v_group, irmao, lider_m, 'teste');

  if not exists (
    select 1 from public.pairing_restrictions
     where profile_a = least(irmao, lider_m) and profile_b = greatest(irmao, lider_m)
  ) then
    raise exception 'FALHA: o par nao foi normalizado';
  end if;

  delete from public.care_assignments where id = v_assignment;
  falhou := false;
  begin
    insert into public.care_assignments (week_id, caregiver_id, cared_for_id)
    values (v_week, lider_m, irmao);
  exception when others then falhou := true; end;
  if not falhou then raise exception 'FALHA: ignorou a restricao de par'; end if;

  -- 8. discipulado respeita o genero -------------------------------------------
  falhou := false;
  begin
    insert into public.discipleship_links (disciple_id, leader_id) values (disc_m, lider_f);
  exception when others then falhou := true; end;
  if not falhou then raise exception 'FALHA: vinculou discipulado entre generos diferentes'; end if;

  insert into public.discipleship_links (disciple_id, leader_id) values (disc_m, lider_m);

  falhou := false;
  begin
    insert into public.discipleship_links (disciple_id, leader_id) values (disc_m, lider_m);
  exception when unique_violation then falhou := true; end;
  if not falhou then raise exception 'FALHA: aceitou dois lideres primarios vigentes'; end if;

  -- 9. supervisao so para discipulos e lideres ---------------------------------
  falhou := false;
  begin
    insert into public.supervision_requests (group_id, requester_id, subject, message)
    values (v_group, irmao, 'teste', 'mensagem de teste');
  exception when others then falhou := true; end;
  if not falhou then raise exception 'FALHA: irmao conseguiu abrir solicitacao de supervisao'; end if;

  insert into public.supervision_requests (group_id, requester_id, subject, message)
  values (v_group, disc_m, 'teste', 'mensagem de teste');

  -- 10. transferencia exige destinatario elegivel ------------------------------
  delete from public.pairing_restrictions where group_id = v_group;
  insert into public.care_assignments (week_id, caregiver_id, cared_for_id)
  values (v_week, disc_m, irmao)
  returning id into v_assignment;

  falhou := false;
  begin
    insert into public.transfer_requests (assignment_id, requester_id, recipient_id, reason)
    values (v_assignment, disc_m, lider_f, 'teste');
  exception when others then falhou := true; end;
  if not falhou then raise exception 'FALHA: aceitou transferencia para outro genero'; end if;

  insert into public.transfer_requests (assignment_id, requester_id, recipient_id, reason)
  values (v_assignment, disc_m, lider_m, 'teste');

  falhou := false;
  begin
    insert into public.transfer_requests (assignment_id, requester_id, recipient_id, reason)
    values (v_assignment, disc_m, lider_m, 'outro pedido');
  exception when unique_violation then falhou := true; end;
  if not falhou then raise exception 'FALHA: aceitou dois pedidos pendentes na mesma atribuicao'; end if;

  -- 11. a marca de administrador nao se concede sozinha ----------------------
  -- `profiles_update_self` deixa qualquer pessoa alterar a propria linha, e
  -- `profiles_update_leader` deixa um lider alterar a de qualquer um. Sem a
  -- trava, uma chamada direta a tabela - pela API, sem passar por tela
  -- nenhuma - bastaria para alguem virar administrador.
  falhou := false;
  begin
    update public.profiles set is_admin = true where id = disc_m;
  exception when others then falhou := true; end;
  if not falhou then raise exception 'FALHA: a marca de administrador mudou por escrita direta'; end if;

  falhou := false;
  begin
    insert into public.profiles (full_name, role, is_admin)
    values ('Atalho pelo cadastro', 'member', true);
  exception when others then falhou := true; end;
  if not falhou then raise exception 'FALHA: cadastrou um integrante ja administrador'; end if;

  perform set_config('app.definindo_admin', 'on', true);
  update public.profiles set is_admin = true where id = disc_m;
  perform set_config('app.definindo_admin', 'off', true);
  if not (select is_admin from public.profiles where id = disc_m) then
    raise exception 'FALHA: definir_admin nao conseguiu conceder a marca';
  end if;

  raise notice 'regras do banco: 11 verificacoes passaram';
end;
$$;
