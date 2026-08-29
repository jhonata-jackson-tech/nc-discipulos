-- =============================================================================
-- Cuidar GC :: 0020 - o devocional, e quem pode mandar um aviso para todo mundo
--
-- Todo dia o pastor manda um devocional no grupo de lideranca do WhatsApp, e
-- ele autorizou repassar. Repassar no WhatsApp funciona mal: some no meio das
-- outras mensagens, ninguem acha o de anteontem, e nao da para saber se
-- alguem leu.
--
-- Aqui ele vira um texto com endereco proprio - autor, data, corpo - que
-- chega por push e fica numa lista. No fim, um "Amem": um gesto so, porque
-- quatro reacoes parecidas viram escolha de emoji em vez de resposta.
--
-- Duas coisas que este arquivo cria e que nao existiam:
--
-- 1. **Administrador.** Ate agora "lider" era o teto de permissao. Mandar um
--    aviso para os 33 celulares nao e operacao semanal - e uma decisao de quem
--    responde pelo sistema. Nem todo lider faz isso; e uma marca a parte, e
--    so quem ja a tem pode dar a outra pessoa.
-- 2. **Autor.** O devocional nao e escrito por um integrante do GC: o pastor
--    nao esta no cadastro, e nao deveria precisar estar para o texto dele
--    aparecer. Autor e uma entidade propria, com nome, titulo e retrato - e
--    por isso amanha pode ser outra pessoa sem mexer em uma linha de codigo.
-- =============================================================================

-- ------------------------------------------------------------- administrador
alter table public.profiles
  add column if not exists is_admin boolean not null default false;

comment on column public.profiles.is_admin is
  'Responde pelo sistema: publica devocional e concede a marca a outra pessoa. '
  'Nao e um papel - e uma marca sobre o papel que a pessoa ja tem.';

/**
 * A primeira administradora do sistema.
 *
 * Alguem precisa ser o primeiro, e nao ha tela que resolva isso: a marca so
 * pode ser concedida por quem ja a tem. Aqui ela nasce na lideranca que montou
 * o GC. Se o nome nao existir neste banco, nada acontece - e a migration
 * continua valendo para bancos novos.
 */
update public.profiles
   set is_admin = true
 where full_name = 'Jhonata Jackson'
   and role = 'leader'
   and deleted_at is null;

create or replace function app.is_admin()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select coalesce((select p.is_admin from public.profiles p
                    where p.user_id = auth.uid() and p.deleted_at is null
                    limit 1), false)
     and app.is_active();
$$;

/**
 * Conceder ou tirar a marca de administrador.
 *
 * So um administrador mexe nisso, e ninguem tira a propria: um sistema sem
 * nenhum administrador nao tem como voltar a ter um sem alguem abrir o banco.
 */
/**
 * A marca so muda por `public.definir_admin`.
 *
 * Sem esta trava ela nao valeria nada: `profiles_update_self` deixa qualquer
 * pessoa alterar a propria linha, e `profiles_update_leader` deixa um lider
 * alterar a de qualquer um. Uma chamada direta a tabela - pela API, sem passar
 * por tela nenhuma - bastaria para alguem se tornar administrador.
 *
 * O sinal e um parametro de sessao ligado dentro da funcao e valido apenas na
 * transacao dela: quem escreve direto na tabela nao tem como liga-lo.
 */
create or replace function app.protege_admin()
returns trigger
language plpgsql
as $$
begin
  -- O INSERT entra na conta pelo mesmo motivo: `profiles_insert` deixa um
  -- lider cadastrar gente, e cadastrar alguem ja administrador - para depois
  -- vincular a propria conta aquele integrante - daria na mesma coisa.
  if coalesce(current_setting('app.definindo_admin', true), '') = 'on' then
    return new;
  end if;

  if tg_op = 'INSERT' and coalesce(new.is_admin, false) then
    raise exception 'Um integrante nao nasce administrador.'
      using errcode = 'insufficient_privilege';
  end if;

  if tg_op = 'UPDATE' and new.is_admin is distinct from old.is_admin then
    raise exception 'A marca de administrador so muda por definir_admin().'
      using errcode = 'insufficient_privilege';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_protege_admin on public.profiles;
create trigger profiles_protege_admin before insert or update on public.profiles
  for each row execute function app.protege_admin();

create or replace function public.definir_admin(p_profile uuid, p_admin boolean)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
begin
  if not app.is_admin() then
    raise exception 'Somente um administrador altera isso.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_profile = me and not p_admin then
    raise exception 'Voce nao pode tirar a propria administracao.'
      using errcode = 'check_violation';
  end if;

  perform set_config('app.definindo_admin', 'on', true);
  update public.profiles set is_admin = coalesce(p_admin, false) where id = p_profile;
  perform set_config('app.definindo_admin', 'off', true);

  perform app.audit('profile.admin_changed', 'profiles', p_profile, null,
                    jsonb_build_object('is_admin', p_admin));
end;
$$;

revoke all on function public.definir_admin(uuid, boolean) from public, anon;
grant execute on function public.definir_admin(uuid, boolean) to authenticated;

-- -------------------------------------------------------------------- autores
create table if not exists public.devotional_authors (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) > 0),
  -- "Pastor", "Pastora", "Lider do GC". Entra antes do nome no aviso:
  -- "Pastor Felipe Mendes te mandou uma mensagem".
  title text,
  -- Retrato embutido, pelo mesmo motivo da foto de perfil: nao acrescenta
  -- servico de arquivos para manter, e entra no mesmo backup do resto.
  photo_url text check (photo_url is null or length(photo_url) <= 120000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists devotional_authors_touch on public.devotional_authors;
create trigger devotional_authors_touch before update on public.devotional_authors
  for each row execute function app.touch_updated_at();

/**
 * O comeco do texto, para o cartao da lista.
 *
 * Corta no espaco anterior ao limite: "ora por um filho que ainda na" e pior
 * do que uma frase a menos.
 */
create or replace function app.resumo(p_texto text, p_limite int default 180)
returns text
language sql
immutable
as $$
  select case when length(t.limpo) <= p_limite then t.limpo
              else regexp_replace(left(t.limpo, p_limite), '\s+\S*$', '') || '…'
         end
    from (select regexp_replace(btrim(p_texto), '\s+', ' ', 'g') as limpo) t;
$$;

/** Como o autor assina: "Pastor Felipe Mendes", ou so o nome quando nao ha titulo. */
create or replace function public.author_label(a public.devotional_authors)
returns text
language sql
immutable
as $$
  select btrim(coalesce(nullif(btrim(a.title), '') || ' ', '') || btrim(a.name));
$$;

-- ---------------------------------------------------------------- devocionais
do $$ begin
  create type public.devotional_audience as enum ('todos', 'lideranca_discipulos', 'lideranca');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.devotional_status as enum ('draft', 'published');
exception when duplicate_object then null; end $$;

create table if not exists public.devotionals (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.devotional_authors (id) on delete restrict,
  title text not null check (length(btrim(title)) > 0),
  -- Texto corrido, como chega no WhatsApp: paragrafos separados por linha em
  -- branco. A tela cuida da leitura; o banco guarda o que foi escrito.
  body text not null check (length(btrim(body)) > 0),
  audience public.devotional_audience not null default 'todos',
  status public.devotional_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devotionals_publicados_idx
  on public.devotionals (published_at desc) where status = 'published';

drop trigger if exists devotionals_touch on public.devotionals;
create trigger devotionals_touch before update on public.devotionals
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------- amem
-- Uma linha por pessoa por devocional: "Amem" nao se da duas vezes.
create table if not exists public.devotional_amens (
  devotional_id uuid not null references public.devotionals (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (devotional_id, profile_id)
);

create index if not exists devotional_amens_perfil_idx
  on public.devotional_amens (profile_id);

-- ============================================================= quem ve o que
alter table public.devotional_authors enable row level security;
alter table public.devotionals enable row level security;
alter table public.devotional_amens enable row level security;

grant select on public.devotional_authors to authenticated;
grant select on public.devotionals to authenticated;
grant select, insert, delete on public.devotional_amens to authenticated;

-- O autor e publico dentro do GC: e o nome e o retrato que assinam o texto.
-- Escrever passa pelas funcoes abaixo, que exigem administrador.
drop policy if exists devotional_authors_read on public.devotional_authors;
create policy devotional_authors_read on public.devotional_authors
  for select to authenticated using (app.is_active());

/**
 * O alcance de um devocional.
 *
 * O pastor autorizou repassar o que ele manda no grupo de lideranca - mas nem
 * todo texto que um dia chegue aqui tera a mesma permissao. Por isso o alcance
 * e escolhido a cada publicacao, e a regra mora no banco: uma tela que
 * esquecesse de filtrar nao vazaria nada.
 */
create or replace function app.alcanca_devocional(p_audience public.devotional_audience)
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select app.is_active() and case p_audience
           when 'todos' then true
           when 'lideranca_discipulos' then app.current_role() in ('leader', 'supervisor', 'disciple')
           when 'lideranca' then app.current_role() in ('leader', 'supervisor')
         end;
$$;

-- Rascunho e coisa de quem escreve: ninguem mais ve, nem sabe que existe.
drop policy if exists devotionals_read on public.devotionals;
create policy devotionals_read on public.devotionals
  for select to authenticated
  using (
    app.is_admin()
    or (status = 'published' and app.alcanca_devocional(audience))
  );

-- Cada pessoa enxerga apenas o proprio "Amem". A contagem vem das funcoes de
-- leitura, mais abaixo: saber que 23 pessoas concordaram e util, saber *quem*
-- concordou nao e - e transformaria um gesto de fe em lista de presenca.
drop policy if exists devotional_amens_read on public.devotional_amens;
create policy devotional_amens_read on public.devotional_amens
  for select to authenticated using (profile_id = app.current_profile_id());

drop policy if exists devotional_amens_write on public.devotional_amens;
create policy devotional_amens_write on public.devotional_amens
  for insert to authenticated
  with check (
    profile_id = app.current_profile_id()
    and exists (select 1 from public.devotionals d
                 where d.id = devotional_id and d.status = 'published')
  );

drop policy if exists devotional_amens_delete on public.devotional_amens;
create policy devotional_amens_delete on public.devotional_amens
  for delete to authenticated using (profile_id = app.current_profile_id());

-- ==================================================================== escrever
/** Cria ou atualiza um autor. Somente administrador. */
create or replace function public.salvar_autor(
  p_id uuid,
  p_name text,
  p_title text,
  p_photo_url text,
  p_active boolean default true
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
begin
  if not app.is_admin() then
    raise exception 'Somente um administrador altera os autores.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_id is null then
    insert into public.devotional_authors (name, title, photo_url, active)
    values (btrim(p_name), nullif(btrim(coalesce(p_title, '')), ''), p_photo_url,
            coalesce(p_active, true))
    returning id into v_id;
  else
    update public.devotional_authors
       set name = btrim(p_name),
           title = nullif(btrim(coalesce(p_title, '')), ''),
           -- Texto vazio apaga o retrato; nulo mantem o que ja estava.
           photo_url = case when p_photo_url is null then photo_url
                            when p_photo_url = '' then null
                            else p_photo_url end,
           active = coalesce(p_active, active)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Autor nao encontrado.' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function public.salvar_autor(uuid, text, text, text, boolean) from public, anon;
grant execute on function public.salvar_autor(uuid, text, text, text, boolean) to authenticated;

/**
 * Cria ou edita o devocional. Nasce e continua rascunho: publicar e outro
 * gesto, de proposito - um envio alcanca 33 celulares e nao tem como voltar
 * atras.
 */
create or replace function public.salvar_devocional(
  p_id uuid,
  p_author_id uuid,
  p_title text,
  p_body text,
  p_audience public.devotional_audience
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
  v_id uuid;
begin
  if not app.is_admin() then
    raise exception 'Somente um administrador publica devocionais.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_id is null then
    insert into public.devotionals (author_id, title, body, audience, created_by)
    values (p_author_id, btrim(p_title), btrim(p_body),
            coalesce(p_audience, 'todos'), me)
    returning id into v_id;
  else
    update public.devotionals
       set author_id = p_author_id,
           title = btrim(p_title),
           body = btrim(p_body),
           audience = coalesce(p_audience, audience)
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Devocional nao encontrado.' using errcode = 'no_data_found';
    end if;
  end if;

  return v_id;
end;
$$;

revoke all on function
  public.salvar_devocional(uuid, uuid, text, text, public.devotional_audience)
  from public, anon;
grant execute on function
  public.salvar_devocional(uuid, uuid, text, text, public.devotional_audience)
  to authenticated;

/**
 * Publica: e aqui que o aviso sai.
 *
 * O titulo do aviso e a frase que a pessoa le na tela de bloqueio - "Pastor
 * Felipe Mendes te mandou uma mensagem". Ela nao denuncia nada de ninguem, e
 * por isso este e o unico tipo de aviso cujo corpo pode aparecer por fora do
 * app (veja `app.push_targets`).
 *
 * Publicar duas vezes nao manda o aviso duas vezes: quem ja publicou so esta
 * corrigindo o texto, e receber o mesmo devocional de novo ensina a ignorar.
 */
create or replace function public.publicar_devocional(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_dev public.devotionals;
  v_autor public.devotional_authors;
  v_assinatura text;
begin
  if not app.is_admin() then
    raise exception 'Somente um administrador publica devocionais.'
      using errcode = 'insufficient_privilege';
  end if;

  select * into v_dev from public.devotionals where id = p_id;
  if v_dev.id is null then
    raise exception 'Devocional nao encontrado.' using errcode = 'no_data_found';
  end if;

  if v_dev.status = 'published' then
    return;
  end if;

  select * into v_autor from public.devotional_authors where id = v_dev.author_id;
  v_assinatura := public.author_label(v_autor);

  update public.devotionals
     set status = 'published', published_at = now()
   where id = p_id;

  perform app.notify(
    p.id,
    'devotional'::public.notification_type,
    format('%s te mandou uma mensagem', v_assinatura),
    v_dev.title,
    '/devocionais/' || p_id)
    from public.profiles p
   where p.status = 'active' and p.deleted_at is null
     -- Menos quem publicou: receber aviso do que voce acabou de fazer e o
     -- caminho mais curto para parar de ler os avisos.
     and p.id is distinct from app.current_profile_id()
     and case v_dev.audience
           when 'todos' then true
           when 'lideranca_discipulos' then p.role in ('leader', 'supervisor', 'disciple')
           when 'lideranca' then p.role in ('leader', 'supervisor')
         end;

  perform app.audit('devotional.published', 'devotionals', p_id, null,
                    jsonb_build_object('audience', v_dev.audience, 'autor', v_assinatura));
end;
$$;

revoke all on function public.publicar_devocional(uuid) from public, anon;
grant execute on function public.publicar_devocional(uuid) to authenticated;

/** Apagar um devocional. Os "Amem" vao junto, por cascata. */
create or replace function public.apagar_devocional(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app.is_admin() then
    raise exception 'Somente um administrador apaga devocionais.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.devotionals where id = p_id;
  perform app.audit('devotional.deleted', 'devotionals', p_id, null, null);
end;
$$;

revoke all on function public.apagar_devocional(uuid) from public, anon;
grant execute on function public.apagar_devocional(uuid) to authenticated;

-- ==================================================================== o aviso
-- O valor novo entra aqui, sozinho: o Postgres so permite **usar** um valor
-- recem-adicionado depois que a transacao fecha. Por isso ele aparece adiante
-- apenas dentro de corpos de funcao, avaliados na hora da chamada.
alter type public.notification_type add value if not exists 'devotional';

-- =============================================================== ler a lista
/**
 * Os devocionais que esta pessoa alcanca.
 *
 * Uma chamada devolve tudo o que a lista precisa - autor, resumo e quantos
 * disseram "Amem" - porque a contagem nao pode sair da tabela: cada pessoa so
 * enxerga o proprio "Amem", e e assim que fica.
 *
 * `security definer` por isso, e a guarda de alcance esta na consulta: um
 * rascunho so aparece para administrador, e um devocional reservado a
 * lideranca nao vaza para o resto do GC.
 */
create or replace function public.devocionais()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(linha order by ordem desc), '[]'::jsonb)
    from (
      select coalesce(d.published_at, d.created_at) as ordem,
             jsonb_build_object(
               'id', d.id,
               'titulo', d.title,
               -- O suficiente para reconhecer o texto na lista, sem obrigar a
               -- carregar oito paragrafos por cartao.
               'resumo', app.resumo(d.body),
               'alcance', d.audience,
               'situacao', d.status,
               'publicadoEm', d.published_at,
               -- So o identificador e a assinatura: o retrato tem 18 KB e e o
               -- mesmo em todos os cartoes. A tela le os autores uma vez, de
               -- `devotional_authors`, e o navegador guarda a imagem - em vez
               -- de baixar o mesmo rosto trinta vezes no 4G de alguem.
               'autorId', a.id,
               'assinatura', public.author_label(a),
               'amens', (select count(*) from public.devotional_amens m
                          where m.devotional_id = d.id),
               'euAmem', exists (select 1 from public.devotional_amens m
                                  where m.devotional_id = d.id
                                    and m.profile_id = app.current_profile_id())
             ) as linha
        from public.devotionals d
        join public.devotional_authors a on a.id = d.author_id
       where app.is_admin()
          or (d.status = 'published' and app.alcanca_devocional(d.audience))
    ) lista;
$$;

revoke all on function public.devocionais() from public, anon;
grant execute on function public.devocionais() to authenticated;

/** Um devocional inteiro, com o corpo. Mesmo alcance da lista. */
create or replace function public.devocional(p_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'id', d.id,
           'titulo', d.title,
           'corpo', d.body,
           'alcance', d.audience,
           'situacao', d.status,
           'publicadoEm', d.published_at,
           'autorId', a.id,
           'assinatura', public.author_label(a),
           'amens', (select count(*) from public.devotional_amens m
                      where m.devotional_id = d.id),
           'euAmem', exists (select 1 from public.devotional_amens m
                              where m.devotional_id = d.id
                                and m.profile_id = app.current_profile_id())
         )
    from public.devotionals d
    join public.devotional_authors a on a.id = d.author_id
   where d.id = p_id
     and (app.is_admin()
          or (d.status = 'published' and app.alcanca_devocional(d.audience)));
$$;

revoke all on function public.devocional(uuid) from public, anon;
grant execute on function public.devocional(uuid) to authenticated;

/**
 * Diz (ou desdiz) "Amem".
 *
 * Um gesto so, que liga e desliga. A funcao existe para a tela nao precisar
 * saber o proprio identificador de integrante nem decidir entre gravar e
 * apagar - e para a contagem voltar na mesma ida.
 */
create or replace function public.amem_devocional(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
  v_audience public.devotional_audience;
  v_publicado boolean;
  v_tinha boolean;
begin
  select d.audience, d.status = 'published'
    into v_audience, v_publicado
    from public.devotionals d where d.id = p_id;

  if v_audience is null or not v_publicado or not app.alcanca_devocional(v_audience) then
    raise exception 'Este devocional nao esta disponivel para voce.'
      using errcode = 'insufficient_privilege';
  end if;

  delete from public.devotional_amens
   where devotional_id = p_id and profile_id = me;

  v_tinha := found;

  if not v_tinha then
    insert into public.devotional_amens (devotional_id, profile_id) values (p_id, me);
  end if;

  return jsonb_build_object(
    'euAmem', not v_tinha,
    'amens', (select count(*) from public.devotional_amens m where m.devotional_id = p_id));
end;
$$;

revoke all on function public.amem_devocional(uuid) from public, anon;
grant execute on function public.amem_devocional(uuid) to authenticated;

-- ============================================== o corpo que pode ser lido fora
/**
 * O devocional e a unica excecao a regra do corpo escondido.
 *
 * Todos os outros avisos citam pessoas ("A lideranca atribuiu o cuidado de
 * Fulano a voce"), e quem passa pelo lado ve a tela do celular - por isso o
 * corpo nunca sai. Um devocional nao denuncia ninguem: o titulo dele na tela
 * de bloqueio e o que faz a pessoa querer abrir.
 *
 * A comparacao e por texto de proposito: `'devotional'` acabou de entrar no
 * enum, e o Postgres nao deixa usar o valor novo na mesma transacao.
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
         case when n.type::text = 'supervision_updated' then 'Discípulos' else n.title end,
         case n.type::text
           when 'supervision_updated' then 'Você tem um aviso novo.'
           when 'devotional' then coalesce(nullif(btrim(n.body), ''), 'Toque para abrir o Discípulos.')
           else 'Toque para abrir o Discípulos.'
         end,
         coalesce(n.link, '/')
    from public.notifications n
    join public.push_subscriptions s on s.profile_id = n.profile_id
   where n.id = p_notification_id;
$$;

revoke all on function app.push_targets(uuid) from public, anon, authenticated;

-- ================================================================== o primeiro
-- O pastor que ja manda o devocional todo dia no grupo da lideranca. Ele nao
-- e integrante do GC, e nao precisa ser para o texto dele chegar aqui - e
-- exatamente por isso o autor e uma entidade propria.
insert into public.devotional_authors (name, title, photo_url)
select 'Felipe Mendes', 'Pastor', 'data:image/jpeg;base64,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'
 where not exists (select 1 from public.devotional_authors a where a.name = 'Felipe Mendes');
