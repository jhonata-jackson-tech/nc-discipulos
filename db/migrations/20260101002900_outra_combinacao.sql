-- =============================================================================
-- Cuidar GC :: 0029 - outra combinacao, sem perder o que ja foi feito
--
-- A lideranca quer olhar o rascunho e pedir outra combinacao, quantas vezes
-- precisar. A geracao sempre foi deterministica - mesma semana, mesma semente,
-- mesmas duplas - e isso continua: "outra combinacao" e so outra semente, que
-- a API recebe e grava em `care_weeks.seed`.
--
-- O cuidado e com o que ja existe. Em 14/09 um cuidado foi registrado num
-- rascunho (Jenifer com a Camila), e refazer o rascunho apagava esse registro
-- em cascata junto com as atribuicoes. Agora:
--
--   · a leitura informa as duplas que ja tem cuidado registrado
--     (`pinnedPairs`), e o algoritmo as mantem presas na combinacao nova;
--   · a gravacao guarda os registros antes de trocar as atribuicoes e os
--     devolve para a atribuicao nova da mesma pessoa.
--
-- As regras de publicada e encerrada nao mudam: com cuidado registrado, elas
-- continuam sem poder ser refeitas (`app.bloqueio_para_iniciar`).
-- =============================================================================

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
        from (
          select a.caregiver_id, a.cared_for_id,
                 max(w.starts_on) as last_used_on, count(*)::int as times_used
            from public.care_assignments a
            join public.care_weeks w on w.id = a.week_id
           where w.group_id = p_group_id
             and w.status in ('published', 'closed')
             and w.starts_on < p_starts_on
           group by a.caregiver_id, a.cared_for_id
        ) h
    ), '[]'::jsonb),

    'extraSlotHistory', coalesce((
      select jsonb_object_agg(caregiver, total)
        from (
          select cg.value as caregiver, count(*)::int as total
            from public.care_weeks w
            cross join lateral jsonb_array_elements_text(
              coalesce(w.generation_report -> 'extraSlots', '[]'::jsonb)) as cg(value)
           where w.group_id = p_group_id and w.status in ('published', 'closed')
             and w.starts_on < p_starts_on
           group by cg.value
        ) s
    ), '{}'::jsonb),

    -- Duplas do rascunho que ja tem cuidado registrado: sortear de novo nao
    -- pode solta-las, senao o registro ficaria pendurado em outra pessoa.
    'pinnedPairs', coalesce((
      select jsonb_agg(distinct jsonb_build_object('caregiverId', a.caregiver_id,
                                                   'caredForId', a.cared_for_id))
        from public.care_weeks w
        join public.care_assignments a on a.week_id = w.id
       where w.group_id = p_group_id and w.starts_on = p_starts_on
         and exists (select 1 from public.contact_logs l where l.assignment_id = a.id)
    ), '[]'::jsonb),

    'bloqueio', app.bloqueio_para_iniciar(p_group_id, p_starts_on)
  ) into result;

  return result;
end;
$$;


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
  v_fim date;
  v_bloqueio text;
  item jsonb;
begin
  v_bloqueio := app.bloqueio_para_iniciar(p_group_id, p_starts_on);
  if v_bloqueio is not null then
    raise exception '%', v_bloqueio using errcode = 'check_violation';
  end if;

  select * into v_week from public.care_weeks
   where group_id = p_group_id and starts_on = p_starts_on
   for update;

  v_fim := least(coalesce(p_ends_on, p_starts_on + 6),
                 app.fim_da_semana(p_group_id, p_starts_on, v_week.id));

  if v_week.id is not null then
    -- Os cuidados ja registrados atravessam a troca de combinacao: o registro
    -- sai da atribuicao antiga e volta na nova da mesma pessoa.
    create temp table if not exists pg_temp.cuidados_da_troca (
      log public.contact_logs,
      cared_for_id uuid,
      status public.assignment_status,
      attention_level public.attention_level,
      last_contact_at timestamptz
    ) on commit drop;
    delete from pg_temp.cuidados_da_troca;

    insert into pg_temp.cuidados_da_troca
    select l, a.cared_for_id, a.status, a.attention_level, a.last_contact_at
      from public.contact_logs l
      join public.care_assignments a on a.id = l.assignment_id
     where a.week_id = v_week.id;

    delete from public.care_assignments where week_id = v_week.id;
    update public.care_weeks
       set ends_on = v_fim, seed = p_seed, generation_report = p_report,
           generated_at = now(), generated_by = me,
           status = 'draft', published_at = null, published_by = null, closed_at = null
     where id = v_week.id
    returning id into v_id;
  else
    insert into public.care_weeks (group_id, starts_on, ends_on, seed, status,
                                   generation_report, generated_at, generated_by)
    values (p_group_id, p_starts_on, v_fim, p_seed, 'draft', p_report, now(), me)
    returning id into v_id;
  end if;

  for item in select * from jsonb_array_elements(p_assignments) loop
    insert into public.care_assignments (week_id, caregiver_id, cared_for_id, origin)
    values (v_id,
            (item ->> 'caregiverId')::uuid,
            (item ->> 'caredForId')::uuid,
            coalesce((item ->> 'origin')::public.assignment_origin, 'rotation'));
  end loop;

  if v_week.id is not null then
    insert into public.contact_logs (id, assignment_id, author_id, contacted_on, channel,
                                     got_reply, feedback, attention_level, created_at,
                                     well_being, coming_to_gc)
    select (t.log).id, a.id, (t.log).author_id, (t.log).contacted_on, (t.log).channel,
           (t.log).got_reply, (t.log).feedback, (t.log).attention_level, (t.log).created_at,
           (t.log).well_being, (t.log).coming_to_gc
      from pg_temp.cuidados_da_troca t
      join public.care_assignments a on a.week_id = v_id and a.cared_for_id = t.cared_for_id;

    update public.care_assignments a
       set status = t.status, attention_level = t.attention_level, last_contact_at = t.last_contact_at
      from (select distinct on (cared_for_id) * from pg_temp.cuidados_da_troca
             order by cared_for_id, last_contact_at desc nulls last) t
     where a.week_id = v_id and a.cared_for_id = t.cared_for_id;
  end if;

  perform app.audit(
    case when v_week.status in ('published', 'closed') then 'week.regenerated' else 'week.generated' end,
    'care_weeks', v_id, null,
    jsonb_build_object('startsOn', p_starts_on, 'endsOn', v_fim,
                       'total', jsonb_array_length(p_assignments)));
  return v_id;
end;
$$;

