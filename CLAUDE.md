# CLAUDE.md — Contract Analyzer

Read this file before every task. Then read the section of `docs/ARCHITECTURE.md` for the feature
you are working on — it is the source of truth for design, folder layout, edge cases and
out-of-scope behaviour.
- `docs/ASSIGNMENT.md` — original requirements
- `docs/ARCHITECTURE.md` — how every feature is built (follow it; propose changes, don't drift)
- `docs/BUILD_PLAN.md` — feature slices (F0–F9), build order and acceptance checks
- `docs/NOTES.md` — running log of what was built, decisions and limitations (you append to it)

## Product in one paragraph
Legal contract analysis app. Upload PDF/DOCX, chat with it; every answer is backed by quotes that
OUR CODE verified exist in the document; clicking a quote opens the document and highlights it.
Also: multi-document questions, clause-level version comparison with severity, and Part C Option 1:
tracked-change redlining written back into the original .docx. Single user, no auth. Target company:
Juriqa (private AI for UAE law firms) — expect AED amounts, DIFC/ADGM law. UI tone: calm, professional.

## Non-negotiable rules
1. The AI is never trusted. A quote is shown as genuine only if the verification feature found it
   in THAT document. Never use page numbers or offsets reported by the AI.
2. Never overclaim. Partial reading is always visible (coverage). Unsupported inputs get a clear
   message. Nothing is reported as done until it has been run and checked.
3. Offsets into `Document.fullText` are the backbone. Never store copies of text that drift from it.
4. Secrets (LLM key, Supabase service key) exist ONLY in `server/` env. The client has none.
5. Never commit `.env` or any key. Only `.env.example` with placeholder values.

## Repository layout (details and full trees in ARCHITECTURE.md section 1)
npm workspaces + Turborepo, three workspaces at the root (npm only — no pnpm/yarn):
```
client/   Next.js App Router — UI only (Tailwind v4, shadcn/ui, TanStack Query). No API routes.
server/   NestJS — REST + SSE, pg-boss worker, Prisma, Supabase Storage, Groq LLM.
shared/   zod contracts used by both: DTOs, SSE events, error codes, shared text rules.
docs/     ASSIGNMENT, ARCHITECTURE, BUILD_PLAN, NOTES
```
Both `client/src` and `server/src` are **feature-first**:
- server: `src/features/<feature>/` holds `<feature>.module.ts`, `.controller.ts`, `.service.ts`,
  `.repository.ts`, optional `prompts/`, a pure `domain/` folder and `__tests__/`.
  Cross-cutting code lives in `src/core/`; adapters (database, storage, queue, llm) in
  `src/infrastructure/`; env in `src/config/`.
- client: `src/features/<feature>/` holds `components/`, `hooks/`, `api.ts` and a public `index.ts`.
  `src/app/` is routing only. Shared UI in `src/components/` (`ui/`, `layout/`, `feedback/`).
  Design tokens in `src/theme/`. All UI text in `src/content/`. Framework glue in `src/lib/`.

## Stack decisions (do not swap without asking)
- Data: Supabase Postgres via Prisma (Session pooler URL, port 5432; never the IPv6-only direct URL).
  Full-text search with a generated tsvector column + GIN index. Queue: pg-boss in the same Postgres.
- Files: Supabase Storage private bucket. Render's disk is never used for persistence.
- LLM: Groq via `openai` SDK with `baseURL` from env; model from env; rate limiter + 429 retry.
- PDF: `pdfjs-dist` at the SAME pinned version in server and client. DOCX: mammoth (view/text),
  jszip + @xmldom/xmldom + diff (redline).
- Deploy: Render (`server` + `client` services, Singapore) + Supabase (Singapore) + Groq.
- **Pinned versions — never install these without the exact version:** Node 22.17.1,
  `@nestjs/*` 11.2.x (CommonJS, not 12), `prisma` / `@prisma/client` / `@prisma/adapter-pg` 7.10.0,
  `pg-boss` 11.1.2, `pdfjs-dist` 6.3.289 (same in client and server). `shared/` builds to `dist`.
- Pre-build review decisions D1–D23 are in ARCHITECTURE.md section 17 — they override anything
  older you may assume.

## Code standards
**General**
- TypeScript strict everywhere. No `any`, no non-null `!` without a comment explaining why.
- Files kebab-case; React components PascalCase; path aliases instead of deep relative imports.
- Small files, single responsibility, descriptive names. Comments explain WHY, not what.
- Validate every input with zod schemas from `@ca/shared`.

**Server**
- Layering: controller → service → repository / domain / infrastructure. Controllers only
  validate and delegate. Prisma is used ONLY in `*.repository.ts` files.
- `domain/` is pure: no Nest decorators, no Prisma, no network, injected time. Most tests live here.
- A feature uses another feature only through its module exports, never its internal files.
- Errors: throw `AppError(code, status, userMessage)`; the global filter formats them. Never leak
  stack traces or raw provider errors to the client.
- Structured logging with pino; include requestId / documentId / jobId.

**Client**
- `src/app/` pages only compose feature components. No fetching, logic or styling decisions there.
- Import a feature only through its `index.ts`.
- **Design tokens:** every colour, font, text size, spacing, radius, shadow, z-index and motion value
  is defined ONLY in `src/theme/tokens.ts`. Components use the token-backed Tailwind classes or
  `import { tokens } from '@/theme'`. No hex/rgb literals and no Tailwind arbitrary values
  (`text-[13px]`, `bg-[#fff]`) anywhere else — lint enforces it.
- Semantic tokens are named by meaning (`verified`, `severityHigh`, `statusFailed`), never by hue.
- **UI text:** every user-facing string comes from `src/content/copy.ts`; error codes map to
  messages in `src/content/error-messages.ts`. No inline sentences in components.
- Every screen has loading, empty and error states (from `src/components/feedback/`).

**Tests**
- Unit tests for every `domain/` folder, `shared/src/text`, and `client/src/features/viewer/lib`.
- LLM always mocked. Fixtures in `server/test/fixtures/`.

## How to work (every slice)
1. Read the slice in `docs/BUILD_PLAN.md` and the matching ARCHITECTURE.md sections.
2. Produce a plan: files to create/change (with their feature folder), why, and which ✓ edge cases
   you will cover.
3. Implement. Tests alongside (tests FIRST for verification, redline, comparison detectors).
4. Run `npm run typecheck`, `npm run lint`, `npm test`. Fix until green.
5. Report honestly: what works, what was checked, what is not done. Never say "should work".
6. Append to `docs/NOTES.md`: what was built, decisions, known limitations.
7. Do not build anything outside the current slice, and no extras unless asked.
8. Build each slice top to bottom: `shared/` contract → server domain → server service/controller
   → client api/hooks → client components. A slice is not done until it works in the browser.

## Commands
- `npm install` — always from the repo ROOT (one package-lock.json at the root)
- `npm run dev` — run server + client (turbo)
- `npm run typecheck` / `npm run lint` / `npm test`
- `npm run dev -w @ca/server` / `npm run dev -w @ca/client` — run one side
- `npm run prisma:migrate -w @ca/server` — migrations (script runs `prisma migrate dev`)
- `npm install <pkg> -w @ca/server` — add a dependency to one workspace
- Internal dependency is written `"@ca/shared": "*"` (npm does not support `workspace:*`)