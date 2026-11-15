/**
 * Character Studio V2 — shared master system
 *
 * Mother Creator manages characters (DEV ON = studio management UI).
 * Verified Child Creators see the same characters in OFF mode (swipe picker),
 * with no DEV toggle and no editing controls.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  User, Save, Plus, Sparkles, AlertCircle, CheckCircle, Check,
  Loader2, RefreshCw, FileText, Eye, EyeOff, Pencil, X,
  Upload, Image as ImageIcon, Trash2, Layers, Star, Code2,
  ToggleLeft, ToggleRight, Lock, Download, ChevronDown,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { useDevAccess } from '../../context/DevAccessContext';
import {
  canUseDevMode,
  readDevMode,
  writeDevMode,
  readChildCreatorMode,
  loadAllCharacters,
  loadActiveCharacters,
  loadSelectedCharacterId,
  setSelectedCharacter,
  readMyAiConfig,
  saveMyAiConfig,
  updateMyAiPreview,
  setMyAiAvatar,
  loadMyAiOverride,
  uploadMyAiOverrideImage,
  updateMyAiOverrideGenerated,
  selectMyAiOverrideImage,
  saveMyAiDisplayName,
  DEFAULT_MY_AI_CONFIG,
  readCustomizeAiConfig,
  saveCustomizeAiConfig,
  loadCustomizeAiOverride,
  saveCustomizeAiAppearance,
  updateCustomizeAiGenerated,
  selectCustomizeAiImage,
  DEFAULT_CUSTOMIZE_AI_CONFIG,
  type CharacterV2Row,
  type ActiveCharacterSummary,
  type MyAiGenConfig,
  type MyAiOverrideRow,
  type CustomizeAiGenConfig,
  type CustomizeAiOverrideRow,
} from '../../lib/character-studio-v2';
import {
  buildMyAiPrompt,
  createEmptyAppearance,
  APPEARANCE_FIELD_OPTIONS,
  APPEARANCE_FIELD_LABELS,
  type MyAiAppearance,
} from '../../lib/my-ai-prompt-builder';
import {
  GenerationConfigEditor,
  type GenerationConfigValues,
  type HuggingFaceConfigValues,
  type AtlasCloudConfigValues,
  HF_DEFAULTS,
  ATLAS_DEFAULTS,
} from '../../components/GenerationConfigEditor';
import OffModeExperience from '../../components/OffModeExperience';
import CharacterVideoCarousel from '../../components/CharacterVideoCarousel';
import { COUNTRY_NAMES } from '../../lib/countries';

const IDENTITY_BUCKET = 'character_identities_v2';

type CharacterStatus = 'draft' | 'active';
type EditorMode = 'view' | 'edit';

type CharacterV2 = CharacterV2Row;

export interface SelectedV2Character {
  id: string;
  name: string;
  identity_image_url: string | null;
  identity_asset_id: string | null;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

const STATUS_STYLES: Record<CharacterStatus, string> = {
  draft:  'bg-surface-700/50 text-surface-300',
  active: 'bg-success-600/15 text-success-400',
};

const STATUS_LABELS: Record<CharacterStatus, string> = {
  draft:  'Draft',
  active: 'Active',
};

export default function CharacterStudioV2Page({
  onGoToRoleStudio,
  onOffModeActive,
}: {
  onGoToRoleStudio?: (selectedCharacter: SelectedV2Character) => void;
  onOffModeActive?: (active: boolean) => void;
}) {
  const { creator } = useAuth();

  const [characters, setCharacters] = useState<CharacterV2[]>([]);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [customizeAiImageUrl, setCustomizeAiImageUrl] = useState<string | null>(null);

  // Dev mode toggle — only visible to the Mother Creator (test.test@gmail.com)
  const [devMode, setDevMode] = useState(false);
  const [devModeLoading, setDevModeLoading] = useState(false);
  const { unlocked: devAccessUnlocked } = useDevAccess();
  const canToggleDevMode = canUseDevMode(creator?.email) && devAccessUnlocked;
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Editor state
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<EditorMode>('view');
  const [isNewCharacter, setIsNewCharacter] = useState(false);

  // Edit form state
  const [editName, setEditName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editStatus, setEditStatus] = useState<CharacterStatus>('draft');
  const [editImageUrl, setEditImageUrl] = useState<string | null>(null);
  const [editAssetId, setEditAssetId] = useState<string | null>(null);
  const [editAge, setEditAge] = useState<number | null>(null);
  const [editCountry, setEditCountry] = useState<string | null>(null);

  // Snapshot for cancel
  const [snapshot, setSnapshot] = useState<{ name: string; bio: string; status: CharacterStatus; imageUrl: string | null; assetId: string | null; age: number | null; country: string | null } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const isMotherCreator =
    canUseDevMode(creator?.email) || creator?.is_super_admin === true;

  function showToast(type: 'success' | 'error', msg: string) {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  }

  const load = useCallback(async () => {
    if (!creator?.id) return;
    setLoading(true);
    setError(null);
    try {
      const [rows, selId] = await Promise.all([
        loadAllCharacters(creator.id),
        loadSelectedCharacterId(creator.id),
      ]);
      setCharacters(rows);
      setSelectedCharacterId(selId);
      // Load Customize AI override image for V-card display
      const customizeAi = rows.find(c => c.is_customize_ai);
      if (customizeAi) {
        try {
          const ov = await loadCustomizeAiOverride(customizeAi.id);
          setCustomizeAiImageUrl(ov?.selected_image_url ?? ov?.generated_image_url ?? null);
        } catch { setCustomizeAiImageUrl(null); }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [creator?.id, refreshKey]);

  useEffect(() => { load(); }, [load]);

  // Load dev mode setting from database (only for test.test@gmail.com)
  useEffect(() => {
    if (!creator?.id || !canToggleDevMode) return;
    (async () => {
      setDevModeLoading(true);
      try {
        const mode = await readDevMode(creator.id, creator.email);
        setDevMode(mode);
      } catch {
        setDevMode(false);
      } finally {
        setDevModeLoading(false);
      }
    })();
  }, [creator?.id, creator?.email, canToggleDevMode]);

  async function handleToggleDevMode(next: boolean) {
    if (!creator?.id) return;
    setDevMode(next);
    try {
      await writeDevMode(creator.id, next);
    } catch {
      setDevMode(!next);
    }
  }

  // ── OFF-mode data path ────────────────────────────────────────────────────
  // When dev mode is OFF, load only active characters as minimal summaries.
  // This state is ready for a future OFF-mode view; the current UI still uses
  // the full `characters` array above.
  const [activeSummaries, setActiveSummaries] = useState<ActiveCharacterSummary[]>([]);
  const [activeLoading, setActiveLoading] = useState(false);

  // Child Creator mode — persisted per-creator, same source as Role Studio.
  // Default ON (true) when no row exists yet, matching the existing default.
  const [childCreatorMode, setChildCreatorMode] = useState(true);
  const [hasDoneRole, setHasDoneRole] = useState(false);
  const [showLockPopup, setShowLockPopup] = useState(false);

  // Load persisted Child Creator mode — same source as Role Studio toggle.
  useEffect(() => {
    if (!creator?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const mode = await readChildCreatorMode(creator.id);
        if (!cancelled) setChildCreatorMode(mode);
      } catch {
        if (!cancelled) setChildCreatorMode(true);
      }
    })();
    return () => { cancelled = true; };
  }, [creator?.id]);

  useEffect(() => {
    if (!creator?.id) return;
    // Only load active summaries when dev mode is OFF (or for non-Mother accounts)
    if (devMode) {
      setActiveSummaries([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setActiveLoading(true);
      try {
        const summaries = await loadActiveCharacters(creator.id);
        if (!cancelled) setActiveSummaries(summaries);
      } catch {
        if (!cancelled) setActiveSummaries([]);
      } finally {
        if (!cancelled) setActiveLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [creator?.id, devMode, refreshKey]);

  // Ensure "My AI" reserved card exists
  useEffect(() => {
    if (!creator?.id || !isMotherCreator) return;
    (async () => {
      const { data } = await supabase
        .from('character_studio_v2')
        .select('id')
        .eq('creator_id', creator.id)
        .eq('is_my_ai', true)
        .maybeSingle();

      if (!data) {
        await supabase.from('character_studio_v2').insert({
          creator_id: creator.id,
          name: 'My AI',
          bio: null,
          status: 'draft',
          is_my_ai: true,
          sort_order: -1,
        });
        setRefreshKey(k => k + 1);
      }
    })();
  }, [creator?.id, isMotherCreator]);

  // Ensure "Customize AI" reserved card exists (separate from My AI)
  useEffect(() => {
    if (!creator?.id || !isMotherCreator) return;
    (async () => {
      const { data } = await supabase
        .from('character_studio_v2')
        .select('id')
        .eq('creator_id', creator.id)
        .eq('is_customize_ai', true)
        .maybeSingle();

      if (!data) {
        await supabase.from('character_studio_v2').insert({
          creator_id: creator.id,
          name: 'Customize AI',
          bio: null,
          status: 'draft',
          is_customize_ai: true,
          sort_order: -2,
        });
        setRefreshKey(k => k + 1);
      }
    })();
  }, [creator?.id, isMotherCreator]);

  // ── Selection ────────────────────────────────────────────────────────────
  function handleSelect(char: CharacterV2) {
    setSelectedId(char.id);
    setEditName(char.name);
    setEditBio(char.bio ?? '');
    setEditStatus(char.status);
    setEditImageUrl(char.identity_image_url);
    setEditAssetId(char.identity_asset_id);
    setEditAge(char.age);
    setEditCountry(char.country);
    setMode('view');
    setIsNewCharacter(false);
  }

  function handleNewCharacter() {
    setSelectedId(null);
    setEditName('');
    setEditBio('');
    setEditStatus('draft');
    setEditImageUrl(null);
    setEditAssetId(null);
    setEditAge(null);
    setEditCountry(null);
    setMode('edit');
    setIsNewCharacter(true);
  }

  // ── Set Selected ─────────────────────────────────────────────────────────
  async function handleSetSelected(char: CharacterV2) {
    if (char.status !== 'active') {
      showToast('error', 'Only Active characters can be set as Selected.');
      return;
    }
    setSaving(true);
    try {
      await setSelectedCharacter(char.id);
      showToast('success', `${char.name} is now the Selected character.`);
      await load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  // ── Edit / Cancel ─────────────────────────────────────────────────────────
  function handleEdit() {
    setSnapshot({
      name: editName,
      bio: editBio,
      status: editStatus,
      imageUrl: editImageUrl,
      assetId: editAssetId,
      age: editAge,
      country: editCountry,
    });
    setMode('edit');
  }

  function handleCancel() {
    if (snapshot) {
      setEditName(snapshot.name);
      setEditBio(snapshot.bio);
      setEditStatus(snapshot.status);
      setEditImageUrl(snapshot.imageUrl);
      setEditAssetId(snapshot.assetId);
      setEditAge(snapshot.age);
      setEditCountry(snapshot.country);
    }
    setMode('view');
    if (isNewCharacter) {
      setIsNewCharacter(false);
      setSelectedId(null);
    }
  }

  // Detect changes to enable Save
  const hasChanges = isNewCharacter
    ? editName.trim().length > 0
    : snapshot !== null && (
        editName !== snapshot.name ||
        editBio !== snapshot.bio ||
        editStatus !== snapshot.status ||
        editImageUrl !== snapshot.imageUrl ||
        editAssetId !== snapshot.assetId ||
        editAge !== snapshot.age ||
        editCountry !== snapshot.country
      );

  // ── Image upload ──────────────────────────────────────────────────────────
  async function handleImageUpload(file: File) {
    if (!creator?.id) return;
    if (!selectedId && !isNewCharacter) return;

    // For new characters, we need to save the character first before uploading
    // because the image path uses the character ID.
    if (isNewCharacter && !selectedId) {
      showToast('error', 'Please save the character first before uploading an image.');
      return;
    }

    setUploading(true);
    try {
      const ext = file.name.split('.').pop() ?? 'png';
      const charId = selectedId!;
      const path = `${creator.id}/${charId}-${Date.now()}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from(IDENTITY_BUCKET)
        .upload(path, file, { upsert: true });

      if (uploadErr) throw new Error(uploadErr.message);

      const { data: urlData } = supabase.storage
        .from(IDENTITY_BUCKET)
        .getPublicUrl(path);

      const publicUrl = urlData.publicUrl;

      // Update the character record
      const { error: updateErr } = await supabase
        .from('character_studio_v2')
        .update({
          identity_image_url: publicUrl,
          identity_asset_id: path,
        })
        .eq('id', charId);

      if (updateErr) throw new Error(updateErr.message);

      setEditImageUrl(publicUrl);
      setEditAssetId(path);
      if (snapshot) {
        setSnapshot({ ...snapshot, imageUrl: publicUrl, assetId: path });
      }
      showToast('success', 'Identity image uploaded.');
      await load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleRemoveImage() {
    if (!selectedId || !editImageUrl) return;

    setUploading(true);
    try {
      // Delete from storage if we have the path
      if (editAssetId) {
        await supabase.storage.from(IDENTITY_BUCKET).remove([editAssetId]);
      }

      const { error: updateErr } = await supabase
        .from('character_studio_v2')
        .update({
          identity_image_url: null,
          identity_asset_id: null,
        })
        .eq('id', selectedId);

      if (updateErr) throw new Error(updateErr.message);

      setEditImageUrl(null);
      setEditAssetId(null);
      if (snapshot) {
        setSnapshot({ ...snapshot, imageUrl: null, assetId: null });
      }
      showToast('success', 'Identity image removed.');
      await load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!creator?.id) return;
    if (!editName.trim()) {
      showToast('error', 'Character name is required.');
      return;
    }

    setSaving(true);
    try {
      if (isNewCharacter) {
        const maxSort = characters.length > 0
          ? Math.max(...characters.map(c => c.sort_order))
          : 0;

        const { data, error: err } = await supabase
          .from('character_studio_v2')
          .insert({
            creator_id: creator.id,
            name: editName.trim(),
            bio: editBio.trim() || null,
            status: editStatus,
            is_my_ai: false,
            sort_order: maxSort + 1,
            age: editAge,
            country: editCountry,
          })
          .select()
          .single();

        if (err) throw new Error(err.message);
        const newChar = data as CharacterV2;
        setSelectedId(newChar.id);
        setIsNewCharacter(false);
        setMode('view');
        showToast('success', 'New character created.');
      } else if (selectedId) {
        const { error: err } = await supabase
          .from('character_studio_v2')
          .update({
            name: editName.trim(),
            bio: editBio.trim() || null,
            status: editStatus,
            age: editAge,
            country: editCountry,
          })
          .eq('id', selectedId);

        if (err) throw new Error(err.message);
        setMode('view');
        showToast('success', 'Character saved.');
      }

      await load();
    } catch (e) {
      showToast('error', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const myAiCard = characters.find(c => c.is_my_ai);
  const customizeAiCard = characters.find(c => c.is_customize_ai);
  const regularCharacters = characters.filter(c => !c.is_my_ai && !c.is_customize_ai);
  const selectedChar = characters.find(c => c.id === selectedId);
  const isEditing = mode === 'edit' || isNewCharacter;
  const showEditor = selectedId || isNewCharacter;
  const currentSelectedChar = characters.find(c => c.id === selectedCharacterId) ?? null;

  // Notify parent when OFF mode is active so it can hide chrome
  useEffect(() => {
    onOffModeActive?.(!devMode);
  }, [devMode, onOffModeActive]);

  // When Child Creator is ON, check if any role for this creator has Done status.
  // For the Mother Creator, childCreatorMode is false so this never runs.
  // For Child Creators, we check the per-account role_image_productions table
  // (NOT character_roles.role_image_url, which belongs to the Mother).
  useEffect(() => {
    if (!childCreatorMode || !creator?.id || devMode) {
      setHasDoneRole(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase
          .from('role_image_productions')
          .select('id')
          .eq('creator_id', creator.id)
          .not('role_image_url', 'is', null)
          .limit(1);
        if (!cancelled) setHasDoneRole(!!(data && data.length > 0));
      } catch {
        if (!cancelled) setHasDoneRole(false);
      }
    })();
    return () => { cancelled = true; };
  }, [childCreatorMode, creator?.id, devMode, refreshKey]);

  // ── OFF mode (client selection experience) ─────────────────────────────────
  // When dev mode is OFF, show the clean swipe-based character picker instead
  // of the studio management tools. The toggle stays visible for Mother Creator.
  if (!devMode) {
    const devViewToggle = canToggleDevMode && !devModeLoading ? (
      <button
        onClick={() => handleToggleDevMode(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-white/20 bg-black/40 backdrop-blur-md hover:border-white/40"
        title="Toggle Development View"
      >
        <ToggleLeft className="w-5 h-5 text-white/60" />
        <span className="text-white/70">Dev View</span>
      </button>
    ) : canToggleDevMode && devModeLoading ? (
      <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
    ) : null;

    return (
      <div className="fixed inset-0 overflow-hidden flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: isMotherCreator ? 'env(safe-area-inset-bottom)' : 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
        <OffModeExperience
          characters={activeSummaries}
          loading={activeLoading}
          selectedCharacterId={currentSelectedChar?.id ?? null}
          onSelected={() => setRefreshKey(k => k + 1)}
          headerSlot={devViewToggle}
          onGoToRoleStudio={
            onGoToRoleStudio && currentSelectedChar
              ? () => onGoToRoleStudio({
                  id: currentSelectedChar.id,
                  name: currentSelectedChar.name,
                  identity_image_url: currentSelectedChar.identity_image_url,
                  identity_asset_id: currentSelectedChar.identity_asset_id,
                })
              : undefined
          }
          locked={childCreatorMode && hasDoneRole}
          onLockedClick={() => setShowLockPopup(true)}
          isMotherCreator={isMotherCreator}
          onDeleteMyAiImage={async () => {
            if (!myAiCard?.id) return;
            if (myAiCard.identity_asset_id) {
              await supabase.storage.from(IDENTITY_BUCKET).remove([myAiCard.identity_asset_id]);
            }
            await supabase
              .from('character_studio_v2')
              .update({ identity_image_url: null, identity_asset_id: null })
              .eq('id', myAiCard.id);
          }}
        />

        {showLockPopup && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowLockPopup(false)}
          >
            <div
              className="max-w-sm mx-4 p-6 rounded-2xl bg-surface-900 border border-white/15 text-center"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-12 h-12 rounded-full bg-warning-500/15 border border-warning-500/25 flex items-center justify-center mx-auto mb-4">
                <Lock className="w-6 h-6 text-warning-400" />
              </div>
              <p className="text-sm text-surface-200 leading-relaxed">
                Your role is generated, cannot choose other character, please contact Admin
              </p>
              <button
                onClick={() => setShowLockPopup(false)}
                className="mt-5 px-6 py-2 rounded-full text-sm font-medium bg-white/10 border border-white/20 text-white hover:bg-white/20 transition-colors"
              >
                OK
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── ON mode (studio management UI) ───────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-surface-100">Character Studio V2</h1>
            <p className="text-sm text-surface-500">Manage your AI characters</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canToggleDevMode && !devModeLoading && (
            <button
              onClick={() => handleToggleDevMode(!devMode)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-surface-700 hover:border-surface-600"
              title="Toggle Development View"
            >
              {devMode ? (
                <ToggleRight className="w-5 h-5 text-accent-400" />
              ) : (
                <ToggleLeft className="w-5 h-5 text-surface-500" />
              )}
              <span className={devMode ? 'text-accent-400' : 'text-surface-400'}>Dev View</span>
            </button>
          )}
          {canToggleDevMode && devModeLoading && (
            <Loader2 className="w-4 h-4 text-surface-500 animate-spin" />
          )}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-surface-300 hover:text-surface-100 hover:bg-surface-800 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            onClick={handleNewCharacter}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-surface-100 bg-primary-600 hover:bg-primary-500 transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Character
          </button>
        </div>
      </div>

      {error && (
        <div className="card flex items-center gap-3 py-4 px-4 border-danger-500/20">
          <AlertCircle className="w-5 h-5 text-danger-400 flex-shrink-0" />
          <p className="text-sm text-danger-300">{error}</p>
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-surface-500 animate-spin" />
        </div>
      )}

      {!loading && (
        <>
          {/* V-Card Grid */}
          <div className="space-y-4">
            <h2 className="text-sm font-semibold text-surface-400 uppercase tracking-wide">
              Character V-Cards
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* My AI reserved card — always visible */}
              {myAiCard && (
                <button
                  onClick={() => handleSelect(myAiCard)}
                  className={[
                    'card text-left p-4 transition-all duration-150 group relative overflow-hidden',
                    selectedId === myAiCard.id && !isNewCharacter
                      ? 'border-accent-600/40 ring-1 ring-accent-600/20'
                      : 'hover:border-accent-600/30',
                  ].join(' ')}
                >
                  <div className="absolute top-0 right-0 px-2 py-1 bg-accent-600/15 text-accent-400 text-[10px] font-medium rounded-bl-lg">
                    Reserved
                  </div>
                  <div className="w-14 h-14 rounded-xl bg-accent-600/15 border border-accent-600/20 flex items-center justify-center mb-3 overflow-hidden">
                    {myAiCard.identity_image_url ? (
                      <img src={myAiCard.identity_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Sparkles className="w-6 h-6 text-accent-400" />
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-surface-100 mb-1">My AI</h3>
                  <p className="text-xs text-surface-500 line-clamp-2">
                    {myAiCard.bio ? myAiCard.bio.slice(0, 60) + (myAiCard.bio.length > 60 ? '…' : '') : 'Reserved AI identity'}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[myAiCard.status]}`}>
                      {STATUS_LABELS[myAiCard.status]}
                    </span>
                    {myAiCard.id === selectedCharacterId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-600/20 text-accent-300 flex items-center gap-1 font-medium">
                        <Star className="w-2.5 h-2.5 fill-accent-300" />
                        Selected
                      </span>
                    )}
                    <span className="text-[10px] text-surface-600">{formatDate(myAiCard.created_at)}</span>
                  </div>
                </button>
              )}

              {/* Customize AI reserved card — separate from My AI */}
              {customizeAiCard && (
                <button
                  onClick={() => handleSelect(customizeAiCard)}
                  className={[
                    'card text-left p-4 transition-all duration-150 group relative overflow-hidden',
                    selectedId === customizeAiCard.id && !isNewCharacter
                      ? 'border-primary-600/40 ring-1 ring-primary-600/20'
                      : 'hover:border-primary-600/30',
                  ].join(' ')}
                >
                  <div className="absolute top-0 right-0 px-2 py-1 bg-primary-600/15 text-primary-400 text-[10px] font-medium rounded-bl-lg">
                    Reserved
                  </div>
                  <h3 className="text-sm font-semibold text-surface-100 mb-3 pr-16">Customize AI</h3>
                  <div className="w-14 h-14 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center mb-3 overflow-hidden">
                    {customizeAiImageUrl ? (
                      <img src={customizeAiImageUrl} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <Sparkles className="w-6 h-6 text-primary-400" />
                    )}
                  </div>
                  <p className="text-xs text-surface-500 line-clamp-2">
                    Creator-customized AI identity
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[customizeAiCard.status]}`}>
                      {STATUS_LABELS[customizeAiCard.status]}
                    </span>
                    {customizeAiCard.id === selectedCharacterId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-600/20 text-accent-300 flex items-center gap-1 font-medium">
                        <Star className="w-2.5 h-2.5 fill-accent-300" />
                        Selected
                      </span>
                    )}
                    <span className="text-[10px] text-surface-600">{formatDate(customizeAiCard.created_at)}</span>
                  </div>
                </button>
              )}

              {/* Regular character cards */}
              {regularCharacters.map(char => (
                <button
                  key={char.id}
                  onClick={() => handleSelect(char)}
                  className={[
                    'card text-left p-4 transition-all duration-150 group',
                    selectedId === char.id && !isNewCharacter
                      ? 'border-primary-600/40 ring-1 ring-primary-600/20'
                      : 'hover:border-primary-600/30',
                  ].join(' ')}
                >
                  <div className="w-14 h-14 rounded-xl bg-surface-800 border border-surface-700 flex items-center justify-center mb-3 overflow-hidden">
                    {char.identity_image_url ? (
                      <img src={char.identity_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <User className="w-6 h-6 text-surface-500" />
                    )}
                  </div>
                  <h3 className="text-sm font-semibold text-surface-100 mb-1 truncate">{char.name}</h3>
                  <p className="text-xs text-surface-500 line-clamp-2">
                    {char.bio ? char.bio.slice(0, 80) + (char.bio.length > 80 ? '…' : '') : 'No description yet'}
                  </p>
                  <div className="flex items-center gap-2 mt-3">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_STYLES[char.status]}`}>
                      {STATUS_LABELS[char.status]}
                    </span>
                    {char.id === selectedCharacterId && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent-600/20 text-accent-300 flex items-center gap-1 font-medium">
                        <Star className="w-2.5 h-2.5 fill-accent-300" />
                        Selected
                      </span>
                    )}
                    <span className="text-[10px] text-surface-600">{formatDate(char.created_at)}</span>
                  </div>
                </button>
              ))}

              {/* New character placeholder card */}
              {isNewCharacter && (
                <div className="card p-4 border-primary-600/40 ring-1 ring-primary-600/20">
                  <div className="w-14 h-14 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center mb-3">
                    <Plus className="w-6 h-6 text-primary-400" />
                  </div>
                  <h3 className="text-sm font-semibold text-surface-100 mb-1">New Character</h3>
                  <p className="text-xs text-surface-500">Fill in the details below</p>
                </div>
              )}

              {/* Empty state when no regular characters */}
              {regularCharacters.length === 0 && !isNewCharacter && (
                <div className="card flex flex-col items-center justify-center py-10 text-center border-dashed">
                  <div className="w-12 h-12 rounded-full bg-surface-800 flex items-center justify-center mb-3">
                    <User className="w-5 h-5 text-surface-600" />
                  </div>
                  <p className="text-sm text-surface-400">No characters yet</p>
                  <p className="text-xs text-surface-600 mt-1">Click "New Character" to create one</p>
                </div>
              )}
            </div>
          </div>

          {/* Selected Character Editor */}
          {showEditor && (
            <div className="card space-y-5">
              <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
                {isNewCharacter ? (
                  <Plus className="w-4 h-4 text-primary-400" />
                ) : (
                  <User className="w-4 h-4 text-primary-400" />
                )}
                <h2 className="font-semibold text-surface-100 text-sm">
                  {isNewCharacter ? 'New Character' : isEditing ? 'Edit Character' : 'Character Details'}
                </h2>
                {selectedChar && !isNewCharacter && (
                  <span className="text-xs text-surface-500 ml-auto">
                    Created {formatDate(selectedChar.created_at)}
                  </span>
                )}
              </div>

              {/* Identity Image — Large Preview */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-surface-400 flex items-center gap-1.5">
                  <ImageIcon className="w-3 h-3" />
                  Identity Image
                </label>

                {editImageUrl ? (
                  <div className="space-y-3">
                    {/* Large preview — at least 1/2 of mobile screen height */}
                    <div className="relative w-full rounded-xl overflow-hidden border border-surface-700 bg-surface-950">
                      <img
                        src={editImageUrl}
                        alt="Character Identity"
                        className="w-full object-contain"
                        style={{ maxHeight: '50vh', minHeight: '300px' }}
                      />
                      {isEditing && !uploading && (
                        <button
                          onClick={handleRemoveImage}
                          className="absolute top-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-danger-500/80 text-white hover:bg-danger-500 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Remove
                        </button>
                      )}
                      {uploading && (
                        <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                          <Loader2 className="w-6 h-6 text-surface-300 animate-spin" />
                        </div>
                      )}
                    </div>
                    {isEditing && (
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        disabled={uploading || (isNewCharacter && !selectedId)}
                        className="btn-secondary gap-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        Replace Image
                      </button>
                    )}
                  </div>
                ) : (
                  isEditing && (
                    <button
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading || (isNewCharacter && !selectedId)}
                      className="w-full flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-surface-700 rounded-xl hover:border-primary-600/40 hover:bg-surface-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploading ? (
                        <Loader2 className="w-6 h-6 text-surface-500 animate-spin" />
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-surface-800 flex items-center justify-center">
                            <Upload className="w-5 h-5 text-surface-500" />
                          </div>
                          <div className="text-center">
                            <p className="text-sm text-surface-300">
                              {isNewCharacter && !selectedId ? 'Save character first, then upload' : 'Upload Identity Image'}
                            </p>
                            <p className="text-xs text-surface-600 mt-1">PNG, JPG, or WebP up to 10 MB</p>
                          </div>
                        </>
                      )}
                    </button>
                  )
                )}

                {!isEditing && !editImageUrl && (
                  <div className="w-full flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-surface-800 rounded-xl">
                    <div className="w-12 h-12 rounded-full bg-surface-800 flex items-center justify-center">
                      <ImageIcon className="w-5 h-5 text-surface-600" />
                    </div>
                    <p className="text-sm text-surface-500">No identity image yet</p>
                    <p className="text-xs text-surface-600">Click Edit to upload one</p>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) handleImageUpload(file);
                    e.target.value = '';
                  }}
                />
              </div>

              {/* Character Name */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-surface-400">
                  Character Name <span className="text-danger-400">*</span>
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  placeholder="Enter character name…"
                  className="input-field text-sm"
                  readOnly={!isEditing}
                  disabled={!isEditing}
                />
              </div>

              {/* Age + Country */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-surface-400">Age</label>
                  <select
                    value={editAge ?? ''}
                    onChange={e => setEditAge(e.target.value ? Number(e.target.value) : null)}
                    disabled={!isEditing}
                    className="input-field text-sm appearance-none disabled:opacity-60"
                  >
                    <option value="">{isEditing ? 'Select age…' : '—'}</option>
                    {Array.from({ length: 41 }, (_, i) => i + 20).map(a => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-surface-400">Country</label>
                  <select
                    value={editCountry ?? ''}
                    onChange={e => setEditCountry(e.target.value || null)}
                    disabled={!isEditing}
                    className="input-field text-sm appearance-none disabled:opacity-60"
                  >
                    <option value="">{isEditing ? 'Select country…' : '—'}</option>
                    {COUNTRY_NAMES.map(c => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Bio / Description */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-surface-400 flex items-center gap-1.5">
                  <FileText className="w-3 h-3" />
                  Bio / Description <span className="text-surface-600 font-normal">(optional)</span>
                </label>
                {isEditing ? (
                  <>
                    <textarea
                      value={editBio}
                      onChange={e => setEditBio(e.target.value)}
                      placeholder="Describe this character's personality, backstory, appearance, and any other details…"
                      rows={10}
                      maxLength={5000}
                      className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-700 rounded-lg p-3 resize-y focus:outline-none focus:border-primary-600/40 transition-colors placeholder:text-surface-600 leading-relaxed"
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-surface-600">Up to 5,000 characters</p>
                      <p className="text-[10px] text-surface-600">{editBio.length} / 5000</p>
                    </div>
                  </>
                ) : (
                  <div className="w-full text-sm text-surface-200 bg-surface-950 border border-surface-800 rounded-lg p-3 min-h-[80px] leading-relaxed whitespace-pre-wrap">
                    {editBio || <span className="text-surface-600 italic">No description yet</span>}
                  </div>
                )}
              </div>

              {/* Status */}
              <div className="space-y-1">
                <label className="text-xs font-medium text-surface-400">Status</label>
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setEditStatus('draft')}
                      className={[
                        'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                        editStatus === 'draft'
                          ? 'bg-surface-700/50 text-surface-200 border-surface-600'
                          : 'text-surface-500 border-surface-800 hover:text-surface-300 hover:bg-surface-800',
                      ].join(' ')}
                    >
                      <EyeOff className="w-3 h-3" />
                      Draft
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditStatus('active')}
                      className={[
                        'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors border',
                        editStatus === 'active'
                          ? 'bg-success-600/15 text-success-400 border-success-600/30'
                          : 'text-surface-500 border-surface-800 hover:text-surface-300 hover:bg-surface-800',
                      ].join(' ')}
                    >
                      <Eye className="w-3 h-3" />
                      Active
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded ${STATUS_STYLES[editStatus]}`}>
                      {STATUS_LABELS[editStatus]}
                    </span>
                  </div>
                )}
              </div>

              {/* Development Info — read-only debug block (view mode only, existing characters) */}
              {selectedChar && !isEditing && (
                <div className="mt-2 rounded-lg border border-surface-800 bg-surface-900/50 p-3 space-y-1.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-surface-500 mb-1">
                    <Code2 className="w-3 h-3" />
                    Development Info
                  </div>
                  <div className="grid grid-cols-1 gap-1 text-xs">
                    <div className="flex gap-2">
                      <span className="text-surface-500 min-w-[110px]">Character ID</span>
                      <span className="text-surface-300 font-mono break-all">{selectedChar.id}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-surface-500 min-w-[110px]">Status</span>
                      <span className="text-surface-300">{selectedChar.status}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-surface-500 min-w-[110px]">Selected</span>
                      <span className={selectedChar.id === selectedCharacterId ? 'text-accent-400' : 'text-surface-300'}>
                        {selectedChar.id === selectedCharacterId ? 'Yes' : 'No'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-surface-500 min-w-[110px]">Identity Asset ID</span>
                      <span className="text-surface-300 font-mono break-all">
                        {selectedChar.identity_asset_id ?? '—'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-surface-500 min-w-[110px]">Identity Image URL</span>
                      <span className="text-surface-300 font-mono break-all">
                        {selectedChar.identity_image_url ?? '—'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Character Video — carousel (view mode only) */}
              {selectedChar && !isEditing && creator?.id && (
                <CharacterVideoCarousel
                  characterId={selectedChar.id}
                  creatorId={creator.id}
                />
              )}

              {/* My AI Generation Configuration — Mother Creator and verified Child Creators */}
              {selectedChar && !isEditing && selectedChar.is_my_ai && creator?.id && (
                <MyAiGenerationConfig
                  character={selectedChar}
                  creatorId={creator.id}
                  isMotherCreator={isMotherCreator}
                  onUpdate={() => setRefreshKey(k => k + 1)}
                  onUploadFile={handleImageUpload}
                  uploading={uploading}
                />
              )}

              {/* Customize AI Panel — Dev ON only, Mother Creator inspection */}
              {selectedChar && !isEditing && selectedChar.is_customize_ai && isMotherCreator && devMode && creator?.id && (
                <CustomizeAiPanel
                  character={selectedChar}
                  creatorId={creator.id}
                  onUpdate={() => setRefreshKey(k => k + 1)}
                  onImageUpdate={(url) => setCustomizeAiImageUrl(url)}
                />
              )}

              {/* Action buttons */}
              <div className="flex items-center gap-3 pt-4 border-t border-surface-800">
                {isEditing ? (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving || !editName.trim() || !hasChanges}
                      className="btn-primary gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                      {saving ? 'Saving…' : isNewCharacter ? 'Create Character' : 'Save Character'}
                    </button>
                    {!isNewCharacter && (
                      <button
                        onClick={handleCancel}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" />
                        Cancel
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleEdit}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-surface-100 bg-surface-700 hover:bg-surface-600 transition-colors"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                    <button
                      onClick={handleNewCharacter}
                      className="btn-secondary gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      New
                    </button>
                    {selectedChar && selectedChar.status === 'active' && selectedChar.id !== selectedCharacterId && (
                      <button
                        onClick={() => handleSetSelected(selectedChar)}
                        disabled={saving}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-accent-300 hover:text-accent-200 bg-accent-600/10 hover:bg-accent-600/20 border border-accent-600/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Star className="w-3.5 h-3.5" />}
                        Set as Selected
                      </button>
                    )}
                    {selectedChar && selectedChar.id === selectedCharacterId && (
                      <span className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-accent-300 bg-accent-600/15 border border-accent-600/30">
                        <Star className="w-3.5 h-3.5 fill-accent-300" />
                        Current Character
                      </span>
                    )}
                    {onGoToRoleStudio && (
                      <button
                        onClick={() => {
                          const target = currentSelectedChar ?? (selectedChar?.status === 'active' ? selectedChar : null);
                          if (target) {
                            onGoToRoleStudio({
                              id: target.id,
                              name: target.name,
                              identity_image_url: target.identity_image_url,
                              identity_asset_id: target.identity_asset_id,
                            });
                          } else {
                            showToast('error', 'Select an Active character first.');
                          }
                        }}
                        disabled={!currentSelectedChar && !(selectedChar?.status === 'active')}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium text-surface-300 hover:text-surface-100 bg-surface-800 hover:bg-surface-700 transition-colors ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        Go to Role Studio
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Toast */}
      {toast && (
        <div className={[
          'fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-xl text-sm font-medium',
          'border animate-slide-up max-w-sm',
          toast.type === 'success'
            ? 'bg-success-500/10 border-success-500/30 text-success-300'
            : 'bg-danger-500/10 border-danger-500/30 text-danger-300',
        ].join(' ')}>
          {toast.type === 'success'
            ? <CheckCircle className="w-4 h-4 flex-shrink-0" />
            : <AlertCircle className="w-4 h-4 flex-shrink-0" />}
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// My AI Generation Configuration — reuses the shared GenerationConfigEditor
// with provider-specific fields, matching Role Studio V2's approach.
// ═══════════════════════════════════════════════════════════════════════════

function MyAiGenerationConfig({
  character, creatorId, isMotherCreator, onUpdate, onUploadFile, uploading,
}: {
  character: CharacterV2Row;
  creatorId: string;
  isMotherCreator: boolean;
  onUpdate: () => void;
  onUploadFile: (file: File) => void;
  uploading: boolean;
}) {
  const myAiFileInputRef = useRef<HTMLInputElement | null>(null);
  const initial = useMemo(() => readMyAiConfig(character), [character]);
  const [prompt, setPrompt] = useState(initial.prompt);
  const [activeProvider, setActiveProvider] = useState<string>('ZenCreator');
  const [genConfig, setGenConfig] = useState<GenerationConfigValues>({
    model: initial.model,
    ratio: initial.ratio,
    batch_size: String(initial.num_images),
  });
  const [hfConfig, setHfConfig] = useState<HuggingFaceConfigValues>(HF_DEFAULTS);
  const [atlasConfig, setAtlasConfig] = useState<AtlasCloudConfigValues>({
    ...ATLAS_DEFAULTS,
    size: initial.ratio || ATLAS_DEFAULTS.size,
  });
  const [currentImageUrl, setCurrentImageUrl] = useState<string | null>(initial.image_url);
  const [currentStatus, setCurrentStatus] = useState<string | null>(initial.image_status);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Child Creator override state — the creator's own uploaded image + generated result
  const [override, setOverride] = useState<MyAiOverrideRow | null>(null);

  // Display name override — Child Creator's custom name for their My AI
  const [displayName, setDisplayName] = useState('');
  const [displayNameDirty, setDisplayNameDirty] = useState(false);
  const [displayNameSaving, setDisplayNameSaving] = useState(false);

  // Fetch the active image provider via SECURITY DEFINER RPC (same as Role Studio).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_active_image_provider');
        if (!cancelled && data && typeof data === 'string') setActiveProvider(data);
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const isAtlasCloud = activeProvider.toLowerCase().includes('atlas');
  const isHuggingFace = activeProvider.toLowerCase().includes('hugging');

  // For Child Creators, load their own override (uploaded image + generated result)
  useEffect(() => {
    if (isMotherCreator) return;
    let cancelled = false;
    (async () => {
      try {
        const ov = await loadMyAiOverride(character.id);
        if (!cancelled) {
          setOverride(ov);
          setDisplayName(ov?.display_name ?? '');
          setDisplayNameDirty(false);
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isMotherCreator, character.id, onUpdate]);

  // For Child Creators, the identity image comes from their override, not the shared row
  const myIdentityImageUrl = isMotherCreator
    ? character.identity_image_url
    : override?.image_url ?? null;
  const myGeneratedImageUrl = isMotherCreator
    ? initial.image_url
    : override?.generated_image_url ?? null;
  const myGeneratedStatus = isMotherCreator
    ? initial.image_status
    : override?.generated_image_status ?? null;

  // Re-sync when the character row changes (e.g. after external refresh)
  useEffect(() => {
    const cfg = readMyAiConfig(character);
    setPrompt(cfg.prompt);
    setGenConfig({
      model: cfg.model,
      ratio: cfg.ratio,
      batch_size: String(cfg.num_images),
    });
    setAtlasConfig({
      ...ATLAS_DEFAULTS,
      size: cfg.ratio || ATLAS_DEFAULTS.size,
    });
    if (isMotherCreator) {
      setCurrentImageUrl(cfg.image_url);
      setCurrentStatus(cfg.image_status);
    }
    setIsDirty(false);
  }, [character, isMotherCreator]);

  // For Child Creators, sync generated preview from override
  useEffect(() => {
    if (!isMotherCreator) {
      setCurrentImageUrl(myGeneratedImageUrl);
      setCurrentStatus(myGeneratedStatus);
    }
  }, [isMotherCreator, myGeneratedImageUrl, myGeneratedStatus]);

  useEffect(() => {
    if (!isMotherCreator) { setIsDirty(false); return; }
    const dirty =
      prompt !== initial.prompt ||
      (!isAtlasCloud && (
        genConfig.model !== initial.model ||
        genConfig.ratio !== initial.ratio ||
        genConfig.batch_size !== String(initial.num_images)
      )) ||
      (isAtlasCloud && (
        atlasConfig.model !== (initial.model || ATLAS_DEFAULTS.model) ||
        atlasConfig.size !== (initial.ratio || ATLAS_DEFAULTS.size) ||
        atlasConfig.output_format !== (initial.output_format || ATLAS_DEFAULTS.output_format) ||
        atlasConfig.thinking !== (initial.thinking || ATLAS_DEFAULTS.thinking) ||
        atlasConfig.prompt_optimization_mode !== (initial.prompt_optimization_mode || ATLAS_DEFAULTS.prompt_optimization_mode)
      ));
    setIsDirty(dirty);
  }, [prompt, genConfig, atlasConfig, isAtlasCloud, initial, isMotherCreator]);

  const identityAssetId = isMotherCreator
    ? (character.identity_asset_id ?? '')
    : (override?.image_path ?? '');

  const finalRequest = useMemo(() => {
    const imageRef = isMotherCreator
      ? (character.identity_asset_id ?? '')
      : (override?.image_url ?? '');
    if (isAtlasCloud) {
      return JSON.stringify({
        model: atlasConfig.model,
        prompt: prompt || '',
        images: [imageRef || ''],
        size: atlasConfig.size,
        output_format: atlasConfig.output_format,
        thinking: atlasConfig.thinking,
        prompt_optimization_mode: atlasConfig.prompt_optimization_mode,
      }, null, 2);
    }
    if (isHuggingFace) {
      return JSON.stringify({
        images_b64_json: '["data:image/png;base64,..."]',
        prompt: prompt || '',
        lora_adapter: hfConfig.lora_adapter,
        seed: parseInt(hfConfig.seed, 10) || 0,
        randomize_seed: hfConfig.randomize_seed,
        guidance_scale: parseFloat(hfConfig.guidance_scale) || 1.0,
        steps: parseInt(hfConfig.steps, 10) || 4,
      }, null, 2);
    }
    return JSON.stringify({
      tool: 'image_editor',
      input: {
        image_assets: imageRef ? [imageRef] : [],
        prompt: prompt || '',
        model: genConfig.model,
        ratio: genConfig.ratio,
        number_of_images: parseInt(genConfig.batch_size, 10) || 1,
      },
    }, null, 2);
  }, [character.identity_asset_id, override, isMotherCreator, prompt, genConfig, hfConfig, atlasConfig, isHuggingFace, isAtlasCloud]);

  async function handleMyAiUpload(file: File) {
    if (isMotherCreator) {
      onUploadFile(file);
      return;
    }
    setUploadingLocal(true);
    try {
      await uploadMyAiOverrideImage(character.id, file);
      const ov = await loadMyAiOverride(character.id);
      setOverride(ov);
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploadingLocal(false);
    }
  }

  async function handleSave() {
    if (!isMotherCreator) return;
    setIsSaving(true);
    setError(null);
    try {
      await saveMyAiConfig(character.id, {
        prompt,
        model: isAtlasCloud ? atlasConfig.model : genConfig.model,
        ratio: isAtlasCloud ? atlasConfig.size : genConfig.ratio,
        num_images: isAtlasCloud ? 1 : (parseInt(genConfig.batch_size, 10) || 1),
        output_format: isAtlasCloud ? atlasConfig.output_format : null,
        thinking: isAtlasCloud ? atlasConfig.thinking : null,
        prompt_optimization_mode: isAtlasCloud ? atlasConfig.prompt_optimization_mode : null,
      });
      setIsDirty(false);
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerate() {
    if (isMotherCreator && isDirty) return;
    if (!isMotherCreator && !myIdentityImageUrl) {
      setError('Upload your own My AI image before generating.');
      return;
    }
    setIsGenerating(true);
    setError(null);
    setCurrentStatus('Processing');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-role-image-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          role_id: null,
          character_id: character.id,
          ...(isMotherCreator ? {
            prompt,
            model: isAtlasCloud ? atlasConfig.model : genConfig.model,
            ratio: isAtlasCloud ? atlasConfig.size : genConfig.ratio,
            number_of_images: isAtlasCloud ? 1 : (parseInt(genConfig.batch_size, 10) || 1),
            my_ai: true,
          } : {
            my_ai_child: true,
          }),
          ...(isHuggingFace ? {
            lora_adapter: hfConfig.lora_adapter,
            seed: parseInt(hfConfig.seed, 10) || 0,
            randomize_seed: hfConfig.randomize_seed,
            guidance_scale: parseFloat(hfConfig.guidance_scale) || 1.0,
            steps: parseInt(hfConfig.steps, 10) || 4,
          } : {}),
          ...(isAtlasCloud ? {
            atlas_size: atlasConfig.size,
            atlas_output_format: atlasConfig.output_format,
            atlas_thinking: atlasConfig.thinking,
            atlas_prompt_optimization_mode: atlasConfig.prompt_optimization_mode,
          } : {}),
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error ?? `Generation failed (${response.status})`);
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error ?? 'Generation failed');
      const imageUrl = data.image_url as string;
      const assetId = (data.asset_id as string | null) ?? null;
      if (isMotherCreator) {
        await updateMyAiPreview(character.id, imageUrl, assetId, 'Ready');
      } else {
        await updateMyAiOverrideGenerated(character.id, imageUrl, 'Ready', data.generation_id);
        const ov = await loadMyAiOverride(character.id);
        setOverride(ov);
      }
      setCurrentImageUrl(imageUrl);
      setCurrentStatus('Ready');
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
      setCurrentStatus('Failed');
      if (isMotherCreator) {
        try { await updateMyAiPreview(character.id, currentImageUrl ?? '', null, 'Failed'); } catch { /* ignore */ }
      } else {
        try { await updateMyAiOverrideGenerated(character.id, null, 'Failed'); } catch { /* ignore */ }
      }
    } finally {
      setIsGenerating(false);
    }
  }

  const [uploadingLocal, setUploadingLocal] = useState(false);
  const isUploading = uploading || uploadingLocal;

  async function handleSaveDisplayName() {
    setDisplayNameSaving(true);
    setError(null);
    try {
      await saveMyAiDisplayName(character.id, displayName);
      setDisplayNameDirty(false);
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setDisplayNameSaving(false);
    }
  }

  const statusColor = currentStatus === 'Ready' ? 'text-success-400'
    : currentStatus === 'Processing' ? 'text-warning-400'
    : currentStatus === 'Failed' ? 'text-danger-400'
    : 'text-surface-500';

  return (
    <div className="card space-y-5 p-4 border-accent-600/20">
      <div className="flex items-center gap-2 pb-2 border-b border-surface-800">
        <Sparkles className="w-4 h-4 text-accent-400" />
        <span className="text-sm font-semibold text-surface-100">My AI Generation Configuration</span>
        <span className="text-xs text-surface-500">— {character.name}</span>
        {!isMotherCreator && (
          <span className="text-xs text-accent-400/70 ml-auto">Your own My AI V-Card</span>
        )}
      </div>

      {/* Display Name override — Child Creator's custom client-facing name */}
      {!isMotherCreator && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-surface-400">
            Display Name (shown to your clients)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={displayName}
              onChange={e => { setDisplayName(e.target.value); setDisplayNameDirty(true); }}
              placeholder={character.name}
              maxLength={50}
              className="input-field text-sm flex-1"
            />
            <button
              onClick={handleSaveDisplayName}
              disabled={!displayNameDirty || displayNameSaving}
              className="btn-primary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
            >
              {displayNameSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
          <p className="text-xs text-surface-600">
            This is the name your clients see in chat. Leave blank to use the default "{character.name}".
          </p>
        </div>
      )}

      {/* My AI identity image upload — each creator uploads their own */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-surface-400">
          {isMotherCreator ? 'My AI Identity Image' : 'Your My AI Image'}
        </label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-600/10 border border-accent-600/30 text-sm text-accent-300">
          <Lock className="w-3.5 h-3.5 text-accent-400" />
          <span className="font-medium">{character.name}</span>
          <span className="text-xs text-accent-400/70">
            {isMotherCreator ? '(My AI identity)' : '(your own image — not shared)'}
          </span>
        </div>

        {myIdentityImageUrl ? (
          <div className="space-y-3">
            <div className="relative w-full rounded-xl overflow-hidden border border-surface-700 bg-surface-950">
              <img
                src={myIdentityImageUrl}
                alt="My AI Identity"
                className="w-full object-contain"
                style={{ maxHeight: '40vh', minHeight: '200px' }}
              />
              {isUploading && (
                <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                  <Loader2 className="w-6 h-6 text-surface-300 animate-spin" />
                </div>
              )}
            </div>
            <button
              onClick={() => myAiFileInputRef.current?.click()}
              disabled={isUploading}
              className="btn-secondary gap-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
              Replace Image
            </button>
          </div>
        ) : (
          <button
            onClick={() => myAiFileInputRef.current?.click()}
            disabled={isUploading}
            className="w-full flex flex-col items-center justify-center gap-3 py-10 border-2 border-dashed border-surface-700 rounded-xl hover:border-accent-600/40 hover:bg-surface-800/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading ? (
              <Loader2 className="w-6 h-6 text-surface-500 animate-spin" />
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-surface-800 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-surface-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm text-surface-300">
                    {isMotherCreator ? 'Upload Identity Image' : 'Upload Your My AI Image'}
                  </p>
                  <p className="text-xs text-surface-600 mt-1">PNG, JPG, or WebP up to 10 MB</p>
                </div>
              </>
            )}
          </button>
        )}

        <input
          ref={myAiFileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleMyAiUpload(file);
            e.target.value = '';
          }}
        />

        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-900/60 border border-surface-800 text-xs text-surface-400">
          <Lock className="w-3 h-3 text-surface-600" />
          <span className="text-surface-600 min-w-[110px]">Identity Asset ID</span>
          <span className="font-mono break-all text-surface-400">{identityAssetId || '—'}</span>
        </div>
      </div>

      {/* 1) Prompt Box — editable for Mother, read-only for Child */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">
          My AI Prompt {isMotherCreator ? '' : '(shared — read-only)'}
        </label>
        <textarea
          value={prompt}
          onChange={isMotherCreator ? e => setPrompt(e.target.value) : undefined}
          readOnly={!isMotherCreator}
          placeholder="Describe the My AI generation: clothing, environment, mood, face-lock style…"
          rows={4}
          className={`input-field text-sm resize-y ${!isMotherCreator ? 'opacity-60 cursor-not-allowed' : ''}`}
        />
        <p className="text-xs text-surface-600">
          {isMotherCreator
            ? 'This prompt controls how the My AI generation will look. Saved and loaded per the reserved My AI card.'
            : 'This prompt is set by the Mother Creator and shared with all creators.'}
        </p>
      </div>

      {/* 2) Generation Configuration — editable for Mother, read-only for Child */}
      <GenerationConfigEditor
        values={genConfig}
        onChange={isMotherCreator ? setGenConfig : () => {}}
        title="Generation Configuration"
        providerName={activeProvider}
        hfValues={hfConfig}
        onChangeHf={isMotherCreator ? setHfConfig : () => {}}
        atlasValues={atlasConfig}
        onChangeAtlas={isMotherCreator ? setAtlasConfig : () => {}}
      />
      <p className="text-xs text-surface-600 -mt-2">
        {isMotherCreator
          ? 'image_assets are automatically set from the My AI identity_asset_id — not editable.'
          : 'Configuration is shared from the Mother Creator — not editable.'}
      </p>

      {/* 3) Final Request Box — read-only JSON */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-surface-500" />
          <label className="text-xs font-medium text-surface-400">Final Request (read-only)</label>
        </div>
        <pre className="px-3 py-2.5 rounded-lg bg-surface-900/80 border border-surface-800 text-xs font-mono text-surface-300 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
{finalRequest}
        </pre>
      </div>

      {/* 4) Buttons */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}
      <div className="flex gap-2 pt-2 border-t border-surface-800">
        {isMotherCreator && (
          <button onClick={handleSave} disabled={isSaving} className="btn-primary text-sm gap-1.5">
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Save
          </button>
        )}
        <button
          onClick={handleGenerate}
          disabled={(isMotherCreator && isDirty) || isGenerating || isSaving || !prompt.trim() || (!isMotherCreator && !myIdentityImageUrl)}
          className="btn-secondary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          title={
            isMotherCreator && isDirty ? 'Save changes before generating'
            : !isMotherCreator && !myIdentityImageUrl ? 'Upload your own image first'
            : undefined
          }
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate
        </button>
        {isMotherCreator && isDirty && <span className="text-xs text-warning-400 self-center">Unsaved changes — Save before generating</span>}
      </div>

      {/* 5) Preview after Generate */}
      {currentImageUrl && (
        <div className="space-y-2 pt-3 border-t border-surface-800">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5 text-surface-500" />
            <span className="text-xs font-medium text-surface-400">Preview</span>
            <span className={`text-xs font-medium ml-auto ${statusColor}`}>
              Status: {currentStatus || '—'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <img
              src={currentImageUrl}
              alt="Generated My AI preview"
              className="w-full sm:w-48 rounded-lg border border-surface-700 object-cover"
            />
            <div className="flex-1 space-y-1.5 text-xs">
              <div className="flex gap-2">
                <span className="text-surface-500 min-w-[80px]">Image URL</span>
                <span className="font-mono break-all text-surface-300">{currentImageUrl}</span>
              </div>
              <a
                href={currentImageUrl}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-600/15 text-accent-400 border border-accent-600/20 text-xs hover:bg-accent-600/25 transition-colors w-fit"
              >
                <Download className="w-3.5 h-3.5" />Download
              </a>
              <button
                onClick={async () => {
                  try {
                    if (isMotherCreator) {
                      await setMyAiAvatar(character.id, currentImageUrl);
                    } else {
                      await selectMyAiOverrideImage(character.id, currentImageUrl);
                    }
                    onUpdate();
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-600/15 text-accent-400 border border-accent-600/20 text-xs hover:bg-accent-600/25 transition-colors w-fit"
              >
                <Star className="w-3.5 h-3.5" />Use as V-Card Image
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Appearance Dropdown — premium custom select for Customize AI fields.
// Renders the same field data as the former native <select> but with
// VirgoPlay dark-navy styling. No data or behavior changes.
// ═══════════════════════════════════════════════════════════════════════════

function AppearanceDropdown({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  return (
    <div className="cai-select-wrap" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`cai-select-trigger ${open ? 'cai-select-active' : ''}`}
      >
        {value ? <span>{value}</span> : <span className="cai-select-placeholder">Select…</span>}
      </button>
      <ChevronDown
        className={`cai-select-chevron ${open ? 'cai-select-chevron-open' : ''}`}
        width={16}
        height={16}
      />
      {open && (
        <div className="cai-select-panel">
          <div
            className={`cai-select-option ${!value ? 'cai-select-option-selected' : ''}`}
            onClick={() => { onChange(''); setOpen(false); }}
          >
            <span className="cai-select-option-placeholder">Select…</span>
            {!value && <Check className="cai-select-option-check" width={14} height={14} />}
          </div>
          {options.map(opt => (
            <div
              key={opt}
              className={`cai-select-option ${value === opt ? 'cai-select-option-selected' : ''}`}
              onClick={() => { onChange(opt); setOpen(false); }}
            >
              <span>{opt}</span>
              {value === opt && <Check className="cai-select-option-check" width={14} height={14} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Customize AI Panel — Dev ON only, Mother Creator inspection.
// Shows appearance form, generated prompt (read-only), generation config,
// and final payload. No free-text prompt editor. No image upload.
// ═══════════════════════════════════════════════════════════════════════════

function CustomizeAiPanel({
  character, creatorId, onUpdate, onImageUpdate,
}: {
  character: CharacterV2Row;
  creatorId: string;
  onUpdate: () => void;
  onImageUpdate: (url: string | null) => void;
}) {
  const initialConfig = useMemo(() => readCustomizeAiConfig(character), [character]);
  const [appearance, setAppearance] = useState<MyAiAppearance>(createEmptyAppearance());
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [override, setOverride] = useState<CustomizeAiOverrideRow | null>(null);
  const [activeProvider, setActiveProvider] = useState<string>('ZenCreator');
  const [genConfig, setGenConfig] = useState<GenerationConfigValues>({
    model: initialConfig.model,
    ratio: initialConfig.ratio,
    batch_size: String(initialConfig.num_images),
  });
  const [atlasConfig, setAtlasConfig] = useState<AtlasCloudConfigValues>({
    ...ATLAS_DEFAULTS,
    size: initialConfig.ratio || ATLAS_DEFAULTS.size,
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_active_image_provider');
        if (!cancelled && data && typeof data === 'string') setActiveProvider(data);
      } catch { /* keep default */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ov = await loadCustomizeAiOverride(character.id);
        if (!cancelled) {
          setOverride(ov);
          if (ov?.appearance_data) {
            const restored = { ...createEmptyAppearance(), ...ov.appearance_data } as MyAiAppearance;
            setAppearance(restored);
            setGeneratedPrompt(buildMyAiPrompt(restored));
          }
        }
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [character.id, onUpdate]);

  useEffect(() => {
    const cfg = readCustomizeAiConfig(character);
    setGenConfig({ model: cfg.model, ratio: cfg.ratio, batch_size: String(cfg.num_images) });
    setAtlasConfig({
      ...ATLAS_DEFAULTS,
      model: cfg.model || ATLAS_DEFAULTS.model,
      size: cfg.ratio || ATLAS_DEFAULTS.size,
      output_format: cfg.output_format || ATLAS_DEFAULTS.output_format,
      thinking: cfg.thinking || ATLAS_DEFAULTS.thinking,
      prompt_optimization_mode: cfg.prompt_optimization_mode || ATLAS_DEFAULTS.prompt_optimization_mode,
    });
    setIsDirty(false);
  }, [character]);

  const isAtlasCloud = activeProvider.toLowerCase().includes('atlas');

  useEffect(() => {
    setIsDirty(
      genConfig.model !== initialConfig.model ||
      genConfig.ratio !== initialConfig.ratio ||
      genConfig.batch_size !== String(initialConfig.num_images) ||
      (isAtlasCloud && (
        atlasConfig.model !== (initialConfig.model || ATLAS_DEFAULTS.model) ||
        atlasConfig.size !== (initialConfig.ratio || ATLAS_DEFAULTS.size)
      ))
    );
  }, [genConfig, atlasConfig, isAtlasCloud, initialConfig]);

  function handleAppearanceChange(field: keyof MyAiAppearance, value: string) {
    const next = { ...appearance, [field]: value };
    setAppearance(next);
    const prompt = buildMyAiPrompt(next);
    setGeneratedPrompt(prompt);
  }

  async function handleSaveAppearance() {
    setIsSaving(true);
    setError(null);
    try {
      await saveCustomizeAiAppearance(character.id, appearance as unknown as Record<string, string>, generatedPrompt);
      const ov = await loadCustomizeAiOverride(character.id);
      setOverride(ov);
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveConfig() {
    setIsSaving(true);
    setError(null);
    try {
      await saveCustomizeAiConfig(character.id, {
        model: isAtlasCloud ? atlasConfig.model : genConfig.model,
        ratio: isAtlasCloud ? atlasConfig.size : genConfig.ratio,
        num_images: parseInt(genConfig.batch_size, 10) || 1,
        output_format: atlasConfig.output_format,
        thinking: atlasConfig.thinking,
        prompt_optimization_mode: atlasConfig.prompt_optimization_mode,
      });
      setIsDirty(false);
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsSaving(false);
    }
  }

  async function handleGenerate() {
    if (!generatedPrompt) {
      setError('Save your appearance selections before generating.');
      return;
    }
    if (!override) {
      setError('Save your appearance selections first to create an override record.');
      return;
    }
    setIsGenerating(true);
    setError(null);
    setGenStatus('Processing');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-role-image-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          character_id: character.id,
          customize_ai: true,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error ?? `Generation failed (${response.status})`);
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error ?? 'Generation failed');
      const imageUrl = data.image_url as string;
      await updateCustomizeAiGenerated(character.id, imageUrl, 'Ready', data.generation_id);
      const ov = await loadCustomizeAiOverride(character.id);
      setOverride(ov);
      onImageUpdate(imageUrl);
      setGenStatus('Ready');
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
      setGenStatus('Failed');
      try { await updateCustomizeAiGenerated(character.id, null, 'Failed'); } catch { /* ignore */ }
    } finally {
      setIsGenerating(false);
    }
  }

  const isT2I = atlasConfig.model.includes('text-to-image');

  const finalPayload = useMemo(() => {
    const prompt = generatedPrompt || '';
    if (isAtlasCloud) {
      const payload: Record<string, unknown> = {
        model: atlasConfig.model,
        prompt,
        size: atlasConfig.size,
        output_format: atlasConfig.output_format,
        thinking: atlasConfig.thinking,
        prompt_optimization_mode: atlasConfig.prompt_optimization_mode,
      };
      if (!isT2I) payload.images = [];
      return JSON.stringify(payload, null, 2);
    }
    return JSON.stringify({
      tool: 'image_editor',
      input: {
        image_assets: [],
        prompt,
        model: genConfig.model,
        ratio: genConfig.ratio,
        number_of_images: parseInt(genConfig.batch_size, 10) || 1,
      },
    }, null, 2);
  }, [generatedPrompt, genConfig, atlasConfig, isAtlasCloud, isT2I]);

  return (
    <div className="cai-popup p-5 sm:p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="cai-popup-title">Customize AI</h3>
          <p className="cai-popup-subtitle mt-1">Appearance & Generation</p>
        </div>
        <Code2 className="w-4 h-4 text-indigo-400 flex-shrink-0" />
      </div>

      {error && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-danger-500/10 border border-danger-500/30 text-danger-300 text-xs">
          <AlertCircle className="w-3.5 h-3.5" />
          {error}
        </div>
      )}

      {/* Appearance Form */}
      <div className="space-y-3">
        <h4 className="cai-popup-subtitle">Appearance Fields</h4>
        <div className="grid grid-cols-2 gap-3">
          {(Object.keys(APPEARANCE_FIELD_OPTIONS) as (keyof MyAiAppearance)[]).map(field => (
            <div key={field} className="space-y-1.5">
              <label className="cai-field-label">{APPEARANCE_FIELD_LABELS[field]}</label>
              <AppearanceDropdown
                value={appearance[field]}
                options={APPEARANCE_FIELD_OPTIONS[field]}
                onChange={(val) => handleAppearanceChange(field, val)}
              />
            </div>
          ))}
        </div>
        <button
          onClick={handleSaveAppearance}
          disabled={isSaving}
          className="cai-btn-save disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Appearance
        </button>
      </div>

      {/* Generate AI button */}
      <div className="space-y-2">
        <button
          onClick={handleGenerate}
          disabled={isGenerating || !override}
          className="cai-btn-generate disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {genStatus || 'Generating…'}
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4" />
              Generate AI
            </>
          )}
        </button>
        {!override && (
          <p className="text-xs text-surface-500">Save your appearance selections first to enable generation.</p>
        )}
        {isGenerating && (
          <p className="text-xs text-primary-400">Sending to Atlas Cloud — this may take up to 2 minutes…</p>
        )}
      </div>

      {/* Generated image preview */}
      {override?.generated_image_url && (
        <div className="space-y-2">
          <label className="text-xs font-medium text-surface-400">Generated AI Image</label>
          <div className="w-full max-w-[200px] rounded-lg overflow-hidden border border-surface-700">
            <img src={override.generated_image_url} alt="Generated Customize AI" className="w-full h-auto" />
          </div>
          {override.generated_image_status && (
            <p className="text-xs text-surface-500">Status: {override.generated_image_status}</p>
          )}
        </div>
      )}

      {/* Generated Prompt — Dev inspection only, read-only */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Code2 className="w-3 h-3 text-surface-500" />
          <label className="text-xs font-medium text-surface-400">Generated Prompt (Dev Only)</label>
        </div>
        <div className="w-full text-xs text-surface-300 bg-surface-950 border border-surface-800 rounded-lg p-3 min-h-[60px] leading-relaxed font-mono">
          {generatedPrompt || <span className="text-surface-600 italic">Select appearance fields to generate prompt…</span>}
        </div>
      </div>

      {/* Generation Configuration — Mother controls this */}
      <div className="space-y-3">
        <h4 className="text-xs font-medium text-surface-400 uppercase tracking-wide">Generation Configuration</h4>
        <GenerationConfigEditor
          values={genConfig}
          onChange={setGenConfig}
          title="Customize AI Configuration"
          providerName={activeProvider}
          atlasValues={atlasConfig}
          onChangeAtlas={setAtlasConfig}
        />
        <button
          onClick={handleSaveConfig}
          disabled={isSaving || !isDirty}
          className="btn-primary gap-1.5 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Configuration
        </button>
      </div>

      {/* Final Payload — Dev inspection only */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5">
          <Code2 className="w-3 h-3 text-surface-500" />
          <label className="text-xs font-medium text-surface-400">Final Request Payload (Dev Only)</label>
        </div>
        <pre className="w-full text-xs text-surface-300 bg-surface-950 border border-surface-800 rounded-lg p-3 overflow-x-auto font-mono leading-relaxed">
          {finalPayload}
        </pre>
      </div>

      {/* Override status */}
      {override && (
        <div className="text-xs text-surface-500 space-y-1">
          <p>Override exists: status={override.generated_image_status || 'none'}, image={override.generated_image_url ? 'yes' : 'no'}</p>
        </div>
      )}
    </div>
  );
}
