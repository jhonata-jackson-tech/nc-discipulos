-- =============================================================================
-- Cuidar GC :: 0007 - funcoes de servidor
--
-- Geracao da semana, transferencias, registro de contato e mudancas de papel
-- acontecem aqui, dentro de uma transacao, com verificacao de sessao e papel.
-- O frontend nunca aplica essas regras sozinho.
-- =============================================================================

-- ------------------------------------------------------------------ auxiliares
create or replace function app.notify(
  p_profile uuid,
  p_type public.notification_type,
  p_title text,
  p_body text default null,
  p_link text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_profile is null then return; end if;
  insert into public.notifications (profile_id, type, title, body, link)
  values (p_profile, p_type, p_title, p_body, p_link);
end;
$$;

create or replace function app.audit(
  p_action text,
  p_entity text,
  p_entity_id uuid,
  p_before jsonb default null,
  p_after jsonb default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, before, after, reason)
  values (app.current_profile_id(), p_action, p_entity, p_entity_id, p_before, p_after, p_reason);
end;
$$;

create or replace function app.require_leader()
returns uuid
language plpgsql
stable
as $$
declare
  me uuid := app.current_profile_id();
begin
  if not app.is_leader() then
    raise exception 'Esta acao e permitida somente a lideres.' using errcode = 'insufficient_privilege';
  end if;
  return me;
end;
$$;

-- ================================================================== convites
-- Emite o convite e devolve o token em claro uma unica vez. O banco guarda
-- apenas o hash.
create or replace function public.create_invite(p_profile_id uuid, p_email text)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.require_leader();
  -- Dois UUIDv4 concatenados: 244 bits de aleatoriedade, sem depender de
  -- extensao para gerar bytes.
  v_token text := replace(gen_random_uuid()::text, '-', '')
               || replace(gen_random_uuid()::text, '-', '');
  v_email text := lower(btrim(p_email));
  v_id uuid;
  v_expires timestamptz := now() + interval '14 days';
begin
  if v_email = '' or position('@' in v_email) = 0 then
    raise exception 'Informe um e-mail valido para o convite.' using errcode = 'check_violation';
  end if;

  if exists (select 1 from public.profiles where id = p_profile_id and user_id is not null) then
    raise exception 'Este integrante ja possui acesso ao sistema.' using errcode = 'check_violation';
  end if;

  update public.invites set status = 'revoked'
   where profile_id = p_profile_id and status = 'pending';

  update public.profiles set email = v_email where id = p_profile_id;

  insert into public.invites (profile_id, email, token_hash, created_by, expires_at)
  values (p_profile_id, v_email,
          encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), me, v_expires)
  returning id into v_id;

  perform app.audit('invite.created', 'invites', v_id, null,
                    jsonb_build_object('profile_id', p_profile_id, 'email', v_email));

  return query select v_id, v_token, v_expires;
end;
$$;

create or replace function public.revoke_invite(p_invite_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_leader();
  update public.invites set status = 'revoked' where id = p_invite_id and status = 'pending';
  perform app.audit('invite.revoked', 'invites', p_invite_id);
end;
$$;

-- Primeiro acesso absoluto do sistema. Só funciona enquanto nenhuma conta
-- estiver vinculada; deve ser executada com psql, direto no banco.
create or replace function public.create_bootstrap_invite(p_full_name text, p_email text)
returns table (invite_id uuid, token text, expires_at timestamptz)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_profile uuid;
  -- Dois UUIDv4 concatenados: 244 bits de aleatoriedade, sem depender de
  -- extensao para gerar bytes.
  v_token text := replace(gen_random_uuid()::text, '-', '')
               || replace(gen_random_uuid()::text, '-', '');
  v_email text := lower(btrim(p_email));
  v_id uuid;
  v_expires timestamptz := now() + interval '14 days';
begin
  if exists (select 1 from public.profiles where user_id is not null) then
    raise exception 'Ja existe acesso configurado. Use os convites dentro do sistema.'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_profile from public.profiles
   where lower(full_name) = lower(btrim(p_full_name)) and role = 'leader' and deleted_at is null;

  if v_profile is null then
    raise exception 'Nenhum lider chamado "%" foi encontrado.', p_full_name
      using errcode = 'no_data_found';
  end if;

  update public.profiles set email = v_email where id = v_profile;

  insert into public.invites (profile_id, email, token_hash, expires_at)
  values (v_profile, v_email, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_expires)
  returning id into v_id;

  return query select v_id, v_token, v_expires;
end;
$$;

revoke all on function public.create_bootstrap_invite(text, text) from public, anon, authenticated;

-- Vinculo entre a conta recem-criada e o integrante convidado. Sem convite
-- valido, o cadastro e recusado - nao existe registro publico.
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text := new.raw_user_meta_data ->> 'invite_token';
  v_invite public.invites;
begin
  if v_token is null or btrim(v_token) = '' then
    raise exception 'O cadastro no Cuidar GC acontece somente por convite.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_invite from public.invites
   where token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
     and status = 'pending'
     and expires_at > now();

  if not found then
    raise exception 'Convite invalido ou expirado. Peca um novo convite a lideranca.'
      using errcode = 'insufficient_privilege';
  end if;

  if lower(v_invite.email) is distinct from lower(new.email) then
    raise exception 'Este convite foi emitido para outro e-mail.'
      using errcode = 'insufficient_privilege';
  end if;

  update public.profiles set user_id = new.id, email = new.email where id = v_invite.profile_id;
  update public.invites set status = 'accepted', accepted_at = now() where id = v_invite.id;

  insert into public.audit_logs (actor_id, action, entity, entity_id, after)
  values (v_invite.profile_id, 'invite.accepted', 'invites', v_invite.id,
          jsonb_build_object('email', new.email));

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function app.handle_new_user();
