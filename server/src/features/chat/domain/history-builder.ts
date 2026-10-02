/**
 * Renders recent conversation turns for the prompt (ARCHITECTURE section 7).
 *
 * Only the last few turns, and only their TEXT — never the excerpts those turns were answered
 * from. Two reasons:
 *   - budget: re-sending excerpts would crowd out the sections relevant to the new question;
 *   - correctness: a model shown old excerpts will answer from them, which means the new
 *     answer could cite a section that was never retrieved for this question, and the
 *     coverage line would then be wrong.
 */

export interface HistoryTurn {
  role: 'USER' | 'ASSISTANT';
  content: string;
}

/** How many turns to include. Enough for "and what about X?" to make sense. */
export const HISTORY_TURN_LIMIT = 6;

/** An assistant turn is truncated: its gist is enough to resolve a pronoun. */
const MAX_ASSISTANT_CHARS = 600;
const MAX_USER_CHARS = 400;

export function buildHistoryText(messages: readonly HistoryTurn[]): string {
  const recent = messages.slice(-HISTORY_TURN_LIMIT);
  if (recent.length === 0) return '';

  const lines = recent.map((turn) => {
    const label = turn.role === 'USER' ? 'User' : 'Assistant';
    const limit = turn.role === 'USER' ? MAX_USER_CHARS : MAX_ASSISTANT_CHARS;
    return `${label}: ${truncate(stripCitations(turn.content), limit)}`;
  });

  return lines.join('\n');
}

/**
 * Removes `[1]` markers from history.
 *
 * Left in, the model copies the numbering into its new answer and cites `[1]` for a quote it
 * never supplied — producing a marker with nothing behind it.
 */
function stripCitations(text: string): string {
  return text.replace(/\[\d{1,2}\]/g, '').replace(/ {2,}/g, ' ').trim();
}

/** The previous user question, used to give a short follow-up something to search on. */
export function previousUserQuestion(messages: readonly HistoryTurn[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const turn = messages[index];
    if (turn?.role === 'USER') return turn.content;
  }
  return null;
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${lastSpace > max * 0.7 ? cut.slice(0, lastSpace) : cut}…`;
}
