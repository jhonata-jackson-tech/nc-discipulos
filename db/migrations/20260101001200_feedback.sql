-- =============================================================================
-- Cuidar GC :: 0012 - o feedback do cuidado em tres toques
--
-- O registro anterior pedia canal, data, se houve resposta, nivel de atencao,
-- situacao e um texto livre. Seis decisoes por pessoa cuidada, toda semana.
-- Quem cuida de quatro pessoas preenchia isso vinte e quatro vezes por mes - e
-- feedback que cansa nao e preenchido, ou e preenchido no automatico. Nos dois
-- casos a lideranca fica cega.
--
-- Agora sao tres toques: como a pessoa esta, se vem ao GC, e pronto. O nivel de
-- atencao e a situacao **saem daí** em vez de serem perguntados de novo - a
-- mesma informacao, sem a segunda pergunta.
-- =============================================================================

-- ------------------------------------------------------------ como ela esta
-- A escala evita "bem/mal": diante dessa dupla, quem responde tende a ser
-- gentil em vez de preciso. Estes degraus descrevem situacao, nao nota.
--
-- `sem_resposta` nao e ausencia de dado - e dado. Silencio repetido e
-- exatamente o que a lideranca precisa enxergar cedo.
create type public.well_being as enum (
  'sem_resposta',
  'precisa_ajuda',
  'pra_baixo',
  'seguindo',
  'bem',
  'muito_bem'
);

-- Presenca no GC da semana, na palavra da propria pessoa.
create type public.gc_intent as enum ('vem', 'nao_vem', 'nao_sabe');

alter table public.contact_logs
  add column if not exists well_being public.well_being,
  add column if not exists coming_to_gc public.gc_intent;

comment on column public.contact_logs.well_being is
  'Como o cuidador percebeu a pessoa nesta semana. De onde sai o nivel de atencao.';
comment on column public.contact_logs.coming_to_gc is
  'Se a pessoa disse que vem ao GC nesta semana.';

-- ------------------------------------------------- o termometro sai daqui
/**
 * Nivel de atencao a partir de como a pessoa esta.
 *
 * Regra em um lugar so: a interface nao decide isso, e nenhuma tela pode
 * discordar da outra sobre o que e "precisa da lideranca".
 */
create or replace function app.attention_from_well_being(p public.well_being)
returns public.attention_level
language sql
immutable
as $$
  select case p
    when 'precisa_ajuda' then 'leader_action'::public.attention_level
    when 'pra_baixo'     then 'watch'::public.attention_level
    when 'sem_resposta'  then 'watch'::public.attention_level
    else 'normal'::public.attention_level
  end;
$$;

-- ---------------------------------------------------------- registrar contato
drop function if exists public.log_contact(uuid, public.contact_channel, date, boolean, text,
                                           public.attention_level, public.assignment_status);

/**
 * Registra o contato da semana.
 *
 * Recebe o que a pessoa que cuidou realmente sabe - por onde falou, como a
 * pessoa esta e se ela vem ao GC - e deriva o resto. `p_attention_level`
 * existe para o caso raro em que quem cuida quer escalar por conta propria,
 * mesmo com a pessoa dizendo que esta bem; sem ele, vale a derivacao.
 */
create or replace function public.log_contact(
  p_assignment_id uuid,
  p_channel public.contact_channel,
  p_well_being public.well_being,
  p_coming_to_gc public.gc_intent default null,
  p_feedback text default null,
  p_contacted_on date default null,
  p_attention_level public.attention_level default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  me uuid := app.current_profile_id();
  v_assignment public.care_assignments;
  v_log uuid;
  v_cared_name text;
  v_atencao public.attention_level;
  v_status public.assignment_status;
  v_respondeu boolean := p_well_being is distinct from 'sem_resposta';
begin
  select * into v_assignment from public.care_assignments where id = p_assignment_id for update;
  if not found then
    raise exception 'Cuidado nao encontrado.' using errcode = 'no_data_found';
  end if;

  if v_assignment.caregiver_id <> me and not app.is_leader() then
    raise exception 'Somente o responsavel atual ou um lider registra este cuidado.'
      using errcode = 'insufficient_privilege';
  end if;

  if p_contacted_on > current_date then
    raise exception 'A data do contato nao pode estar no futuro.' using errcode = 'check_violation';
  end if;

  v_atencao := coalesce(p_attention_level, app.attention_from_well_being(p_well_being));

  -- Sem resposta ainda nao e cuidado feito: continua na lista, aguardando.
  v_status := case when v_respondeu then 'contacted' else 'awaiting_reply' end;

  insert into public.contact_logs (assignment_id, author_id, contacted_on, channel,
                                   got_reply, feedback, attention_level,
                                   well_being, coming_to_gc)
  values (p_assignment_id, me, coalesce(p_contacted_on, current_date), p_channel,
          v_respondeu, nullif(btrim(coalesce(p_feedback, '')), ''), v_atencao,
          p_well_being, p_coming_to_gc)
  returning id into v_log;

  update public.care_assignments
     set status = v_status,
         attention_level = v_atencao,
         last_contact_at = now()
   where id = p_assignment_id;

  -- A lideranca fica sabendo na hora quando alguem precisa dela.
  if v_atencao = 'leader_action' then
    select full_name into v_cared_name from public.profiles where id = v_assignment.cared_for_id;

    perform app.notify(p.id, 'general', 'Um cuidado precisa da lideranca',
                       format('%s foi marcado como "lideranca precisa agir".', v_cared_name),
                       '/cuidados')
       from public.profiles p
      where p.role = 'leader' and p.status = 'active' and p.deleted_at is null;
  end if;

  perform app.audit('contact.logged', 'contact_logs', v_log, null,
                    jsonb_build_object('assignment', p_assignment_id,
                                       'wellBeing', p_well_being,
                                       'comingToGc', p_coming_to_gc));

  return v_log;
end;
$$;

revoke all on function public.log_contact(uuid, public.contact_channel, public.well_being,
  public.gc_intent, text, date, public.attention_level) from public, anon;
grant execute on function public.log_contact(uuid, public.contact_channel, public.well_being,
  public.gc_intent, text, date, public.attention_level) to authenticated;
