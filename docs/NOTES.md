# NOTES.md — build log

Running log written by Claude Code after every phase: what was built, decisions taken during the
phase, and known limitations. This becomes the source for the README "finished / not finished"
section and the submission note.

## Pre-build review
- Docs reviewed before any code. 23 issues found and resolved; see ARCHITECTURE.md section 17
  (D1–D23): version pins (NestJS 11 CJS, Prisma 7.10.0, pg-boss 11.1.2, pdfjs-dist 6.3.289,
  Node 22.17.1), shared built to dist, case-insensitive verification pass, renumbering-safe
  comparison, per-route throttling, scanned-page storage, Stop never marked unsupported,
  multi-document absence handling, section-based coverage, sanitised DOCX HTML, paginated
  page-item API, comparison cache key, SSE proxy headers.

## Pre-build review, second pass (before Phase 0)
Re-reviewed the updated docs; D1–D23 are all genuinely applied in the body sections, not just
listed in section 17. Four further issues found and fixed (D24–D27), and the version pins were
tested rather than assumed.

**Verified by running it (not from memory):**
- All pins exist and resolve: `@nestjs/core` 11.2.7, `prisma` / `@prisma/client` /
  `@prisma/adapter-pg` 7.10.0, `pg-boss` 11.1.2, `pdfjs-dist` 6.3.289, `sanitize-html` 2.18.0
  (+ `@types/sanitize-html` 2.16.2).
- `prisma@7.10.0` does export a `prisma/config` subpath (with a `require` condition, so it works
  from the CommonJS server), and `@prisma/adapter-pg@7.10.0` bundles `pg ^8.16.3`. Section 1's
  Prisma 7 approach is sound.
- `pdfjs-dist@6.3.289` ships `legacy/build/pdf.mjs`, `standard_fonts/`, `cmaps/` and a new `wasm/`.
  `await import()` of the legacy build from CommonJS works on Node 22.17.1 and returns `str`,
  `hasEOL`, `width`, `height` and `transform` per item — everything the section 4 separator rules
  and the section 8 geometric fallback need — with NO font warning once `standardFontDataUrl` and
  `cMapUrl` are set. Phase 0's "no font warning" check is achievable.

**Known limitation of that test:** it ran against a hand-built 2-line PDF, not a real contract.
Column layouts, embedded fonts and the 150-page fixture are still unproven; that is Phase 1's job.

**Not yet verified (needs credentials):** Supabase pooler connectivity, the real pool size behind
decision D16, Groq model id and TPM limits, and SSE behaviour through Render's proxy (D22).

**Fixed this pass:**
- D24 — one root `.env`/`.env.example` instead of one per workspace, and the server port renamed
  `SERVER_PORT` so a shared `PORT` cannot collide between client and server.
- D25 — pdf.js 6 needs `file://` URLs ending in `/` for `standardFontDataUrl` (a native Windows
  path throws `Invalid factory url`), and `PDFDocumentProxy.destroy()` has been removed: keep the
  loading task and call `loadingTask.destroy()`, or a 150-page job leaks memory.
- D26 — `docs/Notes.md` renamed to `docs/NOTES.md`; every reference used the upper-case name,
  which would have broken on Linux CI and Render while silently working on Windows.
- D27 — wrote `.gitignore` before any `.env` could exist. `.env` ignored, `.env.example`
  explicitly un-ignored; both checked with `git check-ignore`.

**Created:** `.gitignore`, `.env.example` (16 variables, cross-checked against section 3.2 —
no drift in either direction), `docs/NOTES.md`.


## Build plan restructured, feature-wise (before F0)
Replaced the phase-based plan with **vertical feature slices F0–F9** (decision D29), one per
assignment requirement, each built `shared/` contract → server domain → server service/controller
→ client api/hooks → client components, and demoable in a browser before it counts as done.
83 manual acceptance checks in total; every requirement in ASSIGNMENT.md (A1–A4, B5–B7, C1) and
every submission item (README, screenshots, 3–5 min video, submission note) maps to exactly one
owning slice.

Two slices stay engine-only on purpose: F2 (verification) and the first five steps of F8 (the
OOXML redline core), because they are pure logic that deserves tests-first isolation. Their UI
arrives in the slice that consumes them.

Added D28: a throwaway spike at the end of F1 that renders one PDF page and highlights a
hard-coded offset range. Section 8's precise highlighting path assumes the server's item offsets
line up with the browser's text layer, and F5 is built entirely on that assumption — cheaper to
disprove in F1 than after chat is stacked on top.

### Supabase connection — diagnosed against the live project
- The **Direct** connection (`db.<ref>.supabase.co`) has **no A record at all**, only AAAA
  (`2406:da14:...`). It failed with `ENOTFOUND` from this machine and would fail on Render, which
  has no IPv6 egress. The **Session pooler** (`aws-0-ap-northeast-1.pooler.supabase.com`) has three
  IPv4 addresses. Confirms the CLAUDE.md rule "never the IPv6-only direct URL" — now with evidence.
- D30: `sslmode=require` fails with `SELF_SIGNED_CERT_IN_CHAIN`. pg 8.16+ treats `require` as
  `verify-full`, and because Prisma 7 uses `@prisma/adapter-pg` (node-postgres) rather than the
  Rust engine's own TLS, the laxer Prisma semantics do not apply. `sslmode=no-verify` works and
  reaches authentication.
- Pooler usernames must be `postgres.<project_ref>`, not plain `postgres` — plain `postgres`
  returns `XX000` from Supavisor.
- **Still blocked:** the password currently in `.env` is 6 characters and is rejected with `28P01`
  (invalid password), so no query has yet succeeded. F0 cannot finish until the real session-pooler
  credentials are in place.
- D31: the project is in Tokyo while ARCHITECTURE section 15 specifies Singapore for Render.
  Unresolved — recreate in `ap-southeast-1`, or accept the cross-region latency and say so.


## F0 — Foundation (complete)

**Built:** npm workspaces + Turborepo (`shared` → `server`/`client` via `dependsOn: ["^build"]`),
root tsconfig/eslint/prettier, Node pinned to 22.17.1 via `.nvmrc` + `.node-version`.
`shared/`: error codes, error-response schema, document DTOs (including the paginated
`/layout`/`/pages` shapes from D20), offset primitives.
`server/`: zod-validated config from the single root `.env`, Prisma 7 + `@prisma/adapter-pg`,
full data model from section 2, `core/` (AppError, exception filter, zod pipe, request-id
middleware, logging interceptor, SSE writer with D22's proxy-safe headers), `infrastructure/`
(database, Supabase Storage, pg-boss, LLM client + token-bucket limiter), per-route throttling,
helmet, CORS, health endpoints, and placeholder modules for every feature so the structure is
visible from day one.
`client/`: `theme/tokens.ts` (full token set, light + dark, semantic names), `ThemeStyles`,
Tailwind v4 `@theme inline` wiring with variable names only, `content/copy.ts` +
`error-messages.ts`, typed api-client and SSE client, AppShell + sidebar, feedback states, and a
route for every screen.
Plus CI (typecheck, lint, test, build, secret scan) and `render.yaml`.

**Verified by running it, not assumed:**
- Supabase: schema applied through the session pooler; `Chunk.tsv` is `GENERATED ALWAYS` with its
  GIN index; a `ts_rank_cd` + `websearch_to_tsquery` query returns a ranked row; cascade delete
  from Document removes its chunks. PostgreSQL 17.11, `max_connections` 60.
- pg-boss created its own `pgboss` schema with both queues.
- `/health/ready` → `{"database":"ok","storage":"ok","queue":"ok"}` — so the private `contracts`
  bucket exists and is reachable.
- Error shape: unknown route returns `{error:{code,message,requestId}}`; helmet headers present.
- Design tokens: changed `primary` in `tokens.ts`, rebuilt, and confirmed the rendered CSS
  variable changed, then reverted. A hex literal, a Tailwind arbitrary value and a deep feature
  import each fail `npm run lint` (checked with throwaway probe files).
- All 65 CSS variables referenced by `globals.css` exist in the token output, and no colour token
  is left unwired.
- Every route renders (7 routes, 200/404 as expected) with theme variables server-emitted, so
  there is no theme flash.
- 34 tests, typecheck, lint and build green with the turbo cache cleared.
- `pdfjs-dist` is deduped to a single 6.3.289 copy across both workspaces, which is what makes
  server offsets line up with the browser text layer.

**Decisions taken during the slice (beyond D1–D31):**
- **`tsx` cannot run the Nest app.** esbuild does not emit decorator metadata, so
  `design:paramtypes` is empty and every injected dependency arrives `undefined` — it fails at
  boot, not at compile. The server runs through tsc (`nest start` / `node dist/main.js`); `tsx`
  is used only for the standalone smoke scripts. For the same reason
  `@typescript-eslint/consistent-type-imports` is OFF for `server/` (rewriting a DI import to
  `import type` erases the runtime reference) while staying on for `shared/` and `client/`.
- **Server uses relative imports, not a path alias.** `tsc` does not rewrite path aliases at
  emit, so an `@/` import would typecheck and then fail at runtime. The `@/*` path was removed
  from the server tsconfig so the trap cannot be fallen into; the client keeps `@/` because its
  bundler resolves it. This is a deliberate deviation from ARCHITECTURE section 1's naming note.
- **The generated Prisma client lives at `server/generated/`, not `server/src/generated/`.**
  It is emitted as plain JS + `.d.ts`, so tsc does not copy it into `dist` and the built server
  could not resolve it. `server/generated` sits at the same depth as both `src` and `dist`, so
  one relative path works in development and production.
- **Prisma 7 removed `url` from the datasource block.** The connection string for Migrate now
  lives in `prisma.config.ts` (which also loads the root `.env`, since Prisma 7 no longer does),
  and the runtime client gets a driver adapter instead.
- **TypeScript pinned to 5.9.3, ESLint to 9.** TypeScript 7.0 is published as `latest` but
  `typescript-eslint` accepts only `>=4.8.4 <6.1.0`, so TS 7 would break linting entirely.
- **Turborepo 2.11 requires `packageManager` in the root package.json** or it refuses to resolve
  the workspace.
- **The secret-scan pattern from the old plan was wrong.** Scanning for the literal
  `service_role` matches the `your_service_role_key` placeholder in `.env.example` and fails on a
  clean repo. CI now matches secret-shaped VALUES (`gsk_…`, `eyJhbGciOi…`, a postgres URL with a
  password) and excludes the files whose job is to describe secrets. Checked both ways: no false
  positive on the real tree, and it does catch a planted key.
- **Corrected D25.** The earlier guidance to build `standardFontDataUrl` with `pathToFileURL`
  was wrong: Node's `fetch` cannot read `file://`, so the font load fails. The working form is a
  forward-slash filesystem path with a trailing slash. Also, `getTextContent()` never loads a
  font, so the smoke script calls `getOperatorList()` — otherwise the "no font warning" check
  passes without testing anything.

**Known limitations:**
- Not deployed. `render.yaml` is written but the services have not been created, so there is no
  live URL and the end-to-end CORS/SSE checks on Render are still outstanding.
- D31 (Supabase in Tokyo vs Render in Singapore) is still unresolved.
- `/health/ready` deliberately excludes the LLM: the app is still useful for reading and
  comparing documents when Groq is down, so a provider outage must not pull the service out of
  rotation. The LLM has its own probe for diagnostics.
- The pdf.js smoke test used a hand-built 2-line PDF. Real contracts with columns and embedded
  fonts are unproven until F1.
