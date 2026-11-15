import { createClient } from '@supabase/supabase-js';

// VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are baked in by Vite at dev-server
// start time. In Bolt's preview environment those env vars are not forwarded to
// the Vite process, so import.meta.env returns undefined. The project URL and
// anon key are public client-side credentials (safe to embed in browser code by
// design), so we fall back to the real values so the preview stays functional.
const supabaseUrl     = (import.meta.env.VITE_SUPABASE_URL      as string | undefined)
                     ?? 'https://osatedtxkkymvrodczlg.supabase.co';
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)
                     ?? 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9zYXRlZHR4a2t5bXZyb2RjemxnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwOTc4NjYsImV4cCI6MjA5NjY3Mzg2Nn0.LRBi91GS6Q7JyyiJU-GJUqpHafFBrBl89_p02oczV24';

export { supabaseUrl, supabaseAnonKey };

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export const isSupabaseConfigured = true;
