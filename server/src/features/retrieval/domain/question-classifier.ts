/**
 * Decides whether a question needs the WHOLE document read (ARCHITECTURE section 6).
 *
 * Rules, not an LLM call. Two reasons: a classifier that costs a request and a second of
 * latency before every answer is a bad trade, and — more importantly — this decision must be
 * predictable. It is what stands between the app and the assignment's named worst outcome:
 * confidently saying a clause does not exist after reading thirty pages.
 *
 * The bias is deliberate: when in doubt, prefer thorough. A needless whole-document read
 * costs tokens; a missed one produces a confident falsehood.
 */

export type QuestionIntent =
  /** "Is there an arbitration clause?" — only a complete read can answer honestly. */
  | 'EXISTENCE'
  /** "List every payment obligation." — a partial list is a wrong list. */
  | 'COMPLETENESS'
  /** "What is the liability cap?" — the relevant sections are enough. */
  | 'SPECIFIC';

export interface Classification {
  intent: QuestionIntent;
  /** True when the question cannot be answered honestly from a partial read. */
  needsWholeDocument: boolean;
  /** Which rule fired, so the decision can be explained and debugged. */
  reason: string;
}

/** Asking whether something is present — or, worse, absent. */
const EXISTENCE_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\bis there\b/i, reason: '"is there"' },
  { pattern: /\bare there\b/i, reason: '"are there"' },
  { pattern: /\bdoes (?:it|the \w+) (?:contain|include|mention|have|specify|say|provide|cover)\b/i, reason: '"does it contain"' },
  { pattern: /\bdo(?:es)? (?:the )?(?:document|contract|agreement|lease)s? (?:contain|include|mention|have)\b/i, reason: '"does the document contain"' },
  // `s?` matters: "Are any indemnity provisions included?" is the normal phrasing, and a
  // pattern that only matched the singular would miss most real existence questions.
  { pattern: /\bany\b[^?.]{0,40}\b(?:clause|provision|section|term|mention|reference|right|obligation)s?\b/i, reason: '"any … clause(s)"' },
  { pattern: /\b(?:is|are) (?:it|there|they) (?:any|a)\b/i, reason: '"is there a"' },
  { pattern: /\b(?:is|are|was|were) any\b/i, reason: '"are any"' },
  { pattern: /\b(?:included|present|covered|addressed)\s*\?/i, reason: '"… included?"' },
  { pattern: /\bmissing\b/i, reason: '"missing"' },
  { pattern: /\bomitted\b/i, reason: '"omitted"' },
  { pattern: /\bwithout (?:a|any)\b/i, reason: '"without a"' },
  { pattern: /\bno (?:clause|provision|mention)\b/i, reason: '"no clause"' },
  { pattern: /\bwhether\b.{0,40}\b(?:contains|includes|mentions|has)\b/i, reason: '"whether it contains"' },
];

/** Asking for ALL of something — a partial answer would be misleading. */
const COMPLETENESS_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /\blist (?:all|every|each|the)\b/i, reason: '"list all"' },
  { pattern: /\ball (?:of )?the\b/i, reason: '"all the"' },
  { pattern: /\bevery\b/i, reason: '"every"' },
  { pattern: /\beach (?:of the )?(?:clause|party|obligation|payment|deadline)/i, reason: '"each clause"' },
  { pattern: /\bhow many\b/i, reason: '"how many"' },
  { pattern: /\b(?:summar(?:ise|ize)|overview) (?:the )?(?:whole|entire|full|document|contract|agreement)\b/i, reason: '"summarise the whole document"' },
  { pattern: /\bcomplete list\b/i, reason: '"complete list"' },
  { pattern: /\bfind all\b/i, reason: '"find all"' },
  { pattern: /\ball (?:clauses|provisions|sections|obligations|parties|dates|deadlines|amounts)\b/i, reason: '"all clauses"' },
];

export function classifyQuestion(question: string): Classification {
  const text = question.trim();

  for (const { pattern, reason } of COMPLETENESS_PATTERNS) {
    if (pattern.test(text)) {
      return { intent: 'COMPLETENESS', needsWholeDocument: true, reason };
    }
  }

  for (const { pattern, reason } of EXISTENCE_PATTERNS) {
    if (pattern.test(text)) {
      return { intent: 'EXISTENCE', needsWholeDocument: true, reason };
    }
  }

  return { intent: 'SPECIFIC', needsWholeDocument: false, reason: 'no existence or completeness wording' };
}

/**
 * Builds the search query for a follow-up question.
 *
 * A follow-up like "and what about termination for convenience?" has almost no overlap with
 * the document on its own, so the previous question is appended. Only the previous USER turn
 * is used, never the answer: the answer contains the model's own words, and searching for
 * those would retrieve whatever it happened to say rather than what the user asked about.
 */
export function buildSearchQuery(question: string, previousQuestion?: string | null): string {
  const current = question.trim();
  if (!previousQuestion) return current;

  // A self-contained question does not need the context, and diluting it would hurt ranking.
  const words = current.split(/\s+/).filter((word) => word.length > 3);
  if (words.length >= 6) return current;

  return `${current} ${previousQuestion.trim()}`;
}

/** Postgres full-text search chokes on a very long query; keep the meaningful head of it. */
export const MAX_QUERY_CHARS = 400;

export function truncateQuery(query: string): string {
  if (query.length <= MAX_QUERY_CHARS) return query;
  const cut = query.slice(0, MAX_QUERY_CHARS);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > MAX_QUERY_CHARS * 0.6 ? cut.slice(0, lastSpace) : cut;
}
