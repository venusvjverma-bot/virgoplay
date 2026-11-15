import { useState, useRef } from 'react';
import { Upload, CheckCircle, Clock, XCircle, AlertCircle, FileImage } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { VerificationDocument } from '../../types';

interface Props {
  doc: VerificationDocument | null;
  onUploaded: () => void;
}

export default function VerificationUpload({ doc, onUploaded }: Props) {
  const { creator } = useAuth();
  const [govFile, setGovFile]   = useState<File | null>(null);
  const [selfie, setSelfie]     = useState<File | null>(null);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');
  const [success, setSuccess]   = useState(false);
  const govRef    = useRef<HTMLInputElement>(null);
  const selfieRef = useRef<HTMLInputElement>(null);

  const status = creator?.verification_status ?? 'draft';

  async function uploadFile(file: File, prefix: string): Promise<string> {
    const ext  = file.name.split('.').pop();
    const path = `${creator!.id}/${prefix}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage
      .from('verification-docs').upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    return path;
  }

  const bothFilesReady = !!govFile && !!selfie;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!govFile || !selfie) { setError('Upload both Government ID and Verification Selfie before submitting for review.'); return; }
    setLoading(true); setError('');

    try {
      const [govUrl, selfieUrl] = await Promise.all([
        uploadFile(govFile, 'gov-id'),
        uploadFile(selfie, 'selfie'),
      ]);

      if (doc) {
        const { error: docErr } = await supabase.from('verification_documents')
          .update({ government_id_url: govUrl, selfie_url: selfieUrl, admin_notes: null })
          .eq('id', doc.id);
        if (docErr) throw new Error(docErr.message);

        const { error: creatorErr } = await supabase.from('creators')
          .update({ verification_status: 'pending' })
          .eq('id', creator!.id);
        if (creatorErr) throw new Error(creatorErr.message);
      } else {
        const { error: insErr } = await supabase.from('verification_documents').insert({
          creator_id: creator!.id,
          government_id_url: govUrl,
          selfie_url: selfieUrl,
        });
        if (insErr) throw new Error(insErr.message);

        const { error: statusErr } = await supabase.from('creators')
          .update({ verification_status: 'pending' })
          .eq('id', creator!.id);
        if (statusErr) throw new Error(statusErr.message);
      }

      setSuccess(true);
      onUploaded();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Title + badge */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h2 className="page-header">Identity Verification</h2>
          <p className="text-sm text-surface-400 mt-1">Upload your documents to verify your account.</p>
        </div>
        {status === 'draft'    && <span className="badge-pending  text-sm px-3 py-1.5 opacity-60"><Clock className="w-3.5 h-3.5" />Not Started</span>}
        {status === 'approved' && <span className="badge-approved text-sm px-3 py-1.5"><CheckCircle className="w-3.5 h-3.5" />Verified</span>}
        {status === 'pending'  && <span className="badge-pending  text-sm px-3 py-1.5"><Clock className="w-3.5 h-3.5" />Pending Review</span>}
        {status === 'rejected' && <span className="badge-rejected text-sm px-3 py-1.5"><XCircle className="w-3.5 h-3.5" />Rejected</span>}
      </div>

      {/* Status banners */}
      {status === 'approved' && (
        <div className="card border-accent-500/30 bg-accent-500/5 mb-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-accent-400 flex-shrink-0" />
            <p className="text-accent-400 font-medium">Your identity has been verified. Your portal is live!</p>
          </div>
        </div>
      )}

      {status === 'rejected' && (
        <div className="card border-danger-500/30 bg-danger-500/5 mb-6">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-danger-400 flex-shrink-0 mt-0.5" />
            <div>
              {doc?.admin_notes && (
                <>
                  <p className="text-danger-400 font-medium mb-1">Rejection reason:</p>
                  <p className="text-surface-300 text-sm mb-2">{doc.admin_notes}</p>
                </>
              )}
              <p className="text-surface-400 text-sm">Please re-upload corrected documents below.</p>
            </div>
          </div>
        </div>
      )}

      {status === 'pending' && !success && (
        <div className="card border-warning-500/30 bg-warning-500/5 mb-6">
          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-warning-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-warning-400 font-medium mb-1">Under Review</p>
              <p className="text-surface-300 text-sm">
                Your verification documents are currently under review. Uploads are temporarily
                disabled until a decision is made.
              </p>
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="card border-accent-500/30 bg-accent-500/5 mb-6">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-accent-400 flex-shrink-0" />
            <p className="text-accent-400 font-medium">Documents uploaded! Our team will review them shortly.</p>
          </div>
        </div>
      )}

      {/* Upload form — only shown for draft and rejected */}
      {(status === 'draft' || status === 'rejected') && (
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />{error}
            </div>
          )}

          <DropZone
            label="Government ID"
            hint="Passport, Driver's Licence, or National ID card"
            file={govFile}
            inputRef={govRef}
            onChange={setGovFile}
            hasExisting={!!doc?.government_id_url}
            disabled={false}
          />
          <div className="-mt-2 mb-1 space-y-1.5">
            <p className="text-xs text-surface-400 leading-relaxed">
              Upload a clear, valid government-issued ID (passport, national ID, or driver's licence).
              Make sure your name, photo, and other required details are clearly visible and readable.
            </p>
            <p className="text-xs text-surface-500 leading-relaxed">
              <span className="text-surface-300 font-medium">If uploading a passport:</span> Please upload the identification page showing your photo and full name.
            </p>
            <p className="text-xs text-surface-500 leading-relaxed">
              <span className="text-surface-300 font-medium">For other ID cards:</span> Please upload the front side of the card.
            </p>
          </div>
          <DropZone
            label="Verification Selfie"
            hint="Clear photo of yourself holding the ID document"
            file={selfie}
            inputRef={selfieRef}
            onChange={setSelfie}
            hasExisting={!!doc?.selfie_url}
            disabled={false}
          />
          <div className="-mt-2 mb-1 space-y-1.5">
            <p className="text-xs text-surface-400 leading-relaxed">
              Upload a clear, recent photo of yourself holding the same ID document.
              Your face and the ID must be clearly visible and readable.
            </p>
            <p className="text-xs text-surface-500 leading-relaxed">
              If you need to replace an image, tap the corresponding upload box again to upload a new file.
            </p>
          </div>

          {!bothFilesReady && (
            <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-warning-500/10 border border-warning-500/20 text-warning-400 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Upload both Government ID and Verification Selfie before submitting for review.
            </div>
          )}
          <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-surface-800/60 border border-surface-700/60 text-surface-300 text-xs leading-relaxed">
            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5 text-surface-400" />
            <span>
              <span className="font-medium text-surface-200">Before submitting:</span> Please make sure both images are clear, complete, and readable.
              Blurry, cropped, dark, covered, or otherwise unclear documents may result in your verification being rejected.
            </span>
          </div>
          <button type="submit" disabled={loading || !bothFilesReady}
            className={`btn-primary ${!bothFilesReady ? 'opacity-40 cursor-not-allowed' : ''}`}>
            {loading ? 'Uploading...' : doc ? 'Re-submit Documents' : 'Submit for Verification'}
          </button>
        </form>
      )}
    </div>
  );
}

function DropZone({
  label, hint, file, inputRef, onChange, hasExisting, disabled,
}: {
  label: string;
  hint: string;
  file: File | null;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (f: File) => void;
  hasExisting: boolean;
  disabled?: boolean;
}) {
  function handleActivate() {
    if (!disabled) inputRef.current?.click();
  }

  return (
    <div>
      <label className="label">{label}</label>
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        aria-disabled={disabled}
        onClick={handleActivate}
        onKeyDown={e => e.key === 'Enter' && handleActivate()}
        className={[
          'border-2 border-dashed rounded-xl p-6 transition-all duration-150 text-center',
          disabled
            ? 'border-surface-700/50 bg-surface-800/20 cursor-not-allowed opacity-50'
            : file
              ? 'border-primary-500/50 bg-primary-500/5 cursor-pointer'
              : 'border-surface-700 hover:border-primary-600/50 hover:bg-surface-800/50 cursor-pointer',
        ].join(' ')}
      >
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept="image/*,application/pdf"
          className="hidden"
          disabled={disabled}
          onChange={e => e.target.files?.[0] && onChange(e.target.files[0])}
        />
        <FileImage className={`w-8 h-8 mx-auto mb-3 ${file && !disabled ? 'text-primary-400' : 'text-surface-600'}`} />
        {file && !disabled ? (
          <p className="text-sm text-primary-400 font-medium truncate max-w-full px-2">{file.name}</p>
        ) : (
          <>
            <p className="text-sm font-medium text-surface-500 mb-1">
              <Upload className="w-3.5 h-3.5 inline mr-1" />
              {hasExisting ? 'Replace file' : 'Click to upload'}
            </p>
            <p className="text-xs text-surface-600">{hint}</p>
            <p className="text-xs text-surface-700 mt-1">PNG, JPG, PDF — max 10 MB</p>
          </>
        )}
      </div>
    </div>
  );
}
