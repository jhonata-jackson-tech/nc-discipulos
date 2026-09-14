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

-- =============================================================================
-- Visitantes e chamada do GC
--
-- Duas regras que o produto nao pode perder: um visitante nunca vira linha de
-- `profiles` por acidente (e por isso nunca entra no rodizio proporcional), e
-- a chamada de um encontro descreve cada pessoa uma unica vez.
-- =============================================================================
do $$
declare
  v_group uuid;
  v_visitante uuid;
  v_integrante uuid;
  v_encontro uuid;
  v_faltas int;
  falhou boolean;
begin
  select id into v_group from public.groups limit 1;
  select id into v_integrante from public.profiles where full_name = 'Anderson';

  insert into public.visitors (group_id, full_name, origin)
  values (v_group, 'Marcos Visitante', 'gc_center')
  returning id into v_visitante;

  -- 12. o visitante nao esta no cadastro do GC -------------------------------
  -- E o que mantem o rodizio proporcional fora do alcance dele: a distribuicao
  -- le `profiles`, e ele nao esta la.
  if exists (select 1 from public.profiles where full_name = 'Marcos Visitante') then
    raise exception 'FALHA: um visitante virou integrante sem promocao';
  end if;

  -- 13. encerrar acompanhamento exige motivo ---------------------------------
  falhou := false;
  begin
    update public.visitors set status = 'encerrado' where id = v_visitante;
  exception when check_violation then falhou := true; end;
  if not falhou then raise exception 'FALHA: encerrou o acompanhamento sem motivo'; end if;

  update public.visitors
     set status = 'encerrado', outcome_reason = 'Encaminhado para o GC do bairro dele'
   where id = v_visitante;
  update public.visitors
     set status = 'acompanhando', outcome_reason = null where id = v_visitante;

  -- 14. cada linha da chamada e de uma pessoa so ------------------------------
  insert into public.gc_meetings (group_id, held_on)
  values (v_group, current_date - 7) returning id into v_encontro;

  falhou := false;
  begin
    insert into public.gc_attendance (meeting_id, profile_id, visitor_id, mark)
    values (v_encontro, v_integrante, v_visitante, 'presente');
  exception when check_violation then falhou := true; end;
  if not falhou then raise exception 'FALHA: aceitou marca de integrante e visitante na mesma linha'; end if;

  falhou := false;
  begin
    insert into public.gc_attendance (meeting_id, mark) values (v_encontro, 'presente');
  exception when check_violation then falhou := true; end;
  if not falhou then raise exception 'FALHA: aceitou marca sem pessoa nenhuma'; end if;

  -- 15. ninguem aparece duas vezes no mesmo encontro --------------------------
  insert into public.gc_attendance (meeting_id, profile_id, mark)
  values (v_encontro, v_integrante, 'ausente');

  falhou := false;
  begin
    insert into public.gc_attendance (meeting_id, profile_id, mark)
    values (v_encontro, v_integrante, 'presente');
  exception when unique_violation then falhou := true; end;
  if not falhou then raise exception 'FALHA: a mesma pessoa foi marcada duas vezes no encontro'; end if;

  -- 16. faltas seguidas param em quem avisou -----------------------------------
  -- Tres encontros: faltou, faltou, justificou. Duas faltas seguidas - a
  -- terceira nao entra, porque avisar e o contrario de sumir.
  insert into public.gc_meetings (group_id, held_on) values (v_group, current_date - 14)
  returning id into v_encontro;
  insert into public.gc_attendance (meeting_id, profile_id, mark)
  values (v_encontro, v_integrante, 'ausente');

  insert into public.gc_meetings (group_id, held_on) values (v_group, current_date - 21)
  returning id into v_encontro;
  insert into public.gc_attendance (meeting_id, profile_id, mark, justification)
  values (v_encontro, v_integrante, 'justificado', 'Viagem a trabalho');

  insert into public.gc_meetings (group_id, held_on) values (v_group, current_date - 28)
  returning id into v_encontro;
  insert into public.gc_attendance (meeting_id, profile_id, mark)
  values (v_encontro, v_integrante, 'ausente');

  v_faltas := app.faltas_seguidas(v_integrante);
  if v_faltas <> 2 then
    raise exception 'FALHA: esperava 2 faltas seguidas, encontrei %', v_faltas;
  end if;

  raise notice 'visitantes e chamada: 5 verificacoes passaram';
end;
$$;

-- =============================================================================
-- A semana que comeca no dia, o relatorio do encerramento e o talk
--
-- Estas funcoes exigem sessao (lider, discipulo), entao o bloco cria contas
-- descartaveis e assume a identidade delas como o PostgREST faria. O gatilho
-- de convite fica desligado so aqui: este banco e jogado fora no fim.
-- =============================================================================
do $$
declare
  v_group uuid;
  lider uuid;
  disc uuid;
  irmao uuid;
  u_lider uuid := gen_random_uuid();
  u_disc uuid := gen_random_uuid();
  v_hoje date := app.hoje();
  v_antiga uuid;
  v_nova uuid;
  v_atrib uuid;
  v_rel jsonb;
  v_talk uuid;
  v_rascunho uuid;
  v_texto text;
  v_total int;
  falhou boolean;
begin
  select id into v_group from public.groups limit 1;
  select id into lider from public.profiles where full_name = 'Jhonata Jackson';
  select id into disc from public.profiles where full_name = 'Felipe Freitas';
  select id into irmao from public.profiles where full_name = 'Anderson';

  alter table auth.users disable trigger on_auth_user_created;
  insert into auth.users (id, email, encrypted_password)
  values (u_lider, 'lider.teste@exemplo.com', 'x'), (u_disc, 'disc.teste@exemplo.com', 'x');
  update public.profiles set user_id = u_lider where id = lider;
  update public.profiles set user_id = u_disc where id = disc;
  alter table auth.users enable trigger on_auth_user_created;

  perform set_config('request.jwt.claims',
    json_build_object('sub', u_lider, 'role', 'authenticated')::text, true);

  -- 17. a semana publicada que ninguem usou pode ser refeita ------------------
  insert into public.care_weeks (group_id, starts_on, ends_on, seed, status, published_at)
  values (v_group, v_hoje - 3, v_hoje + 3, 'teste', 'published', now())
  returning id into v_antiga;
  insert into public.care_assignments (week_id, caregiver_id, cared_for_id)
  values (v_antiga, lider, irmao)
  returning id into v_atrib;

  if app.bloqueio_para_iniciar(v_group, v_hoje - 3) is not null then
    raise exception 'FALHA: bloqueou uma semana publicada sem nenhum cuidado';
  end if;

  insert into public.contact_logs (assignment_id, author_id, channel, got_reply, well_being)
  values (v_atrib, lider, 'whatsapp', true, 'bem');
  update public.care_assignments set status = 'contacted' where id = v_atrib;

  v_texto := app.bloqueio_para_iniciar(v_group, v_hoje - 3);
  if v_texto is null or v_texto not like '%cuidados registrados%' then
    raise exception 'FALHA: deixou refazer semana com cuidado registrado -> %', v_texto;
  end if;

  -- 18. comecar hoje encerra a que estava valendo, na vespera -----------------
  v_nova := public.apply_week_generation(
    v_group, v_hoje, v_hoje + 6, 'teste-hoje',
    jsonb_build_array(jsonb_build_object('caregiverId', disc, 'caredForId', irmao)),
    '{}'::jsonb);

  if (select status from public.care_weeks where id = v_nova) <> 'draft' then
    raise exception 'FALHA: a geracao nao nasceu rascunho';
  end if;
  if (select status from public.care_weeks where id = v_antiga) <> 'published' then
    raise exception 'FALHA: gerar rascunho mexeu na semana que esta valendo';
  end if;

  perform public.publish_care_week(v_nova);

  if (select row(status, ends_on)::text from public.care_weeks where id = v_antiga)
     <> row('closed'::public.care_week_status, v_hoje - 1)::text then
    raise exception 'FALHA: a semana anterior nao terminou na vespera da nova -> %',
      (select row(status, ends_on)::text from public.care_weeks where id = v_antiga);
  end if;

  select count(*) into v_total from public.notifications
   where link = '/agenda/' || v_antiga and title like 'Relatório da semana%';
  if v_total = 0 then
    raise exception 'FALHA: encerrar nao mandou o relatorio para a lideranca';
  end if;

  -- 19. o relatorio responde quem cuidou de quem ------------------------------
  v_rel := public.relatorio_semana(v_antiga);
  if (v_rel #>> '{resumo,combinados}')::int <> 1 or (v_rel #>> '{resumo,cuidados}')::int <> 1 then
    raise exception 'FALHA: numeros do relatorio errados -> %', v_rel -> 'resumo';
  end if;
  if v_rel #>> '{cuidadores,0,situacao}' <> 'todos'
     or v_rel #>> '{cuidadores,0,pessoas,0,comoEsta}' <> 'bem' then
    raise exception 'FALHA: relatorio nao mostra quem cuidou de quem -> %', v_rel -> 'cuidadores';
  end if;
  if jsonb_typeof(v_rel -> 'semCuidadoHaMais') <> 'array' then
    raise exception 'FALHA: relatorio sem a lista de quem esta ha mais tempo sem cuidado';
  end if;

  -- 20. rascunho nao se encerra, e semana publicada sem uso volta a rascunho --
  perform public.apply_week_generation(v_group, v_hoje, v_hoje + 6, 'de-novo', '[]'::jsonb, '{}'::jsonb);

  falhou := false;
  begin
    perform public.close_care_week(v_nova);
  exception when check_violation then falhou := true;
  end;
  if not falhou then raise exception 'FALHA: encerrou uma semana em rascunho'; end if;
  if (select status from public.care_weeks where id = v_nova) <> 'draft' then
    raise exception 'FALHA: a semana publicada sem uso nao voltou a rascunho ao ser refeita';
  end if;

  -- 21. talk: sem PDF nao publica, e so quem conduz o GC e avisado -----------
  v_talk := public.salvar_talk(null, 8, 'Alegria como combustível da perseverança', 'Série 3',
                               v_hoje, null, 'https://open.spotify.com/playlist/x', null);

  falhou := false;
  begin
    perform public.publicar_talk(v_talk);
  exception when check_violation then falhou := true;
  end;
  if not falhou then raise exception 'FALHA: publicou talk sem PDF'; end if;

  falhou := false;
  begin
    perform public.salvar_arquivo_talk(v_talk, 'pdf', 'image/png', 'x.png', '\x89504e47'::bytea);
  exception when check_violation then falhou := true;
  end;
  if not falhou then raise exception 'FALHA: aceitou imagem no lugar do PDF'; end if;

  perform public.salvar_arquivo_talk(v_talk, 'pdf', 'application/pdf', 'tema8.pdf',
                                     convert_to('%PDF-1.4 teste', 'UTF8'));
  perform public.publicar_talk(v_talk);

  select count(*) into v_total
    from public.notifications n join public.profiles p on p.id = n.profile_id
   where n.link = '/talks/' || v_talk and p.role = 'member';
  if v_total > 0 then raise exception 'FALHA: irmao/irma recebeu aviso do talk'; end if;

  select count(*) into v_total from public.notifications
   where link = '/talks/' || v_talk and profile_id = disc;
  if v_total <> 1 then raise exception 'FALHA: o discipulo nao foi avisado do talk'; end if;

  v_rascunho := public.salvar_talk(null, 9, 'Ainda em preparo', null, v_hoje + 7, null, null, null);

  -- 22. o discipulo ve o publicado, nao ve o rascunho, e nao escreve ---------
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_disc, 'role', 'authenticated')::text, true);

  if public.talk(v_talk) is null or public.talk(v_rascunho) is not null then
    raise exception 'FALHA: alcance do talk errado para o discipulo';
  end if;
  if not exists (select 1 from public.arquivo_talk(v_talk, 'pdf')) then
    raise exception 'FALHA: o discipulo nao consegue baixar o PDF publicado';
  end if;
  if public.talk(v_talk) -> 'leituras' <> 'null'::jsonb then
    raise exception 'FALHA: o discipulo esta vendo quem abriu o talk';
  end if;

  falhou := false;
  begin
    perform public.salvar_talk(null, 1, 'Nao pode', null, v_hoje, null, null, null);
  exception when insufficient_privilege then falhou := true;
  end;
  if not falhou then raise exception 'FALHA: discipulo criou talk'; end if;

  perform public.abrir_talk(v_talk);
  perform set_config('request.jwt.claims',
    json_build_object('sub', u_lider, 'role', 'authenticated')::text, true);
  if not exists (
    select 1 from jsonb_array_elements(public.talk(v_talk) -> 'leituras') l
     where l ->> 'id' = disc::text and l ->> 'abriuEm' is not null
  ) then
    raise exception 'FALHA: a lideranca nao ve que o discipulo abriu o talk';
  end if;

  perform set_config('request.jwt.claims', '', true);
  raise notice 'semana no dia, relatorio e talk: 6 verificacoes passaram';
end;
$$;
