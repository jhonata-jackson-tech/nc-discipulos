-- =============================================================================
-- Cuidar GC :: 0006 - identidade da sessao, permissoes e Row Level Security
--
-- Principio: o papel nunca vem do frontend. Toda decisao de acesso e tomada
-- aqui, a partir de `auth.uid()`.
-- =============================================================================

create or replace function app.current_profile_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.id from public.profiles p
   where p.user_id = auth.uid() and p.deleted_at is null
   limit 1;
$$;

create or replace function app.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p.role from public.profiles p
   where p.user_id = auth.uid() and p.deleted_at is null
   limit 1;
$$;

create or replace function app.is_active()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles p
     where p.user_id = auth.uid() and p.deleted_at is null and p.status = 'active'
  );
$$;

create or replace function app.is_leader()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select app.current_role() = 'leader' and app.is_active(); $$;

create or replace function app.is_supervisor()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select app.current_role() = 'supervisor' and app.is_active(); $$;

-- "Lideranca" = quem acompanha a operacao do GC (lider ou supervisor).
create or replace function app.is_leadership()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$ select app.current_role() in ('leader', 'supervisor') and app.is_active(); $$;

create or replace function app.is_caregiver_of(target_assignment uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.care_assignments a
     where a.id = target_assignment and a.caregiver_id = app.current_profile_id()
  );
$$;

grant execute on function
  app.current_profile_id(), app.current_role(), app.is_active(),
  app.is_leader(), app.is_supervisor(), app.is_leadership(),
  app.is_caregiver_of(uuid)
to authenticated;

-- Historico de atividades depende dos helpers acima.
create trigger activities_audit after insert or update or delete on public.activities
  for each row execute function app.audit_activity();

-- ============================================================== grants base
-- `anon` nao le nada do dominio: o produto e inteiramente privado.
revoke all on all tables in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on all sequences in schema public from anon;

alter table public.groups enable row level security;
alter table public.profiles enable row level security;
alter table public.member_notes enable row level security;
alter table public.group_memberships enable row level security;
alter table public.discipleship_links enable row level security;
alter table public.pairing_restrictions enable row level security;
alter table public.care_weeks enable row level security;
alter table public.care_assignments enable row level security;
alter table public.contact_logs enable row level security;
alter table public.transfer_requests enable row level security;
alter table public.activities enable row level security;
alter table public.activity_assignees enable row level security;
alter table public.supervision_requests enable row level security;
alter table public.supervision_notes enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;
alter table public.invites enable row level security;

-- ================================================================== groups
grant select on public.groups to authenticated;
grant update on public.groups to authenticated;

create policy groups_read on public.groups
  for select to authenticated using (app.is_active());

create policy groups_update on public.groups
  for update to authenticated using (app.is_leader()) with check (app.is_leader());

-- ================================================================ profiles
grant select, insert, update on public.profiles to authenticated;

-- Todo integrante ativo enxerga o elenco do GC: e o que permite escolher
-- responsaveis, destinatarios de transferencia e ver aniversariantes.
create policy profiles_read on public.profiles
  for select to authenticated using (app.is_active() and deleted_at is null);

create policy profiles_insert on public.profiles
  for insert to authenticated with check (app.is_leader());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy profiles_update_leader on public.profiles
  for update to authenticated
  using (app.is_leader()) with check (app.is_leader());

-- Colunas privilegiadas so mudam por decisao da lideranca. A policy autoriza a
-- linha; este gatilho protege as colunas.
create or replace function app.guard_profile_columns()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Operacoes internas de sistema (aceite de convite) rodam sem sessao de app;
  -- a RLS ja impede que um usuario comum chegue ate aqui.
  if app.current_profile_id() is null then
    return new;
  end if;

  if app.is_leader() then
    if new.role is distinct from old.role then
      insert into public.audit_logs (actor_id, action, entity, entity_id, before, after)
      values (app.current_profile_id(), 'profile.role_changed', 'profiles', new.id,
              jsonb_build_object('role', old.role), jsonb_build_object('role', new.role));
    end if;
    return new;
  end if;

  if new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.care_gender is distinct from old.care_gender
     or new.deleted_at is distinct from old.deleted_at
     or new.user_id is distinct from old.user_id
     or new.email is distinct from old.email then
    raise exception 'Somente a lideranca altera papel, situacao, genero de cuidado ou acesso.'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;
create trigger profiles_guard_columns before update on public.profiles
  for each row execute function app.guard_profile_columns();

-- =========================================================== member_notes
grant select, insert, update on public.member_notes to authenticated;

create policy member_notes_read on public.member_notes
  for select to authenticated using (app.is_leadership());
create policy member_notes_write on public.member_notes
  for insert to authenticated with check (app.is_leader());
create policy member_notes_update on public.member_notes
  for update to authenticated using (app.is_leader()) with check (app.is_leader());

-- ======================================================= group_memberships
grant select on public.group_memberships to authenticated;
grant insert, update, delete on public.group_memberships to authenticated;

create policy memberships_read on public.group_memberships
  for select to authenticated using (app.is_active());
create policy memberships_write on public.group_memberships
  for all to authenticated using (app.is_leader()) with check (app.is_leader());

-- ====================================================== discipleship_links
grant select on public.discipleship_links to authenticated;
grant insert, update on public.discipleship_links to authenticated;

create policy discipleship_read on public.discipleship_links
  for select to authenticated
  using (
    app.is_leadership()
    or disciple_id = app.current_profile_id()
    or leader_id = app.current_profile_id()
  );
create policy discipleship_write on public.discipleship_links
  for all to authenticated using (app.is_leader()) with check (app.is_leader());

-- ==================================================== pairing_restrictions
grant select, insert, delete on public.pairing_restrictions to authenticated;

create policy pairing_read on public.pairing_restrictions
  for select to authenticated using (app.is_leadership());
create policy pairing_write on public.pairing_restrictions
  for all to authenticated using (app.is_leader()) with check (app.is_leader());

-- ============================================================== care_weeks
grant select on public.care_weeks to authenticated;

-- Rascunho e assunto da lideranca; o GC so ve a semana depois de publicada.
create policy care_weeks_read on public.care_weeks
  for select to authenticated
  using (app.is_leadership() or (app.is_active() and status in ('published', 'closed')));

-- Escrita acontece exclusivamente pelas funcoes de servidor.

-- ======================================================== care_assignments
grant select on public.care_assignments to authenticated;

-- A pessoa cuidada nao ve o registro do proprio acompanhamento.
create policy care_assignments_read on public.care_assignments
  for select to authenticated
  using (
    app.is_leadership()
    or caregiver_id = app.current_profile_id()
    or exists (
      select 1 from public.transfer_requests t
       where t.assignment_id = care_assignments.id
         and t.status = 'pending'
         and t.recipient_id = app.current_profile_id()
    )
  );

-- ============================================================ contact_logs
grant select on public.contact_logs to authenticated;

create policy contact_logs_read on public.contact_logs
  for select to authenticated
  using (app.is_leadership() or app.is_caregiver_of(assignment_id));

-- ======================================================= transfer_requests
grant select on public.transfer_requests to authenticated;

create policy transfer_requests_read on public.transfer_requests
  for select to authenticated
  using (
    app.is_leadership()
    or requester_id = app.current_profile_id()
    or recipient_id = app.current_profile_id()
  );

-- ============================================================== activities
grant select on public.activities to authenticated;
grant insert, update, delete on public.activities to authenticated;

-- Irmaos e irmas veem apenas as atividades sob sua responsabilidade.
create policy activities_read on public.activities
  for select to authenticated
  using (
    app.current_role() in ('leader', 'supervisor', 'disciple')
    or exists (
      select 1 from public.activity_assignees aa
       where aa.activity_id = activities.id and aa.profile_id = app.current_profile_id()
    )
  );

create policy activities_write_leader on public.activities
  for all to authenticated using (app.is_leader()) with check (app.is_leader());

-- Responsavel pode mover a propria atividade entre os status.
create policy activities_update_assignee on public.activities
  for update to authenticated
  using (
    exists (
      select 1 from public.activity_assignees aa
       where aa.activity_id = activities.id and aa.profile_id = app.current_profile_id()
    )
  )
  with check (
    exists (
      select 1 from public.activity_assignees aa
       where aa.activity_id = activities.id and aa.profile_id = app.current_profile_id()
    )
  );

grant select, insert, delete on public.activity_assignees to authenticated;

create policy activity_assignees_read on public.activity_assignees
  for select to authenticated using (app.is_active());
create policy activity_assignees_write on public.activity_assignees
  for all to authenticated using (app.is_leader()) with check (app.is_leader());

-- ==================================================== supervision_requests
grant select on public.supervision_requests to authenticated;
grant insert, update on public.supervision_requests to authenticated;

-- Solicitacao reservada nao aparece para lideres: nem o conteudo, nem a linha,
-- nem qualquer contagem derivada dela.
create policy supervision_requests_read on public.supervision_requests
  for select to authenticated
  using (
    requester_id = app.current_profile_id()
    or (app.is_supervisor() and (supervisor_id is null or supervisor_id = app.current_profile_id()))
    or (app.is_leader() and confidential_to_supervisors = false)
  );

create policy supervision_requests_insert on public.supervision_requests
  for insert to authenticated
  with check (requester_id = app.current_profile_id() and app.is_active());

create policy supervision_requests_update on public.supervision_requests
  for update to authenticated
  using (
    requester_id = app.current_profile_id()
    or (app.is_supervisor() and (supervisor_id is null or supervisor_id = app.current_profile_id()))
  )
  with check (
    requester_id = app.current_profile_id()
    or (app.is_supervisor() and (supervisor_id is null or supervisor_id = app.current_profile_id()))
  );

grant select, insert on public.supervision_notes to authenticated;

create policy supervision_notes_read on public.supervision_notes
  for select to authenticated using (app.is_supervisor());
create policy supervision_notes_insert on public.supervision_notes
  for insert to authenticated
  with check (app.is_supervisor() and supervisor_id = app.current_profile_id());

-- =========================================================== notificacoes
grant select, update on public.notifications to authenticated;

create policy notifications_read on public.notifications
  for select to authenticated using (profile_id = app.current_profile_id());
create policy notifications_update on public.notifications
  for update to authenticated
  using (profile_id = app.current_profile_id())
  with check (profile_id = app.current_profile_id());

-- =============================================================== auditoria
grant select on public.audit_logs to authenticated;

create policy audit_logs_read on public.audit_logs
  for select to authenticated using (app.is_leadership());

-- ================================================================ convites
grant select on public.invites to authenticated;

create policy invites_read on public.invites
  for select to authenticated using (app.is_leader());
