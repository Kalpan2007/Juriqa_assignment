import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../../../generated/prisma';
import { PrismaService } from '../../infrastructure/database/prisma.service';

/**
 * Full-text search over chunks (ARCHITECTURE section 6).
 *
 * Raw SQL, because `Chunk.tsv` is a GENERATED tsvector column that Prisma cannot express — it
 * is maintained by Postgres itself, so it can never drift from `Chunk.text` the way a
 * trigger-maintained or application-maintained column could.
 *
 * Boilerplate chunks are excluded from every query. In a 150-page contract the running
 * header appears 150 times, and left in it would outrank real clauses for any query that
 * happens to share a word with it.
 */

export interface SearchedChunk {
  id: string;
  ordinal: number;
  heading: string | null;
  clauseRef: string | null;
  startOffset: number;
  endOffset: number;
  tokenCount: number;
  text: string;
  score: number;
}

/** Below this many results, the strict query is treated as having failed. */
const WEAK_RESULT_THRESHOLD = 3;

/** A chunk whose heading matches the query is worth more than one that merely mentions it. */
const HEADING_BOOST = 1.5;

/** A boost for the definitions section when the question mentions a defined Term. */
const DEFINITION_BOOST = 1.2;

@Injectable()
export class ChunkSearchRepository {
  private readonly logger = new Logger(ChunkSearchRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Ranked search within one document.
   *
   * Two queries, in order:
   *  1. `websearch_to_tsquery` — understands quoted phrases and `-exclusions`, and ANDs the
   *     terms, which gives precise results when the question shares vocabulary with the text;
   *  2. `plainto_tsquery` with the terms OR-ed — the fallback for when (1) returns almost
   *     nothing, which happens whenever the user's words differ from the contract's.
   *
   * Without the fallback, "Can I get out of this early?" returns nothing at all against a
   * contract that says "termination for convenience".
   */
  async search(documentId: string, query: string, limit: number): Promise<SearchedChunk[]> {
    const strict = await this.runSearch(documentId, query, limit, 'websearch');

    if (strict.length >= WEAK_RESULT_THRESHOLD) return strict;

    const loose = await this.runSearch(documentId, query, limit, 'plain-or');

    // Merge, preferring the strict result's score where a chunk appears in both.
    const merged = new Map<string, SearchedChunk>();
    for (const chunk of [...loose, ...strict]) merged.set(chunk.id, chunk);

    return [...merged.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  }

  private async runSearch(
    documentId: string,
    query: string,
    limit: number,
    mode: 'websearch' | 'plain-or',
  ): Promise<SearchedChunk[]> {
    // An OR-ed query built from no usable terms would be `to_tsquery('')`, which errors.
    const orQuery = mode === 'plain-or' ? this.toOrQuery(query) : null;
    if (mode === 'plain-or' && (orQuery === null || orQuery.length === 0)) return [];

    // `websearch_to_tsquery` never throws on user input, which is exactly why it is used for
    // the strict pass; the OR-ed fallback is built from word characters only, so it is safe too.
    const tsquery =
      orQuery === null
        ? Prisma.sql`websearch_to_tsquery('english', ${query})`
        : Prisma.sql`to_tsquery('english', ${orQuery})`;

    try {
      return await this.prisma.$queryRaw<SearchedChunk[]>`
        SELECT
          c.id,
          c.ordinal,
          c.heading,
          c."clauseRef",
          c."startOffset",
          c."endOffset",
          c."tokenCount",
          c.text,
          (
            ts_rank_cd(c.tsv, ${tsquery})
            * CASE
                WHEN c.heading IS NOT NULL
                 AND to_tsvector('english', c.heading) @@ ${tsquery}
                THEN ${HEADING_BOOST}::float
                ELSE 1.0::float
              END
            * CASE
                WHEN c.heading ILIKE '%definition%' THEN ${DEFINITION_BOOST}::float
                ELSE 1.0::float
              END
          ) AS score
        FROM "Chunk" c
        WHERE c."documentId" = ${documentId}::uuid
          AND c."isBoilerplate" = false
          AND c.tsv @@ ${tsquery}
        ORDER BY score DESC, c.ordinal ASC
        LIMIT ${limit}`;
    } catch (error) {
      // A malformed tsquery must degrade to "no results", never take the answer down.
      this.logger.warn({ err: error, mode, documentId }, 'Full-text search failed');
      return [];
    }
  }

  /**
   * Turns a question into an OR-ed tsquery: "termination for convenience" → "termination |
   * convenience". Stop words and punctuation are dropped, and each term is escaped by
   * construction — only word characters survive, so the result cannot be injected into.
   */
  private toOrQuery(query: string): string {
    const terms = query
      .toLowerCase()
      .split(/[^\p{L}\p{N}]+/u)
      .filter((term) => term.length > 2 && !STOP_WORDS.has(term))
      .slice(0, 24);

    return [...new Set(terms)].join(' | ');
  }

  /** Every non-boilerplate chunk, in document order — the input to a thorough read. */
  async findAllForThorough(documentId: string): Promise<SearchedChunk[]> {
    const rows = await this.prisma.chunk.findMany({
      where: { documentId, isBoilerplate: false },
      orderBy: { ordinal: 'asc' },
      select: {
        id: true,
        ordinal: true,
        heading: true,
        clauseRef: true,
        startOffset: true,
        endOffset: true,
        tokenCount: true,
        text: true,
      },
    });

    return rows.map((row) => ({ ...row, score: 0 }));
  }

  /** How many sections a document has, excluding boilerplate — the denominator in coverage. */
  async countSearchable(documentId: string): Promise<number> {
    return this.prisma.chunk.count({ where: { documentId, isBoilerplate: false } });
  }

}

/**
 * Words too common to narrow anything down. Deliberately short: Postgres's english
 * dictionary already removes true stop words, and this only exists to stop the OR-ed
 * fallback from matching every chunk in the document via "the" or "shall".
 */
const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'any',
  'what',
  'which',
  'does',
  'has',
  'have',
  'was',
  'were',
  'this',
  'that',
  'there',
  'with',
  'from',
  'about',
  'into',
  'can',
  'will',
  'shall',
  'may',
  'all',
  'how',
  'who',
  'whom',
  'when',
  'where',
  'why',
  'its',
  'their',
  'they',
  'you',
  'your',
  'our',
  'per',
  'under',
  'such',
  'other',
  'each',
  'both',
  'been',
  'being',
  'said',
  'agreement',
  'contract',
  'document',
  'clause',
  'section',
]);
