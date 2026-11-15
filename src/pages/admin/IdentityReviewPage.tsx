import { useState, useEffect } from 'react';
import { Layers, AlertCircle, Loader2, ChevronLeft, ChevronRight, ExternalLink, Info, FlaskConical } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import AdminNav from '../../components/AdminNav';

// ── Compose Test constants ─────────────────────────────────────────────────────
const APR003_URL = 'https://osatedtxkkymvrodczlg.supabase.co/storage/v1/object/public/appearance-presets/APR-003/preview.jpg';
const BT003_URL  = 'https://osatedtxkkymvrodczlg.supabase.co/storage/v1/object/public/body-type-presets/BT-003/preview_1782081876354.jpg';
const RESULT_URL = 'https://osatedtxkkymvrodczlg.supabase.co/storage/v1/object/public/identity-composition-tests/BT-003-APR-003-compose-test.jpg';

// ── Types ─────────────────────────────────────────────────────────────────────

interface VariantPair {
  variant_code:        string;
  source_package_code: string;
  face_preset_id:      string;
  body_preset_id:      string | null;
  variant_url:         string | null;
  is_generated:        boolean;
  error_message:       string | null;
  original_url:        string | null;
}

interface FaceAsset {
  preset_id:   string;
  preset_name: string;
  image_url:   string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function ImagePanel({
  url,
  label,
  code,
  status,
  error,
}: {
  url:    string | null;
  label:  string;
  code:   string;
  status: 'original' | 'generated' | 'failed';
  error?: string | null;
}) {
  const [loaded,  setLoaded]  = useState(false);
  const [errored, setErrored] = useState(false);

  const statusPill =
    status === 'original'  ? 'bg-surface-700/60 text-surface-400 border-surface-700'  :
    status === 'generated' ? 'bg-accent-500/10  text-accent-400  border-accent-500/20' :
                             'bg-danger-500/10  text-danger-400  border-danger-500/20';

  return (
    <div className="flex-1 min-w-0 flex flex-col gap-2">
      {/* Label row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-surface-200 truncate">{label}</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${statusPill}`}>
            {code}
          </span>
        </div>
        {url && (
          <a href={url} target="_blank" rel="noreferrer"
            className="flex-shrink-0 text-surface-500 hover:text-surface-300 transition-colors"
            title="Open full size">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>

      {/* Image or state */}
      <div className="relative w-full rounded-xl overflow-hidden bg-surface-800 border border-surface-700"
        style={{ aspectRatio: '3/4' }}>
        {status === 'failed' || (!url && status !== 'original') ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center">
            <AlertCircle className="w-8 h-8 text-danger-400" />
            <p className="text-xs text-danger-400 font-medium">Generation failed</p>
            {error && (
              <p className="text-[10px] text-surface-500 leading-relaxed line-clamp-4">
                {error.replace(/fal\.ai face-swap \(\d+\): /, '').replace(/[\{\}\[\]"]/g, '')}
              </p>
            )}
          </div>
        ) : !url ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <Loader2 className="w-6 h-6 text-surface-600 animate-spin" />
          </div>
        ) : (
          <>
            {!loaded && !errored && (
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <Loader2 className="w-6 h-6 text-surface-600 animate-spin" />
              </div>
            )}
            {errored ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                <AlertCircle className="w-6 h-6 text-surface-600" />
                <span className="text-xs text-surface-600">Failed to load</span>
              </div>
            ) : (
              <img
                src={url}
                alt={code}
                onLoad={() => setLoaded(true)}
                onError={() => setErrored(true)}
                className={[
                  'absolute inset-0 w-full h-full object-cover transition-opacity duration-300',
                  loaded ? 'opacity-100' : 'opacity-0',
                ].join(' ')}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Compose Test Tab ──────────────────────────────────────────────────────────

function ComposeTestTab() {
  const panels = [
    {
      label: 'APR-003 · Chinese Style',
      sublabel: 'Face source',
      badge: 'FACE',
      badgeClass: 'bg-primary-500/10 text-primary-400 border-primary-500/20',
      url: APR003_URL,
    },
    {
      label: 'BT-003 · Curvy',
      sublabel: 'Body source',
      badge: 'BODY',
      badgeClass: 'bg-warning-500/10 text-warning-400 border-warning-500/20',
      url: BT003_URL,
    },
    {
      label: 'APR-003 face → BT-003 body',
      sublabel: 'Composed result',
      badge: 'RESULT',
      badgeClass: 'bg-accent-500/10 text-accent-400 border-accent-500/20',
      url: RESULT_URL,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Technique disclosure */}
      <div className="bg-surface-800/40 border border-surface-700/60 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-surface-400 flex-shrink-0" />
          <span className="text-sm font-semibold text-surface-200">Technique Disclosure</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          {[
            { label: '(a) True composition', desc: 'Segment face + body separately, blend seams with custom pipeline.', active: false },
            { label: '(b) Face swap', desc: 'APR-003 face region transplanted onto BT-003 body scene via fal.ai face-swap.', active: true },
            { label: '(c) Image regeneration', desc: 'New image generated from both presets as references — does not preserve exact clothing.', active: false },
          ].map(({ label, desc, active }) => (
            <div key={label} className={[
              'rounded-lg border p-3 space-y-1 transition-colors',
              active
                ? 'bg-primary-500/10 border-primary-500/30'
                : 'bg-surface-800 border-surface-700 opacity-50',
            ].join(' ')}>
              <div className="flex items-center gap-1.5">
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${active ? 'bg-primary-400' : 'bg-surface-600'}`} />
                <span className={`text-[11px] font-semibold ${active ? 'text-primary-300' : 'text-surface-400'}`}>{label}</span>
                {active && (
                  <span className="ml-auto text-[9px] px-1.5 py-0.5 rounded bg-primary-600/20 text-primary-400 border border-primary-500/20 font-mono">
                    USED
                  </span>
                )}
              </div>
              <p className="text-[10px] text-surface-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-surface-500 space-y-0.5 pt-1 border-t border-surface-700">
          <p><span className="text-surface-400">What is preserved:</span> BT-003 exact clothing, body proportions, composition.</p>
          <p><span className="text-surface-400">What is replaced:</span> Face region only — APR-003 face injected in place.</p>
          <p><span className="text-surface-400">Automatic blending:</span> Neck/chest skin tone blended by fal.ai model (not manually controlled).</p>
          <p><span className="text-surface-400">Hair:</span> May be APR-003 hair, BT-003 hair, or a blend — depends on model output.</p>
        </div>
      </div>

      {/* Three-panel comparison */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {panels.map(({ label, sublabel, badge, badgeClass, url }) => (
          <div key={badge} className="card space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-surface-200 leading-tight">{label}</p>
                <p className="text-[10px] text-surface-500 mt-0.5">{sublabel}</p>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono ${badgeClass}`}>{badge}</span>
                <a href={url} target="_blank" rel="noreferrer"
                  className="text-surface-500 hover:text-surface-300 transition-colors"
                  title="Open full size">
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>

            <div className="relative w-full rounded-xl overflow-hidden bg-surface-800 border border-surface-700" style={{ aspectRatio: '2/3' }}>
              <ImageWithLoader url={url} alt={label} />
            </div>

            <p className="text-[10px] font-mono text-surface-600 truncate">{url.split('/').pop()}</p>
          </div>
        ))}
      </div>

      {/* Review checklist */}
      <div className="card space-y-3">
        <p className="text-sm font-semibold text-surface-200">Human Review Checklist</p>
        <p className="text-xs text-surface-500">
          Open the RESULT image full-size (click the link icon above) and evaluate each point:
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            'Face preservation accuracy — does APR-003 face identity appear in result?',
            'Skin tone matching — is neck/chest blended to face skin tone?',
            'Neck blending quality — visible seam or natural transition?',
            'Hair consistency — APR-003 hair or BT-003 hair in result?',
            'Clothing preservation — does BT-003 swimsuit/outfit appear unchanged?',
            'Body proportions — does Curvy body shape from BT-003 remain?',
            'Overall realism — does the combined result look photorealistic?',
          ].map((item, i) => (
            <div key={i} className="flex items-start gap-2 text-[11px] text-surface-400">
              <span className="flex-shrink-0 w-4 h-4 rounded border border-surface-600 bg-surface-800 mt-0.5" />
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Storage info */}
      <div className="flex items-start gap-2 text-[11px] text-surface-500">
        <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5 text-surface-600" />
        <span>
          Result stored at{' '}
          <code className="text-primary-500">identity-composition-tests/BT-003-APR-003-compose-test.jpg</code>
        </span>
      </div>
    </div>
  );
}

function ImageWithLoader({ url, alt }: { url: string; alt: string }) {
  const [loaded, setLoaded] = useState(false);
  const [err,    setErr]    = useState(false);
  return (
    <>
      {!loaded && !err && (
        <div className="absolute inset-0 flex items-center justify-center z-10">
          <Loader2 className="w-6 h-6 text-surface-600 animate-spin" />
        </div>
      )}
      {err ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
          <AlertCircle className="w-6 h-6 text-surface-600" />
          <span className="text-xs text-surface-600">Failed to load</span>
        </div>
      ) : (
        <img
          src={url}
          alt={alt}
          onLoad={() => setLoaded(true)}
          onError={() => setErr(true)}
          className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IdentityReviewPage() {
  const [tab,        setTab]        = useState<'variants' | 'compose'>('variants');
  const [pairs,      setPairs]      = useState<VariantPair[]>([]);
  const [faceAssets, setFaceAssets] = useState<FaceAsset[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [activeIdx,  setActiveIdx]  = useState(0);
  const [faceFilter, setFaceFilter] = useState<string>('all');

  useEffect(() => {
    (async () => {
      const [variantsRes, facesRes] = await Promise.all([
        supabase
          .from('engine_image_package_variants')
          .select('variant_code, source_package_code, face_preset_id, body_preset_id, image_url, is_generated, error_message')
          .order('variant_code'),
        supabase
          .from('engine_appearance_preset_assets')
          .select('preset_id, preset_name, image_url')
          .order('preset_id'),
      ]);

      if (variantsRes.error) { setError(variantsRes.error.message); setLoading(false); return; }
      const variantRows = variantsRes.data ?? [];

      // Fetch originals — one URL per package_code
      const sourceCodes = [...new Set((variantRows ?? []).map(v => v.source_package_code))];
      const { data: originals } = await supabase
        .from('engine_image_packages')
        .select('package_code, image_url, updated_at')
        .in('package_code', sourceCodes)
        .eq('is_active', true)
        .not('image_url', 'is', null)
        .order('package_code')
        .order('updated_at', { ascending: false });

      // De-duplicate originals
      const originMap: Record<string, string> = {};
      for (const row of (originals ?? [])) {
        if (!originMap[row.package_code]) originMap[row.package_code] = row.image_url;
      }

      const enriched: VariantPair[] = (variantRows ?? []).map(v => ({
        ...v,
        variant_url:  v.image_url ?? null,
        original_url: originMap[v.source_package_code] ?? null,
      }));

      setPairs(enriched);

      if (facesRes.data) setFaceAssets(facesRes.data as FaceAsset[]);
      setLoading(false);
    })();
  }, []);

  const faceIds  = [...new Set(pairs.map(p => p.face_preset_id))];
  const filtered = faceFilter === 'all' ? pairs : pairs.filter(p => p.face_preset_id === faceFilter);
  const total    = filtered.length;
  const current  = filtered[activeIdx] ?? null;

  const prev = () => setActiveIdx(i => Math.max(0, i - 1));
  const next = () => setActiveIdx(i => Math.min(total - 1, i + 1));

  const faceAsset = current
    ? faceAssets.find(f => f.preset_id === current.face_preset_id) ?? null
    : null;

  const generated = filtered.filter(p => p.is_generated).length;
  const failed    = filtered.filter(p => !p.is_generated).length;

  return (
    <div className="min-h-screen bg-surface-950">
      <AdminNav />

      <div className="max-w-6xl mx-auto px-4 py-8 space-y-6">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-primary-400" />
              <h1 className="text-xl font-semibold text-surface-50">Identity Variant Review</h1>
            </div>
            <p className="text-sm text-surface-400">
              Side-by-side comparison of original MT-IMG assets vs identity variants.
            </p>
          </div>

          {/* Stats (variants tab only) */}
          {!loading && tab === 'variants' && (
            <div className="flex items-center gap-3 text-xs flex-shrink-0">
              <span className="px-2.5 py-1.5 rounded-lg bg-accent-500/10 border border-accent-500/20 text-accent-400 font-medium">
                {filtered.filter(p => p.is_generated).length} generated
              </span>
              {filtered.filter(p => !p.is_generated).length > 0 && (
                <span className="px-2.5 py-1.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 font-medium">
                  {filtered.filter(p => !p.is_generated).length} failed
                </span>
              )}
            </div>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-surface-800/60 border border-surface-700/60 w-fit">
          {([
            { id: 'variants', label: 'MT-IMG Variants',    icon: Layers        },
            { id: 'compose',  label: 'Compose Test (POC)', icon: FlaskConical  },
          ] as const).map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={[
                'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-all',
                tab === id
                  ? 'bg-surface-700 text-surface-100 shadow-sm'
                  : 'text-surface-500 hover:text-surface-300',
              ].join(' ')}>
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {/* Compose tab */}
        {tab === 'compose' && <ComposeTestTab />}

        {/* Variants tab content */}
        {tab === 'variants' && <>

        {/* Storage info */}
        <div className="flex items-start gap-2 bg-surface-800/40 border border-surface-700/60 rounded-lg px-4 py-3">
          <Info className="w-3.5 h-3.5 text-surface-500 flex-shrink-0 mt-0.5" />
          <div className="text-[11px] text-surface-500 space-y-0.5">
            <p>
              <span className="text-surface-400 font-medium">Variants bucket: </span>
              <code className="text-primary-400">identity-test-variants/{'{'}variant_code{'}'}.jpg</code>
            </p>
            <p>
              <span className="text-surface-400 font-medium">Originals bucket: </span>
              <code className="text-primary-400">image-packages/{'{'}creator_id{'}'}/{'{'}package_code{'}'}/image.jpg</code>
            </p>
          </div>
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-6 h-6 text-surface-500 animate-spin" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 p-4 rounded-xl bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20 text-surface-500 text-sm">
            No variants found.
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <>
            {/* Face filter + pagination */}
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 flex-wrap">
                <button
                  onClick={() => { setFaceFilter('all'); setActiveIdx(0); }}
                  className={[
                    'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                    faceFilter === 'all'
                      ? 'bg-primary-600/15 text-primary-400 border-primary-600/20'
                      : 'text-surface-400 hover:text-surface-200 border-surface-700 hover:border-surface-600',
                  ].join(' ')}>
                  All
                </button>
                {faceIds.map(id => {
                  const fa = faceAssets.find(f => f.preset_id === id);
                  return (
                    <button
                      key={id}
                      onClick={() => { setFaceFilter(id); setActiveIdx(0); }}
                      className={[
                        'px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors',
                        faceFilter === id
                          ? 'bg-primary-600/15 text-primary-400 border-primary-600/20'
                          : 'text-surface-400 hover:text-surface-200 border-surface-700 hover:border-surface-600',
                      ].join(' ')}>
                      {fa?.preset_name ?? id}
                    </button>
                  );
                })}
              </div>

              {/* Pagination controls */}
              <div className="flex items-center gap-2">
                <span className="text-xs text-surface-500">
                  {activeIdx + 1} / {total}
                </span>
                <button
                  onClick={prev}
                  disabled={activeIdx === 0}
                  className="w-8 h-8 rounded-lg border border-surface-700 bg-surface-800 hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
                  <ChevronLeft className="w-4 h-4 text-surface-300" />
                </button>
                <button
                  onClick={next}
                  disabled={activeIdx >= total - 1}
                  className="w-8 h-8 rounded-lg border border-surface-700 bg-surface-800 hover:bg-surface-700 disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center transition-colors">
                  <ChevronRight className="w-4 h-4 text-surface-300" />
                </button>
              </div>
            </div>

            {/* Thumbnail strip */}
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {filtered.map((p, i) => (
                <button
                  key={p.variant_code}
                  onClick={() => setActiveIdx(i)}
                  className={[
                    'flex-shrink-0 w-16 h-20 rounded-lg overflow-hidden border-2 transition-all',
                    i === activeIdx
                      ? 'border-primary-500 shadow-lg shadow-primary-500/20'
                      : 'border-surface-700 hover:border-surface-500',
                    !p.is_generated ? 'opacity-50' : '',
                  ].join(' ')}>
                  {p.variant_url ? (
                    <img src={p.variant_url} alt={p.variant_code} className="w-full h-full object-cover" />
                  ) : p.original_url ? (
                    <img src={p.original_url} alt={p.source_package_code} className="w-full h-full object-cover opacity-30" />
                  ) : (
                    <div className="w-full h-full bg-surface-800 flex items-center justify-center">
                      <AlertCircle className="w-4 h-4 text-danger-400" />
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 px-1 py-0.5">
                    <span className="text-[9px] font-mono text-white/70">
                      {p.source_package_code.replace('MT-IMG-', '')}
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {current && (
              <>
                {/* Main comparison */}
                <div className="card space-y-4">
                  {/* Metadata row */}
                  <div className="flex items-center justify-between pb-3 border-b border-surface-800">
                    <div className="flex items-center gap-3">
                      {faceAsset?.image_url && (
                        <img
                          src={faceAsset.image_url}
                          alt={faceAsset.preset_name}
                          className="w-10 h-10 rounded-full object-cover border-2 border-primary-500/30"
                        />
                      )}
                      <div>
                        <p className="text-sm font-semibold text-surface-200">
                          {current.source_package_code}
                          <span className="text-surface-500 font-normal mx-1.5">→</span>
                          {current.variant_code}
                        </p>
                        <p className="text-[11px] text-surface-500">
                          Face: <span className="text-surface-400">{faceAsset?.preset_name ?? current.face_preset_id}</span>
                          {current.body_preset_id && (
                            <> · Body: <span className="text-surface-400">{current.body_preset_id}</span></>
                          )}
                        </p>
                      </div>
                    </div>
                    <span className={[
                      'text-xs px-2.5 py-1 rounded-full border font-medium',
                      current.is_generated
                        ? 'bg-accent-500/10 text-accent-400 border-accent-500/20'
                        : 'bg-danger-500/10 text-danger-400 border-danger-500/20',
                    ].join(' ')}>
                      {current.is_generated ? 'Generated' : 'Failed'}
                    </span>
                  </div>

                  {/* Side-by-side images */}
                  <div className="flex gap-4">
                    <ImagePanel
                      url={current.original_url}
                      label="Original"
                      code={current.source_package_code}
                      status="original"
                    />

                    {/* Divider */}
                    <div className="flex-shrink-0 flex items-center">
                      <div className="w-px h-24 bg-surface-700 mx-1" />
                    </div>

                    <ImagePanel
                      url={current.variant_url}
                      label={`APR002 Variant`}
                      code={current.variant_code}
                      status={current.is_generated ? 'generated' : 'failed'}
                      error={current.error_message}
                    />
                  </div>

                  {/* URL references */}
                  {current.variant_url && (
                    <div className="pt-3 border-t border-surface-800 space-y-1.5">
                      <UrlRow label="Original" url={current.original_url} />
                      <UrlRow label="Variant"  url={current.variant_url}  />
                    </div>
                  )}
                </div>

                {/* All-pairs grid */}
                <div>
                  <h2 className="text-sm font-semibold text-surface-300 mb-3">
                    All pairs — {faceAsset?.preset_name ?? faceFilter} identity
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((p, i) => (
                      <button
                        key={p.variant_code}
                        onClick={() => setActiveIdx(i)}
                        className={[
                          'card p-3 text-left space-y-2 transition-all hover:border-surface-600',
                          i === activeIdx ? 'border-primary-500/40 bg-primary-500/5' : '',
                        ].join(' ')}>
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-mono text-surface-400">{p.source_package_code}</span>
                          <span className={[
                            'text-[10px] px-1.5 py-0.5 rounded border',
                            p.is_generated
                              ? 'text-accent-400 border-accent-500/20 bg-accent-500/8'
                              : 'text-danger-400 border-danger-500/20 bg-danger-500/8',
                          ].join(' ')}>
                            {p.is_generated ? 'OK' : 'ERR'}
                          </span>
                        </div>
                        <div className="flex gap-2">
                          {/* Original thumbnail */}
                          <div className="flex-1 rounded-lg overflow-hidden bg-surface-800 border border-surface-700" style={{ aspectRatio: '3/4' }}>
                            {p.original_url && (
                              <img src={p.original_url} alt={p.source_package_code} className="w-full h-full object-cover" loading="lazy" />
                            )}
                          </div>
                          {/* Variant thumbnail */}
                          <div className={[
                            'flex-1 rounded-lg overflow-hidden border',
                            p.is_generated ? 'bg-surface-800 border-accent-500/20' : 'bg-surface-800/50 border-danger-500/20',
                          ].join(' ')} style={{ aspectRatio: '3/4' }}>
                            {p.variant_url ? (
                              <img src={p.variant_url} alt={p.variant_code} className="w-full h-full object-cover" loading="lazy" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <AlertCircle className="w-5 h-5 text-danger-400/50" />
                              </div>
                            )}
                          </div>
                        </div>
                        <p className="text-[10px] font-mono text-surface-600 truncate">{p.variant_code}</p>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </>
        )}
        </>} {/* end variants tab */}
      </div>
    </div>
  );
}

function UrlRow({ label, url }: { label: string; url: string | null }) {
  if (!url) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-surface-600 w-12 flex-shrink-0">{label}</span>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="text-[10px] font-mono text-primary-500 hover:text-primary-400 transition-colors truncate flex-1"
      >
        {url}
      </a>
    </div>
  );
}
