import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Loader2, Copy, Check, MessageSquare, AlertCircle, Library, CheckCircle2, Trash2, X, ExternalLink, Download } from 'lucide-react';
import QRCode from 'qrcode';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import {
  loadSelectedCharacter,
  loadAllRoleImageProductions,
  loadCharacterVideos,
  type RoleImageProductionRow,
  type CharacterVideoRow,
} from '../../lib/character-studio-v2';
import type { CharacterRoleRow } from '../../types/scene';

interface ActiveCharacterSummary {
  character_id: string;
  name: string;
  identity_image_url: string | null;
  identity_asset_id: string | null;
}

function isStatusDone(status: string): boolean {
  const s = status.toLowerCase();
  return s === 'done' || s === 'ready' || s === 'completed';
}

export default function ClientChatLinkPage() {
  const { creator, signOut } = useAuth();
  const [character, setCharacter] = useState<ActiveCharacterSummary | null>(null);
  const [roles, setRoles] = useState<CharacterRoleRow[]>([]);
  const [productions, setProductions] = useState<Map<string, RoleImageProductionRow>>(new Map());
  const [videos, setVideos] = useState<CharacterVideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedRoleId, setCopiedRoleId] = useState<string | null>(null);
  const [listedRoleIds, setListedRoleIds] = useState<Set<string>>(new Set());
  const [listingLoadingRoleId, setListingLoadingRoleId] = useState<string | null>(null);
  const [listingErrorByRole, setListingErrorByRole] = useState<Record<string, string>>({});
  const [confirmRemoveRoleId, setConfirmRemoveRoleId] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [qrDataUrls, setQrDataUrls] = useState<Record<string, string>>({});
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const load = useCallback(async () => {
    if (!creator?.id) return;
    setLoading(true);
    try {
      const [selChar, prods, rolesRes] = await Promise.all([
        loadSelectedCharacter(creator.id),
        loadAllRoleImageProductions(),
        supabase.from('character_roles').select('*').order('sort_order', { ascending: true }),
      ]);

      if (selChar) {
        setCharacter({
          character_id: selChar.character_id,
          name: selChar.name,
          identity_image_url: selChar.identity_image_url,
          identity_asset_id: selChar.identity_asset_id,
        });
        try {
          const vids = await loadCharacterVideos(selChar.character_id);
          setVideos(vids);
        } catch { setVideos([]); }
      }

      const prodMap = new Map<string, RoleImageProductionRow>();
      for (const p of prods) prodMap.set(p.role_id, p);
      setProductions(prodMap);

      setRoles((rolesRes.data ?? []) as CharacterRoleRow[]);
    } catch {
      /* ignore — UI shows empty state */
    } finally {
      setLoading(false);
    }
  }, [creator?.id]);

  useEffect(() => { load(); }, [load]);

  // Fetch all chat library listings for this creator in one query
  useEffect(() => {
    if (!creator?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('chat_library_listings')
        .select('role_id')
        .eq('creator_id', creator.id);
      if (!cancelled && data) {
        setListedRoleIds(new Set(data.map((row: { role_id: string }) => row.role_id)));
      }
    })();
    return () => { cancelled = true; };
  }, [creator?.id]);

  // Silent background video: muted, autoplay, loop. No Media Session — this is a
  // decorative background only, not active media playback.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = true;
    v.play().catch(() => { /* autoplay blocked — ignore, stays as static frame */ });
  }, [videos]);

  // Determine which roles are "Done" using the creator's own role image productions
  const doneRoles = useMemo(() => roles.filter(role => {
    const prod = productions.get(role.id);
    if (prod?.role_image_url) return true;
    return isStatusDone(prod?.role_image_status ?? '');
  }), [roles, productions]);

  // Generate QR codes locally for each done role's public chat URL
  useEffect(() => {
    if (!creator?.id) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const role of doneRoles) {
        const url = `${window.location.origin}/test-chat?role_id=${role.id}&creator_id=${creator.id}`;
        try {
          next[role.id] = await QRCode.toDataURL(url, {
            width: 512,
            margin: 2,
            errorCorrectionLevel: 'H',
            color: { dark: '#0c1210', light: '#ffffff' },
          });
        } catch { /* skip role — card renders without QR */ }
      }
      if (!cancelled) setQrDataUrls(next);
    })();
    return () => { cancelled = true; };
  }, [creator?.id, doneRoles]);

  function handleDownloadQr(roleId: string, roleName: string) {
    const dataUrl = qrDataUrls[roleId];
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    const safeName = roleName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'role';
    link.download = `chat-link-qr-${safeName}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function handleCopy(roleId: string) {
    if (!creator) return;
    const url = `${window.location.origin}/test-chat?role_id=${roleId}&creator_id=${creator.id}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }
    setCopiedRoleId(roleId);
    setTimeout(() => setCopiedRoleId(prev => (prev === roleId ? null : prev)), 2000);
  }

  async function handleAddToLibrary(roleId: string) {
    if (!creator?.id) return;
    setListingLoadingRoleId(roleId);
    setListingErrorByRole(prev => { const n = { ...prev }; delete n[roleId]; return n; });
    try {
      const { error: upsertError } = await supabase
        .from('chat_library_listings')
        .upsert({ creator_id: creator.id, role_id: roleId }, { onConflict: 'creator_id,role_id' });
      if (upsertError) throw new Error(upsertError.message);
      setListedRoleIds(prev => new Set(prev).add(roleId));
    } catch (e) {
      setListingErrorByRole(prev => ({ ...prev, [roleId]: (e as Error).message }));
    } finally {
      setListingLoadingRoleId(null);
    }
  }

  async function handleGoToChatLibrary() {
    setLeaving(true);
    await signOut();
    window.location.href = '/chat-library';
  }

  async function handleRemoveFromLibrary(roleId: string) {
    if (!creator?.id) return;
    setListingLoadingRoleId(roleId);
    setListingErrorByRole(prev => { const n = { ...prev }; delete n[roleId]; return n; });
    try {
      const { error: deleteError } = await supabase
        .from('chat_library_listings')
        .delete()
        .eq('creator_id', creator.id)
        .eq('role_id', roleId);
      if (deleteError) throw new Error(deleteError.message);
      setListedRoleIds(prev => { const n = new Set(prev); n.delete(roleId); return n; });
      setConfirmRemoveRoleId(null);
    } catch (e) {
      setListingErrorByRole(prev => ({ ...prev, [roleId]: (e as Error).message }));
    } finally {
      setListingLoadingRoleId(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-7 h-7 text-accent-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 overflow-y-auto bg-surface-950"
         style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'calc(env(safe-area-inset-bottom) + 5rem)' }}>
      {/* Full-section character video background — falls back to image when no video */}
      {videos.length > 0 && videos[0].video_url ? (
        <div className="fixed inset-0 pointer-events-none overflow-hidden bg-surface-950">
          <video
            ref={videoRef}
            src={videos[0].video_url}
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="w-full h-full object-cover pointer-events-none"
            style={{ filter: 'saturate(0.85)' }}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/55 via-surface-950/60 to-surface-950/85" />
        </div>
      ) : character?.identity_image_url && (
        <div className="fixed inset-0 pointer-events-none">
          <img
            src={character.identity_image_url}
            alt=""
            className="w-full h-full object-cover"
            style={{ opacity: 0.25, filter: 'blur(4px)' }}
            draggable={false}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-surface-950/70 to-surface-950/90" />
        </div>
      )}

      <div className="relative z-10 flex flex-col items-center px-6 pt-10 pb-8 min-h-full">
        {/* Title */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-accent-600/15 border border-accent-500/30 flex items-center justify-center mb-4">
            <MessageSquare className="w-7 h-7 text-accent-300" />
          </div>
          <h1 className="text-lg font-semibold text-surface-100 tracking-wide">Client Chat Link</h1>
          <p className="text-xs text-surface-400 mt-1 text-center max-w-xs">
            Share these links with your client so they can chat with your AI character.
          </p>
        </div>

        {/* No done roles state */}
        {doneRoles.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center max-w-sm">
            <div className="w-14 h-14 rounded-full bg-warning-500/10 border border-warning-500/20 flex items-center justify-center mb-4">
              <AlertCircle className="w-7 h-7 text-warning-400" />
            </div>
            <p className="text-sm font-medium text-surface-200 mb-1">No roles ready yet</p>
            <p className="text-xs text-surface-400 leading-relaxed">
              Complete at least one Role first — generate a role image in the Studio tab to unlock your Client chat link.
            </p>
          </div>
        ) : (
          <div className="w-full max-w-md flex flex-col gap-4">
            {/* Character card */}
            {character && (
              <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5">
                <div className="text-[10px] font-bold tracking-wider uppercase text-surface-500 mb-3">Character</div>
                <div className="flex items-center gap-3">
                  {character.identity_image_url && (
                    <img
                      src={character.identity_image_url}
                      alt={character.name}
                      className="w-12 h-12 rounded-xl object-cover border border-white/15 flex-shrink-0"
                    />
                  )}
                  <div className="min-w-0">
                    <div className="text-sm font-bold text-white truncate">{character.name}</div>
                    <div className="text-[11px] text-surface-400">Your locked character identity</div>
                  </div>
                </div>
              </div>
            )}

            {/* One card per completed role */}
            {doneRoles.map(role => {
              const chatUrl = creator
                ? `${window.location.origin}/test-chat?role_id=${role.id}&creator_id=${creator.id}`
                : '';
              const isCopied = copiedRoleId === role.id;
              const isListed = listedRoleIds.has(role.id);
              const isListing = listingLoadingRoleId === role.id;
              const listingError = listingErrorByRole[role.id] ?? null;
              const roleIndex = doneRoles.indexOf(role);
              const isLastRole = roleIndex === doneRoles.length - 1;
              return (
                <div key={role.id}>
                <div className="flex flex-col gap-3">
                  {/* Role card */}
                  <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5">
                    <div className="text-[10px] font-bold tracking-wider uppercase mb-3" style={{ color: '#35D6A0' }}>Role</div>
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">{role.name}</div>
                        <div className="text-[11px] text-surface-400 mt-0.5">
                          {role.description?.trim() ? role.description : 'No description'}
                        </div>
                      </div>
                      <span className="text-[10px] font-bold tracking-wider uppercase text-success-400 bg-success-500/10 px-2 py-0.5 rounded-full border border-success-500/20 flex-shrink-0">
                        Done
                      </span>
                    </div>
                  </div>

                  {/* Chat link card */}
                  <div className="rounded-2xl border border-accent-500/20 bg-accent-600/5 backdrop-blur-md p-5">
                    <div className="text-[10px] font-bold tracking-wider uppercase text-accent-400 mb-3">Public Chat Link</div>
                    {qrDataUrls[role.id] && (
                      <div className="flex flex-col items-center mb-4">
                        <div className="bg-white p-2 rounded-xl">
                          <img
                            src={qrDataUrls[role.id]}
                            alt={`QR code linking to the public chat for ${role.name}`}
                            className="w-40 h-40"
                          />
                        </div>
                        <p className="text-[10px] text-surface-400 mt-2 text-center">
                          Scan to open this role's public chat
                        </p>
                        <button
                          onClick={() => handleDownloadQr(role.id, role.name)}
                          className="mt-2 flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-semibold bg-surface-800/80 text-surface-200 border border-surface-700 hover:bg-surface-700/80 transition-colors"
                        >
                          <Download className="w-3.5 h-3.5" />Download QR Code
                        </button>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        readOnly
                        value={chatUrl}
                        className="flex-1 min-w-0 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5 text-xs text-surface-300 font-mono"
                        onClick={(e) => (e.target as HTMLInputElement).select()}
                      />
                      <button
                        onClick={() => handleCopy(role.id)}
                        className={`flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-xs font-semibold transition-colors flex-shrink-0 ${
                          isCopied
                            ? 'bg-success-500/20 text-success-300 border border-success-500/30'
                            : 'bg-accent-600/20 text-accent-300 border border-accent-500/30 hover:bg-accent-600/30'
                        }`}
                      >
                        {isCopied ? (
                          <><Check className="w-3.5 h-3.5" />Copied</>
                        ) : (
                          <><Copy className="w-3.5 h-3.5" />Copy</>
                        )}
                      </button>
                    </div>
                    <p className="text-[10px] text-surface-500 mt-2.5 leading-relaxed">
                      This link opens a public chat box where your client can talk to your AI character. No login required.
                    </p>
                  </div>

                  {/* Add to Chat Library button */}
                  <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-4">
                    {isListed && confirmRemoveRoleId === role.id ? (
                      <div className="flex flex-col gap-3">
                        <p className="text-xs text-surface-200 text-center">
                          Remove this role from the Chat Library?
                        </p>
                        <div className="flex gap-3">
                          <button
                            onClick={() => handleRemoveFromLibrary(role.id)}
                            disabled={isListing}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-danger-500/20 text-danger-300 border border-danger-500/30 hover:bg-danger-500/30 transition-all duration-150 disabled:opacity-40"
                          >
                            {isListing ? (
                              <><Loader2 className="w-4 h-4 animate-spin" />Removing…</>
                            ) : (
                              <><Trash2 className="w-4 h-4" />Remove</>
                            )}
                          </button>
                          <button
                            onClick={() => setConfirmRemoveRoleId(null)}
                            disabled={isListing}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-surface-800 text-surface-300 border border-surface-700 hover:bg-surface-700 transition-all duration-150 disabled:opacity-40"
                          >
                            <X className="w-4 h-4" />Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        onClick={() => isListed ? setConfirmRemoveRoleId(role.id) : handleAddToLibrary(role.id)}
                        disabled={isListing}
                        className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-150 ${
                          isListed
                            ? 'bg-success-500/15 text-success-300 border border-success-500/30 hover:bg-success-500/25 cursor-pointer'
                            : isListing
                              ? 'bg-surface-800 text-surface-400 border border-surface-700 cursor-wait'
                              : 'bg-accent-600/20 text-accent-300 border border-accent-500/30 hover:bg-accent-600/30'
                        }`}
                      >
                        {isListing ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Adding…</>
                        ) : isListed ? (
                          <><CheckCircle2 className="w-4 h-4" />Listed in Chat Library</>
                        ) : (
                          <><Library className="w-4 h-4" />Add to Chat Library</>
                        )}
                      </button>
                    )}
                    {listingError && (
                      <p className="text-[10px] text-danger-400 mt-2 text-center">{listingError}</p>
                    )}
                    {isListed && confirmRemoveRoleId !== role.id && (
                      <p className="text-[10px] text-surface-500 mt-2 text-center leading-relaxed">
                        This chat is visible on the public Chat Library page. Tap to remove.
                      </p>
                    )}
                  </div>
                </div>
                {!isLastRole && (
                  <div className="flex items-center justify-center my-4">
                    <div
                      className="rounded-full"
                      style={{
                        height: '2px',
                        width: '160px',
                        background:
                          'linear-gradient(90deg, transparent 0%, #35D6A0 50%, transparent 100%)',
                        opacity: 0.7,
                        boxShadow: '0 0 6px rgba(53,214,160,0.4)',
                      }}
                    />
                  </div>
                )}
                </div>
              );
            })}
          </div>
        )}

        {/* Go to Chat Library shortcut */}
        <div className="w-full max-w-md mt-6 flex flex-col items-center gap-3">
          <p className="text-xs text-surface-400 text-center leading-relaxed max-w-xs">
            See your listed roleplay in our public library and explore how it appears to visitors.
          </p>
          <button
            onClick={handleGoToChatLibrary}
            disabled={leaving}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-semibold bg-surface-800/60 text-surface-300 border border-surface-700 hover:bg-surface-700/60 transition-all duration-150 disabled:opacity-40 backdrop-blur-md"
          >
            {leaving ? (
              <><Loader2 className="w-4 h-4 animate-spin" />Redirecting…</>
            ) : (
              <><ExternalLink className="w-4 h-4" />Go to Chat Library</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
