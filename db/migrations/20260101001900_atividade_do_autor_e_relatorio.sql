-- =============================================================================
-- Cuidar GC :: 0019 - quem cria ja topou, e o relatorio ganha forma
--
-- Tres coisas que a 0013 deixou pela metade:
--
-- 1. Aceitar uma atividade nunca funcionou. O `case when ... then 'aceita'`
--    resolve para `text`, e a coluna e `activity_response`: o Postgres recusa
--    a atribuicao e quem clicou em "Aceitar" so via um erro. Um cast conserta.
--
-- 2. Quem cria a atividade e se indica nao precisa aceitar o proprio convite,
--    nem ser avisado de que foi indicado por si mesmo. Ja quis, ja sabe.
--
-- 3. O relatorio devolvia numeros soltos. Agora devolve series - semana a
--    semana, por canal, por pessoa - para a tela poder desenhar em vez de
--    listar. Mesma origem de dados: o feedback de tres toques.
-- =============================================================================

-- ------------------------------------------------------- aceite do proprio autor
/**
 * Marca como aceita a indicacao de quem acabou de agir.
 *
 * Vale para criar, editar e trazer as recorrentes: em todos esses caminhos a
 * pessoa esta olhando para a atividade e escolhendo se colocar nela. Pedir um
 * aceite depois disso e perguntar duas vezes a mesma coisa.
 */
create or replace function app.aceitar_do_autor(p_activity uuid, p_autor uuid)
returns void
language sql
set search_path = public, pg_temp
as $$
  update public.activity_assignees
     set response = 'aceita'::public.activity_response,
         responded_at = now(),
         justification = null
   where activity_id = p_activity
     and profile_id = p_autor
     and response = 'pendente';
$$;

-- -------------------------------------------------------------- aceitar/recusar
/**
 * Resposta de quem foi indicado.
 *
 * A justificativa continua exigida aqui, e nao so na tela: uma recusa sem
 * motivo obriga a lideranca a perguntar de novo, e a informacao se perde no
 * WhatsApp. O aviso vai para os outros lideres - quem respondeu nao precisa
 * ser avisado da propria resposta.
 */
create or replace function public.respond_activity(
  p_activity_id uuid,
  p_accept boolean,
  p_justification text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
  v_nome text;
  v_titulo text;
  v_motivo text := nullif(btrim(coalesce(p_justification, '')), '');
begin
  if not exists (
    select 1 from public.activity_assignees
     where activity_id = p_activity_id and profile_id = me
  ) then
    raise exception 'Esta atividade nao foi indicada a voce.' using errcode = 'insufficient_privilege';
  end if;

  if not p_accept and v_motivo is null then
    raise exception 'Diga o motivo para a lideranca poder repassar.'
      using errcode = 'check_violation';
  end if;

  -- O cast e o conserto: sem ele o `case` vira `text` e a atribuicao a coluna
  -- `activity_response` falha - era o erro que aparecia ao aceitar.
  update public.activity_assignees
     set response = (case when p_accept then 'aceita' else 'recusada' end)::public.activity_response,
         responded_at = now(),
         justification = case when p_accept then null else v_motivo end
   where activity_id = p_activity_id and profile_id = me;

  select public.display_name(p) into v_nome from public.profiles p where p.id = me;
  select title into v_titulo from public.activities where id = p_activity_id;

  perform app.notify_leaders(
    me,
    'activity_assigned',
    case when p_accept then 'Atividade aceita' else 'Atividade recusada' end,
    case when p_accept
         then format('%s aceitou "%s".', v_nome, v_titulo)
         else format('%s recusou "%s": %s', v_nome, v_titulo, v_motivo)
    end,
    '/atividades');

  perform app.audit(
    case when p_accept then 'activity.accepted' else 'activity.declined' end,
    'activities', p_activity_id, null,
    jsonb_build_object('profile', me, 'justification', v_motivo));
end;
$$;

revoke all on function public.respond_activity(uuid, boolean, text) from public, anon;
grant execute on function public.respond_activity(uuid, boolean, text) to authenticated;

-- --------------------------------------------------------------- salvar atividade
/**
 * Cria ou edita a atividade e acerta os responsaveis.
 *
 * Duas mudancas em relacao a versao anterior:
 *
 * - quem indicou a si mesmo ja entra com o aceite dado, e nao recebe aviso;
 * - quem entra numa **edicao** tambem e avisado. Antes o aviso so saia na
 *   criacao, entao acrescentar um responsavel depois era acrescentar alguem
 *   que nunca ficava sabendo.
 */
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
  v_novos uuid[];
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
    -- `returning` diz quem de fato entrou agora: quem ja estava na atividade
    -- nao pode receber o mesmo aviso a cada vez que o titulo e corrigido.
    with entraram as (
      insert into public.activity_assignees (activity_id, profile_id)
      select v_id, unnest(p_assignee_ids)
      on conflict do nothing
      returning profile_id
    )
    select array_agg(profile_id) into v_novos from entraram;

    perform app.aceitar_do_autor(v_id, me);

    perform app.notify(pid, 'activity_assigned', 'Voce foi indicado para uma atividade',
                       btrim(p_title), '/atividades')
      from unnest(coalesce(v_novos, '{}'::uuid[])) as pid
     where pid is distinct from me;
  end if;

  return v_id;
end;
$$;

-- ------------------------------------------------------------ trazer recorrentes
-- Igual a versao anterior, com o mesmo acerto: quem traz a atividade para a
-- semana e ja e um dos responsaveis nao precisa aceitar o proprio gesto.
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

    perform app.aceitar_do_autor(v_new, me);

    perform app.notify(aa.profile_id, 'activity_assigned',
                       'Voce foi indicado para uma atividade', src.title, '/atividades')
      from public.activity_assignees aa
     where aa.activity_id = v_new and aa.profile_id is distinct from me;

    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ------------------------------------------------------------------- relatorio
/**
 * Panorama das ultimas semanas.
 *
 * A versao anterior devolvia totais soltos; esta devolve **series**. A
 * diferenca importa: "42 pessoas bem" nao diz nada sozinho, mas a mesma
 * medida semana a semana mostra se o GC esta subindo ou descendo - que e a
 * unica pergunta que a lideranca faz de verdade.
 *
 * Continua sendo uma chamada so. Seis consultas separadas discordariam entre
 * si sobre "o que e a semana passada", e o relatorio perderia a serventia.
 *
 * `security definer` porque agrega o que a RLS mostra pessoa a pessoa; a
 * guarda de papel esta na primeira linha.
 */
create or replace function public.relatorio_gc(p_semanas int default 8)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_semanas int := greatest(1, least(coalesce(p_semanas, 8), 26));
  v_ids uuid[];        -- semanas do recorte, da mais antiga para a mais nova
  v_ids_ant uuid[];    -- o recorte imediatamente anterior, do mesmo tamanho
begin
  if not app.is_leadership() then
    raise exception 'Somente lideranca e supervisao veem o relatorio.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Fixar as semanas uma unica vez mantem todas as series coerentes: o grafico
  -- de barras e o mapa de constancia falam exatamente das mesmas semanas.
  select array_agg(id order by starts_on)
    into v_ids
    from (select id, starts_on from public.care_weeks
           where status in ('published', 'closed')
           order by starts_on desc
           limit v_semanas) atuais;

  select array_agg(id order by starts_on)
    into v_ids_ant
    from (select id, starts_on from public.care_weeks
           where status in ('published', 'closed')
           order by starts_on desc
           offset v_semanas
           limit v_semanas) anteriores;

  v_ids := coalesce(v_ids, '{}'::uuid[]);
  v_ids_ant := coalesce(v_ids_ant, '{}'::uuid[]);

  return jsonb_build_object(
    -- Uma linha por semana: quantos cuidados foram combinados, quantos
    -- aconteceram, e quantas pessoas ficaram sem contato nenhum.
    'semanas', coalesce((
      select jsonb_agg(linha order by inicio)
        from (
          select w.starts_on as inicio,
                 jsonb_build_object(
                   'inicio', w.starts_on,
                   'fim', w.ends_on,
                   'situacao', w.status,
                   'combinados', count(a.*),
                   'feitos', count(*) filter (where a.status in ('contacted', 'follow_up')),
                   'semContato', count(*) filter (where a.status = 'pending'),
                   'precisamDaLideranca', count(*) filter (where a.attention_level = 'leader_action')
                 ) as linha
            from public.care_weeks w
            left join public.care_assignments a on a.week_id = w.id
           where w.id = any (v_ids)
           group by w.id, w.starts_on, w.ends_on, w.status
        ) por_semana
    ), '[]'::jsonb),

    -- Os numeros de capa: o periodo inteiro em uma linha, com o periodo
    -- anterior ao lado para a variacao nao precisar ser calculada de cabeca.
    'resumo', (
      select jsonb_build_object(
               'combinados', count(*) filter (where a.week_id = any (v_ids)),
               'feitos', count(*) filter (where a.week_id = any (v_ids)
                                            and a.status in ('contacted', 'follow_up')),
               'semContato', count(*) filter (where a.week_id = any (v_ids)
                                                and a.status = 'pending'),
               'precisamDaLideranca', count(*) filter (where a.week_id = any (v_ids)
                                                         and a.attention_level = 'leader_action'),
               'combinadosAnterior', count(*) filter (where a.week_id = any (v_ids_ant)),
               'feitosAnterior', count(*) filter (where a.week_id = any (v_ids_ant)
                                                    and a.status in ('contacted', 'follow_up')),
               'semanas', cardinality(v_ids)
             )
        from public.care_assignments a
       where a.week_id = any (v_ids || v_ids_ant)
    ),

    -- Como o GC esteve, pela escala do feedback, no recorte inteiro.
    'comoEstao', coalesce((
      select jsonb_object_agg(coalesce(c.well_being::text, 'sem_registro'), c.quantos)
        from (
          select l.well_being, count(*) as quantos
            from public.contact_logs l
            join public.care_assignments a on a.id = l.assignment_id
           where a.week_id = any (v_ids)
           group by l.well_being
        ) c
    ), '{}'::jsonb),

    -- A mesma escala, agora semana a semana: e a serie que mostra se o GC
    -- esta subindo ou descendo, coisa que o total sozinho nunca conta.
    'comoEstaoPorSemana', coalesce((
      select jsonb_agg(jsonb_build_object(
               'inicio', w.starts_on,
               'fim', w.ends_on,
               'contagens', coalesce((
                 select jsonb_object_agg(coalesce(x.well_being::text, 'sem_registro'), x.quantos)
                   from (
                     select l.well_being, count(*) as quantos
                       from public.contact_logs l
                       join public.care_assignments a on a.id = l.assignment_id
                      where a.week_id = w.id
                      group by l.well_being
                   ) x
               ), '{}'::jsonb)
             ) order by w.starts_on)
        from public.care_weeks w
       where w.id = any (v_ids)
    ), '[]'::jsonb),

    -- Quem disse que vem ao GC nesta semana. O numero que a lideranca usa para
    -- preparar a sala.
    'presenca', coalesce((
      select jsonb_object_agg(coalesce(c.coming_to_gc::text, 'sem_resposta'), c.quantos)
        from (
          select l.coming_to_gc, count(*) as quantos
            from public.contact_logs l
           where l.contacted_on >= current_date - 7
           group by l.coming_to_gc
        ) c
    ), '{}'::jsonb),

    -- E a mesma resposta ao longo do recorte, para enxergar quem vem dizendo
    -- "nao" ha semanas.
    'presencaPorSemana', coalesce((
      select jsonb_agg(jsonb_build_object(
               'inicio', w.starts_on,
               'fim', w.ends_on,
               'contagens', coalesce((
                 select jsonb_object_agg(coalesce(x.coming_to_gc::text, 'sem_resposta'), x.quantos)
                   from (
                     select l.coming_to_gc, count(*) as quantos
                       from public.contact_logs l
                       join public.care_assignments a on a.id = l.assignment_id
                      where a.week_id = w.id
                      group by l.coming_to_gc
                   ) x
               ), '{}'::jsonb)
             ) order by w.starts_on)
        from public.care_weeks w
       where w.id = any (v_ids)
    ), '[]'::jsonb),

    -- Por onde o cuidado acontece. Serve para uma pergunta pratica: se quase
    -- tudo e mensagem escrita, talvez falte ligar.
    'canais', coalesce((
      select jsonb_object_agg(c.channel::text, c.quantos)
        from (
          select l.channel, count(*) as quantos
            from public.contact_logs l
            join public.care_assignments a on a.id = l.assignment_id
           where a.week_id = any (v_ids)
           group by l.channel
        ) c
    ), '{}'::jsonb),

    -- Se o combinado das atividades esta sendo respondido - a mesma pergunta
    -- do aceite, vista de cima.
    'atividades', coalesce((
      select jsonb_object_agg(c.response::text, c.quantos)
        from (
          select aa.response, count(*) as quantos
            from public.activity_assignees aa
            join public.activities act on act.id = aa.activity_id
           where act.week_id = any (v_ids)
           group by aa.response
        ) c
    ), '{}'::jsonb),

    -- Constancia de quem cuida. Sem ranking na consulta: a tela ordena por
    -- nome, e o numero que importa e "semanas seguidas", nao "quem fez mais".
    'cuidadores', coalesce((
      select jsonb_agg(jsonb_build_object(
               -- O nome nao serve de identidade: o GC tem duas Amandas.
               'id', p.id,
               'nome', public.display_name(p),
               'papel', p.role,
               'semanasSeguidas', app.semanas_seguidas(p.id),
               'registrosNoPeriodo', (
                 select count(*) from public.contact_logs l
                   join public.care_assignments a on a.id = l.assignment_id
                  where l.author_id = p.id and a.week_id = any (v_ids)
               )
             ) order by p.full_name)
        from public.profiles p
       where p.status = 'active' and p.deleted_at is null
         and p.role in ('leader', 'disciple')
    ), '[]'::jsonb),

    -- O mapa de constancia: uma linha por cuidador, uma celula por semana.
    -- Le-se de relance quem esta segurando o combinado e quem sumiu - sem
    -- transformar isso em pontuacao, porque a celula mostra o combinado
    -- daquela semana, nao o total acumulado de ninguem.
    'constancia', coalesce((
      select jsonb_agg(linha order by linha->>'nome')
        from (
          select jsonb_build_object(
                   'id', p.id,
                   'nome', public.display_name(p),
                   'semanas', (
                     select jsonb_agg(celula order by inicio)
                       from (
                         select w.starts_on as inicio,
                                jsonb_build_object(
                                  'inicio', w.starts_on,
                                  'total', count(a.*),
                                  'feitos', count(*) filter (
                                              where a.status in ('contacted', 'follow_up'))
                                ) as celula
                           from public.care_weeks w
                           left join public.care_assignments a
                                  on a.week_id = w.id and a.caregiver_id = p.id
                          where w.id = any (v_ids)
                          group by w.id, w.starts_on
                       ) por_semana
                   )
                 ) as linha
            from public.profiles p
           where p.status = 'active' and p.deleted_at is null
             and p.role in ('leader', 'disciple')
             and exists (select 1 from public.care_assignments a
                          where a.caregiver_id = p.id and a.week_id = any (v_ids))
        ) linhas
    ), '[]'::jsonb),

    -- Quem esta ha mais tempo sem receber contato. A lista que existe para
    -- ninguem ficar de fora - o proposito do produto em uma consulta.
    'semContatoHaMais', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'nome', public.display_name(p),
               'ultimoContato', ultimo.quando
             ) order by ultimo.quando nulls first)
        from public.profiles p
        left join lateral (
          select max(l.contacted_on) as quando
            from public.contact_logs l
            join public.care_assignments a on a.id = l.assignment_id
           where a.cared_for_id = p.id
        ) ultimo on true
       where p.status = 'active' and p.deleted_at is null and p.role = 'member'
         and (ultimo.quando is null or ultimo.quando < current_date - 14)
    ), '[]'::jsonb),

    'geradoEm', now()
  );
end;
$$;

revoke all on function public.relatorio_gc(int) from public, anon;
grant execute on function public.relatorio_gc(int) to authenticated;
