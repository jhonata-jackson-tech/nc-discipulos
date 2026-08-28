-- =============================================================================
-- Cuidar GC :: carga inicial (idempotente)
--
-- Cria o GC e os 33 integrantes com a grafia exata recebida da lideranca.
-- Nao inventamos e-mail, telefone, aniversario, senha, genero de cuidado nem
-- vinculo de discipulado: esses dados sao confirmados pela lideranca no
-- assistente de primeiro acesso.
-- =============================================================================
do $$
declare
  v_group uuid;
  entry record;
begin
  select id into v_group from public.groups where name = 'GC Novos Comecos';
  if v_group is null then
    insert into public.groups (name, description)
    values ('GC Novos Comecos', 'Grupo de Crescimento')
    returning id into v_group;
  end if;

  for entry in
    select * from (values
      ('Jhonata Jackson',       'leader'),
      ('Jenifer Messias',       'leader'),

      ('Rolian Martins',        'supervisor'),
      ('Larissa Lobo',          'supervisor'),

      ('Letícia Azevedo',       'disciple'),
      ('Felipe Freitas',        'disciple'),
      ('Lethicia Motta',        'disciple'),
      ('Paty Praia',            'disciple'),
      ('Gabriel Ribeiro',       'disciple'),
      ('Victor Hugo Paty',      'disciple'),

      ('Anderson',              'member'),
      ('Amanda (Diego)',        'member'),
      ('Diego Alves',           'member'),
      ('Matheus Amorim',        'member'),
      ('Robson',                'member'),
      ('Brennoh',               'member'),
      ('Camila',                'member'),
      ('Carla Robson',          'member'),
      ('David Cruz',            'member'),
      ('Jonatas Freitas',       'member'),
      ('Matheus (Amanda)',      'member'),
      ('Jeferson',              'member'),
      ('Clara Machado',         'member'),
      ('Messias',               'member'),
      ('Jonas',                 'member'),
      ('Ph',                    'member'),
      ('Victor',                'member'),
      ('Ygor',                  'member'),
      ('Amanda Garcia (Matheus)', 'member'),
      ('Isabela Marques',       'member'),
      ('Rafaela Duque',         'member'),
      ('Raissa',                'member'),
      ('Ana Flávia',            'member')
    ) as t(full_name, role)
  loop
    insert into public.profiles (full_name, role)
    select entry.full_name, entry.role::public.app_role
     where not exists (
       select 1 from public.profiles p
        where p.full_name = entry.full_name and p.deleted_at is null
     );
  end loop;

  insert into public.group_memberships (group_id, profile_id, role)
  select v_group, p.id, p.role
    from public.profiles p
   where p.deleted_at is null
  on conflict (group_id, profile_id) do update set role = excluded.role;
end;
$$;
