import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Zap, RefreshCw, WifiOff } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { VerificationDocument } from '../../types';
import VerificationUpload from './VerificationUpload';

export default function VerificationPage() {
  const { creator, creatorFetchFailed, refreshCreator } = useAuth();
  const [doc, setDoc]         = useState<VerificationDocument | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [retrying, setRetrying]     = useState(false);

  console.log('[VerificationPage] render — creator=', creator?.username ?? 'null', 'failed=', creatorFetchFailed);

  useEffect(() => {
    if (!creator?.id) return;
    setDocLoading(true);
    (async () => {
      const { data } = await supabase
        .from('verification_documents').select('*')
        .eq('creator_id', creator.id)
        .order('uploaded_at', { ascending: false })
        .limit(1).maybeSingle();
      setDoc(data as VerificationDocument ?? null);
      setDocLoading(false);
    })();
  }, [creator?.id]);

  async function handleRetry() {
    setRetrying(true);
    await refreshCreator();
    setRetrying(false);
  }

  // Still loading creator from context
  if (!creator && !creatorFetchFailed) {
    return (
      <div className="min-h-screen bg-surface-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Network error — couldn't load creator row
  if (!creator && creatorFetchFailed) {
    return (
      <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md text-center space-y-5">
          <div className="w-14 h-14 rounded-full bg-danger-500/10 border border-danger-500/20 flex items-center justify-center mx-auto">
            <WifiOff className="w-6 h-6 text-danger-400" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-surface-100 mb-2">Connection Error</h2>
            <p className="text-sm text-surface-400">
              Could not load your account data. This is usually a temporary network issue.
            </p>
          </div>
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="btn-primary inline-flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${retrying ? 'animate-spin' : ''}`} />
            {retrying ? 'Retrying…' : 'Retry'}
          </button>
          <p className="text-xs text-surface-500">
            <Link to="/login" className="text-primary-400 hover:text-primary-300 transition-colors">
              Sign out and try again
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-950">
      {/* Minimal header */}
      <header className="h-14 flex items-center justify-between px-6 border-b border-surface-800 bg-surface-900">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-primary-600 flex items-center justify-center">
            <Zap className="w-3 h-3 text-white" />
          </div>
          <span className="text-sm font-semibold text-surface-100">Creator Portal AI</span>
        </div>
        <Link to="/dashboard" className="text-sm text-surface-400 hover:text-surface-200 transition-colors">
          Go to Dashboard
        </Link>
      </header>

      <div className="max-w-2xl mx-auto px-6 py-10">
        {docLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <VerificationUpload
            doc={doc}
            onUploaded={async () => {
              const { data } = await supabase
                .from('verification_documents').select('*')
                .eq('creator_id', creator!.id)
                .order('uploaded_at', { ascending: false })
                .limit(1).maybeSingle();
              setDoc(data as VerificationDocument ?? null);
            }}
          />
        )}
      </div>
    </div>
  );
}
