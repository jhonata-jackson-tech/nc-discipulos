-- =============================================================================
-- Cuidar GC :: 0001 - fundacoes, enums, pessoas e vinculos
-- =============================================================================
-- Schema reservado a helpers internos. Nao e exposto pelo PostgREST, portanto
-- nenhuma funcao daqui pode ser chamada diretamente pelo frontend.
create schema if not exists app;
revoke all on schema app from anon, authenticated;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------- enumeracoes
create type public.app_role as enum ('supervisor', 'leader', 'disciple', 'member');
create type public.care_gender as enum ('male', 'female');
create type public.member_status as enum ('active', 'inactive');
create type public.salutation as enum ('irmao', 'irma');

create type public.care_week_status as enum ('draft', 'published', 'closed');
create type public.assignment_status as enum (
  'pending', 'contacted', 'awaiting_reply', 'follow_up', 'needs_attention'
);
create type public.assignment_origin as enum ('fixed_disciple', 'rotation', 'manual', 'transfer');
create type public.attention_level as enum ('normal', 'watch', 'leader_action');
create type public.contact_channel as enum (
  'whatsapp', 'call', 'in_person', 'message', 'video', 'other'
);
create type public.transfer_status as enum ('pending', 'accepted', 'declined', 'cancelled');

create type public.activity_type as enum ('talk', 'snack', 'dynamic', 'birthdays', 'other');
create type public.activity_status as enum ('todo', 'in_progress', 'done', 'cancelled');

create type public.supervision_status as enum (
  'requested', 'seen', 'scheduled', 'done', 'cancelled'
);
create type public.supervision_urgency as enum ('low', 'normal', 'high');

create type public.notification_type as enum (
  'week_published', 'assignment_new', 'activity_assigned', 'activity_due',
  'transfer_requested', 'transfer_accepted', 'transfer_declined',
  'supervision_updated', 'general'
);
create type public.invite_status as enum ('pending', 'accepted', 'revoked');

-- ------------------------------------------------------------------- utilidade
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------- grupos
create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  timezone text not null default 'America/Sao_Paulo',
  -- Dia da semana em que a semana de cuidado comeca (0 = domingo).
  week_starts_on smallint not null default 1 check (week_starts_on between 0 and 6),
  setup_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger groups_touch before update on public.groups
  for each row execute function app.touch_updated_at();

-- -------------------------------------------------------------------- pessoas
-- Um integrante existe antes de ter conta: `user_id` so e preenchido quando o
-- convite e aceito. Exclusao e sempre logica, para preservar historico.
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique references auth.users (id) on delete set null,
  full_name text not null check (length(btrim(full_name)) > 0),
  email text,
  phone text,
  birth_date date,
  salutation public.salutation,
  care_gender public.care_gender,
  care_gender_confirmed_at timestamptz,
  role public.app_role not null default 'member',
  status public.member_status not null default 'active',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index profiles_email_unique_idx
  on public.profiles (lower(email)) where email is not null and deleted_at is null;
create index profiles_role_idx on public.profiles (role) where deleted_at is null;
create index profiles_status_idx on public.profiles (status) where deleted_at is null;
create index profiles_care_gender_idx on public.profiles (care_gender) where deleted_at is null;
create trigger profiles_touch before update on public.profiles
  for each row execute function app.touch_updated_at();

-- Confirmar o genero de cuidado e um ato deliberado da lideranca; o carimbo de
-- confirmacao acompanha automaticamente qualquer mudanca do campo.
create or replace function app.stamp_care_gender_confirmation()
returns trigger
language plpgsql
as $$
begin
  if new.care_gender is null then
    new.care_gender_confirmed_at := null;
  elsif tg_op = 'INSERT' or new.care_gender is distinct from old.care_gender then
    new.care_gender_confirmed_at := coalesce(new.care_gender_confirmed_at, now());
  end if;
  return new;
end;
$$;
create trigger profiles_stamp_care_gender before insert or update on public.profiles
  for each row execute function app.stamp_care_gender_confirmation();

-- -------------------------------------------------------------- vinculo com GC
create table public.group_memberships (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.app_role not null default 'member',
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (group_id, profile_id)
);
create index group_memberships_group_idx on public.group_memberships (group_id);

-- `profiles.role` e a fonte de verdade das permissoes (o produto opera um unico
-- GC); a associacao espelha o papel para leitura por grupo.
create or replace function app.mirror_role_to_membership()
returns trigger
language plpgsql
as $$
begin
  update public.group_memberships set role = new.role where profile_id = new.id;
  return new;
end;
$$;
create trigger profiles_mirror_role after update of role on public.profiles
  for each row execute function app.mirror_role_to_membership();

-- ------------------------------------------------------------- discipulado
create table public.discipleship_links (
  id uuid primary key default gen_random_uuid(),
  disciple_id uuid not null references public.profiles (id) on delete cascade,
  leader_id uuid not null references public.profiles (id) on delete cascade,
  started_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now(),
  constraint discipleship_no_self check (disciple_id <> leader_id),
  constraint discipleship_period check (ended_on is null or ended_on >= started_on)
);
-- Um discipulo tem no maximo um lider primario vigente.
create unique index discipleship_active_unique_idx
  on public.discipleship_links (disciple_id) where ended_on is null;
create index discipleship_leader_idx on public.discipleship_links (leader_id) where ended_on is null;

-- Regra inviolavel do produto: o vinculo de discipulado respeita o genero de
-- cuidado. Validado no banco, nunca apenas na interface.
create or replace function app.enforce_discipleship_gender()
returns trigger
language plpgsql
as $$
declare
  disciple_gender public.care_gender;
  leader_gender public.care_gender;
begin
  select care_gender into disciple_gender from public.profiles where id = new.disciple_id;
  select care_gender into leader_gender from public.profiles where id = new.leader_id;

  if disciple_gender is null or leader_gender is null then
    raise exception 'Confirme o genero de cuidado do discipulo e do lider antes de vincular.'
      using errcode = 'check_violation';
  end if;

  if disciple_gender <> leader_gender then
    raise exception 'Um discipulo so pode ser vinculado a um lider do mesmo genero de cuidado.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
create trigger discipleship_gender_guard before insert or update on public.discipleship_links
  for each row when (new.ended_on is null) execute function app.enforce_discipleship_gender();

-- ------------------------------------------------- notas administrativas
-- Observacoes da lideranca sobre um integrante ficam fora de `profiles` de
-- proposito: assim nenhuma consulta comum pode devolver esse conteudo, mesmo
-- por engano.
create table public.member_notes (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  notes text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);
