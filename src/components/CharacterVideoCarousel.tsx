/**
 * Character Video Carousel
 *
 * Mother-Creator-only (DEV ON mode) video management for a single Character.
 * Videos belong to the Character ID, not a Role.
 * Upload, preview, replace, and delete 10–15s character videos.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload, Video, Trash2, RefreshCw, Loader2, ChevronLeft, ChevronRight, AlertCircle,
} from 'lucide-react';
import {
  loadCharacterVideos,
  uploadCharacterVideo,
  replaceCharacterVideo,
  deleteCharacterVideo,
  type CharacterVideoRow,
} from '../lib/character-studio-v2';

const MAX_DURATION = 15;
const MIN_DURATION = 10;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—';
  return `${seconds}s`;
}

export default function CharacterVideoCarousel({
  characterId,
  creatorId,
}: {
  characterId: string;
  creatorId: string;
}) {
  const [videos, setVideos] = useState<CharacterVideoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const replaceInputRef = useRef<HTMLInputElement | null>(null);
  const replacingIdRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadCharacterVideos(characterId);
      setVideos(rows);
      setActiveIndex(i => Math.min(i, Math.max(0, rows.length - 1)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [characterId]);

  useEffect(() => { load(); }, [load]);

  function validateVideo(file: File): { ok: boolean; duration?: number; msg?: string } {
    if (file.size > MAX_FILE_SIZE) {
      return { ok: false, msg: 'Video file is too large (max 50 MB).' };
    }
    if (!file.type.startsWith('video/')) {
      return { ok: false, msg: 'Please select a video file.' };
    }
    return { ok: true };
  }

  function measureDuration(file: File): Promise<number | undefined> {
    return new Promise(resolve => {
      const video = document.createElement('video');
      video.preload = 'metadata';
      const url = URL.createObjectURL(file);
      video.src = url;
      video.onloadedmetadata = () => {
        URL.revokeObjectURL(url);
        resolve(Math.round(video.duration));
      };
      video.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(undefined);
      };
    });
  }

  async function handleUpload(file: File) {
    const check = validateVideo(file);
    if (!check.ok) { setError(check.msg ?? 'Invalid video.'); return; }

    const duration = await measureDuration(file);
    if (duration != null && (duration < MIN_DURATION || duration > MAX_DURATION)) {
      setError(`Video must be ${MIN_DURATION}–${MAX_DURATION} seconds long (yours is ${duration}s).`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await uploadCharacterVideo(characterId, creatorId, file, duration);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function handleReplace(file: File) {
    const videoId = replacingIdRef.current;
    if (!videoId) return;
    const existing = videos.find(v => v.id === videoId);
    if (!existing) return;

    const check = validateVideo(file);
    if (!check.ok) { setError(check.msg ?? 'Invalid video.'); return; }

    const duration = await measureDuration(file);
    if (duration != null && (duration < MIN_DURATION || duration > MAX_DURATION)) {
      setError(`Video must be ${MIN_DURATION}–${MAX_DURATION} seconds long (yours is ${duration}s).`);
      return;
    }

    setUploading(true);
    setError(null);
    try {
      await replaceCharacterVideo(videoId, characterId, creatorId, existing.video_path, file, duration);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      replacingIdRef.current = null;
    }
  }

  async function handleDelete(videoId: string, videoPath: string | null) {
    setUploading(true);
    setError(null);
    try {
      await deleteCharacterVideo(videoId, videoPath);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  function startReplace(videoId: string) {
    replacingIdRef.current = videoId;
    replaceInputRef.current?.click();
  }

  const activeVideo = videos[activeIndex];

  return (
    <div className="mt-2 rounded-lg border border-surface-800 bg-surface-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-surface-500">
          <Video className="w-3.5 h-3.5" />
          Character Video
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-surface-200 bg-surface-800 hover:bg-surface-700 border border-surface-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
          {uploading ? 'Uploading…' : 'Upload Video'}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-2.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-300 text-xs">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-5 h-5 text-surface-500 animate-spin" />
        </div>
      ) : videos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 py-8 border-2 border-dashed border-surface-800 rounded-lg">
          <Video className="w-6 h-6 text-surface-600" />
          <p className="text-sm text-surface-400">No videos yet</p>
          <p className="text-xs text-surface-600">Upload a 10–15 second character video</p>
        </div>
      ) : (
        <>
          {/* Carousel viewport */}
          <div className="relative rounded-lg overflow-hidden border border-surface-800 bg-surface-950">
            <video
              key={activeVideo.id}
              src={activeVideo.video_url}
              controls
              playsInline
              className="w-full max-h-[320px] object-contain bg-black"
            />
            {videos.length > 1 && (
              <>
                <button
                  onClick={() => setActiveIndex(i => (i - 1 + videos.length) % videos.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/80 hover:text-white transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setActiveIndex(i => (i + 1) % videos.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center text-white/80 hover:bg-black/80 hover:text-white transition-colors"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </div>

          {/* Active video meta + actions */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 text-xs text-surface-500">
              <span>{activeIndex + 1} / {videos.length}</span>
              <span>·</span>
              <span>{formatDuration(activeVideo.duration_seconds)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => startReplace(activeVideo.id)}
                disabled={uploading}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-surface-300 bg-surface-800 hover:bg-surface-700 border border-surface-700 transition-colors disabled:opacity-50"
              >
                <RefreshCw className="w-3 h-3" />
                Replace
              </button>
              <button
                onClick={() => handleDelete(activeVideo.id, activeVideo.video_path)}
                disabled={uploading}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-danger-300 bg-danger-500/10 hover:bg-danger-500/20 border border-danger-500/30 transition-colors disabled:opacity-50"
              >
                <Trash2 className="w-3 h-3" />
                Delete
              </button>
            </div>
          </div>

          {/* Thumbnail dots */}
          {videos.length > 1 && (
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {videos.map((v, i) => (
                <button
                  key={v.id}
                  onClick={() => setActiveIndex(i)}
                  className={`h-1.5 rounded-full transition-all ${i === activeIndex ? 'w-6 bg-primary-500' : 'w-1.5 bg-surface-700 hover:bg-surface-600'}`}
                />
              ))}
            </div>
          )}
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleUpload(file);
          e.target.value = '';
        }}
      />
      <input
        ref={replaceInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file) handleReplace(file);
          e.target.value = '';
        }}
      />
    </div>
  );
}
