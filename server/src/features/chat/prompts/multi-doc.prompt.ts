import { QUOTES_DELIMITER } from '@ca/shared';

export interface MultiDocPromptDocument {
  id: string;
  name: string;
  alias: string;
  excerpts: string;
  coverageComplete: boolean;
  skippedPages: number[];
}

export interface MultiDocPromptInput {
  documents: MultiDocPromptDocument[];
  question: string;
  historyText: string;
}

export function buildMultiDocSystemPrompt(input: MultiDocPromptInput): string {
  const docList = input.documents
    .map((doc) => `- ${doc.alias}: "${doc.name}"`)
    .join('\n');

  return [
    'You are a legal assistant comparing multiple contracts for a lawyer. You answer ONLY',
    'from the excerpts provided below for each document. You never use outside knowledge, and',
    'you never guess.',
    '',
    '## Documents being compared',
    docList,
    '',
    '## How to structure your answer',
    'Structure your answer BY TOPIC (e.g. Liability, Term, Governing Law), NOT by document.',
    'Compare the positions of each contract directly. If one document addresses an issue and another',
    'does not in the reviewed sections, state plainly which document covers it and which does not.',
    '',
    '## Citation rules — load-bearing',
    'Every factual claim about a document MUST cite a quote from THAT specific document.',
    'Use citation markers like [1], [2] in your answer text.',
    '',
    '## Quotes format',
    `After your answer, output a line containing exactly ${QUOTES_DELIMITER} and then a JSON array:`,
    '[ { "n": <marker number>, "doc": "<alias like D1 or D2>", "text": "<exact words>" } ]',
    '',
    'Rules for quotes:',
    '  - The "doc" property MUST match the alias (D1, D2, etc.) of the document the quote is taken from.',
    '  - COPY the words character for character from that document’s excerpts.',
    '  - Quote 1 to 3 sentences — the smallest span supporting your claim.',
    '  - Quotes are verified against that specific document. A quote attributed to D1 that only exists in D2 will be REJECTED.',
    '  - If no quotes support a claim, do not make the claim.',
  ]
    .filter((line) => line.length > 0)
    .join('\n');
}

export function buildMultiDocUserPrompt(input: MultiDocPromptInput): string {
  const parts: string[] = [];

  if (input.historyText.length > 0) {
    parts.push('## Earlier in this conversation', input.historyText, '');
  }

  parts.push('## Excerpts from each document', '');

  for (const doc of input.documents) {
    parts.push(`=== ${doc.alias}: ${doc.name} ===`);
    parts.push('<<<DOCUMENT_EXCERPTS');
    parts.push(doc.excerpts.length > 0 ? doc.excerpts : '(no relevant sections found)');
    parts.push('DOCUMENT_EXCERPTS>>>');
    parts.push('');
  }

  parts.push(
    `Question: ${input.question}`,
    '',
    `Remember: finish with a line containing exactly ${QUOTES_DELIMITER}, then the JSON array of`,
    'quotes: [ { "n": 1, "doc": "D1", "text": "..." } ], matching each quote to its correct document alias.',
  );

  return parts.join('\n');
}
