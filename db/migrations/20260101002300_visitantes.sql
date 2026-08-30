-- =============================================================================
-- Cuidar GC :: 0023 - o visitante, que ainda nao e do GC
--
-- Hoje o visitante chega de dois jeitos: aparece organicamente na sala, ou o
-- GC Center manda o contato para a lideranca. Nos dois casos a conversa
-- seguinte acontece no WhatsApp de alguem, e se perde ali.
--
-- Tres decisoes moram neste arquivo:
--
-- 1. **O visitante nao e um integrante.** Ele nasce em `visitors`, uma tabela
--    propria, e nunca em `profiles`. Nao e uma questao de organizacao: a
--    distribuicao semanal le `profiles`, e um visitante entrando ali seria
--    distribuido no rodizio proporcional na semana seguinte - alguem
--    receberia "cuide de Marcos" sobre uma pessoa que apareceu uma vez e
--    talvez nao volte. Estando fora da tabela, ele esta fora da conta por
--    construcao, e nao por um `where` que alguem pode esquecer.
--
-- 2. **Quem acompanha e a lideranca.** Um visitante nao tem cuidador do
--    rodizio; quem fala com ele e quem lidera. Por isso a leitura e da
--    lideranca e a escrita e do lider - e a RLS diz isso, nao a tela.
--
-- 3. **Todo visitante tem um desfecho.** Ou ele vira integrante, ou a
--    lideranca encerra o acompanhamento dizendo por que ("o dia ficou ruim
--    para ele", "encaminhamos para o GC do bairro dele"). Encerrar sem motivo
--    nao e permitido: daqui a tres meses ninguem lembra, e a pergunta
--    "por que paramos de falar com o Marcos?" nao tem resposta.
-- =============================================================================

-- ---------------------------------------------------------------- enumeracoes
/**
 * Por onde o visitante chegou.
 *
 * Os dois primeiros sao os caminhos que existem hoje. `convite` cobre quem foi
 * trazido por alguem do GC - acontece, e vale distinguir de quem apareceu
 * sozinho, porque o acompanhamento e diferente: um ja tem uma ponte.
 */
do $$ begin
  create type public.visitor_origin as enum ('organico', 'gc_center', 'convite', 'outro');
exception when duplicate_object then null; end $$;

/**
 * Onde o acompanhamento parou.
 *
 * `acompanhando` e o unico estado aberto - os outros dois sao desfechos, e
 * ambos tiram o visitante da lista de quem espera um contato.
 */
do $$ begin
  create type public.visitor_status as enum ('acompanhando', 'integrado', 'encerrado');
exception when duplicate_object then null; end $$;

-- ------------------------------------------------------------------ visitantes
create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  full_name text not null check (length(btrim(full_name)) > 0),
  phone text,
  email text,
  birth_date date,
  -- Guardado desde o cadastro para a promocao nao precisar perguntar de novo:
  -- e a mesma informacao que o cuidado exige de todo integrante.
  care_gender public.care_gender,
  origin public.visitor_origin not null default 'organico',
  -- Quem trouxe. So faz sentido em `origin = 'convite'`, e e o nome que a
  -- lideranca usa para pedir ajuda no acompanhamento.
  invited_by uuid references public.profiles (id) on delete set null,
  first_visit_on date not null default current_date,
  notes text,
  status public.visitor_status not null default 'acompanhando',
  -- O desfecho, e o porque dele.
  outcome_reason text,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  -- Preenchido quando o visitante vira integrante: e o fio que liga o
  -- historico de visitante ao cadastro que nasceu dele.
  promoted_profile_id uuid unique references public.profiles (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitors_desfecho_com_motivo check (
    status <> 'encerrado' or nullif(btrim(coalesce(outcome_reason, '')), '') is not null
  )
);

create index if not exists visitors_group_idx on public.visitors (group_id, status);
create index if not exists visitors_abertos_idx
  on public.visitors (first_visit_on desc) where status = 'acompanhando';

drop trigger if exists visitors_touch on public.visitors;
create trigger visitors_touch before update on public.visitors
  for each row execute function app.touch_updated_at();

comment on table public.visitors is
  'Quem visitou o GC e ainda nao e integrante. Fica fora de `profiles` de '
  'proposito: e o que garante que o rodizio proporcional nunca o distribua.';

-- ------------------------------------------------------- contatos com visitante
/**
 * O contato com um visitante e mais curto que o cuidado de um integrante.
 *
 * Nao pergunta como a pessoa esta na escala do feedback: com quem visitou uma
 * vez ainda nao se pergunta isso, e uma resposta chutada polui o relatorio do
 * GC inteiro. As perguntas aqui sao outras - falamos com ele, e ele volta?
 */
create table if not exists public.visitor_contacts (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null references public.visitors (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  contacted_on date not null default current_date,
  channel public.contact_channel not null default 'whatsapp',
  coming_to_gc public.gc_intent,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists visitor_contacts_visitor_idx
  on public.visitor_contacts (visitor_id, contacted_on desc);

-- ============================================================== quem ve o que
alter table public.visitors enable row level security;
alter table public.visitor_contacts enable row level security;

grant select on public.visitors to authenticated;
grant select on public.visitor_contacts to authenticated;

-- O visitante e assunto de quem lidera. Nao aparece para o GC: ele ainda nao
-- escolheu fazer parte, e uma lista de "pessoas em observacao" circulando
-- entre 33 pessoas seria exatamente o oposto de acolher.
drop policy if exists visitors_read on public.visitors;
create policy visitors_read on public.visitors
  for select to authenticated using (app.is_leadership());

drop policy if exists visitor_contacts_read on public.visitor_contacts;
create policy visitor_contacts_read on public.visitor_contacts
  for select to authenticated using (app.is_leadership());

-- Escrita acontece exclusivamente pelas funcoes abaixo.

-- ================================================================== auxiliares
/**
 * O GC de quem esta na sessao.
 *
 * "O primeiro grupo que existir" e uma suposicao que quebra em silencio, e ja
 * quebrou aqui: sem este recorte, a lista de visitantes de um GC aparecia para
 * a lideranca de outro assim que existiu mais de um grupo no banco. O vinculo
 * da pessoa e a unica fonte de verdade sobre qual GC ela enxerga.
 */
create or replace function app.meu_grupo()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select gm.group_id
    from public.group_memberships gm
   where gm.profile_id = app.current_profile_id() and gm.left_at is null
   order by gm.joined_at
   limit 1;
$$;

grant execute on function app.meu_grupo() to authenticated;

-- ==================================================================== escrever
/** Cadastra ou corrige um visitante. */
create or replace function public.salvar_visitante(
  p_id uuid,
  p_group_id uuid,
  p_full_name text,
  p_phone text default null,
  p_email text default null,
  p_birth_date date default null,
  p_care_gender public.care_gender default null,
  p_origin public.visitor_origin default 'organico',
  p_invited_by uuid default null,
  p_first_visit_on date default null,
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
  v_nome text := btrim(p_full_name);
begin
  if p_first_visit_on > current_date then
    raise exception 'A primeira visita nao pode estar no futuro.' using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into public.visitors (group_id, full_name, phone, email, birth_date, care_gender,
                                 origin, invited_by, first_visit_on, notes, created_by)
    values (p_group_id, v_nome,
            nullif(btrim(coalesce(p_phone, '')), ''),
            nullif(btrim(coalesce(p_email, '')), ''),
            p_birth_date, p_care_gender,
            coalesce(p_origin, 'organico'),
            -- Quem trouxe so faz sentido quando alguem trouxe.
            case when coalesce(p_origin, 'organico') = 'convite' then p_invited_by end,
            coalesce(p_first_visit_on, current_date),
            nullif(btrim(coalesce(p_notes, '')), ''), me)
    returning id into v_id;

    perform app.audit('visitor.created', 'visitors', v_id, null,
                      jsonb_build_object('nome', v_nome, 'origem', coalesce(p_origin, 'organico')));
  else
    update public.visitors
       set full_name = v_nome,
           phone = nullif(btrim(coalesce(p_phone, '')), ''),
           email = nullif(btrim(coalesce(p_email, '')), ''),
           birth_date = p_birth_date,
           care_gender = p_care_gender,
           origin = coalesce(p_origin, origin),
           invited_by = case when coalesce(p_origin, origin) = 'convite' then p_invited_by end,
           first_visit_on = coalesce(p_first_visit_on, first_visit_on),
           notes = nullif(btrim(coalesce(p_notes, '')), '')
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Visitante nao encontrado.' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.salvar_visitante(uuid, uuid, text, text, text, date,
  public.care_gender, public.visitor_origin, uuid, date, text) from public, anon;
grant execute on function public.salvar_visitante(uuid, uuid, text, text, text, date,
  public.care_gender, public.visitor_origin, uuid, date, text) to authenticated;

/**
 * Registra que a lideranca falou com o visitante.
 *
 * Nao mexe em `care_assignments` nem em `contact_logs`: este contato nao entra
 * na constancia de ninguem, nem no calculo do cuidado proporcional. Ele conta
 * outra historia - a de quem ainda esta decidindo se fica.
 */
create or replace function public.registrar_contato_visitante(
  p_visitor_id uuid,
  p_channel public.contact_channel default 'whatsapp',
  p_coming_to_gc public.gc_intent default null,
  p_contacted_on date default null,
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
  v_status public.visitor_status;
begin
  select status into v_status from public.visitors where id = p_visitor_id;
  if v_status is null then
    raise exception 'Visitante nao encontrado.' using errcode = 'no_data_found';
  end if;

  if v_status <> 'acompanhando' then
    raise exception 'Este acompanhamento ja foi encerrado.' using errcode = 'check_violation';
  end if;

  if p_contacted_on > current_date then
    raise exception 'A data do contato nao pode estar no futuro.' using errcode = 'check_violation';
  end if;

  insert into public.visitor_contacts (visitor_id, author_id, contacted_on, channel,
                                       coming_to_gc, notes)
  values (p_visitor_id, me, coalesce(p_contacted_on, current_date),
          coalesce(p_channel, 'whatsapp'), p_coming_to_gc,
          nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;

  perform app.audit('visitor.contacted', 'visitors', p_visitor_id, null,
                    jsonb_build_object('comingToGc', p_coming_to_gc));

  return v_id;
end;
$$;

revoke all on function public.registrar_contato_visitante(uuid, public.contact_channel,
  public.gc_intent, date, text) from public, anon;
grant execute on function public.registrar_contato_visitante(uuid, public.contact_channel,
  public.gc_intent, date, text) to authenticated;

/**
 * O visitante virou integrante.
 *
 * Cria o cadastro em `profiles`, vincula ao GC e guarda o fio de volta: o
 * historico de visitante nao e apagado, porque "chegou pelo GC Center em maio,
 * conversamos quatro vezes, entrou em julho" e a memoria do GC sobre aquela
 * pessoa - e o cadastro novo, sozinho, nao conta nada disso.
 *
 * A partir daqui ele entra no rodizio como qualquer irmao: e exatamente essa
 * a diferenca entre visitante e integrante.
 */
create or replace function public.promover_visitante(
  p_visitor_id uuid,
  p_role public.app_role default 'member'
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.require_leader();
  v public.visitors;
  v_profile uuid;
begin
  select * into v from public.visitors where id = p_visitor_id for update;
  if not found then
    raise exception 'Visitante nao encontrado.' using errcode = 'no_data_found';
  end if;

  if v.status = 'integrado' then
    raise exception 'Este visitante ja faz parte do GC.' using errcode = 'check_violation';
  end if;

  if coalesce(p_role, 'member') = 'supervisor' then
    raise exception 'Supervisao nao nasce de uma visita.' using errcode = 'check_violation';
  end if;

  insert into public.profiles (full_name, email, phone, birth_date, care_gender, salutation, role)
  values (v.full_name, v.email, v.phone, v.birth_date, v.care_gender,
          case v.care_gender when 'male' then 'irmao'::public.salutation
                             when 'female' then 'irma'::public.salutation end,
          coalesce(p_role, 'member'))
  returning id into v_profile;

  -- O integrante nasce vinculado ao GC: e a associacao que define qual grupo
  -- ele enxerga ao entrar.
  insert into public.group_memberships (group_id, profile_id, role)
  values (v.group_id, v_profile, coalesce(p_role, 'member'))
  on conflict (group_id, profile_id) do nothing;

  update public.visitors
     set status = 'integrado',
         promoted_profile_id = v_profile,
         closed_at = now(),
         closed_by = me,
         outcome_reason = null
   where id = p_visitor_id;

  perform app.notify_leaders(me, 'general', 'O GC tem gente nova',
                             format('%s deixou de ser visitante e entrou no GC.', v.full_name),
                             '/integrantes');

  perform app.audit('visitor.promoted', 'visitors', p_visitor_id, null,
                    jsonb_build_object('profile', v_profile, 'papel', coalesce(p_role, 'member')));

  return v_profile;
end;
$$;

revoke all on function public.promover_visitante(uuid, public.app_role) from public, anon;
grant execute on function public.promover_visitante(uuid, public.app_role) to authenticated;

/**
 * Encerra o acompanhamento, com o motivo escrito.
 *
 * O motivo e obrigatorio, e nao por burocracia: encerrar sem ele apaga a
 * unica coisa que a lideranca vai querer saber depois - se a pessoa foi
 * encaminhada para outro GC, se ela pediu para nao ser mais procurada, ou se
 * simplesmente nao deu certo naquele dia.
 */
create or replace function public.encerrar_visitante(p_visitor_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.require_leader();
  v_motivo text := nullif(btrim(coalesce(p_reason, '')), '');
  v_nome text;
begin
  if v_motivo is null then
    raise exception 'Diga o motivo: daqui a tres meses ninguem lembra.'
      using errcode = 'check_violation';
  end if;

  update public.visitors
     set status = 'encerrado', outcome_reason = v_motivo, closed_at = now(), closed_by = me
   where id = p_visitor_id and status <> 'integrado'
  returning full_name into v_nome;

  if v_nome is null then
    raise exception 'Visitante nao encontrado, ou ja integrado ao GC.'
      using errcode = 'no_data_found';
  end if;

  perform app.audit('visitor.closed', 'visitors', p_visitor_id, null,
                    jsonb_build_object('nome', v_nome), v_motivo);
end;
$$;

revoke all on function public.encerrar_visitante(uuid, text) from public, anon;
grant execute on function public.encerrar_visitante(uuid, text) to authenticated;

/** Volta a acompanhar quem foi encerrado. Acontece: a pessoa reaparece. */
create or replace function public.reabrir_visitante(p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_leader();

  update public.visitors
     set status = 'acompanhando', outcome_reason = null, closed_at = null, closed_by = null
   where id = p_visitor_id and status = 'encerrado';

  if not found then
    raise exception 'So um acompanhamento encerrado pode ser reaberto.'
      using errcode = 'no_data_found';
  end if;

  perform app.audit('visitor.reopened', 'visitors', p_visitor_id, null, null);
end;
$$;

revoke all on function public.reabrir_visitante(uuid) from public, anon;
grant execute on function public.reabrir_visitante(uuid) to authenticated;

/** Apaga um visitante cadastrado por engano. Os contatos vao junto, por cascata. */
create or replace function public.apagar_visitante(p_visitor_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_status public.visitor_status;
begin
  perform app.require_leader();

  select status into v_status from public.visitors where id = p_visitor_id;
  if v_status is null then
    raise exception 'Visitante nao encontrado.' using errcode = 'no_data_found';
  end if;

  -- Quem ja entrou no GC nao volta a ser um registro apagavel: o cadastro
  -- dele aponta para aqui, e desativar integrante e outro gesto, em outra tela.
  if v_status = 'integrado' then
    raise exception 'Este visitante ja e integrante. Desative o cadastro dele, se for o caso.'
      using errcode = 'check_violation';
  end if;

  delete from public.visitors where id = p_visitor_id;
  perform app.audit('visitor.deleted', 'visitors', p_visitor_id, null, null);
end;
$$;

revoke all on function public.apagar_visitante(uuid) from public, anon;
grant execute on function public.apagar_visitante(uuid) to authenticated;

-- =============================================================== ler a lista
/**
 * Os visitantes do GC, com o que a lideranca precisa ver de relance.
 *
 * Uma chamada devolve tudo - quantas vezes falamos, quando foi a ultima vez,
 * ha quantos dias esta em silencio - porque a pergunta que essa tela responde
 * e sempre a mesma: com quem a gente ainda nao falou?
 */
create or replace function public.visitantes()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(linha order by ordem desc), '[]'::jsonb)
    from (
      select v.first_visit_on as ordem,
             jsonb_build_object(
               'id', v.id,
               'nome', v.full_name,
               'telefone', v.phone,
               'email', v.email,
               'nascimento', v.birth_date,
               'generoDeCuidado', v.care_gender,
               'origem', v.origin,
               'convidadoPor', (select public.display_name(p) from public.profiles p
                                 where p.id = v.invited_by),
               'primeiraVisita', v.first_visit_on,
               'anotacao', v.notes,
               'situacao', v.status,
               'motivo', v.outcome_reason,
               'encerradoEm', v.closed_at,
               'integranteId', v.promoted_profile_id,
               'contatos', (select count(*) from public.visitor_contacts c
                             where c.visitor_id = v.id),
               'ultimoContato', (select max(c.contacted_on) from public.visitor_contacts c
                                  where c.visitor_id = v.id),
               -- A ultima palavra dele sobre voltar: e o que decide se a
               -- lideranca insiste ou respeita o "nao".
               'ultimaIntencao', (select c.coming_to_gc from public.visitor_contacts c
                                   where c.visitor_id = v.id and c.coming_to_gc is not null
                                   order by c.contacted_on desc, c.created_at desc
                                   limit 1)
             ) as linha
        from public.visitors v
       where app.is_leadership() and v.group_id = app.meu_grupo()
    ) lista;
$$;

revoke all on function public.visitantes() from public, anon;
grant execute on function public.visitantes() to authenticated;

/** O historico de conversas com um visitante, da mais recente para a mais antiga. */
create or replace function public.contatos_do_visitante(p_visitor_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id,
           'quando', c.contacted_on,
           'canal', c.channel,
           'intencao', c.coming_to_gc,
           'anotacao', c.notes,
           'autor', public.display_name(p)
         ) order by c.contacted_on desc, c.created_at desc), '[]'::jsonb)
    from public.visitor_contacts c
    join public.profiles p on p.id = c.author_id
   where c.visitor_id = p_visitor_id
     and app.is_leadership()
     and exists (select 1 from public.visitors v
                  where v.id = c.visitor_id and v.group_id = app.meu_grupo());
$$;

revoke all on function public.contatos_do_visitante(uuid) from public, anon;
grant execute on function public.contatos_do_visitante(uuid) to authenticated;
