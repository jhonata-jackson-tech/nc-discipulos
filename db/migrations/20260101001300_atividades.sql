-- =============================================================================
-- Cuidar GC :: 0013 - a atividade tem dono, e o dono responde
--
-- Antes a atividade tinha situacao ("a fazer", "em andamento", "concluida") e
-- qualquer um marcava. Isso descrevia a atividade, nao o combinado: a
-- lideranca indicava alguem para o lanche e ficava sem saber se a pessoa viu,
-- se pode, se topou.
--
-- Agora a unica resposta que importa e o aceite. Quem foi indicado aceita ou
-- recusa - recusando, diz por que, para a lideranca poder repassar sabendo do
-- motivo. A situacao antiga sai da tela.
-- =============================================================================

drop type if exists public.activity_response cascade;
create type public.activity_response as enum ('pendente', 'aceita', 'recusada');

alter table public.activity_assignees
  add column if not exists response public.activity_response not null default 'pendente',
  add column if not exists responded_at timestamptz,
  add column if not exists justification text;

comment on column public.activity_assignees.justification is
  'Obrigatoria ao recusar: a lideranca precisa saber o motivo para repassar bem.';

-- Trocar de responsavel zera a resposta: quem entra agora ainda nao respondeu.
create or replace function app.reset_activity_response()
returns trigger
language plpgsql
as $$
begin
  new.response := 'pendente';
  new.responded_at := null;
  new.justification := null;
  return new;
end;
$$;

drop trigger if exists activity_assignees_reset on public.activity_assignees;
create trigger activity_assignees_reset before insert on public.activity_assignees
  for each row execute function app.reset_activity_response();

-- ------------------------------------------------------------ aceitar/recusar
/**
 * Resposta de quem foi indicado.
 *
 * A justificativa e exigida aqui, no banco, e nao so na tela: uma recusa sem
 * motivo obriga a lideranca a perguntar de novo, e a informacao se perde no
 * WhatsApp. Os lideres recebem aviso nos dois casos - aceite tambem e
 * informacao, porque o que nao chega e o que preocupa.
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

  update public.activity_assignees
     set response = case when p_accept then 'aceita' else 'recusada' end,
         responded_at = now(),
         justification = case when p_accept then null else v_motivo end
   where activity_id = p_activity_id and profile_id = me;

  select full_name into v_nome from public.profiles where id = me;
  select title into v_titulo from public.activities where id = p_activity_id;

  perform app.notify(
    p.id,
    'activity_assigned',
    case when p_accept then 'Atividade aceita' else 'Atividade recusada' end,
    case when p_accept
         then format('%s aceitou "%s".', v_nome, v_titulo)
         else format('%s recusou "%s": %s', v_nome, v_titulo, v_motivo)
    end,
    '/atividades')
    from public.profiles p
   where p.role = 'leader' and p.status = 'active' and p.deleted_at is null;

  perform app.audit(
    case when p_accept then 'activity.accepted' else 'activity.declined' end,
    'activities', p_activity_id, null,
    jsonb_build_object('profile', me, 'justification', v_motivo));
end;
$$;

revoke all on function public.respond_activity(uuid, boolean, text) from public, anon;
grant execute on function public.respond_activity(uuid, boolean, text) to authenticated;

-- Quem foi indicado precisa poder registrar a propria resposta.
grant update on public.activity_assignees to authenticated;

drop policy if exists activity_assignees_respond on public.activity_assignees;
create policy activity_assignees_respond on public.activity_assignees
  for update to authenticated
  using (profile_id = app.current_profile_id())
  with check (profile_id = app.current_profile_id());
