/**
 * PromptGeneratorPanel — reusable component
 *
 * Renders the Prompt Generator UI with a "Generate Prompt" button and a
 * read-only prompt preview textarea.
 *
 * Used by both Character Studio and Role Studio's Scene Editor.
 * This is the single source of truth for the prompt generator UI.
 *
 * In Character Studio: generates the character identity prompt only.
 * In Role Studio Scene Editor: generates character identity + scene fields.
 * The caller provides the generated prompt string — this component just
 * displays it.
 */

import { Sparkles, Wand2, CheckCircle } from 'lucide-react';
import type { SavedPromptRequest } from '../types/character';

export interface PromptGeneratorPanelProps {
  promptPreview: string;
  onGenerate: () => void;
  savedPrompt: SavedPromptRequest | null;
  /** Label for the section header */
  title?: string;
  /** Whether the generate button is disabled */
  disabled?: boolean;
  /** Badge text shown when prompt is saved */
  savedLabel?: string;
}

export function PromptGeneratorPanel({
  promptPreview,
  onGenerate,
  savedPrompt,
  title = 'Prompt Generator',
  disabled = false,
  savedLabel = 'Prompt saved — this is the canonical source for generation',
}: PromptGeneratorPanelProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-surface-800">
        <Wand2 className="w-4 h-4 text-primary-400" />
        <span className="text-xs font-semibold text-surface-100">{title}</span>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={onGenerate}
          disabled={disabled}
          className="btn-primary gap-1.5 disabled:opacity-50"
        >
          <Sparkles className="w-3.5 h-3.5" />Generate Prompt
        </button>
        {savedPrompt && (
          <span className="flex items-center gap-1 text-xs text-accent-400">
            <CheckCircle className="w-3.5 h-3.5" />{savedLabel}
          </span>
        )}
      </div>
      {promptPreview && (
        <textarea
          value={promptPreview}
          readOnly
          rows={12}
          className="input-field text-sm font-mono resize-y bg-surface-950 cursor-default"
          placeholder="Generated request will appear here…"
        />
      )}
    </div>
  );
}
