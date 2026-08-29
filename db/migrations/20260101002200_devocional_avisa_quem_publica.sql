-- =============================================================================
-- Cuidar GC :: 0022 - quem publica o devocional tambem quer recebe-lo
--
-- A 0020 tirava de proposito quem publicou da lista de avisados, seguindo a
-- regra do resto do app: receber aviso do que voce acabou de fazer e o caminho
-- mais curto para parar de ler os avisos.
--
-- A regra estava certa e o lugar errado. Ela vale para aviso *sobre a sua
-- propria acao* - "voce registrou um cuidado", "voce pediu uma transferencia".
-- O devocional nao e disso: o texto e de outra pessoa, e quem publica esta
-- repassando, nao anunciando a si mesmo. Ele tambem e leitor, e quer o
-- devocional na caixa de entrada junto com todo mundo.
-- =============================================================================

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

  -- Publicar de novo nao reenvia: quem ja publicou so esta corrigindo o texto,
  -- e receber o mesmo devocional duas vezes ensina a ignorar.
  if v_dev.status = 'published' then
    return;
  end if;

  select * into v_autor from public.devotional_authors where id = v_dev.author_id;
  v_assinatura := public.author_label(v_autor);

  update public.devotionals
     set status = 'published', published_at = now()
   where id = p_id;

  -- Todo mundo que alcanca, sem excecao - inclusive quem publicou. O texto e
  -- do pastor; quem apertou o botao repassou, e tambem quer ler.
  perform app.notify(
    p.id,
    'devotional'::public.notification_type,
    format('%s te mandou uma mensagem', v_assinatura),
    v_dev.title,
    '/devocionais/' || p_id)
    from public.profiles p
   where p.status = 'active' and p.deleted_at is null
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
