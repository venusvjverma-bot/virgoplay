/**
 * UniversalPromptSchemaEditor — reusable component
 *
 * Renders the 16-field Universal Prompt Schema with database-driven
 * dropdowns (via PromptFieldDropdown) and a multiline text area for
 * extra_details.
 *
 * Used by both Character Studio and Role Studio's Scene Editor.
 * This is the single source of truth for the prompt schema UI.
 */

import {
  createEmptyPromptSchema,
  UNIVERSAL_PROMPT_FIELDS,
  type UniversalPromptSchema,
  type UniversalPromptFieldName,
} from '../types/character';
import { PromptFieldDropdown } from './PromptFieldDropdown';

export const FIELD_LABELS: Record<UniversalPromptFieldName, string> = {
  ethnicity: 'Ethnicity',
  age: 'Age',
  hair: 'Hair',
  face: 'Face',
  skin_type: 'Skin Type',
  body: 'Body',
  breasts: 'Breasts',
  clothing: 'Clothing',
  pose: 'Pose',
  expression: 'Expression',
  action: 'Action',
  partner: 'Partner',
  camera_angle: 'Camera Angle',
  style: 'Style',
  lighting: 'Lighting',
  atmosphere: 'Atmosphere',
  extra_details: 'Extra Details',
};

export const FIELD_PLACEHOLDERS: Record<UniversalPromptFieldName, string> = {
  ethnicity: 'Select ethnicity…',
  age: 'Select age…',
  hair: 'Select hair…',
  face: 'Select face…',
  skin_type: 'Select skin type…',
  body: 'Select body…',
  breasts: 'Select breasts…',
  clothing: 'Select clothing…',
  pose: 'Select pose…',
  expression: 'Select expression…',
  action: 'Select action…',
  partner: 'Select partner…',
  camera_angle: 'Select camera angle…',
  style: 'Select style…',
  lighting: 'Select lighting…',
  atmosphere: 'Select atmosphere…',
  extra_details: 'Enter extra details…',
};

const TEXTAREA_FIELDS = new Set<UniversalPromptFieldName>(['extra_details']);
const DROPDOWN_FIELDS = UNIVERSAL_PROMPT_FIELDS.filter(f => !TEXTAREA_FIELDS.has(f));

export interface UniversalPromptSchemaEditorProps {
  schema: UniversalPromptSchema;
  creatorId: string;
  onChange: (schema: UniversalPromptSchema) => void;
  /** Fields to hide (scene editor hides identity fields that are locked) */
  hiddenFields?: Set<UniversalPromptFieldName>;
  /** Fields that are read-only (inherited from character, shown but not editable) */
  readOnlyFields?: Set<UniversalPromptFieldName>;
  /** Label for the section header */
  title?: string;
  /** Badge text shown next to title (e.g. "Inherited from Character") */
  badge?: string;
}

export function UniversalPromptSchemaEditor({
  schema,
  creatorId,
  onChange,
  hiddenFields = new Set(),
  readOnlyFields = new Set(),
  title = 'Universal Prompt Schema',
  badge,
}: UniversalPromptSchemaEditorProps) {
  const visibleDropdowns = DROPDOWN_FIELDS.filter(f => !hiddenFields.has(f));
  const visibleTextareas = [...TEXTAREA_FIELDS].filter(f => !hiddenFields.has(f));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-surface-800">
        <span className="text-xs font-semibold text-surface-100">{title}</span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-600/15 text-primary-400 border border-primary-600/20">
            {badge}
          </span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {visibleDropdowns.map(field => (
          <PromptFieldDropdown
            key={field}
            fieldName={field}
            label={FIELD_LABELS[field]}
            placeholder={FIELD_PLACEHOLDERS[field]}
            value={schema[field]}
            creatorId={creatorId}
            onChange={val => onChange({ ...schema, [field]: val })}
          />
        ))}
      </div>
      {visibleTextareas.map(field => (
        <div key={field} className="space-y-1">
          <label className="text-xs font-medium text-surface-400">{FIELD_LABELS[field]}</label>
          <textarea
            value={schema[field]}
            onChange={e => onChange({ ...schema, [field]: e.target.value })}
            placeholder={FIELD_PLACEHOLDERS[field]}
            rows={4}
            className="input-field text-sm resize-y"
          />
        </div>
      ))}
    </div>
  );
}

export { createEmptyPromptSchema, UNIVERSAL_PROMPT_FIELDS };
