-- =============================================================================
-- Cuidar GC :: 0028 - os arquivos do talk saem do banco, e os links saem da trava
--
-- 1. **Arquivos.** A 0026 guardava o PDF e a arte no banco, dizendo que se um
--    dia pesasse, `talk_arquivos` seria o unico lugar a mudar. Pesou no
--    primeiro dia, e nao pelo tamanho: pela distancia. O banco e a VPS ficam
--    em Ashburn, na Virginia, a 190 ms do GC - um PDF de 6 MB levava 25
--    segundos para subir e 12 para abrir, com o servidor respondendo em 0,07.
--
--    Os bytes agora moram num servico de arquivos no Brasil (`arquivos/`, no
--    nwb-local, atras da Cloudflare). Aqui fica o que o app precisa saber sem
--    baixar nada - tipo, nome, tamanho, hash e quando mudou - e continua sendo
--    aqui que se decide quem pode ler ou gravar: a API so assina o link depois
--    de perguntar ao banco.
--
--    `conteudo` fica, vazio, ate o script `scripts/mover-arquivos-talks.mjs`
--    copiar o que ja existe para o servico novo.
--
-- 2. **Links.** A 0026 recusava link de Spotify e YouTube fora do formato
--    esperado. Na pratica o link chega de todo jeito - encurtado, com
--    parametro, do app de musica - e quem cola sabe o que esta colando. A
--    trava so atrapalhava. O link e guardado como veio.
-- =============================================================================

alter table public.talks drop constraint if exists talks_spotify_url_check;
alter table public.talks drop constraint if exists talks_youtube_url_check;

alter table public.talk_arquivos alter column conteudo drop not null;
alter table public.talk_arquivos add column if not exists sha256 text;
alter table public.talk_arquivos drop constraint if exists talk_arquivo_tamanho_real;
alter table public.talk_arquivos drop constraint if exists talk_arquivo_formato;

-- O mesmo teto de antes, conferido contra o tamanho declarado pelo servico de
-- arquivos, que conta os bytes enquanto grava.
alter table public.talk_arquivos add constraint talk_arquivo_formato check (
  (tipo = 'pdf' and mime = 'application/pdf' and tamanho <= 25 * 1024 * 1024)
  or (tipo = 'arte' and mime in ('image/jpeg', 'image/png', 'image/webp')
      and tamanho <= 2 * 1024 * 1024)
  or (tipo = 'capa' and mime in ('image/jpeg', 'image/png', 'image/webp')
      and tamanho <= 250 * 1024)
);

comment on column public.talk_arquivos.conteudo is
  'Legado da 0026. Os bytes moram no servico de arquivos; so fica preenchido ate a mudanca.';

/**
 * Pode enviar um arquivo para este talk?
 *
 * A API chama antes de assinar o link de envio. Nao grava nada: o arquivo
 * ainda nem saiu do celular.
 */
create or replace function public.pode_enviar_arquivo_talk(p_talk_id uuid)
returns void
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
begin
  perform app.require_leader();
  if not exists (select 1 from public.talks where id = p_talk_id) then
    raise exception 'Talk nao encontrado.' using errcode = 'no_data_found';
  end if;
end;
$$;

revoke all on function public.pode_enviar_arquivo_talk(uuid) from public, anon;
grant execute on function public.pode_enviar_arquivo_talk(uuid) to authenticated;

/**
 * Registra o arquivo que o servico acabou de gravar.
 *
 * Quem informa tamanho e hash e a API, depois de perguntar ao proprio servico
 * de arquivos - nao o celular. Um navegador que mentisse o tamanho nao passa
 * daqui.
 */
create or replace function public.registrar_arquivo_talk(
  p_talk_id uuid,
  p_tipo text,
  p_mime text,
  p_nome text,
  p_tamanho int,
  p_sha256 text
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

  insert into public.talk_arquivos (talk_id, tipo, mime, nome, tamanho, sha256, conteudo)
  values (p_talk_id, p_tipo, p_mime, nullif(btrim(coalesce(p_nome, '')), ''),
          p_tamanho, p_sha256, null)
  on conflict (talk_id, tipo) do update
     set mime = excluded.mime,
         nome = excluded.nome,
         tamanho = excluded.tamanho,
         sha256 = excluded.sha256,
         conteudo = null,
         atualizado_em = now();

  perform app.audit('talk.file_saved', 'talks', p_talk_id, null,
                    jsonb_build_object('tipo', p_tipo, 'tamanho', p_tamanho));
end;
$$;

revoke all on function public.registrar_arquivo_talk(uuid, text, text, text, int, text)
  from public, anon;
grant execute on function public.registrar_arquivo_talk(uuid, text, text, text, int, text)
  to authenticated;

-- Os bytes nao saem mais do banco: quem entrega e o servico de arquivos.
drop function if exists public.salvar_arquivo_talk(uuid, text, text, text, bytea);
drop function if exists public.arquivo_talk(uuid, text);
