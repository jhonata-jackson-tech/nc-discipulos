-- =============================================================================
-- Cuidar GC :: 0016 - nome de exibicao e o perfil da pessoa
--
-- O cadastro guarda o nome completo, que a lideranca precisa. Mas ninguem no
-- GC chama a Patricia Praia da Costa Carneiro pelo nome inteiro - chamam de
-- Paty. Um sistema que insiste no nome de cartorio soa como repartição.
--
-- Aqui a pessoa escolhe como quer ser chamada, sem apagar o nome completo.
-- =============================================================================

alter table public.profiles
  add column if not exists display_name text,
  add column if not exists photo_url text;

comment on column public.profiles.display_name is
  'Como a pessoa quer ser chamada. Vazio: usa o primeiro nome do nome completo.';

/**
 * O nome que aparece nas telas.
 *
 * Uma funcao so, para nenhuma tela discordar da outra sobre como chamar
 * alguem. Sem escolha, usa o primeiro nome - "Bom dia, Jhonata" e melhor que
 * "Bom dia, Jhonata Jackson Monteiro Motta".
 */
create or replace function public.display_name(p public.profiles)
returns text
language sql
immutable
as $$
  select coalesce(nullif(btrim(p.display_name), ''), split_part(btrim(p.full_name), ' ', 1));
$$;

/**
 * Semanas seguidas sem deixar ninguem sem contato.
 *
 * Conta de tras para frente e para na primeira semana incompleta. Constancia,
 * nao volume: quem cuida de duas pessoas toda semana esta fazendo o combinado
 * tanto quanto quem cuida de seis - e ninguem ganha nada registrando mais
 * contatos do que cuidou.
 */
create or replace function app.semanas_seguidas(p_profile uuid)
returns int
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_semana record;
  v_seguidas int := 0;
begin
  for v_semana in
    select w.id
      from public.care_weeks w
     where w.status in ('published', 'closed')
       and w.starts_on <= current_date
       and exists (select 1 from public.care_assignments a
                    where a.week_id = w.id and a.caregiver_id = p_profile)
     order by w.starts_on desc
  loop
    if exists (
      select 1 from public.care_assignments a
       where a.week_id = v_semana.id and a.caregiver_id = p_profile
         and a.status not in ('contacted', 'follow_up')
    ) then
      exit;
    end if;
    v_seguidas := v_seguidas + 1;
  end loop;

  return v_seguidas;
end;
$$;


-- ------------------------------------------------------------- os numeros
/**
 * O que a pessoa fez, para a propria tela de perfil.
 *
 * Numeros do proprio esforco, nao ranking: quem cuidou de quantos, ha quantas
 * semanas seguidas nao deixou ninguem sem contato. Comparar pessoas em cuidado
 * pastoral seria transformar em competicao o que precisa ser constancia.
 */
create or replace function public.meu_perfil()
returns jsonb
language plpgsql
security definer
stable
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
  v_grupo public.groups;
  v_semana public.care_weeks;
begin
  if me is null then
    raise exception 'Sessao invalida.' using errcode = 'insufficient_privilege';
  end if;

  select g.* into v_grupo
    from public.groups g
    join public.group_memberships m on m.group_id = g.id
   where m.profile_id = me and m.left_at is null
   order by m.joined_at
   limit 1;

  select * into v_semana
    from public.care_weeks
   where status = 'published' and current_date between starts_on and ends_on
   order by starts_on desc limit 1;

  return jsonb_build_object(
    'grupo', jsonb_build_object(
      'nome', v_grupo.name,
      'lideres', coalesce((
        select jsonb_agg(public.display_name(p) order by p.full_name)
          from public.profiles p
          join public.group_memberships m on m.profile_id = p.id and m.left_at is null
         where m.group_id = v_grupo.id and p.role = 'leader' and p.status = 'active'
      ), '[]'::jsonb)
    ),
    'semana', jsonb_build_object(
      'feitos', (
        select count(*) from public.care_assignments a
         where a.week_id = v_semana.id and a.caregiver_id = me
           and a.status in ('contacted', 'follow_up')
      ),
      'total', (
        select count(*) from public.care_assignments a
         where a.week_id = v_semana.id and a.caregiver_id = me
      )
    ),
    'historico', jsonb_build_object(
      'cuidadosRegistrados', (
        select count(*) from public.contact_logs c where c.author_id = me
      ),
      'pessoasCuidadas', (
        select count(distinct a.cared_for_id)
          from public.care_assignments a where a.caregiver_id = me
      ),
      'semanasSeguidas', app.semanas_seguidas(me)
    )
  );
end;
$$;

revoke all on function public.meu_perfil() from public, anon;
grant execute on function public.meu_perfil() to authenticated;
grant execute on function public.display_name(public.profiles) to authenticated;
