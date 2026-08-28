-- =============================================================================
-- Cuidar GC :: 0003 - atividades da semana
-- =============================================================================
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  week_id uuid references public.care_weeks (id) on delete set null,
  type public.activity_type not null default 'other',
  title text not null check (length(btrim(title)) > 0),
  description text,
  due_at timestamptz,
  status public.activity_status not null default 'todo',
  notes text,
  -- Atividades recorrentes sao as unicas duplicadas ao abrir uma nova semana.
  -- A distribuicao de pessoas nunca e copiada.
  is_recurring boolean not null default false,
  recurrence_source_id uuid references public.activities (id) on delete set null,
  created_by uuid references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index activities_week_idx on public.activities (week_id, status);
create index activities_group_idx on public.activities (group_id, due_at);
create index activities_recurring_idx on public.activities (group_id) where is_recurring;
create trigger activities_touch before update on public.activities
  for each row execute function app.touch_updated_at();

create or replace function app.stamp_activity_completion()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'done' and (tg_op = 'INSERT' or old.status is distinct from 'done') then
    new.completed_at := coalesce(new.completed_at, now());
  elsif new.status <> 'done' then
    new.completed_at := null;
  end if;
  return new;
end;
$$;
create trigger activities_completion before insert or update on public.activities
  for each row execute function app.stamp_activity_completion();

-- Uma atividade aceita varios responsaveis (o Talk normalmente tem mais de um).
create table public.activity_assignees (
  activity_id uuid not null references public.activities (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  assigned_at timestamptz not null default now(),
  primary key (activity_id, profile_id)
);
create index activity_assignees_profile_idx on public.activity_assignees (profile_id);
