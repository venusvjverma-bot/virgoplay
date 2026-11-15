/**
 * GenerationConfigEditor — reusable component
 *
 * Renders the Generation Configuration UI with fields determined by the
 * currently active Image Provider.
 *
 * - ZenCreator: Model, Ratio, Batch Size
 * - Hugging Face: LoRA Adapter, Seed, Randomize Seed, Guidance Scale, Steps
 *
 * Provider-specific configs are kept separate so switching providers never
 * overwrites the other provider's stored values.
 */

export interface ZenCreatorConfigValues {
  model: string;
  ratio: string;
  batch_size: string;
}

export interface HuggingFaceConfigValues {
  lora_adapter: string;
  seed: string;
  randomize_seed: boolean;
  guidance_scale: string;
  steps: string;
}

export interface AtlasCloudConfigValues {
  model: string;
  size: string;
  output_format: string;
  thinking: string;
  prompt_optimization_mode: string;
}

export type GenerationConfigValues = ZenCreatorConfigValues;

export const MODEL_OPTIONS = [
  'GENERAL_NSFW',
  'GENERAL_SFW',
  'SDXL_NSFW',
  'WAN_2_7_IMAGE',
  'WAN_2_7_IMAGE_PRO',
  'WAN',
  'QWEN_IMAGE',
  'QWEN_IMAGE_PRO',
  'SEEDREAM_5',
  'NANO_BANANA',
  'FLUX_KLEIN_NSFW',
] as const;

export const RATIO_OPTIONS = [
  '9:16',
  '16:9',
  '1:1',
  '4:5',
  '3:4',
] as const;

export const HF_DEFAULTS: HuggingFaceConfigValues = {
  lora_adapter: 'Ultra-Realistic-Portrait',
  seed: '0',
  randomize_seed: true,
  guidance_scale: '1.0',
  steps: '4',
};

export const ATLAS_DEFAULTS: AtlasCloudConfigValues = {
  model: 'bytedance/seedream-v5.0-pro/edit',
  size: '2048*2048',
  output_format: 'jpeg',
  thinking: 'enabled',
  prompt_optimization_mode: 'standard',
};

export const ATLAS_MODEL_OPTIONS = [
  'bytedance/seedream-v5.0-pro/edit',
  'bytedance/seedream-v5.0-pro/text-to-image',
] as const;

export const ATLAS_SIZE_OPTIONS = [
  '2048*2048',
  '2304*1728',
  '1728*2304',
  '2720*1530',
  '1530*2720',
  '2496*1664',
  '1664*2496',
  '1024*1024',
  '1536*1536',
  '1776*1328',
  '1328*1776',
  '2048*1152',
  '1152*2048',
] as const;

export const ATLAS_OUTPUT_FORMAT_OPTIONS = ['jpeg', 'png'] as const;
export const ATLAS_THINKING_OPTIONS = ['enabled', 'disabled'] as const;
export const ATLAS_OPTIMIZATION_OPTIONS = ['standard', 'fast'] as const;

export type ProviderName = 'ZenCreator' | 'Hugging Face' | 'Atlas Cloud';

export interface GenerationConfigEditorProps {
  values: GenerationConfigValues;
  onChange: (values: GenerationConfigValues) => void;
  /** When true, fields are read-only (inherited, no override) */
  readOnly?: boolean;
  /** Label for the section header */
  title?: string;
  /** Badge text shown next to title */
  badge?: string;
  /** Active image provider — determines which fields are shown */
  providerName?: string;
  /** Hugging Face config values (kept separate from ZenCreator config) */
  hfValues?: HuggingFaceConfigValues;
  onChangeHf?: (values: HuggingFaceConfigValues) => void;
  /** Atlas Cloud config values (kept separate from other providers) */
  atlasValues?: AtlasCloudConfigValues;
  onChangeAtlas?: (values: AtlasCloudConfigValues) => void;
}

export function GenerationConfigEditor({
  values,
  onChange,
  readOnly = false,
  title = 'Generation Configuration',
  badge,
  providerName = 'ZenCreator',
  hfValues = HF_DEFAULTS,
  onChangeHf,
  atlasValues = ATLAS_DEFAULTS,
  onChangeAtlas,
}: GenerationConfigEditorProps) {
  const isHuggingFace = providerName.toLowerCase().includes('hugging');
  const isAtlasCloud = providerName.toLowerCase().includes('atlas');

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-surface-800">
        <span className="text-xs font-semibold text-surface-100">{title}</span>
        {badge && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary-600/15 text-primary-400 border border-primary-600/20">
            {badge}
          </span>
        )}
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface-700/50 text-surface-400 border border-surface-700">
          {providerName}
        </span>
      </div>

      {isHuggingFace ? (
        <HuggingFaceFields
          values={hfValues}
          onChange={onChangeHf ?? (() => {})}
          readOnly={readOnly}
        />
      ) : isAtlasCloud ? (
        <AtlasCloudFields
          values={atlasValues}
          onChange={onChangeAtlas ?? (() => {})}
          readOnly={readOnly}
        />
      ) : (
        <ZenCreatorFields
          values={values}
          onChange={onChange}
          readOnly={readOnly}
        />
      )}
    </div>
  );
}

function ZenCreatorFields({
  values,
  onChange,
  readOnly,
}: {
  values: GenerationConfigValues;
  onChange: (values: GenerationConfigValues) => void;
  readOnly: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Model</label>
        <select
          value={values.model}
          onChange={e => onChange({ ...values, model: e.target.value })}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {MODEL_OPTIONS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Ratio</label>
        <select
          value={values.ratio}
          onChange={e => onChange({ ...values, ratio: e.target.value })}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {RATIO_OPTIONS.map(r => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Batch Size</label>
        <input
          type="number"
          min={1}
          step={1}
          value={values.batch_size}
          onChange={e => {
            const val = e.target.value.replace(/[^0-9]/g, '');
            onChange({ ...values, batch_size: val === '' ? '' : String(Math.max(1, parseInt(val, 10))) });
          }}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}

function AtlasCloudFields({
  values,
  onChange,
  readOnly,
}: {
  values: AtlasCloudConfigValues;
  onChange: (values: AtlasCloudConfigValues) => void;
  readOnly: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Model</label>
        <select
          value={values.model}
          onChange={e => onChange({ ...values, model: e.target.value })}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {ATLAS_MODEL_OPTIONS.map(m => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Size</label>
        <select
          value={values.size}
          onChange={e => onChange({ ...values, size: e.target.value })}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {ATLAS_SIZE_OPTIONS.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Output Format</label>
        <select
          value={values.output_format}
          onChange={e => onChange({ ...values, output_format: e.target.value })}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {ATLAS_OUTPUT_FORMAT_OPTIONS.map(f => (
            <option key={f} value={f}>{f.toUpperCase()}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Thinking</label>
        <select
          value={values.thinking}
          onChange={e => onChange({ ...values, thinking: e.target.value })}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {ATLAS_THINKING_OPTIONS.map(t => (
            <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Prompt Optimization</label>
        <select
          value={values.prompt_optimization_mode}
          onChange={e => onChange({ ...values, prompt_optimization_mode: e.target.value })}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {ATLAS_OPTIMIZATION_OPTIONS.map(o => (
            <option key={o} value={o}>{o.charAt(0).toUpperCase() + o.slice(1)}</option>
          ))}
        </select>
      </div>
    </div>
  );
}

function HuggingFaceFields({
  values,
  onChange,
  readOnly,
}: {
  values: HuggingFaceConfigValues;
  onChange: (values: HuggingFaceConfigValues) => void;
  readOnly: boolean;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">LoRA Adapter</label>
        <input
          type="text"
          value={values.lora_adapter}
          onChange={e => onChange({ ...values, lora_adapter: e.target.value })}
          disabled={readOnly}
          placeholder="Ultra-Realistic-Portrait"
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Seed</label>
        <input
          type="number"
          min={0}
          step={1}
          value={values.seed}
          onChange={e => onChange({ ...values, seed: e.target.value.replace(/[^0-9]/g, '') })}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>
      <div className="space-y-1 flex items-center gap-2 pt-1">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={values.randomize_seed}
            onChange={e => onChange({ ...values, randomize_seed: e.target.checked })}
            disabled={readOnly}
            className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600 focus:ring-primary-500 disabled:opacity-60 disabled:cursor-not-allowed"
          />
          <span className="text-xs font-medium text-surface-400">Randomize Seed</span>
        </label>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Guidance Scale</label>
        <input
          type="number"
          min={0}
          step={0.1}
          value={values.guidance_scale}
          onChange={e => onChange({ ...values, guidance_scale: e.target.value })}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Steps</label>
        <input
          type="number"
          min={1}
          step={1}
          value={values.steps}
          onChange={e => onChange({ ...values, steps: e.target.value.replace(/[^0-9]/g, '') })}
          disabled={readOnly}
          className="input-field text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        />
      </div>
    </div>
  );
}
