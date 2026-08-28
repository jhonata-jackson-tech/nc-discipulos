-- =============================================================================
-- Cuidar GC :: 0009 - notificacoes push (fora do app)
--
-- A central interna ja existe: tudo o que avisa alguem passa por `app.notify`,
-- que grava em `public.notifications`. O push nao inventa um segundo caminho -
-- ele escuta esse mesmo funil.
--
-- Um gatilho publica o aviso em `pg_notify` e o servico de push, que mantem um
-- LISTEN aberto, entrega no aparelho. Se o servico estiver fora do ar, a
-- notificacao interna continua gravada: o push e um empurrao, nunca a fonte.
-- =============================================================================

-- ------------------------------------------------------- aparelhos inscritos
-- Uma linha por navegador/aparelho. O mesmo integrante pode ter varios: o
-- celular, o computador de casa, o do trabalho.
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  -- URL que o navegador da para o servidor de push do fabricante. E unica por
  -- aparelho e e ela que identifica a inscricao.
  endpoint text not null unique,
  -- Chaves da criptografia ponta a ponta do Web Push: nem o servidor de push
  -- do fabricante le o conteudo da mensagem.
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);

create index if not exists push_subscriptions_profile_idx
  on public.push_subscriptions (profile_id);

alter table public.push_subscriptions enable row level security;

-- A pessoa le e apaga os proprios aparelhos. Gravar passa pela funcao abaixo,
-- que precisa enxergar alem da RLS para tomar posse de um aparelho.
grant select, delete on public.push_subscriptions to authenticated;

-- Cada pessoa enxerga e apaga apenas os proprios aparelhos. Nem a lideranca
-- ve a lista de quem instalou o app - isso nao e assunto de operacao do GC.
create policy push_subscriptions_own on public.push_subscriptions
  for select to authenticated using (profile_id = app.current_profile_id());

create policy push_subscriptions_delete on public.push_subscriptions
  for delete to authenticated using (profile_id = app.current_profile_id());

-- ------------------------------------------------------- registrar aparelho
/**
 * Um endpoint pertence a **uma** pessoa.
 *
 * O endpoint identifica o navegador, nao a conta. Num aparelho compartilhado -
 * o celular da casa, o computador da igreja - a segunda pessoa a ligar o aviso
 * receberia um erro, e a primeira continuaria recebendo notificacao no
 * aparelho que nao e mais dela. Por isso registrar um aparelho **toma posse**
 * dele: a inscricao anterior, de quem quer que seja, e descartada.
 *
 * E `security definer` exatamente por isso - apagar a linha de outra pessoa e
 * algo que a RLS, com razao, nao permitiria.
 */
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
begin
  if me is null or not app.is_active() then
    raise exception 'Sessao invalida.' using errcode = 'insufficient_privilege';
  end if;

  if btrim(coalesce(p_endpoint, '')) = ''
     or btrim(coalesce(p_p256dh, '')) = ''
     or btrim(coalesce(p_auth, '')) = '' then
    raise exception 'Inscricao incompleta.' using errcode = 'check_violation';
  end if;

  delete from public.push_subscriptions where endpoint = p_endpoint;

  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values (me, p_endpoint, p_p256dh, p_auth, p_user_agent);
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- ------------------------------------------------- o que sai para o aparelho
/**
 * Tudo o que o servico de push precisa saber, e nada alem disso.
 *
 * A regra do que pode aparecer numa tela de bloqueio mora aqui, ao lado do
 * dado, e nao no codigo que entrega: o **corpo nunca vai**. Os corpos citam
 * nomes ("A lideranca atribuiu o cuidado de Fulano a voce"), e quem passa pelo
 * lado ve a tela do celular. O titulo da supervisao vira generico pelo mesmo
 * motivo - ele denunciaria a existencia de uma conversa reservada.
 *
 * Assim o servico de entrega nunca precisa de permissao de leitura sobre
 * `notifications`: ele recebe bytes prontos.
 */
create or replace function app.push_targets(p_notification_id uuid)
returns table (
  subscription_id uuid,
  endpoint text,
  p256dh text,
  auth text,
  title text,
  body text,
  link text
)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select s.id,
         s.endpoint,
         s.p256dh,
         s.auth,
         case when n.type = 'supervision_updated' then 'Cuidar GC' else n.title end,
         case when n.type = 'supervision_updated'
              then 'Você tem um aviso novo.'
              else 'Toque para abrir o Cuidar GC.'
         end,
         coalesce(n.link, '/')
    from public.notifications n
    join public.push_subscriptions s on s.profile_id = n.profile_id
   where n.id = p_notification_id;
$$;

/** Resultado da entrega: renova o carimbo ou descarta o aparelho que sumiu. */
create or replace function app.push_result(p_subscription_id uuid, p_entregue boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if p_entregue then
    update public.push_subscriptions set last_success_at = now() where id = p_subscription_id;
  else
    delete from public.push_subscriptions where id = p_subscription_id;
  end if;
end;
$$;

-- Ninguem alcanca estas duas pela API: quem as executa e o servico de entrega,
-- com o papel de conexao dele (o grant vive em `db/roles.sql`).
revoke all on function app.push_targets(uuid) from public, anon, authenticated;
revoke all on function app.push_result(uuid, boolean) from public, anon, authenticated;

-- --------------------------------------------------------------- o gatilho
-- `pg_notify` tem um teto de 8000 bytes por mensagem, e o corpo da notificacao
-- pode citar nomes. Mandamos so o essencial para o servico localizar a linha -
-- o conteudo ele le do banco, ja decidindo o que pode aparecer numa tela de
-- bloqueio.
create or replace function app.announce_notification()
returns trigger
language plpgsql
as $$
begin
  perform pg_notify(
    'cuidar_notificacao',
    json_build_object(
      'notificationId', new.id,
      'profileId', new.profile_id,
      'type', new.type
    )::text
  );
  return new;
end;
$$;

drop trigger if exists notifications_announce on public.notifications;
create trigger notifications_announce after insert on public.notifications
  for each row execute function app.announce_notification();
