import type { Severity } from '@ca/shared';

export interface DetectorFinding {
  detector: string;
  from: string;
  to: string;
  label: string;
  severity: Severity;
}

const CRITICAL_TOPICS = [
  'liability',
  'indemn',
  'payment',
  'fee',
  'penalty',
  'penalties',
  'termination',
  'confidential',
  'governing law',
  'jurisdiction',
];

export function isCriticalClause(titleOrRef: string, text: string): boolean {
  const combined = `${titleOrRef} ${text.slice(0, 300)}`.toLowerCase();
  return CRITICAL_TOPICS.some((topic) => combined.includes(topic));
}

export function detectChanges(
  clauseHeading: string,
  baseText: string,
  revisedText: string,
): DetectorFinding[] {
  const findings: DetectorFinding[] = [];
  const isCritical = isCriticalClause(clauseHeading, baseText);

  // 1. Money detector: AED 100,000, $500, etc.
  const moneyPattern = /\b(?:AED|USD|EUR|GBP|\$|Dhs|Dirhams)\s*([\d,]+(?:\.\d+)?)\b/gi;
  const baseMoney = extractMatches(baseText, moneyPattern);
  const revMoney = extractMatches(revisedText, moneyPattern);

  if (baseMoney.length > 0 && revMoney.length > 0 && baseMoney.join(';') !== revMoney.join(';')) {
    findings.push({
      detector: 'MONEY',
      from: baseMoney.join(', '),
      to: revMoney.join(', '),
      label: 'Amount changed',
      severity: isCritical ? 'HIGH' : 'MEDIUM',
    });
  }

  // 2. Percentage detector: 1.5%, 2 per cent.
  const percentPattern = /\b(\d+(?:\.\d+)?)\s*(?:%|per\s+cent(?:\.|\b))/gi;
  const basePercents = extractMatches(baseText, percentPattern);
  const revPercents = extractMatches(revisedText, percentPattern);

  if (
    basePercents.length > 0 &&
    revPercents.length > 0 &&
    basePercents.join(';') !== revPercents.join(';')
  ) {
    findings.push({
      detector: 'PERCENTAGE',
      from: basePercents.join(', '),
      to: revPercents.join(', '),
      label: 'Percentage changed',
      severity: isCritical ? 'HIGH' : 'MEDIUM',
    });
  }

  // 3. Obligation flip: shall/must vs may
  const obligationModalPattern = /\b(shall|must|may)\b/gi;
  const baseModals = Array.from(baseText.matchAll(obligationModalPattern), (m) => m[0]?.toLowerCase());
  const revModals = Array.from(revisedText.matchAll(obligationModalPattern), (m) => m[0]?.toLowerCase());

  const baseHasShall = baseModals.some((m) => m === 'shall' || m === 'must');
  const baseHasMay = baseModals.some((m) => m === 'may');
  const revHasShall = revModals.some((m) => m === 'shall' || m === 'must');
  const revHasMay = revModals.some((m) => m === 'may');

  if ((baseHasShall && !baseHasMay && revHasMay && !revHasShall) || (baseHasMay && !baseHasShall && revHasShall && !revHasMay)) {
    const from = baseHasShall ? 'mandatory (shall/must)' : 'optional (may)';
    const to = revHasShall ? 'mandatory (shall/must)' : 'optional (may)';
    findings.push({
      detector: 'OBLIGATION_FLIP',
      from,
      to,
      label: 'Obligation flip',
      severity: 'HIGH',
    });
  }

  // 4. Governing law / Jurisdiction
  const lawPattern = /\b(DIFC|ADGM|Dubai|Abu Dhabi|England and Wales)\b/g;
  const baseLaw = Array.from(baseText.matchAll(lawPattern), (m) => m[0]);
  const revLaw = Array.from(revisedText.matchAll(lawPattern), (m) => m[0]);

  const uniqueBaseLaw = Array.from(new Set(baseLaw)).sort().join(', ');
  const uniqueRevLaw = Array.from(new Set(revLaw)).sort().join(', ');

  if (uniqueBaseLaw.length > 0 && uniqueRevLaw.length > 0 && uniqueBaseLaw !== uniqueRevLaw) {
    findings.push({
      detector: 'GOVERNING_LAW',
      from: uniqueBaseLaw,
      to: uniqueRevLaw,
      label: 'Governing law / Jurisdiction',
      severity: 'HIGH',
    });
  }

  // 5. Durations: 30 days, (30) days, sixty (60) days
  const durationPattern = /\b(?:\w+\s+)?(?:\(\s*\d+\s*\)|\d+)\s*(?:days?|months?|years?|weeks?|hours?)\b/gi;
  const baseDurations = extractMatches(baseText, durationPattern);
  const revDurations = extractMatches(revisedText, durationPattern);

  if (
    baseDurations.length > 0 &&
    revDurations.length > 0 &&
    baseDurations.join(';') !== revDurations.join(';')
  ) {
    findings.push({
      detector: 'DURATION',
      from: baseDurations.join(', '),
      to: revDurations.join(', '),
      label: 'Duration changed',
      severity: 'MEDIUM',
    });
  }

  return findings;
}

function extractMatches(text: string, regex: RegExp): string[] {
  const matches: string[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(regex)) {
    const val = m[0]?.trim();
    if (val && !seen.has(val.toLowerCase())) {
      seen.add(val.toLowerCase());
      matches.push(val);
    }
  }
  return matches;
}
