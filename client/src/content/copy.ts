/**
 * Every user-facing string in the app (ARCHITECTURE section 13.2).
 *
 * No component contains a sentence inline. Two reasons that matter here: the tone stays
 * consistent across 9 feature slices, and a later Arabic translation becomes a content change
 * rather than a hunt through JSX.
 *
 * Tone: calm and professional, the way a careful colleague writes. Never cheerful, never
 * alarming, never apologetic. Say what happened and what the user can do next.
 */
export const copy = {
  app: {
    name: 'Contract Analyzer',
    tagline: 'Ask questions about your contracts and see exactly where every answer came from.',
  },

  nav: {
    library: 'Library',
    askAcross: 'Ask across documents',
    compare: 'Compare versions',
    themeToggle: 'Toggle dark mode',
  },

  // --- F1: document library -------------------------------------------------
  library: {
    title: 'Library',
    subtitle: 'Your uploaded contracts.',
    empty: {
      title: 'No documents yet',
      description: 'Upload a contract to start asking questions about it.',
      action: 'Upload a document',
    },
    loading: 'Loading your documents…',
    error: {
      title: 'Could not load your documents',
      description: 'Something went wrong on our side.',
      action: 'Try again',
    },
    upload: {
      dropzone: 'Drop a PDF or DOCX here, or click to choose a file',
      hint: 'PDF and DOCX only, up to {maxMb} MB',
      uploading: 'Uploading…',
      duplicate: 'Same file as “{name}”',
    },
    table: {
      name: 'Document',
      status: 'Status',
      pages: 'Pages',
      size: 'Size',
      uploaded: 'Uploaded',
      actions: 'Actions',
    },
    status: {
      uploaded: 'Queued',
      extracting: 'Reading the document',
      indexing: 'Preparing for search',
      ready: 'Ready',
      failed: 'Could not be read',
    },
    /** Shown when some pages had no readable text but the rest did (decision D10). */
    partialScanWarning:
      '{count, plural, one {Page # contains} other {Pages # contain}} no readable text and was not analysed.',
    actions: {
      open: 'Open',
      delete: 'Delete',
      retry: 'Try again',
    },
    delete: {
      title: 'Delete this document?',
      description:
        'This removes “{name}”, its chats and any comparisons that use it. This cannot be undone.',
      confirm: 'Delete document',
      cancel: 'Keep it',
    },
  },

  // --- F3/F4: chat ----------------------------------------------------------
  chat: {
    title: 'Ask about this document',
    placeholder: 'Ask a question about this contract…',
    send: 'Send',
    stop: 'Stop',
    stopped: 'Stopped',
    stoppedNote: 'Stopped — quotes are attached when an answer finishes.',
    thinking: 'Reading the document…',
    empty: {
      title: 'Ask your first question',
      description:
        'Every answer is backed by quotes this app has found in the document itself. Try “What is the liability cap?”',
    },
    newChat: 'New chat',
    history: 'Previous chats',
    historyEmpty: 'No previous chats for this document.',
    readWholeDocument: 'Read whole document',
    searchWholeDocument: 'Search the whole document',
    searchDocumentThoroughly: 'Search {name} thoroughly',
    inputDisabledWhileStreaming: 'Wait for the current answer to finish.',

    quote: {
      verified: 'Verified quote',
      verifiedHint: 'Found in this document. Click to open it.',
      unverified: 'Unverified',
      unverifiedHint:
        'This text could not be found in the document, so it is not shown as a genuine quote.',
      caseNote: 'Capitalisation differs from the document',
      documentDeleted: 'Document deleted',
      occurrence: '{index} of {total}',
    },

    answerStatus: {
      notFoundTitle: 'Not found in this document',
      notFoundDescription:
        'The answer to this question does not appear in the sections that were read.',
      unsupportedTitle: 'This answer could not be verified',
      unsupportedDescription:
        'No part of it could be matched to the document. Treat it with caution.',
    },

    coverage: {
      whole: 'Read the whole document',
      partial: 'Searched {read} of {total} sections',
      withPages: 'Searched {read} of {total} sections (pages {pages})',
      withSections: 'Searched {read} of {total} sections (clauses {sections})',
      stoppedEarly: 'Read {read} of {total} sections — stopped early because the AI service was busy.',
      exceptScanned: 'Read the whole document except pages {pages} (no readable text)',
      basedOnPartial: 'Based on {read} of {total} sections',
    },

    notice: {
      rateLimited: 'The AI service is busy. Waiting and retrying…',
      quotesUnavailable: 'The quotes for this answer could not be read, so none are shown.',
    },
  },

  // --- F5: viewer -----------------------------------------------------------
  viewer: {
    title: 'Document',
    loading: 'Opening the document…',
    error: {
      title: 'Could not open this document',
      description: 'The file could not be read.',
      action: 'Try again',
    },
    page: 'Page {number}',
    pageOf: 'Page {number} of {total}',
    zoomIn: 'Zoom in',
    zoomOut: 'Zoom out',
    zoomReset: 'Reset zoom',
    nextOccurrence: 'Next occurrence',
    previousOccurrence: 'Previous occurrence',
    clearHighlight: 'Clear highlight',
    scannedPage: 'This page has no readable text.',
  },

  // --- F6: multi-document ---------------------------------------------------
  multiDoc: {
    title: 'Ask across documents',
    subtitle: 'Select 2 to 5 documents and ask one question about all of them.',
    empty: {
      title: 'Select documents to compare',
      description: 'Pick at least two ready documents to ask a question across them.',
    },
    picker: {
      label: 'Documents',
      selected: '{count} selected',
      minimum: 'Select at least 2 documents.',
      maximum: 'You can ask across at most 5 documents at once.',
      onlyReady: 'Only documents that are ready can be included.',
    },
    ask: 'Ask across these documents',
  },

  // --- F7: comparison -------------------------------------------------------
  compare: {
    title: 'Compare versions',
    subtitle: 'See what changed between two versions of a contract.',
    picker: {
      base: 'Original version',
      revised: 'New version',
      action: 'Compare',
      sameDocument: 'Choose two different documents.',
    },
    running: 'Comparing the two versions…',
    empty: {
      title: 'No substantive differences found',
      description: 'The two versions say the same thing, apart from formatting and whitespace.',
    },
    error: {
      title: 'Could not compare these documents',
      description: 'Something went wrong while comparing.',
      action: 'Try again',
    },
    differentContracts:
      'These look like different contracts rather than two versions of the same one, so the comparison may not be meaningful.',
    renumberNote: 'Clauses {range} were renumbered. This is not counted as a change.',
    summary: {
      title: 'Summary of changes',
      counts: '{high} high · {medium} medium · {low} low',
    },
    filters: {
      severity: 'Significance',
      type: 'Type of change',
      all: 'All',
      sort: 'Sort by',
      sortSeverity: 'Most significant first',
      sortDocument: 'Document order',
    },
    changeType: {
      added: 'Added',
      removed: 'Removed',
      modified: 'Changed',
      moved: 'Moved',
      unchanged: 'Unchanged',
    },
    severity: {
      high: 'High',
      medium: 'Medium',
      low: 'Low',
    },
    detectorReason: '{label}: {from} → {to}',
    aiAssessment: 'AI assessment',
    openInBase: 'Open in original',
    openInRevised: 'Open in new version',
    sideBySide: 'Side by side',
    inlineDiff: 'Inline',
  },

  // --- F8: redline ----------------------------------------------------------
  redline: {
    title: 'Suggest tracked changes',
    subtitle:
      'Describe the change you want in plain language. The edits are written into the original .docx as Word tracked changes.',
    instructionLabel: 'What should change?',
    instructionPlaceholder: 'For example: make the liability cap mutual',
    plan: 'Propose edits',
    planning: 'Working out the edits…',
    requiresDocx: 'Tracked changes need the original .docx. This document is a PDF.',
    empty: {
      title: 'No edits proposed yet',
      description: 'Describe a change above to see what would be edited.',
    },
    proposed: {
      title: 'Proposed edits',
      description: 'Untick anything you do not want applied.',
      find: 'Current wording',
      replace: 'New wording',
      reason: 'Why',
    },
    rejection: {
      notFound: 'The AI proposed text that is not in the document.',
      ambiguous: 'This wording appears more than once, so it is not clear which to change.',
      crossParagraph: 'This change spans more than one paragraph, which is not supported.',
      hasExistingRevisions: 'This paragraph already contains tracked changes.',
      overlaps: 'This edit overlaps another edit in the same paragraph.',
      noOp: 'The new wording is identical to the current wording.',
    },
    apply: 'Apply and download',
    applying: 'Writing the tracked changes…',
    download: 'Download .docx',
    selfCheckFailed:
      'The edited file did not pass our own checks, so it has not been offered for download. Nothing was changed.',
    noApplicableEdits: 'None of the proposed edits could be applied safely.',
  },

  // --- shared ---------------------------------------------------------------
  common: {
    retry: 'Try again',
    cancel: 'Cancel',
    close: 'Close',
    back: 'Back',
    loading: 'Loading…',
    notFoundTitle: 'Page not found',
    notFoundDescription: 'That page does not exist.',
    goToLibrary: 'Go to the library',
    unexpectedErrorTitle: 'Something went wrong',
    unexpectedErrorDescription: 'An unexpected error occurred. You can try again.',
  },
} as const;

/**
 * Fills `{placeholder}` slots.
 * Deliberately tiny — this app has one locale, and a full i18n library would be weight
 * without benefit. Replacing this with one is a change in this file only.
 */
export function format(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
