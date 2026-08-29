-- =============================================================================
-- Cuidar GC :: 0008 - operacao semanal (geracao, publicacao, cuidado)
-- =============================================================================

-- Reune tudo o que o algoritmo precisa em uma unica leitura autorizada.
-- A funcao e chamada pelo servico de geracao, com o token do lider.
create or replace function public.get_distribution_input(p_group_id uuid, p_starts_on date)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  result jsonb;
begin
  perform app.require_leader();

  select jsonb_build_object(
    'groupId', p_group_id,
    'weekStart', p_starts_on,
    'seed', p_group_id::text || '|' || p_starts_on::text,

    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id, 'fullName', p.full_name, 'role', p.role, 'careGender', p.care_gender)
               order by p.full_name)
        from public.profiles p
        join public.group_memberships m on m.profile_id = p.id and m.group_id = p_group_id
       where p.deleted_at is null and p.status = 'active'
         and p.role in ('leader', 'disciple', 'member')
         and p.care_gender is not null
    ), '[]'::jsonb),

    -- Bloqueia a geracao enquanto alguem elegivel estiver sem genero confirmado.
    'pendingCareGender', coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'fullName', p.full_name, 'role', p.role)
               order by p.full_name)
        from public.profiles p
        join public.group_memberships m on m.profile_id = p.id and m.group_id = p_group_id
       where p.deleted_at is null and p.status = 'active'
         and p.role in ('leader', 'disciple', 'member')
         and p.care_gender is null
    ), '[]'::jsonb),

    'fixedLinks', coalesce((
      select jsonb_agg(jsonb_build_object('discipleId', d.disciple_id, 'leaderId', d.leader_id))
        from public.discipleship_links d
        join public.profiles dp on dp.id = d.disciple_id
        join public.profiles lp on lp.id = d.leader_id
        join public.group_memberships dm on dm.profile_id = dp.id and dm.group_id = p_group_id
       where d.ended_on is null
         and dp.status = 'active' and dp.deleted_at is null
         and lp.status = 'active' and lp.deleted_at is null
    ), '[]'::jsonb),

    'restrictions', coalesce((
      select jsonb_agg(jsonb_build_object('a', r.profile_a, 'b', r.profile_b))
        from public.pairing_restrictions r where r.group_id = p_group_id
    ), '[]'::jsonb),

    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
               'caregiverId', h.caregiver_id, 'caredForId', h.cared_for_id,
               'lastUsedOn', h.last_used_on, 'timesUsed', h.times_used))
        from public.pairing_history h
    ), '[]'::jsonb),

    -- Quantas vezes cada cuidador ja absorveu a vaga extra do arredondamento.
    'extraSlotHistory', coalesce((
      select jsonb_object_agg(caregiver, total)
        from (
          select cg.value as caregiver, count(*)::int as total
            from public.care_weeks w
            cross join lateral jsonb_array_elements_text(
              coalesce(w.generation_report -> 'extraSlots', '[]'::jsonb)) as cg(value)
           where w.group_id = p_group_id and w.status in ('published', 'closed')
           group by cg.value
        ) s
    ), '{}'::jsonb),

    'hasPublishedWeek', exists (
      select 1 from public.care_weeks
       where group_id = p_group_id and starts_on = p_starts_on and status = 'published'
    )
  ) into result;

  return result;
end;
$$;

-- Grava o resultado do algoritmo em uma unica transacao. Uma semana publicada
-- nunca e sobrescrita em silencio.
create or replace function public.apply_week_generation(
  p_group_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_seed text,
  p_assignments jsonb,
  p_report jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.require_leader();
  v_week public.care_weeks;
  v_id uuid;
  item jsonb;
begin
  select * into v_week from public.care_weeks
   where group_id = p_group_id and starts_on = p_starts_on;

  if found and v_week.status <> 'draft' then
    raise exception 'A semana de % ja foi publicada. Reorganize os cuidados manualmente.', p_starts_on
      using errcode = 'check_violation';
  end if;

  if found then
    delete from public.care_assignments where week_id = v_week.id;
    update public.care_weeks
       set ends_on = p_ends_on, seed = p_seed, generation_report = p_report,
           generated_at = now(), generated_by = me
     where id = v_week.id
    returning id into v_id;
  else
    insert into public.care_weeks (group_id, starts_on, ends_on, seed, status,
                                   generation_report, generated_at, generated_by)
    values (p_group_id, p_starts_on, p_ends_on, p_seed, 'draft', p_report, now(), me)
    returning id into v_id;
  end if;

  for item in select * from jsonb_array_elements(p_assignments) loop
    insert into public.care_assignments (week_id, caregiver_id, cared_for_id, origin)
    values (v_id,
            (item ->> 'caregiverId')::uuid,
            (item ->> 'caredForId')::uuid,
            coalesce((item ->> 'origin')::public.assignment_origin, 'rotation'));
  end loop;

  perform app.audit('week.generated', 'care_weeks', v_id, null,
                    jsonb_build_object('startsOn', p_starts_on, 'total', jsonb_array_length(p_assignments)));
  return v_id;
end;
$$;

create or replace function public.publish_care_week(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.require_leader();
  v_week public.care_weeks;
  v_conflicts int;
  caregiver record;
begin
  select * into v_week from public.care_weeks where id = p_week_id for update;
  if not found then
    raise exception 'Semana nao encontrada.' using errcode = 'no_data_found';
  end if;
  if v_week.status <> 'draft' then
    raise exception 'Somente uma semana em rascunho pode ser publicada.' using errcode = 'check_violation';
  end if;

  -- Ultima verificacao da regra de genero antes de tornar a semana oficial.
  select count(*) into v_conflicts
    from public.care_assignments a
    join public.profiles cg on cg.id = a.caregiver_id
    join public.profiles cf on cf.id = a.cared_for_id
   where a.week_id = p_week_id and cg.care_gender is distinct from cf.care_gender;

  if v_conflicts > 0 then
    raise exception 'Ha % cuidado(s) entre pessoas de generos diferentes. Corrija antes de publicar.', v_conflicts
      using errcode = 'check_violation';
  end if;

  update public.care_weeks
     set status = 'published', published_at = now(), published_by = me
   where id = p_week_id;

  for caregiver in
    select a.caregiver_id, count(*)::int as total
      from public.care_assignments a where a.week_id = p_week_id
     group by a.caregiver_id
  loop
    perform app.notify(
      caregiver.caregiver_id, 'week_published', 'Sua semana de cuidado esta disponivel',
      format('Voce ficou responsavel por %s pessoa(s) nesta semana.', caregiver.total),
      '/');
  end loop;

  perform app.audit('week.published', 'care_weeks', p_week_id, null,
                    jsonb_build_object('startsOn', v_week.starts_on));
end;
$$;

create or replace function public.close_care_week(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_leader();
  update public.care_weeks set status = 'closed', closed_at = now()
   where id = p_week_id and status = 'published';
  perform app.audit('week.closed', 'care_weeks', p_week_id);
end;
$$;

-- ------------------------------------------------- registro de contato/cuidado
-- Mesmo fluxo para lider e discipulo: quem estiver responsavel pela atribuicao
-- naquela semana registra o contato.
create or replace function public.log_contact(
  p_assignment_id uuid,
  p_channel public.contact_channel,
  p_contacted_on date,
  p_got_reply boolean,
  p_feedback text,
  p_attention_level public.attention_level,
  p_status public.assignment_status
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
  v_assignment public.care_assignments;
  v_log uuid;
  v_cared_name text;
begin
  select * into v_assignment from public.care_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'Cuidado nao encontrado.' using errcode = 'no_data_found';
  end if;

  if v_assignment.caregiver_id <> me and not app.is_leader() then
    raise exception 'Somente o responsavel atual ou um lider registra este cuidado.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_contacted_on > current_date then
    raise exception 'A data do contato nao pode estar no futuro.' using errcode = 'check_violation';
  end if;

  insert into public.contact_logs (assignment_id, author_id, contacted_on, channel,
                                   got_reply, feedback, attention_level)
  values (p_assignment_id, me, coalesce(p_contacted_on, current_date), p_channel,
          coalesce(p_got_reply, false), nullif(btrim(coalesce(p_feedback, '')), ''),
          coalesce(p_attention_level, 'normal'))
  returning id into v_log;

  update public.care_assignments
     set status = coalesce(p_status, 'contacted'),
         attention_level = coalesce(p_attention_level, 'normal'),
         last_contact_at = now()
   where id = p_assignment_id;

  -- Ponto de atencao chega a lideranca sem expor o conteudo do feedback.
  if coalesce(p_attention_level, 'normal') = 'leader_action' then
    select full_name into v_cared_name from public.profiles where id = v_assignment.cared_for_id;
    perform app.notify(l.id, 'general', 'Um cuidado precisa da lideranca',
                       format('%s foi marcado como "lideranca precisa agir".', v_cared_name),
                       '/cuidados')
      from public.profiles l
     where l.role = 'leader' and l.status = 'active' and l.deleted_at is null;
  end if;

  return v_log;
end;
$$;

-- ------------------------------------------------------------ transferencias
create or replace function public.request_transfer(
  p_assignment_id uuid,
  p_recipient_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
  v_assignment public.care_assignments;
  v_id uuid;
  v_cared text;
  v_requester text;
begin
  select * into v_assignment from public.care_assignments where id = p_assignment_id;
  if not found then
    raise exception 'Cuidado nao encontrado.' using errcode = 'no_data_found';
  end if;
  if v_assignment.caregiver_id <> me then
    raise exception 'Somente o responsavel atual pode pedir a transferencia.'
      using errcode = 'insufficient_privilege';
  end if;
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Explique o motivo da transferencia.' using errcode = 'check_violation';
  end if;

  insert into public.transfer_requests (assignment_id, requester_id, recipient_id, reason)
  values (p_assignment_id, me, p_recipient_id, btrim(p_reason))
  returning id into v_id;

  select full_name into v_cared from public.profiles where id = v_assignment.cared_for_id;
  select full_name into v_requester from public.profiles where id = me;

  perform app.notify(p_recipient_id, 'transfer_requested', 'Pedido de transferencia de cuidado',
                     format('%s pediu que voce assuma o cuidado de %s.', v_requester, v_cared),
                     '/');
  perform app.audit('transfer.requested', 'transfer_requests', v_id, null,
                    jsonb_build_object('assignmentId', p_assignment_id, 'recipientId', p_recipient_id));
  return v_id;
end;
$$;

-- Ate o aceite, a responsabilidade continua com quem pediu.
create or replace function public.respond_transfer(
  p_request_id uuid,
  p_accept boolean,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
  v_req public.transfer_requests;
  v_responder text;
  v_cared text;
begin
  select * into v_req from public.transfer_requests where id = p_request_id for update;
  if not found then
    raise exception 'Pedido nao encontrado.' using errcode = 'no_data_found';
  end if;
  if v_req.recipient_id <> me then
    raise exception 'Apenas quem recebeu o pedido pode responder.' using errcode = 'insufficient_privilege';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Este pedido ja foi respondido.' using errcode = 'check_violation';
  end if;

  update public.transfer_requests
     set status = (case when p_accept then 'accepted' else 'declined' end)::public.transfer_status,
         response_note = nullif(btrim(coalesce(p_note, '')), ''),
         responded_at = now()
   where id = p_request_id;

  if p_accept then
    -- O gatilho de `care_assignments` revalida genero, atividade e restricoes.
    update public.care_assignments
       set previous_caregiver_id = caregiver_id,
           caregiver_id = me,
           origin = 'transfer',
           transferred_at = now()
     where id = v_req.assignment_id;
  end if;

  select full_name into v_responder from public.profiles where id = me;
  select p.full_name into v_cared
    from public.care_assignments a join public.profiles p on p.id = a.cared_for_id
   where a.id = v_req.assignment_id;

  perform app.notify(
    v_req.requester_id,
    (case when p_accept then 'transfer_accepted' else 'transfer_declined' end)::public.notification_type,
    case when p_accept then 'Transferencia aceita' else 'Transferencia recusada' end,
    format('%s %s o cuidado de %s.', v_responder,
           case when p_accept then 'aceitou' else 'recusou' end, v_cared),
    '/');

  perform app.audit(
    case when p_accept then 'transfer.accepted' else 'transfer.declined' end,
    'transfer_requests', p_request_id, null,
    jsonb_build_object('assignmentId', v_req.assignment_id));
end;
$$;

create or replace function public.cancel_transfer(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
begin
  update public.transfer_requests set status = 'cancelled', responded_at = now()
   where id = p_request_id and status = 'pending' and requester_id = me;
  if not found then
    raise exception 'Nao foi possivel cancelar este pedido.' using errcode = 'check_violation';
  end if;
  perform app.audit('transfer.cancelled', 'transfer_requests', p_request_id);
end;
$$;

-- Reorganizacao direta do lider: exige justificativa e fica auditada.
create or replace function public.reassign_care(
  p_assignment_id uuid,
  p_new_caregiver_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.care_assignments;
  v_cared text;
begin
  perform app.require_leader();
  if nullif(btrim(coalesce(p_reason, '')), '') is null then
    raise exception 'Registre a justificativa da reorganizacao.' using errcode = 'check_violation';
  end if;

  select * into v_before from public.care_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'Cuidado nao encontrado.' using errcode = 'no_data_found';
  end if;
  if v_before.caregiver_id = p_new_caregiver_id then
    return;
  end if;

  update public.care_assignments
     set previous_caregiver_id = caregiver_id,
         caregiver_id = p_new_caregiver_id,
         origin = 'manual',
         transferred_at = now()
   where id = p_assignment_id;

  update public.transfer_requests set status = 'cancelled', responded_at = now()
   where assignment_id = p_assignment_id and status = 'pending';

  select full_name into v_cared from public.profiles where id = v_before.cared_for_id;
  perform app.notify(p_new_caregiver_id, 'assignment_new', 'Voce recebeu um cuidado',
                     format('A lideranca atribuiu o cuidado de %s a voce.', v_cared), '/');
  perform app.notify(v_before.caregiver_id, 'general', 'Um cuidado saiu da sua lista',
                     format('O cuidado de %s foi reorganizado pela lideranca.', v_cared), '/');

  perform app.audit('assignment.reassigned', 'care_assignments', p_assignment_id,
                    jsonb_build_object('caregiverId', v_before.caregiver_id),
                    jsonb_build_object('caregiverId', p_new_caregiver_id), p_reason);
end;
$$;

-- Ajuste pontual de uma semana em rascunho (adicionar/remover pessoa cuidada).
create or replace function public.set_draft_assignment(
  p_week_id uuid,
  p_cared_for_id uuid,
  p_caregiver_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.care_week_status;
begin
  perform app.require_leader();
  select status into v_status from public.care_weeks where id = p_week_id;
  if v_status is distinct from 'draft' then
    raise exception 'Use a reorganizacao com justificativa em semanas publicadas.'
      using errcode = 'check_violation';
  end if;

  if p_caregiver_id is null then
    delete from public.care_assignments where week_id = p_week_id and cared_for_id = p_cared_for_id;
    return;
  end if;

  insert into public.care_assignments (week_id, caregiver_id, cared_for_id, origin)
  values (p_week_id, p_caregiver_id, p_cared_for_id, 'manual')
  on conflict (week_id, cared_for_id)
  do update set caregiver_id = excluded.caregiver_id, origin = 'manual';
end;
$$;
