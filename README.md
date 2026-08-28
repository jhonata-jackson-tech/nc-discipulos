# Cuidar GC

Aplicação privada para organizar o cuidado semanal, as atividades e o
acompanhamento de um Grupo de Crescimento.

Cada pessoa abre o sistema e vê, em uma tela só, o que precisa fazer naquela
semana. A liderança acompanha o andamento sem transformar o cuidado em cobrança,
e discípulos e líderes têm um canal reservado com a supervisão.

---

## Sumário

- [O que já está implementado](#o-que-já-está-implementado)
- [Stack](#stack)
- [Como rodar localmente](#como-rodar-localmente)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Banco de dados](#banco-de-dados)
- [Primeiro acesso da liderança](#primeiro-acesso-da-liderança)
- [A regra de distribuição](#a-regra-de-distribuição)
- [Papéis e permissões](#papéis-e-permissões)
- [Testes](#testes)
- [PWA](#pwa)
- [Deploy](#deploy)
- [Estrutura de pastas](#estrutura-de-pastas)

---

## O que já está implementado

| Área | Situação |
| --- | --- |
| Autenticação por convite, login, recuperação e primeiro acesso | ✅ |
| Papéis, integrantes, discipulado e restrições de rodízio | ✅ |
| Geração da semana no servidor, revisão, reorganização e publicação | ✅ |
| Minha semana, registro de contato, feedback e níveis de atenção | ✅ |
| Transferência com aceite e reorganização auditada do líder | ✅ |
| Atividades com múltiplos responsáveis e recorrência | ✅ |
| Supervisão reservada e anotações privadas | ✅ |
| Notificações internas | ✅ |
| PWA instalável com cache do shell | ✅ |
| Tema claro, escuro e "seguir o sistema" | ✅ |
| Testes unitários, de regras no banco, de RLS e end-to-end | ✅ |

Notificações push (fora do app) ficaram preparadas na arquitetura, mas não estão
ligadas — veja [Pendências](#pendências).

---

## Modo de demonstração

Para avaliar o produto com o GC cheio, sem precisar preencher tudo à mão:

```bash
npx supabase start
npx supabase functions serve generate-week   # em outro terminal
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

## Stack

- **React 19 + TypeScript + Vite 8**
- **Tailwind CSS v4** com tokens próprios e componentes no estilo shadcn/ui
- **React Router 7**, **TanStack Query 5**, **React Hook Form + Zod 4**
- **Supabase**: PostgreSQL, Auth, Row Level Security, funções de servidor e uma
  Edge Function para a geração semanal
- **vite-plugin-pwa** (manifest + service worker), **Lucide Icons**
- Tema claro/escuro por classe no `<html>`, com "seguir o sistema" como opção
- **Vitest + Testing Library** e **Playwright**
- Interface em `pt-BR`, datas em UTC no banco e `America/Sao_Paulo` na tela

---

## Como rodar localmente

Requisitos: **Node 20+**, **Docker** (para o Supabase local).

```bash
# 1. dependências
npm install

# 2. Supabase local (sobe Postgres, Auth, Storage e Studio)
npx supabase start

# 3. aplica migrations e o seed dos 33 integrantes
npx supabase db reset

# 4. variáveis de ambiente
cp .env.example .env.local
# preencha com a API URL e a anon key que o `supabase start` imprimiu

# 5. aplicação
npm run dev
```

A aplicação sobe em <http://localhost:5173> e o Studio do banco em
<http://localhost:54323>.

### Sem Docker

Você também pode apontar para um projeto Supabase na nuvem: crie o projeto,
rode `npx supabase link --project-ref <ref>` e depois `npx supabase db push`.

---

## Variáveis de ambiente

Crie `.env.local` a partir de `.env.example`:

| Variável | Onde usar | Descrição |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | frontend | URL do projeto Supabase |
| `VITE_SUPABASE_ANON_KEY` | frontend | Chave pública (`anon`). Nunca use a `service_role` aqui |
| `SUPABASE_SERVICE_ROLE_KEY` | testes | Só para preparar dados nos testes de integração e e2e |
| `SUPABASE_ANON_KEY` | testes | Mesma chave pública, lida fora do Vite |
| `E2E_BASE_URL` | testes | URL da aplicação nos testes Playwright |

O arquivo `.env.local` está no `.gitignore`. Nenhuma chave real deve ser
commitada.

---

## Banco de dados

As migrations ficam em `supabase/migrations/`, na ordem em que devem ser
aplicadas:

| Arquivo | Conteúdo |
| --- | --- |
| `..._core.sql` | Enums, `groups`, `profiles`, `group_memberships`, `discipleship_links`, `member_notes` |
| `..._care.sql` | `care_weeks`, `care_assignments`, `contact_logs`, `transfer_requests`, `pairing_restrictions` |
| `..._activities.sql` | `activities` e `activity_assignees` |
| `..._supervision.sql` | `supervision_requests` e `supervision_notes` |
| `..._notifications_audit.sql` | `notifications`, `audit_logs`, `invites` |
| `..._helpers_rls.sql` | Identidade da sessão, grants e todas as políticas de RLS |
| `..._rpc.sql` | Convites e vínculo da conta ao integrante |
| `..._rpc_week.sql` | Geração, publicação, contatos, transferências e reorganização |
| `..._rpc_admin.sql` | Atividades, supervisão, integrantes e indicadores |

Comandos úteis:

```bash
npm run db:reset      # recria o banco, aplica migrations e roda o seed
npm run db:push       # aplica migrations em um projeto remoto vinculado
npm run gen:types     # regenera os tipos a partir do schema real
```

### Verificação rápida sem Supabase

`scripts/verify-migrations.sh` sobe um Postgres descartável no Docker, aplica
todas as migrations, roda o seed duas vezes (conferindo a idempotência) e
executa `supabase/tests/rules.sql`, que exercita as regras que o banco precisa
garantir sozinho:

```bash
./scripts/verify-migrations.sh
```

### Seed

`supabase/seed.sql` cria o GC e os 33 integrantes com a grafia exata recebida da
liderança. **Nada é inventado**: e-mail, telefone, aniversário, senha, gênero de
cuidado e vínculo de discipulado ficam em branco e são confirmados pela
liderança no assistente de primeiro acesso. O seed é idempotente — rodar de novo
não duplica ninguém.

---

## Primeiro acesso da liderança

Não existe cadastro público. A conta só nasce a partir de um convite válido, e o
primeiro convite precisa ser emitido diretamente no banco, porque ainda não há
ninguém logado para emiti-lo.

No **SQL Editor** do Supabase (ou via `psql`), rode:

```sql
select * from public.create_bootstrap_invite('Jhonata Jackson', 'email-real@exemplo.com');
```

A função devolve um `token`. Monte o link e abra no navegador:

```
https://seu-dominio/convite?token=<token>&email=email-real@exemplo.com
```

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

```bash
npm test                   # unitários + componentes (integração é pulada sem Supabase)
npm run test:integration   # RLS e regras de negócio contra o banco
npm run test:e2e           # fluxos críticos no navegador
npm run verify:db          # migrations + seed + regras em um Postgres descartável
npm run verify:generation  # geração semanal ponta a ponta pela Edge Function
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

**Regras no banco** (`supabase/tests/rules.sql`, via
`./scripts/verify-migrations.sh`) exercitam as constraints e gatilhos sem
precisar do Supabase completo.

**Integração/RLS** (`tests/integration/rls.test.ts`) precisa do Supabase local:

```bash
npx supabase start
npx supabase status          # copie a anon key e a service_role key
SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:integration
```

Verificam que irmão não lê feedback, que a transferência só muda o responsável
após o aceite, que publicação e reorganização exigem papel de líder, que
nenhuma ponta do sistema aceita cuidado entre gêneros diferentes e que a
solicitação reservada não vaza para o líder.

**End-to-end** (`tests/e2e/`) precisa das mesmas variáveis e cobre login, Minha
semana, discípulo marcando contato, líder marcando contato com o discípulo fixo
e com o irmão do rodízio, transferência com aceite, criação de atividade,
publicação da semana e pedido reservado de supervisão. Roda em desktop e em
viewport de celular, numa porta própria (5179) para não esbarrar em outro
projeto ocupando a porta padrão do Vite.

`tests/e2e/responsivo.spec.ts` percorre todas as telas em 360, 768, 1280 e
1440px e falha se alguma rolar na horizontal — apontando o elemento culpado. É
o que transforma "revisão visual" em algo que não regride.

**Verificação da geração** (`npm run verify:generation`) monta um GC com o mesmo
formato do real (2 líderes, 6 discípulos, 23 irmãos), chama a Edge Function e
confere no banco: 29 cuidados, nenhum entre gêneros diferentes, ninguém cuidado
duas vezes, carga com diferença máxima de 1 em cada pool e os 6 discípulos com
seus líderes. Precisa de `npx supabase functions serve generate-week` rodando.

```bash
npx playwright install --with-deps
SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... npm run test:e2e
```

Sem as variáveis, integração e e2e são **pulados**, nunca falham.

---

## PWA

O manifest e o service worker são gerados pelo `vite-plugin-pwa` no build. Os
ícones em `public/icons/` são gerados por `node scripts/generate-icons.mjs` e
podem ser substituídos pela identidade definitiva do GC.

Para instalar no celular: abra a aplicação no Chrome ou Safari e use
**Adicionar à tela de início**.

O cache guarda apenas o shell da aplicação e as fontes. **Nenhuma resposta
autenticada é cacheada** — feedback de cuidado e conversas de supervisão nunca
ficam gravados no dispositivo pelo service worker. Offline, a aplicação mostra
um aviso e bloqueia gravações em vez de enfileirar dados sensíveis em silêncio.

---

## Deploy

**Frontend** — qualquer host estático com fallback para SPA (Vercel, Netlify,
Cloudflare Pages):

```bash
npm run build   # gera dist/
```

Configure `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no painel do host.

**Banco e Edge Function:**

```bash
npx supabase link --project-ref <ref>
npx supabase db push
npm run functions:deploy
```

No Supabase, em **Authentication → URL Configuration**, aponte o `Site URL` para
o domínio da aplicação e inclua `https://seu-dominio/definir-senha` nas URLs de
redirecionamento.

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
  lib/            datas, rótulos em pt-BR, erros e cliente Supabase
  types/          tipos do banco
supabase/
  migrations/     schema, RLS e funções de servidor
  functions/      Edge Function `generate-week`
  tests/          asserções SQL das regras de negócio
  seed.sql        os 33 integrantes, sem dados inventados
tests/
  integration/    RLS e regras contra o banco real
  e2e/            fluxos críticos no navegador
scripts/          ícones da PWA e verificação das migrations
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

**Cadastro só por convite, sem service_role no frontend.** Um gatilho em
`auth.users` recusa qualquer conta criada sem um token de convite válido para
aquele e-mail. O banco guarda só o hash do token.

**A transferência não é um botão que move o cuidado.** Até o aceite, a
responsabilidade — e a cobrança na tela de quem pediu — continua com o cuidador
original. Depois do aceite, a RLS deixa de mostrar aquela atribuição a quem
transferiu; a interface trata esse caso em vez de assumir que o dado sempre vem.

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

- **Notificações push** — o schema, a central interna e o service worker já
  existem; falta registrar as chaves VAPID e assinar os dispositivos.
- **Tipos gerados** — `src/types/database.ts` foi escrito à mão para o projeto
  nascer tipado sem depender de um banco ativo. Depois do primeiro
  `supabase db push`, vale rodar `npm run gen:types` e migrar para o arquivo
  gerado.
