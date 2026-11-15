-- Create a dedicated public bucket for login page assets (logo, etc.)
-- This is independent from any creator's My AI / V-Card storage so that
-- resetting a creator account or deleting their My AI image does not
-- affect the login page logo.

INSERT INTO storage.buckets (id, name, public)
VALUES ('login-assets', 'login-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access to login-assets bucket
CREATE POLICY "public_read_login_assets"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'login-assets');
