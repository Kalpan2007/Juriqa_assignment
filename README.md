# Contract Analyzer

> **AI-Powered Legal Contract Analysis & Tracked-Change Redlining Engine**  
> *Built for UAE legal practices and international commercial contracts.*

[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-blue.svg?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16.1_App_Router-black.svg?logo=next.js&logoColor=white)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11.0-e0234e.svg?logo=nestjs&logoColor=white)](https://nestjs.com/)
[![Prisma](https://img.shields.io/badge/Prisma-7.0-2D3748.svg?logo=prisma&logoColor=white)](https://www.prisma.io/)
[![Tailwind CSS](https://img.shields.io/badge/TailwindCSS-v4-38B2AC.svg?logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
[![Turborepo](https://img.shields.io/badge/Turborepo-Monorepo-EF4444.svg?logo=turborepo&logoColor=white)](https://turbo.build/)
[![Tests](https://img.shields.io/badge/Tests-578_Passing_(100%25)-brightgreen.svg)]()

---

## 🔗 Live Deployments & Demo

- 🌐 **Live Web Application:** [https://juriqa-assignment-kappa.vercel.app](https://juriqa-assignment-kappa.vercel.app/)
- ⚡ **Backend API Service:** [https://juriqa-assignment.onrender.com](https://juriqa-assignment.onrender.com) (Health: [https://juriqa-assignment.onrender.com/health/ready](https://juriqa-assignment.onrender.com/health/ready))
- 🎥 **Video Walkthrough (YouTube):** [Watch Demo Video (https://youtu.be/hn4KR6n86Oo)](https://youtu.be/hn4KR6n86Oo)
- 📁 **Sample Test Contracts:** Pre-bundled in [`TEST_FILES/`](./TEST_FILES/) (Facility agreement 162p, MSA v1 & v2, NDAs, scanned samples)

---

## ⚖️ The Core Principle: "Never Trust the AI"

In legal contract analysis, hallucinated quotes or fabricated clause citations can compromise legal counsel. This application is engineered around one foundational rule:

> **The AI is strictly an unprivileged drafter.**  
> It is **never** trusted for coordinates, offsets, page numbers, or quote authenticity. Every supporting citation must be **independently discovered, bounded, and verified by our deterministic TypeScript verification engine** inside the source document.
> - **Matched quotes** are verified with green badges and interactive viewport jump links.
> - **Unmatched or altered quotes** are flagged as `UNVERIFIED` and barred from citation overlays.
> - If an answer does not exist in the contract, the engine reports its absence rather than inventing terms.

---

## 📸 Visual Tour

### 1. Document Chat & Precision Citation Highlighting
*Ask complex questions against 100+ page contracts. Clicking any verified quote jumps directly to the rendered page and overlays viewport bounding-box highlights.*

![Citation Highlighting and Quote Verification](screenshots/highlight_feature.png)

---

### 2. Clause-by-Clause Contract Comparison
*Compare two contract versions with Needleman-Wunsch sequence alignment, plain-language legal change summaries, and automatic risk severity scoring (HIGH / MEDIUM / LOW).*

![Version Comparison Engine](screenshots/comparision_image.png)

---

### 3. Multi-Document Cross-Contract Analysis
*Query across multiple agreements simultaneously (e.g. comparing master agreements against NDAs) with document-isolated quote verification and unified legal synthesis.*

![Multi-Document Analysis](screenshots/multi_compare.png)

---

## 📋 Feature Matrix (Assignment Requirements)

| Section | Feature | Implementation Details | Status |
|:---|:---|:---|:---:|
| **Part A.1** | **Upload & Processing** | PDF (`pdfjs-dist`) & DOCX (`mammoth`) extraction, magic-byte sniffing (`pdf-parse`/`mammoth`), scanned PDF detection (amber alert banners for missing OCR text), encrypted file rejection. | **100% Complete** |
| **Part A.2** | **Streaming Chat** | Server-Sent Events (SSE) streaming answers word-by-word with abort controller support; persistent chat sessions per document in PostgreSQL. | **100% Complete** |
| **Part A.3** | **Quote Verification Engine** | Independent deterministic substring & normalized token matcher; supports curly/straight quotes, soft hyphens, whitespace compression, and case-insensitivity. | **100% Complete** |
| **Part A.4** | **Large Contracts (150+ Pages)** | Tested on 162-page Facility Agreement. Automatic **Thorough Scan Mode** for negative/absence queries with chunked map-reduce and honest coverage badges (`COMPLETE` vs `PARTIAL`). | **100% Complete** |
| **Part B.5** | **Citation Highlighting** | Viewport coordinate mapping with PDF text layer bounding boxes; DOCX reading mode DOM text ranges; multi-line & across-page highlight support. | **100% Complete** |
| **Part B.6** | **Multi-Document Chat** | Multi-contract selector with D1/D2 aliases, comparative synthesis, and strictly document-isolated quote verification. | **100% Complete** |
| **Part B.7** | **Version Comparison** | Clause-level sequence alignment, semantic diffs, renumbering shift notes, and risk severity tags (e.g., changes to liability caps, governing law, or payment days). | **100% Complete** |
| **Part C.1** | **Tracked-Change Redlining (Chosen)** | Native OpenXML `.docx` surgery injecting `<w:del>` and `<w:ins>` nodes into `word/document.xml`. Preserves styles and tables; self-checked with `simulateAccept()` / `simulateReject()`. | **100% Complete** |

---

## 🏛️ System Architecture

```text
                        ┌────────────────────────────────────────┐
                        │      Client Application (Next.js 16)   │
                        │  React 19 • Tailwind CSS v4 • Zustand  │
                        └───────────────────┬────────────────────┘
                                            │ HTTPS / SSE
                                            ▼
                        ┌────────────────────────────────────────┐
                        │        NestJS 11 Backend Server        │
                        │   Fastify/Express • Zod Pipes • CORS   │
                        └─┬──────────────┬──────────────┬────────┘
                          │              │              │
       ┌──────────────────┘              │              └──────────────────┐
       ▼                                 ▼                                 ▼
┌──────────────┐               ┌───────────────────┐              ┌────────────────┐
│  Prisma ORM  │               │ Processing Engine │              │ Groq / OpenAI  │
│  PostgreSQL  │               │  • pdfjs-dist     │              │ LLM Streaming  │
│  • Full-Text │               │  • OpenXML Redline│              │ • Llama 3.3 70B│
│  • pg-boss   │               │  • Quote Verifier │              │ • SSE chunks   │
└──────────────┘               └───────────────────┘              └────────────────┘
```

---

## 📝 Short Submission Note (Half-Page Requirement)

### 1. How Quote Verification Works & Where It Could Fail
- **Mechanism:** When the LLM emits a citation block `[Quote: "...", Page: X]`, our backend intercepts the quote before client dispatch. It queries the document’s pre-indexed text layer and runs a 4-tier waterfall match:
  1. *Exact Substring:* Character-for-character match within the specified page or whole document.
  2. *Typographic Normalization:* Converts curly quotes (`“ ” ‘ ’`), en/em-dashes (`– —`), non-breaking spaces (`\u00A0`), and ligatures (`ﬁ`, `ﬂ`) into standard ASCII equivalents.
  3. *Whitespace & Soft-Hyphen Reconstruction:* Collapses multi-line breaks and strips trailing hyphens where words break across column or page margins.
  4. *Token-Sequence Proximity:* Matches consecutive token windows allowing for minor OCR punctuation anomalies while enforcing strict word ordering.
- **Failure Boundaries:** Verification intentionally fails if the AI paraphrases a single substantive word (e.g. changing *"shall"* to *"may"* or changing a monetary figure). It also fails if PDF text extraction produces scrambled font glyphs from non-standard embedded Type 3 fonts without ToUnicode CMaps. In these cases, the quote is marked `UNVERIFIED` to preserve safety.

### 2. How Large Documents (150+ Pages) Are Handled
- **Target Contract:** Tested against `01-facility-agreement-162p.pdf` (~60,000 words).
- **Hybrid Retrieval Strategy:** For targeted factual questions, the engine leverages PostgreSQL full-text search (`tsvector` with `ts_rank_cd`) combined with section-aware window expansion to locate candidate provisions in sub-second time.
- **Thorough Scan Mode:** For negative questions (e.g., *"Is there a non-compete clause?"*), standard retrieval is unsafe because absence of search results does not prove absence of legal obligation. The system triggers a parallel map-reduce scan across 15-page overlapping sliding windows, aggregates clause detections, and reports an explicit `COMPLETE` coverage badge. If token quotas truncate the read, it alerts the user with `PARTIAL` coverage and the exact pages scanned.

### 3. Part C Selection: Tracked-Change Redlining in Native `.docx`
- **Choice & Rationale:** We selected **Option 1 (Tracked-Change Redlining)** because in real-world transactional legal practice, lawyers reject AI output that forces manual re-typing. Outputting a native Word document where redlines appear in Microsoft Word's native Reviewing pane provides immediate client utility.
- **Technical Challenge:** Word DOCX files are zipped OpenXML packages (`word/document.xml`). In Word XML, a single grammatical sentence is frequently fractured across multiple run tags (`<w:r>`) due to formatting, spell-check bookmarks, or editing history. A naive string replace will corrupt the XML or fail to find text that spans runs.
- **Implementation Approach:**
  1. We parse `word/document.xml` using a streaming XML DOM builder.
  2. We map paragraph character offsets back to their constituent `<w:r>` (run) and `<w:t>` (text) nodes.
  3. When an insertion or deletion is applied, we split boundary runs, wrap deletions in `<w:del w:id="..." w:author="Contract Analyzer" w:date="..."><w:r><w:delText>...</w:delText></w:r></w:del>`, and wrap additions in `<w:ins>`.
  4. We execute automated internal self-checks (`simulateAccept` and `simulateReject`) to prove that accepting all revisions yields the target text and rejecting all revisions recreates the exact original without XML corruption.

### 4. What We Would Build Next With More Time
1. **Bilingual Arabic/English Alignment:** Dual-column contract comparison with RTL layout support for UAE onshore court contracts.
2. **Interactive Redline Negotiation Sandbox:** Allow users to tweak proposed redline language directly in the browser before generating the final `.docx` download.
3. **Automated Playbook Compliance Engine:** Upload firm-standard fallback positions (e.g. standard liability cap limits) and automatically highlight clauses that deviate from standard firm guidelines.

---

## 🚀 Local Development Setup

### Prerequisites
- **Node.js:** `v22.x` or `v24.x` (LTS recommended)
- **PostgreSQL:** Local PostgreSQL 16+ or Supabase Postgres database
- **npm:** v10+ with workspace support

### 1. Clone the Repository
```bash
git clone https://github.com/Kalpan2007/Juriqa_assignment.git
cd Juriqa_assignment
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env` in the root directory:
```bash
cp .env.example .env
```
Key variables in `.env`:
```env
# Database (PostgreSQL / Supabase)
DATABASE_URL="postgresql://postgres:your-password@db.supabase.co:5432/postgres?schema=public"

# LLM Provider (Groq or OpenAI-compatible)
LLM_PROVIDER="groq"
LLM_API_KEY="gsk_your_groq_api_key_here"
LLM_MODEL="llama-3.3-70b-versatile"

# Storage Configuration
STORAGE_DRIVER="local"
STORAGE_LOCAL_DIR="./uploads"

# Ports & URLs
SERVER_PORT=3001
CLIENT_ORIGIN="http://localhost:3000"
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

### 3. Install Dependencies & Generate Database Client
```bash
npm install
npm run prisma:generate -w @ca/server
npm run prisma:deploy -w @ca/server
```

### 4. Start Development Servers
Open two terminal windows:

```bash
# Terminal 1: Backend API (NestJS)
npm run dev -w @ca/server

# Terminal 2: Frontend App (Next.js)
npm run dev -w @ca/client
```
- Frontend will be live at: **`http://localhost:3000`**
- Backend will be live at: **`http://localhost:3001`** (Health check: `http://localhost:3001/health/ready`)

---

## ☁️ Production Deployment Guide

### A. Deploy Backend on Render (Web Service)

1. Create a **New Web Service** connected to your repository on [Render](https://render.com).
2. Configure the following service settings:
   - **Environment:** `Node`
   - **Branch:** `main`
   - **Root Directory:** *(leave blank — use repository root)*
   - **Build Command:**
     ```bash
     npm install && npx prisma generate --schema=server/prisma/schema.prisma && npx turbo run build --filter=@ca/server...
     ```
   - **Start Command:**
     ```bash
     node server/dist/main.js
     ```
3. Set the following **Environment Variables** in Render:
   - `DATABASE_URL`: Your Supabase connection string.
   - `LLM_API_KEY`: Your Groq API key (`gsk_...`).
   - `LLM_PROVIDER`: `groq`
   - `LLM_MODEL`: `llama-3.3-70b-versatile`
   - `STORAGE_DRIVER`: `supabase` *(or `local`)*
   - `SUPABASE_URL`: Your Supabase project URL.
   - `SUPABASE_SERVICE_ROLE_KEY`: Supabase service role secret.
   - `SUPABASE_STORAGE_BUCKET`: `contracts`
   - `WEB_ORIGIN`: `https://juriqa-assignment-kappa.vercel.app` (or `*`)
   - `NODE_ENV`: `production`

---

### B. Deploy Frontend on Vercel

1. Import your GitHub repository in [Vercel](https://vercel.com).
2. Configure project settings:
   - **Framework Preset:** `Next.js`
   - **Root Directory:** `client`
   - **Build Command:** `npm run build` (or leave default Next.js build)
   - **Output Directory:** `.next`
3. Set **Environment Variables** in Vercel:
   - `NEXT_PUBLIC_API_URL`: `https://juriqa-assignment.onrender.com`
4. Click **Deploy**.

---

## 🧪 Testing & Code Quality

```bash
# Run all server unit & integration tests (512 tests)
npm test -w @ca/server

# Run client tests
npm test -w @ca/client

# Monorepo typecheck & lint verification
npm run typecheck
npm run lint
```

---

## 📦 Monorepo Workspace Structure

```text
├── client/                     # Next.js 16 (React 19, Tailwind CSS v4, Zustand)
│   ├── src/app/                # App router (library, ask, compare, redline)
│   └── src/features/           # Feature slices (chat, viewer, compare, redline)
├── server/                     # NestJS 11 Application
│   ├── src/core/               # Error handling, Zod validation pipes, SSE filters
│   ├── src/features/           # Domain features (documents, verification, chat, comparison, redline)
│   ├── src/infrastructure/     # Prisma DB, Supabase storage, Groq LLM client
│   └── prisma/                 # Database schema and migration scripts
├── shared/                     # Shared TypeScript contracts, DTOs & Zod schemas
├── screenshots/                # Application demonstration screenshots
├── TEST_FILES/                 # Standard test contract suite (Facility 162p, MSA v1/v2, NDAs)
└── docs/                       # Technical specs and assignment documentation
```

---

## ⚖️ License
MIT License. Built for the Juriqa Engineering Assignment submission.