-- =============================================================================
-- Cuidar GC :: 0015 - a lideranca acompanha sem precisar perguntar
--
-- Ate aqui o lider so era avisado quando algo dava errado: um cuidado marcado
-- como "precisa da lideranca". O que ia bem acontecia em silencio - e liderar
-- no escuro obriga a cobrar, que e exatamente o que este produto existe para
-- evitar.
--
-- Agora as acoes dos discipulos chegam: cuidado registrado, transferencia
-- pedida. (Aceite e recusa de atividade ja chegam, pela migration 0013.)
-- =============================================================================

/**
 * Avisa a lideranca, menos quem fez a acao.
 *
 * Um lider que registra o proprio cuidado nao precisa ser avisado de si mesmo -
 * e receber aviso do que voce acabou de fazer e o caminho mais curto para
 * parar de ler os avisos.
 */
create or replace function app.notify_leaders(
  p_autor uuid,
  p_type public.notification_type,
  p_title text,
  p_body text,
  p_link text
)
returns void
language sql
security definer
set search_path = public, pg_temp
as $$
  select app.notify(p.id, p_type, p_title, p_body, p_link)
    from public.profiles p
   where p.role = 'leader'
     and p.status = 'active'
     and p.deleted_at is null
     and p.id is distinct from p_autor;
$$;

-- ------------------------------------------------------- cuidado registrado
create or replace function public.log_contact(
  p_assignment_id uuid,
  p_channel public.contact_channel,
  p_well_being public.well_being,
  p_coming_to_gc public.gc_intent default null,
  p_feedback text default null,
  p_contacted_on date default null,
  p_attention_level public.attention_level default null
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
  v_autor_name text;
  v_atencao public.attention_level;
  v_status public.assignment_status;
  v_respondeu boolean := p_well_being is distinct from 'sem_resposta';
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

  v_atencao := coalesce(p_attention_level, app.attention_from_well_being(p_well_being));
  v_status := case when v_respondeu then 'contacted' else 'awaiting_reply' end;

  insert into public.contact_logs (assignment_id, author_id, contacted_on, channel,
                                   got_reply, feedback, attention_level,
                                   well_being, coming_to_gc)
  values (p_assignment_id, me, coalesce(p_contacted_on, current_date), p_channel,
          v_respondeu, nullif(btrim(coalesce(p_feedback, '')), ''), v_atencao,
          p_well_being, p_coming_to_gc)
  returning id into v_log;

  update public.care_assignments
     set status = v_status,
         attention_level = v_atencao,
         last_contact_at = now()
   where id = p_assignment_id;

  select full_name into v_cared_name from public.profiles where id = v_assignment.cared_for_id;
  select full_name into v_autor_name from public.profiles where id = me;

  if v_atencao = 'leader_action' then
    perform app.notify_leaders(me, 'general', 'Um cuidado precisa da lideranca',
                               format('%s foi marcado como "lideranca precisa agir".', v_cared_name),
                               '/cuidados');
  else
    -- O que vai bem tambem chega: e assim que a lideranca acompanha sem cobrar.
    perform app.notify_leaders(me, 'general', 'Cuidado registrado',
                               format('%s registrou o cuidado de %s.', v_autor_name, v_cared_name),
                               '/cuidados');
  end if;

  perform app.audit('contact.logged', 'contact_logs', v_log, null,
                    jsonb_build_object('assignment', p_assignment_id,
                                       'wellBeing', p_well_being,
                                       'comingToGc', p_coming_to_gc));

  return v_log;
end;
$$;

grant execute on function public.log_contact(uuid, public.contact_channel, public.well_being,
  public.gc_intent, text, date, public.attention_level) to authenticated;

-- ---------------------------------------------------- transferencia pedida
do $$
declare
  fonte text;
begin
  select pg_get_functiondef(p.oid) into fonte
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'request_transfer' and p.prokind = 'f';

  -- Acrescenta o aviso a lideranca logo antes do fim, sem reescrever a regra
  -- de transferencia (que continua sendo a de sempre: so muda de dono depois
  -- do aceite).
  if fonte is not null and position('notify_leaders' in fonte) = 0 then
    fonte := replace(
      fonte,
      '  return v_id;',
      '  perform app.notify_leaders(me, ''transfer_requested'', ''Transferencia pedida'',
                             format(''%s pediu para transferir um cuidado.'',
                                    (select full_name from public.profiles where id = me)),
                             ''/cuidados'');

  return v_id;');
    execute fonte;
  end if;
end
$$;
