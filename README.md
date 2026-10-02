# Jobusque

Camada visual e analítica, **somente leitura**, do repositório `job-search`. Os bots do `job-search` fazem o trabalho (análise de vagas, currículo, candidatura) e mantêm a Google Sheet de registro; este dashboard consolida e apresenta esses dados.

Plano de migração e estado atual: [`docs/plans/2026-09-25-job-search-visual-layer.md`](docs/plans/2026-09-25-job-search-visual-layer.md).

## Arquitetura

```
job-search (Git: regras) / Google Sheet (estado, read-only)
        ↓
estagios-dashboard local (next start)
        ↓
Auth.js + Google OAuth em localhost
```

- **Local-first**: roda na máquina do usuário. Sem deploy de produção configurado; não depende de Vercel.
- Sem banco: não usa Supabase. Sem IA e sem geração de PDF.
- Fonte operacional: Google Sheet de registro, lida server-side com service account read-only. O dashboard nunca escreve na Sheet. Sem configuração, usa a fixture local.
- O Git do `job-search` continua autoridade das regras e enums; o dashboard só apresenta.
- Acesso: login Google (Auth.js) restrito a `ALLOWED_EMAIL`.
- Telas: visão geral (`/`), lista (`/vagas`), vaga (`/vaga/[job_id]`), configurações (tema).

## Stack

Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Radix UI (shadcn/ui), Recharts, Vitest, Playwright.

## Desenvolvimento

```bash
pnpm install
pnpm dev              # http://localhost:3000
pnpm lint
pnpm format:check
pnpm test             # Vitest
pnpm test:e2e         # Playwright (Chromium)
pnpm build
pnpm exec tsc --noEmit  # o build não faz type-check
```

## Rodar localmente com a Sheet real

1. Copie `.env.example` para `.env.local` e preencha (nunca commite credenciais).
2. `JOB_SEARCH_DATA_SOURCE=sheets`, `JOB_SEARCH_SHEET_ID` e `GOOGLE_SA_JSON_PATH` apontando para o JSON da service account fora do repositório.
3. Auth: `ALLOWED_EMAIL`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET` e `AUTH_TRUST_HOST=true` (obrigatório para `next start`). Redirect URI do client OAuth: `http://localhost:3000/api/auth/callback/google`.
4. `pnpm build && pnpm start` e abra http://localhost:3000.
