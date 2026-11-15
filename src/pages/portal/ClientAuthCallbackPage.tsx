import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { supabase, supabaseUrl } from '../../lib/supabase';
import { useClientAuth } from '../../context/ClientAuthContext';

const LOGO_URL = `${supabaseUrl}/storage/v1/object/public/login-assets/login-logo.png`;

export default function ClientAuthCallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { setClientId } = useClientAuth();
  const [error, setError] = useState('');

  const returnTo = searchParams.get('return_to');

  useEffect(() => {
    let cancelled = false;

    async function completeGoogleAuth() {
      try {
        // Supabase establishes the session from the OAuth redirect hash fragment
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError || !sessionData?.session) {
          if (!cancelled) {
            setError('Google authentication was not completed. Please try again.');
            setTimeout(() => navigate('/client-signup'), 2500);
          }
          return;
        }

        const accessToken = sessionData.session.access_token;

        // Call the edge function to verify the Google user and get/create the client record
        const response = await fetch(`${supabaseUrl}/functions/v1/client-google-auth`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        });

        const data = await response.json();
        if (!response.ok || data.error) {
          throw new Error(data.error ?? `Authentication failed (${response.status})`);
        }

        if (data.client_id) {
          await setClientId(data.client_id, data.session_token);
        }

        if (!cancelled) {
          // Sign out of the Supabase Auth session — the client session is tracked
          // via ClientAuthContext/localStorage, not via Supabase Auth. Leaving the
          // Google OAuth session around is unnecessary and could conflict with the
          // creator auth system.
          await supabase.auth.signOut();
          navigate(returnTo || '/client-welcome');
        }
      } catch (e) {
        if (!cancelled) {
          setError((e as Error).message);
          setTimeout(() => navigate('/client-signup'), 3000);
        }
      }
    }

    completeGoogleAuth();

    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="vp-header sticky top-0 z-30 border-b border-indigo-400/20">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center">
          <div className="vp-logo-wrap relative">
            <div className="vp-logo-glow" />
            <img
              src={LOGO_URL}
              alt="VirgoPlay"
              className="relative vp-logo-img h-10 w-auto object-contain"
            />
          </div>
        </div>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-5">
        <div className="w-full max-w-md text-center">
          {error ? (
            <div className="flex items-start gap-2.5 p-4 rounded-xl bg-rose-50 border border-rose-200/60 text-rose-600 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium">{error}</p>
                <p className="text-rose-400 mt-1">Redirecting back to sign up…</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 py-12">
              <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
              <p className="text-slate-500 text-sm">Completing your Google sign in…</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
