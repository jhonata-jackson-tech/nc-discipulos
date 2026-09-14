-- =============================================================================
-- Cuidar GC :: 0025 - a semana comeca no dia em que a lideranca esta, e
-- termina com um relatorio
--
-- Duas coisas que andavam juntas sem ninguem perceber.
--
-- 1. **Comecar.** A semana so sabia nascer numa segunda, e so a "atual" ou a
--    "proxima". Na segunda-feira em que a semana ja tinha sido gerada sete dias
--    antes - com o historico de antes da semana que acabou de passar - nao
--    havia como recomecar: o botao dizia "proxima semana", e a publicada nao
--    podia ser refeita. Agora a lideranca escolhe o dia. A semana dura sete
--    dias, ou termina na vespera da proxima que ja estiver marcada, e a que
--    ainda estava valendo termina na vespera da nova quando ela for publicada.
--
--    Refazer uma semana publicada continua proibido **depois** que alguem
--    registrou cuidado nela: ali ja existe trabalho de alguem, e regerar
--    apagaria esse trabalho. Antes disso, e so uma lista que ninguem usou.
--
-- 2. **Terminar.** Encerrar era mudar uma palavra na tabela. A pergunta que a
--    lideranca faz no fim da semana - quem cuidou de quem, quem ficou sem
--    ninguem, quem esta ha mais tempo sem cuidado, quem esta cuidando de
--    verdade - ficava espalhada em tres telas e na memoria. Agora o
--    encerramento produz um relatorio, e ele chega por aviso a lideranca.
--    A semana que terminou se encerra sozinha na manha seguinte: o relatorio
--    nao pode depender de alguem lembrar de apertar um botao.
-- =============================================================================

-- ------------------------------------------------------------------- o hoje
/**
 * "Hoje" no fuso do GC.
 *
 * O banco roda em UTC. As 22h de domingo em Sao Paulo ja e segunda em UTC -
 * e uma semana que "terminou ontem" as 22h de domingo encerraria com um dia
 * de antecedencia.
 */
create or replace function app.hoje()
returns date
language sql
stable
as $$
  select (now() at time zone 'America/Sao_Paulo')::date;
$$;

grant execute on function app.hoje() to authenticated;

-- ----------------------------------------------------- o que conta como feito
/**
 * O cuidado aconteceu.
 *
 * `awaiting_reply` fica de fora de proposito: mandar mensagem para quem nao
 * respondeu e esforco de quem cuida, mas a pessoa do outro lado continua sem
 * ter sido cuidada. O relatorio mostra as duas coisas separadas.
 */
create or replace function app.cuidado_feito(p public.assignment_status)
returns boolean
language sql
immutable
as $$
  select p in ('contacted', 'follow_up', 'needs_attention');
$$;

grant execute on function app.cuidado_feito(public.assignment_status) to authenticated;

-- --------------------------------------------------------- onde a semana acaba
/**
 * O ultimo dia de uma semana que comeca em `p_starts_on`.
 *
 * Sete dias, a menos que ja exista outra semana publicada marcada para antes
 * disso: ai ela termina na vespera. Duas semanas publicadas cobrindo o mesmo
 * dia fariam a mesma pessoa aparecer com duas listas de cuidado.
 *
 * Rascunho nao conta. Um rascunho esquecido para quinta nao pode encurtar a
 * semana que a lideranca esta comecando hoje - ele e que perde a vez.
 */
create or replace function app.fim_da_semana(
  p_group_id uuid,
  p_starts_on date,
  p_ignorar uuid default null
)
returns date
language sql
stable
set search_path = public, pg_temp
as $$
  select least(
    p_starts_on + 6,
    coalesce((select min(w.starts_on) - 1
                from public.care_weeks w
               where w.group_id = p_group_id
                 and w.status in ('published', 'closed')
                 and w.starts_on > p_starts_on
                 and w.id is distinct from p_ignorar), p_starts_on + 6));
$$;

/**
 * O que impede comecar uma semana neste dia - ou nulo, se nada impede.
 *
 * A mensagem ja vem pronta para a tela. Mora aqui para o servico de geracao e
 * a gravacao concordarem sobre a regra: um checa antes de rodar o algoritmo,
 * o outro confere de novo antes de gravar.
 */
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

  if v_week.id is null then
    return null;
  end if;

  if v_week.status = 'closed' then
    return format('A semana que começa em %s já foi encerrada. Escolha outro dia.',
                  to_char(p_starts_on, 'DD/MM'));
  end if;

  if v_week.status = 'published' and exists (
    select 1 from public.contact_logs l
      join public.care_assignments a on a.id = l.assignment_id
     where a.week_id = v_week.id
  ) then
    return format('A semana que começa em %s já tem cuidados registrados. Para ajustar quem '
                  'cuida de quem, use o remanejamento; para recomeçar, escolha outro dia.',
                  to_char(p_starts_on, 'DD/MM'));
  end if;

  return null;
end;
$$;

-- ------------------------------------------------------------ o que o algoritmo le
/**
 * A mesma leitura de sempre, com duas mudancas.
 *
 * O historico de duplas deixa de fora a propria semana e as que comecam
 * depois dela. Sem isso, refazer uma semana publicada faria o algoritmo evitar
 * as duplas *dela mesma*, como se ja tivessem acontecido - e gerar uma semana
 * no meio de outras faria o futuro decidir o presente.
 *
 * `hasPublishedWeek` vira `bloqueio`: ja nao basta saber se esta publicada, e
 * preciso saber se alguem ja trabalhou nela.
 */
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

    'bloqueio', app.bloqueio_para_iniciar(p_group_id, p_starts_on)
  ) into result;

  return result;
end;
$$;

-- ------------------------------------------------------------------ gravar
/**
 * Grava o resultado do algoritmo.
 *
 * O fim da semana e decidido aqui, e nao por quem chama: sete dias, ou a
 * vespera da proxima semana ja marcada. Uma semana publicada que ninguem usou
 * volta a ser rascunho e e refeita inteira - sai do ar ate ser publicada de
 * novo, e a tela avisa isso antes.
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
           status = 'draft', published_at = null, published_by = null
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
    case when v_week.status = 'published' then 'week.regenerated' else 'week.generated' end,
    'care_weeks', v_id, null,
    jsonb_build_object('startsOn', p_starts_on, 'endsOn', v_fim,
                       'total', jsonb_array_length(p_assignments)));
  return v_id;
end;
$$;

-- ================================================================ encerrar
/**
 * Avisa a lideranca que o relatorio da semana esta pronto.
 *
 * O titulo diz so o periodo, e o corpo so numeros: o aviso aparece na tela de
 * bloqueio, e nome de quem ficou sem cuidado nao e coisa para quem passa ao
 * lado ler.
 */
create or replace function app.avisar_relatorio_semana(p_week_id uuid)
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week public.care_weeks;
  v_total int;
  v_feitos int;
  v_sem int;
  v_avisados int;
begin
  select * into v_week from public.care_weeks where id = p_week_id;
  if v_week.id is null then
    return 0;
  end if;

  select count(*),
         count(*) filter (where app.cuidado_feito(a.status)),
         count(*) filter (where a.status = 'pending')
    into v_total, v_feitos, v_sem
    from public.care_assignments a
   where a.week_id = p_week_id;

  with avisados as (
    select app.notify(
             p.id, 'general',
             format('Relatório da semana de %s a %s',
                    to_char(v_week.starts_on, 'DD/MM'), to_char(v_week.ends_on, 'DD/MM')),
             format('%s de %s cuidados feitos · %s sem nenhum contato', v_feitos, v_total, v_sem),
             '/agenda/' || p_week_id)
      from public.profiles p
     where p.role in ('leader', 'supervisor')
       and p.status = 'active' and p.deleted_at is null
  )
  select count(*) into v_avisados from avisados;

  return v_avisados;
end;
$$;

/**
 * Encerra uma semana publicada e manda o relatorio.
 *
 * Quem encerra antes do fim encurta a semana ate `p_ate`: o relatorio precisa
 * dizer o periodo que de fato valeu. Sem sessao nenhuma (o relogio da manha),
 * a auditoria fica sem autor - e e isso mesmo que aconteceu.
 */
create or replace function app.encerrar_semana(p_week_id uuid, p_ate date default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week public.care_weeks;
  v_fim date;
begin
  select * into v_week from public.care_weeks where id = p_week_id for update;
  if v_week.id is null or v_week.status <> 'published' then
    return false;
  end if;

  v_fim := greatest(v_week.starts_on, least(v_week.ends_on, coalesce(p_ate, v_week.ends_on)));

  update public.care_weeks
     set status = 'closed', closed_at = now(), ends_on = v_fim
   where id = p_week_id;

  perform app.audit('week.closed', 'care_weeks', p_week_id, null,
                    jsonb_build_object('endsOn', v_fim));
  perform app.avisar_relatorio_semana(p_week_id);
  return true;
end;
$$;

create or replace function public.close_care_week(p_week_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_week public.care_weeks;
begin
  perform app.require_leader();

  select * into v_week from public.care_weeks where id = p_week_id;
  if v_week.id is null then
    raise exception 'Semana nao encontrada.' using errcode = 'no_data_found';
  end if;
  if v_week.status <> 'published' then
    raise exception 'Somente uma semana publicada pode ser encerrada.'
      using errcode = 'check_violation';
  end if;
  if v_week.starts_on > app.hoje() then
    raise exception 'Esta semana ainda nao comecou.' using errcode = 'check_violation';
  end if;

  perform app.encerrar_semana(p_week_id, app.hoje());
end;
$$;

/**
 * Publica a semana.
 *
 * Duas coisas novas antes do aviso de sempre. A semana nao pode passar por
 * cima da proxima ja marcada, entao o fim e conferido de novo. E a semana que
 * ainda estava valendo termina na vespera desta: se a vespera ja passou, ela
 * se encerra agora e o relatorio sai; se ainda nao, ela so fica mais curta e
 * o relogio encerra no dia certo.
 */
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
  v_anterior public.care_weeks;
  caregiver record;
begin
  select * into v_week from public.care_weeks where id = p_week_id for update;
  if not found then
    raise exception 'Semana nao encontrada.' using errcode = 'no_data_found';
  end if;
  if v_week.status <> 'draft' then
    raise exception 'Somente uma semana em rascunho pode ser publicada.' using errcode = 'check_violation';
  end if;

  select count(*) into v_conflicts
    from public.care_assignments a
    join public.profiles cg on cg.id = a.caregiver_id
    join public.profiles cf on cf.id = a.cared_for_id
   where a.week_id = p_week_id and cg.care_gender is distinct from cf.care_gender;

  if v_conflicts > 0 then
    raise exception 'Ha % cuidado(s) entre pessoas de generos diferentes. Corrija antes de publicar.', v_conflicts
      using errcode = 'check_violation';
  end if;

  for v_anterior in
    select * from public.care_weeks w
     where w.group_id = v_week.group_id
       and w.id <> p_week_id
       and w.status in ('published', 'closed')
       and w.starts_on < v_week.starts_on
       and w.ends_on >= v_week.starts_on
     for update
  loop
    update public.care_weeks set ends_on = v_week.starts_on - 1 where id = v_anterior.id;

    if v_anterior.status = 'published' and v_week.starts_on <= app.hoje() then
      perform app.encerrar_semana(v_anterior.id);
    end if;
  end loop;

  update public.care_weeks
     set status = 'published', published_at = now(), published_by = me,
         ends_on = least(ends_on, app.fim_da_semana(group_id, starts_on, id))
   where id = p_week_id
  returning * into v_week;

  -- Rascunhos que cobririam algum dia desta semana perderam o sentido:
  -- publicar qualquer um deles agora cortaria a semana que acabou de sair, ou
  -- sairia cortado por ela. Atividade que ja estava pendurada num deles vem
  -- para esta, em vez de ficar sem semana.
  update public.activities act
     set week_id = p_week_id
    from public.care_weeks w
   where act.week_id = w.id
     and w.group_id = v_week.group_id
     and w.status = 'draft'
     and w.id <> p_week_id
     and w.starts_on <= v_week.ends_on
     and w.ends_on >= v_week.starts_on;

  delete from public.care_weeks w
   where w.group_id = v_week.group_id
     and w.status = 'draft'
     and w.id <> p_week_id
     and w.starts_on <= v_week.ends_on
     and w.ends_on >= v_week.starts_on;

  for caregiver in
    select a.caregiver_id, count(*)::int as total
      from public.care_assignments a where a.week_id = p_week_id
     group by a.caregiver_id
  loop
    perform app.notify(
      caregiver.caregiver_id, 'week_published', 'Sua semana de cuidado esta disponivel',
      format('De %s a %s você ficou responsável por %s pessoa(s).',
             to_char(v_week.starts_on, 'DD/MM'), to_char(v_week.ends_on, 'DD/MM'),
             caregiver.total),
      '/');
  end loop;

  perform app.audit('week.published', 'care_weeks', p_week_id, null,
                    jsonb_build_object('startsOn', v_week.starts_on, 'endsOn', v_week.ends_on));
end;
$$;

-- ============================================================ o relogio
/** As semanas publicadas cujo ultimo dia ja passou. Devolve quantas encerrou. */
create or replace function app.encerrar_semanas_vencidas()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_total int := 0;
begin
  for v_id in
    select id from public.care_weeks
     where status = 'published' and ends_on < app.hoje()
     order by starts_on
  loop
    if app.encerrar_semana(v_id) then
      v_total := v_total + 1;
    end if;
  end loop;

  return v_total;
end;
$$;

/**
 * "Sua semana comecou" no dia em que a semana comeca - que ja nao e sempre
 * segunda.
 *
 * Uma semana publicada no proprio dia de inicio ja avisou na publicacao; a
 * que foi publicada antes avisa aqui, na manha do primeiro dia.
 */
create or replace function app.avisar_semana()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_semana public.care_weeks;
  v_total int := 0;
begin
  select * into v_semana
    from public.care_weeks
   where status = 'published'
     and starts_on = app.hoje()
     and (published_at at time zone 'America/Sao_Paulo')::date < starts_on
   order by starts_on desc
   limit 1;

  if not found then
    return 0;
  end if;

  with gente as (
    select p.id,
           (select count(*) from public.care_assignments a
             where a.week_id = v_semana.id and a.caregiver_id = p.id) as cuidados,
           (select count(*) from public.activity_assignees aa
              join public.activities act on act.id = aa.activity_id
             where aa.profile_id = p.id and act.week_id = v_semana.id) as atividades
      from public.profiles p
     where p.status = 'active' and p.deleted_at is null and p.user_id is not null
  ),
  avisados as (
    select app.notify(
             g.id, 'week_published', 'Sua semana começou',
             trim(both ' · ' from
               concat_ws(' · ',
                 case when g.cuidados > 0
                      then format('%s pessoa(s) para cuidar', g.cuidados) end,
                 case when g.atividades > 0
                      then format('%s atividade(s)', g.atividades) end)),
             '/')
      from gente g
     where g.cuidados > 0 or g.atividades > 0
  )
  select count(*) into v_total from avisados;

  return v_total;
end;
$$;

/**
 * O relogio, agora com o encerramento.
 *
 * Encerrar vem antes de "sua semana comecou": na manha em que uma semana
 * termina e a outra comeca, a lideranca recebe o relatorio da que passou e o
 * GC recebe a lista da nova, nessa ordem.
 */
create or replace function app.rodar_avisos_agendados()
returns table (tarefa text, avisos int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  agora timestamp := (now() at time zone 'America/Sao_Paulo');
  hoje date := agora::date;
  hora int := extract(hour from agora);
  v_avisos int;
begin
  if hora >= 7
     and not exists (select 1 from app.tarefas_executadas t
                      where t.tarefa = 'encerrar_semanas' and t.dia = hoje) then
    v_avisos := app.encerrar_semanas_vencidas();
    insert into app.tarefas_executadas (tarefa, dia, avisos)
    values ('encerrar_semanas', hoje, v_avisos);
    tarefa := 'encerrar_semanas'; avisos := v_avisos; return next;
  end if;

  if hora >= 7
     and not exists (select 1 from app.tarefas_executadas t
                      where t.tarefa = 'semana' and t.dia = hoje) then
    v_avisos := app.avisar_semana();
    insert into app.tarefas_executadas (tarefa, dia, avisos) values ('semana', hoje, v_avisos);
    tarefa := 'semana'; avisos := v_avisos; return next;
  end if;

  if hora >= 8
     and not exists (select 1 from app.tarefas_executadas t
                      where t.tarefa = 'aniversarios' and t.dia = hoje) then
    v_avisos := app.avisar_aniversarios();
    insert into app.tarefas_executadas (tarefa, dia, avisos)
    values ('aniversarios', hoje, v_avisos);
    tarefa := 'aniversarios'; avisos := v_avisos; return next;
  end if;

  return;
end;
$$;

revoke all on function app.rodar_avisos_agendados() from public, anon, authenticated;

-- ============================================================= o relatorio
/**
 * Semanas seguidas em que a pessoa ficou sem ser cuidada, ate `p_ate`.
 *
 * Conta de tras para frente so as semanas em que ela estava na lista de
 * alguem, e para na primeira em que o cuidado aconteceu. Semana em que ela
 * nem estava na distribuicao nao entra: quem chegou ao GC mes passado nao
 * carrega as semanas de antes de existir.
 */
create or replace function app.semanas_sem_cuidado(p_profile uuid, p_ate date)
returns int
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_status public.assignment_status;
  v_total int := 0;
begin
  for v_status in
    select a.status
      from public.care_assignments a
      join public.care_weeks w on w.id = a.week_id
     where a.cared_for_id = p_profile
       and w.status in ('published', 'closed')
       and w.starts_on <= p_ate
     order by w.starts_on desc
  loop
    exit when app.cuidado_feito(v_status);
    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

/**
 * O relatorio de uma semana, inteiro, em uma chamada.
 *
 * Responde as quatro perguntas do fim da semana:
 *
 *   · quem cuidou de quem, e como a pessoa estava;
 *   · quem foi cuidado e quem ficou sem ninguem;
 *   · quem esta ha mais tempo sem cuidado - no GC inteiro, nao so nesta lista;
 *   · quem esta cuidando de verdade, olhando as ultimas seis semanas e nao so
 *     esta: uma semana ruim acontece, seis seguidas e outra conversa.
 *
 * A avaliacao de quem cuida conta tentativa como esforco. Mandar mensagem
 * toda semana para quem nao responde e cuidar; o que o relatorio separa e a
 * pessoa do outro lado, que continua sem cuidado ate responder.
 *
 * `security definer` porque junta o que a RLS mostra pessoa a pessoa. A guarda
 * de papel esta na primeira linha - e e a mesma do relatorio geral.
 */
create or replace function public.relatorio_semana(p_week_id uuid)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_semana public.care_weeks;
  v_recorte uuid[];
  v_anterior uuid;
  v_ate date;
begin
  if not app.is_leadership() then
    raise exception 'Somente lideranca e supervisao veem o relatorio.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_semana from public.care_weeks where id = p_week_id;
  if v_semana.id is null or v_semana.status = 'draft' then
    raise exception 'Relatorio indisponivel: a semana nao existe ou ainda e rascunho.'
      using errcode = 'no_data_found';
  end if;

  -- Ate seis semanas terminando nesta, da mais antiga para a mais nova.
  select array_agg(id order by starts_on) into v_recorte
    from (select id, starts_on from public.care_weeks
           where group_id = v_semana.group_id
             and status in ('published', 'closed')
             and starts_on <= v_semana.starts_on
           order by starts_on desc
           limit 6) s;

  select id into v_anterior
    from public.care_weeks
   where group_id = v_semana.group_id and status in ('published', 'closed')
     and starts_on < v_semana.starts_on
   order by starts_on desc
   limit 1;

  -- "Ha quantos dias sem cuidado" e contado ate o fim da semana, ou ate hoje
  -- se ela ainda esta correndo.
  v_ate := least(v_semana.ends_on, app.hoje());

  return (
    with
    atrib as (
      select a.id,
             a.status,
             a.attention_level,
             a.origin,
             a.transferred_at,
             app.cuidado_feito(a.status) as feito,
             cf.id as cf_id, public.display_name(cf) as cf_nome, cf.full_name as cf_completo,
             cf.role as cf_papel, cf.care_gender as genero,
             cg.id as cg_id, public.display_name(cg) as cg_nome, cg.full_name as cg_completo,
             cg.role as cg_papel,
             ant.id as ant_id, public.display_name(ant) as ant_nome,
             ult.contacted_on, ult.channel, ult.well_being, ult.coming_to_gc, ult.feedback,
             (select count(*) from public.contact_logs l where l.assignment_id = a.id) as registros
        from public.care_assignments a
        join public.profiles cf on cf.id = a.cared_for_id
        join public.profiles cg on cg.id = a.caregiver_id
        left join public.profiles ant on ant.id = a.previous_caregiver_id
        left join lateral (
          select l.contacted_on, l.channel, l.well_being, l.coming_to_gc, l.feedback
            from public.contact_logs l
           where l.assignment_id = a.id
           order by l.contacted_on desc, l.created_at desc
           limit 1
        ) ult on true
       where a.week_id = p_week_id
    ),
    -- Como cada cuidador foi em cada semana do recorte.
    por_semana as (
      select a.caregiver_id, a.week_id,
             count(*) as total,
             count(*) filter (where app.cuidado_feito(a.status)) as feitos,
             count(*) filter (where a.status = 'awaiting_reply') as tentativas
        from public.care_assignments a
       where a.week_id = any (v_recorte)
       group by a.caregiver_id, a.week_id
    ),
    constancia as (
      select caregiver_id,
             count(*) as semanas,
             sum(total) as combinados,
             sum(feitos) as feitos,
             sum(tentativas) as tentativas,
             (sum(feitos) + sum(tentativas))::numeric / nullif(sum(total), 0) as taxa
        from por_semana
       group by caregiver_id
    ),
    cuidadores as (
      select ar.cg_id,
             jsonb_build_object(
               'id', ar.cg_id,
               'nome', ar.cg_nome,
               'nomeCompleto', ar.cg_completo,
               'papel', ar.cg_papel,
               'genero', min(ar.genero::text),
               'total', count(*),
               'feitos', count(*) filter (where ar.feito),
               'tentativas', count(*) filter (where ar.status = 'awaiting_reply'),
               'semContato', count(*) filter (where ar.status = 'pending'),
               'situacao', case
                 when count(*) filter (where ar.status = 'pending') = 0 then 'todos'
                 when count(*) filter (where ar.status <> 'pending') = 0 then 'nenhum'
                 else 'parte'
               end,
               'avaliacao', case
                 when c.semanas < 2 then 'pouco_historico'
                 when c.taxa >= 0.8 then 'constante'
                 when c.taxa >= 0.5 then 'oscilando'
                 else 'ausente'
               end,
               'constancia', jsonb_build_object(
                 'semanas', c.semanas,
                 'combinados', c.combinados,
                 'feitos', c.feitos,
                 'tentativas', c.tentativas,
                 'taxa', round(coalesce(c.taxa, 0), 2)
               ),
               'historico', (
                 select jsonb_agg(jsonb_build_object(
                          'inicio', w.starts_on,
                          'total', coalesce(ps.total, 0),
                          'feitos', coalesce(ps.feitos, 0),
                          'tentativas', coalesce(ps.tentativas, 0)
                        ) order by w.starts_on)
                   from public.care_weeks w
                   left join por_semana ps on ps.week_id = w.id and ps.caregiver_id = ar.cg_id
                  where w.id = any (v_recorte)
               ),
               'pessoas', jsonb_agg(jsonb_build_object(
                 'id', ar.cf_id,
                 'nome', ar.cf_nome,
                 'nomeCompleto', ar.cf_completo,
                 'situacao', case when ar.feito then 'cuidada'
                                  when ar.status = 'awaiting_reply' then 'sem_resposta'
                                  else 'sem_contato' end,
                 'contatoEm', ar.contacted_on,
                 'canal', ar.channel,
                 'comoEsta', ar.well_being,
                 'vemAoGc', ar.coming_to_gc
               ) order by ar.feito, ar.cf_nome)
             ) as linha
        from atrib ar
        left join constancia c on c.caregiver_id = ar.cg_id
       group by ar.cg_id, ar.cg_nome, ar.cg_completo, ar.cg_papel,
                c.semanas, c.combinados, c.feitos, c.tentativas, c.taxa
    ),
    -- Ultimo cuidado de verdade (com resposta) de cada pessoa ate a data.
    ultimo_cuidado as (
      select a.cared_for_id, max(l.contacted_on) as quando
        from public.contact_logs l
        join public.care_assignments a on a.id = l.assignment_id
       where l.got_reply and l.contacted_on <= v_ate
       group by a.cared_for_id
    ),
    -- Quem entra no rodizio como pessoa cuidada, no GC inteiro.
    elenco as (
      select p.id, public.display_name(p) as nome, p.full_name, p.role, p.care_gender
        from public.profiles p
       where p.status = 'active' and p.deleted_at is null
         and p.role in ('disciple', 'member')
         and p.care_gender is not null
         and exists (select 1 from public.group_memberships m
                      where m.profile_id = p.id and m.group_id = v_semana.group_id
                        and m.left_at is null)
    )
    select jsonb_build_object(
      'semana', jsonb_build_object(
        'id', v_semana.id,
        'inicio', v_semana.starts_on,
        'fim', v_semana.ends_on,
        'situacao', v_semana.status,
        'publicadaEm', v_semana.published_at,
        'encerradaEm', v_semana.closed_at
      ),

      'resumo', (
        select jsonb_build_object(
                 'combinados', count(*),
                 'cuidados', count(*) filter (where ar.feito),
                 'semResposta', count(*) filter (where ar.status = 'awaiting_reply'),
                 'semContato', count(*) filter (where ar.status = 'pending'),
                 'precisamDaLideranca', count(*) filter (where ar.attention_level = 'leader_action'),
                 'vemAoGc', count(*) filter (where ar.coming_to_gc = 'vem'),
                 'cuidadores', count(distinct ar.cg_id),
                 'anterior', (
                   select jsonb_build_object(
                            'combinados', count(*),
                            'cuidados', count(*) filter (where app.cuidado_feito(a.status)))
                     from public.care_assignments a
                    where v_anterior is not null and a.week_id = v_anterior
                 )
               )
          from atrib ar
      ),

      'cuidadores', coalesce((
        select jsonb_agg(linha order by
                 case linha->>'situacao' when 'nenhum' then 0 when 'parte' then 1 else 2 end,
                 linha->>'nome')
          from cuidadores
      ), '[]'::jsonb),

      'pessoas', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', ar.cf_id,
                 'nome', ar.cf_nome,
                 'nomeCompleto', ar.cf_completo,
                 'papel', ar.cf_papel,
                 'genero', ar.genero,
                 'cuidadorId', ar.cg_id,
                 'cuidador', ar.cg_nome,
                 'situacao', case when ar.feito then 'cuidada'
                                  when ar.status = 'awaiting_reply' then 'sem_resposta'
                                  else 'sem_contato' end,
                 'contatoEm', ar.contacted_on,
                 'registros', ar.registros,
                 'canal', ar.channel,
                 'comoEsta', ar.well_being,
                 'vemAoGc', ar.coming_to_gc,
                 'atencao', ar.attention_level,
                 'observacao', ar.feedback,
                 'ultimoCuidado', uc.quando,
                 'semanasSemCuidado', app.semanas_sem_cuidado(ar.cf_id, v_semana.starts_on)
               ) order by ar.feito, ar.cf_nome)
          from atrib ar
          left join ultimo_cuidado uc on uc.cared_for_id = ar.cf_id
      ), '[]'::jsonb),

      -- A lista que existe para ninguem ficar de fora: o GC inteiro, do que
      -- esta ha mais tempo sem cuidado para o mais recente. Quem nunca foi
      -- cuidado vem primeiro.
      'semCuidadoHaMais', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'id', e.id,
                 'nome', e.nome,
                 'nomeCompleto', e.full_name,
                 'papel', e.role,
                 'genero', e.care_gender,
                 'ultimoCuidado', uc.quando,
                 'dias', case when uc.quando is null then null else v_ate - uc.quando end,
                 'semanasSemCuidado', app.semanas_sem_cuidado(e.id, v_semana.starts_on),
                 'cuidadorNaSemana', (select ar.cg_nome from atrib ar where ar.cf_id = e.id)
               ) order by uc.quando nulls first, e.nome)
          from elenco e
          left join ultimo_cuidado uc on uc.cared_for_id = e.id
      ), '[]'::jsonb),

      'transferencias', coalesce((
        select jsonb_agg(jsonb_build_object(
                 'pessoa', ar.cf_nome,
                 'de', ar.ant_nome,
                 'para', ar.cg_nome,
                 'origem', ar.origin,
                 'quando', ar.transferred_at
               ) order by ar.transferred_at)
          from atrib ar
         where ar.ant_id is not null
      ), '[]'::jsonb),

      'geradoEm', now()
    )
  );
end;
$$;

revoke all on function public.relatorio_semana(uuid) from public, anon;
grant execute on function public.relatorio_semana(uuid) to authenticated;
