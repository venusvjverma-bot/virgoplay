/**
 * Character Studio V2 — OFF mode (client selection experience)
 *
 * Shown when Development View is OFF (or for non-Mother accounts who are
 * always forced OFF). Renders a clean, premium swipe-based character
 * picker — no studio management tools.
 *
 * Data comes from loadActiveCharacters() in character-studio-v2.ts:
 *   character_id, name, bio, identity_image_url, identity_asset_id
 *
 * Select action reuses the same setSelectedCharacter() RPC as ON mode.
 */

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight, X, Loader2, Star, Check, Lock, Upload, Sparkles, RefreshCw, Trash2, Save, ArrowRight } from 'lucide-react';
import FishMascot from './FishMascot';
import {
  setSelectedCharacter,
  loadMyAiOverride,
  uploadMyAiOverrideImage,
  selectMyAiOverrideImage,
  deleteMyAiOverride,
  saveMyAiDisplayName,
  loadCustomizeAiOverride,
  saveCustomizeAiAppearance,
  removeCustomizeAiImage,
  type ActiveCharacterSummary,
  type CustomizeAiOverrideRow,
} from '../lib/character-studio-v2';
import {
  createEmptyAppearance,
  APPEARANCE_FIELD_OPTIONS,
  APPEARANCE_FIELD_LABELS,
  buildMyAiPrompt,
  type MyAiAppearance,
} from '../lib/my-ai-prompt-builder';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { loadWallet, deductGenerationCost, IMAGE_COST, type WalletInfo } from '../lib/wallet';

interface OffModeExperienceProps {
  characters: ActiveCharacterSummary[];
  loading: boolean;
  selectedCharacterId: string | null;
  onSelected: () => void;
  headerSlot?: ReactNode;
  onGoToRoleStudio?: () => void;
  locked?: boolean;
  onLockedClick?: () => void;
  isMotherCreator?: boolean;
  onDeleteMyAiImage?: () => Promise<void> | void;
}

const SWIPE_THRESHOLD = 50;
const BIO_OPEN_THRESHOLD = 40;
const BIO_CLOSE_THRESHOLD = 50;

// Shared easing for snap-back / sheet transitions
const SNAP_EASE = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)';
const SNAP_DURATION = '0.35s';
const SHEET_DURATION = '0.4s';

// Appearance Dropdown — premium custom select for Customize AI fields.
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

export default function OffModeExperience({
  characters,
  loading,
  selectedCharacterId,
  onSelected,
  headerSlot,
  onGoToRoleStudio,
  locked = false,
  onLockedClick,
  isMotherCreator = false,
  onDeleteMyAiImage,
}: OffModeExperienceProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [nameKey, setNameKey] = useState(0);
  const [bioOpen, setBioOpen] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Child Creator My AI override image
  const [myAiOverrideUrl, setMyAiOverrideUrl] = useState<string | null>(null);
  const [myAiUploading, setMyAiUploading] = useState(false);
  const [myAiGeneratedUrl, setMyAiGeneratedUrl] = useState<string | null>(null);
  const [myAiGeneratedStatus, setMyAiGeneratedStatus] = useState<string>('');
  const [myAiGenerating, setMyAiGenerating] = useState(false);
  const [myAiSelectedUrl, setMyAiSelectedUrl] = useState<string | null>(null);
  const [myAiSelecting, setMyAiSelecting] = useState(false);
  const [myAiDeleting, setMyAiDeleting] = useState(false);
  const [motherDeleting, setMotherDeleting] = useState(false);
  const myAiFileInputRef = useRef<HTMLInputElement | null>(null);

  // Display name override — Child Creator's custom client-facing name
  const [displayName, setDisplayName] = useState('');
  const [displayNameDirty, setDisplayNameDirty] = useState(false);
  const [displayNameSaving, setDisplayNameSaving] = useState(false);

  // My AI state machine for the Child Creator:
  //   empty       → no override row at all (Upload ON)
  //   uploaded    → override exists, no generated image (Keep + Generate + Delete ON)
  //   candidate   → generated image exists, not yet selected (Select + Regenerate ON)
  //   selected    → image chosen as active identity (Delete ON, rest OFF)
  const myAiState: 'empty' | 'uploaded' | 'candidate' | 'selected' =
    myAiSelectedUrl ? 'selected'
      : myAiGeneratedUrl ? 'candidate'
      : myAiOverrideUrl ? 'uploaded'
      : 'empty';

  // Identify the My AI card (first in the list, name === 'My AI')
  const myAiCharacter = characters.find(c => c.name === 'My AI') ?? null;

  // ── Customize AI state ───────────────────────────────────────────────────
  const customizeAiCharacter = characters.find(c => c.name === 'Customize AI') ?? null;
  const [customizeAiPopupOpen, setCustomizeAiPopupOpen] = useState(false);
  const [customizeAiAppearance, setCustomizeAiAppearance] = useState<MyAiAppearance>(createEmptyAppearance());
  const [customizeAiOverride, setCustomizeAiOverride] = useState<CustomizeAiOverrideRow | null>(null);
  const [customizeAiImageUrl, setCustomizeAiImageUrl] = useState<string | null>(null);
  const [customizeAiSaving, setCustomizeAiSaving] = useState(false);
  const [customizeAiGenerating, setCustomizeAiGenerating] = useState(false);
  const [customizeAiGenStatus, setCustomizeAiGenStatus] = useState('');
  const [customizeAiRemoving, setCustomizeAiRemoving] = useState(false);
  const [customizeAiConfirmRemove, setCustomizeAiConfirmRemove] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  // Wallet — used to charge Customize AI generation (same mechanism as Role / Scene image)
  const { creator } = useAuth();
  const [walletInfo, setWalletInfo] = useState<WalletInfo | null>(null);

  // Load the creator's own Customize AI override
  useEffect(() => {
    if (!customizeAiCharacter) {
      setCustomizeAiOverride(null);
      setCustomizeAiImageUrl(null);
      setCustomizeAiAppearance(createEmptyAppearance());
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const ov = await loadCustomizeAiOverride(customizeAiCharacter.character_id);
        if (!cancelled) {
          setCustomizeAiOverride(ov);
          setCustomizeAiImageUrl(ov?.selected_image_url ?? ov?.generated_image_url ?? null);
          if (ov?.appearance_data) {
            setCustomizeAiAppearance({ ...createEmptyAppearance(), ...ov.appearance_data } as MyAiAppearance);
          } else {
            setCustomizeAiAppearance(createEmptyAppearance());
          }
        }
      } catch {
        if (!cancelled) {
          setCustomizeAiOverride(null);
          setCustomizeAiImageUrl(null);
          setCustomizeAiAppearance(createEmptyAppearance());
        }
      }
    })();
    return () => { cancelled = true; };
  }, [customizeAiCharacter?.character_id]);

  function handleCustomizeAiAppearanceChange(field: keyof MyAiAppearance, value: string) {
    setCustomizeAiAppearance(prev => ({ ...prev, [field]: value }));
  }

  async function handleCustomizeAiSave() {
    if (!customizeAiCharacter) return;
    setCustomizeAiSaving(true);
    try {
      const prompt = buildMyAiPrompt(customizeAiAppearance);
      await saveCustomizeAiAppearance(customizeAiCharacter.character_id, customizeAiAppearance as unknown as Record<string, string>, prompt);
      const ov = await loadCustomizeAiOverride(customizeAiCharacter.character_id);
      setCustomizeAiOverride(ov);
      showToast('Appearance saved');
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message);
    } finally {
      setCustomizeAiSaving(false);
    }
  }

  async function handleCustomizeAiGenerate() {
    if (!customizeAiCharacter || !customizeAiOverride) {
      showToast('Save your appearance selections first');
      return;
    }
    setCustomizeAiGenerating(true);
    setCustomizeAiGenStatus('Processing');
    try {
      // Charge wallet — same mechanism as Role Image / Scene Image production
      if (!isMotherCreator) {
        let wallet = walletInfo;
        if (!wallet && creator?.id) {
          wallet = await loadWallet(creator.id);
          setWalletInfo(wallet);
        }
        if (!wallet) {
          throw new Error('Wallet not found. Please try again.');
        }
        const result = await deductGenerationCost(wallet.id, IMAGE_COST, `Customize AI image: ${customizeAiCharacter.name}`);
        if (!result.success) {
          throw new Error('Insufficient balance. Please add funds to your wallet.');
        }
        setWalletInfo(prev => prev ? { ...prev, available_balance: result.newBalance } : prev);
      }
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-role-image-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({
          customize_ai: true,
          character_id: customizeAiCharacter.character_id,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? `Generation failed (${response.status})`);
      }
      const imageUrl = data.image_url as string;
      setCustomizeAiImageUrl(imageUrl);
      setCustomizeAiGenStatus('Ready');
      const ov = await loadCustomizeAiOverride(customizeAiCharacter.character_id);
      setCustomizeAiOverride(ov);
      showToast('Customize AI image generated');
    } catch (e) {
      setCustomizeAiGenStatus('Failed');
      showToast('Generation failed: ' + (e as Error).message);
    } finally {
      setCustomizeAiGenerating(false);
    }
  }

  async function handleCustomizeAiRemove() {
    if (!customizeAiCharacter) return;
    setCustomizeAiRemoving(true);
    try {
      await removeCustomizeAiImage(customizeAiCharacter.character_id);
      setCustomizeAiImageUrl(null);
      setCustomizeAiGenStatus('');
      setCustomizeAiAppearance(createEmptyAppearance());
      setCustomizeAiConfirmRemove(false);
      const ov = await loadCustomizeAiOverride(customizeAiCharacter.character_id);
      setCustomizeAiOverride(ov);
      showToast('Customize AI image removed');
    } catch (e) {
      showToast('Remove failed: ' + (e as Error).message);
    } finally {
      setCustomizeAiRemoving(false);
    }
  }

  // Load the Child Creator's own My AI override (uploaded + generated images)
  useEffect(() => {
    if (!myAiCharacter) {
      setMyAiOverrideUrl(null);
      setMyAiGeneratedUrl(null);
      setMyAiGeneratedStatus('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const override = await loadMyAiOverride(myAiCharacter.character_id);
        if (!cancelled) {
          setMyAiOverrideUrl(override?.image_url ?? null);
          setMyAiGeneratedUrl(override?.generated_image_url ?? null);
          setMyAiGeneratedStatus(override?.generated_image_status ?? '');
          setMyAiSelectedUrl(override?.selected_image_url ?? null);
          setDisplayName(override?.display_name ?? '');
          setDisplayNameDirty(false);
        }
      } catch {
        if (!cancelled) {
          setMyAiOverrideUrl(null);
          setMyAiGeneratedUrl(null);
          setMyAiGeneratedStatus('');
          setMyAiSelectedUrl(null);
          setDisplayName('');
          setDisplayNameDirty(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, [myAiCharacter?.character_id]);

  async function handleMyAiUpload(file: File) {
    if (!myAiCharacter) return;
    setMyAiUploading(true);
    try {
      const url = await uploadMyAiOverrideImage(myAiCharacter.character_id, file);
      setMyAiOverrideUrl(url);
      showToast('My AI image uploaded');
    } catch (e) {
      showToast('Upload failed: ' + (e as Error).message);
    } finally {
      setMyAiUploading(false);
    }
  }

  async function handleMyAiGenerate() {
    if (!myAiCharacter) return;
    setMyAiGenerating(true);
    setMyAiGeneratedStatus('Processing');
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`${supabaseUrl}/functions/v1/generate-role-image-v2`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token}`,
        },
        body: JSON.stringify({
          my_ai_child: true,
          character_id: myAiCharacter.character_id,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error ?? `Generation failed (${response.status})`);
      }
      setMyAiGeneratedUrl(data.image_url);
      setMyAiGeneratedStatus('Ready');
      setMyAiSelectedUrl(data.image_url);
      showToast('My AI image generated');
    } catch (e) {
      setMyAiGeneratedStatus('Failed');
      showToast('Generation failed: ' + (e as Error).message);
    } finally {
      setMyAiGenerating(false);
    }
  }

  async function handleMyAiKeep() {
    if (!myAiCharacter || !myAiOverrideUrl) return;
    setMyAiSelecting(true);
    try {
      await selectMyAiOverrideImage(myAiCharacter.character_id, myAiOverrideUrl);
      setMyAiSelectedUrl(myAiOverrideUrl);
      showToast('My AI image kept');
    } catch (e) {
      showToast('Keep failed: ' + (e as Error).message);
    } finally {
      setMyAiSelecting(false);
    }
  }

  async function handleMyAiSelect() {
    if (!myAiCharacter || !myAiGeneratedUrl) return;
    setMyAiSelecting(true);
    try {
      await selectMyAiOverrideImage(myAiCharacter.character_id, myAiGeneratedUrl);
      setMyAiSelectedUrl(myAiGeneratedUrl);
      showToast('My AI image selected');
    } catch (e) {
      showToast('Select failed: ' + (e as Error).message);
    } finally {
      setMyAiSelecting(false);
    }
  }

  async function handleSaveDisplayName() {
    if (!myAiCharacter) return;
    setDisplayNameSaving(true);
    try {
      await saveMyAiDisplayName(myAiCharacter.character_id, displayName);
      setDisplayNameDirty(false);
      showToast('Display name saved');
    } catch (e) {
      showToast('Save failed: ' + (e as Error).message);
    } finally {
      setDisplayNameSaving(false);
    }
  }

  async function handleMyAiDelete() {
    if (!myAiCharacter) return;
    if (isMotherCreator) {
      setMotherDeleting(true);
      try {
        await onDeleteMyAiImage?.();
        showToast('My AI image deleted');
        onSelected();
      } catch (e) {
        showToast('Delete failed: ' + (e as Error).message);
      } finally {
        setMotherDeleting(false);
      }
      return;
    }
    setMyAiDeleting(true);
    try {
      await deleteMyAiOverride(myAiCharacter.character_id);
      setMyAiOverrideUrl(null);
      setMyAiGeneratedUrl(null);
      setMyAiGeneratedStatus('');
      setMyAiSelectedUrl(null);
      showToast('My AI image deleted');
    } catch (e) {
      showToast('Delete failed: ' + (e as Error).message);
    } finally {
      setMyAiDeleting(false);
    }
  }

  // Drag tracking — horizontal character swipe
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  // Drag tracking — bio sheet vertical drag
  const [bioDragY, setBioDragY] = useState(0);
  const [isBioDragging, setIsBioDragging] = useState(false);

  // Touch start refs (separate for stage vs bio sheet)
  const stageTouchStart = useRef<{ x: number; y: number } | null>(null);
  const bioTouchStart = useRef<{ x: number; y: number } | null>(null);
  const bioContentRef = useRef<HTMLDivElement | null>(null);

  // Direction lock: once a drag is predominantly horizontal or vertical,
  // lock to that axis until release to prevent jitter.
  const dragAxis = useRef<'x' | 'y' | null>(null);

  // Lock body scroll when bio sheet is open to prevent any stage shift
  useEffect(() => {
    if (bioOpen) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [bioOpen]);

  // Clamp index when characters change
  useEffect(() => {
    if (currentIndex >= characters.length && characters.length > 0) {
      setCurrentIndex(0);
    }
  }, [characters.length, currentIndex]);

  // Jump to the already-selected character so the stage shows it,
  // not the first card in the list (which is "My AI").
  useEffect(() => {
    if (!selectedCharacterId || characters.length === 0) return;
    const idx = characters.findIndex(c => c.character_id === selectedCharacterId);
    if (idx >= 0 && idx !== currentIndex) {
      setCurrentIndex(idx);
    }
  }, [selectedCharacterId, characters]);

  const current = characters[currentIndex];

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const goNext = useCallback(() => {
    setNameKey(k => k + 1);
    setCurrentIndex(i => (i + 1) % Math.max(characters.length, 1));
  }, [characters.length]);

  const goPrev = useCallback(() => {
    setNameKey(k => k + 1);
    setCurrentIndex(i => (i - 1 + Math.max(characters.length, 1)) % Math.max(characters.length, 1));
  }, [characters.length]);

  // ── Stage touch handlers (horizontal character swipe) ─────────────────────
  function onStageTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    stageTouchStart.current = { x: t.clientX, y: t.clientY };
    dragAxis.current = null;
    setIsDragging(true);
  }

  function onStageTouchMove(e: React.TouchEvent) {
    if (!stageTouchStart.current || bioOpen) return;
    if (locked) return;
    const t = e.touches[0];
    const dx = t.clientX - stageTouchStart.current.x;
    const dy = t.clientY - stageTouchStart.current.y;

    // Lock axis on first significant movement
    if (!dragAxis.current) {
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) {
        dragAxis.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      } else {
        return;
      }
    }

    if (dragAxis.current === 'x') {
      e.preventDefault();
      setDragX(dx);
    }
  }

  function onStageTouchEnd(e: React.TouchEvent) {
    if (!stageTouchStart.current) return;
    setIsDragging(false);

    if (bioOpen) {
      stageTouchStart.current = null;
      dragAxis.current = null;
      return;
    }

    if (locked) {
      setDragX(0);
      stageTouchStart.current = null;
      dragAxis.current = null;
      onLockedClick?.();
      return;
    }

    const t = e.changedTouches[0];
    const dx = t.clientX - stageTouchStart.current.x;
    const dy = t.clientY - stageTouchStart.current.y;

    if (dragAxis.current === 'x' && Math.abs(dx) > SWIPE_THRESHOLD) {
      if (dx < 0) goNext();
      else goPrev();
    } else if (dragAxis.current === 'y' && dy < -BIO_OPEN_THRESHOLD) {
      setBioOpen(true);
    } else if (!dragAxis.current && Math.abs(dx) > SWIPE_THRESHOLD) {
      setNameKey(k => k + 1);
      if (dx < 0) goNext();
      else goPrev();
    } else if (!dragAxis.current && dy < -BIO_OPEN_THRESHOLD) {
      setBioOpen(true);
    }

    setDragX(0);
    stageTouchStart.current = null;
    dragAxis.current = null;
  }

  // ── Bio sheet touch handlers (vertical drag to close) ───────────────────
  function onBioTouchStart(e: React.TouchEvent) {
    e.stopPropagation();
    const t = e.touches[0];
    bioTouchStart.current = { x: t.clientX, y: t.clientY };
    setIsBioDragging(true);
  }

  function onBioTouchMove(e: React.TouchEvent) {
    if (!bioTouchStart.current) return;
    e.stopPropagation();
    const t = e.touches[0];
    const dy = t.clientY - bioTouchStart.current.y;

    if (dy > 0) {
      // Only intercept if content is scrolled to top
      const content = bioContentRef.current;
      if (content && content.scrollTop > 0) return;
      setBioDragY(dy);
    }
  }

  function onBioTouchEnd(e: React.TouchEvent) {
    if (!bioTouchStart.current) return;
    e.stopPropagation();
    setIsBioDragging(false);

    const t = e.changedTouches[0];
    const dy = t.clientY - bioTouchStart.current.y;

    if (dy > BIO_CLOSE_THRESHOLD) {
      setBioOpen(false);
    }

    setBioDragY(0);
    bioTouchStart.current = null;
  }

  // ── Select action ────────────────────────────────────────────────────────
  async function handleSelect(char: ActiveCharacterSummary) {
    setSelecting(true);
    try {
      await setSelectedCharacter(char.character_id);
      showToast(`${char.name} selected`);
      onSelected();
    } catch {
      showToast('Failed to select character');
    } finally {
      setSelecting(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center" style={{ height: '70vh' }}>
        <Loader2 className="w-7 h-7 text-surface-500 animate-spin" />
      </div>
    );
  }

  // ── No active characters ────────────────────────────────────────────────
  if (characters.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ height: '70vh' }}>
        <div className="w-16 h-16 rounded-full bg-surface-800/60 flex items-center justify-center mb-4">
          <Star className="w-7 h-7 text-surface-600" />
        </div>
        <p className="text-sm text-surface-400">No active characters yet</p>
        <p className="text-xs text-surface-600 mt-1">Characters will appear here once activated</p>
      </div>
    );
  }

  const isSelected = selectedCharacterId === current?.character_id;

  // My AI card needs special handling for the Select/Selected + Select Role row:
  //   - No usable image (empty) → Select disabled, Select Role disabled
  //   - Has image but not selected → Select active, Select Role disabled
  //   - Selected → Selected badge, Select Role active (same as normal V2)
  const isMyAiCard = current?.character_id === myAiCharacter?.character_id;
  const myAiHasImage = isMyAiCard && myAiState !== 'empty';
  const myAiSelectDisabled = isMyAiCard && (myAiState === 'empty' || myAiState === 'uploaded');

  // Drag-based opacity: image fades slightly as you drag for a natural feel
  const dragOpacity = isDragging ? Math.max(0.5, 1 - Math.abs(dragX) / 400) : 1;

  return (
    <div className="relative w-full h-full flex flex-col overflow-hidden overscroll-none select-none" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      {/* ── Studio header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center justify-center pt-3 pb-2 flex-shrink-0 studio-header-in">
        <div className="flex items-center gap-3">
          <span className="h-px w-8 bg-gradient-to-r from-transparent to-violet-400/40" />
          <h1 className="text-[11px] font-bold uppercase tracking-[0.2em] text-surface-400">
            Choose
            <span className="ml-1 text-violet-300">Your AI</span>
          </h1>
          <span className="h-px w-8 bg-gradient-to-l from-transparent to-violet-400/40" />
        </div>
        <p className="text-[10px] text-surface-500 mt-1 tracking-wide">Select a character to enter Studio</p>
      </div>

      {/* ── Main stage ────────────────────────────────────────────────────── */}
      <div
        className="relative w-full mx-auto rounded-3xl overflow-hidden bg-black/60 flex-1 min-h-0 shadow-2xl border border-white/5"
        style={{ maxHeight: '680px', touchAction: 'none', willChange: 'transform' }}
        onTouchStart={onStageTouchStart}
        onTouchMove={onStageTouchMove}
        onTouchEnd={onStageTouchEnd}
      >
        {/* Header slot overlay (Dev View toggle) */}
        {headerSlot && (
          <div
            className="absolute top-3 right-3 z-20"
            onTouchStart={(e) => e.stopPropagation()}
            onTouchEnd={(e) => e.stopPropagation()}
          >
            {headerSlot}
          </div>
        )}

        {/* Prev / Next carousel controls */}
        {characters.length > 1 && !locked && (
          <>
            <button
              onClick={goPrev}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/30 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/70 hover:bg-black/50 hover:text-white hover:border-white/20 transition-all duration-200 active:scale-90"
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              aria-label="Previous character"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={goNext}
              className="absolute right-2 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-black/30 backdrop-blur-md border border-white/10 flex items-center justify-center text-white/70 hover:bg-black/50 hover:text-white hover:border-white/20 transition-all duration-200 active:scale-90"
              onTouchStart={(e) => e.stopPropagation()}
              onTouchEnd={(e) => e.stopPropagation()}
              aria-label="Next character"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </>
        )}

        <div
          key={currentIndex}
          className="studio-char-enter"
          style={{
            width: '100%',
            height: '100%',
            transform: `translate3d(${dragX}px, 0, 0)`,
            transition: isDragging ? 'none' : `transform ${SNAP_DURATION} ${SNAP_EASE}`,
            willChange: 'transform',
          }}
        >
          {(() => {
            const isMyAiCard = current?.character_id === myAiCharacter?.character_id;
            const isCustomizeAiCard = current?.character_id === customizeAiCharacter?.character_id;
            const displayUrl = isMyAiCard
              ? (isMotherCreator
                  ? (current?.identity_image_url ?? null)
                  : (myAiSelectedUrl ?? myAiGeneratedUrl ?? myAiOverrideUrl ?? null))
              : isCustomizeAiCard
                ? (customizeAiImageUrl ?? null)
                : current?.identity_image_url;

            if (displayUrl) {
              return (
                <img
                  src={displayUrl}
                  alt={current.name}
                  className="w-full h-full object-cover"
                  draggable={false}
                  style={{ opacity: dragOpacity, willChange: 'opacity' }}
                />
              );
            }

            if (isMyAiCard && !locked && myAiState === 'empty') {
              return (
                <div className="w-full h-full flex flex-col items-center justify-center bg-surface-900 gap-4 px-6 overflow-y-auto">
                  <div className="w-full max-w-sm flex flex-col gap-3">
                    <div
                      className="rounded-2xl border border-accent-400/50 bg-accent-500/5 px-4 py-3 backdrop-blur-md"
                      style={{ boxShadow: '0 0 18px -4px rgba(52, 211, 153, 0.35)' }}
                    >
                      <p className="text-sm font-semibold text-accent-300 text-center mb-1.5">
                        Choose your My AI look
                      </p>
                      <p className="text-xs text-surface-300 leading-relaxed text-center">
                        <span className="font-medium text-white">Keep</span> — use your uploaded image as it is.
                      </p>
                      <p className="text-xs text-surface-300 leading-relaxed text-center mt-1">
                        <span className="font-medium text-white">Generate</span> — create your My AI look based on the platform's configured appearance.
                      </p>
                    </div>
                    <div
                      className="rounded-2xl border border-accent-400/30 bg-surface-800/40 px-4 py-3 backdrop-blur-md"
                      style={{ boxShadow: '0 0 14px -6px rgba(52, 211, 153, 0.25)' }}
                    >
                      <p className="text-xs text-surface-400 leading-relaxed text-center">
                        <span className="font-semibold text-accent-300">Note:</span> For better physical-structure consistency across your My AI experience, a topless reference image is preferred.
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => myAiFileInputRef.current?.click()}
                    disabled={myAiUploading}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-accent-500/20 border border-accent-400/40 text-white hover:bg-accent-500/30 hover:border-accent-400/60 transition-colors disabled:opacity-50"
                  >
                    {myAiUploading ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Uploading…</>
                    ) : (
                      <><Upload className="w-4 h-4" />Upload Image</>
                    )}
                  </button>
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
                </div>
              );
            }

            return (
              <div className="w-full h-full flex items-center justify-center bg-surface-900">
                <Star className="w-10 h-10 text-surface-700" />
              </div>
            );
          })()}
        </div>

        {/* Gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />

        {/* Character name — lower-left, cinematic style */}
        <div className={[
          'absolute left-0 right-0 px-6 pointer-events-none transition-all duration-200',
          current?.character_id === customizeAiCharacter?.character_id && !locked
            ? 'bottom-36'
            : 'bottom-24',
        ].join(' ')}>
          <h2
            key={nameKey}
            className="studio-name-in text-2xl font-bold text-white text-center"
            style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8), 0 0 20px rgba(0,0,0,0.4)' }}
          >
            {current?.name}
          </h2>
        </div>

        {/* Select / Selected + Select Role — centered lower area of image */}
        <div
          className="absolute bottom-6 left-0 right-0 flex flex-col items-center gap-3"
          onTouchStart={(e) => e.stopPropagation()}
          onTouchEnd={(e) => e.stopPropagation()}
        >
          {/* My AI action buttons — driven by the state machine */}
          {current?.character_id === myAiCharacter?.character_id && !locked && myAiState !== 'empty' && (
            <div className="flex items-center justify-center gap-3">
              {/* Keep — ON only in uploaded state, confirms uploaded image as active identity */}
              {myAiState === 'uploaded' && (
                <button
                  onClick={handleMyAiKeep}
                  disabled={myAiSelecting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-accent-500/30 border border-accent-400/50 text-white hover:bg-accent-500/40 hover:border-accent-400/70 transition-colors disabled:opacity-50 backdrop-blur-md"
                >
                  {myAiSelecting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Keeping…</>
                  ) : (
                    <><Check className="w-4 h-4" />Keep</>
                  )}
                </button>
              )}

              {/* Generate / Regenerate — ON when uploaded or candidate, OFF when selected */}
              {(myAiState === 'uploaded' || myAiState === 'candidate') && (
                <button
                  onClick={handleMyAiGenerate}
                  disabled={myAiGenerating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-accent-500/20 border border-accent-400/40 text-white hover:bg-accent-500/30 hover:border-accent-400/60 transition-colors disabled:opacity-50 backdrop-blur-md"
                >
                  {myAiGenerating ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
                  ) : myAiState === 'candidate' ? (
                    <><RefreshCw className="w-4 h-4" />Regenerate</>
                  ) : (
                    <><Sparkles className="w-4 h-4" />Generate</>
                  )}
                </button>
              )}

              {/* Delete — ON whenever a My AI image exists */}
              {(myAiState === 'uploaded' || myAiState === 'candidate' || myAiState === 'selected') && (
                <button
                  onClick={handleMyAiDelete}
                  disabled={myAiDeleting}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-danger-500/20 border border-danger-400/40 text-white hover:bg-danger-500/30 hover:border-danger-400/60 transition-colors disabled:opacity-50 backdrop-blur-md"
                >
                  {myAiDeleting ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</>
                  ) : (
                    <><Trash2 className="w-4 h-4" />Delete</>
                  )}
                </button>
              )}
            </div>
          )}
          {/* Mother Creator Delete — clears her own shared My AI image */}
          {current?.character_id === myAiCharacter?.character_id && isMotherCreator && !locked && current?.identity_image_url && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleMyAiDelete}
                disabled={motherDeleting}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-danger-500/20 border border-danger-400/40 text-white hover:bg-danger-500/30 hover:border-danger-400/60 transition-colors disabled:opacity-50 backdrop-blur-md"
              >
                {motherDeleting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" />Deleting…</>
                ) : (
                  <><Trash2 className="w-4 h-4" />Delete</>
                )}
              </button>
            </div>
          )}
          {/* Customize AI — appearance popup + generate + remove */}
          {current?.character_id === customizeAiCharacter?.character_id && !locked && (
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setCustomizeAiPopupOpen(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-primary-500/20 border border-primary-400/40 text-white hover:bg-primary-500/30 hover:border-primary-400/60 transition-colors backdrop-blur-md"
              >
                <Sparkles className="w-4 h-4" />
                Customize AI
              </button>
              {customizeAiImageUrl && (
                <button
                  onClick={() => setShowRemoveConfirm(true)}
                  disabled={customizeAiRemoving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-medium bg-danger-500/20 border border-danger-400/40 text-white hover:bg-danger-500/30 hover:border-danger-400/60 transition-colors disabled:opacity-50 backdrop-blur-md"
                >
                  {customizeAiRemoving ? (
                    <><Loader2 className="w-4 h-4 animate-spin" />Removing…</>
                  ) : (
                    <><Trash2 className="w-4 h-4" />Remove</>
                  )}
                </button>
              )}
            </div>
          )}
          {locked ? (
            <div className="flex items-center justify-center gap-3 transition-all duration-200">
              <span
                className="px-8 py-3 rounded-full text-sm font-semibold backdrop-blur-md border bg-white/10 border-white/20 text-white/70 cursor-not-allowed"
              >
                <span className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  Locked
                </span>
              </span>
              {onGoToRoleStudio && (
                <button
                  onClick={onGoToRoleStudio}
                  className="px-8 py-3 rounded-full text-sm font-semibold transition-all duration-200 backdrop-blur-md border bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/40"
                >
                  Select Role
                </button>
              )}
            </div>
          ) : isSelected ? (
            <div className="flex items-center justify-center gap-3 transition-all duration-200">
              <span
                className="px-8 py-3 rounded-full text-sm font-semibold backdrop-blur-md border bg-accent-500/30 border-accent-400/50 text-white cursor-default"
              >
                <span className="flex items-center gap-2">
                  <Check className="w-4 h-4" />
                  Selected
                </span>
              </span>
              {onGoToRoleStudio && (
                <button
                  onClick={onGoToRoleStudio}
                  disabled={isMyAiCard && !myAiHasImage}
                  className="px-8 py-3 rounded-full text-sm font-semibold transition-all duration-200 backdrop-blur-md border bg-white/10 border-white/20 text-white hover:bg-white/20 hover:border-white/40 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Select Role
                </button>
              )}
            </div>
          ) : (
            <button
              onClick={() => current && handleSelect(current)}
              disabled={selecting || myAiSelectDisabled}
              className={[
                'group inline-flex items-center gap-2 px-10 py-3.5 rounded-full text-sm font-semibold',
                'transition-all duration-200 active:scale-95',
                'backdrop-blur-md border',
                myAiSelectDisabled
                  ? 'bg-white/10 border-white/20 text-white/70 cursor-not-allowed'
                  : 'bg-accent-500/25 border-accent-400/50 text-white hover:bg-accent-500/35 hover:border-accent-400/70',
                'disabled:opacity-70',
              ].join(' ')}
              style={!myAiSelectDisabled ? { boxShadow: '0 0 20px -4px rgba(52, 211, 153, 0.4)' } : undefined}
            >
              {selecting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Selecting…
                </span>
              ) : (
                <>
                  Select
                  <ArrowRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* ── Bio hint ──────────────────────────────────────────────────────── */}
      <div
        className="flex flex-col items-center gap-0.5 mt-1.5 mb-0 flex-shrink-0"
        style={{ touchAction: 'none' }}
        onTouchStart={onStageTouchStart}
        onTouchMove={onStageTouchMove}
        onTouchEnd={onStageTouchEnd}
      >
        <ChevronUp className="w-4 h-4 text-surface-500 studio-chevron-float" />
        <p className="text-[10px] text-surface-500 tracking-wide">Swipe up for bio</p>
      </div>

      {/* ── Footer dots ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center gap-2 pb-3 flex-shrink-0" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        {characters.map((_, i) => (
          <button
            key={i}
            onClick={() => { setNameKey(k => k + 1); setCurrentIndex(i); }}
            className="transition-all duration-200"
            style={{ padding: '4px' }}
            aria-label={`Character ${i + 1}`}
          >
            <span
              className={[
                'block rounded-full transition-all duration-300',
                i === currentIndex
                  ? 'w-2.5 h-2.5 bg-accent-400'
                  : 'w-1.5 h-1.5 bg-surface-600/60',
              ].join(' ')}
              style={i === currentIndex ? { boxShadow: '0 0 8px rgba(52, 211, 153, 0.5)' } : undefined}
            />
          </button>
        ))}
      </div>

      {/* ── Bio sheet (always rendered, animated via transform) ────────────── */}
      {current && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            style={{
              opacity: bioOpen ? 1 : 0,
              pointerEvents: bioOpen ? 'auto' : 'none',
              transition: `opacity ${SHEET_DURATION} ease-out`,
            }}
            onClick={() => setBioOpen(false)}
          />

          {/* Sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-3xl border-t border-surface-700/50 bg-surface-900/95 backdrop-blur-xl shadow-2xl"
            style={{
              maxHeight: '80vh',
              transform: bioOpen
                ? `translate3d(0, ${bioDragY}px, 0)`
                : 'translate3d(0, 100%, 0)',
              transition: isBioDragging ? 'none' : `transform ${SHEET_DURATION} ${SNAP_EASE}`,
              willChange: 'transform',
              touchAction: 'pan-y',
            }}
            onTouchStart={onBioTouchStart}
            onTouchMove={onBioTouchMove}
            onTouchEnd={onBioTouchEnd}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-surface-600" />
            </div>

            {/* Close button */}
            <button
              onClick={() => setBioOpen(false)}
              className="absolute top-3 right-4 p-1.5 rounded-lg text-surface-400 hover:text-surface-200 hover:bg-surface-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {/* Content */}
            <div
              ref={bioContentRef}
              className="px-6 pb-28 pt-4 overflow-y-auto"
              style={{ maxHeight: 'calc(80vh - 60px)', touchAction: 'pan-y' }}
            >
              {/* Identity image thumbnail */}
              {(() => {
                const isMyAiCard = current.character_id === myAiCharacter?.character_id;
                const isCustomizeAiCard = current.character_id === customizeAiCharacter?.character_id;
                const thumbUrl = isMyAiCard
                  ? (isMotherCreator
                      ? (current.identity_image_url ?? null)
                      : (myAiSelectedUrl ?? myAiGeneratedUrl ?? myAiOverrideUrl ?? null))
                  : isCustomizeAiCard
                    ? (customizeAiImageUrl ?? null)
                    : current.identity_image_url;
                if (!thumbUrl) return null;
                return (
                  <div className="flex justify-center mb-5">
                    <div className="w-20 h-20 rounded-2xl overflow-hidden border border-surface-700">
                      <img
                        src={thumbUrl}
                        alt={current.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </div>
                );
              })()}

              {/* Name */}
              <h2 className="text-2xl font-bold text-white text-center mb-4">
                {isMyAiCard && !isMotherCreator && displayName
                  ? displayName
                  : current.name}
              </h2>

              {/* Display Name editor — Child Creators only, on the My AI card */}
              {isMyAiCard && !isMotherCreator && (
                <div className="mb-4">
                  <label className="block text-xs font-medium text-surface-400 mb-1.5 text-center">
                    Display Name (shown to your clients)
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={displayName}
                      onChange={e => { setDisplayName(e.target.value); setDisplayNameDirty(true); }}
                      placeholder={current.name}
                      maxLength={50}
                      className="flex-1 px-3 py-2 rounded-lg text-sm bg-surface-800 border border-surface-700 text-white placeholder-surface-500 focus:outline-none focus:border-accent-500/50"
                    />
                    <button
                      onClick={handleSaveDisplayName}
                      disabled={!displayNameDirty || displayNameSaving}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-accent-500/20 border border-accent-400/40 text-white hover:bg-accent-500/30 hover:border-accent-400/60 transition-colors disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      {displayNameSaving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save
                    </button>
                  </div>
                  <p className="text-xs text-surface-600 mt-1.5 text-center">
                    Leave blank to use the default "{current.name}".
                  </p>
                </div>
              )}

              {/* Bio */}
              <div className="text-sm text-surface-300 leading-relaxed whitespace-pre-wrap text-center">
                {current.bio || 'No description available.'}
              </div>

              {/* Select button in sheet */}
              <div className="flex justify-center mt-6">
                <button
                  onClick={() => {
                    if (locked) { onLockedClick?.(); return; }
                    if (isMyAiCard && !myAiHasImage) return;
                    handleSelect(current);
                  }}
                  disabled={selecting || isSelected || locked || myAiSelectDisabled}
                  className={[
                    'px-8 py-3 rounded-full text-sm font-semibold transition-all duration-200',
                    'backdrop-blur-md border',
                    locked || myAiSelectDisabled
                      ? 'bg-white/10 border-white/20 text-white/70 cursor-not-allowed'
                      : isSelected
                        ? 'bg-accent-500/30 border-accent-400/50 text-white cursor-default'
                        : 'bg-accent-500/20 border-accent-400/40 text-white hover:bg-accent-500/30 hover:border-accent-400/60',
                    'disabled:opacity-70',
                  ].join(' ')}
                >
                  {locked ? (
                    <span className="flex items-center gap-2">
                      <Lock className="w-4 h-4" />
                      Locked
                    </span>
                  ) : selecting ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Selecting…
                    </span>
                  ) : isSelected ? (
                    <span className="flex items-center gap-2">
                      <Check className="w-4 h-4" />
                      Selected
                    </span>
                  ) : (
                    'Select'
                  )}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Customize AI popup ──────────────────────────────────────────────── */}
      {customizeAiPopupOpen && (
        <div
          className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 backdrop-blur-sm overflow-hidden p-4 pb-[5.5rem]"
          onClick={() => setCustomizeAiPopupOpen(false)}
        >
          <div
            className="cai-popup w-full max-w-md max-h-[calc(85vh-5.5rem)] overflow-y-auto p-5 sm:p-6 overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="cai-popup-title">Customize AI</h3>
                <p className="cai-popup-subtitle mt-1">Appearance & Generation</p>
              </div>
              <button
                onClick={() => setCustomizeAiPopupOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/5 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {customizeAiImageUrl ? (
              /* ── STATE: IMAGE EXISTS — show image + Remove only ── */
              <>
                <div className="mb-4 rounded-lg overflow-hidden border border-surface-700">
                  <img src={customizeAiImageUrl} alt="Customize AI" className="w-full h-auto" />
                </div>

                {customizeAiConfirmRemove ? (
                  <div className="space-y-3">
                    <p className="text-sm text-surface-300 text-center">
                      Remove your Customize AI image? Your appearance selections will be cleared and you can start over.
                    </p>
                    <div className="flex gap-3">
                      <button
                        onClick={() => setCustomizeAiConfirmRemove(false)}
                        disabled={customizeAiRemoving}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-surface-700 border border-surface-600 text-surface-100 hover:bg-surface-600 transition-colors disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleCustomizeAiRemove}
                        disabled={customizeAiRemoving}
                        className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-danger-500/20 border border-danger-400/40 text-white hover:bg-danger-500/30 hover:border-danger-400/60 transition-colors disabled:opacity-50"
                      >
                        {customizeAiRemoving ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Removing…</>
                        ) : (
                          <><Trash2 className="w-4 h-4" />Confirm Remove</>
                        )}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setCustomizeAiConfirmRemove(true)}
                    className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-danger-500/20 border border-danger-400/40 text-white hover:bg-danger-500/30 hover:border-danger-400/60 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />Remove Image
                  </button>
                )}
              </>
            ) : (
              /* ── STATE: NO IMAGE — show appearance fields + Save + Generate ── */
              <>
                <div className="space-y-3 mb-5">
                  <h4 className="cai-popup-subtitle">Appearance Fields</h4>
                  <div className="grid grid-cols-2 gap-3">
                    {(Object.keys(APPEARANCE_FIELD_OPTIONS) as (keyof MyAiAppearance)[]).map(field => (
                      <div key={field} className="space-y-1.5">
                        <label className="cai-field-label">{APPEARANCE_FIELD_LABELS[field]}</label>
                        <AppearanceDropdown
                          value={customizeAiAppearance[field]}
                          options={APPEARANCE_FIELD_OPTIONS[field]}
                          onChange={(val) => handleCustomizeAiAppearanceChange(field, val)}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={handleCustomizeAiSave}
                    disabled={customizeAiSaving}
                    className="cai-btn-save disabled:opacity-50"
                  >
                    {customizeAiSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    Save Appearance
                  </button>
                </div>

                <div className="space-y-2">
                  <button
                    onClick={handleCustomizeAiGenerate}
                    disabled={customizeAiGenerating || !customizeAiOverride}
                    className="cai-btn-generate disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {customizeAiGenerating ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />{customizeAiGenStatus || 'Generating…'}</>
                    ) : (
                      <><Sparkles className="w-4 h-4" />Generate AI</>
                    )}
                  </button>
                  {!customizeAiOverride && (
                    <p className="text-xs text-surface-500 text-center">Save your appearance selections first to enable generation.</p>
                  )}
                  {customizeAiGenerating && (
                    <div className="space-y-2.5 pt-1">
                      <div className="relative h-10 w-full rounded-lg bg-surface-950 border border-surface-800 overflow-hidden">
                        <div className="absolute inset-0 cai-underwater-bg" />
                        <div className="absolute inset-0 cai-underwater-waves" />
                        <div className="absolute inset-0 cai-underwater-particles" />
                        <div
                          className="absolute top-1/2 -translate-y-1/2"
                          style={{
                            animation: 'cai-fish-travel 60s linear forwards',
                          }}
                        >
                          <div style={{ animation: 'cai-fish-wait 1.8s ease-in-out infinite' }}>
                            <FishMascot size={36} />
                            <span className="cai-bubble cai-bubble--1" />
                            <span className="cai-bubble cai-bubble--2" />
                            <span className="cai-bubble cai-bubble--3" />
                          </div>
                        </div>
                      </div>
                      <p className="text-xs text-primary-400 text-center">Creating your AI character…</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Remove confirmation popup ────────────────────────────────────── */}
      {showRemoveConfirm && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setShowRemoveConfirm(false)}
        >
          <div
            className="max-w-xs mx-4 p-6 rounded-2xl bg-surface-900 border border-white/15 text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm text-surface-200 leading-relaxed mb-5">
              Are you sure you want to delete me? I won't come back.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowRemoveConfirm(false)}
                disabled={customizeAiRemoving}
                className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-surface-700 border border-surface-600 text-surface-100 hover:bg-surface-600 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => { handleCustomizeAiRemove(); setShowRemoveConfirm(false); }}
                disabled={customizeAiRemoving}
                className="flex-1 px-4 py-2.5 rounded-full text-sm font-medium bg-danger-500/20 border border-danger-400/40 text-white hover:bg-danger-500/30 hover:border-danger-400/60 transition-colors disabled:opacity-50"
              >
                {customizeAiRemoving ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'Bye Bye'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Toast ─────────────────────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] px-5 py-3 rounded-xl bg-surface-800/95 backdrop-blur-md border border-surface-700 text-sm text-surface-100 shadow-xl animate-slide-up">
          {toast}
        </div>
      )}
    </div>
  );
}
