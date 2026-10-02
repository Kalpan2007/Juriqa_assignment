# ARCHITECTURE.md — Contract Analyzer

Senior-level design for every feature. This is the source of truth for HOW things are built.
`CLAUDE.md` holds working rules, `docs/BUILD_PLAN.md` holds the order of work,
`docs/ASSIGNMENT.md` holds the original requirements.

Every feature section has the same shape:
**Goal → Design → API → Rules → Edge cases handled (✓) → Out of scope (✗) → Acceptance checks**.
"Out of scope" items are never silently broken: the app shows a clear, honest message instead.

---

## 0. Principles

1. **The AI is never trusted. Our code is the judge.** Every quote shown as genuine has been found
   in that exact document by our verifier. AI-reported pages/offsets are ignored.
2. **Never overclaim.** If we read part of a document, the answer says so. If a feature cannot
   handle an input, the UI says so. The README says exactly what works and what does not.
3. **Offsets are the backbone.** Each document's text is stored once (`fullText`). Pages, chunks,
   quotes, highlights, comparisons and redlines all point into it by character offset.
4. **Thin edges, rich core.** Controllers validate and delegate. Domain logic lives in pure,
   unit-tested modules with no framework or I/O inside.
5. **Contracts are shared and typed.** Every request, response and stream event is a zod schema in
   `shared/` (`@ca/shared`), used by both the server (validation) and the client (types + parsing).
6. **Fail loudly, recover safely.** Jobs are durable and retryable; every error reaches the user as
   a readable message with a stable error code.
7. **Feature-first, single sources of truth.** Code is grouped by feature in both `client/` and
   `server/`. Visual values live only in `client/src/theme/tokens.ts`; user-facing text lives only
   in `client/src/content/`; API contracts live only in `shared/`.

---

## 1. System overview

```
 Browser
   │  HTTPS (REST + SSE)
   ▼
 client/   — Next.js (UI only: pages, features, theme; no secrets, no DB access)
   │  fetch to NEXT_PUBLIC_API_URL
   ▼
 server/   — NestJS (REST + SSE, validation, single user, no auth)
   ├── features/      documents, verification, retrieval, chat, comparison, redline, health
   ├── worker         pg-boss job handlers (document processing) — same process
   ├── domain logic   pure functions inside each feature's domain/ folder
   └── infrastructure database (Prisma), storage, queue (pg-boss), llm (Groq), logger
         │                    │                        │
         ▼                    ▼                        ▼
   Supabase Postgres    Supabase Storage          Groq API
   (data + FTS +        (original files,          (OpenAI-compatible,
    pg-boss queue)       redlined .docx)           gpt-oss-20b)

 shared/   — zod contracts used by BOTH client and server (DTOs, SSE events, error codes, text rules)
```

### Why a separate server (NestJS) instead of Next.js route handlers
- Clear separation of concerns: the client is presentation only; all secrets, I/O and business
  rules live in one service with modules, DI, guards, pipes, filters and interceptors.
- Long-running work (150-page processing, thorough scans) belongs in a backend process with a
  durable queue, not in a request/response UI server.
- Testability: domain modules are framework-free; Nest providers are mockable.

### Why NestJS (Node) and not FastAPI
- One language end to end: zod schemas and types shared between server and client (no drift).
- PDF text extraction uses **pdf.js on both sides** (server extracts, browser renders). Same engine
  and pinned version ⇒ the server's text items line up with the browser's text layer, which is what
  makes precise highlighting possible. A Python extractor would produce different text items than
  the browser renderer and need a separate geometric mapping layer.
- DOCX XML manipulation is equally solid in Node (`jszip` + `@xmldom/xmldom`).
- (Note: the strongest Python PDF library, PyMuPDF, is AGPL-licensed — a real concern for a
  commercial legal product.)

### Repository layout (npm workspaces + Turborepo)
Three workspaces at the root, named by role: `client`, `server`, `shared`. Inside client and
server, code is organised **feature-first**: everything a feature needs lives in its own folder.
```
contract-analyzer/
├── client/                 Next.js app (package name: @ca/client)
├── server/                 NestJS app  (package name: @ca/server)
├── shared/                 contracts   (package name: @ca/shared)
├── docs/                   ASSIGNMENT.md, ARCHITECTURE.md, BUILD_PLAN.md, NOTES.md
├── .github/workflows/ci.yml  typecheck, lint, test on every push
├── package.json            "workspaces": ["client", "server", "shared"] + root scripts via turbo
├── package-lock.json       the ONLY lockfile (npm install always runs from the root)
├── turbo.json
├── tsconfig.base.json      strict TS settings extended by all three workspaces
├── eslint.config.mjs       shared lint rules (import boundaries, no hard-coded styles)
├── .prettierrc
├── CLAUDE.md
└── README.md
```

### server/ — feature-first NestJS
```
server/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── main.ts                     bootstrap: helmet, CORS, pino, global pipe/filter, shutdown hooks
│   ├── app.module.ts               imports infrastructure + every feature module
│   │
│   ├── config/                     env.schema.ts (zod), config.module.ts, config.service.ts (typed)
│   │
│   ├── core/                       cross-cutting, used by every feature
│   │   ├── errors/                 app-error.ts, error-codes (re-exported from @ca/shared)
│   │   ├── filters/                all-exceptions.filter.ts → { error: { code, message, requestId } }
│   │   ├── pipes/                  zod-validation.pipe.ts
│   │   ├── interceptors/           logging.interceptor.ts
│   │   ├── middleware/             request-id.middleware.ts
│   │   ├── sse/                    sse-writer.ts (typed event writer over POST response)
│   │   └── utils/                  tokens.ts (estimate), hash.ts, ranges.ts
│   │
│   ├── infrastructure/             adapters to the outside world, one folder per adapter
│   │   ├── database/               prisma.module.ts, prisma.service.ts
│   │   ├── storage/                storage.module.ts, storage.service.ts (Supabase Storage)
│   │   ├── queue/                  queue.module.ts, queue.service.ts (pg-boss), job-names.ts
│   │   └── llm/                    llm.module.ts, llm.service.ts, rate-limiter.ts,
│   │                               structured-call.ts, llm-usage.repository.ts
│   │
│   └── features/
│       ├── documents/
│       │   ├── documents.module.ts
│       │   ├── documents.controller.ts       POST/GET/DELETE /documents, file + content streams
│       │   ├── documents.service.ts          orchestration (upload, delete, read models)
│       │   ├── documents.repository.ts       all Prisma access for Document/Page/Chunk
│       │   ├── processing/
│       │   │   ├── document-processing.worker.ts   pg-boss handler, status stages
│       │   │   └── stuck-jobs.recovery.ts          re-enqueue on boot
│       │   ├── domain/                       PURE functions, no Nest/Prisma/IO
│       │   │   ├── file-sniffer.ts
│       │   │   ├── pdf-extractor.ts
│       │   │   ├── docx-extractor.ts
│       │   │   ├── scanned-detector.ts
│       │   │   ├── boilerplate-detector.ts
│       │   │   ├── clause-segmenter.ts
│       │   │   └── chunker.ts
│       │   └── __tests__/
│       ├── verification/
│       │   ├── verification.module.ts        exports QuoteVerifierService (with LRU cache)
│       │   ├── quote-verifier.service.ts
│       │   ├── domain/                       normalizer.ts, quote-finder.ts (PURE)
│       │   └── __tests__/
│       ├── retrieval/
│       │   ├── retrieval.module.ts
│       │   ├── retrieval.service.ts          picks mode, returns chunks + coverage
│       │   ├── chunk-search.repository.ts    FTS SQL (tsvector, ts_rank_cd)
│       │   ├── domain/                       question-classifier.ts, budgeter.ts, coverage.ts
│       │   └── __tests__/
│       ├── chat/
│       │   ├── chat.module.ts
│       │   ├── chat.controller.ts            chats CRUD + POST messages (SSE)
│       │   ├── chat.service.ts               single + multi-document orchestration
│       │   ├── chat.repository.ts
│       │   ├── thorough-runner.ts            map-reduce with progress events
│       │   ├── prompts/                      answer.prompt.ts, thorough-map.prompt.ts, multi-doc.prompt.ts
│       │   ├── domain/                       answer-stream-parser.ts, quote-payload.ts,
│       │   │                                 history-builder.ts, answer-status.ts
│       │   └── __tests__/
│       ├── comparison/
│       │   ├── comparison.module.ts
│       │   ├── comparison.controller.ts
│       │   ├── comparison.service.ts
│       │   ├── comparison.repository.ts
│       │   ├── comparison.worker.ts
│       │   ├── prompts/                      change-summary.prompt.ts
│       │   ├── domain/                       segmenter.ts, aligner.ts, change-detectors.ts,
│       │   │                                 severity.ts, word-diff.ts
│       │   └── __tests__/
│       ├── redline/
│       │   ├── redline.module.ts
│       │   ├── redline.controller.ts
│       │   ├── redline.service.ts
│       │   ├── redline.repository.ts
│       │   ├── prompts/                      edit-planner.prompt.ts
│       │   ├── domain/                       docx-package.ts, paragraph-model.ts, run-splitter.ts,
│       │   │                                 revision-writer.ts, edit-locator.ts, simulators.ts
│       │   └── __tests__/
│       └── health/
│           ├── health.module.ts
│           └── health.controller.ts          /health/live, /health/ready
└── test/
    ├── fixtures/                   real PDFs/DOCX (large ones gitignored)
    └── integration/                API tests with mocked LLM
```
**Server rules**
- Layering inside a feature: `controller → service → (repository | domain | infrastructure)`.
  Controllers never touch Prisma. Repositories are the only place Prisma is used.
- `domain/` folders are pure TypeScript: no decorators, no Prisma, no network, no `Date.now()`
  without injection. This is where the hard logic lives and where most tests point.
- A feature uses another feature only through what its module `exports` (e.g. chat imports
  `VerificationModule` and uses `QuoteVerifierService`), never by importing its internal files.
- Prompts are versioned TypeScript files inside the feature that owns them.

### client/ — feature-first Next.js
```
client/
├── public/                         favicon, static images
├── src/
│   ├── app/                        ROUTES ONLY — thin pages that compose features
│   │   ├── layout.tsx              fonts, ThemeStyles, providers, AppShell
│   │   ├── globals.css             Tailwind import + token → utility wiring (no raw values)
│   │   ├── page.tsx                Library
│   │   ├── documents/[id]/page.tsx Document workspace (viewer + chat)
│   │   ├── ask/page.tsx            Multi-document questions
│   │   ├── compare/page.tsx        Pick versions
│   │   ├── compare/[id]/page.tsx   Comparison result
│   │   ├── redline/[id]/page.tsx   Redline workspace
│   │   ├── not-found.tsx
│   │   └── error.tsx               route-level error boundary
│   │
│   ├── theme/                      ★ SINGLE SOURCE OF DESIGN TOKENS (see section 13.1)
│   │   ├── tokens.ts               colors (light/dark, semantic), typography, spacing, radius,
│   │   │                           shadows, z-index, motion, layout sizes
│   │   ├── theme-styles.tsx        renders tokens as CSS variables in <head>
│   │   └── index.ts
│   │
│   ├── content/                    ★ SINGLE SOURCE OF UI TEXT
│   │   ├── copy.ts                 every label, heading, empty-state, tooltip, button text
│   │   └── error-messages.ts       ErrorCode (from @ca/shared) → friendly title + description
│   │
│   ├── features/                   one folder per product feature
│   │   ├── library/
│   │   │   ├── components/         DocumentTable, UploadDropzone, DocumentStatusBadge, DeleteDialog
│   │   │   ├── hooks/              useDocuments, useUploadDocument, useDeleteDocument
│   │   │   ├── api.ts              typed calls for this feature (uses lib/api-client)
│   │   │   └── index.ts            public exports — other code imports ONLY from here
│   │   ├── chat/
│   │   │   ├── components/         ChatPanel, MessageList, MessageBubble, QuoteChip,
│   │   │   │                       CoverageLine, AnswerStatusBanner, ChatInput, ChatHistoryList
│   │   │   ├── hooks/              useChat, useSendMessage (SSE + AbortController), useChats
│   │   │   ├── api.ts
│   │   │   └── index.ts
│   │   ├── viewer/
│   │   │   ├── components/         DocumentViewer, PdfViewer, PdfPage, DocxViewer,
│   │   │   │                       HighlightOverlay, OccurrenceNavigator, ZoomControls
│   │   │   ├── hooks/              useHighlight, usePdfDocument, useVirtualPages
│   │   │   ├── lib/                text-layer-matcher.ts, range-to-rects.ts (pure, tested)
│   │   │   └── index.ts
│   │   ├── multi-doc/
│   │   │   ├── components/         DocumentPicker, MultiDocChat
│   │   │   └── index.ts
│   │   ├── compare/
│   │   │   ├── components/         VersionPicker, ChangeList, ChangeCard, SeverityBadge,
│   │   │   │                       ChangeFilters, InlineDiff, SideBySideDiff, ComparisonSummary
│   │   │   ├── hooks/              useComparison, useStartComparison
│   │   │   ├── api.ts
│   │   │   └── index.ts
│   │   └── redline/
│   │       ├── components/         InstructionForm, ProposedEditList, ProposedEditCard, DownloadPanel
│   │       ├── hooks/              usePlanRedline, useApplyRedline
│   │       ├── api.ts
│   │       └── index.ts
│   │
│   ├── components/                 shared, feature-agnostic UI
│   │   ├── ui/                     shadcn/ui primitives (button, dialog, badge, tooltip, …)
│   │   ├── layout/                 AppShell, Sidebar, PageHeader, SplitPane
│   │   └── feedback/               LoadingState, EmptyState, ErrorState, Skeletons, Toaster
│   │
│   ├── lib/                        framework glue
│   │   ├── api-client.ts           typed fetch: base URL, JSON, zod parsing, ApiError
│   │   ├── sse-client.ts           POST + ReadableStream reader, zod-validated events, abort
│   │   ├── query-client.ts         TanStack Query defaults
│   │   └── cn.ts                   className merge helper
│   │
│   ├── config/
│   │   └── env.ts                  NEXT_PUBLIC_API_URL validated with zod
│   └── providers/
│       └── app-providers.tsx       QueryClientProvider, Tooltip provider, Toaster
├── next.config.ts
├── components.json                 shadcn config (points at theme tokens)
└── tsconfig.json                   path aliases: @/theme, @/content, @/features/*, @/components/*, @/lib/*
```
**Client rules**
- `app/` contains routing only: a page imports feature components and composes them; no business
  logic, no fetch calls, no styling decisions.
- Feature folders own their components, hooks and API calls. Other code imports a feature only
  through its `index.ts` (enforced by an ESLint import-boundary rule).
- No colour, font, size, radius, shadow or spacing value is written outside `src/theme/tokens.ts`.
  Components use token-backed Tailwind classes (`bg-surface`, `text-fg-muted`, `rounded-card`) or
  import from `@/theme` when JS needs a value (e.g. canvas highlight colour).
- No user-facing sentence is written inline in a component; it comes from `src/content/`.

### shared/ — contracts used by both sides
```
shared/
└── src/
    ├── documents/        document.schema.ts (DTOs, DocumentStatus, DocumentKind)
    ├── chat/             chat.schema.ts, message.schema.ts, quote.schema.ts, sse-events.schema.ts
    ├── comparison/       comparison.schema.ts (ChangeType, Severity, change DTOs)
    ├── redline/          redline.schema.ts (edit DTOs, EditRejectionReason)
    ├── errors/           error-codes.ts (enum) + error-response.schema.ts
    ├── text/             docx-block-text.ts, split-range-by-page.ts, offsets.ts (pure, tested)
    └── index.ts
```
Shared is also feature-first. It contains no framework code — only zod schemas, enums, types and
small pure functions both sides must agree on.

### Tech choices (pinned decisions)
| Concern | Choice | Reason |
|---|---|---|
| Package manager | npm workspaces + Turborepo | Ships with Node; one root lockfile; turbo caches builds |
| Server framework | NestJS 11 (Express adapter) | Modules/DI, the team's strongest stack |
| Validation | zod schemas from `@ca/shared` + Nest ZodValidationPipe | One schema for server + client |
| ORM | Prisma | Typed queries, migrations |
| Database | Supabase Postgres (Session pooler URL) | Managed Postgres, FTS, pgvector later |
| Files | Supabase Storage, private bucket `contracts` | Render disk is ephemeral |
| Queue | pg-boss (Postgres-backed) | Durable jobs + retries without Redis |
| LLM | Groq via `openai` SDK with `baseURL` | OpenAI-compatible, fast, cheap |
| PDF | `pdfjs-dist` (same pinned version in server + client) | Text items align with text layer |
| DOCX view/text | `mammoth` → HTML | Clean HTML for reading view |
| DOCX redline | `jszip` + `@xmldom/xmldom` + `diff` | Direct OOXML editing |
| Logging | `nestjs-pino` | Structured logs with request ids |
| Rate limiting | `@nestjs/throttler` | Protect the public demo's LLM budget |
| Client UI | Next.js + Tailwind v4 + shadcn/ui + TanStack Query | Polished, consistent UI |
| Design system | `client/src/theme/tokens.ts` → CSS variables → Tailwind utilities | One place to change the look |
| Tests | vitest (shared, domain), Nest testing + supertest, Playwright smoke (optional) | |
| Deploy | Render: `server` + `client` web services, Singapore; Supabase Singapore | Same region |

### Naming conventions
- Files: kebab-case (`quote-finder.ts`, `chat-panel.tsx`). React components: PascalCase exports.
- Nest: `<feature>.module.ts`, `.controller.ts`, `.service.ts`, `.repository.ts`, `.worker.ts`.
- Tests next to the feature in `__tests__/`, named `<file>.test.ts`.
- Hooks start with `use`, live in the feature's `hooks/`.
- Path aliases instead of deep relative imports (`@/features/chat`, not `../../../features/chat`).

---

## 2. Data model (Prisma)

```
Document
  id            uuid
  name          string            original filename (display only, never used in storage keys)
  kind          PDF | DOCX
  sizeBytes     int
  sha256        string            duplicate detection
  status        UPLOADED | EXTRACTING | INDEXING | READY | FAILED
  statusDetail  string?           e.g. "Extracting page 42 of 150"
  errorCode     string?           e.g. SCANNED_PDF, ENCRYPTED_PDF, CORRUPT_FILE
  errorMessage  string?           user-readable
  pageCount     int?
  storageKey    string            documents/<id>/original.<ext>
  html          text?             DOCX only: mammoth HTML with data-block offsets
  fullText      text?             THE source of truth for offsets
  createdAt, updatedAt

Page            (PDF: real pages. DOCX: one virtual page.)
  documentId, number, startOffset, endOffset, width?, height?
  items         json              PDF: [{ i, str, start, end, x, y, w, h, eol }]

Chunk
  documentId, ordinal, heading?, clauseRef?, startOffset, endOffset, tokenCount, text,
  isBoilerplate bool
  tsv           tsvector GENERATED ALWAYS AS (to_tsvector('english', text)) STORED  + GIN index

Chat            id, title, createdAt
ChatDocument    chatId, documentId, alias ("D1", "D2"...)          (multi-doc support)

Message
  chatId, role USER | ASSISTANT, content, status STREAMING | DONE | STOPPED | ERROR,
  mode RETRIEVAL | THOROUGH, coverage json, errorCode?, usage json?, createdAt

Quote
  messageId, documentId, citation int, text, status VERIFIED | UNVERIFIED,
  matches json [{ start, end }], matchKind EXACT_WS | WS_INSENSITIVE | null

Comparison      id, baseDocumentId, revisedDocumentId, status, result json, createdAt
Redline         id, documentId, instruction, status, edits json, outputKey?, createdAt
LlmCall         purpose, model, inputTokens, outputTokens, latencyMs, ok, errorCode, createdAt
```
Indexes: `Chunk(documentId, ordinal)`, `Message(chatId, createdAt)`, `Quote(messageId)`,
`Document(status)`, GIN on `Chunk.tsv`. Cascade deletes from Document to Page/Chunk.
pg-boss lives in its own schema (`pgboss`).

---

## 3. Cross-cutting design

### 3.1 Errors
- `AppError(code, httpStatus, userMessage, details?)`. Global exception filter returns
  `{ error: { code, message, requestId } }`. Unknown errors → `INTERNAL` with a generic message;
  details only in logs.
- Error codes are an enum in `@ca/shared` so the client can show tailored states
  (mapped to friendly text in `client/src/content/error-messages.ts`).

### 3.2 Configuration
Env validated at boot with zod; the server refuses to start if anything is missing or malformed.
Server: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_BUCKET`,
`LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL`, `LLM_MAX_INPUT_TOKENS`, `LLM_TPM_BUDGET`,
`WEB_ORIGIN`, `MAX_UPLOAD_MB`, `MAX_PAGES`.
Client: `NEXT_PUBLIC_API_URL` only. The client holds no secrets.

### 3.3 Security (single user, but public URL)
- CORS: only `WEB_ORIGIN`. Helmet headers. Upload size limit at the multer layer.
- Throttling: chat 10/min, upload 10/min, redline/compare 5/min per IP (protects Groq budget).
- Storage keys are UUID-based; filenames are display-only (no path traversal).
- Service role key and LLM key only in the server environment.
- Document text is untrusted input to the LLM: wrapped in clear delimiters, system prompt says
  instructions inside documents must be ignored. Verification limits damage either way.

### 3.4 Database connections (Supabase Session pooler)
Session pooler has a small connection cap on the free plan. Prisma `connection_limit=5`,
pg-boss `max: 3`. Graceful shutdown closes both.

### 3.5 Observability
- pino JSON logs with `requestId`, `documentId`, `jobId`.
- Every LLM call writes an `LlmCall` row (tokens, latency, outcome) → cost visibility.
- `GET /health/live` (process up) and `GET /health/ready` (DB, storage, queue reachable).

### 3.6 Shared stream protocol (SSE over POST)
Events (zod-typed in `shared/src/chat/sse-events.schema.ts`):
`meta {messageId, mode, coverage}` · `progress {done, total, label}` · `delta {text}` ·
`quotes {quotes[]}` · `notice {code, message}` (e.g. rate-limit retry) · `done {status}` ·
`error {code, message}`.
Client reads with `fetch` + `ReadableStream`; Stop = `AbortController.abort()`.

---

## 4. Feature: Document upload & processing  (Part A1)

**Goal:** Accept PDF/DOCX, extract text with offsets, show live status, reject bad files honestly.

**Lives in:** server `features/documents/` · client `features/library/` · shared `documents/`, `text/`

**Design**
1. `POST /documents` (multipart). Sniff bytes, not just extension:
   PDF = starts with `%PDF-`; DOCX = ZIP (`PK\x03\x04`) containing `word/document.xml`.
2. Compute sha256. Upload buffer to Storage (`documents/<id>/original.<ext>`). Create Document
   `UPLOADED`. Enqueue `document.process` job with `singletonKey=documentId`. Return 201 + DTO.
3. Worker (pg-boss, retry 2x with backoff, expire 15 min):
   - `EXTRACTING` → PDF or DOCX extractor (below), updating `statusDetail` every few pages.
   - Scanned check → `FAILED/SCANNED_PDF` if no meaningful text.
   - `INDEXING` → boilerplate detection, chunking, insert Pages + Chunks in one transaction.
   - `READY`. Any failure → `FAILED` with code + readable message (after final retry).
4. On API start, documents stuck in `EXTRACTING/INDEXING` whose job is gone are re-enqueued
   (pg-boss already resumes active jobs after a crash; this is the safety net).
5. UI polls `GET /documents/:id` every 1.5 s while non-final (TanStack Query `refetchInterval`).

**PDF extraction (pdf.js, pinned version)**
- For each page: `getTextContent()`; for each item append `str` to `fullText`, record
  `{ i, str, start, end, x, y, w, h, eol }` (geometry from `transform` in PDF units).
- Separators belong to no item: `"\n"` after an item with `hasEOL`; a single `" "` between items on
  the same line when there is a visible horizontal gap (> 0.15 × font height) and neither side is
  already whitespace (prevents glued words like `theCompany`); `"\n\n"` between pages.
- Page rows store `startOffset/endOffset` and the item map.

**DOCX extraction**
- `mammoth.convertToHtml`. Post-process the HTML: each block element (`p, h1–h6, li, td, th`)
  gets `data-start` / `data-end`. Block text = concatenated text nodes in DOM order; blocks joined
  with `"\n"`. The SAME rule lives in `shared/src/text/docx-block-text.ts` so the browser maps offsets identically.
- Store `html` and `fullText`. One virtual Page.

**Scanned / unreadable detection**
- `avgCharsPerPage < 25` OR `≥ 80%` of pages have `< 10` characters ⇒ `SCANNED_PDF`.
- Mixed documents (some pages scanned): READY, but store `scannedPages[]` and show a warning
  banner "Pages 12–15 contain no readable text and were not analysed." Coverage accounts for it.

**Boilerplate detection (PDF)**
- Lines repeated at the top/bottom of > 50 % of pages (normalised, digits masked so "Page 3 of 150"
  matches "Page 4 of 150") are flagged. Their chunks get `isBoilerplate=true` and are excluded from
  retrieval and comparison. `fullText` is NOT modified (offsets stay valid).

**Chunking**
- Segment by clause headings (numbered `1.`, `1.2`, `Article IV`, `Section 5`, ALL-CAPS headings,
  DOCX heading/list blocks). Merge small segments, split big ones at paragraph/sentence boundaries.
- Target 800–1,200 tokens, 10 % overlap, never split inside a sentence when avoidable.
- Each chunk keeps `heading`, `clauseRef`, offsets, `tokenCount`.

**API**
`POST /documents` · `GET /documents` · `GET /documents/:id` · `GET /documents/:id/file` (stream from
Storage) · `GET /documents/:id/content` (pages+items or html) · `DELETE /documents/:id`

**Edge cases handled ✓**
- Wrong type (.png/.txt/.doc/renamed .exe) → 415 `UNSUPPORTED_TYPE`: "Only PDF and DOCX files are supported."
- Legacy `.doc` → specific message: "Old .doc format is not supported. Save as .docx and try again."
- Empty file / zero bytes → `EMPTY_FILE`. File over `MAX_UPLOAD_MB` → 413 with the limit stated.
- Password-protected PDF (pdf.js `PasswordException`) → `ENCRYPTED_PDF`.
- Encrypted/protected DOCX (OLE container, not ZIP) → `ENCRYPTED_DOCX`.
- Corrupt PDF/DOCX → `CORRUPT_FILE`.
- Over `MAX_PAGES` (default 500) → `TOO_MANY_PAGES` with the limit stated.
- Fully scanned → `SCANNED_PDF` (never READY). Partially scanned → READY + warning + coverage.
- Duplicate upload (same sha256) → allowed, UI shows "Same file as <name>" hint.
- Server restart mid-job → job resumes or is re-enqueued; status ends final.
- Delete during processing → job checks existence before each stage and exits cleanly;
  Storage object deleted; chats containing the document are deleted (confirm dialog says so).

**Out of scope ✗ (with honest behaviour)**
- OCR of scanned pages (message says OCR is not supported).
- Headers/footers, footnotes, endnotes, comments and text boxes in DOCX (mammoth ignores them) —
  documented in README.
- Arabic / RTL extraction quality (bonus extra, not attempted unless everything else is done).
- Embedded images, charts, handwritten annotations.
- Multi-user, auth, folders/tags.

**Acceptance checks**
- Each rejected type shows its specific message. Scanned PDF ends FAILED, never READY.
- 150-page PDF reaches READY with visible stage progress; `fullText.slice(page.start, page.end)`
  equals the page text; restart mid-processing still ends READY.

---

## 5. Feature: Quote verification  (Part A3 — the heart)

**Goal:** Decide, with our own code, whether a quote exists in a specific document, and where.

**Lives in:** server `features/verification/` (pure logic in `domain/`)

**Design (`verification/`, pure, zero I/O)**
- `normalize(text) → { norm, map }`, `map[k]` = index in original of normalised char `k`.
  Steps: NFKC (ligatures → letters) → curly quotes `‘’“”` → `'"` → dashes `‐‑‒–—―−` → `-` →
  remove soft hyphen U+00AD and zero-width chars → collapse whitespace runs (incl. NBSP) to one
  space → trim. **Case kept. Punctuation kept. Words never changed.**
- `findQuote(fullText, quote) → Match[]` in three passes, stopping at the first that matches:
  1. **EXACT_WS**: normalised quote in normalised text.
  2. **HYPHEN_BREAK**: also join `letter-\nletter` line-break hyphenation (`liabil-\nity`).
  3. **WS_INSENSITIVE**: all whitespace removed on both sides (handles extraction that glued or
     split words). Same characters, same order — paraphrases still fail.
- Matches mapped back through `map` to original `{start, end}`. All occurrences returned.
- Precompute and cache the normalised text per document (LRU) — 150-page docs are verified fast.

**Rules**
- Quote length after normalisation: < 8 chars → UNVERIFIED (too short to mean anything);
  > 1,500 chars → UNVERIFIED (model dumped text; ask for shorter quotes in the prompt).
- A quote is verified ONLY against the document the model attributed it to.
- Leading/trailing ellipses or quotation marks added by the model are stripped before matching.
  An ellipsis INSIDE a quote ("A ... B") is not supported → UNVERIFIED.
- No fuzzy matching, no edit distance, no case-insensitive fallback.

**Edge cases handled ✓**
Extra/missing spaces, line breaks, curly vs straight quotes, dash variants, ligatures, soft
hyphens, NBSP, line-break hyphenation, glued words, quote crossing a page break, quote found
multiple times (all matches kept), quote attributed to the wrong document (UNVERIFIED).

**Out of scope ✗**
Ellipsis-joined quotes, quotes that changed case ("The" vs "the"), translated quotes, quotes from
scanned pages, quotes that reorder or summarise words — all UNVERIFIED by design.

**Acceptance checks**
Unit tests for every ✓ and ✗ item above, plus 3 real excerpts from the 150-page fixture copied
across line breaks.

---

## 6. Feature: Retrieval & large documents  (Part A4)

**Goal:** Answer from the right parts of a big document, and never pretend to have read it all.

**Lives in:** server `features/retrieval/` · client coverage UI in `features/chat/`

**Two modes**
- **RETRIEVAL (default):** Postgres FTS — `websearch_to_tsquery('english', q)` ranked with
  `ts_rank_cd`, boosted ×1.5 when the chunk heading matches query terms. Fallback when FTS returns
  < 3 results: `plainto_tsquery` with OR-ed terms. Take ranked chunks until `LLM_MAX_INPUT_TOKENS`
  is reached (budgeter subtracts system prompt + history + reserve for output). Re-sort selected
  chunks into document order for the prompt.
- **THOROUGH:** map-reduce over ALL non-boilerplate chunks. Map: batches sized to the token budget,
  each returns `{ relevant: bool, findings: string, quotes[] }` (structured JSON). Reduce: one
  streaming call over the collected findings + verified quotes. Progress events per batch.

**When THOROUGH runs**
- User toggles "Read whole document".
- Question classifier (rules, no LLM) detects existence/absence/completeness intent:
  "is there", "does it contain/mention/include", "any … clause", "all …", "list every", "missing".
- Otherwise RETRIEVAL; if the answer comes back NOT_FOUND, the UI offers a one-click
  "Search the whole document" button (cost-aware escalation instead of automatic).

**Coverage (stored on every assistant message, always shown)**
`{ mode, chunksRead, chunksTotal, pagesCovered: [ranges], complete: bool, skippedPages: [...] }`
UI text: "Searched 9 of 140 sections (pages 3–5, 41, 88–90)" or "Read the whole document"
or "Read 96 of 140 sections — stopped early because the AI service was busy."

**Honesty rules in the prompt + post-check**
- RETRIEVAL mode prompt: "If the provided excerpts do not contain the answer, reply that it was not
  found in the reviewed sections. Never state that the document lacks something."
- Post-check: in RETRIEVAL mode, if the answer contains absolute-absence phrases ("does not contain",
  "there is no", "no such clause") the UI shows a warning chip "Based on 9 of 140 sections" next to
  it — the coverage line is never hidden.
- THOROUGH mode may state absence only when `complete=true`.

**Edge cases handled ✓**
Question with no keyword overlap (fallback query), very long question (truncated for FTS), answer
spread across distant clauses (multiple chunks, document order), definitions section relevance
(chunks whose heading contains "Definition" get a small boost when a defined Term appears in the
question), Groq rate limit mid-thorough (partial coverage, honest label).

**Out of scope ✗**
Embeddings/semantic search (optional extra; pgvector path documented), cross-reference resolution
("as defined in Section 4.2" is not followed automatically), tables parsed as structured data.

**Acceptance checks**
Clause on page ~140 of the long fixture is found in RETRIEVAL mode. Absence question auto-runs
THOROUGH with progress. Forced partial run shows partial coverage and no absolute claim.

---

## 7. Feature: Chat with a document  (Part A2)

**Goal:** Streaming answers with verified quotes, stoppable, saved, reopenable.

**Lives in:** server `features/chat/` · client `features/chat/` · shared `chat/`

**Design**
- `POST /chats` `{ documentIds: [id] }` → chat. `GET /documents/:id/chats`, `GET /chats/:id`.
- `POST /chats/:id/messages` `{ content, mode? }` → SSE stream:
  1. Persist USER message. Create ASSISTANT message `STREAMING`. Emit `meta`.
  2. Build context: retrieval/thorough (section 6) + last 3 turns of history (text only, no
     excerpts) for follow-up questions. Retrieval query = current question + previous user question.
  3. Prompt contract: answer only from excerpts; cite with `[n]`; after the answer output the line
     `---QUOTES---` then JSON `[{ "n": 1, "doc": "D1", "text": "..." }]`; quotes must be copied
     exactly; prefer 1–3 sentence quotes.
  4. **AnswerStreamParser**: forwards text before the delimiter as `delta`; keeps a tail buffer the
     length of the delimiter so a delimiter split across chunks is detected; everything after is
     buffered as JSON.
  5. On completion: parse JSON defensively (zod; tolerate code fences; on failure → zero quotes and
     a `notice`), verify each quote (section 5), persist Quotes, emit `quotes`, mark DONE, emit `done`.
  6. Citation markers `[n]` whose quote is UNVERIFIED render as a muted marker with a warning tooltip.
     Markers with no quote at all are shown as plain text (no fake link).
- **Stop:** client aborts → Nest detects `req.on('close')` → aborts the LLM request via
  AbortController → persists the partial content with status `STOPPED` → verifies any complete
  quotes already received (normally none, since quotes come last) → UI shows "Stopped" badge.
- **Answer status** derived and shown: ANSWERED (≥1 verified quote) · NOT_FOUND (model said so) ·
  UNSUPPORTED (text but 0 verified quotes → amber banner "No part of this answer could be verified
  against the document. Treat it with caution.").

**Edge cases handled ✓**
Delimiter split across stream chunks; model forgets the delimiter (whole text = answer, 0 quotes,
UNSUPPORTED banner); malformed JSON; duplicate quotes; quote numbering gaps; user sends a new
question while one is streaming (input disabled until done/stopped); browser refresh mid-stream
(message stays STREAMING server-side until finished, then DONE — reopen shows final text; a
STREAMING message older than 5 min is marked ERROR by a cleanup job); Groq 429 (notice event,
retry with `retry-after`, max 3); LLM timeout/auth error (ERROR status, readable message, retry
button); document deleted while chatting (404 with clear message).

**Out of scope ✗**
Editing or regenerating past messages, branching conversations, sharing chats, chat export (extra).

**Acceptance checks**
Word-by-word streaming; Stop keeps text after reload; "What is the CEO's salary?" → NOT_FOUND;
injected fake quote shows UNVERIFIED; a follow-up "and what about termination for convenience?"
works using history.

---

## 8. Feature: Viewer & citation highlighting  (Part B5)

**Goal:** Clicking a verified quote opens the document at the passage and highlights exactly it.

**Lives in:** client `features/viewer/` (pure mapping in `lib/`) · shared `text/`

**PDF design**
- The client renders pages with pdf.js (same pinned version as the server): canvas + `TextLayer`, virtualised
  (only pages near the viewport are rendered; placeholders keep scroll height from stored
  width/height).
- Highlight input: `{ start, end }` from the Quote match (never text search in the DOM).
- `splitRangeByPage(range, pages)` from `shared/src/text/` → per-page segments (cross-page quotes).
- For each page segment, find overlapping items (binary search on item offsets) → local char
  ranges inside each item.
- **Primary (precise):** after the text layer renders, confirm its spans match the stored items
  (`span.textContent === item.str` in order). Then build DOM `Range`s on the span text nodes and
  draw overlay rectangles from `range.getClientRects()` (relative to the page container).
- **Fallback (geometric):** if spans don't match, draw boxes from stored item geometry, slicing
  partial items proportionally by character count. Slightly less precise at partial-item edges;
  logged as a warning.
- Scroll the first segment into view (centred). Overlays recompute on zoom/resize.
- **Multiple occurrences:** navigator "1 of 3" with prev/next; the occurrence used in the answer
  context (inside a chunk the model saw) is shown first.

**DOCX design**
- Render stored HTML (sanitised) in a reading view styled like a document.
- Walk text nodes of blocks with `data-start/end`, using the shared block-text rule, to create
  DOM `Range`s → overlay rectangles. Scroll into view.

**Edge cases handled ✓**
Multi-line quotes, quotes crossing a page break, quotes starting/ending mid-item, repeated
quotes, zoom changes, pages not yet rendered (render then highlight), very long documents
(virtualisation), highlight cleared on new selection.

**Out of scope ✗**
Highlighting inside images/scanned regions, rotated text precision (falls back to item boxes),
user-created highlights/annotations, PDF form fields.

**Acceptance checks**
Single-line, multi-line, cross-page and repeated quotes highlight correctly on PDF and DOCX at
75 %, 100 % and 150 % zoom.

---

## 9. Feature: Multi-document questions  (Part B6)

**Goal:** One question across several documents, one comparative answer, per-document verified quotes.

**Lives in:** server `features/chat/` (multi-doc path) · client `features/multi-doc/`

**Design**
- `POST /chats` with 2–5 READY documents → aliases D1…Dn (stored in ChatDocument).
- Retrieval per document; budget split evenly, minimum 2 chunks per document; excerpts grouped
  under `=== D1: <name> ===` headings.
- Prompt: "Compare across documents. Structure the answer by topic, not by document. Every claim
  about a document must cite a quote from THAT document."
- Each quote's `doc` alias is resolved to a documentId and verified only against it. Unknown alias
  or missing doc → UNVERIFIED.
- Coverage is per document ("D1: 6 of 120 sections · D2: whole document").
- Quote chip shows the document name; click opens that document's viewer at the passage.

**Edge cases handled ✓**
Same question where only some documents contain an answer (answer must say which ones don't, in
the reviewed sections); quote that exists in D2 but labelled D1 (UNVERIFIED — never re-attributed
silently); a selected document deleted later (chat stays readable, that document's quotes become
unclickable with "Document deleted").

**Out of scope ✗**
More than 5 documents per question; THOROUGH mode across multiple documents (too costly —
UI explains and offers per-document thorough instead).

**Acceptance checks**
"Compare the liability caps" across 3 contracts → one comparative answer, each quote opens the
correct document highlighted; a mislabelled quote is UNVERIFIED.

---

## 10. Feature: Version comparison  (Part B7)

**Goal:** Clause-level differences between two versions, with plain-language substance and severity.

**Lives in:** server `features/comparison/` · client `features/compare/` · shared `comparison/`

**Design**
1. `POST /comparisons` `{ baseId, revisedId }` → job (cached by both documents' sha256).
2. **Segment** both into clauses (same segmenter as chunking, non-boilerplate only). DOCX auto
   numbering is NOT in the text, so DOCX segmentation uses block structure (headings, top-level
   list items) as well as text patterns.
3. **Align** with sequence alignment (Needleman–Wunsch style DP) over clauses using a similarity
   score (token-set Jaccard + normalised edit ratio). Content first, clause number only as a
   tie-breaker — because inserting one clause renumbers every clause after it.
   Post-pass: unmatched removed/added pairs with similarity > 0.85 ⇒ `MOVED`.
4. **Classify:** ADDED · REMOVED · MODIFIED · MOVED · UNCHANGED. Whitespace/punctuation-only
   differences count as UNCHANGED.
5. **Change detectors (code, deterministic)** on each MODIFIED pair, comparing old vs new:
   money (currency code/symbol + amount, e.g. AED 100,000 vs AED 1,000,000), percentages, durations
   (number + day/month/year), dates, plain numbers, obligation modals (shall/must/will ↔ may),
   negation added/removed, scope words (mutual, exclusive, sole, unlimited, all, any), party swaps.
6. **Severity floor (code):**
   HIGH: money/percentage change in a clause about liability, indemnity, payment, fees, penalties;
   governing law / jurisdiction change; obligation flip or negation change; REMOVED clause on a
   critical topic (liability, indemnity, termination, confidentiality, governing law, payment).
   MEDIUM: any detector fired elsewhere; ADDED/REMOVED clause on other topics; duration changes.
   LOW: wording changes with no detector fired.
7. **LLM summary:** batched (≤ 10 changes per call, structured JSON `{id, summary, significance,
   rationale}`). Final severity = max(code floor, LLM) — EXCEPT changes the code classified as
   cosmetic stay LOW. The UI shows which detectors fired ("Amount changed: AED 100,000 → AED
   1,000,000") so severity is explainable.
8. UI: summary header (counts by severity), filters (severity, type), sort (severity / document
   order), each change shows heading, badge, summary, inline word-diff, side-by-side toggle, and
   "Open in base / revised" links that highlight the clause in each document.

**Edge cases handled ✓**
Renumbering cascade, moved clauses, split/merged clauses (shown as MODIFIED + ADDED/REMOVED with a
note), PDF vs DOCX of the same contract (works on text), identical documents ("No substantive
differences found"), comparing a document with itself (blocked with message), very different
documents (> 70 % unmatched → banner "These look like different contracts, not versions").

**Out of scope ✗**
Formatting-only changes (bold, font) — text comparison only, stated in UI; table cell-level diff
(tables compared as text); three-way comparison; comparison of scanned documents.

**Acceptance checks**
Fixture pair shows every edit made and nothing invented; liability cap AED change = HIGH with
detector reason; reworded sentence = LOW; added and deleted clauses appear; renumbered clauses are
not reported as changed.

---

## 11. Feature: Tracked-change redlining  (Part C, Option 1)

**Goal:** A plain-language instruction becomes real Word tracked changes in the original .docx,
with all formatting preserved and only the changed text touched.

**Lives in:** server `features/redline/` · client `features/redline/` · shared `redline/`

**Pipeline**
```
instruction ──► EditPlanner (LLM, structured JSON) ──► edits[{find, replace, reason}]
            ──► EditLocator (verify `find` in DOCX paragraph model; unique; single paragraph)
            ──► user reviews proposed edits in UI, unticks any
            ──► RevisionWriter (per paragraph, right-to-left) ──► simulators (accept/reject check)
            ──► re-zip (only word/document.xml replaced) ──► Storage ──► download
```

**DocxPackage**: load ZIP with jszip, parse `word/document.xml` with @xmldom/xmldom; keep every
other part byte-identical; write back with the same entry order and compression.

**ParagraphModel** (per `w:p` in body, including table cells and content controls):
builds paragraph text + a char → (run node, text node, offset) map, walking in document order:
`w:t` → text · `w:tab` → `\t` · `w:br`/`w:cr` → `\n` · `w:noBreakHyphen` → `-` ·
`w:softHyphen` → skipped · `w:instrText` (field codes) → skipped · runs inside `w:del` → skipped ·
runs inside `w:hyperlink`, `w:fldSimple`, `w:sdtContent`, `w:smartTag` → included.

**EditPlanner (LLM)**: gets the instruction + the most relevant paragraphs (FTS over chunks, then
the paragraph texts from the model). Must return edits whose `find` is copied exactly from one
paragraph and is the smallest span that contains the change plus enough context to be unique.

**EditLocator**: normalise-and-find (same verifier rules) inside each paragraph's text.
- 0 matches in any paragraph but found in fullText across paragraphs → `CROSS_PARAGRAPH` (rejected).
- 0 matches anywhere → `NOT_FOUND` (rejected, shown as "AI proposed text that isn't in the document").
- > 1 match → `AMBIGUOUS` (rejected with the matches listed).
- Paragraph already containing tracked changes → `HAS_EXISTING_REVISIONS` (rejected).
- Overlapping edits in one paragraph → later one `OVERLAPS` (rejected).

**RunSplitter**: split a run at any char offset into two runs, deep-cloning `w:rPr` into both,
preserving `xml:space="preserve"` where text has leading/trailing spaces.

**RevisionWriter** for one edit:
1. Word-level diff (`diffWordsWithSpace`) of `find` vs `replace` → equal / delete / insert ops,
   so "AED 100,000" → "AED 1,000,000" only marks the number, not the sentence.
2. Map op ranges onto runs (split at boundaries).
3. delete → move the affected runs into `<w:del w:id w:author w:date>`, converting `w:t` → `w:delText`.
4. insert → new `<w:r>` with `w:rPr` cloned from the run at the insertion point (previous char's run;
   next run if at paragraph start), wrapped in `<w:ins w:id w:author w:date>`.
5. Revision ids are unique: start from max existing `w:id` in the document + 1.
   Author "Contract Analyzer", ISO date.

**Simulators (verification of our own output)**
- `acceptAll(xml)`: drop `w:del`, unwrap `w:ins` → paragraph texts must equal the expected new texts.
- `rejectAll(xml)`: drop `w:ins`, unwrap `w:del` (delText → t) → must equal the ORIGINAL texts exactly.
- Paragraphs not edited must be byte-identical before/after (serialise and compare).
If any check fails the request fails with `REDLINE_SELF_CHECK_FAILED` — a broken file is never offered.

**API**
`POST /documents/:id/redlines` `{ instruction }` → `{ redlineId, edits[] with status }`
`POST /redlines/:id/apply` `{ acceptedEditIds[] }` → builds file → `{ downloadUrl }`
`GET /redlines/:id/download` → streams the .docx (`Content-Disposition` with original name + "-redline").

**Edge cases handled ✓**
Text split across runs with different formatting (half bold), edits inside table cells, edits
inside hyperlinks, leading/trailing spaces, tabs and line breaks inside a paragraph, multiple
edits in one paragraph and across paragraphs, identical find/replace (dropped as no-op),
ambiguous/overlapping/cross-paragraph/not-found edits rejected with reasons, PDF documents
(redline disabled: "Tracked changes need the original .docx").

**Out of scope ✗ (rejected with a clear reason, listed in README)**
Inserting or deleting whole paragraphs / new clauses (stretch goal: insert new paragraph after an
existing one with copied `w:pPr` and inserted paragraph mark), formatting-only changes ("make it
bold"), edits in headers/footers/footnotes/comments/text boxes, editing paragraphs that already
have tracked changes, moves (`w:moveFrom/To`), table structure changes, numbering changes.

**Acceptance checks**
Opens without repair prompt in Word and LibreOffice; each edit is a separate accept/reject
revision; half-bold edit keeps both formats; 3 edits in one pass; "Reject all" restores the
original text; unrelated paragraphs byte-identical; simulators covered by unit tests on fixtures.

---

## 12. LLM layer (shared by chat, thorough, comparison, redline)

**Lives in:** server `infrastructure/llm/`; prompts inside each owning feature

- `openai` SDK with `baseURL = LLM_BASE_URL` (Groq). Model from env. Provider swap = env only.
- **Token budgeting:** estimate tokens (chars / 3.5, conservative) before every call; budgeter
  guarantees `input + max_output ≤ LLM_MAX_INPUT_TOKENS + output reserve`.
- **Rate limiter:** in-process token bucket using `LLM_TPM_BUDGET`; queued calls wait instead of
  failing. On 429: honour `retry-after`, max 3 retries, emit `notice` to the user.
- **Structured calls** (thorough map, comparison summaries, redline planning): JSON-schema
  response format when supported; ALWAYS validated with zod; one repair retry with the validation
  error appended; then fail with a readable error.
- **Timeouts:** 60 s per call, abortable via AbortSignal.
- **Usage logging:** every call → `LlmCall` row.
- **Prompts** live in versioned files inside the owning feature (`features/<feature>/prompts/*.ts`)
  with the rules from sections 6, 7, 9, 10, 11.

---

## 13. Frontend design

### 13.1 Theme system — one file for the whole look
`client/src/theme/tokens.ts` is the ONLY place where visual values are written. Changing a colour,
font or radius there changes it everywhere.

**What the file contains**
```ts
export const tokens = {
  color: {
    light: {
      bg:            '…',  // app background
      surface:       '…',  // cards, panels
      surfaceMuted:  '…',  // sidebar, table header
      border:        '…',
      fg:            '…',  // main text
      fgMuted:       '…',  // secondary text
      primary:       '…',  primaryFg: '…',
      focusRing:     '…',
      // semantic — named by MEANING, never by hue
      verified:      '…',  verifiedBg:   '…',
      unverified:    '…',  unverifiedBg: '…',
      danger:        '…',  dangerBg:     '…',
      severityHigh:  '…',  severityMedium: '…',  severityLow: '…',
      statusProcessing: '…', statusReady: '…', statusFailed: '…',
      highlight:     '…',  highlightActive: '…',   // citation overlay in the viewer
      diffInsert:    '…',  diffDelete: '…',
    },
    dark: { /* same keys */ },
  },
  font: {
    sans:  '…',   // UI text
    serif: '…',   // document reading view
    mono:  '…',   // clause numbers, ids
  },
  text: {        // type scale: size / line-height / weight
    display: {…}, h1: {…}, h2: {…}, h3: {…}, body: {…}, small: {…}, caption: {…},
  },
  space:  { 0: '0', 1: '4px', 2: '8px', 3: '12px', 4: '16px', 6: '24px', 8: '32px', 12: '48px' },
  radius: { sm: '…', md: '…', card: '…', pill: '9999px' },
  shadow: { card: '…', popover: '…', focus: '…' },
  z:      { sidebar: 10, header: 20, overlay: 40, modal: 50, toast: 60 },
  motion: { fast: '120ms', base: '200ms', easing: 'cubic-bezier(…)' },
  layout: { sidebarWidth: '…', chatPanelMin: '…', contentMax: '…' },
} as const;
```

**How it reaches the UI (no duplication)**
1. `theme-styles.tsx` (server component in `layout.tsx`) serialises `tokens` into CSS variables:
   `:root { --color-bg: …; … }` and `.dark { … }`.
2. `globals.css` wires those variables into Tailwind utilities with `@theme inline`
   (`--color-surface: var(--color-surface)` etc.). This file contains variable NAMES only, no values.
3. Components use utilities (`bg-surface text-fg-muted rounded-card shadow-card text-h2`).
4. JS that needs a value (pdf canvas overlay, charts) imports `tokens` from `@/theme`.
5. shadcn/ui primitives are configured to read the same variables, so third-party components match.

**Enforcement**
- ESLint: Tailwind arbitrary values (`text-[13px]`, `bg-[#fff]`) forbidden outside `src/theme/`.
- ESLint: hex/rgb/hsl literals forbidden outside `src/theme/`.
- Status/severity/quote states map to semantic tokens in ONE helper per concept
  (e.g. `severityStyle(severity)`), never re-decided inside components.

**Visual direction** — calm legal tool: warm neutral background, deep ink text, one restrained
accent; serif for document text, clean sans for UI; generous spacing; no playful elements.
Light mode is the default; dark mode supported by the same tokens.

### 13.2 UI text — one place for every sentence
- `client/src/content/copy.ts`: every label, heading, button, placeholder, tooltip, empty-state and
  confirmation text, grouped by feature (`copy.library.empty.title`, `copy.chat.stop`, …).
- `client/src/content/error-messages.ts`: maps each `ErrorCode` from `@ca/shared` to a friendly
  title + description + suggested action; falls back to the server's `message` for unknown codes.
- Components never contain user-facing sentences inline. This keeps tone consistent and makes a
  later Arabic translation a content change, not a code change.

### 13.3 Layout and states
- Layout: left sidebar (Library, Ask across documents, Compare), main area. Document workspace is
  a split view: viewer (left, resizable) + chat (right).
- Every screen has explicit **loading** (skeletons), **empty** (helpful next action), and **error**
  (message + retry) states, built from `components/feedback/`. Status badges: Uploaded ·
  Extracting (with detail) · Indexing · Ready · Failed (with reason).
- Quote chip states: Verified (clickable) · Unverified (not clickable, tooltip) · Document deleted.
- Coverage line under every answer; warning chips for partial coverage and unsupported answers.
- Accessibility: keyboard navigation for chat and quote chips, visible focus ring token,
  aria-live for streaming text, colour is never the only signal (icons + text on badges).
- Data fetching: TanStack Query; SSE via `lib/sse-client.ts` validating each event with zod.

---

## 14. Testing strategy

| Level | What | Tool |
|---|---|---|
| Unit (most tests) | every `domain/` folder on the server (verifier, normaliser, chunker, segmenter, aligner, detectors, severity, paragraph model, run splitter, revision writer, simulators, stream parser, budgeter), `shared/src/text`, `client/src/features/viewer/lib` | vitest |
| Fixture tests | real 150-page PDF extraction offsets; DOCX fixtures for redline round-trip; version pair for comparison | vitest |
| Integration | server endpoints with mocked LLM (deterministic responses) against a test schema — `server/test/integration` | Nest testing + supertest |
| Smoke (optional) | upload → ask → click quote → highlight on deployed URL | Playwright |

LLM is always mocked in automated tests. CI runs typecheck + lint + unit/fixture tests.

---

## 15. Deployment

- **Supabase** (Singapore): Postgres (Session pooler URL), private bucket `contracts`.
- **Render** (Singapore): two web services, both with the REPO ROOT as root directory (the npm
  lockfile and `shared/` live there):
  - `server` — build: `npm ci && npx turbo run build --filter=@ca/server...`
    (builds `@ca/shared` first, runs `prisma generate` + `nest build`);
    start: `npm run start:prod -w @ca/server` (= `prisma migrate deploy && node dist/main.js`).
  - `client` — build: `npm ci && npx turbo run build --filter=@ca/client...`;
    start: `npm run start -w @ca/client` (= `next start`).
  - Build filters on paths (`client/**`, `shared/**` / `server/**`, `shared/**`) so a client-only
    change does not redeploy the server.
  Paid instances during evaluation (free instances sleep after 15 min and would kill jobs).
- **Groq**: Developer plan with a spend limit.
- Health check path for Render: `/health/ready`.
- Secrets only in Render env settings. `.env.example` documents every variable.

---

## 16. Explicit global non-goals
Auth and multi-user · OCR · Arabic/RTL (extra) · embeddings (extra) · anonymisation (extra) ·
export (extra) · voice (extra) · mobile-first layout (desktop-first, responsive down to tablet) ·
real-time collaboration · editing documents in the browser.
Extras are attempted only after every Part A/B/C acceptance check passes.