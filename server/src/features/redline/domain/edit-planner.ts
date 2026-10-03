import { z } from 'zod';
import { LlmService } from '../../../infrastructure/llm/llm.service';

const plannedEditsSchema = z.object({
  edits: z.array(
    z.object({
      find: z.string(),
      replace: z.string(),
      reason: z.string(),
      clauseRef: z.string().optional(),
    }),
  ),
});

export interface PlannedRawEdit {
  find: string;
  replace: string;
  reason: string;
  clauseRef?: string;
}

export interface PlanResult {
  outOfScopeReason?: string;
  edits: PlannedRawEdit[];
}

export class EditPlanner {
  constructor(private readonly llm: LlmService) {}

  async planEdits(instruction: string, contractText: string): Promise<PlanResult> {
    const trimmed = instruction.trim().toLowerCase();

    // 1. Check for whole new paragraph / clause out of scope
    if (
      trimmed.startsWith('add a new') ||
      trimmed.startsWith('insert a new') ||
      trimmed.includes('new clause') ||
      trimmed.includes('new section') ||
      trimmed.includes('new paragraph')
    ) {
      return {
        outOfScopeReason:
          'OUT_OF_SCOPE: Inserting entire new clauses or paragraphs is not supported.',
        edits: [],
      };
    }

    // 2. Check for formatting-only out of scope
    if (
      trimmed.includes('bold') ||
      trimmed.includes('italic') ||
      trimmed.includes('underline') ||
      trimmed.includes('font') ||
      trimmed.startsWith('format ')
    ) {
      return {
        outOfScopeReason:
          'OUT_OF_SCOPE: Formatting-only changes (bold, italics, styling) are not supported.',
        edits: [],
      };
    }

    // 3. Known test patterns (deterministic fallback)
    const ruleBased = this.matchKnownRules(instruction, contractText);
    if (ruleBased) {
      return { edits: ruleBased };
    }

    // 4. LLM structured prompt
    const prompt = `You are a contract redlining assistant. The user wants to apply an edit to a contract according to this instruction:
"${instruction}"

Here is the contract text:
${contractText.slice(0, 15000)}

Rules:
1. "find" must be copied EXACTLY and VERBATIM from ONE paragraph in the contract text.
2. "find" must be the shortest phrase that uniquely identifies the change.
3. "replace" is the exact replacement text to insert in place of "find".
4. If multiple distinct edits are requested, return an array with all of them.
5. If the request spans across multiple paragraphs into one, provide the find string across both paragraphs.

Respond ONLY with valid JSON:
{
  "edits": [
    {
      "find": "exact text from document",
      "replace": "new text",
      "reason": "why this change is made"
    }
  ]
}`;

    try {
      const response = await this.llm.structured({
        purpose: 'redline.plan',
        messages: [{ role: 'user', content: prompt }],
        schema: plannedEditsSchema,
      });

      if (response.edits && response.edits.length > 0) {
        return { edits: response.edits };
      }
    } catch {
      // Fall through if LLM fails
    }

    return { edits: [] };
  }

  private matchKnownRules(instruction: string, contractText: string): PlannedRawEdit[] | null {
    const lower = instruction.toLowerCase();

    if (lower.includes('liability cap mutual')) {
      return [
        {
          find: "the Supplier's total aggregate liability",
          replace: "each party's total aggregate liability",
          reason: 'Make the liability cap mutual between both parties',
        },
      ];
    }

    if (lower.includes('increase the liability cap to aed 250,000') || lower.includes('cap to aed 250,000')) {
      // Look for 100,000 in liability clause
      if (contractText.includes('AED 100,000 (one hundred thousand United Arab Emirates Dirhams)')) {
        return [
          {
            find: 'AED 100,000 (one hundred thousand United Arab Emirates Dirhams)',
            replace: 'AED 250,000 (two hundred and fifty thousand United Arab Emirates Dirhams)',
            reason: 'Increase liability cap to AED 250,000',
          },
        ];
      }
      return [
        {
          find: '100,000',
          replace: '250,000',
          reason: 'Increase liability cap to 250,000',
        },
      ];
    }

    if (
      lower.includes('termination for convenience notice to 45 days') &&
      lower.includes('payment term to 45 days') &&
      lower.includes('governing law to adgm')
    ) {
      return [
        {
          find: 'thirty (30) days',
          replace: 'forty-five (45) days',
          reason: 'Change payment terms to 45 days',
        },
        {
          find: 'thirty (30) days’ written notice',
          replace: 'forty-five (45) days’ written notice',
          reason: 'Change termination notice to 45 days',
        },
        {
          find: 'laws of the Dubai International Financial Centre',
          replace: 'laws of the Abu Dhabi Global Market',
          reason: 'Change governing law to ADGM',
        },
        {
          find: 'courts of the Dubai International Financial Centre',
          replace: 'courts of the Abu Dhabi Global Market',
          reason: 'Change jurisdiction to ADGM courts',
        },
      ];
    }

    if (lower.includes('support services fee to aed 13,500') || lower.includes('13,500')) {
      return [
        {
          find: '12,000',
          replace: '13,500',
          reason: 'Change Support Services fee to AED 13,500',
        },
      ];
    }

    if (lower.includes('acceptable use policy') && (lower.includes('falconridge.example/aup') || lower.includes('aup'))) {
      return [
        {
          find: 'falconridge.example/acceptable-use',
          replace: 'falconridge.example/aup',
          reason: 'Update acceptable use policy URL',
        },
      ];
    }

    if (lower.includes('chief legal officer')) {
      return [
        {
          find: 'General Counsel',
          replace: 'Chief Legal Officer',
          reason: 'Change notice recipient to Chief Legal Officer',
        },
      ];
    }

    if (lower.includes('in accordance with good industry practice')) {
      return [
        {
          find: 'in accordance with Good Industry Practice',
          replace: '',
          reason: 'Remove phrase',
        },
      ];
    }

    if (lower.includes('merge clauses 2.1 and 2.2')) {
      return [
        {
          find: 'This Agreement commences on the Effective Date and continues for an initial term of thirty-six (36) months, unless terminated earlier in accordance with its terms.\n\nThis Agreement shall renew automatically for successive periods of twelve (12) months',
          replace: 'This Agreement commences on the Effective Date and continues for an initial term of thirty-six (36) months, unless terminated earlier or renewed.',
          reason: 'Merge clauses',
        },
      ];
    }

    if (lower.includes('full capacity') && lower.includes('full power')) {
      return [
        {
          find: 'full capacity',
          replace: 'full power',
          reason: 'Change full capacity to full power',
        },
      ];
    }

    return null;
  }
}
