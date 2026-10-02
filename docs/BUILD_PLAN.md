# BUILD_PLAN.md — Phase-by-phase build with Claude Code

Rule: a phase is finished only when every check is ticked. Then commit and move to the next.
Each prompt points to `docs/ARCHITECTURE.md` sections — that is where the detailed design,
edge cases (✓) and out-of-scope behaviour (✗) live.

## The loop for every phase
1. Fresh Claude Code session (or `/clear`). CLAUDE.md loads automatically.
2. Plan mode (Shift+Tab) → paste the phase prompt.
3. Read the plan. Ask "why" about anything unclear. Approve only when you understand it.
4. Implementation + tests; it must run typecheck, lint, test.
5. YOU run the manual checks below.
6. Ask: "Explain what you built, file by file, and the trickiest part, in simple words."
7. `git commit -m "phase N: ..."`.

If a check fails: paste the exact error/behaviour and say "find the root cause and explain it
before fixing".

## Test fixtures (collect before Phase 1, put in `server/test/fixtures/`, gitignore large ones)
- Long contract PDF, 150+ pages (e.g. a credit agreement from SEC EDGAR exhibits)
- Short contract PDF (5–15 pages)
- Fully scanned PDF, and a PDF with a few scanned pages in the middle
- Password-protected PDF
- DOCX contract with bold text, auto-numbered clauses, a table, a hyperlink, a liability cap in AED
- Version pair: copy of that DOCX with: cap amount changed, notice period changed, governing law
  changed, one sentence reworded, one clause added in the middle (renumbers the rest), one deleted
- A .png, a .txt, and an old .doc file

---

## Phase 0 — Monorepo, infrastructure, first deploy
**You first (dashboards):** Supabase project (Singapore) → Session pooler URL, private bucket
`contracts`, project URL, service role key. Groq key + Developer plan + spend limit.
Render: two web services (`server` and `client`), both with the repo root as root directory,
Singapore. Build/start commands are in ARCHITECTURE.md section 15.

**Prompt:**
> Read CLAUDE.md, docs/ASSIGNMENT.md and docs/ARCHITECTURE.md sections 0, 1, 2, 3, 12 (structure
> only), 13.1, 13.2, 15. Phase 0: create the monorepo exactly as ARCHITECTURE.md section 1 describes:
> npm workspaces (no pnpm/yarn) + Turborepo with `client/` (Next.js), `server/` (NestJS) and
> `shared/` at the root, one root package-lock.json, internal dependency written as
> `"@ca/shared": "*"`, root scripts dev/build/typecheck/lint/test running through turbo,
> root tsconfig.base.json, eslint (including import-boundary rules and the "no hard-coded styles
> outside src/theme" rules), prettier, path aliases. Every folder in the trees should exist with its
> module/index files so the feature-first structure is visible from day one.
> Server: zod-validated config, Prisma with the full data model from section 2 (including the
> generated tsvector column + GIN index via SQL migration), core/ (AppError, global exception filter,
> zod validation pipe, request-id middleware, logging interceptor, SSE writer), infrastructure/
> (database, storage, queue with pg-boss, llm skeleton), helmet, CORS for WEB_ORIGIN, throttler,
> health feature (live/ready).
> Client: src/theme/tokens.ts with the full token set from section 13.1 (calm legal palette, light +
> dark, semantic tokens), theme-styles.tsx, globals.css wiring tokens into Tailwind v4 utilities,
> shadcn/ui configured to use the same variables, src/content/copy.ts and error-messages.ts,
> providers, typed api-client and sse-client, AppShell with sidebar and empty pages for every route,
> and the feedback components (LoadingState, EmptyState, ErrorState, skeletons).
> Shared: feature-first folders with the error-code enum and document schemas to start.
> Add .env.example for server and client, .gitignore, GitHub Actions CI (typecheck, lint, test), and
> Render build/start commands. Plan first.

**Done when:**
- [ ] `npm install` then `npm run dev` from the root runs both apps; client shell loads; `/health/ready` is green locally
- [ ] Tables + pgboss schema visible in Supabase
- [ ] Change one colour in `tokens.ts` → it changes everywhere; a hex colour typed in a component
      fails `npm run lint`
- [ ] No user-facing text inline in components (all from `src/content/`)
- [ ] CI passes on GitHub; `git status` never shows `.env`
- [ ] Both services deployed on Render; live client calls live server `/health/ready` successfully

---

## Phase 1 — Documents: upload, processing, library
**Prompt:**
> Phase 1. Implement ARCHITECTURE.md section 4 completely inside server/src/features/documents
> (pure logic in its domain/ folder): file sniffing, upload to Storage,
> pg-boss processing job with status stages, PDF extraction with item map and gap-based separators,
> DOCX extraction with data-start/data-end blocks (shared block-text rule in shared/src/text),
> scanned and partially-scanned detection, boilerplate detection, chunking, every error code in the
> ✓ list, restart recovery, delete. Client (features/library): library page with drag-and-drop upload, status badges with
> detail, polling, open, delete with confirm, all loading/empty/error states. Unit tests for
> sniffing, scanned detection, boilerplate detection, segmenter and chunker. Plan first.

**Done when:**
- [ ] .png / .txt / .doc / empty / oversized / password PDF each show their specific message
- [ ] Fully scanned PDF → FAILED with scanned message; partially scanned → READY + warning
- [ ] Short PDF, 150-page PDF and DOCX reach READY with visible stage progress
- [ ] `fullText.slice(page.startOffset, page.endOffset)` equals page text (spot-check 3 pages)
- [ ] Kill the api mid-processing, restart: document still ends READY
- [ ] Delete removes rows and the Storage object

---

## Phase 2 — Quote verification
**Prompt:**
> Phase 2. Implement ARCHITECTURE.md section 5 as a pure module with tests written FIRST for every
> ✓ and ✗ item listed there, plus 3 real excerpts from the 150-page fixture copied across line
> breaks. Include the per-document normalised-text cache. Plan first.

**Done when:**
- [ ] All tests pass; paraphrase / changed word / changed case / inner ellipsis all UNVERIFIED
- [ ] You can explain the index map and the three passes in your own words

---

## Phase 3 — LLM layer, retrieval, single-document chat
**Prompt:**
> Phase 3. Implement ARCHITECTURE.md sections 12, 6 and 7 (server features retrieval + chat,
> infrastructure/llm), plus the SSE protocol in 3.6 (zod event
> schemas in shared/src/chat). LLM layer with budgeter, token-bucket limiter, 429 retry with
> notices, structured-call helper with zod + one repair retry, timeouts, LlmCall logging. Retrieval
> modes RETRIEVAL and THOROUGH with question classifier, coverage, and the honesty rules. Chat with
> AnswerStreamParser, quote verification on completion, Stop with partial save, history, answer
> status (ANSWERED / NOT_FOUND / UNSUPPORTED), and every ✓ edge case. Client (features/chat): document page split view
> (viewer placeholder + chat), streaming messages, Stop, quote chips (verified / unverified),
> coverage line, "Search the whole document" escalation button, previous chats list. Tests for the
> stream parser (delimiter split across chunks, missing delimiter, bad JSON), budgeter, classifier.
> Plan first.

**Done when:**
- [ ] Streams word by word; Stop keeps partial text, still there after reload
- [ ] Answerable question → verified quotes; "What is the CEO's salary?" → not found
- [ ] Clause on page ~140 found in normal mode
- [ ] Absence question auto-runs thorough mode with progress; partial run shows partial coverage
- [ ] Rapid questions trigger a rate-limit notice, never a crash
- [ ] Injected fake quote shows UNVERIFIED; answer with zero verified quotes shows the amber banner

---

## Phase 4 — Viewer & citation highlighting
**Prompt:**
> Phase 4. Implement ARCHITECTURE.md section 8 in client/src/features/viewer (pure mapping code in
> its lib/ folder): virtualised pdf.js viewer (same pinned version as
> the api), text-layer span check, precise DOM-range highlighting with geometric fallback,
> cross-page splitting via shared/src/text, multiple-occurrence navigator, zoom handling, DOCX
> reading view with block-offset highlighting. Clicking a verified quote chip opens and highlights.
> Unit tests for range splitting and item lookup. Plan first.

**Done when:**
- [ ] Single-line, multi-line, cross-page and repeated quotes highlight correctly (PDF + DOCX)
- [ ] Correct at 75 %, 100 %, 150 % zoom; 150-page PDF scrolls smoothly

---

## Phase 5 — Multi-document questions
**Prompt:**
> Phase 5. Implement ARCHITECTURE.md section 9: chat with 2–5 documents, aliases, per-document
> budget, comparative prompt, per-document verification, per-document coverage, document name on
> quote chips, deleted-document handling. Client (features/multi-doc): "Ask across documents" page with document picker.
> Plan first.

**Done when:**
- [ ] "Compare the liability caps" across 3 contracts → one comparative answer
- [ ] Each quote opens the right document highlighted; a mislabelled quote is UNVERIFIED

---

## Phase 6 — Version comparison
**Prompt:**
> Phase 6. Implement ARCHITECTURE.md section 10: segmentation (incl. DOCX block structure),
> DP alignment with move detection, classification, deterministic change detectors, severity floor,
> batched LLM summaries with final-severity rule, caching, and the full UI (counts, filters, sort,
> inline diff, side-by-side, open-in-document links, detector reasons). Tests FIRST for detectors,
> severity rules and alignment (including the renumbering cascade). Plan first.

**Done when:**
- [ ] Fixture pair shows every change made, nothing invented; renumbered clauses not reported
- [ ] AED cap change = HIGH with reason shown; reworded sentence = LOW
- [ ] Filters and sorting work; identical documents show "No substantive differences"

---

## Phase 7 — Part C: tracked-change redlining
**Prompt:**
> Phase 7. Implement ARCHITECTURE.md section 11 in this order, with tests at each step:
> DocxPackage → ParagraphModel → RunSplitter → RevisionWriter (word diff) → simulators
> (acceptAll / rejectAll / untouched-paragraph check) → EditLocator (all rejection reasons) →
> EditPlanner (LLM) → API → UI (instruction box, proposed edits with status and reason, untick,
> download). Never offer a file that fails the self-check. Plan first.

**Done when:**
- [ ] Opens in Word AND LibreOffice with no repair prompt
- [ ] Each edit is a separate revision; accept/reject works individually
- [ ] Half-bold text edit keeps both formats; tables, numbering, fonts unchanged
- [ ] 3 edits in one pass applied; "Reject all" gives back the original text
- [ ] Ambiguous / cross-paragraph / not-found edits are shown as rejected with reasons
- [ ] PDF documents show "Tracked changes need the original .docx"

---

## Phase 8 — Hardening, polish, documentation
**Prompt:**
> Phase 8. Review every screen against ARCHITECTURE.md section 13 (tokens only, copy only, states,
> tone, accessibility). Search the client for any hard-coded colour, size or sentence and move it
> into src/theme or src/content.
> Run the full flow on the deployed URLs with the 150-page PDF and fix anything slow or broken.
> Verify throttling, CORS, error shapes and health checks in production. Write README.md (what it
> does, screenshot placeholders for upload / chat with verified quotes / highlighting / comparison /
> redline, architecture summary with diagram, local setup, env vars, what is finished and what is
> not — honest, matching NOTES.md). Draft docs/SUBMISSION_NOTE.md (half page: verification and where
> it can fail, large documents, Part C choice and hardest part, what next). Plan first.

**Done when:**
- [ ] Every acceptance check from Phases 1–7 re-run on the LIVE URLs
- [ ] README "not finished" list matches reality exactly
- [ ] Screenshots + 3–5 min demo video recorded (follow the assignment's list)
- [ ] `git log -p | grep -iE "gsk_|service_role|eyJhbGci"` finds nothing

## If something has to give
Protect, in this order: verification → coverage honesty → highlighting → comparison severity →
redline core → polish. Never present something partial as finished.