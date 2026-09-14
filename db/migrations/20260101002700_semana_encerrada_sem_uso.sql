-- =============================================================================
-- Cuidar GC :: 0027 - a semana encerrada antes de comecar pode ser refeita
--
-- A 0025 tratava toda semana encerrada como intocavel. No GC real isso
-- travou exatamente o caso que motivou a mudanca: em 07/09 a semana de 14 a 20
-- foi gerada, publicada e, vinte minutos depois, encerrada - para dar lugar a
-- de 07 a 13, que tinha ficado sem distribuicao. Ela nunca chegou a valer.
-- Na segunda, dia 14, "comecar hoje" esbarrava nela: "ja foi encerrada".
--
-- O que torna uma semana intocavel nao e a palavra na coluna `status`, e o
-- trabalho de alguem dentro dela. Encerrada ou publicada, sem nenhum cuidado
-- registrado ela e so uma lista que ninguem usou - e pode voltar a rascunho.
-- Com cuidado registrado, continua recusada, nos dois casos.
-- =============================================================================

create or replace function app.bloqueio_para_iniciar(p_group_id uuid, p_starts_on date)
returns text
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_week public.care_weeks;
begin
  select * into v_week
    from public.care_weeks
   where group_id = p_group_id and starts_on = p_starts_on;

  if v_week.id is null or v_week.status = 'draft' then
    return null;
  end if;

  if not exists (
    select 1 from public.contact_logs l
      join public.care_assignments a on a.id = l.assignment_id
     where a.week_id = v_week.id
  ) then
    return null;
  end if;

  if v_week.status = 'closed' then
    return format('A semana que começa em %s já foi encerrada com cuidados registrados. '
                  'Escolha outro dia.', to_char(p_starts_on, 'DD/MM'));
  end if;

  return format('A semana que começa em %s já tem cuidados registrados. Para ajustar quem '
                'cuida de quem, use o remanejamento; para recomeçar, escolha outro dia.',
                to_char(p_starts_on, 'DD/MM'));
end;
$$;

/**
 * Mesma gravacao da 0025. A diferenca e que a semana refeita pode vir de
 * encerrada, e por isso `closed_at` tambem volta a nulo: um rascunho com data
 * de encerramento apareceria no relatorio como se tivesse terminado.
 */
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

  perform app.audit(
    case when v_week.status in ('published', 'closed') then 'week.regenerated' else 'week.generated' end,
    'care_weeks', v_id, null,
    jsonb_build_object('startsOn', p_starts_on, 'endsOn', v_fim,
                       'total', jsonb_array_length(p_assignments)));
  return v_id;
end;
$$;

