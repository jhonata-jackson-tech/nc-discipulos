# Discípulos

Aplicação privada para organizar o cuidado semanal, as atividades e o
acompanhamento de um Grupo de Crescimento.

> O produto se chama **Discípulos** para quem usa — é o nome que aparece ao
> instalar no celular. `cuidar-gc` continua sendo o nome técnico do repositório
> e dos containers.

Cada pessoa abre o sistema e vê, em uma tela só, o que precisa fazer naquela
semana. A liderança acompanha o andamento sem transformar o cuidado em cobrança,
e discípulos e líderes têm um canal reservado com a supervisão.

---

## Sumário

- [O que já está implementado](#o-que-já-está-implementado)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Como rodar localmente](#como-rodar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados](#banco-de-dados)
- [Primeiro acesso da liderança](#primeiro-acesso-da-liderança)
- [Senhas](#senhas)
- [A regra de distribuição](#a-regra-de-distribuição)
- [Papéis e permissões](#papéis-e-permissões)
- [Testes](#testes)
- [PWA e notificações](#pwa-e-notificações)
- [Deploy na VPS](#deploy-na-vps)
- [Estrutura de pastas](#estrutura-de-pastas)

## O que já está implementado

| Área | Situação |
| --- | --- |
| Autenticação por convite, login e primeiro acesso | ✅ |
| Troca de senha pelo próprio integrante | ✅ |
| Papéis, integrantes, discipulado e restrições de rodízio | ✅ |
| Geração da semana no servidor, revisão, reorganização e publicação | ✅ |
| Minha semana, registro de contato, feedback e níveis de atenção | ✅ |
| Transferência com aceite e reorganização auditada do líder | ✅ |
| Atividades com múltiplos responsáveis e recorrência | ✅ |
| Supervisão reservada e anotações privadas | ✅ |
| Notificações internas | ✅ |
| PWA instalável com cache do shell | ✅ |
| Notificações push (fora do app) | ✅ |
| Tema claro, escuro e "seguir o sistema" | ✅ |
| Testes unitários, de regras no banco, de RLS e end-to-end | ✅ |

Não há recuperação de senha automática — é uma decisão, e está explicada em
[Senhas](#senhas).

---

## Modo de demonstração

Para avaliar o produto com o GC cheio, sem precisar preencher tudo à mão:

```bash
npm run dev:servicos   # banco, migrations, PostgREST e API
npm run demo
npm run dev
```

O `npm run demo` popula o GC com três semanas de cuidado (encerrada, publicada
e em rascunho), contatos registrados com feedbacks e pontos de atenção, cinco
atividades, um pedido de transferência pendente, três conversas com a supervisão,
avisos e aniversários. Ele imprime as contas criadas — uma por papel — e grava
`VITE_DEMO_ACCOUNTS` no `.env.local`, o que liga o botão **Trocar de perfil** no
rodapé da barra lateral. Reinicie o `npm run dev` depois do seed para o Vite
reler o `.env.local`.

> ⚠️ Os gêneros de cuidado do modo demonstração são um **chute**. O produto
> existe justamente para que essa informação seja confirmada pessoa a pessoa;
> por isso cada integrante recebe uma nota administrativa avisando disso.
> `npm run demo:limpar` devolve o banco ao estado do seed — sem gênero
> confirmado, sem discipulado, sem acessos.

O seletor de perfil é um atalho de avaliação: ele só existe quando
`import.meta.env.DEV` **e** `VITE_DEMO_ACCOUNTS` estão presentes. No build de
produção o componente inteiro — e as credenciais — some do bundle.

---

## Arquitetura

Tudo roda em uma máquina só, em containers, e tudo responde na mesma origem —
não existe chave de API no navegador nem CORS para configurar.

```
                        ┌───────────── VPS ─────────────┐
navegador ──HTTPS──▶ caddy ──┬── /            → a PWA (arquivos estáticos)
                             ├── /rest/v1/*   → postgrest ──┐
                             └── /auth, /api  → api (Node) ─┤
                                                            ▼
                                                        postgres
```

| Serviço | Papel |
| --- | --- |
| `postgres` | O banco. Schema, regras de negócio e **toda** a decisão de acesso (RLS) |
| `postgrest` | Publica o schema `public` como API REST. Valida o JWT e assume o papel `authenticated` |
| `api` | O que o PostgREST não faz: emitir a sessão (login, convite, troca de senha) e rodar a geração da semana |
| `caddy` | HTTPS automático, fallback de SPA e roteamento por caminho |

A peça que amarra tudo é o JWT: a `api` assina, o `postgrest` confere com o
mesmo segredo, e `auth.uid()` lê o `sub` dentro do banco. É por isso que as
políticas de RLS, escritas contra `auth.uid()`, continuam valendo sem uma linha
de mudança — o navegador nunca informa quem é, ele apenas apresenta um token
assinado.

O serviço `api` também não tem caminho privilegiado: para gerar a semana, ele
assume a identidade de quem pediu (`set local role authenticated`) e passa pela
mesma RLS de todo mundo.

---

## Stack

- **React 19 + TypeScript + Vite 8**
- **Tailwind CSS v4** com tokens próprios e componentes no estilo shadcn/ui
- Paleta neutra: preto e branco em tons suaves, nunca absolutos; cor só onde
  informa (erro, confirmação, atenção)
- **React Router 7**, **TanStack Query 5**, **React Hook Form + Zod 4**
- **PostgreSQL 17** com Row Level Security e funções de servidor
- **PostgREST** para os dados, **Express 5** para sessão e geração da semana
- **Docker Compose** e **Caddy** (HTTPS automático) na VPS
- **vite-plugin-pwa** (manifest + service worker), **Lucide Icons**
- Tema claro/escuro por classe no `<html>`, com "seguir o sistema" como opção
- **Vitest + Testing Library** e **Playwright**
- Interface em `pt-BR`, datas em UTC no banco e `America/Sao_Paulo` na tela

---

## Como rodar localmente

Requisitos: **Node 20+** e **Docker**.

```bash
# 1. dependências
npm install

# 2. segredos do ambiente local
cp .env.example .env
# gere cada senha com: openssl rand -hex 32

# 3. banco, migrations, seed, PostgREST e API
npm run dev:servicos

# 4. aplicação
npm run dev
```

A aplicação sobe em <http://localhost:5173>. O Vite faz, em desenvolvimento, o
mesmo roteamento que o Caddy faz em produção: `/rest/v1` vai para o PostgREST e
`/auth` e `/api` vão para o serviço de sessão. Por isso o código não muda entre
os dois ambientes — e o `dist` nunca carrega uma URL embutida.

`npm run dev:parar` derruba os containers (o volume do banco fica).

Para olhar o banco direto:

```bash
docker compose exec db psql -U postgres -d cuidar
```

---

## Variáveis de ambiente

Um arquivo só, `.env`, lido pelo `docker compose`. Não vai para o Git.

| Variável | Onde | Descrição |
| --- | --- | --- |
| `DOMAIN` | Caddy | Domínio da aplicação; é com ele que o certificado é emitido |
| `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` | banco | Credenciais do Postgres |
| `AUTHENTICATOR_PASSWORD` | PostgREST | Senha do papel de conexão do PostgREST |
| `AUTH_SERVICE_PASSWORD` | API | Senha do papel de conexão do serviço de sessão |
| `JWT_SECRET` | API + PostgREST | Assina e confere a sessão. Trocar derruba todas as sessões abertas |
| `DATABASE_URL` | scripts e testes | Conexão direta, só na sua máquina |
| `E2E_BASE_URL` | testes | Opcional: aponta o Playwright para uma aplicação já no ar |

O frontend **não** tem variável de ambiente: ele fala com a própria origem.
`VITE_API_URL` existe apenas como escape, caso um dia a API responda em outro
domínio.

---

## Banco de dados

As migrations ficam em `db/migrations/`, aplicadas em ordem alfabética pelo
container `migrate` a cada subida. Cada uma entra uma única vez, registrada em
`migrations.applied`, e dentro de uma transação.

| Arquivo | Conteúdo |
| --- | --- |
| `..._auth.sql` | Schema `auth`, contas, sessões renováveis e `auth.uid()` |
| `..._core.sql` | Enums, `groups`, `profiles`, `group_memberships`, `discipleship_links`, `member_notes` |
| `..._care.sql` | `care_weeks`, `care_assignments`, `contact_logs`, `transfer_requests`, `pairing_restrictions` |
| `..._activities.sql` | `activities` e `activity_assignees` |
| `..._supervision.sql` | `supervision_requests` e `supervision_notes` |
| `..._notifications_audit.sql` | `notifications`, `audit_logs`, `invites` |
| `..._helpers_rls.sql` | Identidade da sessão, grants e todas as políticas de RLS |
| `..._rpc.sql` | Convites e vínculo da conta ao integrante |
| `..._rpc_week.sql` | Geração, publicação, contatos, transferências e reorganização |
| `..._rpc_admin.sql` | Atividades, supervisão, integrantes e indicadores |

Fora de `migrations/`, dois arquivos que dependem de ambiente e por isso não são
migration: `db/roles.sql` (papéis de conexão, com as senhas do `.env`) e
`db/dev-service-role.sql`, que só roda em desenvolvimento.

Para escrever uma migration nova, crie o arquivo em `db/migrations/` com um
carimbo maior que o da última e rode `npm run dev:servicos` — ou
`docker compose up migrate` em produção, que o `deploy` já faz.

### Verificação rápida, sem subir nada

`scripts/verify-migrations.sh` sobe um Postgres descartável no Docker, aplica
todas as migrations, roda o seed duas vezes (conferindo a idempotência) e
executa `db/tests/rules.sql`, que exercita as regras que o banco precisa
garantir sozinho:

```bash
npm run verify:db
```

### Seed

`db/seed.sql` cria o GC e os 33 integrantes com a grafia exata recebida da
liderança. **Nada é inventado**: e-mail, telefone, aniversário, senha, gênero de
cuidado e vínculo de discipulado ficam em branco e são confirmados pela
liderança no assistente de primeiro acesso. O seed é idempotente — rodar de novo
não duplica ninguém.

O `migrate` só aplica o seed quando **não existe nenhum integrante** no banco.
É o que impede que alguém desligado pela liderança volte sozinho no próximo
`docker compose up`.

---

## Primeiro acesso da liderança

Não existe cadastro público. A conta só nasce a partir de um convite válido, e o
primeiro convite precisa ser emitido diretamente no banco, porque ainda não há
ninguém logado para emiti-lo.

Na VPS, com o compose no ar:

```bash
docker compose exec db psql -U postgres -d cuidar \
  -c "select * from public.create_bootstrap_invite('Jhonata Jackson', 'email-real@exemplo.com');"
```

A função devolve um `token`. Monte o link e abra no navegador:

```
https://seu-dominio/convite?token=<token>&email=email-real@exemplo.com
```

Também dá para cadastrar alguém e obter o link de convite direto pela linha de
comando — útil no começo, quando ainda não há ninguém logado para usar a tela de
Integrantes:

```bash
npm run cadastrar -- \
  --nome "Fulano de Tal" --email fulano@exemplo.com \
  --whatsapp 21999999999 --nascimento 21/03/1996 \
  --papel disciple --genero male --lider "Nome do Líder" \
  --site https://discipulos.exemplo.com.br
```

Ele não faz nada que a interface não faça: completa o cadastro, vincula ao GC,
liga o discipulado (o banco recusa gêneros diferentes) e devolve o link. Use
`--atual "Nome como está no sistema"` para completar quem veio do seed com o
nome curto, em vez de duplicar.

Para vários de uma vez — o caso real de quando as respostas chegam pelo
WhatsApp — há a versão em lote, que lê um CSV e devolve todos os links:

```bash
cp cadastros.exemplo.csv cadastros.local.csv   # o .local fica fora do Git
npm run cadastrar:lote -- cadastros.local.csv https://discipulos.exemplo.com.br
```

**Com senha provisória, sem link.** Quando a liderança prefere entregar o acesso
pessoalmente, basta uma senha no fim do comando: as contas já nascem criadas com
ela e com a troca obrigatória no primeiro acesso.

```bash
npm run cadastrar:lote -- cadastros.local.csv https://discipulos.exemplo.com.br NovaVida2026
```

Enquanto a pessoa não criar a própria senha, **a conta não abre nada**: o login
não devolve sessão, só o direito de definir a senha. Um token com esse escopo é
tratado como visitante pelo PostgREST, e visitante não lê uma linha do GC.

Vale saber o que essa escolha custa: a senha é a mesma para todo mundo, então
até cada um trocar, quem souber a senha e o e-mail de alguém entra no lugar
dessa pessoa. Entregue no mesmo dia e peça que troquem na hora.

O arquivo com gente de verdade **não vai para o repositório**: dados pessoais de
integrantes não têm por que morar no Git, e é a mesma razão pela qual o
`db/seed.sql` traz só os nomes.

Se o e-mail já estiver em outro cadastro, o script diz **de quem é** e sugere a
coluna `atual` — quase sempre é a mesma pessoa cadastrada duas vezes.

Gênero de cuidado e discipulado não entram por aí: são confirmados pela
liderança, pessoa a pessoa, no assistente de primeiros passos.

A partir daí, o líder define a senha, entra e passa pelo assistente
**Primeiros passos**:

1. **Confirmar o gênero de cuidado** de todos os integrantes ativos. O sistema
   nunca deduz isso pelo nome — a liderança marca pessoa por pessoa.
2. **Vincular cada discípulo ao líder primário** do mesmo gênero.

Enquanto houver alguém sem essa confirmação, a geração da semana fica
bloqueada. Depois disso, os demais convites saem de dentro do sistema, em
**Integrantes → Convidar para o sistema**.

> `create_bootstrap_invite` só funciona enquanto nenhuma conta estiver vinculada,
> e não é executável por usuários autenticados.

---

## Senhas

O sistema **não envia e-mail**. Isso é uma decisão, não uma pendência: um GC de
33 pessoas que se conhecem pessoalmente não precisa de um servidor de e-mail
com reputação, SPF e caixa de spam para funcionar.

O que isso significa na prática:

- **Convite** — o líder gera o link em *Integrantes → Convidar para o sistema*
  e envia por WhatsApp. O link vale 14 dias e uma única vez.
- **Trocar a própria senha** — em *Perfil*, com a senha atual em mãos. Ao
  salvar, as sessões abertas em outros aparelhos caem.
- **Esqueci minha senha** — a tela de login abre um aviso pedindo para falar
  com a liderança. Não há link automático.

Para redefinir a senha de alguém, o administrador roda, na VPS:

```bash
docker compose exec db psql -U postgres -d cuidar -c \
  "update auth.users
      set encrypted_password = extensions.crypt('SenhaProvisoria1', extensions.gen_salt('bf', 10)),
          updated_at = now()
    where lower(email) = lower('pessoa@exemplo.com');"
```

Entregue a senha provisória pessoalmente e peça que a pessoa troque em
*Perfil*. Nenhuma senha em claro fica gravada: o banco guarda só o hash bcrypt.

---

## A regra de distribuição

O algoritmo vive em `src/domain/distribution.ts` e roda **no servidor**, na Edge
Function `generate-week`, dentro de uma transação. O navegador apenas pede a
geração e mostra o resultado.

**Regra inviolável:** homem cuida somente de homem, mulher cuida somente de
mulher. Por isso o problema é resolvido como dois problemas independentes — um
pool masculino e um feminino — e a carga é equilibrada **dentro de cada pool**,
nunca por uma média global do grupo.

Em cada pool, nesta ordem:

1. Cada discípulo permanece com o líder primário, e isso **conta na carga
   semanal do líder**.
2. A carga base é `piso(pessoas cuidadas / cuidadores)`; a sobra da divisão vira
   uma vaga extra por cuidador.
3. O restante é resolvido como um **fluxo de custo mínimo**
   (`src/domain/min-cost-flow.ts`): as capacidades garantem que a carga não
   difira em mais de uma pessoa, e os custos fazem o resultado evitar repetir
   duplas.
4. O custo de cada dupla é `vezes usadas` → `há quanto tempo foi usada` →
   desempate determinístico pela semente da semana. Ou seja: duplas inéditas
   primeiro; esgotadas as inéditas, vence a usada há mais tempo.
5. Quem carrega a vaga extra alterna entre as semanas, a partir do histórico
   acumulado.
6. Autoatribuição, pessoas inativas, gêneros diferentes e pares em
   `pairing_restrictions` nunca entram.

Uma escolha gulosa pessoa a pessoa não resolveria isso: ela faz o equilíbrio de
carga atropelar a regra de não repetir duplas. O fluxo otimiza os dois critérios
ao mesmo tempo.

A geração sempre nasce como **rascunho**. Publicar é um segundo ato, deliberado,
e uma semana publicada nunca é sobrescrita em silêncio.

Se um gênero tiver pessoas para cuidar e nenhum cuidador elegível, a geração
para com um erro de configuração claro em vez de produzir algo inválido.

---

## Papéis e permissões

| Papel | Na interface | O que faz |
| --- | --- | --- |
| `supervisor` | Supervisor | Acompanha indicadores e cuidados; recebe conversas reservadas; não mexe na operação semanal |
| `leader` | Líder | Gerencia integrantes, vínculos e atividades; gera, revisa e publica a semana; **cuida e registra contatos como qualquer discípulo** |
| `disciple` | Discípulo | Cuida das pessoas atribuídas, registra contatos, transfere com aceite, pede conversa com a supervisão |
| `member` | Irmão/Irmã | Vê os próprios dados, avisos e atividades. Nunca vê feedback de cuidado |

O papel **nunca** vem do frontend. Toda decisão de acesso é tomada no banco, a
partir de `auth.uid()`:

- todas as tabelas privadas têm Row Level Security;
- o feedback de cuidado só alcança o cuidador atual, líderes e supervisores;
- a pessoa cuidada não enxerga o registro do próprio acompanhamento;
- uma solicitação **reservada** de supervisão não aparece para líderes — nem o
  conteúdo, nem a linha, nem qualquer contagem derivada dela;
- mudanças críticas (publicar, transferir, reorganizar, mudar papel) passam por
  funções de servidor que verificam sessão e papel, e deixam registro em
  `audit_logs`.

---

## Testes

Tudo o que precisa de banco espera o compose de desenvolvimento no ar
(`npm run dev:servicos`) e o `.env` preenchido. Sem isso, essas suítes são
**puladas**, nunca falham.

```bash
npm test                   # unitários + componentes
npm run test:integration   # RLS e regras de negócio contra o banco
npm run test:e2e           # fluxos críticos no navegador
npm run verify:db          # migrations + seed + regras em um Postgres descartável
npm run verify:generation  # geração semanal ponta a ponta pela API
npm run lint
npm run typecheck
npm run build
```

**Unitários** (`src/domain/distribution.test.ts`) cobrem o elenco atual de 29
pessoas para 8 cuidadores, os dois pools calculados separadamente, o bloqueio de
qualquer cuidado entre gêneros diferentes, os discípulos fixos na carga do
líder, a divisão não exata com alternância da vaga extra, ausência de
autoatribuição e duplicidade, a preferência por duplas inéditas, o fallback para
a dupla mais antiga, restrições de pareamento e o comportamento quando um
cuidador é desativado.

**Regras no banco** (`db/tests/rules.sql`, via `npm run verify:db`) exercitam as
constraints e os gatilhos em um Postgres limpo, em segundos, sem subir a
aplicação. A mesma rotina confere que `auth.uid()` continua lendo a sessão —
inclusive quando o GUC volta vazio em uma conexão reaproveitada do pool.

**Integração/RLS** (`tests/integration/rls.test.ts`) roda contra o banco real e
verifica que irmão não lê feedback, que a transferência só muda o responsável
após o aceite, que publicação e reorganização exigem papel de líder, que
nenhuma ponta do sistema aceita cuidado entre gêneros diferentes e que a
solicitação reservada não vaza para o líder.

**End-to-end** (`tests/e2e/`) cobre login, Minha
semana, discípulo marcando contato, líder marcando contato com o discípulo fixo
e com o irmão do rodízio, transferência com aceite, criação de atividade,
publicação da semana e pedido reservado de supervisão. Roda em desktop e em
viewport de celular, numa porta própria (5179) para não esbarrar em outro
projeto ocupando a porta padrão do Vite.

`tests/e2e/responsivo.spec.ts` percorre todas as telas em 360, 768, 1280 e
1440px e falha se alguma rolar na horizontal — apontando o elemento culpado. É
o que transforma "revisão visual" em algo que não regride.

**Verificação da geração** (`npm run verify:generation`) monta um GC com o mesmo
formato do real (2 líderes, 6 discípulos, 23 irmãos), pede a geração ao servidor
com o token de um líder e confere no banco: 29 cuidados, nenhum entre gêneros
diferentes, ninguém cuidado duas vezes, carga com diferença máxima de 1 em cada
pool e os 6 discípulos com seus líderes.

Na primeira vez, instale os navegadores do Playwright:

```bash
npx playwright install --with-deps
```

---

## PWA e notificações

### Instalar como app

O manifest e o service worker são gerados no build.

**iPhone — precisa ser pelo Safari.** O Chrome no iPhone não instala PWA.

1. Abra o endereço no **Safari**.
2. Toque no botão **Compartilhar** (o quadrado com a seta para cima, na barra
   de baixo).
3. Role a lista e toque em **Adicionar à Tela de Início**.
4. Confirme em **Adicionar**, no canto superior direito.
5. Abra pelo ícone novo — o app roda em tela cheia, sem a barra do navegador.

**Android — pelo Chrome.**

1. Abra o endereço no **Chrome**.
2. Toque nos três pontinhos (**⋮**) no canto superior direito.
3. Toque em **Instalar app** (ou *Adicionar à tela inicial*).
4. Confirme em **Instalar**.
5. Abra pelo ícone novo.

Instalado, o app trava o zoom de pinça — pelo `viewport` e também barrando os
eventos de gesto, porque o Safari ignora `user-scalable=no` em várias situações,
entre elas dentro de diálogos. Na aba do navegador o zoom continua liberado, e a ampliação do próprio
sistema (iOS/Android) funciona nos dois casos.

> 🪤 Os campos usam 16px no celular. Abaixo disso o Safari do iPhone dá zoom
> sozinho quando o campo recebe foco — e não desfaz. O layout parece quebrado e
> a causa fica escondida no tamanho da fonte.

Versão nova assume sozinha: quando o service worker troca, a página recarrega.
Num grupo de 33 pessoas ninguém vai limpar cache.

Depois de instalar, em **Notificações** ligue *Avisar neste aparelho*. No iPhone
essa opção só funciona depois da instalação — é limitação do Safari, e a tela
explica isso em vez de mostrar um botão que não funcionaria.

Os ícones saem de `node scripts/generate-icons.mjs`, a partir da marca guardada
em `scripts/marca.mask.mjs` — a imagem enviada pela liderança, recortada e
reamostrada uma vez. Ela fica ali como máscara, e não como PNG solto, para os
ícones poderem ser gerados em qualquer máquina, sem ferramenta de imagem
instalada. Dentro do aplicativo a mesma marca entra como máscara CSS sobre
`currentColor`: um arquivo só serve o tema claro, o escuro e o painel escuro da
tela de entrada, sempre com o contraste certo.

O cache guarda apenas o esqueleto da aplicação e as fontes. **Nenhuma resposta
autenticada é cacheada** — cuidado, feedback e conversa de supervisão nunca ficam
gravados no aparelho. Offline, a aplicação avisa e bloqueia gravações em vez de
enfileirar dados sensíveis em silêncio.

Para testar a instalação antes do deploy, `npm run preview` serve o build de
verdade em <http://localhost:4173>: como é localhost, o navegador aceita PWA e
push sem HTTPS.

### Notificações push

Tudo o que avisa alguém já passa por um funil único no banco (`app.notify`, que
grava em `notifications`). O push escuta **esse mesmo funil**: um gatilho publica
o aviso em `pg_notify` e o serviço, que mantém um `LISTEN` aberto, entrega no
aparelho. Não existe uma segunda regra de "quando avisar".

Se o serviço estiver fora do ar, o aviso interno continua gravado — o push é um
empurrão, nunca a fonte.

**O que aparece na tela de bloqueio.** Só o título, nunca o corpo. Os corpos citam
nomes ("A liderança atribuiu o cuidado de Fulano a você") e quem passa pelo lado vê
a tela do celular. O título da supervisão vira um aviso genérico pelo mesmo motivo:
ele denunciaria a existência de uma conversa reservada. A regra mora no banco
(`app.push_targets`), ao lado do dado, e o serviço de entrega só recebe bytes
prontos — ele não tem permissão de ler `notifications`.

Cada pessoa liga o aviso **por aparelho**, em *Notificações*. O endpoint pertence a
uma pessoa só: se outra entrar no mesmo navegador e ligar o aviso, a inscrição
anterior é descartada em vez de continuar recebendo no aparelho que não é mais dela.

**Para ligar**, gere as chaves uma vez e guarde no `.env`:

```bash
npm run vapid
```

Trocar o par depois invalida todas as inscrições — cada pessoa precisaria ligar o
aviso de novo. Sem as chaves, o app funciona inteiro; o card em *Notificações*
simplesmente não aparece.

No iPhone, o Safari só entrega push depois que a aplicação foi instalada na tela de
início. A tela explica isso em vez de mostrar um botão que não funcionaria.

---

## Deploy na VPS

Precisa de **Docker**, **git** e um domínio apontando para o IP da máquina.

```bash
# 1. na VPS, uma vez
git clone git@github.com:jhonata-jackson-tech/nc-discipulos.git cuidar-gc
cd cuidar-gc
cp .env.example .env
# preencha DOMAIN e gere cada segredo: openssl rand -hex 32
# gere também as chaves de push: npm run vapid

# 2. subir
npm run deploy       # ou: docker compose build && docker compose up -d
```

O Caddy pede o certificado ao Let's Encrypt sozinho na primeira subida — o
domínio já precisa estar resolvendo para o IP da VPS, e as portas 80 e 443
livres.

### Como está publicado hoje

`discipulos.igrejanovoscomecos.com.br` roda na VPS da igreja — um cPanel que já
atende outros sites. Três restrições da máquina, três modos de sobreposição:

| Restrição | Modo |
| --- | --- |
| Apache ocupa 80/443 | `docker-compose.proxy.yml` — Caddy só em `127.0.0.1:8081` |
| Bridge do Docker sem DNS (firewall bloqueia UDP 53) | `docker-compose.host.yml` — rede do host |
| Kernel 3.10 recusa o Postgres em container | `docker-compose.banco-do-host.yml` — PostgreSQL 16 nativo |

```bash
docker compose -f docker-compose.yml \
               -f docker-compose.host.yml \
               -f docker-compose.banco-do-host.yml up -d postgrest api web
```

As migrations, nesse caso, rodam pelo psql da máquina:

```bash
DB_DIR=/opt/cuidar-gc/db PGHOST=/tmp PGPORT=5433 PGDATABASE=cuidar ./scripts/migrate.sh
```

O Apache termina o TLS (certificado do `acme.sh`, renovação automática já
agendada) e repassa tudo para o Caddy. O vhost vive em
`/etc/apache2/conf.d/includes/post_virtualhost_global.conf` — o lugar do cPanel
que sobrevive a reconstruções.

> 🪤 Duas armadilhas que custaram tempo, documentadas para a próxima vez:
> o vhost precisa nascer com o **IP explícito** (`162.241.100.219:80`), porque
> um `*:80` sequer é consultado quando existe conjunto casando por IP exato; e
> o site do Caddy precisa de **host vazio** (`http://:8081`), senão o Host
> público repassado pelo Apache não casa e o Caddy responde 200 com corpo
> vazio — o pior tipo de erro, o que parece ter funcionado.

### Quando a máquina já tem um servidor web

Se a VPS já atende outros sites (um Apache do cPanel, por exemplo), tomar as
portas 80 e 443 derrubaria todos eles. Existe um modo para isso:

```bash
docker compose -f docker-compose.yml -f docker-compose.proxy.yml up -d
```

O Caddy passa a escutar apenas em `127.0.0.1:8081`, em HTTP puro, e quem termina
o TLS é o servidor que já existe. Basta apontar o domínio para essa porta:

```apache
<VirtualHost *:443>
  ServerName discipulos.exemplo.com.br
  SSLEngine on
  # ... certificado do próprio painel ...

  ProxyPreserveHost On
  RequestHeader set X-Forwarded-Proto "https"
  ProxyPass        / http://127.0.0.1:8081/
  ProxyPassReverse / http://127.0.0.1:8081/
</VirtualHost>
```

Nada do Cuidar GC fica exposto direto na internet — nem o banco, nem a API, nem
o próprio Caddy.

> Neste modo a API recebe `TRUST_PROXY_HOPS=2`, porque há duas camadas até ela.
> Sem isso, `req.ip` seria o IP do proxy e o freio de tentativas de senha valeria
> para todo mundo junto em vez de por pessoa.

O `migrate` roda antes da API e do PostgREST subirem: migrations novas entram
sozinhas no deploy, e o seed dos 33 integrantes só é aplicado se o banco estiver
vazio.

Depois do primeiro deploy, emita o convite de bootstrap (veja
[Primeiro acesso da liderança](#primeiro-acesso-da-liderança)).

### Atualizar

```bash
git pull && npm run deploy
```

### O que fica exposto

Só as portas 80 e 443, do Caddy. `db`, `postgrest` e `api` existem apenas na
rede interna do compose — o Postgres não escuta em porta pública nem com senha.

### Backup

O banco vive no volume `cuidar-gc_db-data`. Um dump diário fora da máquina é o
mínimo aceitável para dados de cuidado pastoral:

```bash
docker compose exec -T db pg_dump -U postgres -d cuidar --format=custom \
  > backup-$(date +%F).dump
```

Restauração:

```bash
docker compose exec -T db pg_restore -U postgres -d cuidar --clean --if-exists \
  < backup-2026-08-28.dump
```

Guarde os dumps **fora da VPS** (outro servidor, um bucket, seu computador) e
confira uma restauração de verdade antes de precisar dela.

---

## Estrutura de pastas

```
src/
  app/            rotas, navegação por papel e cliente de dados
  domain/         algoritmo de distribuição e fluxo de custo mínimo (puros)
  features/       uma pasta por assunto: auth, week, care, distribution,
                  activities, members, supervision, notifications, settings, setup
  components/
    ui/           primitivos (botão, campo, diálogo, tabela…)
    common/       peças compartilhadas (estados, badges, pessoa, indicadores)
    layout/       shell, guardas de rota e avisos globais
  lib/            datas, rótulos em pt-BR, erros, sessão e cliente de dados
  sw.ts           service worker: cache do esqueleto e notificações push
  types/          tipos do banco
server/           serviço de sessão e geração da semana (Express + pg)
db/
  migrations/     schema, RLS e funções de servidor
  tests/          asserções SQL das regras de negócio
  seed.sql        os 33 integrantes, sem dados inventados
  roles.sql       papéis de conexão (senhas vêm do ambiente)
tests/
  integration/    RLS e regras contra o banco real
  e2e/            fluxos críticos no navegador
scripts/
  lib/local.mjs   sessão e cliente de dados para scripts e testes
  migrate.sh      aplica migrations e seed no container `migrate`
  deploy.sh       publica na VPS
  cadastrar.mjs   cadastra um integrante e devolve o link de convite
  gerar-vapid.mjs chaves das notificações push
docker-compose.yml  · .dev.yml (local) · .proxy.yml (atrás de outro servidor)
Caddyfile · web.Dockerfile · server/Dockerfile
```

---

## Decisões que vale conhecer

**O algoritmo é um fluxo de custo mínimo, não uma escolha gulosa.** A primeira
versão escolhia, para cada pessoa, o cuidador com menos carga. Os testes
mostraram que isso faz o equilíbrio de carga atropelar a regra de não repetir
duplas: o cuidador mais livre podia ser justamente quem já cuidou daquela pessoa.
Modelar como fluxo resolve os dois critérios de uma vez — as capacidades
garantem a carga, os custos minimizam a repetição.

**O GC vem do vínculo da pessoa.** Consultas de semana, integrantes, atividades
e restrições filtram por `group_memberships`. O produto opera um único GC hoje,
mas "o primeiro grupo que existir" é uma suposição que quebra em silêncio — e
quebrou, nos testes, assim que existiu mais de um grupo no banco.

**Cadastro só por convite, e a regra mora no banco.** Um gatilho em
`auth.users` recusa qualquer conta criada sem um token de convite válido para
aquele e-mail. O banco guarda só o hash do token. Como a regra é do banco e não
do serviço de sessão, ela sobreviveu inteira à troca de toda a camada de
autenticação — inclusive os testes que a provam.

**A identidade continua sendo `auth.uid()`.** Ao sair do Supabase, a alternativa
óbvia era o servidor decidir quem vê o quê. Seria trocar dezenas de políticas de
RLS por dezenas de `if` espalhados — e um `if` esquecido vaza feedback de
cuidado. Em vez disso, o PostgREST publica as claims do JWT em
`request.jwt.claims` e `auth.uid()` lê o `sub` dali. Uma função de quatro linhas
manteve todo o resto de pé.

**Uma armadilha que os testes pegaram:** um GUC personalizado que já foi definido
alguma vez na sessão volta para a **string vazia** — não para NULL — quando a
transação termina. `''::jsonb` derruba a consulta seguinte naquela conexão do
pool, e o erro aparece longe dali, dentro de um gatilho de convite. Por isso
`auth.claims()` normaliza antes de converter, e `verify:db` verifica esse caso
específico.

**A transferência não é um botão que move o cuidado.** Até o aceite, a
responsabilidade — e a cobrança na tela de quem pediu — continua com o cuidador
original. Depois do aceite, a RLS deixa de mostrar aquela atribuição a quem
transferiu; a interface trata esse caso em vez de assumir que o dado sempre vem.

**O documento não rola: quem rola é o conteúdo.** No celular essa é a diferença
entre parecer um site e parecer um app. Com o documento rolando, a barra
inferior sobe junto com o dedo, o cabeçalho some e o iOS estica a página inteira
no fim da lista. O shell trava na altura do visor e a área de conteúdo é a única
com rolagem — `tests/e2e/responsivo.spec.ts` falha se isso regredir.

**O tema é uma classe, não uma media query.** `prefers-color-scheme` decide
apenas quando a escolha é "seguir o sistema". Um script inline no `index.html`
aplica a classe antes do primeiro paint, para não piscar branco em quem usa o
tema escuro. Todas as cores são tokens em `src/index.css` — nenhuma cor
literal nos componentes.

**O asterisco de campo obrigatório é só visual.** Ele vem de `content: '*' / ''`,
cujo texto alternativo vazio o mantém fora do nome acessível — quem usa leitor
de tela ouve "Senha", não "Senha asterisco".

---

## Pendências

- **Monitoramento** — hoje um erro inesperado morre no `console.error` do
  `ErrorBoundary`. Vale plugar um coletor de erros antes de abrir para o grupo.
- **Backup automático** — o comando existe e está documentado; falta agendar e
  mandar os dumps para fora da VPS.
- **Integração contínua** — `lint`, `typecheck`, `test` e `verify:db` ainda
  dependem de alguém lembrar de rodar.
