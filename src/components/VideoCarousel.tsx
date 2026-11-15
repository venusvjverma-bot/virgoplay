import { useCallback, useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Save, Film, Check, GripVertical, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface LoginVideo {
  id: string;
  title: string | null;
  storage_path: string;
  video_url: string | null;
  sort_order: number;
  is_selected: boolean;
}

const BUCKET = 'login-videos';

export default function VideoCarousel() {
  const [videos, setVideos] = useState<LoginVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const dragIndex = useRef<number | null>(null);

  const refreshSignedUrls = useCallback(async (rows: LoginVideo[]): Promise<LoginVideo[]> => {
    const refreshed = await Promise.all(rows.map(async (r) => {
      const { data, error: se } = await supabase.storage
        .from(BUCKET).createSignedUrl(r.storage_path, 3600 * 24 * 7);
      if (se || !data?.signedUrl) return r;
      return { ...r, video_url: data.signedUrl };
    }));
    await Promise.all(refreshed.map(async (r) => {
      if (r.video_url) {
        await supabase.from('login_videos')
          .update({ video_url: r.video_url }).eq('id', r.id);
      }
    }));
    return refreshed;
  }, []);

  const loadVideos = useCallback(async () => {
    setLoading(true);
    setError('');
    const { data, error: qe } = await supabase
      .from('login_videos').select('*').order('sort_order', { ascending: true });
    if (qe) { setError(qe.message); setLoading(false); return; }
    const refreshed = await refreshSignedUrls(data as LoginVideo[]);
    setVideos(refreshed);
    setLoading(false);
  }, [refreshSignedUrls]);

  useEffect(() => { void loadVideos(); }, [loadVideos]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    setError('');
    try {
      const maxOrder = videos.reduce((m, v) => Math.max(m, v.sort_order), -1);
      let i = 0;
      for (const file of files) {
        if (file.type !== 'video/mp4') { setError('Only MP4 files are allowed.'); continue; }
        if (file.size > 104857600) { setError('Each file must be under 100 MB.'); continue; }
        const ext = file.name.split('.').pop() ?? 'mp4';
        const path = `${Date.now()}_${i}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        i += 1;
        const { error: ue } = await supabase.storage
          .from(BUCKET).upload(path, file, { contentType: 'video/mp4', upsert: false });
        if (ue) { setError(ue.message); continue; }
        const { data: sdata, error: se } = await supabase.storage
          .from(BUCKET).createSignedUrl(path, 3600 * 24 * 7);
        if (se || !sdata?.signedUrl) { setError(se?.message ?? 'Failed to sign URL.'); continue; }
        const { data: row, error: ie } = await supabase
          .from('login_videos').insert({
            title: file.name.replace(/\.[^.]+$/, ''),
            storage_path: path,
            video_url: sdata.signedUrl,
            sort_order: maxOrder + i,
            is_selected: true,
          }).select().single();
        if (ie) { setError(ie.message); continue; }
        setVideos(prev => [...prev, row as LoginVideo]);
      }
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function toggleSelected(id: string) {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, is_selected: !v.is_selected } : v));
  }

  function updateTitle(id: string, title: string) {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, title } : v));
  }

  function removeVideo(id: string) {
    setVideos(prev => prev.map(v => v.id === id ? { ...v, _deleted: true } : v) as LoginVideo[]);
  }

  function dragStart(idx: number) { dragIndex.current = idx; }
  function dragOver(e: React.DragEvent, idx: number) { e.preventDefault(); }
  function drop(idx: number) {
    const from = dragIndex.current;
    if (from === null || from === idx) return;
    setVideos(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      return next.map((v, i) => ({ ...v, sort_order: i }));
    });
    dragIndex.current = null;
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const toDelete = videos.filter(v => (v as LoginVideo & { _deleted?: boolean })._deleted);
      const toKeep = videos.filter(v => !(v as LoginVideo & { _deleted?: boolean })._deleted);

      for (const v of toDelete) {
        await supabase.storage.from(BUCKET).remove([v.storage_path]);
        await supabase.from('login_videos').delete().eq('id', v.id);
      }

      await Promise.all(toKeep.map(async (v, i) => {
        await supabase.from('login_videos').update({
          title: v.title,
          is_selected: v.is_selected,
          sort_order: i,
        }).eq('id', v.id);
      }));

      setVideos(toKeep.map((v, i) => ({ ...v, sort_order: i })));
      setSuccess('Video carousel saved.');
      setTimeout(() => setSuccess(''), 2500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="w-full max-w-md mt-8">
      <div className="card">
        <div className="flex items-center gap-2 mb-4">
          <Film className="w-5 h-5 text-primary-400" />
          <h2 className="text-lg font-semibold text-surface-50">Video Carousel</h2>
        </div>
        <p className="text-sm text-surface-400 mb-4">
          Upload MP4 videos for the login screen carousel. Reorder by dragging, toggle which ones appear, and save your selection.
        </p>

        {error && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm mb-4">
            <span>{error}</span>
          </div>
        )}
        {success && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-success-500/10 border border-success-500/20 text-success-400 text-sm mb-4">
            <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        {/* Upload zone */}
        <div
          onClick={() => fileRef.current?.click()}
          className="border-2 border-dashed border-surface-700 rounded-xl p-6 text-center cursor-pointer hover:border-primary-500/50 transition-colors mb-4"
        >
          <input
            ref={fileRef}
            type="file"
            accept="video/mp4"
            multiple
            className="hidden"
            onChange={handleUpload}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2 text-surface-400">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span className="text-sm">Uploading...</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-surface-400">
              <Upload className="w-6 h-6" />
              <span className="text-sm">Click to upload MP4 videos</span>
              <span className="text-xs text-surface-500">MP4 only, up to 100 MB each</span>
            </div>
          )}
        </div>

        {/* Video list */}
        {loading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
          </div>
        ) : videos.length === 0 ? (
          <p className="text-center text-sm text-surface-500 py-4">No videos uploaded yet.</p>
        ) : (
          <div className="space-y-3">
            {videos
              .filter(v => !(v as LoginVideo & { _deleted?: boolean })._deleted)
              .map((v, idx) => (
                <div
                  key={v.id}
                  draggable
                  onDragStart={() => dragStart(idx)}
                  onDragOver={(e) => dragOver(e, idx)}
                  onDrop={() => drop(idx)}
                  className={`flex gap-3 p-3 rounded-lg border transition-colors ${
                    v.is_selected
                      ? 'border-surface-700 bg-surface-900/50'
                      : 'border-surface-800 bg-surface-900/20 opacity-60'
                  }`}
                >
                  <div className="flex items-center text-surface-600 cursor-grab active:cursor-grabbing">
                    <GripVertical className="w-4 h-4" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={v.title ?? ''}
                      onChange={(e) => updateTitle(v.id, e.target.value)}
                      placeholder="Video title"
                      className="input-field text-sm py-1.5 mb-2"
                    />
                    {v.video_url && (
                      <video
                        src={v.video_url}
                        className="w-full rounded-lg max-h-32 object-cover bg-surface-950"
                        controls
                        preload="metadata"
                      />
                    )}
                  </div>

                  <div className="flex flex-col items-center gap-2">
                    <button
                      type="button"
                      onClick={() => toggleSelected(v.id)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        v.is_selected
                          ? 'bg-primary-600/20 text-primary-400'
                          : 'bg-surface-800 text-surface-500'
                      }`}
                      title={v.is_selected ? 'Shown in carousel' : 'Hidden from carousel'}
                    >
                      <Check className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeVideo(v.id)}
                      className="p-1.5 rounded-lg bg-danger-500/10 text-danger-400 hover:bg-danger-500/20 transition-colors"
                      title="Remove video"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
          </div>
        )}

        {/* Save bar */}
        {videos.length > 0 && (
          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="btn-primary w-full py-2.5 mt-4 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? 'Saving...' : 'Save Carousel'}
          </button>
        )}
      </div>
    </div>
  );
}
