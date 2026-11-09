# Checklist Kenkyo

Sistema de gerenciamento de checklists interno da operação Kenkyo — checklists diários e semanais, controle de acesso por perfil, dashboard de conformidade, relatórios e painel de gestão.

Reconstrução em stack real do [protótipo estático original](https://github.com/nayarasilva-nss/diacheck) (HTML/CSS/JS com `localStorage`), agora com banco de dados, autenticação real e dados isolados por usuário/data.

## Stack

- **Next.js** (App Router, TypeScript) — deploy no Vercel
- **Postgres** (via [Neon](https://neon.tech), integrado ao Vercel) + **Drizzle ORM**
- **Autenticação própria**: sessão em cookie assinado (JWT via `jose`), sem persistência entre reinícios do navegador (login exigido a cada nova sessão do navegador), senhas com hash `bcrypt`

## Perfis de acesso

Três perfis hierárquicos: **Gestor > Gerente > Líder**.

- **Gestor**: acesso total — executa checklists, vê dashboard/relatórios/histórico e acessa o painel **Gerenciar** (usuários, tipos de checklist, tarefas, modelos).
- **Gerente / Líder**: executam checklists e veem dashboard/relatórios/histórico. Sem acesso ao painel Gerenciar.

## Desenvolvimento local

### 1. Banco de dados

Use um Postgres local ou uma branch de desenvolvimento do Neon. Configure `.env.local` (não committado):

```bash
DATABASE_URL="postgresql://usuario@localhost:5432/kenkyo_dev"
AUTH_SECRET="uma-string-aleatoria-longa"        # ex: openssl rand -base64 32
SEED_ADMIN_USERNAME="admin"
SEED_ADMIN_PASSWORD="defina-uma-senha-forte"
```

### 2. Instalar dependências e migrar

```bash
npm install
npm run db:generate   # gera migrations a partir de lib/db/schema.ts
npm run db:migrate     # aplica migrations no banco
npm run db:seed        # cria o usuário Gestor inicial + templates padrão
```

O seed cria **apenas um usuário Gestor** (a partir das env vars acima). Os demais usuários devem ser criados pelo próprio painel **Gerenciar** após o primeiro login — nenhuma senha fica hardcoded no código ou no histórico do git.

### 3. Rodar o app

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000).

## Deploy (Vercel)

1. No dashboard do Vercel, conecte este repositório e provisione um banco **Postgres (Neon)** pela aba Storage do projeto — isso preenche `DATABASE_URL` automaticamente nas env vars do projeto.
2. Defina as demais env vars do projeto (Production/Preview): `AUTH_SECRET`, `SEED_ADMIN_USERNAME`, `SEED_ADMIN_PASSWORD`.
3. Rode as migrations e o seed contra o banco de produção (`npm run db:migrate` / `npm run db:seed` com o `DATABASE_URL` de produção).
4. Deploy normalmente pelo Vercel — o build usa `next build` (framework detectado automaticamente).

## Escopo (v1)

Deixados para uma iteração futura, por decisão explícita ao planejar esta reconstrução:

- **Modo offline** (fila local sincronizando quando a conexão volta) — hoje o app assume conexão de rede.
- **PDF real** — o botão "Enviar PDF" ainda gera um HTML estilizado para impressão/download (como no protótipo original), não um PDF binário.
- **Exportação para Excel**.

## Estrutura

```
app/
  login/                    tela de login
  (app)/                    grupo de rotas autenticadas (header + tabs)
    dashboard/  checklist/  relatorio/  historico/  gerenciar/
  api/checklists/[id]/export/   exportação HTML do checklist preenchido
lib/
  db/                       schema Drizzle + client de conexão
  auth/                     sessão (jose), DAL (verifySession/getCurrentUser), actions de login/logout
  data/                     queries de leitura por página
  actions/                  server actions de mutação (checklist, gerenciar)
proxy.ts                    redireciona não-autenticados e restringe /gerenciar ao perfil Gestor
scripts/seed.ts             cria o usuário Gestor inicial + templates padrão
```
