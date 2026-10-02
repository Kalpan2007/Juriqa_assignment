-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('PDF', 'DOCX');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'EXTRACTING', 'INDEXING', 'READY', 'FAILED');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('USER', 'ASSISTANT');

-- CreateEnum
CREATE TYPE "MessageStatus" AS ENUM ('STREAMING', 'DONE', 'STOPPED', 'ERROR');

-- CreateEnum
CREATE TYPE "AnswerStatus" AS ENUM ('ANSWERED', 'NOT_FOUND', 'UNSUPPORTED', 'PARTIAL');

-- CreateEnum
CREATE TYPE "RetrievalMode" AS ENUM ('RETRIEVAL', 'THOROUGH');

-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('VERIFIED', 'UNVERIFIED');

-- CreateEnum
CREATE TYPE "MatchKind" AS ENUM ('EXACT_WS', 'HYPHEN_BREAK', 'WS_INSENSITIVE', 'CASE_INSENSITIVE');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'RUNNING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "Document" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "statusDetail" TEXT,
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "pageCount" INTEGER,
    "scannedPageCount" INTEGER NOT NULL DEFAULT 0,
    "storageKey" TEXT NOT NULL,
    "html" TEXT,
    "fullText" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Page" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "width" DOUBLE PRECISION,
    "height" DOUBLE PRECISION,
    "textChars" INTEGER NOT NULL DEFAULT 0,
    "isScanned" BOOLEAN NOT NULL DEFAULT false,
    "items" JSONB,

    CONSTRAINT "Page_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chunk" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "heading" TEXT,
    "clauseRef" TEXT,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "tokenCount" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "isBoilerplate" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Chunk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Chat" (
    "id" UUID NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Chat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatDocument" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "alias" TEXT NOT NULL,

    CONSTRAINT "ChatDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "id" UUID NOT NULL,
    "chatId" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "status" "MessageStatus" NOT NULL DEFAULT 'DONE',
    "answerStatus" "AnswerStatus",
    "mode" "RetrievalMode" NOT NULL DEFAULT 'RETRIEVAL',
    "coverage" JSONB,
    "errorCode" TEXT,
    "usage" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" UUID NOT NULL,
    "messageId" UUID NOT NULL,
    "documentId" UUID,
    "citation" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "status" "QuoteStatus" NOT NULL,
    "matches" JSONB,
    "matchKind" "MatchKind",

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Comparison" (
    "id" UUID NOT NULL,
    "baseDocumentId" UUID NOT NULL,
    "revisedDocumentId" UUID NOT NULL,
    "baseSha256" TEXT NOT NULL,
    "revisedSha256" TEXT NOT NULL,
    "algorithmVersion" INTEGER NOT NULL DEFAULT 1,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "result" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Comparison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Redline" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "instruction" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "errorCode" TEXT,
    "edits" JSONB,
    "outputKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Redline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LlmCall" (
    "id" UUID NOT NULL,
    "purpose" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LlmCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Document_status_idx" ON "Document"("status");

-- CreateIndex
CREATE INDEX "Document_sha256_idx" ON "Document"("sha256");

-- CreateIndex
CREATE INDEX "Document_createdAt_idx" ON "Document"("createdAt");

-- CreateIndex
CREATE INDEX "Page_documentId_number_idx" ON "Page"("documentId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Page_documentId_number_key" ON "Page"("documentId", "number");

-- CreateIndex
CREATE INDEX "Chunk_documentId_ordinal_idx" ON "Chunk"("documentId", "ordinal");

-- CreateIndex
CREATE INDEX "Chunk_documentId_isBoilerplate_idx" ON "Chunk"("documentId", "isBoilerplate");

-- CreateIndex
CREATE UNIQUE INDEX "Chunk_documentId_ordinal_key" ON "Chunk"("documentId", "ordinal");

-- CreateIndex
CREATE INDEX "Chat_updatedAt_idx" ON "Chat"("updatedAt");

-- CreateIndex
CREATE INDEX "ChatDocument_documentId_idx" ON "ChatDocument"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatDocument_chatId_documentId_key" ON "ChatDocument"("chatId", "documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatDocument_chatId_alias_key" ON "ChatDocument"("chatId", "alias");

-- CreateIndex
CREATE INDEX "Message_chatId_createdAt_idx" ON "Message"("chatId", "createdAt");

-- CreateIndex
CREATE INDEX "Message_status_idx" ON "Message"("status");

-- CreateIndex
CREATE INDEX "Quote_messageId_idx" ON "Quote"("messageId");

-- CreateIndex
CREATE INDEX "Quote_documentId_idx" ON "Quote"("documentId");

-- CreateIndex
CREATE INDEX "Comparison_status_idx" ON "Comparison"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Comparison_baseSha256_revisedSha256_algorithmVersion_key" ON "Comparison"("baseSha256", "revisedSha256", "algorithmVersion");

-- CreateIndex
CREATE INDEX "Redline_documentId_createdAt_idx" ON "Redline"("documentId", "createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_createdAt_idx" ON "LlmCall"("createdAt");

-- CreateIndex
CREATE INDEX "LlmCall_purpose_idx" ON "LlmCall"("purpose");

-- AddForeignKey
ALTER TABLE "Page" ADD CONSTRAINT "Page_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Chunk" ADD CONSTRAINT "Chunk_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocument" ADD CONSTRAINT "ChatDocument_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatDocument" ADD CONSTRAINT "ChatDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_baseDocumentId_fkey" FOREIGN KEY ("baseDocumentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comparison" ADD CONSTRAINT "Comparison_revisedDocumentId_fkey" FOREIGN KEY ("revisedDocumentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Redline" ADD CONSTRAINT "Redline_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Full-text search on Chunk (ARCHITECTURE.md section 2 / section 6)
--
-- Prisma cannot express a GENERATED column, so the tsvector and its GIN index are
-- added here by hand. The column is STORED and maintained by Postgres, which means
-- it can never drift from Chunk.text the way a trigger-maintained column could.
--
-- Queries use websearch_to_tsquery('english', ...) ranked with ts_rank_cd and run as
-- raw SQL in chunk-search.repository.ts, because `tsv` is intentionally absent from
-- the Prisma model.
-- ---------------------------------------------------------------------------
ALTER TABLE "Chunk"
  ADD COLUMN "tsv" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "text")) STORED;

CREATE INDEX "Chunk_tsv_idx" ON "Chunk" USING GIN ("tsv");
