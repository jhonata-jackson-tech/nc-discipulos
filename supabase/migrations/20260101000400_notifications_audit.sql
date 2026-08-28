-- =============================================================================
-- Cuidar GC :: 0005 - notificacoes, auditoria e convites
-- =============================================================================
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  type public.notification_type not null default 'general',
  title text not null,
  body text,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_inbox_idx on public.notifications (profile_id, created_at desc);
create index notifications_unread_idx on public.notifications (profile_id) where read_at is null;

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id uuid,
  reason text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id, created_at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);

-- --------------------------------------------------------------------- convites
-- Nao existe cadastro publico: a conta so nasce a partir de um convite valido,
-- emitido por um lider para um integrante que ja existe no GC. Guardamos apenas
-- o hash do token; o valor em claro aparece uma unica vez para quem convidou.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  status public.invite_status not null default 'pending',
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index invites_pending_profile_idx
  on public.invites (profile_id) where status = 'pending';
create index invites_email_idx on public.invites (lower(email)) where status = 'pending';

-- Historico de alteracoes das atividades, conforme pedido no planejamento.
create or replace function app.audit_activity()
returns trigger
language plpgsql
security definer
set search_path = public, app
as $$
declare
  actor uuid := app.current_profile_id();
begin
  if tg_op = 'INSERT' then
    insert into public.audit_logs (actor_id, action, entity, entity_id, after)
    values (actor, 'activity.created', 'activities', new.id, to_jsonb(new));
    return new;
  elsif tg_op = 'UPDATE' then
    if to_jsonb(new) is distinct from to_jsonb(old) then
      insert into public.audit_logs (actor_id, action, entity, entity_id, before, after)
      values (actor, 'activity.updated', 'activities', new.id, to_jsonb(old), to_jsonb(new));
    end if;
    return new;
  else
    insert into public.audit_logs (actor_id, action, entity, entity_id, before)
    values (actor, 'activity.deleted', 'activities', old.id, to_jsonb(old));
    return old;
  end if;
end;
$$;
