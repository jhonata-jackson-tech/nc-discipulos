-- =============================================================================
-- Cuidar GC :: 0030 - a lista de aniversariantes do GC
--
-- Ate aqui o aniversario vinha so da data de nascimento de cada integrante, e
-- quase ninguem tinha essa data preenchida. A lista de verdade circula no
-- WhatsApp - por mes, so dia e nome - e tem gente que nao e integrante com
-- conta: os filhos, quem ainda esta chegando.
--
-- Ela ganha tabela propria, sem ano (a lista nao tem, e ninguem precisa saber a
-- idade de ninguem para dar parabens). Lideres, supervisores e discipulos
-- cuidam dela; o GC inteiro ve. E ela passa a ser a unica fonte do aviso das
-- 08:00, que agora vai para quem conduz o GC - sao eles que lembram e puxam a
-- mensagem no grupo.
-- =============================================================================

create table if not exists public.aniversariantes (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 0),
  dia smallint not null check (dia between 1 and 31),
  mes smallint not null check (mes between 1 and 12),
  -- "filha do Diego", "esposa do Robson": o que ajuda a lembrar quem e.
  observacao text,
  created_by uuid references public.profiles (id) on delete set null
    default app.current_profile_id(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Fevereiro aceita 29: quem nasceu nele existe, e comemora no dia 28 nos
  -- anos sem o 29 (veja `app.aniversariantes_de`).
  constraint aniversariante_data_valida check (
    dia <= case mes when 2 then 29 when 4 then 30 when 6 then 30
                    when 9 then 30 when 11 then 30 else 31 end
  )
);

-- Colar a lista de novo nao duplica ninguem: o mesmo nome no mesmo dia e a
-- mesma pessoa.
create unique index if not exists aniversariantes_unico_idx
  on public.aniversariantes (lower(btrim(nome)), dia, mes);

create index if not exists aniversariantes_data_idx on public.aniversariantes (mes, dia);

drop trigger if exists aniversariantes_touch on public.aniversariantes;
create trigger aniversariantes_touch before update on public.aniversariantes
  for each row execute function app.touch_updated_at();

-- ============================================================= quem ve o que
/** Quem cuida da lista. Os mesmos que conduzem o GC. */
create or replace function app.cuida_aniversariantes()
returns boolean
language sql
stable
set search_path = public, pg_temp
as $$
  select app.is_active() and app.current_role() in ('leader', 'supervisor', 'disciple');
$$;

grant execute on function app.cuida_aniversariantes() to authenticated;

alter table public.aniversariantes enable row level security;
grant select, insert, update, delete on public.aniversariantes to authenticated;

drop policy if exists aniversariantes_read on public.aniversariantes;
create policy aniversariantes_read on public.aniversariantes
  for select to authenticated using (app.is_active());

drop policy if exists aniversariantes_insert on public.aniversariantes;
create policy aniversariantes_insert on public.aniversariantes
  for insert to authenticated with check (app.cuida_aniversariantes());

drop policy if exists aniversariantes_update on public.aniversariantes;
create policy aniversariantes_update on public.aniversariantes
  for update to authenticated
  using (app.cuida_aniversariantes()) with check (app.cuida_aniversariantes());

drop policy if exists aniversariantes_delete on public.aniversariantes;
create policy aniversariantes_delete on public.aniversariantes
  for delete to authenticated using (app.cuida_aniversariantes());

-- ================================================================== o aviso
/**
 * Quem faz aniversario num dia.
 *
 * Em ano sem 29 de fevereiro, quem nasceu nele aparece no dia 28 - melhor do
 * que sumir da lista tres anos em cada quatro.
 */
create or replace function app.aniversariantes_de(p_dia date)
returns setof public.aniversariantes
language sql
stable
set search_path = public, pg_temp
as $$
  select a.*
    from public.aniversariantes a
   where (a.mes = extract(month from p_dia) and a.dia = extract(day from p_dia))
      or (a.mes = 2 and a.dia = 29
          and extract(month from p_dia) = 2 and extract(day from p_dia) = 28
          and extract(day from (date_trunc('year', p_dia) + interval '1 month 28 days')) <> 29);
$$;

/**
 * Os aniversariantes do dia, as 08:00, para quem conduz o GC.
 *
 * Um aviso so, com todos os nomes no titulo: e o que aparece na tela de
 * bloqueio, e aniversario nao e segredo de ninguem. Dois aniversarios no mesmo
 * dia nao viram dois avisos.
 */
create or replace function app.avisar_aniversarios()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_nomes text;
  v_total int := 0;
begin
  select string_agg(nome, ', ' order by nome) into v_nomes
    from app.aniversariantes_de(app.hoje());

  if v_nomes is null then
    return 0;
  end if;

  with avisados as (
    select app.notify(p.id, 'general',
                      format('🎂 Hoje é aniversário de %s', v_nomes),
                      'Que tal mandar uma mensagem e lembrar o GC?',
                      '/aniversariantes')
      from public.profiles p
     where p.status = 'active' and p.deleted_at is null and p.user_id is not null
       and p.role in ('leader', 'supervisor', 'disciple')
  )
  select count(*) into v_total from avisados;

  return v_total;
end;
$$;
