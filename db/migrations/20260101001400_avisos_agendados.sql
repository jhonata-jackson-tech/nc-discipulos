-- =============================================================================
-- Cuidar GC :: 0014 - avisos com hora marcada
--
-- Ate aqui todo aviso era reacao a alguma acao. Faltavam os dois que ninguem
-- dispara: o resumo da semana na segunda de manha e os aniversarios do dia.
--
-- A decisao de "esta na hora?" mora aqui, e nao no servico, por dois motivos:
-- o fuso do GC e uma regra do produto (America/Sao_Paulo, nao o fuso do
-- container), e a garantia de nao repetir precisa de estado durável. O serviço
-- so bate o ponto de minuto em minuto e pergunta.
-- =============================================================================

-- Marca o que ja rodou. A chave e (tarefa, dia): reiniciar o servico, subir
-- duas copias ou perder a conexao no meio nao gera aviso repetido - e receber
-- o mesmo aviso duas vezes ensina as pessoas a ignorarem os avisos.
create table if not exists app.tarefas_executadas (
  tarefa text not null,
  dia date not null,
  executada_em timestamptz not null default now(),
  avisos int not null default 0,
  primary key (tarefa, dia)
);

-- ------------------------------------------------------------ a semana
/**
 * Resumo de segunda-feira, 07:00.
 *
 * Um aviso por pessoa, com o que ela precisa fazer - nao um por atribuicao.
 * Quem cuida de quatro pessoas nao pode acordar com quatro notificacoes: isso
 * treina a pessoa a arrastar tudo para o lado sem ler.
 */
create or replace function app.avisar_semana()
returns int
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_semana public.care_weeks;
  v_total int := 0;
begin
  select * into v_semana
    from public.care_weeks
   where status = 'published'
     and current_date between starts_on and ends_on
   order by starts_on desc
   limit 1;

  if not found then
    return 0;
  end if;

  with gente as (
    select p.id,
           (select count(*) from public.care_assignments a
             where a.week_id = v_semana.id and a.caregiver_id = p.id) as cuidados,
           (select count(*) from public.activity_assignees aa
              join public.activities act on act.id = aa.activity_id
             where aa.profile_id = p.id and act.week_id = v_semana.id) as atividades
      from public.profiles p
     where p.status = 'active' and p.deleted_at is null and p.user_id is not null
  ),
  avisados as (
    select app.notify(
             g.id, 'week_published', 'Sua semana começou',
             trim(both ' · ' from
               concat_ws(' · ',
                 case when g.cuidados > 0
                      then format('%s pessoa(s) para cuidar', g.cuidados) end,
                 case when g.atividades > 0
                      then format('%s atividade(s)', g.atividades) end)),
             '/')
      from gente g
     where g.cuidados > 0 or g.atividades > 0
  )
  select count(*) into v_total from avisados;

  return v_total;
end;
$$;

-- -------------------------------------------------------- os aniversarios
/**
 * Aniversariantes do dia, as 08:00, para o GC inteiro.
 *
 * Um aviso so, com todos os nomes: dois aniversarios no mesmo dia nao viram
 * dois avisos. E o aniversariante tambem recebe - ler o proprio nome ali e
 * saber que o grupo foi lembrado.
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
  select string_agg(full_name, ', ' order by full_name) into v_nomes
    from public.profiles
   where status = 'active' and deleted_at is null and birth_date is not null
     and to_char(birth_date, 'MM-DD') = to_char(current_date, 'MM-DD');

  if v_nomes is null then
    return 0;
  end if;

  with avisados as (
    select app.notify(p.id, 'general', 'Aniversário no GC hoje',
                      format('Hoje é aniversário de %s. Que tal mandar uma mensagem?', v_nomes),
                      '/integrantes')
      from public.profiles p
     where p.status = 'active' and p.deleted_at is null and p.user_id is not null
  )
  select count(*) into v_total from avisados;

  return v_total;
end;
$$;

-- ------------------------------------------------------------- o relogio
/**
 * Roda o que estiver na hora, uma vez por dia.
 *
 * O horario e sempre o do GC (America/Sao_Paulo), independente do fuso da
 * maquina. `>= 7` em vez de `= 7`: se o servico estiver fora do ar as 07:00,
 * o aviso sai quando ele voltar - atrasado e melhor que perdido.
 */
create or replace function app.rodar_avisos_agendados()
returns table (tarefa text, avisos int)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  agora timestamp := (now() at time zone 'America/Sao_Paulo');
  hoje date := agora::date;
  hora int := extract(hour from agora);
  v_avisos int;
begin
  -- Segunda de manha: a semana comecou.
  if extract(isodow from agora) = 1 and hora >= 7
     and not exists (select 1 from app.tarefas_executadas t
                      where t.tarefa = 'semana' and t.dia = hoje) then
    v_avisos := app.avisar_semana();
    insert into app.tarefas_executadas (tarefa, dia, avisos) values ('semana', hoje, v_avisos);
    tarefa := 'semana'; avisos := v_avisos; return next;
  end if;

  -- Todo dia as 08:00.
  if hora >= 8
     and not exists (select 1 from app.tarefas_executadas t
                      where t.tarefa = 'aniversarios' and t.dia = hoje) then
    v_avisos := app.avisar_aniversarios();
    insert into app.tarefas_executadas (tarefa, dia, avisos)
    values ('aniversarios', hoje, v_avisos);
    tarefa := 'aniversarios'; avisos := v_avisos; return next;
  end if;

  return;
end;
$$;

-- Quem chama e o servico de entrega, com o papel de conexao dele. Ninguem
-- alcanca isto pela API.
revoke all on function app.rodar_avisos_agendados() from public, anon, authenticated;
