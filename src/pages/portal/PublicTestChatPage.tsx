import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Send, AlertCircle, Loader2, User, Bot, ImageIcon, Video, X, Lock, Heart, RotateCcw, Coins } from 'lucide-react';
import { useClientAuth } from '../../context/ClientAuthContext';
import { supabaseUrl, supabase } from '../../lib/supabase';
import ConsentGate, { hasConsent } from '../../components/ConsentGate';
import { countryShortName } from '../../lib/countries';
import GeneratingOverlay from '../../components/GeneratingOverlay';
import { ROLE_INTROS, NEUTRAL_INTRO, type RoleIntro } from '../../lib/role-intros';

const TEASER_LINES = [
  "Tell her what kind of mood you're in.",
  "She'll take it from there. 😉",
  "Say hello… and see where it goes.",
  "She's ready when you are.",
  "Talk to her in any language.",
];

const FN_URL = `${supabaseUrl}/functions/v1/public-test-chat`;
const CREDIT_URL = `${supabaseUrl}/functions/v1/process-credit-transaction`;

const STORAGE_KEY_PREFIX = 'vpc_chat_state';

interface SavedChatState {
  history: ChatMessage[];
  currentSceneIndex: number;
  sceneReplyCount: number;
  openedMediaUrls?: string[];
  chatEnded?: boolean;
}

function getStorageKey(clientId: string | null, roleId: string | null, creatorId: string | null): string {
  return `${STORAGE_KEY_PREFIX}_${clientId ?? 'default'}_${roleId ?? 'default'}_${creatorId ?? 'default'}`;
}

function loadChatState(key: string): SavedChatState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw) as SavedChatState;
  } catch {
    return null;
  }
}

function saveChatState(key: string, state: SavedChatState): void {
  try {
    localStorage.setItem(key, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
}

function saveChatHistoryToDb(
  clientId: string,
  roleId: string,
  creatorId: string,
  state: SavedChatState
): void {
  supabase
    .from('client_chat_messages')
    .upsert(
      {
        client_id: clientId,
        role_id: roleId,
        creator_id: creatorId,
        messages: state.history,
        chat_ended: state.chatEnded ?? false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'client_id,role_id,creator_id' }
    )
    .then(() => {});
}

function clearChatHistoryInDb(clientId: string, roleId: string, creatorId: string): void {
  supabase
    .from('client_chat_messages')
    .delete()
    .eq('client_id', clientId)
    .eq('role_id', roleId)
    .eq('creator_id', creatorId)
    .then(() => {});
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  sceneDescription?: string;
  invitationSceneIndex?: number;
}

interface RoleInfo {
  id: string;
  name: string;
  description: string | null;
  role_image_url: string | null;
  introduction_title: string | null;
  introduction_body: string | null;
}

interface CharacterInfo {
  id: string;
  name: string;
  identity_image_url: string | null;
  identity_asset_id: string | null;
  age: number | null;
  country: string | null;
}

function formatCharacterLabel(name: string, age: number | null, country: string | null): string {
  const parts: string[] = [name];
  if (age) parts.push(String(age));
  const shortCountry = countryShortName(country);
  if (shortCountry) parts.push(shortCountry);
  return parts.join(', ');
}

interface SceneInfo {
  id: string;
  scenario_id: string;
  index: number;
  scene_label: string;
  description: string;
  tags: string;
  scene_image_url: string | null;
  video_url: string | null;
}

interface VideoInfo {
  id: string;
  video_url: string;
  duration_seconds: number | null;
  sort_order: number;
}

function renderAssistantContent(text: string) {
  const parts: React.ReactNode[] = [];
  const regex = /(?<!\*)\*(?!\*)([^*\n]+)\*(?!\*)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={`em-${key++}`} className="italic text-surface-500">{match[1]}</span>
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }
  return parts;
}

export default function PublicTestChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { client, sessionToken, refreshClient } = useClientAuth();
  const roleIdParam = searchParams.get('role_id');
  const creatorIdParam = searchParams.get('creator_id');
  const entered = searchParams.get('chat') === '1';

  const [role, setRole] = useState<RoleInfo | null>(null);
  const [character, setCharacter] = useState<CharacterInfo | null>(null);
  const [scenes, setScenes] = useState<SceneInfo[]>([]);
  const [videos, setVideos] = useState<VideoInfo[]>([]);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(0);
  const [sceneReplyCount, setSceneReplyCount] = useState(0);
  const [loadingInit, setLoadingInit] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [lightboxVideo, setLightboxVideo] = useState<string | null>(null);
  const [showGenerating, setShowGenerating] = useState(false);
  const [creditProcessing, setCreditProcessing] = useState(false);
  const [creditError, setCreditError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const landingVideoRef = useRef<HTMLVideoElement>(null);
  const [viewportHeight, setViewportHeight] = useState<number | null>(null);
  const [viewportTop, setViewportTop] = useState<number>(0);
  const openedMediaRef = useRef<Set<string>>(new Set());
  const generatingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [chatLocked, setChatLocked] = useState(false);
  const [insufficientInfo, setInsufficientInfo] = useState<{ required: number; balance: number; mediaType: 'image' | 'video' } | null>(null);
  const [checkingCredits, setCheckingCredits] = useState(false);
  const [showSignInModal, setShowSignInModal] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(hasConsent());
  const isSignedOut = !client;
  const legacyIntro = role?.id ? ROLE_INTROS[role.id] ?? null : null;
  const dbIntro = (role?.introduction_title?.trim() || role?.introduction_body?.trim())
    ? { title: role!.introduction_title!.trim(), body: role!.introduction_body?.trim() ?? '' }
    : null;
  const roleIntro = dbIntro ?? legacyIntro ?? NEUTRAL_INTRO;
  const [likeCount, setLikeCount] = useState(0);
  const [hasLiked, setHasLiked] = useState(false);
  const [likeLoading, setLikeLoading] = useState(false);
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [chatEnded, setChatEnded] = useState(false);
  const [restoringHistory, setRestoringHistory] = useState(true);
  const dbHistorySavedRef = useRef(false);
  // Set when a failed DB fetch forced a local-cache fallback; the next persist
  // pass must not upload that possibly-stale local history to the database.
  const restoreUsedLocalFallbackRef = useRef(false);

  const ENDING_MESSAGE = 'Roleplay is over. Please enjoy another roleplay from our Chat Library.';

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history, sending]);

  // Persist chat position + opened media to localStorage so refresh restores the exact state.
  // Also persist the full text history to the database for authenticated clients so the
  // conversation is available on any device — saved only after a completed assistant reply.
  useEffect(() => {
    if (history.length === 0) return;
    const key = getStorageKey(client?.id ?? null, roleIdParam, creatorIdParam);
    saveChatState(key, {
      history,
      currentSceneIndex,
      sceneReplyCount,
      openedMediaUrls: Array.from(openedMediaRef.current),
      chatEnded,
    });
    const lastMsg = history[history.length - 1];
    if (
      client?.id && roleIdParam && creatorIdParam &&
      lastMsg.role === 'assistant'
    ) {
      if (restoreUsedLocalFallbackRef.current) {
        restoreUsedLocalFallbackRef.current = false;
        return;
      }
      saveChatHistoryToDb(client.id, roleIdParam, creatorIdParam, {
        history,
        currentSceneIndex,
        sceneReplyCount,
        chatEnded,
      });
      dbHistorySavedRef.current = true;
    }
  }, [history, currentSceneIndex, sceneReplyCount, roleIdParam, creatorIdParam, client?.id, chatEnded]);

  // Persist scene progress to database for cross-device continuity
  useEffect(() => {
    if (!client?.id || !roleIdParam || !creatorIdParam || history.length === 0) return;
    supabase
      .from('client_chat_progress')
      .upsert(
        {
          client_id: client.id,
          role_id: roleIdParam,
          creator_id: creatorIdParam,
          scene_index: currentSceneIndex,
          scene_reply_count: sceneReplyCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'client_id,role_id,creator_id' }
      )
      .then(() => {});
  }, [client?.id, roleIdParam, creatorIdParam, currentSceneIndex, sceneReplyCount, history.length]);

  // Keyboard-aware visualViewport handling: while the input is focused, the
  // measured visualViewport values are applied so the chat shrinks and the
  // input rides above the keyboard. Whenever the input is not focused, the
  // inline height/top are cleared (viewportHeight = null) so the container's
  // CSS "fixed inset-0" anchors it to the real viewport edges — a stale
  // shrunken height or offset left behind by overscroll or browser toolbar
  // movement can never misposition it or expose the page background.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const isInputFocused = () => document.activeElement?.tagName === 'INPUT';
    const update = () => {
      if (isInputFocused()) {
        setViewportHeight(vv.height);
        setViewportTop(Math.max(0, vv.offsetTop));
      } else {
        setViewportHeight(null);
        setViewportTop(0);
      }
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);
  // When the input blurs (keyboard closing) no visualViewport event is
  // guaranteed, so clear the inline sizing once to restore CSS anchoring.
  useEffect(() => {
    const onBlur = () => {
      if (document.activeElement?.tagName !== 'INPUT') {
        setViewportHeight(null);
        setViewportTop(0);
      }
    };
    document.addEventListener('focusout', onBlur);
    return () => document.removeEventListener('focusout', onBlur);
  }, []);

  // Load role/character/scene data — depends only on URL params, not auth state
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const query = roleIdParam
          ? `?role_id=${encodeURIComponent(roleIdParam)}${creatorIdParam ? `&creator_id=${encodeURIComponent(creatorIdParam)}` : ''}`
          : '';
        const res = await fetch(`${FN_URL}${query}`, { method: 'GET' });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setRole(data.role);
        setCharacter(data.character);
        setScenes(data.scenes ?? []);
        setVideos(data.videos ?? []);
        if (roleIdParam && creatorIdParam) {
          try {
            const { data: listing } = await supabase
              .from('chat_library_listings')
              .select('like_count')
              .eq('creator_id', creatorIdParam)
              .eq('role_id', roleIdParam)
              .maybeSingle();
            if (!cancelled && listing) setLikeCount(listing.like_count ?? 0);
          } catch { /* ignore */ }
          const likeKey = `liked_${creatorIdParam}_${roleIdParam}`;
          if (!cancelled) setHasLiked(localStorage.getItem(likeKey) === '1');
        }
      } catch (e) {
        if (!cancelled) setInitError((e as Error).message);
      } finally {
        if (!cancelled) setLoadingInit(false);
      }
    })();
    return () => { cancelled = true; };
  }, [roleIdParam, creatorIdParam]);

  // Restore chat state — database-first for authenticated clients. For signed-in
  // clients the database is authoritative: client_chat_messages supplies the text
  // history and client_chat_progress the scene position, so a stale localStorage
  // snapshot can never override newer database state. A local-only history is
  // migrated to the database only when no message row exists yet. A failed
  // database request falls back to the local cache without treating the failure
  // as proof that no conversation exists, and never writes back to the database.
  // Anonymous visitors keep the original localStorage-only behavior under a
  // separate key and cannot interfere with authenticated history.
  useEffect(() => {
    if (!roleIdParam || !creatorIdParam) return;
    let cancelled = false;
    const key = getStorageKey(client?.id ?? null, roleIdParam, creatorIdParam);
    const applyLocal = (saved: SavedChatState) => {
      setHistory(saved.history);
      setCurrentSceneIndex(saved.currentSceneIndex);
      setSceneReplyCount(saved.sceneReplyCount);
      setChatEnded(!!saved.chatEnded);
      openedMediaRef.current = new Set(saved.openedMediaUrls ?? []);
    };
    (async () => {
      if (client?.id) {
        setRestoringHistory(true);
        try {
          const [{ data: dbProgress, error: progressError }, { data: dbMessages, error: messagesError }] = await Promise.all([
            supabase
              .from('client_chat_progress')
              .select('scene_index, scene_reply_count')
              .eq('client_id', client.id)
              .eq('role_id', roleIdParam)
              .eq('creator_id', creatorIdParam)
              .maybeSingle(),
            supabase
              .from('client_chat_messages')
              .select('messages, chat_ended')
              .eq('client_id', client.id)
              .eq('role_id', roleIdParam)
              .eq('creator_id', creatorIdParam)
              .maybeSingle(),
          ]);
          if (cancelled) return;
          if (progressError || messagesError) {
            restoreUsedLocalFallbackRef.current = true;
            const saved = loadChatState(key);
            if (saved) applyLocal(saved);
            setRestoringHistory(false);
            return;
          }
          const dbSceneIndex = dbProgress?.scene_index ?? 0;
          const dbReplyCount = dbProgress?.scene_reply_count ?? 0;
          const dbHistory = Array.isArray(dbMessages?.messages) ? (dbMessages.messages as ChatMessage[]) : [];
          if (dbHistory.length > 0) {
            setHistory(dbHistory);
            setCurrentSceneIndex(dbSceneIndex);
            setSceneReplyCount(dbReplyCount);
            setChatEnded(!!dbMessages?.chat_ended);
            openedMediaRef.current = new Set();
            dbHistorySavedRef.current = true;
            // localStorage stays a cache of the authoritative database state.
            saveChatState(key, {
              history: dbHistory,
              currentSceneIndex: dbSceneIndex,
              sceneReplyCount: dbReplyCount,
              openedMediaUrls: [],
              chatEnded: !!dbMessages?.chat_ended,
            });
            setRestoringHistory(false);
            return;
          }
          // No message row yet — restore any local-only history and migrate it.
          const saved = loadChatState(key);
          if (saved) {
            applyLocal(saved);
            if (saved.history.length > 0 && !dbHistorySavedRef.current) {
              const { data: existing, error: existingError } = await supabase
                .from('client_chat_messages')
                .select('id')
                .eq('client_id', client.id)
                .eq('role_id', roleIdParam)
                .eq('creator_id', creatorIdParam)
                .maybeSingle();
              if (!existing && !existingError && !cancelled) {
                saveChatHistoryToDb(client.id, roleIdParam, creatorIdParam, {
                  history: saved.history,
                  currentSceneIndex: saved.currentSceneIndex,
                  sceneReplyCount: saved.sceneReplyCount,
                  chatEnded: !!saved.chatEnded,
                });
                dbHistorySavedRef.current = true;
              }
            }
            setRestoringHistory(false);
            return;
          }
          if (cancelled) return;
          setHistory([]);
          setCurrentSceneIndex(dbSceneIndex);
          setSceneReplyCount(dbReplyCount);
          setChatEnded(false);
          openedMediaRef.current = new Set();
          setRestoringHistory(false);
        } catch {
          if (cancelled) return;
          restoreUsedLocalFallbackRef.current = true;
          const saved = loadChatState(key);
          if (saved) applyLocal(saved);
          setRestoringHistory(false);
        }
      } else {
        const saved = loadChatState(key);
        if (saved) {
          applyLocal(saved);
        } else if (!cancelled) {
          setHistory([]);
          setCurrentSceneIndex(0);
          setSceneReplyCount(0);
          setChatEnded(false);
          openedMediaRef.current = new Set();
        }
        if (!cancelled) setRestoringHistory(false);
      }
    })();
    return () => { cancelled = true; };
  }, [client?.id, roleIdParam, creatorIdParam]);

  // Silent background video: muted, autoplay, loop. No Media Session — this is a
  // decorative background only, not active media playback.
  useEffect(() => {
    if (entered || videos.length === 0) return;
    const v = landingVideoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => { /* autoplay blocked — ignore, stays as static frame */ });
  }, [entered, videos]);

  const CREDIT_COSTS: Record<string, number> = { image: 4, video: 10 };

  const checkSceneCheckpoint = useCallback(async (sceneIdx: number, clientBalance: number, clientId: string) => {
    const scene = scenes[sceneIdx];
    if (!scene) return;
    const imageUrl = scene.scene_image_url;
    const videoUrl = scene.video_url;
    const mediaToCheck: { url: string; type: 'image' | 'video' }[] = [];
    if (videoUrl) mediaToCheck.push({ url: videoUrl, type: 'video' });
    if (imageUrl) mediaToCheck.push({ url: imageUrl, type: 'image' });
    if (mediaToCheck.length === 0) return;
    try {
      const { data: unlocked } = await supabase
        .from('client_media_unlocks')
        .select('media_url')
        .eq('client_id', clientId)
        .in('media_url', mediaToCheck.map(m => m.url));
      const unlockedSet = new Set((unlocked ?? []).map(r => r.media_url));
      for (const media of mediaToCheck) {
        if (unlockedSet.has(media.url)) continue;
        const cost = CREDIT_COSTS[media.type];
        if (clientBalance < cost) {
          setChatLocked(true);
          setInsufficientInfo({ required: cost, balance: clientBalance, mediaType: media.type });
          return;
        }
      }
    } catch {
      // If check fails, don't lock — let the normal flow proceed
    }
    setChatLocked(false);
    setInsufficientInfo(null);
  }, [scenes]);

  // Refresh client balance on mount so checkpoint uses latest balance after a page reload
  useEffect(() => {
    if (entered) refreshClient();
  }, [entered, refreshClient]);

  // Check credit checkpoint when scenes load, scene changes, or client balance updates
  useEffect(() => {
    if (!entered || !client || scenes.length === 0) return;
    setCheckingCredits(true);
    checkSceneCheckpoint(currentSceneIndex, client.credit_balance, client.id).finally(() => setCheckingCredits(false));
  }, [entered, client, scenes, currentSceneIndex, checkSceneCheckpoint]);

  async function handleSend() {
    if (!message.trim() || sending || chatLocked || chatEnded) return;
    if (client && roleIdParam && creatorIdParam) {
      supabase
        .from('client_chat_sessions')
        .upsert(
          { client_id: client.id, role_id: roleIdParam, creator_id: creatorIdParam, last_active_at: new Date().toISOString() },
          { onConflict: 'client_id,role_id,creator_id' }
        )
        .then(() => {});
    }
    const userMsg: ChatMessage = { role: 'user', content: message.trim() };
    const newHistory = [...history, userMsg];
    setHistory(newHistory);
    setMessage('');
    setSending(true);
    setChatError(null);
    try {
      const body: Record<string, unknown> = { messages: newHistory };
      if (roleIdParam) body.role_id = roleIdParam;
      if (creatorIdParam) body.creator_id = creatorIdParam;
      body.scene_index = currentSceneIndex;
      const res = await fetch(FN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
      const activeScene = scenes[currentSceneIndex] ?? null;
      const currentDesc = activeScene?.description?.trim() || undefined;
      const lastAssistant = [...history].reverse().find(m => m.role === 'assistant');
      const lastDesc = lastAssistant?.sceneDescription?.trim() || undefined;
      const showDesc = currentDesc && currentDesc !== lastDesc ? currentDesc : undefined;
      const isFinalReplyInScene = sceneReplyCount + 1 === 2;
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: data.reply ?? '(empty reply)',
        sceneDescription: showDesc,
        invitationSceneIndex: isFinalReplyInScene ? currentSceneIndex : undefined,
      };
      setHistory(prev => [...prev, assistantMsg]);

      setSceneReplyCount(prev => {
        const newCount = prev + 1;
        if (newCount >= 2 && currentSceneIndex < scenes.length - 1) {
          const nextIdx = currentSceneIndex + 1;
          setCurrentSceneIndex(idx => idx + 1);
          if (client && entered) {
            setCheckingCredits(true);
            checkSceneCheckpoint(nextIdx, client.credit_balance, client.id).finally(() => setCheckingCredits(false));
          }
          return 0;
        }
        if (newCount >= 2 && currentSceneIndex === scenes.length - 1 && scenes.length > 0) {
          setChatEnded(true);
          setHistory(prevHistory => [...prevHistory, { role: 'assistant', content: ENDING_MESSAGE }]);
        }
        return newCount;
      });
    } catch (e) {
      setChatError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  function handleRestore() {
    if (!roleIdParam || !creatorIdParam) return;
    setShowRestoreModal(true);
  }

  function confirmRestore() {
    setShowRestoreModal(false);
    if (!roleIdParam || !creatorIdParam) return;
    setCurrentSceneIndex(0);
    setSceneReplyCount(0);
    setHistory([]);
    setChatError(null);
    setChatEnded(false);
    openedMediaRef.current = new Set();
    saveChatState(getStorageKey(client?.id ?? null, roleIdParam, creatorIdParam), {
      history: [],
      currentSceneIndex: 0,
      sceneReplyCount: 0,
      openedMediaUrls: [],
      chatEnded: false,
    });
    // Reset must also clear the saved cross-device history so the reset holds
    // on any device. Scene progress is cleared with it so no device restores a
    // stale scene position against the emptied conversation. Media unlocks and
    // credit transactions are untouched.
    if (client?.id) {
      clearChatHistoryInDb(client.id, roleIdParam, creatorIdParam);
      supabase
        .from('client_chat_progress')
        .delete()
        .eq('client_id', client.id)
        .eq('role_id', roleIdParam)
        .eq('creator_id', creatorIdParam)
        .then(() => {});
      dbHistorySavedRef.current = false;
    }
    setRestoringHistory(false);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function processCredits(action: 'image' | 'video', mediaUrl: string): Promise<{ success: boolean; already_unlocked: boolean }> {
    if (!client || !creatorIdParam) {
      if (isSignedOut) setShowSignInModal(true);
      return { success: false, already_unlocked: false };
    }
    let success = false;
    setCreditProcessing(true);
    setCreditError(null);
    try {
      const res = await fetch(CREDIT_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          client_id: client.id,
          session_token: sessionToken,
          creator_id: creatorIdParam,
          action,
          media_url: mediaUrl,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Request failed (${res.status})`);
      }
      success = true;
      return { success: true, already_unlocked: data.already_unlocked ?? false };
    } catch (e) {
      setCreditError((e as Error).message);
      return { success: false, already_unlocked: false };
    } finally {
      setCreditProcessing(false);
      if (success) void refreshClient();
    }
  }

  function startGeneratingOverlay(durationMs: number) {
    setShowGenerating(true);
    if (generatingTimerRef.current) clearTimeout(generatingTimerRef.current);
    generatingTimerRef.current = setTimeout(() => {
      setShowGenerating(false);
      generatingTimerRef.current = null;
    }, durationMs);
  }

  async function openImage(url: string) {
    const result = await processCredits('image', url);
    if (!result.success) return;
    openedMediaRef.current.add(url);
    if (!result.already_unlocked) {
      startGeneratingOverlay(10000);
    }
    setLightboxImage(url);
  }

  async function openVideo(url: string) {
    const result = await processCredits('video', url);
    if (!result.success) return;
    openedMediaRef.current.add(url);
    if (!result.already_unlocked) {
      startGeneratingOverlay(26000);
    }
    setLightboxVideo(url);
  }

  const currentScene = scenes[currentSceneIndex] ?? null;
  const isLastScene = currentSceneIndex >= scenes.length - 1;
  const roleAvatarUrl = role?.role_image_url ?? null;

  const BotAvatar = () => {
    if (roleAvatarUrl) {
      return (
        <img
          src={roleAvatarUrl}
          alt={role?.name ?? 'Bot'}
          className="w-8 h-8 rounded-full object-cover border border-primary-600/30 flex-shrink-0"
        />
      );
    }
    return (
      <div className="w-8 h-8 rounded-full bg-primary-600/20 border border-primary-600/30 flex items-center justify-center flex-shrink-0">
        <Bot className="w-4 h-4 text-primary-400" />
      </div>
    );
  };

  // ── Consent gate ───────────────────────────────────────────────────────
  if (!consentAccepted) {
    return <ConsentGate onAccept={() => setConsentAccepted(true)} />;
  }

  // ── Loading state ──────────────────────────────────────────────────────
  if (loadingInit) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          <p className="text-sm text-surface-500">Loading chat…</p>
        </div>
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────
  if (initError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950 p-6">
        <div className="max-w-md w-full card space-y-3 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-danger-500/10 border border-danger-500/20 flex items-center justify-center mx-auto">
            <AlertCircle className="w-6 h-6 text-danger-400" />
          </div>
          <h1 className="text-lg font-semibold text-surface-100">Chat Unavailable</h1>
          <p className="text-sm text-surface-400">{initError}</p>
        </div>
      </div>
    );
  }

  // ── Video landing page (before entering chat) ───────────────────────────
  if (!entered && videos.length > 0) {
    return (
      <div className="fixed inset-0 overflow-hidden bg-surface-950">
        {/* Background video layer — pointer-events-none, never receives user interaction */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden bg-surface-950">
          <video
            ref={landingVideoRef}
            src={videos[0].video_url}
            autoPlay
            loop
            playsInline
            muted
            preload="auto"
            className="w-full h-full object-cover pointer-events-none"
            style={{ filter: 'saturate(0.85)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-surface-950/90" />
        </div>

        {/* UI layer — stacked above video via z-10; Enter button is the only interactive element */}
        <div className="relative z-10 flex flex-col items-center min-h-full px-6 pt-10 pb-8">
          {/* Character name overlay */}
          {character?.name && (
            <div className="flex flex-col items-center mt-[15vh] pointer-events-none" style={{ fontFamily: "'Manrope', sans-serif" }}>
              <h1
                className="text-white tracking-wide text-center"
                style={{
                  fontSize: 'clamp(38px, 9vw, 48px)',
                  fontWeight: 800,
                  lineHeight: 1.15,
                  textShadow: '0 2px 12px rgba(0,0,0,0.6), 0 1px 4px rgba(0,0,0,0.4)',
                }}
              >
                {formatCharacterLabel(character.name, character.age, character.country)}
              </h1>
              {role?.name && (
                <p
                  className="tracking-wide text-center mt-2"
                  style={{
                    fontSize: 'clamp(23px, 5.5vw, 28px)',
                    fontWeight: 600,
                    color: '#c4b5fd',
                    textShadow: '0 2px 10px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3)',
                  }}
                >
                  {role.name}
                </p>
              )}
              {role?.description && (
                <>
                  <div
                    className="mt-3 mb-3"
                    style={{
                      width: '44px',
                      height: '1.5px',
                      backgroundColor: '#c4b5fd',
                      opacity: 0.5,
                      borderRadius: '1px',
                    }}
                  />
                  <p
                    className="text-center max-w-xs"
                    style={{
                      fontSize: 'clamp(17px, 4vw, 19px)',
                      fontWeight: 450,
                      lineHeight: 1.4,
                      color: 'rgba(255,255,255,0.85)',
                      textShadow: '0 1px 8px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.3)',
                    }}
                  >
                    {role.description}
                  </p>
                </>
              )}
            </div>
          )}

          {/* Rotating teaser text overlay */}
          <div className="flex-1 flex items-center justify-center pointer-events-none w-full">
            <div className="relative w-full overflow-hidden h-10 flex items-center justify-center">
              {TEASER_LINES.map((line, i) => (
                <p
                  key={i}
                  className="teaser-line absolute text-center text-lg sm:text-xl font-medium text-white whitespace-nowrap"
                  style={{
                    textShadow: '0 2px 8px rgba(0,0,0,0.7), 0 1px 3px rgba(0,0,0,0.5)',
                    animationDelay: `${i * 7.5}s`,
                  }}
                >
                  {line}
                </p>
              ))}
            </div>
          </div>

          {/* Enter + Like buttons in footer */}
          <div
            className="mt-auto flex flex-col items-center w-full"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  if (hasLiked || likeLoading || !creatorIdParam || !roleIdParam) return;
                  setLikeLoading(true);
                  try {
                    const { data } = await supabase.rpc('increment_like_count', {
                      p_creator_id: creatorIdParam,
                      p_role_id: roleIdParam,
                    });
                    const newCount = typeof data === 'number' ? data : (data as { like_count?: number })?.like_count ?? likeCount + 1;
                    setLikeCount(newCount);
                    setHasLiked(true);
                    localStorage.setItem(`liked_${creatorIdParam}_${roleIdParam}`, '1');
                  } catch { /* ignore */ }
                  setLikeLoading(false);
                }}
                disabled={hasLiked || likeLoading}
                className={`flex items-center gap-1.5 px-5 py-3.5 rounded-full text-base font-semibold backdrop-blur-md transition-all duration-200 shadow-lg border ${
                  hasLiked
                    ? 'bg-red-500/20 border-red-400/40 text-red-300 cursor-default'
                    : 'bg-red-500/20 border-red-400/50 text-red-300 hover:bg-red-500/30 hover:border-red-400/70'
                }`}
              >
                {likeLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Heart className={`w-4 h-4 ${hasLiked ? 'fill-current' : ''}`} />}
                {likeCount}
              </button>
              <button
                onClick={() => {
                  if (!client) {
                    const search = window.location.search;
                    navigate(`/client-signup?return_to=${encodeURIComponent(`/test-chat${search}&chat=1`)}`);
                    return;
                  }
                  const next = new URLSearchParams(searchParams);
                  next.set('chat', '1');
                  setSearchParams(next, { replace: false });
                }}
                className="flex items-center gap-2 px-10 py-3.5 rounded-full text-base font-semibold text-white bg-accent-600/30 border border-accent-400/50 backdrop-blur-md hover:bg-accent-600/40 hover:border-accent-400/70 transition-all duration-200 shadow-lg"
              >
                Enter
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ── Chat UI ────────────────────────────────────────────────────────────
  // Block anonymous access — only authenticated clients can enter the chat
  if (!client) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface-950 p-6">
        <div className="max-w-md w-full card space-y-3 p-6 text-center">
          <div className="w-12 h-12 rounded-full bg-primary-500/10 border border-primary-500/30 flex items-center justify-center mx-auto">
            <Lock className="w-6 h-6 text-primary-400" />
          </div>
          <h1 className="text-lg font-semibold text-surface-100">Sign in required</h1>
          <p className="text-sm text-surface-400">Please sign in to continue to the chat.</p>
          <a
            href={`/client-signup?return_to=${encodeURIComponent(`/test-chat${window.location.search}`)}`}
            className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-semibold text-white bg-accent-600 hover:bg-accent-500 transition-colors"
          >
            Go to Sign In
          </a>
        </div>
      </div>
    );
  }
  return (
    <div
      className="flex flex-col overflow-hidden fixed inset-0"
      style={viewportHeight !== null ? { height: `${viewportHeight}px`, top: `${viewportTop}px` } : undefined}
    >
      {/* Character background image */}
      {character?.identity_image_url && (
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{ backgroundImage: `url(${character.identity_image_url})` }}
        />
      )}
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-surface-950/85" />

      {/* Content layer */}
      <div className="relative flex flex-col flex-1 min-h-0 overflow-hidden">
        {/* Header */}
        <div className="flex-shrink-0 border-b border-surface-800/80 bg-surface-900/70 backdrop-blur-md">
          <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
            {character?.identity_image_url ? (
              <img
                src={character.identity_image_url}
                alt={character.name}
                className="w-10 h-10 rounded-full object-cover border border-surface-700 flex-shrink-0"
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-surface-800 border border-surface-700 flex items-center justify-center flex-shrink-0">
                <ImageIcon className="w-5 h-5 text-surface-600" />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-surface-100 truncate">
                  {character?.name ?? 'Unknown Character'}
                </span>
                <span className="online-dot inline-block w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              </div>
              <div className="text-xs text-surface-500 truncate">
                {role?.name ?? 'Role'}
              </div>
            </div>
            <button
              onClick={handleRestore}
              disabled={!roleIdParam || !creatorIdParam}
              aria-label="Restore chat to the beginning"
              title="Restore chat to the beginning"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-yellow-400 text-black border border-yellow-500 hover:bg-yellow-300 transition-all duration-150 active:scale-90 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <a
              href={client ? '/client-welcome' : '/client-signup'}
              className="flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-yellow-400 text-black border border-yellow-500 hover:bg-yellow-300 transition-all duration-150 active:scale-95 flex-shrink-0 whitespace-nowrap"
            >
              Dashboard
            </a>
            {client && (
              <div className="flex items-center gap-1 flex-shrink-0">
                <Coins className="w-3.5 h-3.5 text-yellow-400" />
                <span className="text-xs font-semibold text-yellow-400">{client.credit_balance ?? 0}</span>
              </div>
            )}
          </div>
        </div>

        {/* Scene sequence indicator — hidden from client UI; scene data still sent to LLM backend */}

        {/* Chat area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 min-h-0">
          <div className="max-w-2xl mx-auto space-y-4">
            {history.length === 0 && !sending && (
              <div className="flex flex-col items-center justify-center text-center gap-4 py-16 px-4">
                {/* Role-specific introduction — saved DB fields take priority,
                    then legacy hardcoded intros, then a clean neutral default */}
                <div className="empty-box w-full max-w-sm rounded-2xl border border-cyan-400/25 bg-surface-900/40 backdrop-blur-sm px-6 py-5">
                  <p className="text-sm font-semibold leading-relaxed text-surface-100">
                    {roleIntro.title}
                  </p>
                  <p className="text-xs leading-relaxed text-surface-400 mt-2 whitespace-pre-line">
                    {roleIntro.body}
                  </p>
                </div>
                {/* Language hint */}
                <div className="w-full max-w-sm px-2">
                  <p className="text-xs leading-relaxed text-surface-400">
                    Say Hi in your preferred language:
                  </p>
                  <p className="text-xs leading-relaxed text-surface-300 mt-1 tracking-wide">
                    العربية · English · हिन्दी · Русский · اردو · 中文 · Español
                  </p>
                </div>
                {/* Start instruction */}
                <div className="empty-box-accent w-full max-w-xs rounded-xl border border-cyan-300/40 bg-surface-900/60 backdrop-blur-sm px-6 py-3.5">
                  <p className="text-sm font-medium tracking-wide text-surface-100">
                    Please type the first message.
                  </p>
                </div>
              </div>
            )}
            {history.map((msg, i) => (
              <div key={i} className={`flex gap-3 items-start ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && <BotAvatar />}
                <div className={`min-w-0 max-w-[78%] ${msg.role === 'user' ? 'w-fit' : 'flex-1'}`}>
                  {/* Scene description — hidden from client UI; still tracked internally for scene progression */}
                  <div className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bubble-user bg-primary-600/15 border border-primary-500/30 text-surface-100 rounded-tr-sm'
                      : 'bubble-role bg-surface-800/90 border border-surface-600/60 text-surface-200 rounded-tl-sm'
                  }`}>
                    {msg.role === 'assistant' ? renderAssistantContent(msg.content) : msg.content}
                  </div>
                  {msg.role === 'assistant' && msg.invitationSceneIndex !== undefined && (() => {
                    const inviteScene = scenes[msg.invitationSceneIndex!];
                    if (!inviteScene) return null;
                    const imageUrl = inviteScene.scene_image_url;
                    return (
                      <div className="mt-2 ml-0">
                        <div className="mb-1.5 select-none text-[12px] font-medium leading-none" style={{ color: '#E5E7EB' }}>
                          Unlock the Moment
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => imageUrl && openImage(imageUrl)}
                            disabled={!imageUrl || creditProcessing}
                            className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-[5px] text-[12px] font-medium transition-colors border"
                            style={imageUrl
                              ? { borderColor: '#34D399', background: 'rgba(15,23,42,0.4)', color: '#E5E7EB' }
                              : { borderColor: '#34D39955', background: 'transparent', color: '#9CA3AF' }}
                          >
                            Image
                            <Coins className="w-3.5 h-3.5 text-yellow-400" />
                            <span className="text-[11px] font-semibold" style={{ color: '#FBBF24' }}>4</span>
                          </button>
                          <button
                            onClick={() => inviteScene.video_url && openVideo(inviteScene.video_url)}
                            disabled={!inviteScene.video_url || creditProcessing}
                            className="inline-flex items-center justify-center gap-1.5 h-8 px-2.5 rounded-[5px] text-[12px] font-medium transition-colors border"
                            style={inviteScene.video_url
                              ? { borderColor: '#A78BFA', background: 'rgba(15,23,42,0.4)', color: '#E5E7EB' }
                              : { borderColor: '#A78BFA55', background: 'transparent', color: '#9CA3AF' }}
                          >
                            Video
                            <Coins className="w-3.5 h-3.5 text-yellow-400" />
                            <span className="text-[11px] font-semibold" style={{ color: '#FBBF24' }}>10</span>
                          </button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-full bg-surface-700/80 border border-surface-500/40 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <User className="w-4 h-4 text-surface-300" />
                  </div>
                )}
              </div>
            ))}
            {sending && (
              <div className="flex gap-3 justify-start items-start">
                <BotAvatar />
                <div className="bubble-role px-4 py-3 rounded-2xl rounded-tl-sm bg-surface-800/90 border border-surface-600/60 flex items-center gap-2">
                  <span className="text-xs text-surface-400">Typing</span>
                  <span className="flex gap-0.5">
                    <span className="typing-dot inline-block w-1 h-1 rounded-full bg-surface-400" />
                    <span className="typing-dot inline-block w-1 h-1 rounded-full bg-surface-400" />
                    <span className="typing-dot inline-block w-1 h-1 rounded-full bg-surface-400" />
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Error — hidden when signed out */}
        {chatError && !isSignedOut && (
          <div className="flex-shrink-0 px-4 pb-2">
            <div className="max-w-2xl mx-auto flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {chatError}
            </div>
          </div>
        )}

        {/* Credit error — hidden when signed out */}
        {creditError && !isSignedOut && (
          <div className="flex-shrink-0 px-4 pb-2">
            <div className="max-w-2xl mx-auto flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {creditError}
            </div>
          </div>
        )}

        {/* Input — sticky with safe-area inset */}
        <div
          className="flex-shrink-0 border-t border-surface-800/80 bg-surface-900/80 backdrop-blur-md px-4 py-3"
          style={{ paddingBottom: viewportHeight !== null && viewportHeight < window.innerHeight ? '0.75rem' : 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}
        >
          <div className="max-w-2xl mx-auto flex gap-2">
            <input
              type="text"
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={chatEnded ? 'Roleplay ended.' : isSignedOut ? 'Sign in to continue…' : chatLocked ? 'Add credits to continue…' : 'Type a message…'}
              className="input-field flex-1"
              disabled={sending || chatLocked || chatEnded || restoringHistory}
            />
            <button
              // Keep focus on the input when tapping Send on mobile: without this,
              // the blur closes the keyboard and resizes the viewport before the
              // click fires, delaying the send until the keyboard is closed.
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleSend}
              disabled={sending || chatLocked || chatEnded || restoringHistory || !message.trim()}
              className="btn-primary gap-1.5 flex-shrink-0"
            >
              {sending
                ? <Loader2 className="w-4 h-4 animate-spin" />
                : <Send className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Image lightbox */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => { setLightboxImage(null); setShowGenerating(false); if (generatingTimerRef.current) { clearTimeout(generatingTimerRef.current); generatingTimerRef.current = null; } }}
        >
          <div
            className="relative max-w-full max-h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={`absolute top-2 right-2 w-10 h-10 rounded-full bg-surface-800/80 border border-surface-700 flex items-center justify-center text-surface-300 hover:text-surface-100 transition-colors z-20 ${showGenerating ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
              onClick={(e) => { e.stopPropagation(); setLightboxImage(null); setShowGenerating(false); if (generatingTimerRef.current) { clearTimeout(generatingTimerRef.current); generatingTimerRef.current = null; } }}
            >
              <X className="w-5 h-5" />
            </button>
            {/* Generating overlay — timed, shown only on first open per session */}
            {showGenerating && <GeneratingOverlay />}
            {/* Scene image — loads in background, revealed after overlay timer */}
            <img
              src={lightboxImage}
              alt="Scene"
              className={`max-w-full max-h-full object-contain rounded-lg transition-opacity duration-300 ${showGenerating ? 'opacity-0' : 'opacity-100'}`}
            />
          </div>
        </div>
      )}

      {/* Video lightbox */}
      {lightboxVideo && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => { if (!showGenerating) { setLightboxVideo(null); setShowGenerating(false); if (generatingTimerRef.current) { clearTimeout(generatingTimerRef.current); generatingTimerRef.current = null; } } }}
        >
          <div
            className="relative max-w-full max-h-full flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className={`absolute top-2 right-2 w-10 h-10 rounded-full bg-surface-800/80 border border-surface-700 flex items-center justify-center text-surface-300 hover:text-surface-100 transition-colors z-20 ${showGenerating ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
              onClick={(e) => { e.stopPropagation(); setLightboxVideo(null); setShowGenerating(false); if (generatingTimerRef.current) { clearTimeout(generatingTimerRef.current); generatingTimerRef.current = null; } }}
            >
              <X className="w-5 h-5" />
            </button>
            {/* Generating overlay — timed, shown only on first open per session.
                A full-size placeholder keeps the container dimensions stable so touches
                on the media area don't fall through to the backdrop. */}
            {showGenerating && (
              <div className="relative w-[80vw] h-[80vh] max-w-full max-h-full rounded-lg overflow-hidden">
                <GeneratingOverlay />
              </div>
            )}
            {/* Video — only rendered after the overlay expires so no loading/playback happens during the wait */}
            {!showGenerating && (
              <video
                src={lightboxVideo}
                controls
                autoPlay
                playsInline
                preload="auto"
                className="max-w-full max-h-full rounded-lg opacity-100"
              />
            )}
          </div>
        </div>
      )}

      {/* Sign-in required popup — shown when client is not authenticated */}
      {showSignInModal && isSignedOut && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <div className="max-w-sm w-full card p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary-500/10 border border-primary-500/30 flex items-center justify-center mx-auto">
              <User className="w-7 h-7 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">Please sign in to continue</h2>
              <p className="text-sm text-surface-400 mt-1">
                Looks like you need to sign in before you can keep going.
              </p>
            </div>
            <div className="space-y-2">
              <a
                href={`/client-signup?return_to=${encodeURIComponent(`/test-chat${window.location.search}`)}`}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-semibold text-white bg-accent-600 hover:bg-accent-500 transition-colors"
              >
                Go to Dashboard
              </a>
            </div>
            <button
              onClick={() => setShowSignInModal(false)}
              className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Restore confirmation popup */}
      {showRestoreModal && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <div className="max-w-sm w-full card p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-primary-500/10 border border-primary-500/30 flex items-center justify-center mx-auto">
              <RotateCcw className="w-7 h-7 text-primary-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">Are you sure you want to restore the chat?</h2>
              <p className="text-sm text-surface-400 mt-1">
                Restore will reset the text conversation to the beginning. Previously generated or revealed media will not be restored or changed.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowRestoreModal(false)}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-surface-200 bg-surface-800 hover:bg-surface-700 border border-surface-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmRestore}
                className="flex-1 px-4 py-3 rounded-xl text-sm font-semibold text-white bg-accent-600 hover:bg-accent-500 transition-colors"
              >
                Restore
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Insufficient credits popup */}
      {insufficientInfo && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex items-center justify-center p-4">
          <div className="max-w-sm w-full card p-6 text-center space-y-4">
            <div className="w-14 h-14 rounded-full bg-warning-500/10 border border-warning-500/30 flex items-center justify-center mx-auto">
              <Lock className="w-7 h-7 text-warning-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-surface-100">Not enough credits</h2>
              <p className="text-sm text-surface-400 mt-1">
                You need <span className="font-semibold text-warning-400">{insufficientInfo.required} credits</span> to unlock this {insufficientInfo.mediaType === 'video' ? 'video' : 'image'}, but you have <span className="font-semibold text-surface-300">{insufficientInfo.balance} credits</span>.
              </p>
            </div>
            <div className="space-y-2">
              <a
                href="/client-welcome"
                className="flex items-center justify-center gap-2 w-full px-4 py-3 rounded-xl text-sm font-semibold text-white bg-accent-600 hover:bg-accent-500 transition-colors"
              >
                Go to Dashboard
              </a>
              <p className="text-xs text-surface-500">
                Add credits in the dashboard, then return here and refresh the page to continue.
              </p>
            </div>
            <button
              onClick={() => setInsufficientInfo(null)}
              className="text-xs text-surface-500 hover:text-surface-300 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
