/**
 * PromptFieldDropdown — database-driven dropdown with "+ Add New"
 *
 * Reusable component extracted from Character Studio.
 * Used by both Character Studio and Role Studio's Scene Editor.
 *
 * All fields except extra_details are searchable dropdowns loaded from the
 * prompt_field_options table, with "+ Add New" support.
 * extra_details is a multiline text area (handled separately).
 */

import { useState, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import type { UniversalPromptFieldName } from '../types/character';

export interface PromptOption {
  id: string;
  option_value: string;
  sort_order: number;
}

export interface PromptFieldDropdownProps {
  fieldName: string;
  label: string;
  placeholder: string;
  value: string;
  creatorId: string;
  onChange: (val: string) => void;
}

export function PromptFieldDropdown({
  fieldName, label, placeholder, value, creatorId, onChange,
}: PromptFieldDropdownProps) {
  const [options, setOptions] = useState<PromptOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddNew, setShowAddNew] = useState(false);
  const [newOptionValue, setNewOptionValue] = useState('');
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from('prompt_field_options')
      .select('id, option_value, sort_order')
      .eq('field_name', fieldName)
      .order('sort_order', { ascending: true });

    if (err) {
      setError(err.message);
    } else {
      setOptions((data ?? []) as PromptOption[]);
    }
    setLoading(false);
  }, [fieldName]);

  useEffect(() => { loadOptions(); }, [loadOptions]);

  async function handleAddNew() {
    const trimmed = newOptionValue.trim();
    if (!trimmed) return;

    setAdding(true);
    setError(null);

    const { error: err } = await supabase
      .from('prompt_field_options')
      .insert({
        field_name: fieldName,
        option_value: trimmed,
        sort_order: options.length + 1,
        created_by: creatorId,
      });

    if (err) {
      if (err.code === '23505') {
        setError('This option already exists.');
      } else {
        setError(err.message);
      }
      setAdding(false);
      return;
    }

    await loadOptions();
    onChange(trimmed);
    setNewOptionValue('');
    setShowAddNew(false);
    setAdding(false);
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-surface-400">{label}</label>
      {loading ? (
        <div className="h-9 flex items-center px-3">
          <div className="w-3.5 h-3.5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : showAddNew ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newOptionValue}
            onChange={e => setNewOptionValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleAddNew(); }}
            placeholder="Enter new option…"
            autoFocus
            className="input-field text-sm flex-1"
          />
          <button
            onClick={handleAddNew}
            disabled={adding || !newOptionValue.trim()}
            className="px-3 py-2 rounded-lg text-sm text-surface-100 bg-primary-600 hover:bg-primary-500 disabled:opacity-50 transition-colors flex-shrink-0"
          >
            {adding ? <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : 'Save'}
          </button>
          <button
            onClick={() => { setShowAddNew(false); setNewOptionValue(''); setError(null); }}
            className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors flex-shrink-0"
          >
            <span className="text-sm">Cancel</span>
          </button>
        </div>
      ) : (
        <select
          value={value}
          onChange={e => {
            if (e.target.value === '__add_new__') {
              setShowAddNew(true);
            } else {
              onChange(e.target.value);
            }
          }}
          className="input-field text-sm"
        >
          <option value="">{placeholder}</option>
          {options.map(opt => (
            <option key={opt.id} value={opt.option_value}>{opt.option_value}</option>
          ))}
          <option value="__add_new__">+ Add New</option>
        </select>
      )}
      {error && (
        <p className="text-xs text-danger-400">{error}</p>
      )}
    </div>
  );
}
