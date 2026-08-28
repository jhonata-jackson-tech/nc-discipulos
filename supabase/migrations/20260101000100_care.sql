-- =============================================================================
-- Cuidar GC :: 0002 - semanas, atribuicoes, contatos e transferencias
-- =============================================================================

-- ----------------------------------------------------------- restricoes de par
-- Pares que a lideranca decidiu nunca combinar. Normalizamos a ordem do par
-- para que a restricao valha nos dois sentidos com um unico indice.
create table public.pairing_restrictions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_a uuid not null references public.profiles (id) on delete cascade,
  profile_b uuid not null references public.profiles (id) on delete cascade,
  reason text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint pairing_distinct check (profile_a <> profile_b),
  constraint pairing_ordered check (profile_a < profile_b),
  unique (group_id, profile_a, profile_b)
);

create or replace function app.normalize_pairing()
returns trigger
language plpgsql
as $$
declare
  swap uuid;
begin
  if new.profile_a > new.profile_b then
    swap := new.profile_a;
    new.profile_a := new.profile_b;
    new.profile_b := swap;
  end if;
  return new;
end;
$$;
create trigger pairing_normalize before insert or update on public.pairing_restrictions
  for each row execute function app.normalize_pairing();

-- ------------------------------------------------------------------- semanas
create table public.care_weeks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status public.care_week_status not null default 'draft',
  -- Semente deterministica: mesma semana + mesmo elenco = mesmo resultado.
  seed text not null,
  generation_report jsonb,
  generated_at timestamptz,
  generated_by uuid references public.profiles (id) on delete set null,
  published_at timestamptz,
  published_by uuid references public.profiles (id) on delete set null,
  closed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint care_weeks_period check (ends_on >= starts_on),
  unique (group_id, starts_on)
);
create index care_weeks_status_idx on public.care_weeks (group_id, status, starts_on desc);
create trigger care_weeks_touch before update on public.care_weeks
  for each row execute function app.touch_updated_at();

-- --------------------------------------------------------------- atribuicoes
create table public.care_assignments (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.care_weeks (id) on delete cascade,
  caregiver_id uuid not null references public.profiles (id) on delete restrict,
  cared_for_id uuid not null references public.profiles (id) on delete restrict,
  origin public.assignment_origin not null default 'rotation',
  status public.assignment_status not null default 'pending',
  attention_level public.attention_level not null default 'normal',
  previous_caregiver_id uuid references public.profiles (id) on delete set null,
  transferred_at timestamptz,
  last_contact_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint assignment_no_self check (caregiver_id <> cared_for_id),
  -- Cada pessoa cuidada aparece uma unica vez por semana.
  constraint assignment_unique_cared_for unique (week_id, cared_for_id)
);
create index care_assignments_caregiver_idx on public.care_assignments (caregiver_id, week_id);
create index care_assignments_week_idx on public.care_assignments (week_id, status);
create index care_assignments_attention_idx
  on public.care_assignments (week_id, attention_level)
  where attention_level <> 'normal';
create trigger care_assignments_touch before update on public.care_assignments
  for each row execute function app.touch_updated_at();

-- Regra inviolavel: homem cuida de homem, mulher cuida de mulher. Vale para
-- geracao automatica, edicao manual e aceite de transferencia - o banco e a
-- ultima linha de defesa, independente do que a interface enviar.
create or replace function app.enforce_assignment_rules()
returns trigger
language plpgsql
as $$
declare
  caregiver record;
  cared record;
  blocked boolean;
  week_group uuid;
begin
  select id, care_gender, status, deleted_at, role
    into caregiver from public.profiles where id = new.caregiver_id;
  select id, care_gender, status, deleted_at, role
    into cared from public.profiles where id = new.cared_for_id;

  if caregiver.care_gender is null or cared.care_gender is null then
    raise exception 'Confirme o genero de cuidado das duas pessoas antes de criar a atribuicao.'
      using errcode = 'check_violation';
  end if;

  if caregiver.care_gender <> cared.care_gender then
    raise exception 'Cuidador e pessoa cuidada precisam ter o mesmo genero de cuidado.'
      using errcode = 'check_violation';
  end if;

  if caregiver.deleted_at is not null or caregiver.status <> 'active' then
    raise exception 'O cuidador precisa estar ativo.' using errcode = 'check_violation';
  end if;

  if cared.deleted_at is not null or cared.status <> 'active' then
    raise exception 'A pessoa cuidada precisa estar ativa.' using errcode = 'check_violation';
  end if;

  if caregiver.role not in ('leader', 'disciple') then
    raise exception 'Somente lideres e discipulos podem ser cuidadores.'
      using errcode = 'check_violation';
  end if;

  select group_id into week_group from public.care_weeks where id = new.week_id;
  select exists (
    select 1 from public.pairing_restrictions r
    where r.group_id = week_group
      and r.profile_a = least(new.caregiver_id, new.cared_for_id)
      and r.profile_b = greatest(new.caregiver_id, new.cared_for_id)
  ) into blocked;

  if blocked then
    raise exception 'Esta dupla esta bloqueada por uma restricao cadastrada.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
create trigger care_assignments_rules before insert or update of caregiver_id, cared_for_id
  on public.care_assignments
  for each row execute function app.enforce_assignment_rules();

-- Semanas publicadas nao sao sobrescritas por engano: qualquer alteracao passa
-- pelas funcoes de servidor, que registram justificativa e auditoria.
create table public.contact_logs (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.care_assignments (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete restrict,
  contacted_on date not null default current_date,
  channel public.contact_channel not null,
  got_reply boolean not null default false,
  feedback text,
  attention_level public.attention_level not null default 'normal',
  created_at timestamptz not null default now()
);
create index contact_logs_assignment_idx on public.contact_logs (assignment_id, contacted_on desc);
create index contact_logs_attention_idx
  on public.contact_logs (attention_level) where attention_level <> 'normal';

-- --------------------------------------------------------- transferencias
create table public.transfer_requests (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.care_assignments (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete restrict,
  recipient_id uuid not null references public.profiles (id) on delete restrict,
  reason text not null check (length(btrim(reason)) > 0),
  status public.transfer_status not null default 'pending',
  response_note text,
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint transfer_distinct check (requester_id <> recipient_id)
);
-- No maximo um pedido pendente por atribuicao.
create unique index transfer_pending_unique_idx
  on public.transfer_requests (assignment_id) where status = 'pending';
create index transfer_recipient_idx on public.transfer_requests (recipient_id, status);
create index transfer_requester_idx on public.transfer_requests (requester_id, status);

-- O destinatario precisa ser um cuidador elegivel do mesmo genero da pessoa
-- cuidada - validado tambem aqui, e nao so na listagem da interface.
create or replace function app.enforce_transfer_rules()
returns trigger
language plpgsql
as $$
declare
  cared_gender public.care_gender;
  recipient record;
begin
  select p.care_gender into cared_gender
    from public.care_assignments a
    join public.profiles p on p.id = a.cared_for_id
   where a.id = new.assignment_id;

  select care_gender, status, deleted_at, role into recipient
    from public.profiles where id = new.recipient_id;

  if recipient.care_gender is distinct from cared_gender then
    raise exception 'O destinatario precisa ter o mesmo genero de cuidado da pessoa cuidada.'
      using errcode = 'check_violation';
  end if;

  if recipient.deleted_at is not null or recipient.status <> 'active'
     or recipient.role not in ('leader', 'disciple') then
    raise exception 'O destinatario precisa ser um lider ou discipulo ativo.'
      using errcode = 'check_violation';
  end if;

  if exists (
    select 1 from public.care_assignments a
     where a.id = new.assignment_id and a.cared_for_id = new.recipient_id
  ) then
    raise exception 'Ninguem pode cuidar de si mesmo.' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
create trigger transfer_requests_rules before insert on public.transfer_requests
  for each row execute function app.enforce_transfer_rules();

-- ------------------------------------------------- historico de pares (ciclo)
-- Materializa quando cada dupla foi usada pela ultima vez, alimentando a regra
-- de nao repetir duplas enquanto houver combinacao inedita disponivel.
create view public.pairing_history as
select
  a.caregiver_id,
  a.cared_for_id,
  max(w.starts_on) as last_used_on,
  count(*)::int as times_used
from public.care_assignments a
join public.care_weeks w on w.id = a.week_id
where w.status in ('published', 'closed')
group by a.caregiver_id, a.cared_for_id;
