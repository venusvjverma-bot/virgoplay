/**
 * Character Library Page
 *
 * Mother Creator can:
 *   - View all Master AI Identity characters
 *   - Search characters by name
 *   - Create a new character (opens wizard)
 *   - Edit draft characters
 *   - Delete draft characters
 *   - Publish / Unpublish / Archive characters
 *
 * No Child Creator functionality.
 * No Role Avatar generation.
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Plus, Search, Loader2, AlertCircle, RefreshCw,
  MoreVertical, Trash2, Eye, EyeOff, Archive, RotateCcw,
  Pencil, ChevronRight, Image as ImageIcon,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { MasterAiCharacterRow, CharacterStatus } from '../../types/character';

type View = 'list' | 'wizard';

const STATUS_STYLES: Record<CharacterStatus, string> = {
  draft: 'bg-surface-700/50 text-surface-300',
  published: 'bg-success-600/15 text-success-400',
  archived: 'bg-surface-800 text-surface-500',
};

const STATUS_LABELS: Record<CharacterStatus, string> = {
  draft: 'Draft',
  published: 'Published',
  archived: 'Archived',
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function CharacterLibraryPage({ onNavigateToWizard }: { onNavigateToWizard?: (charId: string | null) => void }) {
  const { creator } = useAuth();
  const [view, setView] = useState<View>('list');
  const [editCharId, setEditCharId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  function handleNavigateToWizard(charId: string | null) {
    if (onNavigateToWizard) {
      onNavigateToWizard(charId);
    } else {
      setEditCharId(charId);
      setView('wizard');
    }
  }

  function handleBackToList() {
    setView('list');
    setEditCharId(null);
    setRefreshKey(k => k + 1);
  }

  if (view === 'wizard') {
    return <CharacterWizardWrapper characterId={editCharId} onBack={handleBackToList} />;
  }

  return (
    <CharacterListView
      creatorId={creator!.id}
      onNavigateToWizard={handleNavigateToWizard}
      refreshKey={refreshKey}
    />
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Character List View
// ═══════════════════════════════════════════════════════════════════════════

function CharacterListView({
  creatorId, onNavigateToWizard, refreshKey,
}: {
  creatorId: string;
  onNavigateToWizard: (charId: string | null) => void;
  refreshKey: number;
}) {
  const [characters, setCharacters] = useState<MasterAiCharacterRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [localRefresh, setLocalRefresh] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('master_ai_characters')
      .select('*')
      .order('created_at', { ascending: false });

    if (err) {
      setError(err.message);
    } else {
      setCharacters((data ?? []) as MasterAiCharacterRow[]);
    }
    setLoading(false);
  }, [refreshKey, localRefresh]);

  useEffect(() => { load(); }, [load]);

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpenId) return;
    function close() { setMenuOpenId(null); }
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menuOpenId]);

  const filtered = characters.filter(c => {
    if (!search) return true;
    return c.name.toLowerCase().includes(search.toLowerCase());
  });

  async function updateStatus(charId: string, status: CharacterStatus) {
    setActionError(null);
    const { error: err } = await supabase
      .from('master_ai_characters')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', charId);
    if (err) {
      setActionError(err.message);
    } else {
      await load();
    }
    setMenuOpenId(null);
  }

  async function deleteCharacter(charId: string) {
    setActionError(null);
    const { error: err } = await supabase
      .from('master_ai_characters')
      .delete()
      .eq('id', charId);
    if (err) {
      setActionError(err.message);
    } else {
      await load();
    }
    setMenuOpenId(null);
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-surface-100">Character Library</h2>
            <p className="text-xs text-surface-500">Master AI Identity characters</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setLocalRefresh(k => k + 1)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={() => onNavigateToWizard(null)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-surface-100 bg-primary-600 hover:bg-primary-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Character
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="w-4 h-4 text-surface-500 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search characters…"
          className="w-full pl-9 pr-3 py-2.5 text-sm text-surface-200 bg-surface-900 border border-surface-700 rounded-lg focus:outline-none focus:border-primary-600/40 transition-colors placeholder:text-surface-600"
        />
      </div>

      {actionError && (
        <div className="flex items-center gap-2 text-xs text-danger-300 bg-danger-500/10 border border-danger-500/20 rounded-lg px-3 py-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {actionError}
        </div>
      )}

      {loading && (
        <div className="card flex items-center justify-center py-12">
          <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="card flex items-center gap-3 py-4 px-4 border-danger-500/20">
          <AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0" />
          <p className="text-sm text-danger-300">{error}</p>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 rounded-full bg-surface-800 flex items-center justify-center mb-4">
            <ImageIcon className="w-6 h-6 text-surface-600" />
          </div>
          <p className="text-sm text-surface-400">No characters yet</p>
          <p className="text-xs text-surface-600 mt-1">Click "New Character" to create your first Master AI Identity.</p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <div className="space-y-2">
          {filtered.map(char => (
            <div
              key={char.id}
              className="card w-full flex items-center gap-4 p-3 hover:border-primary-600/30 transition-colors group"
            >
              {/* Thumbnail */}
              <div className="w-14 h-14 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                {char.identity_image_url ? (
                  <img src={char.identity_image_url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-surface-600" />
                )}
              </div>

              {/* Info */}
              <button
                onClick={() => onNavigateToWizard(char.id)}
                className="flex-1 min-w-0 text-left"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium text-surface-100 truncate">{char.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[char.status]}`}>
                    {STATUS_LABELS[char.status]}
                  </span>
                </div>
                <p className="text-xs text-surface-500 truncate">
                  {char.identity_image_url ? 'Identity generated' : 'No identity image yet'} · {formatDate(char.created_at)}
                </p>
              </button>

              {/* Actions menu */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === char.id ? null : char.id); }}
                  className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
                {menuOpenId === char.id && (
                  <div
                    className="absolute right-0 top-full mt-1 z-20 w-48 bg-surface-900 border border-surface-700 rounded-lg shadow-xl py-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Edit (draft only) */}
                    {char.status === 'draft' && (
                      <button
                        onClick={() => { onNavigateToWizard(char.id); setMenuOpenId(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" /> Edit
                      </button>
                    )}
                    {/* Publish */}
                    {char.status === 'draft' && (
                      <button
                        onClick={() => updateStatus(char.id, 'published')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> Publish
                      </button>
                    )}
                    {/* Unpublish */}
                    {char.status === 'published' && (
                      <button
                        onClick={() => updateStatus(char.id, 'draft')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
                      >
                        <EyeOff className="w-3.5 h-3.5" /> Unpublish
                      </button>
                    )}
                    {/* Archive */}
                    {char.status !== 'archived' && (
                      <button
                        onClick={() => updateStatus(char.id, 'archived')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
                      >
                        <Archive className="w-3.5 h-3.5" /> Archive
                      </button>
                    )}
                    {/* Restore from archive */}
                    {char.status === 'archived' && (
                      <button
                        onClick={() => updateStatus(char.id, 'draft')}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Restore
                      </button>
                    )}
                    {/* Delete (draft only) */}
                    {char.status === 'draft' && (
                      <button
                        onClick={() => deleteCharacter(char.id)}
                        className="w-full flex items-center gap-2 px-3 py-2 text-sm text-danger-400 hover:text-danger-300 hover:bg-danger-500/10 transition-colors border-t border-surface-800 mt-1 pt-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                )}
              </div>

              <ChevronRight
                className="w-4 h-4 text-surface-600 group-hover:text-surface-400 flex-shrink-0 transition-colors cursor-pointer"
                onClick={() => onNavigateToWizard(char.id)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Character Wizard Wrapper — imported lazily to keep the module clean
// ═══════════════════════════════════════════════════════════════════════════

function CharacterWizardWrapper({
  characterId, onBack,
}: {
  characterId: string | null;
  onBack: () => void;
}) {
  // Lazy import to avoid circular dependencies
  const [WizardComponent, setWizardComponent] = useState<React.ComponentType<{
    characterId: string | null;
    onBack: () => void;
  }> | null>(null);

  useEffect(() => {
    import('./CharacterWizardPage').then(mod => {
      setWizardComponent(() => mod.default);
    });
  }, []);

  if (!WizardComponent) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-6 h-6 text-surface-500 animate-spin" />
      </div>
    );
  }

  return <WizardComponent characterId={characterId} onBack={onBack} />;
}
