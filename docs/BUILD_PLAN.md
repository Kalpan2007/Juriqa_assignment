# BUILD_PLAN.md — Feature-wise build

The app is built as **vertical feature slices**. Each slice goes all the way down —
`shared/` contract → `server/` → `client/` → tests → manual checks → deployed — and ends with a
capability you can actually demonstrate in a browser. Nothing is "done" while it only exists on
one side of the wire.

Why slices and not "all backend, then all frontend": this assignment is graded by someone opening
the deployed link and using it, and the hardest risks in it live exactly at the seams (server text
offsets lining up with the browser's pdf.js text layer; SSE streaming surviving Render's proxy).
Backend-first defers those discoveries to the end, when everything else is already built on top.

Two slices are deliberately **engine-only, no UI** — F2 (verification) and the first half of F8
(redline OOXML core) — because they are pure logic that deserves tests-first isolation. Their UI
arrives in the slice that consumes them.

- Design and edge cases: `docs/ARCHITECTURE.md` (the source of truth — follow it, propose changes,
  don't drift). Section numbers below point into it.
- Requirements: `docs/ASSIGNMENT.md`.
- Running log: `docs/NOTES.md` (append after every slice).
- Working rules: `CLAUDE.md`.

---

## Assignment coverage map
Every numbered requirement in `docs/ASSIGNMENT.md` maps to exactly one slice that owns it.

| Assignment requirement | Slice | ARCHITECTURE |
|---|---|---|
| — (infrastructure, design system, deploy) | **F0** Foundation | 1, 2, 3, 12, 13.1, 13.2, 15 |
| A1 Document upload and processing | **F1** Document library | 4 |
| A3 Verified quotes (the engine) | **F2** Verification engine | 5 |
| A2 Chat with a document | **F3** Ask one document | 7, 12, 3.6 |
| A3 Verified quotes (the UI) | **F3** Ask one document | 7, 13.3 |
| A4 Large documents | **F4** Whole-document reading | 6 |
| B5 Citation highlighting | **F5** Citation highlighting | 8 |
| B6 Multi-document questions | **F6** Ask many documents | 9 |
| B7 Document comparison | **F7** Compare versions | 10 |
| C1 Tracked-change redlining | **F8** Tracked-change redlining | 11 |
| Submission: deploy, README, video, note | **F9** Hardening and submission | 13, 15 |

Optional extras (anonymise, embeddings, export, clause extraction, Arabic, voice) are attempted
**only** after every check in F1–F9 passes. An unfinished extra is worth nothing.

---

## The loop for every slice
1. Fresh Claude Code session (or `/clear`). `CLAUDE.md` loads automatically.
2. Plan mode (Shift+Tab) → paste the slice prompt.
3. Read the plan. Ask "why" about anything unclear. Approve only when you understand it.
4. Implement in this order inside the slice — **contract first**:
   **`shared/` zod schemas → `server/` domain (pure, tested) → server service/controller →
   `client/` api + hooks → `client/` components → wire into the page.**
   This keeps the "define the API before building against it" benefit of backend-first without
   the big-bang integration at the end.
5. `npm run typecheck && npm run lint && npm test` — fix until green.
6. **You** run the manual checks in "Done when". A slice is finished only when every box is ticked.
7. Ask: "Explain what you built, file by file, and the trickiest part, in simple words."
8. Append to `docs/NOTES.md`: what was built, decisions taken, known limitations.
9. `git commit -m "feat(<slice>): ..."`. Deploy and re-check anything proxy- or latency-sensitive.

If a check fails: paste the exact error or behaviour and say
"find the root cause and explain it before fixing".

**Never report a slice as working without having run it.** The assignment counts claiming
something works when it does not against you more heavily than an honest gap.

---

## If something has to give
Protect, in this order:

**verification → coverage honesty → highlighting → comparison severity → redline core → polish**

Verified quotes (F2) and honest coverage (F4) are the assignment's stated priorities. A smaller app
where every claim is true beats a wider one that overclaims. Cut scope by dropping a whole slice
and saying so in the README — never by leaving a half-working feature that looks finished.

---

## Test fixtures
Collect before F1, put in `server/test/fixtures/`, gitignore anything large
(`.gitignore` already excludes `server/test/fixtures/large/`).

- Long contract PDF, 150+ pages (an SEC EDGAR credit agreement exhibit works well)
- Short contract PDF (5–15 pages)
- Fully scanned PDF, and a PDF with a few scanned pages in the middle
- Password-protected PDF
- DOCX contract with: bold text mid-sentence, auto-numbered clauses, a table, a hyperlink,
  and a liability cap in AED
- Version pair — a copy of that DOCX with: cap amount changed, notice period changed, governing
  law changed, one sentence reworded, one clause **added in the middle** (so everything after it
  renumbers), one clause deleted
- A `.png`, a `.txt`, and an old `.doc`

The version pair is what proves F7. Build it by hand in Word and keep a written list of the six
edits you made — that list is the expected result.

---
---

# F0 — Foundation
**Capability at the end:** both apps run from one command, the shell loads, `/health/ready` is
green locally and on Render, and the design system is in place. No product features yet.

**Owns:** nothing from the assignment directly — everything else sits on this.
**Read:** ARCHITECTURE 0, 1, 2, 3, 12 (structure only), 13.1, 13.2, 15, 17.

**Prompt:**
> Read CLAUDE.md, docs/ASSIGNMENT.md and docs/ARCHITECTURE.md sections 0, 1, 2, 3, 12 (structure
> only), 13.1, 13.2, 15 and 17. Build slice F0: the monorepo exactly as section 1 describes —
> npm workspaces (no pnpm/yarn) + Turborepo with `client/` (Next.js), `server/` (NestJS) and
> `shared/`, one root package-lock.json, internal dependency written `"@ca/shared": "*"`, root
> scripts dev/build/typecheck/lint/test through turbo, root tsconfig.base.json, eslint (import
> boundaries + the "no hard-coded styles outside src/theme" rules), prettier, path aliases.
> Apply every pin and rule in section 1 "Runtime, module system and version pins": Node 22.17.1
> via .nvmrc + .node-version, @nestjs/* 11.2.x CommonJS, prisma/@prisma/client/@prisma/adapter-pg
> 7.10.0, pg-boss 11.1.2, pdfjs-dist 6.3.289 in BOTH workspaces, `shared/` compiled to dist with
> turbo `dependsOn: ["^build"]`.
> Every folder in the section 1 trees should exist with its module/index file, so the feature-first
> structure is visible from day one.
> Server: zod-validated config reading the SINGLE root .env (section 3.2 — envFilePath, and the
> port is SERVER_PORT, not PORT); Prisma with the full data model from section 2 including the
> generated tsvector column + GIN index via a SQL migration, and the Prisma 7 setup from section 1
> (prisma.config.ts + @prisma/adapter-pg); core/ (AppError, global exception filter, zod validation
> pipe, request-id middleware, logging interceptor, SSE writer with the proxy-safe headers from
> 3.6); infrastructure/ (database, storage, queue with pg-boss, llm skeleton); helmet; CORS for
> WEB_ORIGIN; per-route throttling as in 3.3 (status polling must never be throttled); health
> feature (live/ready).
> Client: src/theme/tokens.ts with the full token set from 13.1 (calm legal palette, light + dark,
> semantic tokens named by meaning), theme-styles.tsx, globals.css wiring tokens into Tailwind v4
> via `@theme inline` (variable names only, no values), shadcn/ui reading the same variables,
> src/content/copy.ts and error-messages.ts, providers, typed api-client and sse-client, AppShell
> with sidebar and an empty page for every route in the section 1 tree, and the feedback components
> (LoadingState, EmptyState, ErrorState, skeletons).
> Shared: feature-first folders with the error-code enum and the document schemas to start.
> Add GitHub Actions CI (typecheck, lint, test) and the Render build/start/pre-deploy commands from
> section 15. The root .env.example and .gitignore already exist — do not overwrite them; extend
> .env.example only if a variable is genuinely missing.
> Prove the two riskiest assumptions before anything is built on them:
> (a) a server script that loads pdfjs-dist via `await import()` and prints the first text items of
> a real PDF with no font warning (see the v6 notes in section 1 — file:// URLs ending in `/`, and
> `loadingTask.destroy()`); (b) a script that connects to Supabase through the session pooler and
> runs one query.
> Plan first.

**Done when:**
- [ ] `npm install` then `npm run dev` from the root runs both apps; client shell loads
- [ ] `/health/ready` green locally — reports DB, storage and queue each reachable
- [ ] `npm ls prisma pg-boss pdfjs-dist @nestjs/core` shows exactly the pinned versions
- [ ] The pdf.js script prints text items from a real PDF with **no font warning**
- [ ] The DB script connects through the session pooler (port 5432) and returns a row
- [ ] Tables + the `pgboss` schema are visible in Supabase; the `Chunk.tsv` GIN index exists
- [ ] Change one colour in `tokens.ts` → it changes everywhere; a hex colour typed into a
      component **fails** `npm run lint`; a Tailwind arbitrary value also fails
- [ ] No user-facing sentence is inline in any component (all from `src/content/`)
- [ ] CI passes on GitHub; `git status` never shows `.env`
- [ ] Both services deployed on Render; the live client calls the live server `/health/ready`
      successfully (this proves CORS and `NEXT_PUBLIC_API_URL` are right)

**Risk note:** deploy at the END of F0, not later. Everything after this assumes a working
pipeline, and Render/CORS/env problems are much cheaper to find now than in F9.

---

# F1 — Document library
**Capability at the end:** you can drag in a PDF or DOCX, watch it process with live status, see it
in a library, open it, and delete it. Bad files are rejected with a specific, honest message.

**Owns:** Assignment A1. **Read:** ARCHITECTURE 4 (+ 2, 3.3).
**Depends on:** F0.

**Prompt:**
> Build slice F1 — implement ARCHITECTURE.md section 4 completely.
> Server (`features/documents/`, pure logic in its `domain/` folder): file sniffing by bytes not
> extension, sha256, upload to Supabase Storage, the pg-boss `document.process` job with status
> stages and `statusDetail`, PDF extraction with the compact item map and the gap-based separator
> rules, DOCX extraction (mammoth → sanitize-html → data-start/data-end blocks, offsets computed
> AFTER sanitising, shared block-text rule in `shared/src/text`), scanned and partially-scanned
> detection writing `Page.textChars` / `Page.isScanned` / `Document.scannedPageCount`, boilerplate
> detection, clause-aware chunking, every error code in the ✓ list, restart recovery, and delete
> that also removes the Storage object.
> API exactly as section 4 lists it, including the paginated `/layout`, `/pages?from=&to=` and
> `/html` endpoints (decision D20) — never one huge payload.
> Client (`features/library/`): library page with drag-and-drop upload, status badges with detail,
> polling while non-final, open, delete with a confirm dialog that says chats will go too, and
> explicit loading / empty / error states.
> Tests: sniffing, scanned detection, boilerplate detection, segmenter, chunker, and the shared
> block-text rule.
> Finally, a throwaway spike (not shipped): render ONE pdf page in the browser and highlight a
> hard-coded `{start, end}` offset range, to prove the server's item offsets line up with the
> browser's text layer before F5 is built on that assumption. Report what you find.
> Plan first.

**Done when:**
- [ ] `.png` / `.txt` / `.doc` / empty / oversized / password-protected PDF each show their own
      specific message (not a generic error)
- [ ] A renamed file (`.exe` → `.pdf`) is still rejected — sniffing, not the extension
- [ ] Fully scanned PDF → FAILED with the scanned message, never READY
- [ ] Partially scanned PDF → READY **plus** a warning naming the exact pages
- [ ] Short PDF, the 150-page PDF and the DOCX all reach READY with visible stage progress
- [ ] Uploading the 150-page PDF and watching status never produces a 429 from polling
- [ ] `fullText.slice(page.startOffset, page.endOffset)` equals that page's text — spot-check 3
      pages including the last one
- [ ] Kill the server mid-processing and restart: the document still ends in a final state
- [ ] Delete removes the DB rows and the Storage object
- [ ] The highlight spike reports honestly whether text-layer spans match the stored items

**Risk note:** the spike is the point of this slice beyond the feature itself. If spans don't match
the stored items, section 8's precise path collapses to the geometric fallback — far cheaper to
learn now than in F5.

---

# F2 — Verification engine
**Capability at the end:** a pure, heavily tested function that decides whether a quote really
exists in a document and exactly where. No UI — this is the heart of the assignment and gets built
in isolation.

**Owns:** Assignment A3 (the engine). **Read:** ARCHITECTURE 5.
**Depends on:** F1 (needs a real `fullText` to test against).

**Prompt:**
> Build slice F2 — implement ARCHITECTURE.md section 5 as a pure module in
> `server/src/features/verification/domain/` with **tests written FIRST** for every ✓ and ✗ item
> listed there, plus 3 real excerpts copied out of the 150-page fixture across line breaks.
> `normalize(text) → { norm, map }` with the exact step order in section 5, and
> `findQuote(fullText, quote) → Match[]` with all FOUR passes (EXACT_WS, HYPHEN_BREAK,
> WS_INSENSITIVE, CASE_INSENSITIVE per decision D6), returning every occurrence mapped back to
> original offsets through the index map. Include the length rules, the ellipsis and
> quotation-mark stripping, and the per-document normalised-text LRU cache.
> Expose it as `QuoteVerifierService` from `VerificationModule` (nothing else imports its
> internals). Plan first.

**Done when:**
- [ ] Every ✓ case verifies: extra/missing spaces, line breaks, curly quotes, dash variants,
      ligatures, soft hyphens, NBSP, hyphenation across a line break, glued words, a quote
      spanning a page break, a quote appearing more than once (all occurrences returned)
- [ ] Every ✗ case is UNVERIFIED: paraphrase, one changed word, inner ellipsis, too short,
      too long, quote belonging to a different document
- [ ] Changed case only → **VERIFIED** with `matchKind = CASE_INSENSITIVE`
- [ ] The 3 real fixture excerpts verify, with offsets that slice back to the right text
- [ ] You can explain the index map and the four passes in your own words

---

# F3 — Ask one document
**Capability at the end:** you can ask a question about a document and watch the answer stream in,
with verified quote chips under it, a coverage line, and a Stop button that keeps what was written.
Chats are saved and reopenable.

**Owns:** Assignment A2 + the A3 UI. **Read:** ARCHITECTURE 7, 12, 3.6, 6 (RETRIEVAL mode only).
**Depends on:** F1, F2.

**Prompt:**
> Build slice F3 — implement ARCHITECTURE.md sections 12 and 7, the SSE protocol in 3.6, and the
> RETRIEVAL half of section 6 (leave THOROUGH for F4).
> LLM layer (`infrastructure/llm/`): openai SDK with baseURL from env, token budgeter, in-process
> token-bucket rate limiter, 429 retry honouring retry-after with a `notice` event, structured-call
> helper validated with zod plus one repair retry, 60 s abortable timeouts, and an `LlmCall` row per
> call.
> Retrieval (`features/retrieval/`): Postgres FTS with `websearch_to_tsquery` + `ts_rank_cd`,
> heading boost, the low-result fallback query, the budgeter picking chunks, re-sorted into document
> order, and coverage as specified in section 6 (sections primary for both formats, pages only for
> PDF — decision D13).
> Chat (`features/chat/`): chats CRUD, `POST /chats/:id/messages` as SSE, the prompt contract with
> the `---QUOTES---` delimiter, AnswerStreamParser with a tail buffer so a delimiter split across
> chunks is still detected, defensive JSON parsing, verification of every quote on completion via
> QuoteVerifierService, persisted Quotes, answer status (ANSWERED / NOT_FOUND / UNSUPPORTED /
> PARTIAL — and a STOPPED message is NEVER marked UNSUPPORTED, decision D11), Stop via
> `req.on('close')` + AbortController saving partial text, history of the last 3 turns, server-set
> chat title and `updatedAt` (decision D21).
> Client (`features/chat/`): document workspace split view with a viewer PLACEHOLDER (the real
> viewer is F5) plus the chat panel, streaming messages, Stop, quote chips (verified / unverified /
> case-differs note), coverage line under every answer, the amber unsupported banner, and the
> previous-chats list.
> Tests: stream parser (delimiter split across chunks, missing delimiter, malformed JSON, duplicate
> quotes, numbering gaps), budgeter, and the answer-status rules. LLM always mocked.
> Plan first.

**Done when:**
- [ ] Answers stream word by word, locally **and on the live Render URL** (not buffered into one
      chunk — this is what decision D22's headers are for)
- [ ] Stop keeps the partial text, it survives a reload, and it shows "Stopped" with **no**
      unsupported warning
- [ ] An answerable question returns verified quotes; "What is the CEO's salary?" → not found
      rather than an invented answer
- [ ] A clause around page 140 of the 150-page fixture is found in normal retrieval mode
- [ ] A fake quote injected into the mocked LLM response shows as UNVERIFIED and is not clickable
- [ ] An answer with zero verified quotes shows the amber banner
- [ ] Every answer shows a coverage line
- [ ] Asking rapidly produces a rate-limit notice, never a crash
- [ ] Chat history reopens with the same text, quotes and coverage
- [ ] A follow-up question ("and what about termination for convenience?") works via history

---

# F4 — Whole-document reading
**Capability at the end:** absence and completeness questions read the entire document with visible
progress, and the app never claims something is missing after reading only part of it.

**Owns:** Assignment A4. **Read:** ARCHITECTURE 6 (all of it).
**Depends on:** F3.

**Prompt:**
> Build slice F4 — complete ARCHITECTURE.md section 6.
> THOROUGH mode: map-reduce over all non-boilerplate chunks, map batches sized to the token budget
> returning structured `{ relevant, findings, quotes[] }`, a streaming reduce call over the
> collected findings, and `progress` events per batch.
> The rules-based question classifier (no LLM) for existence / absence / completeness intent, the
> "Read whole document" toggle, and the cost-aware escalation button shown when a retrieval answer
> comes back NOT_FOUND.
> The honesty rules: the RETRIEVAL prompt wording, the absolute-absence post-check that adds a
> "Based on 9 of 140 sections" warning chip, THOROUGH may state absence only when `complete=true`,
> and a document with scanned pages can never be `complete=true`.
> Coverage must stay truthful when a run stops early (rate limit or abort): partial counts and a
> plain explanation, never a rounded-up claim.
> Client: the toggle, per-batch progress, the escalation button, and the warning chip.
> Tests: the classifier, the budgeter batching, and coverage/`complete` derivation including the
> scanned-pages case.
> Plan first.

**Done when:**
- [ ] An absence question auto-runs thorough mode and shows progress, not a spinner
- [ ] Thorough mode on the 150-page fixture completes and reports "Read the whole document"
- [ ] A retrieval answer that says "not found" offers "Search the whole document", and it works
- [ ] Forcing a partial run (kill the LLM mid-scan) shows partial coverage and makes **no**
      absolute-absence claim
- [ ] A partially scanned document never reports `complete=true`; coverage names the skipped pages
- [ ] A retrieval-mode answer containing "there is no…" gets the coverage warning chip

**Risk note:** this slice is the assignment's "worst possible output" test — confidently stating a
clause does not exist after reading 30 pages. Verify it deliberately, don't assume the prompt holds.

---

# F5 — Citation highlighting
**Capability at the end:** clicking a verified quote opens the document, scrolls to the passage and
highlights exactly it — including quotes that span lines, cross a page break, or appear more than
once.

**Owns:** Assignment B5. **Read:** ARCHITECTURE 8 (+ `shared/src/text`).
**Depends on:** F1 (offsets, `/layout`, `/pages`), F3 (quote chips to click).

**Prompt:**
> Build slice F5 — implement ARCHITECTURE.md section 8 in `client/src/features/viewer/`, with the
> pure mapping code in its `lib/` folder.
> Virtualised pdf.js viewer at the SAME pinned version as the server, placeholders sized from
> `/layout`, item maps fetched lazily per page range (`/pages?from=&to=`, visible ± 2) and cached.
> Highlighting driven ONLY by the stored `{ start, end }` from the Quote match — never a DOM text
> search. `splitRangeByPage` in `shared/src/text` for cross-page quotes, binary search for
> overlapping items, the precise DOM-Range path with the text-layer span check, and the geometric
> fallback (logged as a warning) when spans don't match. Occurrence navigator ("1 of 3") showing
> the occurrence the model actually saw first. Overlays recomputed on zoom and resize.
> DOCX: render the stored server-sanitised HTML from `/html` in a serif reading view, walk blocks
> with data-start/data-end using the shared block-text rule, build ranges, scroll into view.
> Replace the F3 viewer placeholder so quote chips become clickable.
> Unit tests for range splitting and item lookup, using the F1 spike's findings.
> Plan first.

**Done when:**
- [ ] Single-line, multi-line, cross-page and repeated quotes all highlight correctly on PDF
- [ ] The same four cases work on DOCX
- [ ] Correct at 75 %, 100 % and 150 % zoom, and after a window resize
- [ ] The 150-page PDF scrolls smoothly (virtualisation holds, no multi-MB fetches)
- [ ] The occurrence navigator moves between repeats of the same quote
- [ ] When the geometric fallback is used it is logged, and the highlight is still on the right text
- [ ] Clicking a chip in a reopened old chat still highlights correctly

---

# F6 — Ask many documents
**Capability at the end:** select 2–5 documents, ask one question, and get a single comparative
answer where each quote names its source document and opens that document highlighted.

**Owns:** Assignment B6. **Read:** ARCHITECTURE 9 (+ 6 for the D12 rule).
**Depends on:** F3, F5.

**Prompt:**
> Build slice F6 — implement ARCHITECTURE.md section 9.
> Server: chats over 2–5 READY documents with D1…Dn aliases in ChatDocument, retrieval per document
> with the budget split evenly and a minimum of 2 chunks each, excerpts grouped under
> `=== D1: <name> ===`, the comparative prompt (structure by topic, not by document), per-document
> coverage, and verification of each quote ONLY against the document its alias resolves to — an
> unknown alias or a quote that exists in a different document is UNVERIFIED and never silently
> re-attributed.
> No auto-escalation to THOROUGH in multi-document chats; instead a per-document
> "Search <name> thoroughly" action (decision D12).
> Client (`features/multi-doc/`): "Ask across documents" page with a document picker, document name
> on every quote chip, per-document coverage lines, and the per-document thorough buttons.
> Handle a document deleted later: the chat stays readable and its quotes become unclickable with
> "Document deleted".
> Plan first.

**Done when:**
- [ ] "Compare the liability caps" across 3 contracts gives ONE comparative answer organised by
      topic, not three separate answers
- [ ] Every quote chip names its document and opens that document at the right passage
- [ ] A quote that belongs to D2 but is labelled D1 shows UNVERIFIED
- [ ] "Does any of these have an arbitration clause?" gives a retrieval answer with per-document
      coverage and a "Search <name> thoroughly" button for each
- [ ] When only some documents contain the answer, the answer says which ones don't — scoped to
      the sections actually reviewed
- [ ] Deleting one document leaves the chat readable with that document's quotes unclickable
- [ ] Selecting 6 documents is refused with a clear message

---

# F7 — Compare versions
**Capability at the end:** pick two versions of a contract and see what changed at clause level,
in plain language, with severity you can filter and sort — and renumbering is not reported as
change.

**Owns:** Assignment B7. **Read:** ARCHITECTURE 10.
**Depends on:** F1 (segmentation), F5 (open-in-document links).

**Prompt:**
> Build slice F7 — implement ARCHITECTURE.md section 10, with tests written FIRST for the
> detectors, the severity rules and the alignment (including the renumbering cascade).
> Server: segmentation of both documents (non-boilerplate only, DOCX using block structure since
> its auto numbering isn't in the text), splitting each clause into `ref` + `body` and comparing
> ONLY `body` so renumbering is invisible (decision D7), Needleman–Wunsch style DP alignment on a
> token-set Jaccard + edit-ratio similarity, the MOVED post-pass, classification
> (ADDED/REMOVED/MODIFIED/MOVED/UNCHANGED with whitespace-only counting as UNCHANGED), the
> deterministic change detectors (money with currency, percentages, durations, dates, plain
> numbers, obligation modals, negation, scope words, party swaps), the code severity floor, batched
> LLM summaries (≤ 10 changes per call, structured JSON), and the final severity rule in D8 — HIGH
> always needs a code reason, the LLM may raise a no-detector wording change only to MEDIUM and it
> is labelled "AI assessment". Cache on (baseSha256, revisedSha256, algorithmVersion) per D19.
> Run it as a job with status, like document processing.
> Client (`features/compare/`): version picker, summary header with counts by severity, filters
> (severity, type) and sort (severity / document order), each change showing heading, badge,
> plain-language summary, which detectors fired with their old → new values, inline word-diff, a
> side-by-side toggle, and "open in base / revised" links that highlight the clause.
> Plan first.

**Done when:**
- [ ] The fixture pair shows all six edits you made and **nothing invented**
- [ ] The clause added in the middle does NOT cause the clauses after it to be reported as
      changed — renumbering appears once as an informational note
- [ ] The AED cap change is HIGH, with the detector reason shown
      ("Amount changed: AED 100,000 → AED 1,000,000")
- [ ] The reworded sentence is LOW
- [ ] The governing-law change is HIGH; the notice-period change is at least MEDIUM
- [ ] Added and deleted clauses both appear with the right type
- [ ] Filters and sorting work; comparing identical documents says "No substantive differences"
- [ ] Comparing a document with itself is blocked with a message
- [ ] Comparing two unrelated contracts shows the "these look like different contracts" banner
- [ ] Re-running the same pair returns the cached result

---

# F8 — Tracked-change redlining (Part C, Option 1)
**Capability at the end:** a plain-language instruction becomes real Word tracked changes in the
original .docx, which opens cleanly in Word and LibreOffice with each edit individually
acceptable — and all original formatting intact.

**Owns:** Assignment C1. **Read:** ARCHITECTURE 11.
**Depends on:** F1 (the DOCX), F2 (the locator reuses the verifier's normalise-and-find).

Build strictly in this order — each step tested before the next. The first five are engine-only,
no UI:

1. `DocxPackage` — jszip load, parse `word/document.xml`, every other part byte-identical,
   same entry order and compression on write
2. `ParagraphModel` — paragraph text + char → (run, text node, offset) map, with the full element
   handling list in section 11
3. `RunSplitter` — split a run at any offset, deep-cloning `w:rPr`, preserving `xml:space`
4. `RevisionWriter` — word-level diff, ops mapped onto runs, `w:del` / `w:ins` with unique ids
5. `simulators` — `acceptAll` / `rejectAll` / untouched-paragraphs-byte-identical
6. `EditLocator` — all rejection reasons (NOT_FOUND, AMBIGUOUS, CROSS_PARAGRAPH,
   HAS_EXISTING_REVISIONS, OVERLAPS)
7. `EditPlanner` (LLM) → API → UI

**Prompt:**
> Build slice F8 — implement ARCHITECTURE.md section 11 in the seven steps listed in
> docs/BUILD_PLAN.md, with tests at each step before moving on. The self-check is
> non-negotiable: if `acceptAll` doesn't produce the expected new text, `rejectAll` doesn't restore
> the original exactly, or any untouched paragraph changed, the request fails with
> `REDLINE_SELF_CHECK_FAILED` and **no file is offered**. A broken document is worse than no
> document.
> Client (`features/redline/`): instruction box, proposed edits each with status and a readable
> rejection reason, tick/untick, apply, download. PDF documents show "Tracked changes need the
> original .docx".
> Plan first.

**Done when:**
- [ ] The downloaded file opens in **Word** and in **LibreOffice** with no repair prompt
- [ ] Each edit is a separate revision, acceptable/rejectable individually
- [ ] "Accept all" gives the intended new text; "Reject all" gives back the original exactly
- [ ] An edit inside half-bold text keeps both formats
- [ ] Tables, numbering, fonts and styles are unchanged; unrelated paragraphs byte-identical
- [ ] 3 edits applied in a single pass, including two in the same paragraph
- [ ] An edit inside a table cell works; an edit inside a hyperlink works
- [ ] Ambiguous / cross-paragraph / not-found / already-tracked edits are shown as rejected with
      their reason, and are never silently applied
- [ ] A PDF document shows the "needs .docx" message instead of a broken form
- [ ] The simulators are covered by unit tests on fixtures

**Risk note:** this is the hardest slice. The assignment explicitly says an honest partial attempt
with a clear account beats skipping it — so if something defeats you, write down exactly what and
why in NOTES.md and the README. Regenerating the document and diffing it does **not** count.

---

# F9 — Hardening and submission
**Capability at the end:** the deployed app is the real thing, and the README, video and note
describe it accurately.

**Owns:** the submission requirements. **Read:** ARCHITECTURE 13, 15, 16; ASSIGNMENT "What to
submit" and "How we evaluate".

**Prompt:**
> Build slice F9. Review every screen against ARCHITECTURE.md section 13: tokens only, copy only,
> loading/empty/error states everywhere, keyboard navigation, visible focus ring, aria-live on
> streaming text, colour never the only signal. Search the client for any hard-coded colour, size
> or user-facing sentence and move it into `src/theme` or `src/content`.
> Run the whole flow on the DEPLOYED URLs with the 150-page PDF and fix anything slow or broken.
> Verify in production: per-route throttling, CORS, error response shape, health checks, and SSE
> streaming not being buffered.
> Write README.md: what the app does, screenshots of upload / chat with verified quotes /
> citation highlighting / comparison / redline, an architecture summary with the diagram, local
> setup, env vars, and an honest "what is finished and what is not" that matches docs/NOTES.md
> exactly.
> Draft docs/SUBMISSION_NOTE.md (half a page): how quote verification works and where it can fail,
> how large documents were handled, which Part C option and why, how far it got and the hardest
> part, and what you would build next.
> Plan first.

**Done when:**
- [ ] Every "Done when" box from F1–F8 re-run on the **live** URLs, not locally
- [ ] The README's "not finished" list matches reality exactly — no overclaiming anywhere
- [ ] Screenshots of all five screens the assignment names
- [ ] 3–5 minute demo video: upload, ask a question, show verification working, click through to a
      highlighted citation, show comparison, show the Part C work including what doesn't work
- [ ] `docs/SUBMISSION_NOTE.md` covers all four required points
- [ ] The CI `secrets` job passes — it scans the whole history for secret-shaped VALUES
      (`gsk_…`, `eyJhbGciOi…`, a postgres URL with a password), excluding `.env.example` and
      `docs/`. Note: a scan for the literal `service_role` matches the placeholder in
      `.env.example` and fails on a clean repo, so it is deliberately not used.
- [ ] A fresh `git clone` + `npm install` + `.env` from `.env.example` runs locally
- [ ] Someone who has not seen the app can use it without being walked through it

---

## Progress

| Slice | Feature | Assignment | Status |
|---|---|---|---|
| F0 | Foundation | — | **done** |
| F1 | Document library | A1 | **done** |
| F2 | Verification engine | A3 engine | **done** |
| F3 | Ask one document | A2, A3 UI | **done** |
| F4 | Whole-document reading | A4 | not started |
| F5 | Citation highlighting | B5 | not started |
| F6 | Ask many documents | B6 | not started |
| F7 | Compare versions | B7 | not started |
| F8 | Tracked-change redlining | C1 | not started |
| F9 | Hardening and submission | submission | not started |

Update this table at the end of each slice, in the same commit as the NOTES.md entry.
