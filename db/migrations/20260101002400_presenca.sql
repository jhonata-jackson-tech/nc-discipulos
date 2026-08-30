-- =============================================================================
-- Cuidar GC :: 0024 - a chamada do fim do GC
--
-- O GC acontece toda quinta. As vezes, por um imprevisto, na sexta. Ate aqui
-- o sistema sabia quem *disse* que vinha - a pergunta do registro de contato -
-- e nunca soube quem apareceu. Sao coisas diferentes, e a distancia entre elas
-- e uma informacao pastoral por si so.
--
-- Tres decisoes:
--
-- 1. **A chamada e do encontro, nao da semana.** Um encontro tem data - a
--    quinta, ou a sexta em que ele coube. A semana de cuidado entra como
--    vinculo, para o relatorio poder colocar as duas series lado a lado, mas
--    nao e ela que identifica a reuniao. Um GC que aconteceu duas vezes na
--    mesma semana, ou nenhuma, continua sendo descrito com honestidade.
--
-- 2. **Faltar nao e um estado unico.** "Nao veio" e "avisou que nao viria"
--    pedem coisas diferentes da lideranca. Sem essa distincao, tres faltas
--    seguidas de quem esta viajando parecem iguais a tres faltas seguidas de
--    quem esta se afastando - e sao o contrario uma da outra.
--
-- 3. **O visitante entra na chamada.** Ele nao entra no rodizio nem na conta
--    do cuidado proporcional, mas apareceu na sala: registrar isso e o que
--    permite dizer "o Marcos veio tres quintas seguidas" - a frase que faz
--    alguem lembrar de convida-lo para ficar.
-- =============================================================================

-- ------------------------------------------------------------------- o dia fixo
-- O dia do GC vira configuracao do grupo, e nao uma constante no codigo: hoje
-- e quinta, e o custo de um dia mudar nao deveria ser um deploy.
alter table public.groups
  add column if not exists meeting_weekday smallint not null default 4;

do $$ begin
  alter table public.groups
    add constraint groups_meeting_weekday_valido check (meeting_weekday between 0 and 6);
exception when duplicate_object then null; end $$;

comment on column public.groups.meeting_weekday is
  'Dia da semana do encontro do GC (0 = domingo; 4 = quinta). A tela sugere '
  'essa data; a chamada aceita outra, porque imprevisto acontece.';

-- ---------------------------------------------------------------- enumeracoes
/**
 * Como a pessoa esteve no encontro.
 *
 * `justificado` existe para separar quem avisou de quem sumiu - e a diferenca
 * entre uma viagem e um afastamento, que somadas viram o mesmo numero e
 * mandam a lideranca cobrar a pessoa errada.
 */
do $$ begin
  create type public.attendance_mark as enum ('presente', 'justificado', 'ausente');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------- encontros
create table if not exists public.gc_meetings (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  -- A semana de cuidado que contem o dia do encontro. Vinculo, nao identidade:
  -- fica nulo se a semana ainda nao existir, e a chamada continua valendo.
  week_id uuid references public.care_weeks (id) on delete set null,
  held_on date not null,
  notes text,
  registered_by uuid references public.profiles (id) on delete set null,
  registered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, held_on)
);

create index if not exists gc_meetings_data_idx on public.gc_meetings (group_id, held_on desc);

drop trigger if exists gc_meetings_touch on public.gc_meetings;
create trigger gc_meetings_touch before update on public.gc_meetings
  for each row execute function app.touch_updated_at();

-- --------------------------------------------------------------------- a chamada
-- Uma linha por pessoa por encontro. Integrante e visitante moram na mesma
-- tabela porque a pergunta e a mesma - quem estava na sala - e separa-los
-- obrigaria toda leitura a somar dois lugares para responder isso.
create table if not exists public.gc_attendance (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.gc_meetings (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete cascade,
  visitor_id uuid references public.visitors (id) on delete cascade,
  mark public.attendance_mark not null default 'ausente',
  justification text,
  created_at timestamptz not null default now(),
  constraint gc_attendance_uma_pessoa check (num_nonnulls(profile_id, visitor_id) = 1)
);

create unique index if not exists gc_attendance_integrante_idx
  on public.gc_attendance (meeting_id, profile_id) where profile_id is not null;
create unique index if not exists gc_attendance_visitante_idx
  on public.gc_attendance (meeting_id, visitor_id) where visitor_id is not null;
create index if not exists gc_attendance_pessoa_idx
  on public.gc_attendance (profile_id, mark) where profile_id is not null;

-- ============================================================== quem ve o que
alter table public.gc_meetings enable row level security;
alter table public.gc_attendance enable row level security;

grant select on public.gc_meetings to authenticated;
grant select on public.gc_attendance to authenticated;

-- O encontro em si e do GC: saber que teve GC dia 27 nao expoe ninguem.
drop policy if exists gc_meetings_read on public.gc_meetings;
create policy gc_meetings_read on public.gc_meetings
  for select to authenticated using (app.is_active());

-- A chamada, nao. "Quem faltou" na mao de 33 pessoas vira assunto de corredor,
-- e presenca em GC nao e boletim. Cada pessoa enxerga a propria linha; a
-- leitura do conjunto e da lideranca.
drop policy if exists gc_attendance_read on public.gc_attendance;
create policy gc_attendance_read on public.gc_attendance
  for select to authenticated
  using (app.is_leadership() or profile_id = app.current_profile_id());

-- Escrita acontece exclusivamente pelas funcoes abaixo.

-- ================================================================== auxiliares
/** A semana de cuidado que contem esta data, se ela existir. */
create or replace function app.semana_de(p_group uuid, p_date date)
returns uuid
language sql
stable
set search_path = public, pg_temp
as $$
  select w.id from public.care_weeks w
   where w.group_id = p_group and p_date between w.starts_on and w.ends_on
   order by w.starts_on desc
   limit 1;
$$;

/**
 * Faltas seguidas, contadas de tras para frente.
 *
 * Conta so os encontros em que a pessoa aparece na chamada - quem foi
 * cadastrado semana passada nao carrega as ausencias de antes de existir. E
 * `justificado` interrompe a contagem: avisar que nao viria e o contrario de
 * sumir, e somar as duas coisas faria a lideranca procurar quem ja falou com
 * ela.
 */
create or replace function app.faltas_seguidas(p_profile uuid)
returns int
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_linha record;
  v_faltas int := 0;
begin
  for v_linha in
    select a.mark
      from public.gc_attendance a
      join public.gc_meetings m on m.id = a.meeting_id
     where a.profile_id = p_profile
     order by m.held_on desc
  loop
    if v_linha.mark = 'ausente' then
      v_faltas := v_faltas + 1;
    else
      exit;
    end if;
  end loop;

  return v_faltas;
end;
$$;

grant execute on function app.semana_de(uuid, date), app.faltas_seguidas(uuid) to authenticated;

-- ==================================================================== escrever
/**
 * Salva a chamada de um encontro.
 *
 * Recebe a lista inteira que a tela mostrou, e nao apenas quem veio: a
 * chamada e uma foto do fim do GC, e uma foto pela metade nao distingue
 * "faltou" de "esqueci de marcar". Por isso as marcas do encontro sao
 * substituidas pelo que chega aqui.
 *
 * Salvar de novo no mesmo dia corrige a chamada - e o caso de quem chegou
 * atrasado e foi lembrado depois.
 */
create or replace function public.salvar_presenca(
  p_group_id uuid,
  p_held_on date,
  p_marcas jsonb,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.require_leader();
  v_id uuid;
  v_presentes int;
  v_novo boolean;
begin
  if p_held_on is null then
    raise exception 'Informe o dia do encontro.' using errcode = 'check_violation';
  end if;

  if p_held_on > current_date then
    raise exception 'A chamada e do encontro que ja aconteceu.' using errcode = 'check_violation';
  end if;

  insert into public.gc_meetings (group_id, week_id, held_on, notes, registered_by, registered_at)
  values (p_group_id, app.semana_de(p_group_id, p_held_on), p_held_on,
          nullif(btrim(coalesce(p_notes, '')), ''), me, now())
  on conflict (group_id, held_on) do update
     set week_id = coalesce(gc_meetings.week_id,
                            app.semana_de(excluded.group_id, excluded.held_on)),
         notes = excluded.notes,
         registered_by = excluded.registered_by,
         registered_at = excluded.registered_at
  returning id, (xmax = 0) into v_id, v_novo;

  delete from public.gc_attendance where meeting_id = v_id;

  insert into public.gc_attendance (meeting_id, profile_id, visitor_id, mark, justification)
  select v_id,
         case when item->>'tipo' = 'visitante' then null else (item->>'id')::uuid end,
         case when item->>'tipo' = 'visitante' then (item->>'id')::uuid end,
         coalesce((item->>'marca')::public.attendance_mark, 'ausente'),
         nullif(btrim(coalesce(item->>'justificativa', '')), '')
    from jsonb_array_elements(coalesce(p_marcas, '[]'::jsonb)) as item;

  select count(*) filter (where mark = 'presente') into v_presentes
    from public.gc_attendance where meeting_id = v_id;

  -- O aviso sai so no primeiro registro daquele dia: quem corrige a chamada
  -- nao esta anunciando nada, e um segundo aviso identico ensina a ignorar.
  if v_novo then
    perform app.notify_leaders(me, 'general', 'Chamada do GC registrada',
                               format('%s pessoas no encontro de %s.',
                                      v_presentes, to_char(p_held_on, 'DD/MM')),
                               '/presenca');
  end if;

  perform app.audit('attendance.saved', 'gc_meetings', v_id, null,
                    jsonb_build_object('quando', p_held_on, 'presentes', v_presentes));

  return v_id;
end;
$$;

revoke all on function public.salvar_presenca(uuid, date, jsonb, text) from public, anon;
grant execute on function public.salvar_presenca(uuid, date, jsonb, text) to authenticated;

/** Apaga um encontro registrado por engano - a data errada, o GC que nao houve. */
create or replace function public.apagar_encontro(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_leader();

  delete from public.gc_meetings where id = p_id;
  if not found then
    raise exception 'Encontro nao encontrado.' using errcode = 'no_data_found';
  end if;

  perform app.audit('attendance.deleted', 'gc_meetings', p_id, null, null);
end;
$$;

revoke all on function public.apagar_encontro(uuid) from public, anon;
grant execute on function public.apagar_encontro(uuid) to authenticated;

-- ================================================================ ler a chamada
/**
 * A chamada de um dia, ja montada.
 *
 * Devolve a lista inteira - todo integrante ativo e todo visitante em
 * acompanhamento - com a marca que cada um tem hoje. Uma tela que precisasse
 * juntar tres consultas para montar isso ficaria dizendo "ausente" para quem
 * ela ainda nao carregou.
 *
 * Quem ja foi marcado num encontro continua aparecendo nele mesmo depois de
 * sair do GC ou de virar integrante: a chamada e o registro de um dia, e
 * reescrever o passado a cada mudanca de cadastro seria mentir sobre ele.
 */
create or replace function public.encontro(p_group_id uuid, p_held_on date)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  with reuniao as (
    select * from public.gc_meetings
     where group_id = p_group_id and held_on = p_held_on
  )
  select case when app.is_leadership() then jsonb_build_object(
    'id', (select id from reuniao),
    'quando', p_held_on,
    'semanaId', (select week_id from reuniao),
    'anotacao', (select notes from reuniao),
    'registradoEm', (select registered_at from reuniao),
    'registradoPor', (select public.display_name(p) from public.profiles p
                       where p.id = (select registered_by from reuniao)),

    'integrantes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'nome', public.display_name(p),
               'nomeCompleto', p.full_name,
               'papel', p.role,
               'foto', p.photo_url,
               'marca', coalesce(a.mark, 'ausente'),
               'justificativa', a.justification
             ) order by p.full_name)
        from public.profiles p
        left join reuniao r on true
        left join public.gc_attendance a
               on a.meeting_id = r.id and a.profile_id = p.id
       where p.deleted_at is null
         and (
           (p.status = 'active' and exists (
              select 1 from public.group_memberships gm
               where gm.profile_id = p.id and gm.group_id = p_group_id and gm.left_at is null))
           or a.id is not null
         )
    ), '[]'::jsonb),

    'visitantes', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', v.id,
               'nome', v.full_name,
               'primeiraVisita', v.first_visit_on,
               'situacao', v.status,
               'marca', coalesce(a.mark, 'ausente')
             ) order by v.full_name)
        from public.visitors v
        left join reuniao r on true
        left join public.gc_attendance a
               on a.meeting_id = r.id and a.visitor_id = v.id
       where v.group_id = p_group_id
         and (v.status = 'acompanhando' or a.id is not null)
    ), '[]'::jsonb)
  ) end;
$$;

revoke all on function public.encontro(uuid, date) from public, anon;
grant execute on function public.encontro(uuid, date) to authenticated;

/** Os ultimos encontros, com os numeros de cada um. */
create or replace function public.encontros(p_group_id uuid, p_limite int default 12)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select case when app.is_leadership() then coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', m.id,
             'quando', m.held_on,
             'semanaId', m.week_id,
             'anotacao', m.notes,
             'registradoEm', m.registered_at,
             'presentes', (select count(*) from public.gc_attendance a
                            where a.meeting_id = m.id and a.mark = 'presente'
                              and a.profile_id is not null),
             'justificados', (select count(*) from public.gc_attendance a
                               where a.meeting_id = m.id and a.mark = 'justificado'),
             'ausentes', (select count(*) from public.gc_attendance a
                           where a.meeting_id = m.id and a.mark = 'ausente'
                             and a.profile_id is not null),
             'visitantes', (select count(*) from public.gc_attendance a
                             where a.meeting_id = m.id and a.mark = 'presente'
                               and a.visitor_id is not null)
           ) order by m.held_on desc)
      from (select * from public.gc_meetings
             where group_id = p_group_id
             order by held_on desc
             limit greatest(1, least(coalesce(p_limite, 12), 104))) m
  ), '[]'::jsonb) end;
$$;

revoke all on function public.encontros(uuid, int) from public, anon;
grant execute on function public.encontros(uuid, int) to authenticated;

-- ================================================================= o relatorio
/**
 * A presenca no relatorio do GC.
 *
 * Funcao separada de `relatorio_gc` porque o recorte e outro: cuidado se conta
 * por semana, presenca se conta por encontro. Um GC que nao aconteceu numa
 * semana nao e uma semana com zero presentes - e uma semana sem encontro, e
 * misturar as duas coisas afundaria a media sem que nada tivesse acontecido.
 *
 * `security definer` porque agrega o que a RLS mostra linha a linha; a guarda
 * de papel esta na primeira comparacao.
 */
create or replace function public.relatorio_presenca(
  p_group_id uuid,
  p_encontros int default 8
)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_limite int := greatest(1, least(coalesce(p_encontros, 8), 52));
  v_ids uuid[];
begin
  if not app.is_leadership() then
    raise exception 'Somente lideranca e supervisao veem o relatorio.'
      using errcode = 'insufficient_privilege';
  end if;

  -- Os encontros do recorte, fixados uma vez: todas as series abaixo falam
  -- exatamente das mesmas reunioes.
  select array_agg(id order by held_on)
    into v_ids
    from (select id, held_on from public.gc_meetings
           where group_id = p_group_id
           order by held_on desc
           limit v_limite) recentes;

  v_ids := coalesce(v_ids, '{}'::uuid[]);

  return jsonb_build_object(
    -- Uma linha por encontro. `disseramQueVem` vem do registro de contato da
    -- semana: e a promessa, ao lado do que de fato aconteceu.
    'encontros', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id,
               'quando', m.held_on,
               'presentes', (select count(*) from public.gc_attendance a
                              where a.meeting_id = m.id and a.profile_id is not null
                                and a.mark = 'presente'),
               'justificados', (select count(*) from public.gc_attendance a
                                 where a.meeting_id = m.id and a.profile_id is not null
                                   and a.mark = 'justificado'),
               'ausentes', (select count(*) from public.gc_attendance a
                             where a.meeting_id = m.id and a.profile_id is not null
                               and a.mark = 'ausente'),
               'visitantes', (select count(*) from public.gc_attendance a
                               where a.meeting_id = m.id and a.visitor_id is not null
                                 and a.mark = 'presente'),
               'elenco', (select count(*) from public.gc_attendance a
                           where a.meeting_id = m.id and a.profile_id is not null),
               'disseramQueVem', (
                 select count(*) from public.contact_logs l
                   join public.care_assignments c on c.id = l.assignment_id
                  where m.week_id is not null and c.week_id = m.week_id
                    and l.coming_to_gc = 'vem')
             ) order by m.held_on)
        from public.gc_meetings m
       where m.id = any (v_ids)
    ), '[]'::jsonb),

    'resumo', (
      select jsonb_build_object(
               'encontros', cardinality(v_ids),
               'presentes', coalesce(sum(t.presentes), 0),
               -- Media por encontro, e nao total: "vieram 168 pessoas" nao
               -- diz nada; "em media 21 por noite" diz tudo.
               'media', case when cardinality(v_ids) > 0
                             then round(coalesce(sum(t.presentes), 0)::numeric
                                        / cardinality(v_ids), 1)
                             else 0 end,
               'maior', coalesce(max(t.presentes), 0),
               'menor', coalesce(min(t.presentes), 0),
               'elenco', coalesce(max(t.elenco), 0),
               'visitantes', coalesce(sum(t.visitantes), 0)
             )
        from (
          select (select count(*) from public.gc_attendance a
                   where a.meeting_id = m.id and a.profile_id is not null
                     and a.mark = 'presente') as presentes,
                 (select count(*) from public.gc_attendance a
                   where a.meeting_id = m.id and a.profile_id is not null) as elenco,
                 (select count(*) from public.gc_attendance a
                   where a.meeting_id = m.id and a.visitor_id is not null
                     and a.mark = 'presente') as visitantes
            from public.gc_meetings m where m.id = any (v_ids)
        ) t
    ),

    -- O mapa: uma linha por pessoa, uma celula por encontro. Le-se de relance
    -- quem esta vindo e quem parou de vir - a pergunta que faz alguem pegar o
    -- telefone antes de a ausencia virar afastamento.
    'mapa', coalesce((
      select jsonb_agg(linha order by linha->>'nome')
        from (
          select jsonb_build_object(
                   'id', p.id,
                   'nome', public.display_name(p),
                   'faltasSeguidas', app.faltas_seguidas(p.id),
                   'encontros', (
                     select jsonb_agg(jsonb_build_object(
                              'quando', m.held_on,
                              'marca', coalesce(a.mark, 'ausente')
                            ) order by m.held_on)
                       from public.gc_meetings m
                       left join public.gc_attendance a
                              on a.meeting_id = m.id and a.profile_id = p.id
                      where m.id = any (v_ids)
                   )
                 ) as linha
            from public.profiles p
           where p.status = 'active' and p.deleted_at is null
             and exists (select 1 from public.gc_attendance a
                          where a.profile_id = p.id and a.meeting_id = any (v_ids))
        ) linhas
    ), '[]'::jsonb),

    -- Quem esta faltando seguido, sem ter avisado. Nao e uma lista de
    -- devedores: e a lista de quem alguem precisa procurar esta semana.
    'faltosos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'nome', public.display_name(p),
               'faltasSeguidas', app.faltas_seguidas(p.id),
               'ultimaPresenca', (
                 select max(m.held_on)
                   from public.gc_attendance a
                   join public.gc_meetings m on m.id = a.meeting_id
                  where a.profile_id = p.id and a.mark = 'presente')
             ) order by app.faltas_seguidas(p.id) desc, p.full_name)
        from public.profiles p
       where p.status = 'active' and p.deleted_at is null
         -- Somente o elenco deste GC: `profiles` e comum a todos os grupos que
         -- existam no banco, e uma lista de faltosos que atravessa o GC seria
         -- uma lista sobre gente que a lideranca nem conhece.
         and exists (select 1 from public.group_memberships gm
                      where gm.profile_id = p.id and gm.group_id = p_group_id
                        and gm.left_at is null)
         and app.faltas_seguidas(p.id) >= 2
    ), '[]'::jsonb),

    -- Os visitantes, do lado de ca: quantos chegaram, quantos ficaram, e com
    -- quem ainda nao se falou.
    'visitantes', (
      select jsonb_build_object(
               'acompanhando', count(*) filter (where v.status = 'acompanhando'),
               'integrados', count(*) filter (where v.status = 'integrado'),
               'encerrados', count(*) filter (where v.status = 'encerrado'),
               'semContato', count(*) filter (
                 where v.status = 'acompanhando'
                   and not exists (select 1 from public.visitor_contacts c
                                    where c.visitor_id = v.id))
             )
        from public.visitors v where v.group_id = p_group_id
    ),

    'geradoEm', now()
  );
end;
$$;

revoke all on function public.relatorio_presenca(uuid, int) from public, anon;
grant execute on function public.relatorio_presenca(uuid, int) to authenticated;
