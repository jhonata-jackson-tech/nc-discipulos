-- =============================================================================
-- Cuidar GC :: 0018 - a foto de perfil
--
-- A foto mora no proprio banco, como imagem embutida (data URL), e nao num
-- servico de arquivos. Para 33 pessoas isso e uma escolha, nao uma limitacao:
--
--   · nao acrescenta servico nenhum para manter, monitorar e proteger;
--   · entra no mesmo backup do resto - restaurar o banco restaura as fotos,
--     em vez de deixar 33 avatares quebrados;
--   · nao existe arquivo orfao quando alguem troca ou sai.
--
-- O preco e o tamanho, e por isso ele e limitado aqui embaixo: o navegador
-- reduz a imagem para 128px antes de enviar. Uma foto de celular tem 3 MB;
-- o que chega aqui tem ~10 KB.
-- =============================================================================

-- A trava no banco existe porque a tela nao pode ser a unica guardia: um
-- retrato de 3 MB por pessoa faria a lista de integrantes pesar 100 MB no
-- celular de quem abre a tela no 4G.
alter table public.profiles
  drop constraint if exists profiles_photo_size;

alter table public.profiles
  add constraint profiles_photo_size
  check (photo_url is null or length(photo_url) <= 120000);

comment on column public.profiles.photo_url is
  'Foto em data URL, reduzida a 128px pelo navegador. Teto de ~120 KB.';
