-- =============================================================================
-- Cuidar GC :: 0026 - o talk da semana
--
-- Toda semana a igreja manda o material do GC: o PDF do talk, a arte, uma
-- playlist no Spotify e outra no YouTube. Hoje isso chega pelo WhatsApp e se
-- perde do mesmo jeito que o devocional se perdia - e, pior, fica solto num
-- grupo onde nem todo mundo deveria ter o roteiro antes do encontro.
--
-- Aqui o talk ganha endereco: tema, serie, a semana a que pertence, o PDF, a
-- arte e as playlists, com historico. So quem conduz o GC alcanca - lideres,
-- supervisores e discipulos. Irmaos e irmas vivem o talk na sala, nao leem o
-- roteiro antes.
--
-- **Os arquivos moram no banco**, como a foto de perfil. Um PDF de 6 MB por
-- semana da uns 300 MB por ano: e uma escolha, pelo mesmo motivo de sempre -
-- nenhum servico de arquivos a mais para manter e proteger, e o mesmo backup
-- restaura o texto e o material. Se um dia pesar, a tabela `talk_arquivos` e o
-- unico lugar a mudar.
-- =============================================================================

do $$ begin
  create type public.talk_status as enum ('draft', 'published');
exception when duplicate_object then null; end $$;

create table if not exists public.talks (
  id uuid primary key default gen_random_uuid(),
  -- "Tema 8". Opcional: nem toda serie numera.
  numero int check (numero is null or numero > 0),
  tema text not null check (length(btrim(tema)) > 0),
  -- "Serie 3 · Alegria - a moeda do Reino para governar"
  serie text,
  -- A semana do GC a que o talk pertence. E ela que ordena o historico, e nao a
  -- data de publicacao: o material as vezes chega antes, as vezes em cima.
  semana_de date not null,
  -- Um recado de quem publica: "atencao a pergunta 3", "a dinamica e no fim".
  mensagem text,
  spotify_url text check (spotify_url is null or spotify_url ~* '^https://([a-z0-9-]+\.)*spotify\.com/'),
  youtube_url text check (youtube_url is null or youtube_url ~* '^https://([a-z0-9-]+\.)*(youtube\.com|youtu\.be)/'),
  status public.talk_status not null default 'draft',
  published_at timestamptz,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists talks_semana_idx on public.talks (semana_de desc);

drop trigger if exists talks_touch on public.talks;
create trigger talks_touch before update on public.talks
  for each row execute function app.touch_updated_at();

/**
 * Os arquivos de um talk, um por tipo.
 *
 * `capa` e a arte reduzida, gerada no navegador de quem publica: e ela que
 * aparece no historico. Sem isso a lista de um ano de talks baixaria 52 artes
 * inteiras no 4G de alguem para mostrar miniaturas de 120px.
 */
create table if not exists public.talk_arquivos (
  talk_id uuid not null references public.talks (id) on delete cascade,
  tipo text not null check (tipo in ('pdf', 'arte', 'capa')),
  mime text not null,
  nome text,
  tamanho int not null,
  conteudo bytea not null,
  atualizado_em timestamptz not null default now(),
  primary key (talk_id, tipo),
  constraint talk_arquivo_formato check (
    (tipo = 'pdf' and mime = 'application/pdf' and tamanho <= 25 * 1024 * 1024)
    or (tipo = 'arte' and mime in ('image/jpeg', 'image/png', 'image/webp')
        and tamanho <= 2 * 1024 * 1024)
    or (tipo = 'capa' and mime in ('image/jpeg', 'image/png', 'image/webp')
        and tamanho <= 250 * 1024)
  ),
  constraint talk_arquivo_tamanho_real check (tamanho = octet_length(conteudo))
);

/**
 * Quem abriu o talk.
 *
 * Diferente do "Amem" do devocional, aqui a lideranca ve os nomes. O talk e
 * material de trabalho de quem conduz o GC: saber que um discipulo ainda nao
 * abriu o roteiro na quarta a noite e o que permite ligar para ele antes de
 * quinta - e nao expoe nada da vida de ninguem.
 */
create table if not exists public.talk_aberturas (
  talk_id uuid not null references public.talks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primeira_vez timestamptz not null default now(),
  ultima_vez timestamptz not null default now(),
  primary key (talk_id, profile_id)
);

-- ============================================================= quem ve o que
/** Quem conduz o GC. E a mesma regra para ver, abrir e ser avisado. */
create or replace function app.alcanca_talk()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select app.is_active() and app.current_role() in ('leader', 'supervisor', 'disciple');
$$;

grant execute on function app.alcanca_talk() to authenticated;

alter table public.talks enable row level security;
alter table public.talk_arquivos enable row level security;
alter table public.talk_aberturas enable row level security;

-- A leitura acontece pelas funcoes abaixo. A politica existe para uma chamada
-- direta a tabela, pela API, nao mostrar mais do que a tela mostraria.
grant select on public.talks to authenticated;

drop policy if exists talks_read on public.talks;
create policy talks_read on public.talks
  for select to authenticated
  using (app.is_leader() or (status = 'published' and app.alcanca_talk()));

-- `talk_arquivos` e `talk_aberturas` nao tem grant nenhum: os bytes so saem
-- por `arquivo_talk`, e as aberturas so pelas funcoes de leitura.

-- ================================================================= escrever
create or replace function public.salvar_talk(
  p_id uuid,
  p_numero int,
  p_tema text,
  p_serie text,
  p_semana_de date,
  p_mensagem text,
  p_spotify_url text,
  p_youtube_url text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.require_leader();
  v_id uuid;
begin
  if p_semana_de is null then
    raise exception 'Informe a semana do talk.' using errcode = 'check_violation';
  end if;

  if p_id is null then
    insert into public.talks (numero, tema, serie, semana_de, mensagem,
                              spotify_url, youtube_url, created_by)
    values (p_numero, btrim(p_tema), nullif(btrim(coalesce(p_serie, '')), ''), p_semana_de,
            nullif(btrim(coalesce(p_mensagem, '')), ''),
            nullif(btrim(coalesce(p_spotify_url, '')), ''),
            nullif(btrim(coalesce(p_youtube_url, '')), ''), me)
    returning id into v_id;
  else
    update public.talks
       set numero = p_numero,
           tema = btrim(p_tema),
           serie = nullif(btrim(coalesce(p_serie, '')), ''),
           semana_de = p_semana_de,
           mensagem = nullif(btrim(coalesce(p_mensagem, '')), ''),
           spotify_url = nullif(btrim(coalesce(p_spotify_url, '')), ''),
           youtube_url = nullif(btrim(coalesce(p_youtube_url, '')), '')
     where id = p_id
    returning id into v_id;

    if v_id is null then
      raise exception 'Talk nao encontrado.' using errcode = 'no_data_found';
    end if;
  end if;

  perform app.audit(case when p_id is null then 'talk.created' else 'talk.updated' end,
                    'talks', v_id, null, jsonb_build_object('tema', btrim(p_tema)));
  return v_id;
end;
$$;

revoke all on function public.salvar_talk(uuid, int, text, text, date, text, text, text) from public, anon;
grant execute on function public.salvar_talk(uuid, int, text, text, date, text, text, text) to authenticated;

/**
 * Grava um arquivo do talk. Chamada pelo servico de arquivos, com a identidade
 * de quem enviou - quem confere que e lider e esta funcao, nao o servico.
 */
create or replace function public.salvar_arquivo_talk(
  p_talk_id uuid,
  p_tipo text,
  p_mime text,
  p_nome text,
  p_conteudo bytea
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_leader();

  if not exists (select 1 from public.talks where id = p_talk_id) then
    raise exception 'Talk nao encontrado.' using errcode = 'no_data_found';
  end if;

  insert into public.talk_arquivos (talk_id, tipo, mime, nome, tamanho, conteudo)
  values (p_talk_id, p_tipo, p_mime, nullif(btrim(coalesce(p_nome, '')), ''),
          octet_length(p_conteudo), p_conteudo)
  on conflict (talk_id, tipo) do update
     set mime = excluded.mime,
         nome = excluded.nome,
         tamanho = excluded.tamanho,
         conteudo = excluded.conteudo,
         atualizado_em = now();

  perform app.audit('talk.file_saved', 'talks', p_talk_id, null,
                    jsonb_build_object('tipo', p_tipo, 'tamanho', octet_length(p_conteudo)));
end;
$$;

revoke all on function public.salvar_arquivo_talk(uuid, text, text, text, bytea) from public, anon;
grant execute on function public.salvar_arquivo_talk(uuid, text, text, text, bytea) to authenticated;

create or replace function public.apagar_arquivo_talk(p_talk_id uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_leader();
  -- Tirar a arte leva a miniatura junto: uma capa sem a arte que ela resume
  -- mostraria no historico uma imagem que ninguem consegue abrir.
  delete from public.talk_arquivos
   where talk_id = p_talk_id
     and (tipo = p_tipo or (p_tipo = 'arte' and tipo = 'capa'));
end;
$$;

revoke all on function public.apagar_arquivo_talk(uuid, text) from public, anon;
grant execute on function public.apagar_arquivo_talk(uuid, text) to authenticated;

/**
 * Publica e avisa quem conduz o GC.
 *
 * Sem PDF nao publica: o aviso diz "o talk da semana chegou", e abrir e nao
 * encontrar o material ensina a nao abrir o proximo. Publicar de novo nao
 * reenvia o aviso - quem publica duas vezes esta corrigindo, nao anunciando.
 */
create or replace function public.publicar_talk(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_talk public.talks;
begin
  perform app.require_leader();

  select * into v_talk from public.talks where id = p_id for update;
  if v_talk.id is null then
    raise exception 'Talk nao encontrado.' using errcode = 'no_data_found';
  end if;

  if v_talk.status = 'published' then
    return;
  end if;

  if not exists (select 1 from public.talk_arquivos where talk_id = p_id and tipo = 'pdf') then
    raise exception 'Anexe o PDF do talk antes de publicar.' using errcode = 'check_violation';
  end if;

  update public.talks set status = 'published', published_at = now() where id = p_id;

  -- Quem publicou tambem recebe: ele conduz o GC como os outros, e o aviso e o
  -- atalho para o material na semana.
  perform app.notify(
    p.id,
    'talk'::public.notification_type,
    'O talk da semana chegou',
    concat_ws(' · ', case when v_talk.numero is not null then 'Tema ' || v_talk.numero end,
              v_talk.tema),
    '/talks/' || p_id)
    from public.profiles p
   where p.status = 'active' and p.deleted_at is null
     and p.role in ('leader', 'supervisor', 'disciple');

  perform app.audit('talk.published', 'talks', p_id, null,
                    jsonb_build_object('tema', v_talk.tema));
end;
$$;

revoke all on function public.publicar_talk(uuid) from public, anon;
grant execute on function public.publicar_talk(uuid) to authenticated;

create or replace function public.apagar_talk(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform app.require_leader();
  delete from public.talks where id = p_id;
  perform app.audit('talk.deleted', 'talks', p_id, null, null);
end;
$$;

revoke all on function public.apagar_talk(uuid) from public, anon;
grant execute on function public.apagar_talk(uuid) to authenticated;

-- ==================================================================== ler
/**
 * O historico de talks que esta pessoa alcanca.
 *
 * Sem os bytes: so o que o cartao precisa, e a versao de cada arquivo - que a
 * tela poe no endereco da imagem para o navegador guardar a capa ate ela
 * mudar de verdade.
 */
create or replace function public.lista_talks()
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_agg(linha order by semana desc, criado desc), '[]'::jsonb)
    from (
      select t.semana_de as semana, t.created_at as criado,
             jsonb_build_object(
               'id', t.id,
               'numero', t.numero,
               'tema', t.tema,
               'serie', t.serie,
               'semanaDe', t.semana_de,
               'situacao', t.status,
               'publicadoEm', t.published_at,
               'spotifyUrl', t.spotify_url,
               'youtubeUrl', t.youtube_url,
               'arquivos', coalesce((
                 select jsonb_object_agg(f.tipo, jsonb_build_object(
                          'nome', f.nome,
                          'tamanho', f.tamanho,
                          'versao', floor(extract(epoch from f.atualizado_em))::bigint))
                   from public.talk_arquivos f where f.talk_id = t.id
               ), '{}'::jsonb),
               'euAbri', exists (select 1 from public.talk_aberturas ab
                                  where ab.talk_id = t.id
                                    and ab.profile_id = app.current_profile_id()),
               -- A contagem so para quem lidera; os nomes vem na tela do talk.
               'aberturas', case when app.is_leadership()
                                 then (select count(*) from public.talk_aberturas ab
                                        where ab.talk_id = t.id)
                            end
             ) as linha
        from public.talks t
       where app.is_leader()
          or (t.status = 'published' and app.alcanca_talk())
    ) lista;
$$;

revoke all on function public.lista_talks() from public, anon;
grant execute on function public.lista_talks() to authenticated;

create or replace function public.talk(p_id uuid)
returns jsonb
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
           'id', t.id,
           'numero', t.numero,
           'tema', t.tema,
           'serie', t.serie,
           'semanaDe', t.semana_de,
           'mensagem', t.mensagem,
           'situacao', t.status,
           'publicadoEm', t.published_at,
           'spotifyUrl', t.spotify_url,
           'youtubeUrl', t.youtube_url,
           'arquivos', coalesce((
             select jsonb_object_agg(f.tipo, jsonb_build_object(
                      'nome', f.nome,
                      'tamanho', f.tamanho,
                      'versao', floor(extract(epoch from f.atualizado_em))::bigint))
               from public.talk_arquivos f where f.talk_id = t.id
           ), '{}'::jsonb),
           'euAbri', exists (select 1 from public.talk_aberturas ab
                              where ab.talk_id = t.id
                                and ab.profile_id = app.current_profile_id()),
           -- Quem conduz o GC e ja abriu, e quem ainda nao. So para a lideranca.
           'leituras', case when app.is_leadership() then coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', p.id,
                      'nome', public.display_name(p),
                      'nomeCompleto', p.full_name,
                      'papel', p.role,
                      'abriuEm', ab.primeira_vez
                    ) order by ab.primeira_vez nulls last, p.full_name)
               from public.profiles p
               left join public.talk_aberturas ab on ab.talk_id = t.id and ab.profile_id = p.id
              where p.status = 'active' and p.deleted_at is null
                and p.role in ('leader', 'disciple')
           ), '[]'::jsonb) end
         )
    from public.talks t
   where t.id = p_id
     and (app.is_leader() or (t.status = 'published' and app.alcanca_talk()));
$$;

revoke all on function public.talk(uuid) from public, anon;
grant execute on function public.talk(uuid) to authenticated;

/**
 * Os bytes de um arquivo, com a mesma guarda da leitura.
 *
 * Chamada pelo servico de arquivos com a identidade de quem pediu. Rascunho so
 * sai para lider; o resto, so para quem alcanca o talk.
 */
create or replace function public.arquivo_talk(p_talk_id uuid, p_tipo text)
returns table (mime text, nome text, tamanho int, conteudo bytea, atualizado_em timestamptz)
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select f.mime, f.nome, f.tamanho, f.conteudo, f.atualizado_em
    from public.talk_arquivos f
    join public.talks t on t.id = f.talk_id
   where f.talk_id = p_talk_id
     and f.tipo = p_tipo
     and (app.is_leader() or (t.status = 'published' and app.alcanca_talk()));
$$;

revoke all on function public.arquivo_talk(uuid, text) from public, anon;
grant execute on function public.arquivo_talk(uuid, text) to authenticated;

/** Marca que a pessoa abriu o talk. Rascunho nao conta. */
create or replace function public.abrir_talk(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
begin
  if me is null or not app.alcanca_talk() then
    return;
  end if;

  if not exists (select 1 from public.talks where id = p_id and status = 'published') then
    return;
  end if;

  insert into public.talk_aberturas (talk_id, profile_id) values (p_id, me)
  on conflict (talk_id, profile_id) do update set ultima_vez = now();
end;
$$;

revoke all on function public.abrir_talk(uuid) from public, anon;
grant execute on function public.abrir_talk(uuid) to authenticated;

-- ==================================================================== o aviso
-- Mesmo cuidado da 0020: o valor novo so e usado dentro de corpos de funcao
-- plpgsql, avaliados na hora da chamada, depois que esta transacao fechou.
alter type public.notification_type add value if not exists 'talk';

/**
 * O talk entra na excecao do devocional: o tema na tela de bloqueio nao
 * denuncia ninguem, e e o que faz a pessoa querer abrir.
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
           when 'talk' then coalesce(nullif(btrim(n.body), ''), 'Toque para abrir o Discípulos.')
           else 'Toque para abrir o Discípulos.'
         end,
         coalesce(n.link, '/')
    from public.notifications n
    join public.push_subscriptions s on s.profile_id = n.profile_id
   where n.id = p_notification_id;
$$;

revoke all on function app.push_targets(uuid) from public, anon, authenticated;
