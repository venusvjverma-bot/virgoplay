/**
 * Role Studio
 *
 * A lightweight orchestration layer that inherits Character Studio as the
 * single source of truth for:
 *   - Character Identity (face, hair, body, reference image)
 *   - Character Prompt Schema
 *   - Saved Prompt
 *   - Generation Configuration (provider, tool, model, ratio, batch_size)
 *
 * Role Studio only stores:
 *   - Scene name, face_lock, sort_order
 *   - Optional overrides for Universal Prompt Schema fields (prompt_overrides)
 *   - Optional overrides for model, ratio, batch_size
 *
 * The Scene Editor reuses the EXACT SAME components as Character Studio:
 *   - UniversalPromptSchemaEditor (preloaded with character schema + overrides)
 *   - GenerationConfigEditor (preloaded with character config + overrides)
 *   - PromptGeneratorPanel (generates identity + scene fields = final prompt)
 *
 * Drill-down: Roles list → Scenarios list → Scenes list → Scene editor.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';

import {
  ChevronLeft, ChevronDown, Plus, Loader2, AlertCircle, Trash2, Pencil,
  Image as ImageIcon, Layers, Film, Clapperboard,
  CheckCircle, X, Lock, BoxSelect, Star,
  Sparkles, Download, Code2, Eye, RotateCw, Video,
  ToggleLeft, ToggleRight,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  loadSelectedCharacter,
  canUseDevMode,
  readDevMode,
  writeDevMode,
  readChildCreatorMode,
  writeChildCreatorMode,
  loadAllRoleImageProductions,
  loadSelectedRoleId,
  setSelectedRole,
  type RoleImageProductionRow,
} from '../../lib/character-studio-v2';
import { useAuth } from '../../context/AuthContext';
import { useDevAccess } from '../../context/DevAccessContext';
import { loadWallet as fetchWallet, deductGenerationCost, IMAGE_COST, VIDEO_COST, type WalletInfo } from '../../lib/wallet';
import {
  createEmptyPromptSchema,
  type UniversalPromptSchema,
  type MasterAiCharacterRow,
} from '../../types/character';
import type {
  CharacterRoleRow, RoleScenarioRow, ScenarioSceneRow,
} from '../../types/scene';
import { resolveInheritedGenerationConfig } from '../../types/scene';
import { buildScenePrompt } from '../../lib/scene-prompt-builder';
import { UniversalPromptSchemaEditor } from '../../components/UniversalPromptSchemaEditor';
import { GenerationConfigEditor, type GenerationConfigValues, type HuggingFaceConfigValues, type AtlasCloudConfigValues, HF_DEFAULTS, ATLAS_DEFAULTS } from '../../components/GenerationConfigEditor';
import { PromptGeneratorPanel } from '../../components/PromptGeneratorPanel';
import { PromptFieldDropdown } from '../../components/PromptFieldDropdown';
import ScenarioLibrary from './ScenarioLibrary';
import FishMascot from '../../components/FishMascot';
import { ROLE_INTROS } from '../../lib/role-intros';

type DrillLevel = 'roles' | 'scenarios' | 'scenes' | 'scene-editor';
type StudioTab = 'roles-drill' | 'scenarios';

// Fields that define the character's identity — always inherited, never overridable
const IDENTITY_FIELDS = new Set<keyof UniversalPromptSchema>([
  'ethnicity', 'age', 'hair', 'face', 'skin_type', 'body', 'breasts', 'style',
]);

// Fields that a scene can override (must be in Universal Prompt Schema)
const OVERRIDABLE_FIELDS = new Set<keyof UniversalPromptSchema>([
  'clothing', 'pose', 'expression', 'action', 'partner',
  'camera_angle', 'lighting', 'atmosphere', 'extra_details',
]);

function extractSceneFieldsFromSchema(schema: UniversalPromptSchema): string[] {
  const fields: string[] = [];
  for (const field of OVERRIDABLE_FIELDS) {
    const val = schema[field];
    if (val.trim()) fields.push(val.trim());
  }
  return fields;
}

function useInView<T extends HTMLElement>(options?: IntersectionObserverInit) {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      setInView(entry.isIntersecting);
    }, { threshold: 0.15, ...options });
    observer.observe(el);
    return () => observer.disconnect();
  }, [options]);
  return { ref, inView };
}

export interface SelectedV2CharacterRef {
  id: string;
  name: string;
  identity_image_url: string | null;
  identity_asset_id: string | null;
}

// ── Role Card with scroll-reveal text animation ──────────────────────────────
// Extracted so each card can use the useInView hook (hooks can't be called
// inside .map()). The card itself stays stable; only the title and description
// gently fade + rise when the card enters the viewport.
function RoleCard({
  role,
  roleImgUrl,
  hasImage,
  isGenerating,
  isExpanded,
  isSelected,
  roleDone,
  justBecameDone,
  canAffordImage,
  isChildCreator,
  onToggle,
  onPreview,
  onGenerate,
  onNavigateToScenarios,
  statusBadge,
}: {
  role: CharacterRoleRow;
  roleImgUrl: string | null;
  hasImage: boolean;
  isGenerating: boolean;
  isExpanded: boolean;
  isSelected: boolean;
  roleDone: boolean;
  justBecameDone: boolean;
  canAffordImage: boolean;
  isChildCreator: boolean;
  onToggle: () => void;
  onPreview: () => void;
  onGenerate: () => void;
  onNavigateToScenarios: () => void;
  statusBadge: { label: string; className: string };
}) {
  const { ref, inView } = useInView<HTMLDivElement>();
  const [everRevealed, setEverRevealed] = useState(false);

  // Replay reveal each time the card re-enters the viewport, but only after
  // it has left (inView false → true). On first mount, reveal immediately.
  useEffect(() => {
    if (inView) setEverRevealed(true);
  }, [inView]);

  const shouldAnimate = inView && everRevealed;
  const titleClass = shouldAnimate ? 'role-title-reveal' : '';
  const descClass = shouldAnimate ? 'role-desc-reveal' : '';

  return (
    <div ref={ref} className="flex flex-col">
      <button
        onClick={onToggle}
        className={`w-full px-5 py-3.5 rounded-2xl backdrop-blur-md border text-left transition-all duration-300 ${
          isExpanded
            ? 'bg-black/50 border-white/30'
            : isSelected
              ? 'bg-black/30 role-selected-glow'
              : 'bg-black/30 border-white/10 hover:border-white/20 hover:bg-black/40'
        } ${justBecameDone ? 'done-glow-once' : ''}`}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className={`text-sm font-bold text-white drop-shadow-md ${titleClass}`}>{role.name}</div>
            <div className={`text-xs font-light text-white/60 leading-relaxed mt-0.5 ${descClass}`}>
              {role.description?.trim() ? role.description : 'No description'}
            </div>
          </div>
          {isSelected && (
            <span className="text-[10px] font-bold tracking-wider uppercase text-accent-300 bg-accent-600/20 px-2 py-0.5 rounded-full border border-accent-500/30">
              Selected
            </span>
          )}
          {roleDone && !isSelected && (
            <span className="text-[10px] font-bold tracking-wider uppercase text-success-400 bg-success-500/10 px-2 py-0.5 rounded-full border border-success-500/20">
              Done
            </span>
          )}
          <ChevronDown
            className={`w-4 h-4 text-white/50 flex-shrink-0 transition-transform duration-300 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${
          isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0 mt-0'
        }`}
      >
        <div className="overflow-hidden flex flex-col gap-2">
          <div className="flex items-center justify-center gap-2">
            {hasImage && (
              <button
                onClick={onPreview}
                className="px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border bg-white/10 border-white/20 text-white hover:bg-white/15 transition-colors role-action-reveal"
              >
                <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Preview</span>
              </button>
            )}
            <button
              onClick={onGenerate}
              disabled={isGenerating || !role.role_prompt?.trim() || (isChildCreator && !canAffordImage)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border bg-accent-600/20 border-accent-500/30 text-accent-300 hover:bg-accent-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed role-action-reveal"
            >
              {isGenerating ? (
                <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</span>
              ) : hasImage ? (
                <span className="flex items-center gap-1.5"><RotateCw className="w-3.5 h-3.5" />Regenerate</span>
              ) : (
                <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Generate</span>
              )}
            </button>
            {hasImage && (
              <button
                onClick={onNavigateToScenarios}
                className={`px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border bg-primary-600/20 border-primary-500/30 text-primary-300 hover:bg-primary-600/30 transition-colors role-action-reveal-delayed ${justBecameDone ? 'scenes-highlight-once' : ''}`}
              >
                <span className="flex items-center gap-1.5"><Clapperboard className="w-3.5 h-3.5" />Go to Scenes</span>
              </button>
            )}
          </div>
          <div className="text-center text-[10px] font-medium">
            <span className={statusBadge.className}>{statusBadge.label}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RoleStudioPage({ selectedV2Character: propChar, onOffModeActive, onBack, onRoleImageDone }: { selectedV2Character?: SelectedV2CharacterRef | null; onOffModeActive?: (active: boolean) => void; onBack?: () => void; onRoleImageDone?: () => void }) {
  const { creator } = useAuth();
  const isMotherCreator = canUseDevMode(creator?.email);
  const isChildCreator = !isMotherCreator;
  const [selectedV2Character, setSelectedV2Character] = useState<SelectedV2CharacterRef | null>(propChar ?? null);
  const [roleImageProductions, setRoleImageProductions] = useState<Map<string, RoleImageProductionRow>>(new Map());
  const [studioTab, setStudioTab] = useState<StudioTab>('roles-drill');
  const [scenarioEntryMode, setScenarioEntryMode] = useState<'readonly' | 'edit'>('edit');
  const [level, setLevel] = useState<DrillLevel>('roles');
  const [characters, setCharacters] = useState<MasterAiCharacterRow[]>([]);
  const [roles, setRoles] = useState<CharacterRoleRow[]>([]);
  const [scenarios, setScenarios] = useState<RoleScenarioRow[]>([]);
  const [scenes, setScenes] = useState<ScenarioSceneRow[]>([]);
  const [selectedRole, setSelectedRole] = useState<CharacterRoleRow | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<RoleScenarioRow | null>(null);
  const [editingScene, setEditingScene] = useState<ScenarioSceneRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // Dev mode — only the Mother Creator can toggle. Reads from the same
  // settings table as Character Studio V2 so the toggle stays in sync.
  const { unlocked: devAccessUnlocked } = useDevAccess();
  const canToggleDevMode = canUseDevMode(creator?.email) && devAccessUnlocked;
  const [devMode, setDevMode] = useState(false);
  const [devModeLoading, setDevModeLoading] = useState(true);
  const [childCreatorMode, setChildCreatorMode] = useState(true);
  const [childCreatorModeLoading, setChildCreatorModeLoading] = useState(true);

  // Wallet balance for Child Creators — gates generation buttons
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);
  const [walletLoading, setWalletLoading] = useState(true);

  useEffect(() => {
    if (!creator?.id || !canToggleDevMode) { setDevModeLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const mode = await readDevMode(creator.id, creator.email);
        if (!cancelled) setDevMode(mode);
      } catch {
        if (!cancelled) setDevMode(false);
      } finally {
        if (!cancelled) setDevModeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [creator?.id, creator?.email, canToggleDevMode]);

  async function handleToggleDevMode(next: boolean) {
    if (!creator?.id) return;
    setDevMode(next);
    try { await writeDevMode(creator.id, next); }
    catch { setDevMode(!next); }
  }

  // Child Creator mode — persisted per-creator so it survives refresh and navigation.
  // Default ON (true) when no row exists yet, matching the existing login default.
  // For Child Creators this is always ON and cannot be changed.
  useEffect(() => {
    if (!creator?.id) { setChildCreatorModeLoading(false); return; }
    if (isChildCreator) { setChildCreatorMode(true); setChildCreatorModeLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const mode = await readChildCreatorMode(creator.id);
        if (!cancelled) setChildCreatorMode(mode);
      } catch {
        if (!cancelled) setChildCreatorMode(true);
      } finally {
        if (!cancelled) setChildCreatorModeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [creator?.id, isChildCreator]);

  async function handleToggleChildCreatorMode(next: boolean) {
    if (!creator?.id) return;
    if (isChildCreator) return; // frozen ON for Child Creators
    setChildCreatorMode(next);
    try { await writeChildCreatorMode(creator.id, next); }
    catch { setChildCreatorMode(!next); }
  }

  useEffect(() => {
    if (!creator?.id || isMotherCreator) { setWalletLoading(false); return; }
    let cancelled = false;
    (async () => {
      try {
        const wal = await fetchWallet(creator.id);
        if (!cancelled) setWalletInfo(wal);
      } catch { /* ignore */ } finally {
        if (!cancelled) setWalletLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [creator?.id, isMotherCreator]);

  async function refreshWalletBalance(): Promise<WalletInfo | null> {
    if (!creator?.id) return null;
    try {
      const wal = await fetchWallet(creator.id);
      setWalletInfo(wal);
      return wal;
    } catch { return null; }
  }

  // Returns true if the balance is sufficient and the deduction succeeded.
  async function checkAndDeduct(amount: number, description: string): Promise<boolean> {
    if (isMotherCreator) return true; // Mother Creator: no wallet check
    if (!walletInfo) return false;
    const result = await deductGenerationCost(walletInfo.id, amount, description);
    if (result.success) {
      setWalletInfo(prev => prev ? { ...prev, available_balance: result.newBalance } : prev);
      return true;
    }
    return false;
  }

  const canAffordImage = isMotherCreator || (!walletLoading && walletInfo !== null && walletInfo.available_balance >= IMAGE_COST);
  const canAffordVideo = isMotherCreator || (!walletLoading && walletInfo !== null && walletInfo.available_balance >= VIDEO_COST);

  const loadCharacters = useCallback(async () => {
    const { data: legacyData, error: legacyErr } = await supabase
      .from('master_ai_characters')
      .select('*')
      .order('created_at', { ascending: false });
    if (legacyErr) { setError(legacyErr.message); return; }

    const { data: v2Data, error: v2Err } = await supabase
      .from('character_studio_v2')
      .select('*')
      .eq('status', 'active')
      .order('is_my_ai', { ascending: false })
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (v2Err) { setError(v2Err.message); return; }

    const legacyChars = (legacyData ?? []) as MasterAiCharacterRow[];
    const v2Chars: MasterAiCharacterRow[] = (v2Data ?? []).map((row: Record<string, unknown>) => ({
      id: row.id as string,
      creator_id: row.creator_id as string,
      name: row.name as string,
      prompt_schema: (row.prompt_schema as UniversalPromptSchema) ?? createEmptyPromptSchema(),
      is_active: true,
      identity_image_url: (row.identity_image_url as string | null) ?? null,
      identity_image_path: null,
      identity_asset_id: (row.identity_asset_id as string | null) ?? null,
      character_source: 'character_studio_v2' as const,
      provider_character_id: null,
      provider_metadata: null,
      identity_saved_at: null,
      status: 'published',
      saved_prompt: null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    }));

    // When a V2 character is Selected in Character Studio V2, Role Studio uses
    // ONLY that character's identity. The selected V2 character is placed first
    // and flagged so the UI can highlight it; all other characters remain
    // available for legacy roles but the Selected one is the primary identity.
    let combined = [...v2Chars, ...legacyChars];
    if (selectedV2Character) {
      combined = combined.map(c =>
        c.id === selectedV2Character.id && c.character_source === 'character_studio_v2'
          ? { ...c, is_selected: true }
          : { ...c, is_selected: false }
      );
    }
    setCharacters(combined);
  }, [selectedV2Character]);

  const loadRoles = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('character_roles')
      .select('*')
      .order('sort_order', { ascending: true });
    if (err) { setError(err.message); }
    else { setRoles((data ?? []) as CharacterRoleRow[]); }
    setLoading(false);
  }, [refreshKey]);

  const loadScenarios = useCallback(async (roleId: string) => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('role_scenarios')
      .select('*')
      .eq('role_id', roleId)
      .order('sort_order', { ascending: true });
    if (err) { setError(err.message); }
    else { setScenarios((data ?? []) as RoleScenarioRow[]); }
    setLoading(false);
  }, []);

  const loadScenes = useCallback(async (scenarioId: string) => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('scenario_scenes')
      .select('*')
      .eq('scenario_id', scenarioId)
      .order('sort_order', { ascending: true });
    if (err) { setError(err.message); }
    else { setScenes((data ?? []) as ScenarioSceneRow[]); }
    setLoading(false);
  }, []);

  // Resolve the effective identity image for the selected character.
  // When navigated from Character Studio, propChar carries the shared row's
  // identity_image_url — which is null for a My AI character whose image
  // lives in the Child Creator's override. Always fetch from the DB so the
  // override's selected_image_url is used when present; fall back to propChar.
  useEffect(() => {
    if (!creator?.id) {
      if (propChar) setSelectedV2Character(propChar);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const sel = await loadSelectedCharacter(creator.id);
        if (!cancelled && sel) {
          setSelectedV2Character({
            id: sel.character_id,
            name: sel.name,
            identity_image_url: sel.identity_image_url,
            identity_asset_id: sel.identity_asset_id,
          });
        } else if (!cancelled && propChar) {
          setSelectedV2Character(propChar);
        }
      } catch {
        if (!cancelled && propChar) setSelectedV2Character(propChar);
      }
    })();
    return () => { cancelled = true; };
  }, [propChar, creator?.id]);

  const loadRoleImageProductions = useCallback(async () => {
    if (!isChildCreator) return;
    try {
      const prods = await loadAllRoleImageProductions();
      const map = new Map<string, RoleImageProductionRow>();
      for (const p of prods) map.set(p.role_id, p);
      setRoleImageProductions(map);
    } catch { /* ignore — UI shows no images */ }
  }, [isChildCreator]);

  useEffect(() => {
    loadCharacters();
    loadRoles();
    loadRoleImageProductions();
  }, [loadCharacters, loadRoles, loadRoleImageProductions]);

  function navigateToScenarios(role: CharacterRoleRow) {
    setSelectedRole(role);
    setScenarioEntryMode('edit');
    setStudioTab('scenarios');
  }

  function backToRolesFromScenarios() {
    setStudioTab('roles-drill');
    setLevel('roles');
    setScenarioEntryMode('edit');
  }

  function handleTabChange(tab: StudioTab) {
    if (tab === 'scenarios') {
      setScenarioEntryMode('readonly');
    }
    setStudioTab(tab);
  }

  function navigateToScenes(scenario: RoleScenarioRow) {
    setSelectedScenario(scenario);
    setLevel('scenes');
    loadScenes(scenario.id);
  }

  function navigateToSceneEditor(scene: ScenarioSceneRow | null) {
    setEditingScene(scene);
    setLevel('scene-editor');
  }

  function backToRoles() {
    setLevel('roles');
    setSelectedRole(null);
    setScenarios([]);
    loadRoles();
  }

  function backToScenarios() {
    if (selectedRole) {
      setLevel('scenarios');
      setSelectedScenario(null);
      setScenes([]);
      loadScenarios(selectedRole.id);
    }
  }

  function backToScenes() {
    if (selectedScenario) {
      setLevel('scenes');
      setEditingScene(null);
      loadScenes(selectedScenario.id);
    }
  }

  if (studioTab === 'scenarios') {
    if (scenarioEntryMode === 'edit') {
      return (
        <DevScenariosView
          creatorId={creator!.id}
          selectedRole={selectedRole}
          selectedV2Character={selectedV2Character}
          onRefresh={() => setRefreshKey(k => k + 1)}
          onBack={backToRolesFromScenarios}
          checkAndDeduct={checkAndDeduct}
          canAffordImage={canAffordImage}
          canAffordVideo={canAffordVideo}
        />
      );
    }
    if (!devMode) return <ScenarioLibrary />;
    return (
      <ReadOnlyScenariosOverview
        creatorId={creator!.id}
        roles={roles}
        selectedRole={selectedRole}
        selectedV2Character={selectedV2Character}
        onEnterEdit={() => { setScenarioEntryMode('edit'); }}
        onBack={backToRolesFromScenarios}
      />
    );
  }

  if (level === 'roles') {
    return (
      <RolesLevel
        creatorId={creator!.id}
        characters={characters}
        roles={roles}
        loading={loading}
        error={error}
        onNavigateToScenarios={navigateToScenarios}
        onRefresh={() => { setRefreshKey(k => k + 1); loadRoleImageProductions(); }}
        onRoleImageDone={onRoleImageDone}
        studioTab={studioTab}
        onTabChange={handleTabChange}
        selectedV2Character={selectedV2Character}
        devMode={devMode}
        devModeLoading={devModeLoading}
        canToggleDevMode={canToggleDevMode}
        onToggleDevMode={handleToggleDevMode}
        onBack={onBack}
        isChildCreator={isChildCreator}
        roleImageProductions={roleImageProductions}
        childCreatorMode={childCreatorMode}
        childCreatorModeLoading={childCreatorModeLoading}
        onToggleChildCreatorMode={handleToggleChildCreatorMode}
        checkAndDeduct={checkAndDeduct}
        canAffordImage={canAffordImage}
      />
    );
  }

  if (level === 'scenarios' && selectedRole) {
    return (
      <ScenariosLevel
        creatorId={creator!.id}
        role={selectedRole}
        scenarios={scenarios}
        loading={loading}
        error={error}
        onBack={backToRoles}
        onNavigateToScenes={navigateToScenes}
      />
    );
  }

  if (level === 'scenes' && selectedScenario && selectedRole) {
    return (
      <ScenesLevel
        creatorId={creator!.id}
        scenario={selectedScenario}
        scenes={scenes}
        loading={loading}
        error={error}
        onBack={backToScenarios}
        onEditScene={navigateToSceneEditor}
      />
    );
  }

  if (level === 'scene-editor' && selectedScenario && selectedRole) {
    return (
      <SceneEditorLevel
        creatorId={creator!.id}
        role={selectedRole}
        scenario={selectedScenario}
        scene={editingScene}
        characters={characters}
        selectedV2Character={selectedV2Character}
        onBack={backToScenes}
      />
    );
  }

  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// Roles Level
// ═══════════════════════════════════════════════════════════════════════════

function RolesLevel({
  creatorId, characters, roles, loading, error,
  onNavigateToScenarios, onRefresh, onRoleImageDone, studioTab, onTabChange, selectedV2Character,
  devMode, devModeLoading, canToggleDevMode, onToggleDevMode, onBack,
  isChildCreator, roleImageProductions,
  childCreatorMode, childCreatorModeLoading, onToggleChildCreatorMode,
  checkAndDeduct, canAffordImage,
}: {
  creatorId: string;
  characters: MasterAiCharacterRow[];
  roles: CharacterRoleRow[];
  loading: boolean;
  error: string | null;
  onNavigateToScenarios: (role: CharacterRoleRow) => void;
  onRefresh: () => void;
  onRoleImageDone?: () => void;
  studioTab: StudioTab;
  onTabChange: (tab: StudioTab) => void;
  selectedV2Character?: SelectedV2CharacterRef | null;
  devMode: boolean;
  devModeLoading: boolean;
  canToggleDevMode: boolean;
  onToggleDevMode: (next: boolean) => void;
  onBack?: () => void;
  isChildCreator: boolean;
  roleImageProductions: Map<string, RoleImageProductionRow>;
  childCreatorMode: boolean;
  childCreatorModeLoading: boolean;
  onToggleChildCreatorMode: (next: boolean) => void;
  checkAndDeduct: (amount: number, description: string) => Promise<boolean>;
  canAffordImage: boolean;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [introductionTitle, setIntroductionTitle] = useState('');
  const [introductionBody, setIntroductionBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null);
  const [editingRole, setEditingRole] = useState<CharacterRoleRow | null>(null);
  const [deletingRoleId, setDeletingRoleId] = useState<string | null>(null);
  // Child Creator mode toggle state — persisted per-creator via props.
  // Per-account persisted role selection (Child Creators)
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);

  // Load persisted role selection for Child Creators
  useEffect(() => {
    if (!isChildCreator) return;
    let cancelled = false;
    (async () => {
      try {
        const id = await loadSelectedRoleId();
        if (!cancelled) setSelectedRoleId(id);
      } catch { /* ignore */ }
    })();
    return () => { cancelled = true; };
  }, [isChildCreator]);

  // ── Dev OFF state: image-production for selected role ─────────────────────
  const [offGeneratingIds, setOffGeneratingIds] = useState<Set<string>>(new Set());
  const [offError, setOffError] = useState<string | null>(null);
  const [previewRole, setPreviewRole] = useState<CharacterRoleRow | null>(null);
  const [previewClosing, setPreviewClosing] = useState(false);
  const [offRoleStatuses, setOffRoleStatuses] = useState<Record<string, string>>({});
  const prevDoneMapRef = useRef<Set<string>>(new Set());
  const [justDoneIds, setJustDoneIds] = useState<Set<string>>(new Set());
  // Auto-preview on successful generation (Child Creator, Dev OFF): refs mirror
  // preview state for the timeout callback and track roles generated this session
  // so page-load "already done" roles never trigger the preview.
  const previewRoleRef = useRef<CharacterRoleRow | null>(null);
  const previewClosingRef = useRef(false);
  const autoPreviewTimerRef = useRef<number | null>(null);
  const generatedRoleIdsRef = useRef<Set<string>>(new Set());

  async function offHandleGenerate(role: CharacterRoleRow) {
    generatedRoleIdsRef.current.add(role.id);
    setOffGeneratingIds(prev => new Set(prev).add(role.id));
    setOffError(null);
    setOffRoleStatuses(prev => ({ ...prev, [role.id]: 'Processing' }));
    try {
      if (!await checkAndDeduct(IMAGE_COST, `Role image: ${role.name}`)) {
        throw new Error('Insufficient balance. Please add funds to your wallet.');
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-role-image-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          role_id: role.id,
          character_id: selectedV2Character?.id ?? null,
        }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error ?? `Generation failed (${response.status})`);
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error ?? 'Generation failed');
      setOffRoleStatuses(prev => ({ ...prev, [role.id]: 'Done' }));
      onRefresh();
      onRoleImageDone?.();
    } catch (e) {
      setOffError((e as Error).message);
      setOffRoleStatuses(prev => ({ ...prev, [role.id]: 'Failed' }));
    } finally {
      setOffGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(role.id);
        return next;
      });
    }
  }

  // Track roles that just transitioned to Done for one-shot glow
  useEffect(() => {
    const checkDone = (role: CharacterRoleRow): boolean => {
      if (isChildCreator) {
        const prod = roleImageProductions.get(role.id);
        if (prod?.role_image_url) return true;
        const s = (prod?.role_image_status ?? '').toLowerCase();
        return s === 'done' || s === 'ready' || s === 'completed';
      }
      if (role.role_image_url) return true;
      const s = (offRoleStatuses[role.id] ?? role.role_image_status ?? '').toLowerCase();
      return s === 'done' || s === 'ready' || s === 'completed';
    };
    const currentDone = new Set<string>();
    for (const role of roles) {
      if (checkDone(role)) currentDone.add(role.id);
    }
    const newlyDone = new Set<string>();
    for (const id of currentDone) {
      if (!prevDoneMapRef.current.has(id)) newlyDone.add(id);
    }
    prevDoneMapRef.current = currentDone;
    if (newlyDone.size > 0) {
      setJustDoneIds(newlyDone);
      const timer = setTimeout(() => setJustDoneIds(new Set()), 1300);
      if (isChildCreator) {
        const readyId = [...newlyDone].reverse().find(id =>
          generatedRoleIdsRef.current.has(id) && !!roleImageProductions.get(id)?.role_image_url
        );
        if (readyId && !previewRoleRef.current && !previewClosingRef.current) {
          const role = roles.find(r => r.id === readyId);
          if (role && autoPreviewTimerRef.current === null) {
            const url = roleImageProductions.get(readyId)?.role_image_url ?? null;
            autoPreviewTimerRef.current = window.setTimeout(() => {
              autoPreviewTimerRef.current = null;
              if (!previewRoleRef.current && !previewClosingRef.current) {
                setPreviewRole({ ...role, role_image_url: url });
              }
            }, 1400);
          }
        }
      }
      return () => clearTimeout(timer);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roles, roleImageProductions, offRoleStatuses, isChildCreator]);

  useEffect(() => {
    previewRoleRef.current = previewRole;
  }, [previewRole]);
  useEffect(() => {
    previewClosingRef.current = previewClosing;
  }, [previewClosing]);
  useEffect(() => () => {
    if (autoPreviewTimerRef.current !== null) {
      clearTimeout(autoPreviewTimerRef.current);
      autoPreviewTimerRef.current = null;
    }
  }, []);

  function roleStatusBadge(role: CharacterRoleRow, overrideStatus?: string): { label: string; className: string } {
    const status = overrideStatus ?? offRoleStatuses[role.id] ?? role.role_image_status ?? '';
    const s = status.toLowerCase();
    if (s === 'done' || s === 'ready' || s === 'completed') return { label: 'Done', className: 'text-success-400' };
    if (s === 'processing' || s === 'generating') return { label: 'Processing', className: 'text-warning-400' };
    if (s === 'failed' || s === 'error') return { label: 'Failed', className: 'text-danger-400' };
    return { label: 'Ready', className: 'text-surface-500' };
  }

  // ── Dev OFF: clean role selection screen (matches Character Studio V2 Dev OFF theme) ──
  // For Child Creators, devMode is always false (forced by readDevMode).
  // For Mother Creator, devMode is false when she toggles it off.
  if (!devMode || isChildCreator) {
    const bgUrl = selectedV2Character?.identity_image_url ?? null;
    // Dev View toggle — only for Mother Creator (not Child Creators)
    const devViewToggle = canToggleDevMode && !devModeLoading ? (
      <button
        onClick={() => onToggleDevMode(true)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-white/20 bg-black/40 backdrop-blur-md hover:border-white/40"
        title="Toggle Development View"
      >
        <ToggleLeft className="w-5 h-5 text-white/60" />
        <span className="text-white/70">Dev View</span>
      </button>
    ) : canToggleDevMode && devModeLoading ? (
      <Loader2 className="w-4 h-4 text-white/60 animate-spin" />
    ) : null;

    // Helper: get the image URL for a role, considering who's viewing
    function getRoleImageUrl(role: CharacterRoleRow): string | null {
      if (isChildCreator) {
        // Child Creator: use their own per-account production, never Mother's
        const prod = roleImageProductions.get(role.id);
        return prod?.role_image_url ?? null;
      }
      // Mother Creator (Dev OFF): use the shared role image
      return role.role_image_url;
    }

    // Helper: get role status for a role
    function getRoleStatus(role: CharacterRoleRow): string {
      if (isChildCreator) {
        const prod = roleImageProductions.get(role.id);
        return prod?.role_image_status ?? '';
      }
      return offRoleStatuses[role.id] ?? role.role_image_status ?? '';
    }

    // Helper: returns true if a role has a generated image or a "done" status, using only the creator's own media
    function isRoleDone(role: CharacterRoleRow): boolean {
      if (isChildCreator) {
        const prod = roleImageProductions.get(role.id);
        if (prod?.role_image_url) return true;
        const s = (prod?.role_image_status ?? '').toLowerCase();
        return s === 'done' || s === 'ready' || s === 'completed';
      }
      if (role.role_image_url) return true;
      const s = (offRoleStatuses[role.id] ?? role.role_image_status ?? '').toLowerCase();
      return s === 'done' || s === 'ready' || s === 'completed';
    }

    // Handle role selection for Child Creators (persisted per-account)
    async function handleRoleSelect(role: CharacterRoleRow) {
      if (!isChildCreator) return;
      try {
        await setSelectedRole(role.id);
        setSelectedRoleId(role.id);
      } catch { /* ignore */ }
    }

    return (
      <div className="fixed inset-0 overflow-hidden flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: isChildCreator ? 'calc(env(safe-area-inset-bottom) + 5rem)' : 'env(safe-area-inset-bottom)' }}>
        {/* Faded locked character identity background */}
        {bgUrl ? (
          <div className="absolute inset-0 pointer-events-none">
            <img
              src={bgUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ opacity: 0.35, filter: 'blur(3px)' }}
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-surface-950/60 to-surface-950/85" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-surface-950" />
        )}

        {/* Back button (top-left) — returns to Character Studio V2 Dev OFF */}
        {onBack && (
          <div className="absolute top-3 left-3 z-30">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-white/20 bg-black/40 backdrop-blur-md hover:border-white/40"
            >
              <ChevronLeft className="w-5 h-5 text-white/80" />
              <span className="text-white/80">Back</span>
            </button>
          </div>
        )}

        {/* Dev toggle (top-right, only for Mother Creator) */}
        {devViewToggle && !isChildCreator && (
          <div className="absolute top-3 right-3 z-30">
            {devViewToggle}
          </div>
        )}

        {/* Fixed header: title — never scrolls */}
        <div className="relative z-20 flex flex-col items-center pt-6 pb-4 px-6 flex-shrink-0"
             style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3rem)' }}>
          <h1 className="text-base font-semibold tracking-wide uppercase pb-4">
            <span style={{ color: '#F5F7FA' }}>Choose a </span>
            <span style={{ color: '#35D6A0' }}>Role</span>
          </h1>
          {/* Child Creator toggle — shown ONLY to Mother Creator (preview).
              Child Creators always have this ON and cannot change it. */}
          {canToggleDevMode && (
            <button
              onClick={() => {
                onToggleChildCreatorMode(!childCreatorMode);
                setExpandedRoleId(null);
              }}
              className="flex items-center gap-2.5 px-4 py-2 rounded-full backdrop-blur-md border transition-colors"
              style={{
                backgroundColor: childCreatorMode ? 'rgba(16,185,129,0.12)' : 'rgba(0,0,0,0.3)',
                borderColor: childCreatorMode ? 'rgba(16,185,129,0.35)' : 'rgba(255,255,255,0.1)',
              }}
            >
              <span
                className="text-xs font-semibold tracking-wide"
                style={{ color: childCreatorMode ? 'rgb(110,231,183)' : 'rgba(255,255,255,0.6)' }}
              >
                Child Creator
              </span>
              <span
                className="relative inline-flex items-center w-9 h-5 rounded-full transition-colors duration-200"
                style={{ backgroundColor: childCreatorMode ? 'rgb(16,185,129)' : 'rgba(255,255,255,0.15)' }}
              >
                <span
                  className="absolute w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200"
                  style={{ transform: childCreatorMode ? 'translateX(18px)' : 'translateX(2px)' }}
                />
              </span>
              <span
                className="text-[10px] font-bold tracking-wider uppercase"
                style={{ color: childCreatorMode ? 'rgb(110,231,183)' : 'rgba(255,255,255,0.4)' }}
              >
                {childCreatorMode ? 'ON' : 'OFF'}
              </span>
            </button>
          )}
        </div>

        {/* Scrollable role cards — below fixed header */}
        <div className="relative z-10 flex-1 overflow-y-auto px-6 pb-8"
             style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          <div className="w-full max-w-md mx-auto">
            {/* Role cards */}
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-7 h-7 text-surface-500 animate-spin" />
              </div>
            ) : roles.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Star className="w-7 h-7 text-surface-600 mb-3" />
                <p className="text-sm text-surface-400">No roles available</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {roles.map(role => {
                  const roleImgUrl = getRoleImageUrl(role);
                  const hasImage = !!roleImgUrl;
                  const isGenerating = offGeneratingIds.has(role.id);
                  const isExpanded = expandedRoleId === role.id;
                  const isSelected = isChildCreator && selectedRoleId === role.id;
                  const roleDone = isRoleDone(role);
                  const justBecameDone = justDoneIds.has(role.id);
                  return (
                    <RoleCard
                      key={role.id}
                      role={role}
                      roleImgUrl={roleImgUrl}
                      hasImage={hasImage}
                      isGenerating={isGenerating}
                      isExpanded={isExpanded}
                      isSelected={isSelected}
                      roleDone={roleDone}
                      justBecameDone={justBecameDone}
                      canAffordImage={canAffordImage}
                      isChildCreator={isChildCreator}
                      onToggle={() => {
                        setExpandedRoleId(isExpanded ? null : role.id);
                        if (isChildCreator) handleRoleSelect(role);
                      }}
                      onPreview={() => setPreviewRole({ ...role, role_image_url: roleImgUrl })}
                      onGenerate={() => offHandleGenerate(role)}
                      onNavigateToScenarios={() => onNavigateToScenarios(role)}
                      statusBadge={roleStatusBadge(role, getRoleStatus(role))}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Error display */}
          {offError && (
            <div className="flex items-center justify-center gap-2 px-4 py-2 mt-4 mx-auto max-w-md rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5" />{offError}
            </div>
          )}
        </div>

        {/* Important Note footer — shown in Child Creator mode (or Mother previewing it) */}
        {childCreatorMode && (
          <div className="relative z-20 flex-shrink-0 px-6 pt-2 pb-4"
               style={{ paddingBottom: '1rem' }}>
            <div className="w-full max-w-md mx-auto rounded-xl border border-warning-500/20 bg-warning-500/5 px-4 py-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-warning-400 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="text-[11px] font-bold tracking-wide text-warning-400 uppercase mb-1">Important Note</div>
                  <p className="text-[11px] font-light text-warning-200/80 leading-relaxed">
                    Your character identity is locked and will be used for all roles and scene generation. You can select and generate multiple different roles for the same character.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Preview modal */}
        {previewRole && (previewRole.role_image_url || (isChildCreator ? roleImageProductions.get(previewRole.id)?.role_image_url : null)) && (
          <div
            className={`fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 ${previewClosing ? 'preview-overlay-exit' : 'preview-overlay-enter'}`}
            onClick={() => {
              if (!previewClosing) {
                setPreviewClosing(true);
                setTimeout(() => { setPreviewRole(null); setPreviewClosing(false); }, 220);
              }
            }}
          >
            <div className={`relative max-w-lg w-full max-h-[88vh] overflow-y-auto ${previewClosing ? 'preview-image-exit' : 'preview-image-enter'}`} onClick={e => e.stopPropagation()}>
              <button
                onClick={() => {
                  if (!previewClosing) {
                    setPreviewClosing(true);
                    setTimeout(() => { setPreviewRole(null); setPreviewClosing(false); }, 220);
                  }
                }}
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-surface-800/90 border border-surface-700 flex items-center justify-center text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={previewRole.role_image_url ?? undefined}
                alt={previewRole.name}
                className="w-full rounded-xl border border-white/20"
              />
              <div className="mt-3 text-center">
                <div className="text-sm font-semibold text-white">{previewRole.name}</div>
                <div className="text-xs text-white/60 mt-0.5">
                  {previewRole.description?.trim() ? previewRole.description : 'No description'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ── Dev ON: full management UI (unchanged) ───────────────────────────

  async function handleSave() {
    if (!name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true);
    setFormError(null);
    const { error: err } = await supabase.from('character_roles').insert({
      creator_id: creatorId,
      character_id: null,
      name: name.trim(),
      description: description.trim(),
      system_prompt: systemPrompt.trim(),
      introduction_title: introductionTitle.trim() || null,
      introduction_body: introductionBody.trim() || null,
      sort_order: roles.length,
      gen_model: ATLAS_DEFAULTS.model,
      gen_ratio: ATLAS_DEFAULTS.size,
      gen_number_of_images: 1,
      gen_output_format: ATLAS_DEFAULTS.output_format,
      gen_thinking: ATLAS_DEFAULTS.thinking,
      gen_prompt_optimization_mode: ATLAS_DEFAULTS.prompt_optimization_mode,
    });
    setSaving(false);
    if (err) { setFormError(err.message); return; }
    setName(''); setDescription(''); setSystemPrompt(''); setIntroductionTitle(''); setIntroductionBody(''); setShowForm(false);
    onRefresh();
  }

  async function handleDelete(id: string) {
    const { error: err } = await supabase.from('character_roles').delete().eq('id', id);
    if (err) { setFormError(err.message); return; }
    onRefresh();
  }

  const charMap = new Map(characters.map(c => [c.id, c]));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-600/15 border border-primary-600/20 flex items-center justify-center">
            <Layers className="w-5 h-5 text-primary-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-surface-100">Role Studio</h2>
            <p className="text-xs text-surface-500">Roles → Scenarios → Scenes (inherits Character Studio)</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canToggleDevMode && !devModeLoading && (
            <button
              onClick={() => onToggleDevMode(false)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors border border-surface-700 hover:border-surface-600"
              title="Toggle Development View"
            >
              <ToggleRight className="w-5 h-5 text-accent-400" />
              <span className="text-accent-400">Dev View</span>
            </button>
          )}
          {canToggleDevMode && devModeLoading && (
            <Loader2 className="w-4 h-4 text-surface-500 animate-spin" />
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="btn-primary gap-1.5 text-sm"
          >
            <Plus className="w-4 h-4" />New Role
          </button>
        </div>
      </div>

      {/* Studio sub-tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
        {([
          { id: 'roles-drill', label: 'Roles', icon: Layers },
          { id: 'scenarios', label: 'Scenario Studio V2', icon: BoxSelect },
        ] as { id: StudioTab; label: string; icon: typeof Layers }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={[
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors flex-shrink-0 border',
              studioTab === id
                ? 'bg-primary-600/15 text-primary-400 border-primary-600/20'
                : 'text-surface-400 hover:text-surface-200 hover:bg-surface-800 border-transparent',
            ].join(' ')}
          >
            <Icon className="w-3.5 h-3.5" />{label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {showForm && (
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-surface-100">Create Role</h3>
          {formError && (
            <div className="flex items-center gap-2 text-xs text-danger-400">
              <AlertCircle className="w-3.5 h-3.5" />{formError}
            </div>
          )}
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Role Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Massage Girl" className="input-field text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Description (optional)</label>
            <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" className="input-field text-sm" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">System Prompt (LLM)</label>
            <textarea value={systemPrompt} onChange={e => setSystemPrompt(e.target.value)} placeholder="System prompt for this role's LLM chat personality…" rows={4} className="input-field text-sm font-mono resize-y" />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Test Chat Welcome Title (optional)</label>
            <input value={introductionTitle} onChange={e => setIntroductionTitle(e.target.value)} placeholder="e.g. Welcome to an Exclusive Massage Experience" className="input-field text-sm" />
            <p className="text-xs text-surface-600">Shown as the heading on the public Test Chat welcome screen before the first message.</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Test Chat Introduction Text (optional)</label>
            <textarea value={introductionBody} onChange={e => setIntroductionBody(e.target.value)} placeholder="Welcome paragraph shown to visitors before they send their first message…" rows={4} className="input-field text-sm resize-y" />
            <p className="text-xs text-surface-600">Shown below the welcome title. Leave both fields empty to use the default introduction.</p>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Character</label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-900/60 border border-surface-800 text-sm text-surface-400">
              <Star className="w-3.5 h-3.5 text-surface-500" />
              <span>No linked character — identity is applied automatically from your Character Studio V2 selection when generating a Role Image.</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}Save Role
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-surface-500 animate-spin" /></div>
      ) : roles.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Layers className="w-6 h-6 text-surface-600 mb-3" />
          <p className="text-sm text-surface-400">No roles yet</p>
          <p className="text-xs text-surface-600 mt-1">Create a role to start building scenarios and scenes.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {roles.map(role => {
            const char = charMap.get(role.character_id);
            const isExpanded = expandedRoleId === role.id;
            return (
              <div key={role.id} className="space-y-2">
                <div className="card flex items-center gap-4 p-3 hover:border-primary-600/30 transition-colors group">
                  <div className="w-12 h-12 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {role.role_image_url ? (
                      <img src={role.role_image_url} alt="" className="w-full h-full object-cover" />
                    ) : char?.identity_image_url ? (
                      <img src={char.identity_image_url} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-surface-600" />
                    )}
                  </div>
                  <button onClick={() => onNavigateToScenarios(role)} className="flex-1 min-w-0 text-left">
                    <div className="text-sm font-medium text-surface-100 truncate">{role.name}</div>
                    <div className="text-xs text-surface-500 truncate">
                      {selectedV2Character ? `Character: ${selectedV2Character.name}` : char ? `Character: ${char.name}` : 'No character'} {role.description ? ` · ${role.description}` : ''}
                    </div>
                  </button>
                  <button
                    onClick={() => setExpandedRoleId(isExpanded ? null : role.id)}
                    className="p-2 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-600/10 transition-colors"
                    title="Role Image Production"
                  >
                    <Sparkles className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setEditingRole(role)}
                    className="p-2 rounded-lg text-surface-400 hover:text-primary-400 hover:bg-primary-600/10 transition-colors"
                    title="Edit Role"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => setDeletingRoleId(role.id)} className="p-2 rounded-lg text-surface-500 hover:text-danger-400 hover:bg-danger-500/10 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                {isExpanded && (
                  <RoleImageProduction
                    key={role.id}
                    role={role}
                    creatorId={creatorId}
                    linkedCharName={selectedV2Character?.name ?? char?.name ?? 'No character selected'}
                    identityAssetId={selectedV2Character?.identity_asset_id ?? char?.identity_asset_id ?? null}
                    selectedCharacterId={selectedV2Character?.id ?? null}
                    onUpdate={onRefresh}
                    onRoleImageDone={onRoleImageDone}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}

      {editingRole && (
        <EditRoleModal
          role={editingRole}
          onClose={() => setEditingRole(null)}
          onSaved={() => { setEditingRole(null); onRefresh(); }}
        />
      )}

      {deletingRoleId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setDeletingRoleId(null)}>
          <div className="card w-full max-w-sm space-y-4 p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2">
              <Trash2 className="w-4 h-4 text-danger-400" />
              <h3 className="text-sm font-semibold text-surface-100">Delete Role</h3>
            </div>
            <p className="text-sm text-surface-400">Are you sure you want to delete this role?</p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setDeletingRoleId(null)}
                className="btn-secondary text-sm gap-1.5"
              >
                Cancel
              </button>
              <button
                onClick={() => { const id = deletingRoleId; setDeletingRoleId(null); handleDelete(id); }}
                className="btn-primary text-sm gap-1.5 bg-danger-600 hover:bg-danger-500 border-danger-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Edit Role Modal — edit name, description, system_prompt
// ═══════════════════════════════════════════════════════════════════════════

function EditRoleModal({
  role, onClose, onSaved,
}: {
  role: CharacterRoleRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(role.name);
  const [description, setDescription] = useState(role.description);
  const [systemPrompt, setSystemPrompt] = useState(role.system_prompt ?? '');
  const legacyIntro = ROLE_INTROS[role.id] ?? null;
  const [introductionTitle, setIntroductionTitle] = useState(role.introduction_title ?? legacyIntro?.title ?? '');
  const [introductionBody, setIntroductionBody] = useState(role.introduction_body ?? legacyIntro?.body ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) { setError('Name is required.'); return; }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('character_roles').update({
      name: name.trim(),
      description: description.trim(),
      system_prompt: systemPrompt.trim(),
      introduction_title: introductionTitle.trim() || null,
      introduction_body: introductionBody.trim() || null,
      updated_at: new Date().toISOString(),
    }).eq('id', role.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="card w-full max-w-lg space-y-4 p-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between pb-2 border-b border-surface-800">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4 text-primary-400" />
            <h3 className="text-sm font-semibold text-surface-100">Edit Role</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-xs text-danger-400">
            <AlertCircle className="w-3.5 h-3.5" />{error}
          </div>
        )}

        <div className="space-y-1">
          <label className="text-xs font-medium text-surface-400">Role Name</label>
          <input value={name} onChange={e => setName(e.target.value)} className="input-field text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-surface-400">Description (optional)</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description" className="input-field text-sm" />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-surface-400">System Prompt (LLM)</label>
          <textarea
            value={systemPrompt}
            onChange={e => setSystemPrompt(e.target.value)}
            placeholder="System prompt for this role's LLM chat personality…"
            rows={6}
            className="input-field text-sm font-mono resize-y"
          />
          <p className="text-xs text-surface-600">This system prompt will be used when chatting with this role through the LLM. Leave empty for no system prompt.</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-surface-400">Test Chat Welcome Title (optional)</label>
          <input value={introductionTitle} onChange={e => setIntroductionTitle(e.target.value)} placeholder="e.g. Welcome to an Exclusive Massage Experience" className="input-field text-sm" />
          <p className="text-xs text-surface-600">Shown as the heading on the public Test Chat welcome screen before the first message.</p>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-surface-400">Test Chat Introduction Text (optional)</label>
          <textarea
            value={introductionBody}
            onChange={e => setIntroductionBody(e.target.value)}
            placeholder="Welcome paragraph shown to visitors before they send their first message…"
            rows={4}
            className="input-field text-sm resize-y"
          />
          <p className="text-xs text-surface-600">Shown below the welcome title. Leave both fields empty to use the default introduction.</p>
        </div>

        <div className="flex gap-2 pt-2 border-t border-surface-800">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            Update Role
          </button>
          <button onClick={onClose} className="btn-secondary text-sm gap-1.5">
            <X className="w-4 h-4" />Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
// ═══════════════════════════════════════════════════════════════════════════

function RoleImageProduction({
  role, creatorId, linkedCharName, identityAssetId, selectedCharacterId, onUpdate, onRoleImageDone,
}: {
  role: CharacterRoleRow;
  creatorId: string;
  linkedCharName: string;
  identityAssetId: string | null;
  selectedCharacterId: string | null;
  onUpdate: () => void;
  onRoleImageDone?: () => void;
}) {
  const [prompt, setPrompt] = useState(role.role_prompt ?? '');
  const [genTool] = useState(role.gen_tool || 'image_editor');
  const [genConfig, setGenConfig] = useState<GenerationConfigValues>({
    model: role.gen_model || 'FLUX_KLEIN_NSFW',
    ratio: role.gen_ratio || '9:16',
    batch_size: String(role.gen_number_of_images || 1),
  });
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [hfConfig, setHfConfig] = useState<HuggingFaceConfigValues>(HF_DEFAULTS);
  const [atlasConfig, setAtlasConfig] = useState<AtlasCloudConfigValues>({
    model: role.gen_model || ATLAS_DEFAULTS.model,
    size: role.gen_ratio || ATLAS_DEFAULTS.size,
    output_format: role.gen_output_format || ATLAS_DEFAULTS.output_format,
    thinking: role.gen_thinking || ATLAS_DEFAULTS.thinking,
    prompt_optimization_mode: role.gen_prompt_optimization_mode || ATLAS_DEFAULTS.prompt_optimization_mode,
  });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentRole, setCurrentRole] = useState(role);

  // Fetch the active image provider via SECURITY DEFINER RPC.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await supabase.rpc('get_active_image_provider');
        if (!cancelled && data && typeof data === 'string') setActiveProvider(data);
      } catch { if (!cancelled) setActiveProvider('Atlas Cloud'); }
    })();
    return () => { cancelled = true; };
  }, []);

  const isAtlasCloud = (activeProvider ?? '').toLowerCase().includes('atlas');
  const providerLoading = activeProvider === null;

  // Detect edits — any change from saved values makes Generate disabled until Save
  useEffect(() => {
    if (providerLoading) { setIsDirty(false); return; }
    const dirty =
      prompt !== (role.role_prompt ?? '') ||
      genConfig.model !== (role.gen_model || 'FLUX_KLEIN_NSFW') ||
      genConfig.ratio !== (role.gen_ratio || '9:16') ||
      genConfig.batch_size !== String(role.gen_number_of_images || 1) ||
      (isAtlasCloud && (
        atlasConfig.model !== (role.gen_model || ATLAS_DEFAULTS.model) ||
        atlasConfig.size !== (role.gen_ratio || ATLAS_DEFAULTS.size) ||
        atlasConfig.output_format !== (role.gen_output_format || ATLAS_DEFAULTS.output_format) ||
        atlasConfig.thinking !== (role.gen_thinking || ATLAS_DEFAULTS.thinking) ||
        atlasConfig.prompt_optimization_mode !== (role.gen_prompt_optimization_mode || ATLAS_DEFAULTS.prompt_optimization_mode)
      ));
    setIsDirty(dirty);
  }, [prompt, genConfig, role, isAtlasCloud, atlasConfig, providerLoading]);

  // Build the read-only final request JSON
  const isHuggingFace = (activeProvider ?? '').toLowerCase().includes('hugging');
  const finalRequest = useMemo(() => {
    if (providerLoading) return 'Loading active provider…';
    if (isAtlasCloud) {
      return JSON.stringify({
        model: atlasConfig.model,
        prompt: prompt || '',
        images: [identityAssetId ?? ''],
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
      tool: genTool,
      input: {
        image_assets: [identityAssetId ?? ''],
        prompt: prompt || '',
        model: genConfig.model,
        ratio: genConfig.ratio,
        number_of_images: parseInt(genConfig.batch_size, 10) || 1,
      },
    }, null, 2);
  }, [genTool, identityAssetId, prompt, genConfig, hfConfig, atlasConfig, isHuggingFace, isAtlasCloud, providerLoading]);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    const updateData: Record<string, unknown> = {
      role_prompt: prompt,
      gen_tool: genTool,
      gen_model: isAtlasCloud ? atlasConfig.model : genConfig.model,
      gen_ratio: isAtlasCloud ? atlasConfig.size : genConfig.ratio,
      gen_number_of_images: isAtlasCloud ? 1 : (parseInt(genConfig.batch_size, 10) || 1),
      updated_at: new Date().toISOString(),
    };
    if (isAtlasCloud) {
      updateData.gen_output_format = atlasConfig.output_format;
      updateData.gen_thinking = atlasConfig.thinking;
      updateData.gen_prompt_optimization_mode = atlasConfig.prompt_optimization_mode;
    }
    const { error: err } = await supabase.from('character_roles').update(updateData).eq('id', role.id);
    setIsSaving(false);
    if (err) { setError(err.message); return; }
    setCurrentRole(prev => ({ ...prev, ...updateData } as CharacterRoleRow));
    setIsDirty(false);
    onUpdate();
  }

  async function handleGenerate() {
    if (isDirty) return;
    setIsGenerating(true);
    setError(null);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-role-image-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({
          role_id: role.id,
          character_id: selectedCharacterId,
          model: isAtlasCloud ? atlasConfig.model : genConfig.model,
          ratio: isAtlasCloud ? atlasConfig.size : genConfig.ratio,
          number_of_images: isAtlasCloud ? 1 : (parseInt(genConfig.batch_size, 10) || 1),
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
      setCurrentRole(prev => ({
        ...prev,
        role_image_url: data.image_url,
        role_image_asset_id: data.asset_id,
        role_image_status: 'Ready',
      }));
      onUpdate();
      onRoleImageDone?.();
    } catch (e) {
      setError((e as Error).message);
      setCurrentRole(prev => ({ ...prev, role_image_status: 'Failed' }));
    } finally {
      setIsGenerating(false);
    }
  }

  const status = currentRole.role_image_status || '';
  const statusColor = status === 'Ready' ? 'text-success-400' : status === 'Processing' ? 'text-warning-400' : status === 'Failed' ? 'text-danger-400' : 'text-surface-500';

  return (
    <div className="card space-y-5 p-4 border-primary-600/20">
      <div className="flex items-center gap-2 pb-2 border-b border-surface-800">
        <Sparkles className="w-4 h-4 text-primary-400" />
        <span className="text-sm font-semibold text-surface-100">Role Image Production</span>
        <span className="text-xs text-surface-500">— {currentRole.name}</span>
      </div>

      {/* Linked character — fixed, read-only */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Linked Character</label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-600/10 border border-accent-600/30 text-sm text-accent-300">
          <Lock className="w-3.5 h-3.5 text-accent-400" />
          <span className="font-medium">{linkedCharName}</span>
          <span className="text-xs text-accent-400/70">(fixed — from Character Studio V2)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-900/60 border border-surface-800 text-xs text-surface-400">
          <Lock className="w-3 h-3 text-surface-600" />
          <span className="text-surface-600 min-w-[110px]">Identity Asset ID</span>
          <span className="font-mono break-all text-surface-400">{identityAssetId ?? '—'}</span>
        </div>
      </div>

      {/* 1) Editable Prompt Box */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Role Prompt</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Clothing, environment, mood, face-lock style text… (not full sex scene action)"
          rows={4}
          className="input-field text-sm resize-y"
        />
        <p className="text-xs text-surface-600">Describe the role scene: clothing, environment, mood, and face-lock style. This is not a full sex scene action prompt.</p>
      </div>

      {/* 2) Generation Configuration — provider-aware */}
      {providerLoading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-surface-500">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading generation configuration…
        </div>
      ) : (
        <GenerationConfigEditor
          values={genConfig}
          onChange={setGenConfig}
          title="Generation Configuration"
          providerName={activeProvider!}
          hfValues={hfConfig}
          onChangeHf={setHfConfig}
          atlasValues={atlasConfig}
          onChangeAtlas={setAtlasConfig}
        />
      )}
      <p className="text-xs text-surface-600 -mt-2">image_assets are automatically set from the linked V2 character's identity_asset_id — not editable.</p>

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
        <button onClick={handleSave} disabled={isSaving || providerLoading} className="btn-primary text-sm gap-1.5">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Save
        </button>
        <button
          onClick={handleGenerate}
          disabled={isDirty || isGenerating || isSaving || !prompt.trim() || providerLoading}
          className="btn-secondary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          title={isDirty ? 'Save changes before generating' : undefined}
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          Generate
        </button>
        {isDirty && <span className="text-xs text-warning-400 self-center">Unsaved changes — Save before generating</span>}
      </div>

      {/* 5) Preview after Generate */}
      {currentRole.role_image_url && (
        <div className="space-y-2 pt-3 border-t border-surface-800">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5 text-surface-500" />
            <span className="text-xs font-medium text-surface-400">Preview</span>
            <span className={`text-xs font-medium ml-auto ${statusColor}`}>
              Status: {status || '—'}
            </span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <img
              src={currentRole.role_image_url}
              alt="Generated role image"
              className="w-full sm:w-48 rounded-lg border border-surface-700 object-cover"
            />
            <div className="flex-1 space-y-1.5 text-xs">
              <div className="flex gap-2">
                <span className="text-surface-500 min-w-[80px]">Asset ID</span>
                <span className="font-mono break-all text-surface-300">{currentRole.role_image_asset_id ?? '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-surface-500 min-w-[80px]">Image URL</span>
                <span className="font-mono break-all text-surface-300">{currentRole.role_image_url}</span>
              </div>
              <a
                href={currentRole.role_image_url}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600/15 text-primary-400 border border-primary-600/20 text-xs hover:bg-primary-600/25 transition-colors w-fit"
              >
                <Download className="w-3.5 h-3.5" />Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Scenarios Level
// ═══════════════════════════════════════════════════════════════════════════

function ScenariosLevel({
  creatorId, role, scenarios, loading, error,
  onBack, onNavigateToScenes,
}: {
  creatorId: string;
  role: CharacterRoleRow;
  scenarios: RoleScenarioRow[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onNavigateToScenes: (scenario: RoleScenarioRow) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSave() {
    if (!name.trim()) { setFormError('Name is required.'); return; }
    setSaving(true);
    setFormError(null);
    const { data, error: err } = await supabase.from('role_scenarios').insert({
      creator_id: creatorId,
      role_id: role.id,
      name: name.trim(),
      sort_order: scenarios.length,
    }).select().single();
    setSaving(false);
    if (err) { setFormError(err.message); return; }
    setName(''); setShowForm(false);
    if (data) onNavigateToScenes(data as RoleScenarioRow);
  }

  async function handleDelete(id: string) {
    await supabase.from('role_scenarios').delete().eq('id', id);
    onBack();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-surface-100">{role.name}</h2>
          <p className="text-xs text-surface-500">Scenario Studio V2</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary gap-1.5 text-sm">
          <Plus className="w-4 h-4" />New Scenario
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {showForm && (
        <div className="card space-y-3">
          <h3 className="text-sm font-semibold text-surface-100">Create Scenario</h3>
          {formError && <div className="flex items-center gap-2 text-xs text-danger-400"><AlertCircle className="w-3.5 h-3.5" />{formError}</div>}
          <div className="space-y-1">
            <label className="text-xs font-medium text-surface-400">Scenario Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Welcome & Flirting" className="input-field text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSave} disabled={saving} className="btn-primary text-sm gap-1.5">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}Save
            </button>
            <button onClick={() => setShowForm(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-surface-500 animate-spin" /></div>
      ) : scenarios.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Film className="w-6 h-6 text-surface-600 mb-3" />
          <p className="text-sm text-surface-400">No scenarios yet</p>
          <p className="text-xs text-surface-600 mt-1">Create a scenario to start adding scenes.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {scenarios.map(s => (
            <div key={s.id} className="card flex items-center gap-4 p-3 hover:border-primary-600/30 transition-colors group">
              <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-mono text-surface-400">{s.sort_order + 1}</span>
              </div>
              <button onClick={() => onNavigateToScenes(s)} className="flex-1 min-w-0 text-left">
                <div className="text-sm font-medium text-surface-100 truncate">{s.name}</div>
                <div className="text-xs text-surface-500 truncate">
                  {s.default_clothing || s.default_environment || s.default_lighting ? 'Has defaults' : 'No defaults'}
                </div>
              </button>
              <button onClick={() => handleDelete(s.id)} className="p-2 rounded-lg text-surface-500 hover:text-danger-400 hover:bg-danger-500/10 transition-colors">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Scenes Level
// ═══════════════════════════════════════════════════════════════════════════

function ScenesLevel({
  creatorId, scenario, scenes, loading, error,
  onBack, onEditScene,
}: {
  creatorId: string;
  scenario: RoleScenarioRow;
  scenes: ScenarioSceneRow[];
  loading: boolean;
  error: string | null;
  onBack: () => void;
  onEditScene: (scene: ScenarioSceneRow | null) => void;
}) {
  async function handleDelete(id: string) {
    await supabase.from('scenario_scenes').delete().eq('id', id);
    onBack();
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-surface-100">{scenario.name}</h2>
          <p className="text-xs text-surface-500">Scenes</p>
        </div>
        <button onClick={() => onEditScene(null)} className="btn-primary gap-1.5 text-sm">
          <Plus className="w-4 h-4" />New Scene
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="w-5 h-5 text-surface-500 animate-spin" /></div>
      ) : scenes.length === 0 ? (
        <div className="card flex flex-col items-center justify-center py-16 text-center">
          <Clapperboard className="w-6 h-6 text-surface-600 mb-3" />
          <p className="text-sm text-surface-400">No scenes yet</p>
          <p className="text-xs text-surface-600 mt-1">Create a scene to define structured fields and overrides.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {scenes.map(s => {
            const hasOverrides = s.prompt_overrides && Object.keys(s.prompt_overrides).length > 0;
            const hasGenOverrides = s.override_gen_model || s.override_gen_ratio || s.override_gen_batch_size;
            return (
              <div key={s.id} className="card flex items-center gap-4 p-3 hover:border-primary-600/30 transition-colors group">
                <div className="w-10 h-10 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-mono text-surface-400">{s.sort_order + 1}</span>
                </div>
                <button onClick={() => onEditScene(s)} className="flex-1 min-w-0 text-left">
                  <div className="text-sm font-medium text-surface-100 truncate">{s.name || `Scene ${s.sort_order + 1}`}</div>
                  <div className="text-xs text-surface-500 truncate">
                    {s.face_lock ? 'Face locked' : 'Face unlocked'}
                    {hasOverrides ? ' · Has prompt overrides' : ''}
                    {hasGenOverrides ? ' · Has gen overrides' : ''}
                    {!hasOverrides && !hasGenOverrides ? ' · Inherits all from character' : ''}
                  </div>
                </button>
                <button onClick={() => onEditScene(s)} className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">
                  <Pencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(s.id)} className="p-2 rounded-lg text-surface-500 hover:text-danger-400 hover:bg-danger-500/10 transition-colors">
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// Scene Editor Level — reuses Character Studio components
// ═══════════════════════════════════════════════════════════════════════════

function SceneEditorLevel({
  creatorId, role, scenario, scene, characters, selectedV2Character, onBack,
}: {
  creatorId: string;
  role: CharacterRoleRow;
  scenario: RoleScenarioRow;
  scene: ScenarioSceneRow | null;
  characters: MasterAiCharacterRow[];
  selectedV2Character?: SelectedV2CharacterRef | null;
  onBack: () => void;
}) {
  const char = characters.find(c => c.id === role.character_id);

  // When a V2 character is Selected in Character Studio V2, override the
  // identity fields with the Selected character's identity. This ensures
  // Role Studio uses only the Selected character's identity_asset_id and
  // identity_image_url for generation — not any other character's.
  const effectiveChar = (selectedV2Character && char?.character_source === 'character_studio_v2' && char.id === selectedV2Character.id)
    ? {
        ...char,
        identity_image_url: selectedV2Character.identity_image_url,
        identity_asset_id: selectedV2Character.identity_asset_id,
      }
    : char;
  const isEditing = !!scene;

  const [name, setName] = useState(scene?.name ?? '');
  const [faceLock, setFaceLock] = useState(scene?.face_lock ?? true);
  const [faceLockValue, setFaceLockValue] = useState(scene?.face_lock_value ?? '');

  // Scene-specific schema — starts EMPTY, never inherits character.prompt_schema
  const [sceneSchema, setSceneSchema] = useState<UniversalPromptSchema>(() => {
    if (effectiveChar && scene?.prompt_overrides) {
      return { ...createEmptyPromptSchema(), ...scene.prompt_overrides };
    }
    return createEmptyPromptSchema();
  });

  // Override toggle for generation config
  const [overrideGen, setOverrideGen] = useState(false);
  const [genConfig, setGenConfig] = useState<GenerationConfigValues>({
    model: 'FLUX_KLEIN_NSFW',
    ratio: '9:16',
    batch_size: '1',
  });

  // Active image provider — determines which generation config fields are shown.
  // Fetched from provider_configurations (Super Admin source of truth).
  const [activeProvider, setActiveProvider] = useState<string>('ZenCreator');

  // Hugging Face config — kept SEPARATE from ZenCreator config so switching
  // providers never overwrites the other provider's stored values.
  const [hfConfig, setHfConfig] = useState<HuggingFaceConfigValues>({ ...HF_DEFAULTS });

  const [promptPreview, setPromptPreview] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Fetch the active image provider on mount via SECURITY DEFINER RPC.
  // The provider_configurations table is RLS-locked to super admins, so we
  // call get_active_image_provider() which returns only the provider_name.
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

  // Initialize gen config from character + scene overrides
  useEffect(() => {
    if (!effectiveChar) return;
    if (scene && (scene.override_gen_model || scene.override_gen_ratio || scene.override_gen_batch_size)) {
      setOverrideGen(true);
      setGenConfig({
        model: scene.override_gen_model ?? effectiveChar.saved_prompt?.input.model ?? 'FLUX_KLEIN_NSFW',
        ratio: scene.override_gen_ratio ?? effectiveChar.saved_prompt?.input.ratio ?? '9:16',
        batch_size: String(scene.override_gen_batch_size ?? effectiveChar.saved_prompt?.input.batch_size ?? 1),
      });
    } else if (effectiveChar.saved_prompt) {
      setGenConfig({
        model: effectiveChar.saved_prompt.input.model,
        ratio: effectiveChar.saved_prompt.input.ratio,
        batch_size: String(effectiveChar.saved_prompt.input.batch_size),
      });
    }
  }, [effectiveChar, scene]);

  // Initialize scene schema from scene overrides only — NEVER from character schema
  useEffect(() => {
    if (scene?.prompt_overrides) {
      setSceneSchema({ ...createEmptyPromptSchema(), ...scene.prompt_overrides });
    } else {
      setSceneSchema(createEmptyPromptSchema());
    }
  }, [scene]);

  // Live prompt preview — uses saved character prompt + scene fields only
  useEffect(() => {
    if (!effectiveChar) { setPromptPreview(''); return; }
    const sceneFields = extractSceneFieldsFromSchema(sceneSchema);
    const result = buildScenePrompt({
      savedPrompt: effectiveChar.saved_prompt?.input?.positive_prompt ?? null,
      sceneFields,
      faceLockValue,
    });
    setPromptPreview(result.positivePrompt);
  }, [effectiveChar, sceneSchema, faceLockValue]);

  // Handle Generate Prompt — builds the final prompt JSON
  // Scenes use ZenCreator image_editor tool (not by_prompt)
  // Payload includes the character identity image as an image asset.
  function handleGeneratePrompt() {
    if (!effectiveChar) return;
    const sceneFields = extractSceneFieldsFromSchema(sceneSchema);
    const result = buildScenePrompt({
      savedPrompt: effectiveChar.saved_prompt?.input?.positive_prompt ?? null,
      sceneFields,
      faceLockValue,
    });
    const batchSize = Math.max(1, parseInt(genConfig.batch_size, 10) || 1);
    const identityImage = effectiveChar.identity_image_url ?? '';
    const identityAssetId = effectiveChar.identity_asset_id ?? effectiveChar.identity_image_path ?? '';
    const request = {
      tool: 'image_editor',
      input: {
        image_assets: identityImage ? [identityImage] : [],
        identity_asset_id: identityAssetId || null,
        prompt: result.positivePrompt,
        model: genConfig.model,
        ratio: genConfig.ratio,
        batch_size: batchSize,
      },
    };
    setPromptPreview(JSON.stringify(request, null, 2));
  }

  async function handleSave() {
    if (!effectiveChar) { setFormError('No linked character.'); return; }
    setSaving(true);
    setFormError(null);

    // Extract scene-specific overrides — only non-empty fields
    const overrides: Partial<UniversalPromptSchema> = {};
    for (const field of OVERRIDABLE_FIELDS) {
      if (sceneSchema[field].trim()) {
        overrides[field] = sceneSchema[field];
      }
    }

    const payload = {
      creator_id: creatorId,
      scenario_id: scenario.id,
      name: name.trim(),
      sort_order: scene?.sort_order ?? 0,
      face_lock: faceLock,
      face_lock_value: faceLockValue || null,
      // Clear the old individual field columns — overrides are now in prompt_overrides
      clothing: '', pose: '', expression: '', action: '', partner: '',
      camera_angle: '', environment: '', lighting: '', atmosphere: '', extra_details: '',
      prompt_overrides: Object.keys(overrides).length > 0 ? overrides : null,
      override_gen_model: overrideGen ? genConfig.model || null : null,
      override_gen_ratio: overrideGen ? genConfig.ratio || null : null,
      override_gen_batch_size: overrideGen ? parseInt(genConfig.batch_size, 10) || null : null,
    };

    let err;
    if (isEditing && scene) {
      ({ error: err } = await supabase.from('scenario_scenes').update(payload).eq('id', scene.id));
    } else {
      ({ error: err } = await supabase.from('scenario_scenes').insert(payload));
    }
    setSaving(false);
    if (err) { setFormError(err.message); return; }
    onBack();
  }

  if (!effectiveChar) {
    return (
      <div className="space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-lg font-semibold text-surface-100">Character Not Found</h2>
            <p className="text-xs text-surface-500">The linked character could not be loaded.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Breadcrumb */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-surface-100">{isEditing ? 'Edit Scene' : 'New Scene'}</h2>
          <p className="text-xs text-surface-500">{role.name} → {scenario.name}</p>
        </div>
      </div>

      {formError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4" />{formError}
        </div>
      )}

      {/* Character Identity reference — inherited from Character Studio */}
      <div className="card flex items-center gap-3 p-3">
        {effectiveChar.identity_image_url && (
          <img src={effectiveChar.identity_image_url} alt="" className="w-12 h-12 rounded-lg object-cover border border-surface-700" />
        )}
        <div className="text-xs text-surface-500 space-y-0.5">
          <div className="flex items-center gap-1 text-accent-400"><CheckCircle className="w-3 h-3" />Character Identity: {effectiveChar.name}</div>
          <div>Identity, prompt schema, saved prompt, and generation config are inherited from Character Studio.</div>
        </div>
      </div>

      <div className="card space-y-6">
        {/* Scene name */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-surface-400">Scene Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Door Welcome" className="input-field text-sm" />
        </div>

        {/* Face Lock — dropdown with + Add New (reusable, model-specific instructions) */}
        <div className="space-y-1">
          <PromptFieldDropdown
            fieldName="face_lock"
            label="Face Lock Instruction"
            placeholder="Select a face lock instruction…"
            value={faceLockValue}
            creatorId={creatorId}
            onChange={setFaceLockValue}
          />
          <p className="text-xs text-surface-600">Different AI models require different face-lock instructions. Create your own reusable instructions with + Add New.</p>
        </div>

        {/* ── Universal Prompt Schema — REUSED from Character Studio ── */}
        {/* Identity fields are HIDDEN — they belong exclusively to Character Studio. */}
        {/* Only scene-specific fields are shown. */}
        <UniversalPromptSchemaEditor
          schema={sceneSchema}
          creatorId={creatorId}
          onChange={setSceneSchema}
          title="Scene Fields"
          badge="Scene-specific"
          hiddenFields={IDENTITY_FIELDS}
        />

        {/* ── Generation Configuration — REUSED from Character Studio ── */}
        <div className="space-y-3">
          <GenerationConfigEditor
            values={genConfig}
            onChange={setGenConfig}
            readOnly={!overrideGen}
            title="Generation Configuration"
            badge={overrideGen ? 'Override' : 'Inherited from Character'}
            providerName={activeProvider}
            hfValues={hfConfig}
            onChangeHf={setHfConfig}
          />
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={overrideGen}
              onChange={e => {
                setOverrideGen(e.target.checked);
                if (!e.target.checked && effectiveChar.saved_prompt) {
                  setGenConfig({
                    model: effectiveChar.saved_prompt.input.model,
                    ratio: effectiveChar.saved_prompt.input.ratio,
                    batch_size: String(effectiveChar.saved_prompt.input.batch_size),
                  });
                }
              }}
              className="w-4 h-4 rounded border-surface-600 bg-surface-800 text-primary-600 focus:ring-primary-500"
            />
            <span className="text-sm text-surface-300">Override Generation Settings</span>
            <span className="text-xs text-surface-600">— override only when intentionally required</span>
          </label>
        </div>

        {/* ── Prompt Generator — REUSED from Character Studio ── */}
        <PromptGeneratorPanel
          promptPreview={promptPreview}
          onGenerate={handleGeneratePrompt}
          savedPrompt={effectiveChar.saved_prompt ?? null}
          title="Prompt Generator (Character Identity + Scene Fields)"
          savedLabel="Character prompt saved in Character Studio"
        />

        {/* Save */}
        <div className="flex gap-2 pt-4 border-t border-surface-800">
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm gap-1.5">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
            {isEditing ? 'Update Scene' : 'Save Scene'}
          </button>
          <button onClick={onBack} className="btn-secondary text-sm gap-1.5">
            <X className="w-4 h-4" />Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Dev Scenarios View (Dev ON only) ──────────────────────────────────────────

interface DevScene {
  id: string;
  label: string;
  description?: string | null;
  scenario_id: string;
  scene_image_url?: string | null;
  scene_image_status?: string | null;
  production_id?: string | null;
  video_url?: string | null;
  video_status?: string | null;
}

const FIXED_SCENARIOS = [
  { id: 'scenario-1', title: 'Scenario 1' },
  { id: 'scenario-2', title: 'Scenario 2' },
  { id: 'scenario-3', title: 'Scenario 3' },
];

function ReadOnlyScenariosOverview({
  creatorId,
  roles,
  selectedRole,
  selectedV2Character,
  onEnterEdit,
  onBack,
}: {
  creatorId: string;
  roles: CharacterRoleRow[];
  selectedRole: CharacterRoleRow | null;
  selectedV2Character?: SelectedV2CharacterRef | null;
  onEnterEdit: () => void;
  onBack: () => void;
}) {
  const [overviewRoleId, setOverviewRoleId] = useState<string>(selectedRole?.id ?? '');
  const [scenesByScenario, setScenesByScenario] = useState<Record<string, DevScene[]>>({
    'scenario-1': [],
    'scenario-2': [],
    'scenario-3': [],
  });
  const [loading, setLoading] = useState(false);

  const activeRole = roles.find(r => r.id === overviewRoleId) ?? null;

  const loadScenes = useCallback(async () => {
    if (!creatorId || !activeRole) return;
    setLoading(true);
    const { data, error: loadErr } = await supabase
      .from('scene_image_productions')
      .select('id, scene_id, scene_label, description, scenario_id, scene_image_url, scene_image_status')
      .eq('creator_id', creatorId)
      .eq('role_id', activeRole.id);
    setLoading(false);
    if (loadErr) return;
    const grouped: Record<string, DevScene[]> = {
      'scenario-1': [], 'scenario-2': [], 'scenario-3': [],
    };
    for (const row of (data ?? [])) {
      const sid = (row as { scenario_id?: string }).scenario_id ?? 'scenario-1';
      if (!grouped[sid]) grouped[sid] = [];
      grouped[sid].push({
        id: row.scene_id,
        label: row.scene_label ?? row.scene_id,
        description: (row as { description?: string | null }).description ?? null,
        scenario_id: sid,
        scene_image_url: row.scene_image_url,
        scene_image_status: row.scene_image_status,
        production_id: row.id,
      });
    }
    setScenesByScenario(grouped);
  }, [creatorId, activeRole]);

  useEffect(() => { loadScenes(); }, [loadScenes]);

  const linkedCharName = selectedV2Character?.name ?? 'No character selected';
  const totalScenes = Object.values(scenesByScenario).reduce((sum, arr) => sum + arr.length, 0);

  return (
    <div className="space-y-4">
      {/* Top bar: Back button + read-only banner */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-surface-300 border border-surface-700 bg-surface-900/60 hover:bg-surface-800 hover:text-surface-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Roles
        </button>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-900/60 border border-surface-800">
          <Lock className="w-3.5 h-3.5 text-surface-500" />
          <span className="text-xs text-surface-400">Read-only overview</span>
        </div>
      </div>

      {/* Role dropdown + context */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
          <BoxSelect className="w-4 h-4 text-surface-400" />
          <h3 className="text-sm font-semibold text-surface-200">Scenario Studio V2 — Overview</h3>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-medium text-surface-400">Select Role</label>
          {roles.length === 0 ? (
            <p className="text-xs text-surface-600 italic">No roles created yet. Create roles in the Roles tab first.</p>
          ) : (
            <select
              value={overviewRoleId}
              onChange={e => setOverviewRoleId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-surface-900/60 border border-surface-800 text-sm text-surface-200 focus:outline-none focus:border-primary-600/40"
            >
              <option value="">— Choose a role —</option>
              {roles.map(r => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
        </div>

        {activeRole && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400">Linked Character</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-600/10 border border-accent-600/30 text-sm text-accent-300">
                <Lock className="w-3.5 h-3.5 text-accent-400" />
                <span className="font-medium">{linkedCharName}</span>
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400">Total Scenes</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-900/60 border border-surface-800 text-sm text-surface-300">
                <Clapperboard className="w-3.5 h-3.5 text-surface-500" />
                <span className="font-medium">{totalScenes} scene{totalScenes !== 1 ? 's' : ''}</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scenario overview cards */}
      {activeRole && (
        <div className="card space-y-4">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-surface-500">
              <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading scenes…
            </div>
          )}
          <div className="space-y-4">
            {FIXED_SCENARIOS.map(sc => {
              const scenes = scenesByScenario[sc.id] ?? [];
              const generated = scenes.filter(s => s.scene_image_status === 'Completed' && s.scene_image_url);
              const pending = scenes.filter(s => s.scene_image_status !== 'Completed');
              return (
                <div key={sc.id} className="border border-surface-800 rounded-xl overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 bg-surface-900/60 border-b border-surface-800">
                    <span className="text-[11px] font-mono text-accent-400 flex-shrink-0">{sc.id}</span>
                    <span className="text-sm font-semibold text-surface-200 flex-1">{sc.title}</span>
                    <span className="text-[10px] text-surface-600">
                      {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="px-4 py-3 space-y-2 min-h-[3rem]">
                    {scenes.length === 0 ? (
                      <p className="text-xs text-surface-600 italic">No scenes yet.</p>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                        {scenes.map(scene => (
                          <div key={scene.id} className="card flex flex-col gap-1.5 p-2">
                            <div className="w-full aspect-square rounded-lg bg-surface-800 flex items-center justify-center overflow-hidden">
                              {scene.scene_image_url ? (
                                <img src={scene.scene_image_url} alt={scene.label} className="w-full h-full object-cover" />
                              ) : (
                                <Clapperboard className="w-5 h-5 text-surface-600" />
                              )}
                            </div>
                            <div className="text-xs font-medium text-surface-200 truncate">{scene.label}</div>
                            <div className="flex items-center gap-1">
                              {scene.scene_image_status === 'Completed' ? (
                                <CheckCircle className="w-3 h-3 text-success-400" />
                              ) : (
                                <Loader2 className="w-3 h-3 text-surface-600" />
                              )}
                              <span className="text-[10px] text-surface-500">{scene.scene_image_status ?? 'Pending'}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {scenes.length > 0 && (
                      <div className="flex items-center gap-3 pt-1 text-[10px] text-surface-600">
                        <span className="flex items-center gap-1"><CheckCircle className="w-3 h-3 text-success-400" /> {generated.length} generated</span>
                        <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 text-surface-600" /> {pending.length} pending</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Enter edit mode button */}
          <button
            onClick={onEnterEdit}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary-400 border border-primary-600/20 bg-primary-600/10 hover:bg-primary-600/20 transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Open Full Editor for {activeRole.name}
          </button>
        </div>
      )}
    </div>
  );
}

function DevScenariosView({
  creatorId,
  selectedRole,
  selectedV2Character,
  onRefresh,
  onBack,
  checkAndDeduct,
  canAffordImage,
  canAffordVideo,
}: {
  creatorId: string;
  selectedRole: CharacterRoleRow | null;
  selectedV2Character?: SelectedV2CharacterRef | null;
  onRefresh: () => void;
  onBack: () => void;
  checkAndDeduct: (amount: number, description: string) => Promise<boolean>;
  canAffordImage: boolean;
  canAffordVideo: boolean;
}) {
  const [scenesByScenario, setScenesByScenario] = useState<Record<string, DevScene[]>>({
    'scenario-1': [],
    'scenario-2': [],
    'scenario-3': [],
  });
  const { unlocked: devAccessUnlocked } = useDevAccess();
  const { creator } = useAuth();
  const isChildCreator = !canUseDevMode(creator?.email);
  const [imageProductionSceneId, setImageProductionSceneId] = useState<string | null>(null);
  const [sceneDevOn, setSceneDevOn] = useState(false);

  // ── Load persisted scenes from scene_image_productions ─────────────────────
  // Scenario Studio V2 uses ONLY scene_image_productions — never the old
  // role_scenarios / scenario_scenes tables.
  const loadScenes = useCallback(async () => {
    if (!creatorId || !selectedRole) return;
    const { data, error: loadErr } = await supabase
      .from('scene_image_productions')
      .select('id, scene_id, scene_label, description, scenario_id, scene_image_url, scene_image_status, video_url, video_status')
      .eq('creator_id', creatorId)
      .eq('role_id', selectedRole.id);
    if (loadErr) return;
    const grouped: Record<string, DevScene[]> = {
      'scenario-1': [], 'scenario-2': [], 'scenario-3': [],
    };
    for (const row of (data ?? [])) {
      const sid = (row as { scenario_id?: string }).scenario_id ?? 'scenario-1';
      if (!grouped[sid]) grouped[sid] = [];
      grouped[sid].push({
        id: row.scene_id,
        label: row.scene_label ?? row.scene_id,
        description: (row as { description?: string | null }).description ?? null,
        scenario_id: sid,
        scene_image_url: row.scene_image_url,
        scene_image_status: row.scene_image_status,
        production_id: row.id,
        video_url: (row as { video_url?: string | null }).video_url ?? null,
        video_status: (row as { video_status?: string | null }).video_status ?? null,
      });
    }
    for (const sid of Object.keys(grouped)) {
      grouped[sid].sort((a, b) => {
        const na = parseInt((a.label.match(/(\d+)/) ?? [])[1] ?? '0', 10);
        const nb = parseInt((b.label.match(/(\d+)/) ?? [])[1] ?? '0', 10);
        return na - nb;
      });
    }
    setScenesByScenario(grouped);
  }, [creatorId, selectedRole]);

  useEffect(() => { loadScenes(); }, [loadScenes]);

  // ── Auto-recovery: resume any video stuck in "Processing" on page load ──────
  // When scenes are loaded and any has video_status "Processing" (e.g. the
  // edge function timed out before the provider finished), call the resume
  // endpoint which polls the provider, downloads the video, and updates the
  // DB — no need for the user to click Video again.
  const resumedProductionIds = useRef<Set<string>>(new Set());
  useEffect(() => {
    const allScenes = Object.values(scenesByScenario).flat();
    for (const scene of allScenes) {
      if (scene.video_status !== 'Processing' || !scene.production_id) continue;
      if (resumedProductionIds.current.has(scene.production_id)) continue;
      resumedProductionIds.current.add(scene.production_id);

      // If video_url is already populated but status hasn't caught up,
      // treat it as Ready immediately.
      if (scene.video_url) {
        setScenesByScenario(prev => {
          const next = { ...prev };
          for (const sid of Object.keys(next)) {
            next[sid] = next[sid].map(s =>
              s.id === scene.id ? { ...s, video_status: 'Ready' } : s
            );
          }
          return next;
        });
        continue;
      }

      // Call the resume endpoint — it polls the provider directly and
      // stores the result. If it times out (provider still processing),
      // retry every 30 seconds until Ready or Failed.
      const attemptResume = async () => {
        try {
          const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
          const response = await fetch(`${supabaseUrl}/functions/v1/resume-scene-video`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            },
            body: JSON.stringify({ scene_production_id: scene.production_id }),
          });
          const data = await response.json();
          if (data.success && data.video_url) {
            setScenesByScenario(prev => {
              const next = { ...prev };
              for (const sid of Object.keys(next)) {
                next[sid] = next[sid].map(s =>
                  s.id === scene.id
                    ? { ...s, video_url: data.video_url as string, video_status: 'Ready' as string }
                    : s
                );
              }
              return next;
            });
            return true;
          }
          if (data.still_processing) return false;
          // Hard failure
          setScenesByScenario(prev => {
            const next = { ...prev };
            for (const sid of Object.keys(next)) {
              next[sid] = next[sid].map(s =>
                s.id === scene.id ? { ...s, video_status: 'Failed' as string } : s
              );
            }
            return next;
          });
          return true;
        } catch {
          return false;
        }
      };

      const resumeInterval = setInterval(async () => {
        const done = await attemptResume();
        if (done) clearInterval(resumeInterval);
      }, 30_000);
      // Also fire immediately
      attemptResume().then(done => { if (done) clearInterval(resumeInterval); });
    }
  }, [scenesByScenario]);

  async function addScene(scenarioId: string) {
    if (!selectedRole) return;
    const list = scenesByScenario[scenarioId] ?? [];
    const sceneId = `${scenarioId}-scene-${list.length + 1}-${Date.now()}`;
    const label = `Scene ${list.length + 1}`;
    // Persist a placeholder row so the scene survives reloads
    const { error: insertErr } = await supabase
      .from('scene_image_productions')
      .insert({
        creator_id: creatorId,
        role_id: selectedRole.id,
        scene_id: sceneId,
        scene_label: label,
        scenario_id: scenarioId,
        prompt: '',
        gen_tool: 'image_editor',
        gen_model: selectedRole.gen_model || 'FLUX_KLEIN_NSFW',
        gen_ratio: selectedRole.gen_ratio || '9:16',
        gen_number_of_images: selectedRole.gen_number_of_images || 1,
        identity_asset_id: selectedV2Character?.identity_asset_id ?? null,
        identity_image_url: selectedV2Character?.identity_image_url ?? null,
        role_image_url: selectedRole.role_image_url ?? null,
        role_image_asset_id: selectedRole.role_image_asset_id ?? null,
        scene_image_status: 'Pending',
      });
    if (insertErr) return;
    setScenesByScenario(prev => ({
      ...prev,
      [scenarioId]: [...(prev[scenarioId] ?? []), { id: sceneId, label, scenario_id: scenarioId }],
    }));
  }

  async function deleteScene(scenarioId: string, sceneId: string) {
    if (!selectedRole) return;
    await supabase
      .from('scene_image_productions')
      .delete()
      .eq('creator_id', creatorId)
      .eq('role_id', selectedRole.id)
      .eq('scene_id', sceneId);
    setScenesByScenario(prev => ({
      ...prev,
      [scenarioId]: (prev[scenarioId] ?? []).filter(s => s.id !== sceneId),
    }));
    if (imageProductionSceneId === sceneId) setImageProductionSceneId(null);
  }

  function toggleImageProduction(sceneId: string) {
    setImageProductionSceneId(prev => prev === sceneId ? null : sceneId);
  }

  const linkedCharName = selectedV2Character?.name ?? 'No character selected';
  const identityAssetId = selectedV2Character?.identity_asset_id ?? null;
  const identityImageUrl = selectedV2Character?.identity_image_url ?? null;
  const roleImageUrl = selectedRole?.role_image_url ?? null;
  const roleAssetId = selectedRole?.role_image_asset_id ?? null;
  const activeScene = Object.values(scenesByScenario).flat().find(s => s.id === imageProductionSceneId) ?? null;

  // ── Dev OFF: generate / preview state ─────────────────────────────────────
  const [previewScene, setPreviewScene] = useState<DevScene | null>(null);
  const [previewVideoScene, setPreviewVideoScene] = useState<DevScene | null>(null);
  const [generatingSceneIds, setGeneratingSceneIds] = useState<Set<string>>(new Set());
  const [videoGeneratingIds, setVideoGeneratingIds] = useState<Set<string>>(new Set());
  const [devOffError, setDevOffError] = useState<string | null>(null);
  const [expandedSceneIds, setExpandedSceneIds] = useState<Set<string>>(new Set());

  async function handleDevOffGenerate(scene: DevScene) {
    if (!scene.production_id) return;
    setGeneratingSceneIds(prev => new Set(prev).add(scene.id));
    setDevOffError(null);
    setScenesByScenario(prev => {
      const next = { ...prev };
      for (const sid of Object.keys(next)) {
        next[sid] = next[sid].map(s =>
          s.id === scene.id ? { ...s, scene_image_status: 'Processing' } : s
        );
      }
      return next;
    });
    try {
      if (!await checkAndDeduct(IMAGE_COST, `Scene image: ${scene.label}`)) {
        throw new Error('Insufficient balance. Please add funds to your wallet.');
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-scene-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ scene_production_id: scene.production_id }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error ?? `Generation failed (${response.status})`);
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error ?? 'Generation failed');
      setScenesByScenario(prev => {
        const next = { ...prev };
        for (const sid of Object.keys(next)) {
          next[sid] = next[sid].map(s =>
            s.id === scene.id
              ? { ...s, scene_image_url: data.image_url as string, scene_image_status: 'Done' }
              : s
          );
        }
        return next;
      });
    } catch (e) {
      setDevOffError((e as Error).message);
      setScenesByScenario(prev => {
        const next = { ...prev };
        for (const sid of Object.keys(next)) {
          next[sid] = next[sid].map(s =>
            s.id === scene.id ? { ...s, scene_image_status: 'Failed' } : s
          );
        }
        return next;
      });
    } finally {
      setGeneratingSceneIds(prev => {
        const next = new Set(prev);
        next.delete(scene.id);
        return next;
      });
    }
  }

  async function handleDevOffVideo(scene: DevScene) {
    if (!scene.production_id) return;
    setVideoGeneratingIds(prev => new Set(prev).add(scene.id));
    setDevOffError(null);
    setScenesByScenario(prev => {
      const next = { ...prev };
      for (const sid of Object.keys(next)) {
        next[sid] = next[sid].map(s =>
          s.id === scene.id ? { ...s, video_status: 'Processing' } : s
        );
      }
      return next;
    });
    try {
      if (!await checkAndDeduct(VIDEO_COST, `Scene video: ${scene.label}`)) {
        throw new Error('Insufficient balance. Please add funds to your wallet.');
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-scene-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ scene_production_id: scene.production_id }),
      });
      const data = await response.json();
      if (data.still_processing) {
        // Edge function started the generation but the poll timed out —
        // the video is still processing on the provider. Reload scenes
        // from the DB so local state picks up the latest video_url (the
        // edge function may have stored the result before timing out).
        await loadScenes();
        return;
      }
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? `Video generation failed (${response.status})`);
      }
      setScenesByScenario(prev => {
        const next = { ...prev };
        for (const sid of Object.keys(next)) {
          next[sid] = next[sid].map(s =>
            s.id === scene.id
              ? { ...s, video_url: data.video_url as string, video_status: 'Ready' }
              : s
          );
        }
        return next;
      });
    } catch (e) {
      // The edge function may have succeeded and updated the DB but the
      // HTTP response was lost (e.g. platform timeout after DB write).
      // Poll the DB before declaring failure.
      let dbReady = false;
      if (scene.production_id) {
        for (let i = 0; i < 60; i++) {
          if (i > 0) await new Promise(r => setTimeout(r, 5000));
          const { data: vData } = await supabase
            .from('scene_image_productions')
            .select('video_url, video_status')
            .eq('id', scene.production_id)
            .maybeSingle();
          if (vData?.video_url && (vData.video_status === 'Ready' || vData.video_status === 'Processing')) {
            setScenesByScenario(prev => {
              const next = { ...prev };
              for (const sid of Object.keys(next)) {
                next[sid] = next[sid].map(s =>
                  s.id === scene.id
                    ? { ...s, video_url: vData.video_url as string, video_status: 'Ready' }
                    : s
                );
              }
              return next;
            });
            dbReady = true;
            break;
          }
          if (vData?.video_status === 'Failed') break;
        }
      }
      if (!dbReady) {
        // Check if DB is still Processing — the edge function may still be
        // running (platform timeout kills the HTTP response but not the
        // function). Keep showing Processing and start a background poll.
        const { data: finalCheck } = await supabase
          .from('scene_image_productions')
          .select('video_status')
          .eq('id', scene.production_id)
          .maybeSingle();
        if (finalCheck?.video_status === 'Processing') {
          // Keep showing Processing; background-poll until Ready or Failed
          const pollInterval = setInterval(async () => {
            const { data: vData } = await supabase
              .from('scene_image_productions')
              .select('video_url, video_status')
              .eq('id', scene.production_id)
              .maybeSingle();
            if (vData?.video_url && (vData.video_status === 'Ready' || vData.video_status === 'Processing')) {
              clearInterval(pollInterval);
              setScenesByScenario(prev => {
                const next = { ...prev };
                for (const sid of Object.keys(next)) {
                  next[sid] = next[sid].map(s =>
                    s.id === scene.id
                      ? { ...s, video_url: vData.video_url as string, video_status: 'Ready' }
                      : s
                  );
                }
                return next;
              });
            } else if (vData?.video_status === 'Failed') {
              clearInterval(pollInterval);
              setScenesByScenario(prev => {
                const next = { ...prev };
                for (const sid of Object.keys(next)) {
                  next[sid] = next[sid].map(s =>
                    s.id === scene.id ? { ...s, video_status: 'Failed' } : s
                  );
                }
                return next;
              });
            }
          }, 10_000);
        } else {
          setDevOffError((e as Error).message);
          setScenesByScenario(prev => {
            const next = { ...prev };
            for (const sid of Object.keys(next)) {
              next[sid] = next[sid].map(s =>
                s.id === scene.id ? { ...s, video_status: 'Failed' } : s
              );
            }
            return next;
          });
        }
      }
    } finally {
      setVideoGeneratingIds(prev => {
        const next = new Set(prev);
        next.delete(scene.id);
        return next;
      });
    }
  }

  function sceneStatusBadge(status: string | null | undefined): { label: string; className: string } {
    const s = (status ?? '').toLowerCase();
    if (s === 'done' || s === 'ready' || s === 'completed') return { label: 'Done', className: 'text-success-400' };
    if (s === 'processing' || s === 'generating') return { label: 'Processing', className: 'text-warning-400' };
    if (s === 'failed' || s === 'error') return { label: 'Failed', className: 'text-danger-400' };
 return { label: 'Ready', className: 'text-surface-500' };
  }

  function toggleSceneExpand(sceneId: string) {
    setExpandedSceneIds(prev => {
      const next = new Set(prev);
      if (next.has(sceneId)) next.delete(sceneId);
      else next.add(sceneId);
      return next;
    });
  }

  // ── Dev OFF: clean scenario selection screen (matches Role Studio Dev OFF theme) ──
  if (!sceneDevOn) {
    const allScenes = Object.values(scenesByScenario).flat();
    return (
      <div className="fixed inset-0 overflow-hidden flex flex-col" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: isChildCreator ? 'calc(env(safe-area-inset-bottom) + 5rem)' : 'env(safe-area-inset-bottom)' }}>
        {/* Faded linked character identity background */}
        {identityImageUrl ? (
          <div className="absolute inset-0 pointer-events-none">
            <img
              src={identityImageUrl}
              alt=""
              className="w-full h-full object-cover"
              style={{ opacity: 0.35, filter: 'blur(3px)' }}
              draggable={false}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-surface-950/60 to-surface-950/85" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-surface-950" />
        )}

        {/* Back button (top-left) */}
        {onBack && (
          <div className="absolute top-3 left-3 z-30">
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-white/20 bg-black/40 backdrop-blur-md hover:border-white/40"
            >
              <ChevronLeft className="w-5 h-5 text-white/80" />
              <span className="text-white/80">Back</span>
            </button>
          </div>
        )}

        {/* Dev toggle (top-right) — only visible after DEV PIN unlock AND
            only for the Mother Creator. Child Creators are locked to Dev OFF. */}
        {devAccessUnlocked && !isChildCreator && (
          <div className="absolute top-3 right-3 z-30">
            <button
              onClick={() => setSceneDevOn(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border border-white/20 bg-black/40 backdrop-blur-md hover:border-white/40"
              title="Toggle Dev View"
            >
              <ToggleRight className="w-5 h-5 text-accent-400" />
              <span className="text-accent-400">Dev ON</span>
            </button>
          </div>
        )}

        {/* Fixed header: SCENARIO STUDIO title — never scrolls */}
        <div className="relative z-20 flex flex-col items-center pt-6 pb-4 px-6 flex-shrink-0 pointer-events-none"
             style={{ paddingTop: 'calc(env(safe-area-inset-top) + 3rem)' }}>
          <h1 className="text-base font-semibold tracking-wide uppercase pb-4">
            <span style={{ color: '#F5F7FA' }}>Scenario </span>
            <span style={{ color: '#35D6A0' }}>Studio</span>
          </h1>
          <div className="w-full max-w-md mx-auto rounded-xl border border-warning-500/20 bg-warning-500/5 px-4 py-2.5 pointer-events-auto">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-3.5 h-3.5 text-warning-400 flex-shrink-0 mt-0.5" />
              <p className="text-[11px] font-light text-warning-200/80 leading-relaxed">
                IMPORTANT: AI-generated scene images or videos may sometimes show unusual body shapes or details. Please review your scene media carefully before publishing your role in the Public Chat Library.
              </p>
            </div>
          </div>
        </div>

        {/* Scrollable scenario content — below fixed header */}
        <div className="relative z-10 flex-1 overflow-y-auto px-6 pb-8"
             style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          <div className="w-full max-w-md mx-auto">
            {allScenes.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Clapperboard className="w-7 h-7 text-surface-600 mb-3" />
                <p className="text-sm text-surface-400">No scenes yet</p>
                <p className="text-xs text-surface-600 mt-1">Scenarios will appear here in Dev ON.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {FIXED_SCENARIOS.map(sc => {
                  const scenes = scenesByScenario[sc.id] ?? [];
                  if (scenes.length === 0) return null;
                  return (
                    <div key={sc.id} className="space-y-3">
                      {/* Prominent scenario heading */}
                      <div className="flex items-center gap-2 px-1">
                        <span className="text-[10px] font-mono text-accent-400/80">{sc.id}</span>
                        <h2 className="text-lg font-bold text-white drop-shadow-md">{sc.title}</h2>
                        <span className="text-[10px] text-white/40">{scenes.length} scene{scenes.length !== 1 ? 's' : ''}</span>
                      </div>
                      {/* Collapsible scene cards */}
                      {scenes.map(scene => {
                        const hasImage = !!scene.scene_image_url;
                        const isGenerating = generatingSceneIds.has(scene.id);
                        const isExpanded = expandedSceneIds.has(scene.id);
                        return (
                          <div key={scene.id} className="flex flex-col">
                            <button
                              onClick={() => toggleSceneExpand(scene.id)}
                              className={`w-full px-5 py-3.5 rounded-2xl backdrop-blur-md border text-left transition-all duration-300 overflow-hidden h-[84px] ${
                                isExpanded
                                  ? 'bg-black/50 border-white/30'
                                  : 'bg-black/30 border-white/10 hover:border-white/20 hover:bg-black/40'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-3 h-full">
                                <div className="min-w-0 flex-1">
                                  <div className="text-sm font-bold text-white drop-shadow-md">{scene.label}</div>
                                  <div
                                    className="text-xs font-light text-white/60 leading-relaxed mt-0.5"
                                    style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                                  >
                                    {scene.description?.trim() ? scene.description : 'No description'}
                                  </div>
                                </div>
                                <ChevronDown
                                  className={`w-4 h-4 text-white/50 flex-shrink-0 transition-transform duration-300 ${
                                    isExpanded ? 'rotate-180' : ''
                                  }`}
                                />
                              </div>
                            </button>
                            <div
                              className={`grid transition-all duration-300 ease-out ${
                                isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0 mt-0'
                              }`}
                            >
                              <div className="overflow-hidden flex flex-col gap-2">
                                {/* Scene image */}
                                {hasImage && (
                                  <div className="w-full rounded-xl overflow-hidden border border-white/10">
                                    <img src={scene.scene_image_url ?? ''} alt={scene.label} className="w-full object-cover" />
                                  </div>
                                )}
                                {/* Action buttons */}
                                <div className="flex items-center justify-center gap-2">
                                  {hasImage && (
                                    <button
                                      onClick={() => setPreviewScene(scene)}
                                      className="px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border bg-white/10 border-white/20 text-white hover:bg-white/15 transition-colors"
                                    >
                                      <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Preview</span>
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleDevOffGenerate(scene)}
                                    disabled={isGenerating || !scene.production_id || (isChildCreator && !canAffordImage)}
                                    className="px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border bg-accent-600/20 border-accent-500/30 text-accent-300 hover:bg-accent-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    {isGenerating ? (
                                      <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Generating…</span>
                                    ) : hasImage ? (
                                      <span className="flex items-center gap-1.5"><RotateCw className="w-3.5 h-3.5" />Regenerate</span>
                                    ) : (
                                      <span className="flex items-center gap-1.5"><Sparkles className="w-3.5 h-3.5" />Generate</span>
                                    )}
                                  </button>
                                  {hasImage ? (
                                    <button
                                      onClick={() => handleDevOffVideo(scene)}
                                      disabled={videoGeneratingIds.has(scene.id) || (isChildCreator && !canAffordVideo)}
                                      title={videoGeneratingIds.has(scene.id) ? 'Generating video…' : 'Generate video from this scene image'}
                                      className="px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border bg-primary-600/20 border-primary-500/30 text-primary-300 hover:bg-primary-600/30 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                      {videoGeneratingIds.has(scene.id) ? (
                                        <span className="flex items-center gap-1.5"><Loader2 className="w-3.5 h-3.5 animate-spin" />Video…</span>
                                      ) : (
                                        <span className="flex items-center gap-1.5"><Video className="w-3.5 h-3.5" />{scene.video_status === 'Ready' ? 'Revideo' : 'Video'}</span>
                                      )}
                                    </button>
                                  ) : (
                                    <button
                                      disabled
                                      title="Generate a scene image first"
                                      className="px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border bg-white/5 border-white/10 text-white/30 cursor-not-allowed"
                                    >
                                      <span className="flex items-center gap-1.5"><Video className="w-3.5 h-3.5" />Video</span>
                                    </button>
                                  )}
                                </div>
                                {/* Image generation fish animation — 60s travel, clean background */}
                                {isGenerating && (
                                  <div className="space-y-1.5 pt-1">
                                    <div className="relative h-10 w-full rounded-lg bg-surface-950 border border-surface-800 overflow-hidden">
                                      <div
                                        className="absolute top-1/2 -translate-y-1/2"
                                        style={{ animation: 'cai-fish-travel 60s linear forwards' }}
                                      >
                                        <div style={{ animation: 'cai-fish-wait 1.8s ease-in-out infinite' }}>
                                          <FishMascot size={36} />
                                          <span className="cai-bubble cai-bubble--1" />
                                          <span className="cai-bubble cai-bubble--2" />
                                          <span className="cai-bubble cai-bubble--3" />
                                        </div>
                                      </div>
                                    </div>
                                    <p className="text-xs text-accent-300 text-center">Generating scene image…</p>
                                  </div>
                                )}
                                {/* Video generation fish animation — 140s travel, clean background */}
                                {videoGeneratingIds.has(scene.id) && (
                                  <div className="space-y-1.5 pt-1">
                                    <div className="relative h-10 w-full rounded-lg bg-surface-950 border border-surface-800 overflow-hidden">
                                      <div
                                        className="absolute top-1/2 -translate-y-1/2"
                                        style={{ animation: 'cai-fish-travel 140s linear forwards' }}
                                      >
                                        <div style={{ animation: 'cai-fish-wait 1.8s ease-in-out infinite' }}>
                                          <FishMascot size={36} />
                                          <span className="cai-bubble cai-bubble--1" />
                                          <span className="cai-bubble cai-bubble--2" />
                                          <span className="cai-bubble cai-bubble--3" />
                                        </div>
                                      </div>
                                    </div>
                                    <p className="text-xs text-primary-300 text-center">Generating scene video…</p>
                                  </div>
                                )}
                                {/* Status badge */}
                                {(() => {
                                  const badge = sceneStatusBadge(scene.scene_image_status);
                                  return (
                                    <div className="text-center text-[10px] font-medium mt-0.5">
                                      <span className={badge.className}>{badge.label}</span>
                                    </div>
                                  );
                                })()}
                                {/* Video status badge */}
                                {scene.video_status && scene.video_status !== 'Pending' && (
                                  <div className="text-center text-[10px] font-medium mt-0.5">
                                    <span className="flex items-center justify-center gap-1">
                                      <Video className="w-2.5 h-2.5" />
                                      <span className={
                                        scene.video_status === 'Ready' ? 'text-success-400'
                                        : scene.video_status === 'Processing' ? 'text-warning-400'
                                        : 'text-danger-400'
                                      }>
                                        Video: {scene.video_status}
                                      </span>
                                    </span>
                                  </div>
                                )}
                                {/* Video result */}
                                {scene.video_url && scene.video_status === 'Ready' && (
                                  <>
                                    <div className="w-full rounded-xl overflow-hidden border border-white/10 mt-1">
                                      <video
                                        key={scene.video_url}
                                        src={scene.video_url}
                                        controls
                                        playsInline
                                        preload="metadata"
                                        className="w-full object-cover"
                                      />
                                    </div>
                                    <div className="flex justify-center">
                                      <button
                                        onClick={() => setPreviewVideoScene(scene)}
                                        className="px-4 py-1.5 rounded-full text-xs font-semibold backdrop-blur-md border bg-white/10 border-white/20 text-white hover:bg-white/15 transition-colors"
                                      >
                                        <span className="flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" />Preview</span>
                                      </button>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Error display */}
          {devOffError && (
            <div className="flex items-center justify-center gap-2 px-4 py-2 mt-4 mx-auto max-w-md rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5" />{devOffError}
            </div>
          )}
        </div>

        {/* Preview modal */}
        {previewScene && previewScene.scene_image_url && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6"
            onClick={() => setPreviewScene(null)}
          >
            <div className="relative max-w-lg w-full max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setPreviewScene(null)}
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-surface-800/90 border border-surface-700 flex items-center justify-center text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <img
                src={previewScene.scene_image_url}
                alt={previewScene.label}
                className="w-full rounded-xl border border-white/20"
              />
              <div className="mt-3 text-center">
                <div className="text-sm font-semibold text-white">{previewScene.label}</div>
                <div className="text-xs text-white/60 mt-0.5">
                  {previewScene.description?.trim() ? previewScene.description : 'No description'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Video preview modal */}
        {previewVideoScene && previewVideoScene.video_url && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6"
            onClick={() => setPreviewVideoScene(null)}
          >
            <div className="relative max-w-lg w-full max-h-[88vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <button
                onClick={() => setPreviewVideoScene(null)}
                className="absolute top-2 right-2 z-10 w-8 h-8 rounded-full bg-surface-800/90 border border-surface-700 flex items-center justify-center text-surface-300 hover:text-white hover:bg-surface-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
              <video
                src={previewVideoScene.video_url}
                controls
                playsInline
                preload="auto"
                autoPlay
                className="w-full rounded-xl border border-white/20"
              />
              <div className="mt-3 text-center">
                <div className="text-sm font-semibold text-white">{previewVideoScene.label}</div>
                <div className="text-xs text-white/60 mt-0.5">
                  {previewVideoScene.description?.trim() ? previewVideoScene.description : 'No description'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top bar: Back button + Dev ON/OFF toggle */}
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-surface-300 border border-surface-700 bg-surface-900/60 hover:bg-surface-800 hover:text-surface-100 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Roles
        </button>
        {devAccessUnlocked && !isChildCreator && (
          <button
            onClick={() => setSceneDevOn(prev => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border border-surface-700 bg-surface-900/60 hover:bg-surface-800"
            title="Toggle Dev View"
          >
            {sceneDevOn ? (
              <ToggleRight className="w-4 h-4 text-primary-400" />
            ) : (
              <ToggleLeft className="w-4 h-4 text-surface-500" />
            )}
            <span className={sceneDevOn ? 'text-primary-400' : 'text-surface-400'}>
              {sceneDevOn ? 'Dev ON' : 'Dev OFF'}
            </span>
          </button>
        )}
      </div>

      {/* Selected role context */}
      <div className="card space-y-3">
        <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
          <BoxSelect className="w-4 h-4 text-surface-400" />
          <h3 className="text-sm font-semibold text-surface-200">Scenario Studio V2</h3>
          {selectedRole && (
            <span className="text-xs text-surface-500">— {selectedRole.name}</span>
          )}
        </div>

        {selectedRole ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {/* Linked character */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400">Linked Character</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-600/10 border border-accent-600/30 text-sm text-accent-300">
                <Lock className="w-3.5 h-3.5 text-accent-400" />
                <span className="font-medium">{linkedCharName}</span>
                <span className="text-xs text-accent-400/70">(fixed)</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-900/60 border border-surface-800 text-xs text-surface-400">
                <Lock className="w-3 h-3 text-surface-600" />
                <span className="text-surface-600 min-w-[110px]">Identity Asset ID</span>
                <span className="font-mono break-all text-surface-400">{identityAssetId ?? '—'}</span>
              </div>
            </div>

            {/* Linked role image */}
            <div className="space-y-1">
              <label className="text-xs font-medium text-surface-400">Linked Role Image</label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-900/60 border border-surface-800 text-sm text-surface-300">
                {roleImageUrl ? (
                  <img src={roleImageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
                ) : (
                  <ImageIcon className="w-4 h-4 text-surface-600 flex-shrink-0" />
                )}
                <span className="font-medium truncate">{selectedRole.name}</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-900/60 border border-surface-800 text-xs text-surface-400">
                <Lock className="w-3 h-3 text-surface-600" />
                <span className="text-surface-600 min-w-[110px]">Role Asset ID</span>
                <span className="font-mono break-all text-surface-400">{roleAssetId ?? '—'}</span>
              </div>
            </div>
          </div>
        ) : (
          <p className="text-xs text-surface-600 italic">Select a role from the Roles tab to view its scenarios.</p>
        )}
      </div>

      {/* Scenarios with scene lists */}
      <div className="card space-y-4">
        <div className="space-y-4">
          {FIXED_SCENARIOS.map(sc => {
            const scenes = scenesByScenario[sc.id] ?? [];
            return (
              <div key={sc.id} className="border border-surface-800 rounded-xl overflow-hidden">
                {/* Scenario header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-surface-900/60 border-b border-surface-800">
                  <span className="text-[11px] font-mono text-accent-400 flex-shrink-0">{sc.id}</span>
                  <span className="text-sm font-semibold text-surface-200 flex-1">{sc.title}</span>
                  <span className="text-[10px] text-surface-600">
                    {scenes.length} scene{scenes.length !== 1 ? 's' : ''}
                  </span>
                </div>

                {/* Scene list */}
                <div className="px-4 py-3 space-y-2 min-h-[3rem]">
                  {scenes.length === 0 ? (
                    <p className="text-xs text-surface-600 italic">No scenes yet.</p>
                  ) : (
                    scenes.map(scene => {
                      const isInProduction = imageProductionSceneId === scene.id;
                      return (
                        <div key={scene.id} className="space-y-2">
                          <div className="card flex items-center gap-4 p-3 hover:border-primary-600/30 transition-colors group">
                            <div className="w-12 h-12 rounded-lg bg-surface-800 flex items-center justify-center flex-shrink-0 overflow-hidden">
                              {scene.scene_image_url ? (
                                <img src={scene.scene_image_url} alt={scene.label} className="w-full h-full object-cover" />
                              ) : (
                                <Clapperboard className="w-5 h-5 text-surface-600" />
                              )}
                            </div>
                            <div className="flex-1 min-w-0 text-left">
                              <div className="text-sm font-medium text-surface-100 truncate">{scene.label}</div>
                              <div className="text-xs text-surface-500 truncate">{sc.title}</div>
                            </div>
                            <button
                              onClick={() => toggleImageProduction(scene.id)}
                              className={[
                                'p-2 rounded-lg transition-colors',
                                isInProduction
                                  ? 'text-primary-400 bg-primary-600/10'
                                  : 'text-surface-400 hover:text-primary-400 hover:bg-primary-600/10',
                              ].join(' ')}
                              title="Scene Image Production"
                            >
                              <Star className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteScene(sc.id, scene.id)}
                              className="p-2 rounded-lg text-surface-500 hover:text-danger-400 hover:bg-danger-500/10 transition-colors"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                          {isInProduction && activeScene && selectedRole && (
                            <SceneImageProduction
                              creatorId={creatorId}
                              scene={activeScene}
                              role={selectedRole}
                              linkedCharName={linkedCharName}
                              identityAssetId={identityAssetId}
                              identityImageUrl={identityImageUrl}
                              roleImageUrl={roleImageUrl}
                              roleAssetId={roleAssetId}
                              onUpdate={() => { onRefresh(); loadScenes(); }}
                            />
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Add Scene button */}
                <div className="px-4 pb-3">
                  <button
                    onClick={() => addScene(sc.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-primary-400 border border-primary-600/20 bg-primary-600/10 hover:bg-primary-600/20 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add Scene
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

    </div>
  );
}

// ── Video Generator (Dev ON) ───────────────────────────────────────────────

// ── ZenCreator videogen model definitions ─────────────────────────────────

const VIDEO_MODELS = [
  { value: 'wan@2.7', label: 'Wan 2.7 (top prompt understanding, 1080p)', supportsLastFrame: false, supportsLoras: false, audio: false, resolutions: ['720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'wan@2.7-nsfw', label: 'Wan 2.7 NSFW (best for NSFW first-frame animation)', supportsLastFrame: false, supportsLoras: false, audio: false, resolutions: ['720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'wan@2.6', label: 'Wan 2.6 (good quality, uncensored)', supportsLastFrame: false, supportsLoras: false, audio: false, resolutions: ['720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'wan@2.6-flash', label: 'Wan 2.6 Flash (faster, cheaper)', supportsLastFrame: false, supportsLoras: false, audio: false, resolutions: ['720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'wan@2.5', label: 'Wan 2.5 (older generation)', supportsLastFrame: false, supportsLoras: false, audio: false, resolutions: ['480p', '720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'wan@2.2', label: 'Wan 2.2 (image-to-video, uncensored base)', supportsLastFrame: false, supportsLoras: false, audio: false, resolutions: ['480p', '720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'wan@2.2-lora', label: 'Wan 2.2 LoRA (action-trained LoRAs)', supportsLastFrame: false, supportsLoras: true, audio: false, resolutions: ['480p', '720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'kling@2.6', label: 'Kling 2.6 (top motion + native audio)', supportsLastFrame: false, supportsLoras: false, audio: true, resolutions: ['720p', '1080p'], durations: [5, 6, 8, 10] },
  { value: 'kling@2.5', label: 'Kling 2.5 (high quality, cheaper)', supportsLastFrame: false, supportsLoras: false, audio: false, resolutions: ['720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'kling@2.1', label: 'Kling 2.1 (stable motion, supports last frame)', supportsLastFrame: true, supportsLoras: false, audio: false, resolutions: ['720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'kling@1.6', label: 'Kling 1.6 (oldest, cheapest)', supportsLastFrame: false, supportsLoras: false, audio: false, resolutions: ['720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'seedance_v1_5_pro', label: 'Seedance V1.5 Pro (best quality, supports last frame)', supportsLastFrame: true, supportsLoras: false, audio: true, resolutions: ['720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'seedance_pro', label: 'Seedance Pro (smarter, supports last frame)', supportsLastFrame: true, supportsLoras: false, audio: true, resolutions: ['480p', '720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'seedance_pro_fast', label: 'Seedance Pro Fast (faster, cheaper)', supportsLastFrame: false, supportsLoras: false, audio: true, resolutions: ['480p', '720p', '1080p'], durations: [5, 6, 8, 10, 12, 15] },
  { value: 'grok@4.1', label: 'Grok 4.1 (top image-to-video, native audio)', supportsLastFrame: false, supportsLoras: false, audio: true, resolutions: ['480p', '720p'], durations: [5, 6, 8, 10, 12, 15] },
] as const;

const ALL_DURATIONS = [5, 6, 8, 10, 12, 15];
const ALL_RESOLUTIONS = ['480p', '720p', '1080p'];

interface VideoConfig {
  prompt: string;
  model: string;
  duration: number;
  resolution: string;
  generate_audio: boolean;
  camera_fixed: boolean;
  prompt_extend: boolean;
  negative_prompt: string;
  ref_asset_id: string | null;
}

const WAN30_I2V_MODEL = 'alibaba/wan-3.0/image-to-video';
const WAN30_RESOLUTIONS = ['1080P', '720P', '480P'] as const;
const WAN30_DURATIONS = [5, 2, 3, 4, 6, 7, 8, 10, 12, 15, 20, 25, 30, -1] as const;

interface Wan30VideoConfig {
  prompt: string;
  model: string;
  resolution: string;
  duration: number;
  audio: boolean;
  last_image_url: string | null;
}

function VideoGenerator({
  sceneProductionId, firstFrameUrl, videoConfig, setVideoConfig,
  videoUrl, videoAssetId, videoStatus, isGeneratingVideo, videoError, isSavingVideoConfig,
  onSaveConfig, onGenerate,
}: {
  sceneProductionId: string | null;
  firstFrameUrl: string;
  videoConfig: VideoConfig;
  setVideoConfig: (v: VideoConfig) => void;
  videoUrl: string | null;
  videoAssetId: string | null;
  videoStatus: string;
  isGeneratingVideo: boolean;
  videoError: string | null;
  isSavingVideoConfig: boolean;
  onSaveConfig: () => void;
  onGenerate: () => void;
}) {
  const modelInfo = VIDEO_MODELS.find(m => m.value === videoConfig.model) ?? VIDEO_MODELS[5];
  const availableDurations = modelInfo.durations as unknown as number[];
  const availableResolutions = modelInfo.resolutions as unknown as string[];

  // Build the REAL payload that will be sent to ZenCreator — no placeholders.
  const videoPayload = useMemo(() => {
    const input: Record<string, unknown> = {
      ref_asset: videoConfig.ref_asset_id ?? '(auto-uploaded from scene image)',
      model: videoConfig.model,
      prompt: videoConfig.prompt || '',
      duration: videoConfig.duration,
      resolution: videoConfig.resolution,
      generate_audio: videoConfig.generate_audio,
      camera_fixed: videoConfig.camera_fixed,
      prompt_extend: videoConfig.prompt_extend,
    };
    if (videoConfig.negative_prompt) input.negative_prompt = videoConfig.negative_prompt;
    return JSON.stringify({ tool: 'videogen', input }, null, 2);
  }, [videoConfig]);

  return (
    <div className="space-y-4 p-4 rounded-lg bg-gradient-to-b from-primary-600/5 to-transparent border border-primary-600/20 mt-4">
      <div className="flex items-center gap-2 pb-2 border-b border-primary-600/15">
        <Video className="w-4 h-4 text-primary-400" />
        <span className="text-sm font-semibold text-surface-100">Video Generator</span>
        <span className="text-xs text-primary-400/60">— ZenCreator videogen</span>
      </div>

      {/* First Frame — read-only */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-surface-500" />
          <label className="text-xs font-medium text-surface-400">First Frame Image (read-only)</label>
        </div>
        <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-900/60 border border-surface-800">
          <img src={firstFrameUrl} alt="First frame" className="w-16 h-16 rounded object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-surface-500 mb-0.5">Image URL</div>
            <div className="font-mono text-xs text-surface-400 break-all">{firstFrameUrl}</div>
          </div>
        </div>
        <p className="text-xs text-surface-600">The successfully generated scene image is automatically used as the video's first frame. This field is read-only — no upload needed.</p>
      </div>

      {/* Video Prompt — editable */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Video Prompt</label>
        <textarea
          value={videoConfig.prompt}
          onChange={e => setVideoConfig({ ...videoConfig, prompt: e.target.value })}
          placeholder="Describe the motion or action for this video…"
          rows={3}
          className="input-field text-sm resize-y"
        />
        <p className="text-xs text-surface-600">Describe how the scene should animate from the first frame.</p>
      </div>

      {/* Negative Prompt — editable */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Negative Prompt (optional)</label>
        <input
          type="text"
          value={videoConfig.negative_prompt}
          onChange={e => setVideoConfig({ ...videoConfig, negative_prompt: e.target.value })}
          placeholder="What to avoid in the video…"
          className="input-field text-sm"
        />
      </div>

      {/* Generation Configuration — ZenCreator videogen fields */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-surface-400">Generation Configuration</label>
        <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-surface-900/60 border border-surface-800">
          {/* Model */}
          <div className="space-y-1 col-span-2">
            <label className="text-xs text-surface-500">Model</label>
            <select
              value={videoConfig.model}
              onChange={e => {
                const newModel = VIDEO_MODELS.find(m => m.value === e.target.value)!;
                const newDurations = newModel.durations as unknown as number[];
                const newResolutions = newModel.resolutions as unknown as string[];
                setVideoConfig({
                  ...videoConfig,
                  model: e.target.value,
                  duration: newDurations.includes(videoConfig.duration) ? videoConfig.duration : newDurations[0],
                  resolution: newResolutions.includes(videoConfig.resolution) ? videoConfig.resolution : newResolutions[0],
                  generate_audio: newModel.audio ? videoConfig.generate_audio : false,
                });
              }}
              className="input-field text-sm"
            >
              {VIDEO_MODELS.map(m => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div className="space-y-1">
            <label className="text-xs text-surface-500">Duration (seconds)</label>
            <select
              value={videoConfig.duration}
              onChange={e => setVideoConfig({ ...videoConfig, duration: parseInt(e.target.value, 10) })}
              className="input-field text-sm"
            >
              {availableDurations.map(d => (
                <option key={d} value={d}>{d}s</option>
              ))}
            </select>
          </div>

          {/* Resolution */}
          <div className="space-y-1">
            <label className="text-xs text-surface-500">Resolution</label>
            <select
              value={videoConfig.resolution}
              onChange={e => setVideoConfig({ ...videoConfig, resolution: e.target.value })}
              className="input-field text-sm"
            >
              {availableResolutions.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {modelInfo.audio && (
            <button
              onClick={() => setVideoConfig({ ...videoConfig, generate_audio: !videoConfig.generate_audio })}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
                videoConfig.generate_audio
                  ? 'bg-primary-600/15 text-primary-300 border-primary-600/30'
                  : 'bg-surface-900/60 text-surface-500 border-surface-800'
              }`}
            >
              {videoConfig.generate_audio ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
              Generate Audio
            </button>
          )}
          <button
            onClick={() => setVideoConfig({ ...videoConfig, camera_fixed: !videoConfig.camera_fixed })}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
              videoConfig.camera_fixed
                ? 'bg-primary-600/15 text-primary-300 border-primary-600/30'
                : 'bg-surface-900/60 text-surface-500 border-surface-800'
            }`}
          >
            {videoConfig.camera_fixed ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Fixed Camera
          </button>
          <button
            onClick={() => setVideoConfig({ ...videoConfig, prompt_extend: !videoConfig.prompt_extend })}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
              videoConfig.prompt_extend
                ? 'bg-primary-600/15 text-primary-300 border-primary-600/30'
                : 'bg-surface-900/60 text-surface-500 border-surface-800'
            }`}
          >
            {videoConfig.prompt_extend ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Prompt Enhance
          </button>
        </div>
      </div>

      {/* Payload preview — read-only, shows REAL values */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-surface-500" />
          <label className="text-xs font-medium text-surface-400">Payload Preview (read-only — exact JSON sent to ZenCreator)</label>
        </div>
        <pre className="px-3 py-2.5 rounded-lg bg-surface-900/80 border border-surface-800 text-xs font-mono text-surface-300 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
{videoPayload}
        </pre>
      </div>

      {/* Error display */}
      {videoError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="break-words">{videoError}</span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSaveConfig}
          disabled={isSavingVideoConfig || isGeneratingVideo}
          className="btn-secondary text-sm gap-1.5 disabled:opacity-40"
        >
          {isSavingVideoConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Save Configuration
        </button>
        <button
          onClick={onGenerate}
          disabled={isGeneratingVideo || !sceneProductionId}
          className="btn-primary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGeneratingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
          {videoUrl ? 'Regenerate Video' : 'Generate Video'}
        </button>
        {videoStatus === 'Processing' && <span className="text-xs text-primary-400 self-center">Processing…</span>}
        {videoStatus === 'Ready' && <span className="text-xs text-success-400 self-center">Ready</span>}
        {videoStatus === 'Failed' && <span className="text-xs text-danger-400 self-center">Failed</span>}
      </div>

      {/* Video result */}
      {videoUrl && (
        <div className="space-y-2 pt-3 border-t border-surface-800">
          <div className="flex items-center gap-2">
            <Video className="w-3.5 h-3.5 text-surface-500" />
            <span className="text-xs font-medium text-surface-400">Generated Video</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              playsInline
              preload="auto"
              className="w-full sm:w-48 aspect-[9/16] rounded-lg border border-surface-700 bg-black object-cover"
            />
            <div className="flex-1 space-y-1.5 text-xs">
              <div className="flex gap-2">
                <span className="text-surface-500 min-w-[80px]">Asset ID</span>
                <span className="font-mono break-all text-surface-300">{videoAssetId ?? '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-surface-500 min-w-[80px]">Video URL</span>
                <span className="font-mono break-all text-surface-300">{videoUrl}</span>
              </div>
              <a
                href={videoUrl}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600/15 text-primary-400 border border-primary-600/20 text-xs hover:bg-primary-600/25 transition-colors w-fit"
             >
                <Download className="w-3.5 h-3.5" />Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Wan 3.0 I2V Video Generator (Atlas Cloud) ───────────────────────────────

function Wan30VideoGenerator({
  sceneProductionId, firstFrameUrl, wanConfig, setWanConfig,
  videoUrl, videoAssetId, videoStatus, isGeneratingVideo, videoError, isSavingVideoConfig,
  onSaveConfig, onGenerate,
}: {
  sceneProductionId: string | null;
  firstFrameUrl: string;
  wanConfig: Wan30VideoConfig;
  setWanConfig: (v: Wan30VideoConfig) => void;
  videoUrl: string | null;
  videoAssetId: string | null;
  videoStatus: string;
  isGeneratingVideo: boolean;
  videoError: string | null;
  isSavingVideoConfig: boolean;
  onSaveConfig: () => void;
  onGenerate: () => void;
}) {
  const finalPayload = useMemo(() => {
    const payload: Record<string, unknown> = {
      model: wanConfig.model,
      prompt: wanConfig.prompt || '',
      image: firstFrameUrl,
      resolution: wanConfig.resolution,
      duration: wanConfig.duration,
      audio: wanConfig.audio,
    };
    if (wanConfig.last_image_url) payload.last_image = wanConfig.last_image_url;
    return JSON.stringify(payload, null, 2);
  }, [wanConfig, firstFrameUrl]);

  return (
    <div className="space-y-4 p-4 rounded-lg bg-gradient-to-b from-accent-600/5 to-transparent border border-accent-600/20 mt-4">
      <div className="flex items-center gap-2 pb-2 border-b border-accent-600/15">
        <Video className="w-4 h-4 text-accent-400" />
        <span className="text-sm font-semibold text-surface-100">Video Generator</span>
        <span className="text-xs text-accent-400/60">— Wan 3.0 I2V (Atlas Cloud)</span>
      </div>

      {/* First Frame — read-only, uses scene image URL directly */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-surface-500" />
          <label className="text-xs font-medium text-surface-400">First Frame Image (read-only)</label>
        </div>
        <div className="flex items-center gap-3 p-2 rounded-lg bg-surface-900/60 border border-surface-800">
          <img src={firstFrameUrl} alt="First frame" className="w-16 h-16 rounded object-cover flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <div className="text-xs text-surface-500 mb-0.5">Image URL</div>
            <div className="font-mono text-xs text-surface-400 break-all">{firstFrameUrl}</div>
          </div>
        </div>
        <p className="text-xs text-surface-600">The generated scene image is used directly as the video's first frame. This field is read-only — no upload needed.</p>
      </div>

      {/* Video Prompt — editable */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Video Prompt</label>
        <textarea
          value={wanConfig.prompt}
          onChange={e => setWanConfig({ ...wanConfig, prompt: e.target.value })}
          placeholder="Describe the motion or action for this video…"
          rows={3}
          className="input-field text-sm resize-y"
        />
        <p className="text-xs text-surface-600">Text description of the motion / action (up to 5000 chars).</p>
      </div>

      {/* Generation Configuration — Wan 3.0 I2V fields */}
      <div className="space-y-2">
        <label className="text-xs font-medium text-surface-400">Generation Configuration</label>
        <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-surface-900/60 border border-surface-800">
          {/* Model — fixed to Wan 3.0 I2V */}
          <div className="space-y-1 col-span-2">
            <label className="text-xs text-surface-500">Model</label>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-800/60 border border-surface-700 text-sm text-surface-300">
              <Lock className="w-3.5 h-3.5 text-surface-500" />
              <span className="font-mono text-xs">{WAN30_I2V_MODEL}</span>
            </div>
          </div>

          {/* Resolution */}
          <div className="space-y-1">
            <label className="text-xs text-surface-500">Resolution</label>
            <select
              value={wanConfig.resolution}
              onChange={e => setWanConfig({ ...wanConfig, resolution: e.target.value })}
              className="input-field text-sm"
            >
              {WAN30_RESOLUTIONS.map(r => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
          </div>

          {/* Duration */}
          <div className="space-y-1">
            <label className="text-xs text-surface-500">Duration (seconds)</label>
            <select
              value={wanConfig.duration}
              onChange={e => setWanConfig({ ...wanConfig, duration: parseInt(e.target.value, 10) })}
              className="input-field text-sm"
            >
              {WAN30_DURATIONS.map(d => (
                <option key={d} value={d}>{d === -1 ? 'Smart Duration (-1)' : `${d}s`}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Audio toggle */}
        <div className="grid grid-cols-1 gap-2">
          <button
            onClick={() => setWanConfig({ ...wanConfig, audio: !wanConfig.audio })}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-xs transition-colors ${
              wanConfig.audio
                ? 'bg-accent-600/15 text-accent-300 border-accent-600/30'
                : 'bg-surface-900/60 text-surface-500 border-surface-800'
            }`}
          >
            {wanConfig.audio ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
            Audio Track (on by default)
          </button>
        </div>
      </div>

      {/* Last Frame — optional */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Last Frame Image URL (optional)</label>
        <input
          type="text"
          value={wanConfig.last_image_url ?? ''}
          onChange={e => setWanConfig({ ...wanConfig, last_image_url: e.target.value || null })}
          placeholder="https://example.com/last-frame.png"
          className="input-field text-sm"
        />
        <p className="text-xs text-surface-600">Optional last frame — the model interpolates from the first frame to this one.</p>
      </div>

      {/* Final Request — read-only, exact Wan 3.0 API payload */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-surface-500" />
          <label className="text-xs font-medium text-surface-400">Final Request (read-only — exact JSON sent to Atlas Cloud)</label>
        </div>
        <pre className="px-3 py-2.5 rounded-lg bg-surface-900/80 border border-surface-800 text-xs font-mono text-surface-300 overflow-x-auto whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
{finalPayload}
        </pre>
      </div>

      {/* Error display */}
      {videoError && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span className="break-words">{videoError}</span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={onSaveConfig}
          disabled={isSavingVideoConfig || isGeneratingVideo}
          className="btn-secondary text-sm gap-1.5 disabled:opacity-40"
        >
          {isSavingVideoConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Save Configuration
        </button>
        <button
          onClick={onGenerate}
          disabled={isGeneratingVideo || !sceneProductionId}
          className="btn-primary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {isGeneratingVideo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />}
          {videoUrl ? 'Regenerate Video' : 'Generate Video'}
        </button>
        {videoStatus === 'Processing' && <span className="text-xs text-accent-400 self-center">Processing…</span>}
        {videoStatus === 'Ready' && <span className="text-xs text-success-400 self-center">Ready</span>}
        {videoStatus === 'Failed' && <span className="text-xs text-danger-400 self-center">Failed</span>}
      </div>

      {/* Video result */}
      {videoUrl && (
        <div className="space-y-2 pt-3 border-t border-surface-800">
          <div className="flex items-center gap-2">
            <Video className="w-3.5 h-3.5 text-surface-500" />
            <span className="text-xs font-medium text-surface-400">Generated Video</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <video
              key={videoUrl}
              src={videoUrl}
              controls
              playsInline
              preload="auto"
              className="w-full sm:w-48 aspect-[9/16] rounded-lg border border-surface-700 bg-black object-cover"
            />
            <div className="flex-1 space-y-1.5 text-xs">
              <div className="flex gap-2">
                <span className="text-surface-500 min-w-[80px]">Asset ID</span>
                <span className="font-mono break-all text-surface-300">{videoAssetId ?? '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-surface-500 min-w-[80px]">Video URL</span>
                <span className="font-mono break-all text-surface-300">{videoUrl}</span>
              </div>
              <a
                href={videoUrl}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-600/15 text-accent-400 border border-accent-600/20 text-xs hover:bg-accent-600/25 transition-colors w-fit"
              >
                <Download className="w-3.5 h-3.5" />Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scene Image Production (Dev ON) ──────────────────────────────────────────

function SceneImageProduction({
  creatorId, scene, role, linkedCharName, identityAssetId, identityImageUrl, roleImageUrl, roleAssetId, onUpdate,
}: {
  creatorId: string;
  scene: DevScene;
  role: CharacterRoleRow;
  linkedCharName: string;
  identityAssetId: string | null;
  identityImageUrl: string | null;
  roleImageUrl: string | null;
  roleAssetId: string | null;
  onUpdate: () => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [genTool] = useState('image_editor');
  const [genConfig, setGenConfig] = useState<GenerationConfigValues>({
    model: role.gen_model || 'FLUX_KLEIN_NSFW',
    ratio: role.gen_ratio || '9:16',
    batch_size: String(role.gen_number_of_images || 1),
  });
  const [activeProvider, setActiveProvider] = useState<string>('ZenCreator');
  const [hfConfig, setHfConfig] = useState<HuggingFaceConfigValues>(HF_DEFAULTS);
  const [atlasConfig, setAtlasConfig] = useState<AtlasCloudConfigValues>({ ...ATLAS_DEFAULTS, size: '1530*2720' });
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewAssetId, setPreviewAssetId] = useState<string | null>(null);
  const [sceneProductionId, setSceneProductionId] = useState<string | null>(null);
  const [sceneStatus, setSceneStatus] = useState<string>('Pending');
  // Snapshot of the saved scene_image_productions config — used as the
  // dirty-check baseline so reopening a saved scene stays clean.
  const [savedSceneConfig, setSavedSceneConfig] = useState<{
    prompt: string; description: string; tags: string;
    gen_model: string; gen_ratio: string; gen_number_of_images: string;
    atlas_model: string; atlas_size: string; atlas_output_format: string; atlas_thinking: string; atlas_prompt_optimization_mode: string;
    hf_lora_adapter: string; hf_seed: string; hf_randomize_seed: boolean; hf_guidance_scale: string; hf_steps: string;
  } | null>(null);
  // Video Generator state
  const [videoConfig, setVideoConfig] = useState<VideoConfig>({
    prompt: '',
    model: 'wan@2.2',
    duration: 5,
    resolution: '720p',
    generate_audio: true,
    camera_fixed: false,
    prompt_extend: false,
    negative_prompt: '',
    ref_asset_id: null,
  });
  // Wan 3.0 I2V config (Atlas Cloud)
  const [wan30Config, setWan30Config] = useState<Wan30VideoConfig>({
    prompt: '',
    model: WAN30_I2V_MODEL,
    resolution: '1080P',
    duration: 5,
    audio: true,
    last_image_url: null,
  });
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoAssetId, setVideoAssetId] = useState<string | null>(null);
  const [videoStatus, setVideoStatus] = useState<string>('Pending');
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isSavingVideoConfig, setIsSavingVideoConfig] = useState(false);

  // ── Load existing scene_image_productions row on mount / refresh ──────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error: loadErr } = await supabase
        .from('scene_image_productions')
        .select('*')
        .eq('creator_id', creatorId)
        .eq('role_id', role.id)
        .eq('scene_id', scene.id)
        .maybeSingle();
      if (cancelled) return;
      if (loadErr) { setError(loadErr.message); return; }
      if (data) {
        setSceneProductionId(data.id);
        setSceneStatus(data.scene_image_status ?? 'Pending');
        if (data.prompt) setPrompt(data.prompt);
        if (data.description !== null && data.description !== undefined) setDescription(data.description);
        if (data.tags !== null && data.tags !== undefined) setTags(data.tags);
        if (data.gen_model || data.gen_ratio || data.gen_number_of_images) {
          setGenConfig({
            model: data.gen_model ?? (role.gen_model || 'FLUX_KLEIN_NSFW'),
            ratio: data.gen_ratio ?? (role.gen_ratio || '9:16'),
            batch_size: String(data.gen_number_of_images ?? (role.gen_number_of_images || 1)),
          });
        }
        if (data.gen_output_format !== null && data.gen_output_format !== undefined) {
          setAtlasConfig(prev => ({ ...prev, output_format: data.gen_output_format }));
        }
        if (data.gen_thinking !== null && data.gen_thinking !== undefined) {
          setAtlasConfig(prev => ({ ...prev, thinking: data.gen_thinking }));
        }
        if (data.gen_prompt_optimization_mode !== null && data.gen_prompt_optimization_mode !== undefined) {
          setAtlasConfig(prev => ({ ...prev, prompt_optimization_mode: data.gen_prompt_optimization_mode }));
        }
        if (data.gen_model && data.gen_model.includes('seedream')) {
          setAtlasConfig(prev => ({ ...prev, model: data.gen_model }));
        }
        if (data.gen_ratio && data.gen_ratio.includes('*')) {
          setAtlasConfig(prev => ({ ...prev, size: data.gen_ratio }));
        }
        if (data.lora_adapter !== null && data.lora_adapter !== undefined) {
          setHfConfig(prev => ({ ...prev, lora_adapter: data.lora_adapter }));
        }
        if (data.seed !== null && data.seed !== undefined) {
          setHfConfig(prev => ({ ...prev, seed: String(data.seed) }));
        }
        if (data.randomize_seed !== null && data.randomize_seed !== undefined) {
          setHfConfig(prev => ({ ...prev, randomize_seed: data.randomize_seed }));
        }
        if (data.guidance_scale !== null && data.guidance_scale !== undefined) {
          setHfConfig(prev => ({ ...prev, guidance_scale: String(data.guidance_scale) }));
        }
        if (data.steps !== null && data.steps !== undefined) {
          setHfConfig(prev => ({ ...prev, steps: String(data.steps) }));
        }
        if (data.scene_image_url) { setPreviewUrl(data.scene_image_url); setPreviewAssetId(data.scene_image_asset_id); }
        if (data.video_prompt) {
          setVideoConfig(prev => ({ ...prev, prompt: data.video_prompt }));
          setWan30Config(prev => ({ ...prev, prompt: data.video_prompt }));
        }
        if (data.video_model) setVideoConfig(prev => ({ ...prev, model: data.video_model }));
        if (data.video_duration) setVideoConfig(prev => ({ ...prev, duration: data.video_duration }));
        if (data.video_resolution) setVideoConfig(prev => ({ ...prev, resolution: data.video_resolution }));
        if (data.video_generate_audio !== null && data.video_generate_audio !== undefined) setVideoConfig(prev => ({ ...prev, generate_audio: data.video_generate_audio }));
        if (data.video_camera_fixed !== null && data.video_camera_fixed !== undefined) setVideoConfig(prev => ({ ...prev, camera_fixed: data.video_camera_fixed }));
        if (data.video_prompt_extend !== null && data.video_prompt_extend !== undefined) setVideoConfig(prev => ({ ...prev, prompt_extend: data.video_prompt_extend }));
        if (data.video_negative_prompt) setVideoConfig(prev => ({ ...prev, negative_prompt: data.video_negative_prompt }));
        if (data.video_ref_asset_id) setVideoConfig(prev => ({ ...prev, ref_asset_id: data.video_ref_asset_id }));
        // Wan 3.0 I2V config
        if (data.video_wan_model) setWan30Config(prev => ({ ...prev, model: data.video_wan_model }));
        if (data.video_wan_resolution) setWan30Config(prev => ({ ...prev, resolution: data.video_wan_resolution }));
        if (data.video_wan_duration !== null && data.video_wan_duration !== undefined) setWan30Config(prev => ({ ...prev, duration: data.video_wan_duration }));
        if (data.video_wan_audio !== null && data.video_wan_audio !== undefined) setWan30Config(prev => ({ ...prev, audio: data.video_wan_audio }));
        if (data.video_wan_last_image_url) setWan30Config(prev => ({ ...prev, last_image_url: data.video_wan_last_image_url }));
        if (data.video_url) setVideoUrl(data.video_url);
        if (data.video_asset_id) setVideoAssetId(data.video_asset_id);
        if (data.video_status) setVideoStatus(data.video_status);
        setSavedSceneConfig({
          prompt: data.prompt ?? '',
          description: data.description ?? '',
          tags: data.tags ?? '',
          gen_model: data.gen_model ?? (role.gen_model || 'FLUX_KLEIN_NSFW'),
          gen_ratio: data.gen_ratio ?? (role.gen_ratio || '9:16'),
          gen_number_of_images: String(data.gen_number_of_images ?? (role.gen_number_of_images || 1)),
          atlas_model: (data.gen_model && data.gen_model.includes('seedream')) ? data.gen_model : ATLAS_DEFAULTS.model,
          atlas_size: (data.gen_ratio && data.gen_ratio.includes('*')) ? data.gen_ratio : ATLAS_DEFAULTS.size,
          atlas_output_format: data.gen_output_format ?? ATLAS_DEFAULTS.output_format,
          atlas_thinking: data.gen_thinking ?? ATLAS_DEFAULTS.thinking,
          atlas_prompt_optimization_mode: data.gen_prompt_optimization_mode ?? ATLAS_DEFAULTS.prompt_optimization_mode,
          hf_lora_adapter: data.lora_adapter ?? HF_DEFAULTS.lora_adapter,
          hf_seed: data.seed != null ? String(data.seed) : HF_DEFAULTS.seed,
          hf_randomize_seed: data.randomize_seed ?? HF_DEFAULTS.randomize_seed,
          hf_guidance_scale: data.guidance_scale != null ? String(data.guidance_scale) : HF_DEFAULTS.guidance_scale,
          hf_steps: data.steps != null ? String(data.steps) : HF_DEFAULTS.steps,
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [creatorId, role.id, scene.id]);

  // Fetch the active image provider via SECURITY DEFINER RPC.
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
    const base = savedSceneConfig ?? {
      prompt: '', description: '', tags: '',
      gen_model: role.gen_model || 'FLUX_KLEIN_NSFW',
      gen_ratio: role.gen_ratio || '9:16',
      gen_number_of_images: String(role.gen_number_of_images || 1),
      atlas_model: ATLAS_DEFAULTS.model, atlas_size: ATLAS_DEFAULTS.size,
      atlas_output_format: ATLAS_DEFAULTS.output_format, atlas_thinking: ATLAS_DEFAULTS.thinking,
      atlas_prompt_optimization_mode: ATLAS_DEFAULTS.prompt_optimization_mode,
      hf_lora_adapter: HF_DEFAULTS.lora_adapter, hf_seed: HF_DEFAULTS.seed,
      hf_randomize_seed: HF_DEFAULTS.randomize_seed, hf_guidance_scale: HF_DEFAULTS.guidance_scale,
      hf_steps: HF_DEFAULTS.steps,
    };
    const dirty =
      prompt !== base.prompt ||
      description !== base.description ||
      tags !== base.tags ||
      genConfig.model !== base.gen_model ||
      genConfig.ratio !== base.gen_ratio ||
      genConfig.batch_size !== base.gen_number_of_images ||
      atlasConfig.model !== base.atlas_model ||
      atlasConfig.size !== base.atlas_size ||
      atlasConfig.output_format !== base.atlas_output_format ||
      atlasConfig.thinking !== base.atlas_thinking ||
      atlasConfig.prompt_optimization_mode !== base.atlas_prompt_optimization_mode ||
      hfConfig.lora_adapter !== base.hf_lora_adapter ||
      hfConfig.seed !== base.hf_seed ||
      hfConfig.randomize_seed !== base.hf_randomize_seed ||
      hfConfig.guidance_scale !== base.hf_guidance_scale ||
      hfConfig.steps !== base.hf_steps;
    setIsDirty(dirty);
  }, [prompt, description, tags, genConfig, atlasConfig, hfConfig, savedSceneConfig, role]);

  const isHuggingFace = activeProvider.toLowerCase().includes('hugging');
  const isAtlasCloud = activeProvider.toLowerCase().includes('atlas');
  const finalRequest = useMemo(() => {
    if (isAtlasCloud) {
      return JSON.stringify({
        model: atlasConfig.model,
        prompt: prompt || '',
        images: [identityImageUrl ?? '', roleImageUrl ?? ''],
        size: atlasConfig.size,
        output_format: atlasConfig.output_format,
        thinking: atlasConfig.thinking,
        prompt_optimization_mode: atlasConfig.prompt_optimization_mode,
      }, null, 2);
    }
    const input: Record<string, unknown> = {
      image_assets: [identityImageUrl ?? '', roleImageUrl ?? ''],
      prompt: prompt || '',
    };
    if (isHuggingFace) {
      input.lora_adapter = hfConfig.lora_adapter;
      input.seed = parseInt(hfConfig.seed, 10) || 0;
      input.randomize_seed = hfConfig.randomize_seed;
      input.guidance_scale = parseFloat(hfConfig.guidance_scale) || 1.0;
      input.steps = parseInt(hfConfig.steps, 10) || 4;
    } else {
      input.model = genConfig.model;
      input.ratio = genConfig.ratio;
      input.number_of_images = parseInt(genConfig.batch_size, 10) || 1;
    }
    return JSON.stringify({ tool: genTool, input }, null, 2);
  }, [genTool, identityImageUrl, roleImageUrl, prompt, genConfig, hfConfig, atlasConfig, isHuggingFace, isAtlasCloud]);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      const isHf = activeProvider.toLowerCase().includes('hugging');
      const isAtlas = activeProvider.toLowerCase().includes('atlas');
      const payload = {
        creator_id: creatorId,
        role_id: role.id,
        scene_id: scene.id,
        scene_label: scene.label,
        scenario_id: scene.scenario_id ?? 'scenario-1',
        prompt,
        description,
        tags,
        gen_tool: genTool,
        gen_model: isAtlas ? atlasConfig.model : genConfig.model,
        gen_ratio: isAtlas ? atlasConfig.size : genConfig.ratio,
        gen_number_of_images: isAtlas ? 1 : (parseInt(genConfig.batch_size, 10) || 1),
        identity_asset_id: identityAssetId,
        identity_image_url: identityImageUrl,
        role_image_url: roleImageUrl,
        role_image_asset_id: roleAssetId,
        ...(isHf ? {
          lora_adapter: hfConfig.lora_adapter,
          seed: parseInt(hfConfig.seed, 10) || 0,
          randomize_seed: hfConfig.randomize_seed,
          guidance_scale: parseFloat(hfConfig.guidance_scale) || 1.0,
          steps: parseInt(hfConfig.steps, 10) || 4,
        } : {}),
        ...(isAtlas ? {
          gen_output_format: atlasConfig.output_format,
          gen_thinking: atlasConfig.thinking,
          gen_prompt_optimization_mode: atlasConfig.prompt_optimization_mode,
        } : {}),
      };
      let recordId = sceneProductionId;
      if (recordId) {
        const { error: updateErr } = await supabase
          .from('scene_image_productions')
          .update({ ...payload, updated_at: new Date().toISOString() })
          .eq('id', recordId);
        if (updateErr) throw new Error(updateErr.message);
      } else {
        const { data, error: insertErr } = await supabase
          .from('scene_image_productions')
          .insert(payload)
          .select('id')
          .single();
        if (insertErr) throw new Error(insertErr.message);
        recordId = data.id;
        setSceneProductionId(recordId);
      }
      setSavedSceneConfig({
        prompt, description, tags,
        gen_model: isAtlas ? atlasConfig.model : genConfig.model,
        gen_ratio: isAtlas ? atlasConfig.size : genConfig.ratio,
        gen_number_of_images: String(isAtlas ? 1 : (parseInt(genConfig.batch_size, 10) || 1)),
        atlas_model: atlasConfig.model, atlas_size: atlasConfig.size,
        atlas_output_format: atlasConfig.output_format, atlas_thinking: atlasConfig.thinking,
        atlas_prompt_optimization_mode: atlasConfig.prompt_optimization_mode,
        hf_lora_adapter: hfConfig.lora_adapter, hf_seed: hfConfig.seed,
        hf_randomize_seed: hfConfig.randomize_seed, hf_guidance_scale: hfConfig.guidance_scale,
        hf_steps: hfConfig.steps,
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
    if (isDirty || !sceneProductionId) return;
    setIsGenerating(true);
    setError(null);
    setSceneStatus('Processing');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-scene-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ scene_production_id: sceneProductionId }),
      });
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error ?? `Generation failed (${response.status})`);
      }
      const data = await response.json();
      if (!data.success) throw new Error(data.error ?? 'Generation failed');
      setPreviewUrl(data.image_url);
      setPreviewAssetId(data.asset_id);
      setSceneStatus('Ready');
      onUpdate();
    } catch (e) {
      setError((e as Error).message);
      setSceneStatus('Failed');
    } finally {
      setIsGenerating(false);
    }
  }

  return (
    <div className="card space-y-5 p-4 border-primary-600/20">
      <div className="flex items-center gap-2 pb-2 border-b border-surface-800">
        <Sparkles className="w-4 h-4 text-primary-400" />
        <span className="text-sm font-semibold text-surface-100">Scene Image Production</span>
        <span className="text-xs text-surface-500">— {scene.label}</span>
      </div>

      {/* Description */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Description</label>
        <input
          type="text"
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Human meaning of the scene"
          className="input-field text-sm"
        />
        <p className="text-xs text-surface-600">Human-readable summary of what this scene represents.</p>
      </div>

      {/* Tags */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Tags</label>
        <input
          type="text"
          value={tags}
          onChange={e => setTags(e.target.value)}
          placeholder="#welcome #spa #greeting"
          className="input-field text-sm"
        />
        <p className="text-xs text-surface-600">Machine-matching keys for future LLM matching.</p>
      </div>

      {/* Linked character — fixed, read-only */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Linked Character</label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent-600/10 border border-accent-600/30 text-sm text-accent-300">
          <Lock className="w-3.5 h-3.5 text-accent-400" />
          <span className="font-medium">{linkedCharName}</span>
          <span className="text-xs text-accent-400/70">(fixed — from Character Studio V2)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-900/60 border border-surface-800 text-xs text-surface-400">
          <Lock className="w-3 h-3 text-surface-600" />
          <span className="text-surface-600 min-w-[110px]">Identity Asset ID</span>
          <span className="font-mono break-all text-surface-400">{identityAssetId ?? '—'}</span>
        </div>
      </div>

      {/* Linked role image — fixed, read-only */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Linked Role Image</label>
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-900/60 border border-surface-800 text-sm text-surface-300">
          {roleImageUrl ? (
            <img src={roleImageUrl} alt="" className="w-8 h-8 rounded object-cover flex-shrink-0" />
          ) : (
            <ImageIcon className="w-4 h-4 text-surface-600 flex-shrink-0" />
          )}
          <span className="font-medium truncate">{role.name}</span>
          <span className="text-xs text-surface-500">(fixed — from Role Image)</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-900/60 border border-surface-800 text-xs text-surface-400">
          <Lock className="w-3 h-3 text-surface-600" />
          <span className="text-surface-600 min-w-[110px]">Role Asset ID</span>
          <span className="font-mono break-all text-surface-400">{roleAssetId ?? '—'}</span>
        </div>
      </div>

      {/* Scene Prompt */}
      <div className="space-y-1">
        <label className="text-xs font-medium text-surface-400">Scene Prompt</label>
        <textarea
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="Scene-specific prompt: clothing, pose, environment, action…"
          rows={4}
          className="input-field text-sm resize-y"
        />
        <p className="text-xs text-surface-600">Describe the scene. Combined with the character identity and role image to produce the scene image.</p>
      </div>

      {/* Generation Configuration — provider-aware */}
      <GenerationConfigEditor
        values={genConfig}
        onChange={setGenConfig}
        title="Generation Configuration"
        providerName={activeProvider}
        hfValues={hfConfig}
        onChangeHf={setHfConfig}
        atlasValues={atlasConfig}
        onChangeAtlas={setAtlasConfig}
      />
      <p className="text-xs text-surface-600 -mt-2">image_assets = [character_identity_image_url, role_image_url] — both fixed from linked assets.</p>

      {/* Final Request Box */}
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Code2 className="w-3.5 h-3.5 text-surface-500" />
          <label className="text-xs font-medium text-surface-400">Final Request (read-only)</label>
        </div>
        <pre className="px-3 py-2.5 rounded-lg bg-surface-900/80 border border-surface-800 text-xs font-mono text-surface-300 overflow-x-auto whitespace-pre-wrap break-all max-h-64 overflow-y-auto">
{finalRequest}
        </pre>
      </div>

      {/* Buttons */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
          <AlertCircle className="w-4 h-4" />{error}
        </div>
      )}
      <div className="flex gap-2 pt-2 border-t border-surface-800">
        <button onClick={handleSave} disabled={isSaving} className="btn-primary text-sm gap-1.5">
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
          Save
        </button>
        <button
          onClick={handleGenerate}
          disabled={isDirty || isGenerating || isSaving || !prompt.trim() || !sceneProductionId}
          className="btn-secondary text-sm gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
          title={isDirty ? 'Save changes before generating' : !sceneProductionId ? 'Save first to create a scene record' : undefined}
        >
          {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
          {previewUrl ? 'Regenerate' : 'Generate'}
        </button>
        {isDirty && <span className="text-xs text-warning-400 self-center">Unsaved changes — Save before generating</span>}
        {!isDirty && !sceneProductionId && <span className="text-xs text-surface-500 self-center">Save first to create a scene record</span>}
        {sceneStatus === 'Processing' && <span className="text-xs text-primary-400 self-center">Processing…</span>}
        {sceneStatus === 'Ready' && <span className="text-xs text-success-400 self-center">Ready</span>}
        {sceneStatus === 'Failed' && <span className="text-xs text-danger-400 self-center">Failed</span>}
      </div>

      {/* Video Generator — ZenCreator: visible when scene image is Ready AND provider is ZenCreator */}
      {previewUrl && sceneStatus === 'Ready' && activeProvider.toLowerCase().includes('zencreator') && (
        <VideoGenerator
          sceneProductionId={sceneProductionId}
          firstFrameUrl={previewUrl}
          videoConfig={videoConfig}
          setVideoConfig={setVideoConfig}
          videoUrl={videoUrl}
          videoAssetId={videoAssetId}
          videoStatus={videoStatus}
          isGeneratingVideo={isGeneratingVideo}
          videoError={videoError}
          isSavingVideoConfig={isSavingVideoConfig}
          onSaveConfig={async () => {
            if (!sceneProductionId) return;
            setIsSavingVideoConfig(true);
            try {
              const { error: updErr } = await supabase
                .from('scene_image_productions')
                .update({
                  video_prompt: videoConfig.prompt,
                  video_model: videoConfig.model,
                  video_duration: videoConfig.duration,
                  video_resolution: videoConfig.resolution,
                  video_generate_audio: videoConfig.generate_audio,
                  video_camera_fixed: videoConfig.camera_fixed,
                  video_prompt_extend: videoConfig.prompt_extend,
                  video_negative_prompt: videoConfig.negative_prompt,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', sceneProductionId);
              if (updErr) throw new Error(updErr.message);
            } catch (e) {
              setVideoError((e as Error).message);
            } finally {
              setIsSavingVideoConfig(false);
            }
          }}
          onGenerate={async () => {
            if (!sceneProductionId) return;
            // Save the video config first
            setIsSavingVideoConfig(true);
            try {
              await supabase
                .from('scene_image_productions')
                .update({
                  video_prompt: videoConfig.prompt,
                  video_model: videoConfig.model,
                  video_duration: videoConfig.duration,
                  video_resolution: videoConfig.resolution,
                  video_generate_audio: videoConfig.generate_audio,
                  video_camera_fixed: videoConfig.camera_fixed,
                  video_prompt_extend: videoConfig.prompt_extend,
                  video_negative_prompt: videoConfig.negative_prompt,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', sceneProductionId);
            } catch { /* will be caught below */ } finally {
              setIsSavingVideoConfig(false);
            }
            setIsGeneratingVideo(true);
            setVideoError(null);
            setVideoStatus('Processing');
            try {
              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
              const response = await fetch(`${supabaseUrl}/functions/v1/generate-scene-video`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                },
                body: JSON.stringify({ scene_production_id: sceneProductionId }),
              });
              const data = await response.json();
              if (data.still_processing) {
                // Video still processing on provider — keep showing Processing.
                // Auto-recovery will resume it.
                return;
              }
              if (!response.ok || !data.success) {
                throw new Error(data.error ?? data.detail ?? `Video generation failed (${response.status})`);
              }
              setVideoUrl(data.video_url);
              setVideoAssetId(data.asset_id);
              setVideoStatus('Ready');
              onUpdate();
            } catch (e) {
              // The edge function may have succeeded and updated the DB but the
              // HTTP response was lost (e.g. platform timeout after DB write).
              // Poll the DB before declaring failure.
              let dbReady = false;
              for (let i = 0; i < 60; i++) {
                if (i > 0) await new Promise(r => setTimeout(r, 5000));
                const { data: vData } = await supabase
                  .from('scene_image_productions')
                  .select('video_url, video_asset_id, video_status')
                  .eq('id', sceneProductionId)
                  .maybeSingle();
                if (vData?.video_url && (vData.video_status === 'Ready' || vData.video_status === 'Processing')) {
                  setVideoUrl(vData.video_url);
                  setVideoAssetId(vData.video_asset_id);
                  setVideoStatus('Ready');
                  dbReady = true;
                  break;
                }
                if (vData?.video_status === 'Failed') break;
              }
              if (!dbReady) {
                const { data: finalCheck } = await supabase
                  .from('scene_image_productions')
                  .select('video_status')
                  .eq('id', sceneProductionId)
                  .maybeSingle();
                if (finalCheck?.video_status === 'Processing') {
                  const pollInterval = setInterval(async () => {
                    const { data: vData } = await supabase
                      .from('scene_image_productions')
                      .select('video_url, video_asset_id, video_status')
                      .eq('id', sceneProductionId)
                      .maybeSingle();
                    if (vData?.video_url && (vData.video_status === 'Ready' || vData.video_status === 'Processing')) {
                      clearInterval(pollInterval);
                      setVideoUrl(vData.video_url);
                      setVideoAssetId(vData.video_asset_id);
                      setVideoStatus('Ready');
                      onUpdate();
                    } else if (vData?.video_status === 'Failed') {
                      clearInterval(pollInterval);
                      setVideoError('Video generation failed');
                      setVideoStatus('Failed');
                    }
                  }, 10_000);
                } else {
                  setVideoError((e as Error).message);
                  setVideoStatus('Failed');
                }
              }
            } finally {
              setIsGeneratingVideo(false);
            }
          }}
        />
      )}

      {/* Video Generator — Atlas Cloud Wan 3.0 I2V: visible when scene image is Ready AND provider is Atlas Cloud */}
      {previewUrl && sceneStatus === 'Ready' && activeProvider.toLowerCase().includes('atlas') && (
        <Wan30VideoGenerator
          sceneProductionId={sceneProductionId}
          firstFrameUrl={previewUrl}
          wanConfig={wan30Config}
          setWanConfig={setWan30Config}
          videoUrl={videoUrl}
          videoAssetId={videoAssetId}
          videoStatus={videoStatus}
          isGeneratingVideo={isGeneratingVideo}
          videoError={videoError}
          isSavingVideoConfig={isSavingVideoConfig}
          onSaveConfig={async () => {
            if (!sceneProductionId) return;
            setIsSavingVideoConfig(true);
            try {
              const { error: updErr } = await supabase
                .from('scene_image_productions')
                .update({
                  video_provider: 'atlas',
                  video_prompt: wan30Config.prompt,
                  video_wan_model: wan30Config.model,
                  video_wan_resolution: wan30Config.resolution,
                  video_wan_duration: wan30Config.duration,
                  video_wan_audio: wan30Config.audio,
                  video_wan_last_image_url: wan30Config.last_image_url,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', sceneProductionId);
              if (updErr) throw new Error(updErr.message);
            } catch (e) {
              setVideoError((e as Error).message);
            } finally {
              setIsSavingVideoConfig(false);
            }
          }}
          onGenerate={async () => {
            if (!sceneProductionId) return;
            setIsSavingVideoConfig(true);
            try {
              await supabase
                .from('scene_image_productions')
                .update({
                  video_provider: 'atlas',
                  video_prompt: wan30Config.prompt,
                  video_wan_model: wan30Config.model,
                  video_wan_resolution: wan30Config.resolution,
                  video_wan_duration: wan30Config.duration,
                  video_wan_audio: wan30Config.audio,
                  video_wan_last_image_url: wan30Config.last_image_url,
                  updated_at: new Date().toISOString(),
                })
                .eq('id', sceneProductionId);
            } catch { /* will be caught below */ } finally {
              setIsSavingVideoConfig(false);
            }
            setIsGeneratingVideo(true);
            setVideoError(null);
            setVideoStatus('Processing');
            try {
              const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
              const response = await fetch(`${supabaseUrl}/functions/v1/generate-scene-video`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
                },
                body: JSON.stringify({ scene_production_id: sceneProductionId }),
              });
              const data = await response.json();
              if (data.still_processing) {
                // Video still processing on provider — keep showing Processing.
                // Auto-recovery will resume it.
                return;
              }
              if (!response.ok || !data.success) {
                throw new Error(data.error ?? data.detail ?? `Video generation failed (${response.status})`);
              }
              setVideoUrl(data.video_url);
              setVideoAssetId(data.asset_id);
              setVideoStatus('Ready');
              onUpdate();
            } catch (e) {
              // The edge function may have succeeded and updated the DB but the
              // HTTP response was lost (e.g. platform timeout after DB write).
              // Poll the DB before declaring failure.
              let dbReady = false;
              for (let i = 0; i < 60; i++) {
                if (i > 0) await new Promise(r => setTimeout(r, 5000));
                const { data: vData } = await supabase
                  .from('scene_image_productions')
                  .select('video_url, video_asset_id, video_status')
                  .eq('id', sceneProductionId)
                  .maybeSingle();
                if (vData?.video_url && (vData.video_status === 'Ready' || vData.video_status === 'Processing')) {
                  setVideoUrl(vData.video_url);
                  setVideoAssetId(vData.video_asset_id);
                  setVideoStatus('Ready');
                  dbReady = true;
                  break;
                }
                if (vData?.video_status === 'Failed') break;
              }
              if (!dbReady) {
                const { data: finalCheck } = await supabase
                  .from('scene_image_productions')
                  .select('video_status')
                  .eq('id', sceneProductionId)
                  .maybeSingle();
                if (finalCheck?.video_status === 'Processing') {
                  const pollInterval = setInterval(async () => {
                    const { data: vData } = await supabase
                      .from('scene_image_productions')
                      .select('video_url, video_asset_id, video_status')
                      .eq('id', sceneProductionId)
                      .maybeSingle();
                    if (vData?.video_url && (vData.video_status === 'Ready' || vData.video_status === 'Processing')) {
                      clearInterval(pollInterval);
                      setVideoUrl(vData.video_url);
                      setVideoAssetId(vData.video_asset_id);
                      setVideoStatus('Ready');
                      onUpdate();
                    } else if (vData?.video_status === 'Failed') {
                      clearInterval(pollInterval);
                      setVideoError('Video generation failed');
                      setVideoStatus('Failed');
                    }
                  }, 10_000);
                } else {
                  setVideoError((e as Error).message);
                  setVideoStatus('Failed');
                }
              }
            } finally {
              setIsGeneratingVideo(false);
            }
          }}
        />
      )}

      {/* Preview area */}
      {previewUrl && (
        <div className="space-y-2 pt-3 border-t border-surface-800">
          <div className="flex items-center gap-2">
            <ImageIcon className="w-3.5 h-3.5 text-surface-500" />
            <span className="text-xs font-medium text-surface-400">Preview</span>
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            <img
              src={previewUrl}
              alt="Generated scene image"
              className="w-full sm:w-48 rounded-lg border border-surface-700 object-cover"
            />
            <div className="flex-1 space-y-1.5 text-xs">
              <div className="flex gap-2">
                <span className="text-surface-500 min-w-[80px]">Asset ID</span>
                <span className="font-mono break-all text-surface-300">{previewAssetId ?? '—'}</span>
              </div>
              <div className="flex gap-2">
                <span className="text-surface-500 min-w-[80px]">Image URL</span>
                <span className="font-mono break-all text-surface-300">{previewUrl}</span>
              </div>
              <a
                href={previewUrl}
                download
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary-600/15 text-primary-400 border border-primary-600/20 text-xs hover:bg-primary-600/25 transition-colors w-fit"
              >
                <Download className="w-3.5 h-3.5" />Download
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
