/**
 * Conservative token estimate (ARCHITECTURE section 12).
 *
 * Deliberately NOT a real tokenizer: loading one for every budgeting decision costs more than
 * it is worth here, and the budgeter only needs an estimate that errs on the HIGH side so a
 * request is never rejected by the provider for being too long. 3.5 characters per token is
 * pessimistic for English prose, which is what we want.
 */
const CHARS_PER_TOKEN = 3.5;

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Longest prefix of `text` that fits in `maxTokens`, cut at a whitespace boundary. */
export function truncateToTokens(text: string, maxTokens: number): string {
  const maxChars = Math.floor(maxTokens * CHARS_PER_TOKEN);
  if (text.length <= maxChars) return text;
  const cut = text.slice(0, maxChars);
  const lastSpace = cut.lastIndexOf(' ');
  return lastSpace > maxChars * 0.8 ? cut.slice(0, lastSpace) : cut;
}
