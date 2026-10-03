# Submission Note — Contract Analyzer

This note addresses the four key architectural and design questions outlined in the assignment assessment criteria.

---

### 1. How quote verification works, and where it could fail

#### The Engine
Our quote verification engine is built on the iron rule: **The LLM is never trusted**. The model streams an answer followed by candidate quotes wrapped in a delimiter (`---QUOTES---`). The verification engine independently searches the parsed document `fullText` for every single candidate quote.
- **Pass 1 — Exact Substring:** Verifies byte-for-byte exact matches and computes precise character offsets `[startOffset, endOffset]`.
- **Pass 2 — Punctuation & Whitespace Normalization:** Normalizes ASCII quotes (`'` and `"`) with Unicode typographic quotes (`‘`, `’`, `“`, `”`), collapses whitespace, and handles hyphenated line breaks (`Inter-` + `\n` + `national` reconstructed as `International`).
- **Pass 3 — Case-Insensitive Match with Disclosure:** If a quote matches only with differing capitalization, it is verified as `matchKind: "CASE_INSENSITIVE"` with an explicit note, preserving transparency.
- **Header/Footer Stripping:** Document extraction strips running headers and footers (e.g., `Page X of 162`) so quotes spanning page boundaries match without failing.

#### Edge Cases & Failure Modes
- **Paraphrasing & Number Modifications:** If the model alters a single digit (e.g., `3.50:1` changed to `3.75:1`) or paraphrases a sentence, it is flagged as `UNVERIFIED`. It is never silently dropped; rather, the user is visibly alerted that the AI's assertion could not be located in the text.
- **Ambiguous Duplicates:** When a boilerplate clause (e.g., notice or default clause) appears multiple times, the engine records all occurrences. If retrieval context is provided, it prioritizes the occurrence closest to the retrieved chunk.
- **OCR / Scanned Text Degradation:** If a document is partially scanned and text is garbled, OCR jitter can cause genuine passages to fail exact/normalized matching. In our system, partially scanned documents flag the specific scanned pages in the UI, informing the user of the reduced confidence zone.
- **Future Production Guard:** In production, we would add an embedding-assisted fuzzy alignment threshold with Levenshtein-bounded token alignment, strictly requiring ≥98% token identity before accepting minor OCR artifacts.

---

### 2. How large documents are handled (e.g., 150-page facility agreement)

Handling 150-page contracts like `01-facility-agreement-162p.pdf` (162 pages, 250M AED Facility Agreement) requires strict cost, memory, and latency controls:
- **Memory & Virtual Windowing:** The server extracts pages sequentially using `pdfjs-dist` (pinned to 6.3.289) and persists text chunks into PostgreSQL. The PDF viewer does not load all pages into DOM at once; it serves a paginated window (`/documents/:id/pages?from=1&to=10`) with placeholder sizing calculated from page layout dimensions.
- **Chunking Strategy:** Documents are segmented into semantically coherent clauses (~1,500 characters with 200-character overlap) bounded by clause headers (e.g., `Clause 12.1`, `Section 5`). Running headers and footers are filtered via boilerplate detection before chunking.
- **Retrieval Strategy:** We use PostgreSQL full-text search (`tsvector` with `ts_rank_cd` and `websearch_to_tsquery`) on a dedicated GIN index, fetching the top 5 most relevant chunks. For targeted questions, this confines the prompt to ~8k tokens, executing in under 2 seconds.
- **Thorough Mode (Absence Questions):** For negative questions ("Is there a non-compete clause?"), retrieval cannot prove absence. We invoke "Thorough Mode", which partitions the document into sequential clause batches, scans each batch, reports live percentage progress (not a fake spinner), and provides an honest `coverage: "COMPLETE"` or `"PARTIAL"` badge with the exact unread page count.

---

### 3. Which Part C option was chosen and why (Tracked-Change Redlining)

We chose **Option 1: Tracked-Change Redlining into the original `.docx`**.

#### Rationale
Law firms live in Microsoft Word. Exporting a brand-new generated document or providing a plain text diff destroys existing styling, table layouts, custom margins, headers/footers, and macro templates. By taking the user's uploaded `.docx` and inserting native OpenXML `<w:del>` and `<w:ins>` revisions with author metadata (`"Contract Analyzer"`), lawyers can open the redlined contract directly in desktop Microsoft Word, see standard redline markup, and accept or reject individual changes with the native Word Reviewing toolbar.

#### Architecture & Implementation
1. **Direct OOXML Package Manipulation:** We open the `.docx` archive via JSZip and parse `word/document.xml` using `@xmldom/xmldom`.
2. **Paragraph & Run Model:** We map paragraph text to underlying `<w:r>` runs. When text spans or splits runs, we normalize child elements (isolating `<w:tab/>` and `<w:br/>`) and clone run formatting (`<w:rPr>`) so newly inserted text inherits the exact bold, italic, font, and size attributes of the modified clause.
3. **Word-Level Tracked Diffing:** We run word-level diffing (`diffWordsWithSpace`) between the original target text and replacement text, wrapping deletions in `<w:del w:id="..." w:author="Contract Analyzer" w:date="..."><w:delText>` and insertions in `<w:ins ...><w:t>`.
4. **Safety & Self-Check Validation:** Before writing the file back, our engine runs two automated simulation tests:
   - `simulateAccept()`: Asserts that accepting all revisions produces the exact intended redlined text.
   - `simulateReject()`: Asserts that rejecting all revisions produces byte-for-byte identical text to the original input.
5. **Rejection Safeguards:** The engine strictly rejects edits if:
   - The target text is ambiguous (occurs multiple times without enough surrounding context).
   - The target text already contains existing unaccepted tracked changes (`HAS_EXISTING_REVISIONS`, tested against `14-msa-v1-with-existing-tracked-change.docx`).
   - The proposed edit crosses paragraph boundaries or overlaps another edit.

#### The Hardest Part
The trickiest challenge was handling runs containing mixed content nodes (e.g., `<w:t>`, `<w:tab/>`, `<w:br/>`). Word often groups text before and after a tab inside a single run. Slicing such runs naively caused duplicate tab characters to be injected. We resolved this by building a pre-pass `normalizeRunChildren()` algorithm that separates distinct child nodes into their own runs with inherited formatting properties before performing text replacement.

---

### 4. What is finished, what has rough edges, and what to build next

#### What is Finished
- **F0–F3:** Full monorepo foundation, document upload (PDF/DOCX), magic-byte sniffing, scanned/corrupt file rejection, verified quotes engine (exact, whitespace, punctuation, case-insensitive), streaming chat with SSE, citation metadata persistence.
- **F4 (Thorough Mode):** Full whole-document batch scanning with live progress reporting, absence detection, and coverage badges.
- **F5 (Citation Highlighting):** Viewport coordinate calculation from PDF text layout items, auto-scrolling to cited pages, and rendering precise yellow highlight bounding boxes on PDFs and DOM ranges on DOCX.
- **F6 (Multi-Document Chat):** Comparing contracts across multiple documents with automatic `D1`, `D2` aliases and strict cross-document quote verification.
- **F7 (Version Comparison):** Clause-level diffing using Needleman-Wunsch sequence alignment, change classification (`MODIFIED`, `ADDED`, `REMOVED`, `MOVED`, `UNCHANGED`), severity tagging (`HIGH`, `MEDIUM`, `LOW`), renumbering note synthesis, side-by-side and inline UI views.
- **F8 (Tracked-Change Redlining):** Native OOXML Word editing with `<w:del>` / `<w:ins>`, word-level diffs, simulation checks, and `.docx` download.
- **Testing:** 512 unit tests + 66 integration tests passing across all packages; clean lint and TypeScript checks.

#### Known Rough Edges
- **Complex Word Tables in Redlining:** Redlining currently targets standard body paragraphs. If an edit is requested inside nested table cells or header/footer fields, the engine gracefully rejects it rather than corrupting complex table XML schemas.
- **Scanned PDF Highlighting:** For scanned or partially scanned PDFs where text extraction yields 0 text items, geometric highlighting cannot be mapped to character offsets; a warning banner is shown instead.

---

### 5. Bugs the testing caught (all fixed)

These are the ones worth knowing about, because each would have shipped silently:

1. **Groq Free/On-Demand Tier 8,000 TPM Limit (HTTP 413):**
   - *Symptom:* Chat streams failed immediately with `LLM_UNAVAILABLE` despite valid API credentials.
   - *Cause:* `LLM_MAX_INPUT_TOKENS` was set to 12,000 in `.env`. The budgeter packed retrieved context up to this limit, producing ~9,000 total tokens with output reserve. Groq strictly enforces an 8,000 Token-Per-Minute ceiling on free/on-demand tiers, rejecting requests with HTTP 413 `Request too large ... on tokens per minute (TPM)`.
   - *Fix:* Configured `LLM_MAX_INPUT_TOKENS=5500` and `LLM_TPM_BUDGET=7500` in `.env` and `.env.example`, and mapped HTTP 413 to `LLM_RATE_LIMITED` in `errorCode()`. Prompts now consistently stay within safe operational limits while retaining ample context.

2. **Scanned PDF Status Overwrite:**
   - *Symptom:* Scanned PDFs with zero extractable text were erroneously marked as `READY`.
   - *Cause:* `processPdf` set the status to `FAILED`, but the caller subsequently overwrote the database record with `READY`.
   - *Fix:* Enforced that terminal statuses (`FAILED`) are immutable and cannot be overwritten by subsequent pipeline stages.

3. **OOXML Run Child Normalization in Redlining:**
   - *Symptom:* Redlining paragraphs containing tabs (`<w:tab/>`) or line breaks (`<w:br/>`) caused duplicate whitespace or malformed XML in Word.
   - *Cause:* Word frequently packages text and structural nodes within a single `<w:r>` run. Slicing the run text without isolating non-text nodes duplicated the child elements.
   - *Fix:* Introduced `normalizeRunChildren()` to isolate distinct run children into individual runs before diff calculation.

---

### 6. What We Would Build Next With More Time
1. **Hybrid Vector + Keyword Search:** Combine our current PostgreSQL full-text search with pgvector embeddings (e.g., `text-embedding-3-small`) to enable semantic retrieval across synonyms and complex cross-clause dependencies.
2. **Clause Extraction & Playbook Compliance:** Automatically categorize standard clauses (Indemnity, Limitation of Liability, Termination, Governing Law) and compare them against a customizable law firm playbook to flag deviation risks automatically upon upload.
3. **Arabic Contract Support:** Support bilingual UAE contracts (Arabic/English) with RTL layout rendering, Arabic quote normalization (handling diacritics / Tashkeel and Tatweel), and bidirectional highlighting.

