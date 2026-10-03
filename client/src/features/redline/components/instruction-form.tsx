'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { copy } from '@/content/copy';
import type { DocumentDto } from '@ca/shared';

interface InstructionFormProps {
  document: DocumentDto;
  isPlanning: boolean;
  onSubmit: (instruction: string) => void;
}

export function InstructionForm({ document, isPlanning, onSubmit }: InstructionFormProps) {
  const [instruction, setInstruction] = useState('');
  const isPdf = document.kind === 'PDF';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!instruction.trim() || isPlanning || isPdf) return;
    onSubmit(instruction.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 bg-surface border border-border rounded-panel shadow-sm space-y-4">
      {isPdf ? (
        <div className="p-4 bg-warning-bg border border-unverified-border rounded-input text-body-sm text-status-processing flex items-start gap-2">
          <span>ℹ</span>
          <span>{copy.redline.requiresDocx}</span>
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="redline-instruction" className="text-body font-medium text-fg">
          {copy.redline.instructionLabel}
        </label>
        <textarea
          id="redline-instruction"
          rows={3}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder={copy.redline.instructionPlaceholder}
          disabled={isPlanning || isPdf}
          className="w-full px-3 py-2 text-body-sm bg-surface border border-border rounded-input text-fg placeholder:text-fg-subtle focus:outline-none focus:ring-2 focus:ring-accent resize-none disabled:opacity-50"
        />
      </div>

      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!instruction.trim() || isPlanning || isPdf}
        >
          {isPlanning ? copy.redline.planning : copy.redline.plan}
        </Button>
      </div>
    </form>
  );
}
