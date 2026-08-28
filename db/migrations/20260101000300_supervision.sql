-- =============================================================================
-- Cuidar GC :: 0004 - canal reservado com a supervisao
-- =============================================================================
create table public.supervision_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups (id) on delete cascade,
  requester_id uuid not null references public.profiles (id) on delete cascade,
  -- Nulo significa "qualquer supervisor".
  supervisor_id uuid references public.profiles (id) on delete set null,
  -- Quando verdadeiro, nem o conteudo nem a existencia da solicitacao aparecem
  -- para lideres - inclusive em contadores e notificacoes.
  confidential_to_supervisors boolean not null default true,
  subject text not null check (length(btrim(subject)) > 0),
  message text not null check (length(btrim(message)) > 0),
  urgency public.supervision_urgency not null default 'normal',
  suggested_times text,
  status public.supervision_status not null default 'requested',
  seen_at timestamptz,
  scheduled_for timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index supervision_requests_status_idx
  on public.supervision_requests (group_id, status, created_at desc);
create index supervision_requests_requester_idx on public.supervision_requests (requester_id);
create index supervision_requests_supervisor_idx on public.supervision_requests (supervisor_id);
create trigger supervision_requests_touch before update on public.supervision_requests
  for each row execute function app.touch_updated_at();

-- Somente discipulos e lideres abrem solicitacao; membros usam a lideranca do GC.
create or replace function app.enforce_supervision_requester()
returns trigger
language plpgsql
as $$
declare
  requester_role public.app_role;
  target_role public.app_role;
begin
  select role into requester_role from public.profiles where id = new.requester_id;
  if requester_role not in ('disciple', 'leader') then
    raise exception 'Apenas discipulos e lideres podem solicitar conversa com a supervisao.'
      using errcode = 'check_violation';
  end if;

  if new.supervisor_id is not null then
    select role into target_role from public.profiles where id = new.supervisor_id;
    if target_role <> 'supervisor' then
      raise exception 'A solicitacao precisa ser dirigida a um supervisor.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;
create trigger supervision_requests_guard before insert or update on public.supervision_requests
  for each row execute function app.enforce_supervision_requester();

-- Anotacoes privadas do supervisor: nunca visiveis a lideres nem ao solicitante.
create table public.supervision_notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.supervision_requests (id) on delete cascade,
  supervisor_id uuid not null references public.profiles (id) on delete cascade,
  note text not null check (length(btrim(note)) > 0),
  created_at timestamptz not null default now()
);
create index supervision_notes_request_idx on public.supervision_notes (request_id, created_at desc);
