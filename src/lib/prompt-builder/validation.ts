/**
 * Prompt Builder Foundation V1 — Validation Layer
 *
 * Pure functions that validate a BlueprintSnapshot and the resulting prompt
 * before and after assembly. No side effects, no database access, no I/O.
 *
 * Two validation passes:
 * 1. Pre-extraction: validates the BlueprintSnapshot is usable.
 * 2. Post-format: validates the composed prompt channels are complete.
 *
 * The validation is modality-neutral: it checks for non-empty sections and
 * non-empty channels without assuming which sections or channels any
 * particular modality requires.
 */

import type { ComponentTypeCode } from '../../types/blueprint';
import type { BlueprintSnapshot } from '../snapshot-builder/types';
import type {
  CreativeComposition,
  PromptChannelOutput,
  PromptValidationIssue,
  PromptValidationResult,
} from './types';

/**
 * Validate the BlueprintSnapshot before prompt extraction.
 *
 * Checks:
 * 1. The snapshot passed its own validation (no error-severity issues).
 * 2. The snapshot has at least one component.
 * 3. An identity component is present (warning if missing — identity is
 *    the most important section for character generation, but some asset
 *    types like scene-only generation may not need it).
 */
export function validateSnapshotForPrompt(
  snapshot: BlueprintSnapshot,
): PromptValidationResult {
  const issues: PromptValidationIssue[] = [];

  // ── Check 1: Snapshot validation status ────────────────────────────────
  if (!snapshot.validation.valid) {
    issues.push({
      code: 'snapshot_invalid',
      message: 'The BlueprintSnapshot has validation errors from the Snapshot Builder.',
      severity: 'error',
    });
  }

  // ── Check 2: Non-empty components ───────────────────────────────────────
  if (snapshot.components.length === 0) {
    issues.push({
      code: 'no_components',
      message: 'The BlueprintSnapshot has no components. Cannot build a prompt.',
      severity: 'error',
    });
  }

  const hasIdentity = snapshot.components.some(
    c => c.type_code === 'identity',
  );
  if (!hasIdentity) {
    issues.push({
      code: 'no_sections',
      message: 'No identity component found. The prompt may lack subject definition.',
      severity: 'warning',
      component_type_code: 'identity' as ComponentTypeCode,
    });
  }

  const valid = issues.filter(i => i.severity === 'error').length === 0;

  return { valid, issues };
}

/**
 * Validate the formatter output after formatting.
 *
 * Checks:
 * 1. At least one channel exists.
 * 2. The primary channel (first entry) has non-empty text.
 * 3. No channel has empty text (warning — a formatter may intentionally
 *    produce an empty channel, but it's unusual).
 *
 * This validation is modality-neutral: it does not check for specific channel
 * names like "positive" or "scene". It only verifies structural completeness.
 */
export function validatePromptCompleteness(
  output: PromptChannelOutput,
  composition: CreativeComposition,
): PromptValidationResult {
  const issues: PromptValidationIssue[] = [];

  // ── Check 1: Non-empty composition ─────────────────────────────────────
  if (composition.sections.size === 0) {
    issues.push({
      code: 'no_sections',
      message: 'The creative composition has no sections. No components yielded fragments.',
      severity: 'error',
    });
  }

  // ── Check 2: At least one channel ──────────────────────────────────────
  if (output.channels.size === 0) {
    issues.push({
      code: 'no_channels',
      message: 'The formatter produced no prompt channels.',
      severity: 'error',
    });
  }

  // ── Check 3: Primary channel is non-empty ──────────────────────────────
  const firstEntry = output.channels.entries().next();
  if (!firstEntry.done) {
    const [, primaryText] = firstEntry.value;
    if (!primaryText || primaryText.trim() === '') {
      issues.push({
        code: 'empty_prompt',
        message: 'The primary prompt channel is empty.',
        severity: 'error',
      });
    }
  }

  // ── Check 4: No empty channels (warning) ───────────────────────────────
  for (const [name, text] of output.channels) {
    if (!text || text.trim() === '') {
      issues.push({
        code: 'empty_prompt',
        message: `Prompt channel "${name}" is empty.`,
        severity: 'warning',
      });
    }
  }

  const valid = issues.filter(i => i.severity === 'error').length === 0;

  return { valid, issues };
}
