/**
 * Every pg-boss queue name in one place, so a producer and its handler cannot drift apart
 * over a typo.
 */
export const JOB_NAMES = {
  /** Extract, detect, chunk and index one uploaded document (slice F1). */
  documentProcess: 'document.process',
  /** Compare two document versions (slice F7). */
  comparisonRun: 'comparison.run',
} as const;

export type JobName = (typeof JOB_NAMES)[keyof typeof JOB_NAMES];

export interface DocumentProcessJob {
  documentId: string;
}

export interface ComparisonRunJob {
  comparisonId: string;
}
