-- =============================================================================
-- Cuidar GC :: 0009 - atividades, supervisao, integrantes e configuracao
-- =============================================================================

-- ------------------------------------------------------------------ atividades
create or replace function public.save_activity(
  p_id uuid,
  p_group_id uuid,
  p_week_id uuid,
  p_type public.activity_type,
  p_title text,
  p_description text,
  p_due_at timestamptz,
  p_status public.activity_status,
  p_notes text,
  p_is_recurring boolean,
  p_assignee_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.require_leader();
  v_id uuid;
begin
  if p_id is null then
    insert into public.activities (group_id, week_id, type, title, description, due_at,
                                   status, notes, is_recurring, created_by)
    values (p_group_id, p_week_id, coalesce(p_type, 'other'), btrim(p_title), p_description,
            p_due_at, coalesce(p_status, 'todo'), p_notes, coalesce(p_is_recurring, false), me)
    returning id into v_id;
  else
    update public.activities
       set week_id = p_week_id, type = coalesce(p_type, type), title = btrim(p_title),
           description = p_description, due_at = p_due_at,
           status = coalesce(p_status, status), notes = p_notes,
           is_recurring = coalesce(p_is_recurring, is_recurring)
     where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Atividade nao encontrada.' using errcode = 'no_data_found';
    end if;
  end if;

  delete from public.activity_assignees
   where activity_id = v_id
     and (p_assignee_ids is null or profile_id <> all (p_assignee_ids));

  if p_assignee_ids is not null then
    insert into public.activity_assignees (activity_id, profile_id)
    select v_id, unnest(p_assignee_ids)
    on conflict do nothing;

    perform app.notify(pid, 'activity_assigned', 'Voce foi indicado para uma atividade',
                       btrim(p_title), '/atividades')
      from unnest(p_assignee_ids) as pid
     where p_id is null;
  end if;

  return v_id;
end;
$$;

-- Responsavel move o proprio card; lider move qualquer um.
create or replace function public.set_activity_status(p_id uuid, p_status public.activity_status)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
begin
  if not app.is_leader() and not exists (
    select 1 from public.activity_assignees
     where activity_id = p_id and profile_id = me
  ) then
    raise exception 'Somente os responsaveis ou a lideranca alteram esta atividade.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.activities set status = p_status where id = p_id;
end;
$$;

-- Somente atividades recorrentes sao levadas para a nova semana. A distribuicao
-- de pessoas nunca e copiada.
create or replace function public.copy_recurring_activities(p_group_id uuid, p_week_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.require_leader();
  v_count int := 0;
  src record;
  v_new uuid;
begin
  for src in
    select distinct on (coalesce(a.recurrence_source_id, a.id)) a.*
      from public.activities a
     where a.group_id = p_group_id and a.is_recurring and a.status <> 'cancelled'
       and a.week_id is distinct from p_week_id
     order by coalesce(a.recurrence_source_id, a.id), a.created_at desc
  loop
    if exists (
      select 1 from public.activities x
       where x.week_id = p_week_id
         and coalesce(x.recurrence_source_id, x.id) = coalesce(src.recurrence_source_id, src.id)
    ) then
      continue;
    end if;

    insert into public.activities (group_id, week_id, type, title, description, status,
                                   is_recurring, recurrence_source_id, created_by)
    values (p_group_id, p_week_id, src.type, src.title, src.description, 'todo',
            true, coalesce(src.recurrence_source_id, src.id), me)
    returning id into v_new;

    insert into public.activity_assignees (activity_id, profile_id)
    select v_new, profile_id from public.activity_assignees where activity_id = src.id
    on conflict do nothing;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ------------------------------------------------------------------ supervisao
create or replace function public.update_supervision_request(
  p_id uuid,
  p_status public.supervision_status,
  p_scheduled_for timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
  v_req public.supervision_requests;
begin
  select * into v_req from public.supervision_requests where id = p_id for update;
  if not found then
    raise exception 'Solicitacao nao encontrada.' using errcode = 'no_data_found';
  end if;

  if app.is_supervisor() then
    if v_req.supervisor_id is not null and v_req.supervisor_id <> me then
      raise exception 'Esta solicitacao foi dirigida a outro supervisor.'
        using errcode = 'insufficient_privilege';
    end if;
    -- Ao responder, o supervisor assume a conversa.
    update public.supervision_requests
       set status = p_status,
           supervisor_id = coalesce(supervisor_id, me),
           seen_at = coalesce(seen_at, now()),
           scheduled_for = coalesce(p_scheduled_for, scheduled_for),
           closed_at = case when p_status in ('done', 'cancelled') then now() else null end
     where id = p_id;
  elsif v_req.requester_id = me and p_status = 'cancelled' then
    update public.supervision_requests
       set status = 'cancelled', closed_at = now() where id = p_id;
  else
    raise exception 'Sem permissao para alterar esta solicitacao.' using errcode = 'insufficient_privilege';
  end if;

  -- A notificacao vai apenas ao solicitante: uma conversa reservada nao gera
  -- rastro para a lideranca do GC.
  perform app.notify(v_req.requester_id, 'supervision_updated',
                     'Sua conversa com a supervisao foi atualizada', null, '/supervisao');
end;
$$;

-- ------------------------------------------------------------------ integrantes
create or replace function public.set_member_status(
  p_profile_id uuid,
  p_status public.member_status,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_before public.member_status;
begin
  perform app.require_leader();
  select status into v_before from public.profiles where id = p_profile_id;

  update public.profiles set status = p_status where id = p_profile_id;

  if p_status = 'inactive' then
    -- Encerra vinculos vigentes e remove a pessoa de rascunhos em aberto;
    -- semanas publicadas permanecem intactas como historico.
    update public.discipleship_links set ended_on = current_date
     where ended_on is null and (disciple_id = p_profile_id or leader_id = p_profile_id);

    delete from public.care_assignments a
     using public.care_weeks w
     where a.week_id = w.id and w.status = 'draft'
       and (a.caregiver_id = p_profile_id or a.cared_for_id = p_profile_id);

    update public.transfer_requests set status = 'cancelled', responded_at = now()
     where status = 'pending' and (requester_id = p_profile_id or recipient_id = p_profile_id);
  end if;

  perform app.audit('member.status_changed', 'profiles', p_profile_id,
                    jsonb_build_object('status', v_before),
                    jsonb_build_object('status', p_status), p_reason);
end;
$$;

create or replace function public.set_disciple_leader(p_disciple_id uuid, p_leader_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current uuid;
begin
  perform app.require_leader();

  select leader_id into v_current from public.discipleship_links
   where disciple_id = p_disciple_id and ended_on is null;

  if v_current is not distinct from p_leader_id then
    return;
  end if;

  update public.discipleship_links set ended_on = current_date
   where disciple_id = p_disciple_id and ended_on is null;

  if p_leader_id is not null then
    insert into public.discipleship_links (disciple_id, leader_id) values (p_disciple_id, p_leader_id);
  end if;

  perform app.audit('discipleship.changed', 'discipleship_links', p_disciple_id,
                    jsonb_build_object('leaderId', v_current),
                    jsonb_build_object('leaderId', p_leader_id));
end;
$$;

-- Confirmacao do genero de cuidado em lote, no assistente de primeiro acesso.
create or replace function public.confirm_care_genders(p_entries jsonb)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  entry jsonb;
  v_count int := 0;
begin
  perform app.require_leader();

  for entry in select * from jsonb_array_elements(p_entries) loop
    update public.profiles
       set care_gender = (entry ->> 'careGender')::public.care_gender,
           salutation = coalesce(
             (entry ->> 'salutation')::public.salutation,
             case (entry ->> 'careGender') when 'male' then 'irmao'::public.salutation
                                           else 'irma'::public.salutation end)
     where id = (entry ->> 'id')::uuid;
    v_count := v_count + 1;
  end loop;

  perform app.audit('care_gender.confirmed', 'profiles', null, null,
                    jsonb_build_object('count', v_count));
  return v_count;
end;
$$;

create or replace function public.complete_group_setup(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_pending int;
begin
  perform app.require_leader();

  select count(*) into v_pending from public.profiles
   where deleted_at is null and status = 'active'
     and role in ('leader', 'disciple', 'member') and care_gender is null;

  if v_pending > 0 then
    raise exception 'Ainda ha % integrante(s) sem genero de cuidado confirmado.', v_pending
      using errcode = 'check_violation';
  end if;

  update public.groups set setup_completed_at = now() where id = p_group_id;
  perform app.audit('group.setup_completed', 'groups', p_group_id);
end;
$$;

-- ---------------------------------------------------------------- indicadores
-- Resumo do GC para a home da lideranca. Nao inclui nada da supervisao
-- reservada e nao devolve texto de feedback.
create or replace function public.group_week_summary(p_week_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  if not app.is_leadership() then
    raise exception 'Resumo disponivel apenas para lideres e supervisores.'
      using errcode = 'insufficient_privilege';
  end if;

  return (
    select jsonb_build_object(
      'total', count(*),
      'pending', count(*) filter (where status = 'pending'),
      'contacted', count(*) filter (where status = 'contacted'),
      'awaitingReply', count(*) filter (where status = 'awaiting_reply'),
      'followUp', count(*) filter (where status = 'follow_up'),
      'needsAttention', count(*) filter (where status = 'needs_attention'),
      'leaderAction', count(*) filter (where attention_level = 'leader_action'),
      'watch', count(*) filter (where attention_level = 'watch'),
      'byCaregiver', coalesce((
        select jsonb_agg(x order by x ->> 'name')
          from (
            select jsonb_build_object(
                     'caregiverId', p.id, 'name', p.full_name, 'careGender', p.care_gender,
                     'total', count(*),
                     'done', count(*) filter (where a2.status <> 'pending')) as x
              from public.care_assignments a2
              join public.profiles p on p.id = a2.caregiver_id
             where a2.week_id = p_week_id
             group by p.id, p.full_name, p.care_gender
          ) s
      ), '[]'::jsonb)
    )
    from public.care_assignments where week_id = p_week_id
  );
end;
$$;

grant execute on function
  public.create_invite(uuid, text),
  public.revoke_invite(uuid),
  public.get_distribution_input(uuid, date),
  public.apply_week_generation(uuid, date, date, text, jsonb, jsonb),
  public.publish_care_week(uuid),
  public.close_care_week(uuid),
  public.log_contact(uuid, public.contact_channel, date, boolean, text,
                     public.attention_level, public.assignment_status),
  public.request_transfer(uuid, uuid, text),
  public.respond_transfer(uuid, boolean, text),
  public.cancel_transfer(uuid),
  public.reassign_care(uuid, uuid, text),
  public.set_draft_assignment(uuid, uuid, uuid),
  public.save_activity(uuid, uuid, uuid, public.activity_type, text, text, timestamptz,
                       public.activity_status, text, boolean, uuid[]),
  public.set_activity_status(uuid, public.activity_status),
  public.copy_recurring_activities(uuid, uuid),
  public.update_supervision_request(uuid, public.supervision_status, timestamptz),
  public.set_member_status(uuid, public.member_status, text),
  public.set_disciple_leader(uuid, uuid),
  public.confirm_care_genders(jsonb),
  public.complete_group_setup(uuid),
  public.group_week_summary(uuid)
to authenticated;
