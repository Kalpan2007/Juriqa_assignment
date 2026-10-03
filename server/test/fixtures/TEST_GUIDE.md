# Test fixtures — guide and answer key

All documents are **fictional** and were generated for testing. No real company, person or
contract is used. Put this folder at `server/test/fixtures/`. Large files may be gitignored.

Every fact below was located with **pdf.js 6.3.289** (the same engine the app uses), so the page
numbers are the pages the app itself will see.

---

## 1. File list

| File | Format | What it is | Main use |
|---|---|---|---|
| `01-facility-agreement-162p.pdf` | PDF, 162 pages | AED 250m Term Facility Agreement, DIFC law, DIAC arbitration. Running header + "Page X of 162" footer on every page, 73 hyphenated line breaks, curly quotes, tables in schedules | Large documents, retrieval, coverage, verification, highlighting |
| `10-msa-v1.docx` / `10-msa-v1.pdf` | DOCX + PDF | Master Services Agreement v1 (Falcon Ridge ↔ Oasis Retail), 18 auto-numbered clauses, table, hyperlink, footnote, tabs, line breaks, **bold run inside the liability sentence** | Chat, highlighting on DOCX, comparison base, redlining |
| `11-msa-v2.docx` / `11-msa-v2.pdf` | DOCX + PDF | Same MSA after negotiation: 11 known changes (section 6) | Version comparison |
| `14-msa-v1-with-existing-tracked-change.docx` | DOCX | v1 with one existing tracked insertion (author "Oasis Legal") in the Warranties clause | Redline rejection `HAS_EXISTING_REVISIONS` |
| `20-nda-mutual.pdf` | PDF, 1 page | Mutual NDA, ADGM law, **no limitation-of-liability clause** | Multi-document questions |
| `21-lease-marina-plaza.docx` | DOCX | Commercial lease, Dubai law, landlord liability cap AED 45,000 | Multi-document questions |
| `30-scanned-full.pdf` | PDF, 3 pages | MSA v1 as an image-only scan (0 characters of text) | Must FAIL as scanned |
| `31-scanned-partial-pages-12-14.pdf` | PDF, 30 pages | First 30 pages of the facility; pages 12–14 are scans | Must be READY with a warning naming pages 12–14 |
| `32-password-protected.pdf` | PDF | MSA v1, password `juriqa-test` | `ENCRYPTED_PDF` |
| `33-corrupt-truncated.pdf` | PDF | NDA cut in half | `CORRUPT_FILE` |
| `34-fake-pdf-actually-text.pdf` | text named .pdf | Does not start with `%PDF-` | `UNSUPPORTED_TYPE` (byte sniffing) |
| `35-empty.pdf` | 0 bytes | Empty | `EMPTY_FILE` |
| `36-legacy-word.doc` | Word 97 .doc | The NDA in old binary format | Specific ".doc not supported" message |
| `37-password-protected.docx` | encrypted Office file | The lease, password `juriqa-test` (OLE container, not a ZIP) | `ENCRYPTED_DOCX` |
| `38-contract-photo.png` | PNG | Photo-like image of a contract page | `UNSUPPORTED_TYPE` |
| `39-meeting-notes.txt` | TXT | Plain text | `UNSUPPORTED_TYPE` |
| `40-too-many-pages-320p.pdf` | PDF, 320 pages | Price list | `TOO_MANY_PAGES` (limit 300) |
| `generators/` | scripts | The code that built every file | Rebuild or extend |

Not included (make it yourself, it is just a big file): **oversized upload**.
Mac/Linux: `truncate -s 26M big.pdf` · Windows: `fsutil file createnew big.pdf 27262976`
→ expect 413 with the 25 MB limit stated (the size check runs before content sniffing).

---

## 2. Upload & processing (Phase 1)

| Upload | Expected final status | Expected message / detail |
|---|---|---|
| `01-facility-agreement-162p.pdf` | READY, 162 pages | Visible stages Uploaded → Extracting (page n of 162) → Indexing → Ready. Polling never hits 429 |
| `10-msa-v1.docx`, `21-lease-marina-plaza.docx` | READY | One virtual page; HTML view shows numbered clauses, the table and the link as text |
| `30-scanned-full.pdf` | FAILED `SCANNED_PDF` | "This looks like a scanned PDF with no readable text…" — never READY |
| `31-scanned-partial-pages-12-14.pdf` | READY, `scannedPageCount = 3` | Warning banner names **pages 12–14** |
| `32-password-protected.pdf` | FAILED `ENCRYPTED_PDF` | pdf.js throws `PasswordException` |
| `33-corrupt-truncated.pdf` | FAILED `CORRUPT_FILE` | pdf.js throws `InvalidPDFException` |
| `34-fake-pdf-actually-text.pdf` | rejected 415 `UNSUPPORTED_TYPE` | Rejected at upload, nothing stored |
| `35-empty.pdf` | rejected `EMPTY_FILE` | |
| `36-legacy-word.doc` | rejected | "Old .doc format is not supported. Save as .docx and try again." |
| `37-password-protected.docx` | rejected/FAILED `ENCRYPTED_DOCX` | File starts with the OLE signature, not `PK` |
| `38-contract-photo.png`, `39-meeting-notes.txt` | rejected 415 | "Only PDF and DOCX files are supported." |
| `40-too-many-pages-320p.pdf` | FAILED `TOO_MANY_PAGES` | Limit (300) stated in the message |
| `10-msa-v1.pdf` uploaded twice | READY both times | "Same file as 10-msa-v1.pdf" hint |
| Facility upload, then kill the server mid-processing and restart | READY | Job resumes or is re-enqueued |

**Boilerplate check (facility):** every page ends with
`Term Facility Agreement – Al Noor Trading L.L.C. CONFIDENTIAL – EXECUTION VERSION` and
`Page N of 162`. These lines must be detected as boilerplate (D24) and excluded from chunks.

---

## 3. Quote verification (Phase 2) — unit-test cases from the real file

All against `01-facility-agreement-162p.pdf` unless stated.

| # | Quote given to the verifier | Expected | Why |
|---|---|---|---|
| V1 | `The Lender may set off any matured obligation due from an Obligor under the Finance Documents` | VERIFIED, p.108 | Plain match |
| V2 | `"Margin" means 2.75 per cent. per annum.` (straight quotes) | VERIFIED, p.6 | Document uses curly quotes “ ” |
| V3 | `a private company incorporated in the Dubai International Financial Centre with registered number 3317` | VERIFIED, p.4 (pass HYPHEN_BREAK) | Document has `Inter-` + line break + `national` |
| V4 | `pay to the Lender its Break Costs attributable to all or any part of a Loan being paid by the Borrower on a day other than the last day of an Interest Period for that Loan.` | VERIFIED, **crosses pages 40→41** | The running header/footer sits between "for" and "that Loan." in fullText — only passes with D24 |
| V5 | `The Borrower shall promptly notify the Lender of any Default (and the steps, if any, being taken to remedy it) upon becoming aware of its occurrence.` | VERIFIED, **3 matches**: p.77, p.85, p.156 | Multiple occurrences |
| V6 | `the lender may set off any matured obligation due from an obligor` | VERIFIED, matchKind CASE_INSENSITIVE + note | Only capitalisation differs |
| V7 | `Leverage in respect of any Relevant Period shall not exceed 3.75:1` | UNVERIFIED | One number changed (real: 3.50:1) |
| V8 | `The Borrower must keep its leverage below 3.5 times EBITDA` | UNVERIFIED | Paraphrase |
| V9 | `The Guarantor irrevocably ... guarantees to the Lender punctual performance` | UNVERIFIED | Ellipsis inside a quote |
| V10 | `AED 250` | UNVERIFIED | Under 8 characters |
| V11 | MSA quote `shall not exceed AED 100,000` attributed to the NDA | UNVERIFIED | Wrong document |

---

## 4. Chat & large documents (Phase 3) — `01-facility-agreement-162p.pdf`

| Question | Expected answer | Verified quote on page |
|---|---|---|
| What is the total commitment? | AED 250,000,000 | 5 |
| What is the margin? | 2.75% per annum over EIBOR | 6 (and 33) |
| *(follow-up)* And what is the default interest? | 2.00% p.a. above the normal rate | 33 |
| Is there a prepayment fee? | 1.00% of the amount prepaid before the 2nd anniversary of first utilisation; none after | 29 |
| How many utilisation requests can be made? | At most six (6) | 18 |
| What are the financial covenants? | Leverage ≤ 3.50:1, Interest Cover ≥ 4.00:1, Tangible Net Worth ≥ AED 400,000,000 | 81 |
| What is the cross-default threshold? | AED 10,000,000 | 89 |
| What is the legal fees cap? | AED 400,000 | 62 |
| When must annual accounts be delivered? | Within 120 days after year end | 77 |
| What security is given? | Mortgage over Plot S-20417 (JAFZ), receivables assignment, account pledge | 66 |
| What is the guarantor's maximum liability? | AED 300,000,000 plus interest, costs and expenses | 69 |
| **Where is the seat of arbitration and how many arbitrators?** (deep page) | DIFC seat, three arbitrators, DIAC Rules, English | **144** |
| Is the Lender liable for losses? | Only if directly caused by its gross negligence or wilful misconduct | 122 |
| How long does confidentiality last? | 12 months after full repayment / Lender ceasing to be a party | 129 |
| What existing security is there over a ship? | Ship mortgage over the vessel "Al Noor Pearl", AED 9,750,000 | 159 |
| What is the CEO's salary? | **Not in the document** — no invented answer, NOT_FOUND | — |
| **Does the agreement contain a force majeure clause?** | Auto THOROUGH mode with progress; only after reading everything: "No". The words "force majeure" appear nowhere in the document | — |
| Same question with thorough mode forced off | Must NOT say "the agreement has no force majeure clause"; must say "not found in the N sections reviewed" with the coverage line | — |
| Summarise every Event of Default *(press Stop after 2 seconds)* | Partial text kept, status "Stopped", no "unsupported" banner, still there after reload | — |

**Partially scanned file** (`31-scanned-partial-pages-12-14.pdf`): ask *"Are the Lender's
obligations several?"* The answer text (clause 2.3) is on scanned page 12, so the app must not
verify a quote from it, and coverage must say pages 12–14 were not readable.

---

## 5. Highlighting (Phase 4)

| Click the quote from | Expected highlight |
|---|---|
| V1 (p.108) | Single passage on page 108 |
| A definition spanning several lines, e.g. the "Material Adverse Effect" definition (p.6, several lines) | Every line highlighted |
| V4 Break Costs sentence | End of **page 40** AND start of **page 41**; the header/footer between them is NOT highlighted |
| V5 repeated sentence | Navigator "1 of 3" → p.77, p.85, p.156 |
| V3 hyphenated quote | Highlight covers "Inter-" and "national" on both lines |
| Any quote in `10-msa-v1.docx` (e.g. the liability sentence with the bold amount) | Highlighted in the HTML reading view, across the bold and normal parts |
| Repeat each at 75 %, 100 %, 150 % zoom | Boxes stay aligned |

---

## 6. Multi-document questions (Phase 5)

Select `10-msa-v1.docx`, `20-nda-mutual.pdf`, `21-lease-marina-plaza.docx` (add the facility
for a 4-document test).

| Question | Expected comparative answer |
|---|---|
| Compare the liability caps | MSA: Supplier capped at **AED 100,000** per Contract Year · Lease: Landlord capped at **AED 45,000** · NDA: **no limitation-of-liability clause found** in the reviewed sections (must not invent one) |
| Which agreements are governed by ADGM law? | Only the NDA. MSA v1 = DIFC law; Lease = Dubai/UAE law |
| How long do confidentiality obligations last? | MSA: 3 years after termination · NDA: 5 years after expiry/termination · (facility: 12 months) |
| Does any of these contain an arbitration clause? | Retrieval answer with per-document coverage + a "Search <name> thoroughly" button per document (D12). Truth: none of the three; only the facility has one (DIAC) |

Every quote chip shows its document name and opens that document highlighted.

---

## 7. Version comparison (Phase 6) — `10-msa-v1` → `11-msa-v2`

Run it twice: DOCX vs DOCX, then PDF vs PDF.

| # | Clause (v1 → v2 number) | Change | Expected type | Expected severity |
|---|---|---|---|---|
| 1 | Limitation of Liability (12 → 13) | Cap **AED 100,000 → AED 1,000,000** | MODIFIED | **HIGH** (money in liability clause) |
| 2 | Governing Law (16 → 16) | **DIFC → ADGM** law and courts | MODIFIED | **HIGH** |
| 3 | Insurance (11 → 12) | Supplier **shall → may** maintain insurance | MODIFIED | **HIGH** (obligation flip) |
| 4 | Fees and Payment (5 → 6) | Late interest **1.5% → 2%** per month | MODIFIED | **HIGH** (percentage in payment clause) |
| 5 | Fees and Payment table | Support Services **AED 12,000 → 15,000** | MODIFIED | **HIGH** (money in fees) |
| 6 | Termination (14 → 15) | Convenience notice **30 → 60 days** | MODIFIED | MEDIUM (duration) |
| 7 | Confidentiality (8 → 9) | Sentence reworded, same meaning | MODIFIED | **LOW** (or MEDIUM labelled "AI assessment") |
| 8 | Entire Agreement (17 → 17) | Only a comma removed | UNCHANGED / cosmetic | LOW at most |
| 9 | Implementation and Onboarding (new 4) | New clause | ADDED | MEDIUM |
| 10 | Counterparts (18) | Clause deleted | REMOVED | MEDIUM |
| 11 | Notices (15 → 18) | Moved to the end, text unchanged | MOVED | none |

Must also show: **one renumbering note** (clauses 4–14 became 5–15, Notices 15 → 18). Clauses
Services, Service Levels, Customer Obligations, IP, Non-Solicitation, Warranties and
Indemnities must NOT appear as changes.

Known PDF-only traps (good to handle, acceptable to document as limitations):
- The VAT **footnote** prints at the bottom of page 2. In v1 it lands after the Insurance clause, in
  v2 after Warranties, so a naive PDF diff reports fake changes there. DOCX comparison has no
  such issue.
- The **signature block** attaches to whichever clause is last (Counterparts in v1, Notices in v2).
- D25: "1.5 per cent." must not be mistaken for clause number 1.5.

Extra checks: compare `10-msa-v1.pdf` with `10-msa-v1.docx` → "No substantive differences"
(apart from the traps above). Compare a document with itself → blocked. Compare the facility with
the NDA → "These look like different contracts, not versions".

---

## 8. Redlining (Phase 7) — `10-msa-v1.docx`

| Instruction | Expected |
|---|---|
| Make the liability cap mutual | Edit in the Limitation of Liability clause: "the Supplier's total aggregate liability" → "each party's total aggregate liability". One revision |
| Increase the liability cap to AED 250,000 | Only `100,000` → `250,000` (and the words in brackets) marked. **The new amount stays bold, the rest stays normal** — the sentence is split across a bold and a normal run |
| Change the termination for convenience notice to 45 days, the payment term to 45 days, and the governing law to ADGM | **3+ edits in one pass**, in 3 different clauses (governing law has 2 sentences mentioning DIFC) |
| Change the Support Services fee to AED 13,500 | Edit **inside a table cell**; table layout unchanged |
| Change the acceptable use policy link text to falconridge.example/aup | Edit inside a **hyperlink**; link still works |
| Change the Supplier's notice attention line to Chief Legal Officer | Paragraph contains a **line break and a tab**; both survive |
| Remove the words "in accordance with Good Industry Practice" | The phrase occurs **twice** (Services, Service Levels): either two edits with unique context, or `AMBIGUOUS` rejection listing both — never a silent wrong edit |
| Merge clauses 2.1 and 2.2 into one sentence | Rejected: `CROSS_PARAGRAPH` |
| Add a new anti-bribery clause | Rejected clearly (whole new paragraph is out of scope) |
| Make the definition of "Services" bold | Rejected clearly (formatting-only change is out of scope) |
| On `14-msa-v1-with-existing-tracked-change.docx`: change "full capacity" to "full power" | Rejected: `HAS_EXISTING_REVISIONS` (Warranties paragraph already has a tracked insertion) |
| Redline on `10-msa-v1.pdf` | Disabled: "Tracked changes need the original .docx" |

For every downloaded file: opens in Word **and** LibreOffice without a repair prompt; each change
is a separate revision by "Contract Analyzer"; **Reject All** gives back the original text;
numbering, the table, the footnote and the hyperlink are unchanged.

---

## 9. Rebuilding the fixtures

`generators/` contains the scripts. Requirements: Python 3 with `reportlab`, `pyphen`, `pypdf`,
`Pillow`, `msoffcrypto-tool`; Node with `docx` and `pdfjs-dist@6.3.289`; LibreOffice and
poppler-utils (`pdftoppm`).

```
python3 build_facility.py 24 out/01-facility-agreement-162p.pdf
node gen_docx.js                      # MSA v1/v2, NDA, lease (.docx)
soffice --headless --convert-to pdf out/10-msa-v1.docx out/11-msa-v2.docx out/20-nda-mutual.docx --outdir out
python3 build_bad.py                  # scans, encryption, corrupt, wrong types, 320 pages
soffice --headless --convert-to doc:"MS Word 97" out/20-nda-mutual.docx --outdir out   # then rename to 36-legacy-word.doc
python3 make_tracked_change.py        # 14-msa-v1-with-existing-tracked-change.docx
node extract.mjs out/01-facility-agreement-162p.pdf > facility.json   # text exactly as pdf.js sees it
```
If you change the generator, page numbers in this guide may shift — re-run `extract.mjs` and
re-check them.
