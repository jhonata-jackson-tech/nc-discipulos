-- =============================================================================
-- Cuidar GC :: 0017 - relatorios para quem lidera e para quem supervisiona
--
-- Ate aqui a lideranca via a semana corrente, uma tela por vez. Faltava a
-- pergunta que se faz no fim do mes: como o GC esta indo? Quem esta cuidando
-- de verdade, quem sumiu, quantas pessoas disseram que vem e quantas
-- apareceram.
--
-- O relatorio nao inventa dado: ele so junta o que o feedback de tres toques
-- ja produz. Foi por isso que ele veio antes.
-- =============================================================================

/**
 * Panorama das ultimas semanas.
 *
 * Uma chamada devolve tudo o que a tela precisa - evita seis consultas
 * separadas que discordariam entre si sobre "o que e a semana passada".
 *
 * Lideranca ve o GC inteiro. E `security definer` porque agrega dados que a
 * RLS mostra pessoa a pessoa; a guarda de papel esta na primeira linha.
 */
create or replace function public.relatorio_gc(p_semanas int default 8)
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  v_semanas int := greatest(1, least(coalesce(p_semanas, 8), 26));
begin
  if not app.is_leadership() then
    raise exception 'Somente lideranca e supervisao veem o relatorio.'
      using errcode = 'insufficient_privilege';
  end if;

  return jsonb_build_object(
    -- Uma linha por semana: quantos cuidados foram combinados, quantos
    -- aconteceram, e quantas pessoas ficaram sem contato nenhum.
    'semanas', coalesce((
      select jsonb_agg(linha order by linha->>'inicio')
        from (
          select jsonb_build_object(
                   'inicio', w.starts_on,
                   'fim', w.ends_on,
                   'situacao', w.status,
                   'combinados', count(a.*),
                   'feitos', count(*) filter (where a.status in ('contacted', 'follow_up')),
                   'semContato', count(*) filter (where a.status = 'pending'),
                   'precisamDaLideranca', count(*) filter (where a.attention_level = 'leader_action')
                 ) as linha
            from public.care_weeks w
            left join public.care_assignments a on a.week_id = w.id
           where w.status in ('published', 'closed')
           group by w.id, w.starts_on, w.ends_on, w.status
           order by w.starts_on desc
           limit v_semanas
        ) as ultimas
    ), '[]'::jsonb),

    -- Como o GC esteve, pela escala do feedback, nas semanas do recorte.
    'comoEstao', coalesce((
      select jsonb_object_agg(coalesce(c.well_being::text, 'sem_registro'), c.quantos)
        from (
          select l.well_being, count(*) as quantos
            from public.contact_logs l
           where l.contacted_on >= current_date - (v_semanas * 7)
           group by l.well_being
        ) c
    ), '{}'::jsonb),

    -- Quem disse que vem ao GC. O numero que a lideranca usa para preparar a
    -- sala - e para perceber quem vem dizendo "não" ha semanas.
    'presenca', coalesce((
      select jsonb_object_agg(coalesce(c.coming_to_gc::text, 'sem_resposta'), c.quantos)
        from (
          select l.coming_to_gc, count(*) as quantos
            from public.contact_logs l
           where l.contacted_on >= current_date - 7
           group by l.coming_to_gc
        ) c
    ), '{}'::jsonb),

    -- Constancia de quem cuida. Sem ranking na consulta: a tela ordena por
    -- nome, e o numero que importa e "semanas seguidas", nao "quem fez mais".
    'cuidadores', coalesce((
      select jsonb_agg(jsonb_build_object(
               -- O nome nao serve de identidade: o GC tem duas Amandas.
               'id', p.id,
               'nome', public.display_name(p),
               'papel', p.role,
               'semanasSeguidas', app.semanas_seguidas(p.id),
               'registrosNoPeriodo', (
                 select count(*) from public.contact_logs l
                  where l.author_id = p.id
                    and l.contacted_on >= current_date - (v_semanas * 7)
               )
             ) order by p.full_name)
        from public.profiles p
       where p.status = 'active' and p.deleted_at is null
         and p.role in ('leader', 'disciple')
    ), '[]'::jsonb),

    -- Quem esta ha mais tempo sem receber contato. A lista que existe para
    -- ninguem ficar de fora - o proposito do produto em uma consulta.
    'semContatoHaMais', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', p.id,
               'nome', public.display_name(p),
               'ultimoContato', ultimo.quando
             ) order by ultimo.quando nulls first)
        from public.profiles p
        left join lateral (
          select max(l.contacted_on) as quando
            from public.contact_logs l
            join public.care_assignments a on a.id = l.assignment_id
           where a.cared_for_id = p.id
        ) ultimo on true
       where p.status = 'active' and p.deleted_at is null and p.role = 'member'
         and (ultimo.quando is null or ultimo.quando < current_date - 14)
    ), '[]'::jsonb),

    'geradoEm', now()
  );
end;
$$;

revoke all on function public.relatorio_gc(int) from public, anon;
grant execute on function public.relatorio_gc(int) to authenticated;
