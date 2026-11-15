/*
# Creator Portal AI — Full Schema

Creates all tables for the Creator Portal AI SaaS platform.

## Tables
1. creators — extends auth.users; stores username, country, role, verification_status
2. verification_documents — gov ID + selfie storage paths, admin notes
3. creator_profiles — display name, bio, welcome message, avatar, AI personality/prompt

## Security
- RLS enabled on every table
- Creators own their own rows
- Admins (role='admin') can read/update all creators and docs
- Public (anon) can read approved creators/profiles for the portal slug route

## Storage
- verification-docs bucket (private)
- avatars bucket (public)
*/

CREATE TABLE IF NOT EXISTS creators (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  username text UNIQUE NOT NULL,
  country text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'creator' CHECK (role IN ('creator','admin')),
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending','approved','rejected')),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE creators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sel_own"         ON creators;
DROP POLICY IF EXISTS "ins_own"         ON creators;
DROP POLICY IF EXISTS "upd_own"         ON creators;
DROP POLICY IF EXISTS "del_own"         ON creators;
DROP POLICY IF EXISTS "admin_sel_all"   ON creators;
DROP POLICY IF EXISTS "admin_upd_all"   ON creators;
DROP POLICY IF EXISTS "pub_approved"    ON creators;

CREATE POLICY "sel_own"       ON creators FOR SELECT    TO authenticated USING (auth.uid() = id);
CREATE POLICY "ins_own"       ON creators FOR INSERT    TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "upd_own"       ON creators FOR UPDATE    TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "del_own"       ON creators FOR DELETE    TO authenticated USING (auth.uid() = id);
CREATE POLICY "admin_sel_all" ON creators FOR SELECT    TO authenticated USING (EXISTS (SELECT 1 FROM creators c WHERE c.id = auth.uid() AND c.role = 'admin'));
CREATE POLICY "admin_upd_all" ON creators FOR UPDATE    TO authenticated
  USING (EXISTS (SELECT 1 FROM creators c WHERE c.id = auth.uid() AND c.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM creators c WHERE c.id = auth.uid() AND c.role = 'admin'));
CREATE POLICY "pub_approved"  ON creators FOR SELECT    TO anon, authenticated USING (verification_status = 'approved');

CREATE TABLE IF NOT EXISTS verification_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  government_id_url text,
  selfie_url text,
  admin_notes text,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE verification_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "vd_sel_own"   ON verification_documents;
DROP POLICY IF EXISTS "vd_ins_own"   ON verification_documents;
DROP POLICY IF EXISTS "vd_upd_own"   ON verification_documents;
DROP POLICY IF EXISTS "vd_del_own"   ON verification_documents;
DROP POLICY IF EXISTS "vd_admin_sel" ON verification_documents;
DROP POLICY IF EXISTS "vd_admin_upd" ON verification_documents;

CREATE POLICY "vd_sel_own"   ON verification_documents FOR SELECT TO authenticated USING (creator_id = auth.uid());
CREATE POLICY "vd_ins_own"   ON verification_documents FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
CREATE POLICY "vd_upd_own"   ON verification_documents FOR UPDATE TO authenticated USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());
CREATE POLICY "vd_del_own"   ON verification_documents FOR DELETE TO authenticated USING (creator_id = auth.uid());
CREATE POLICY "vd_admin_sel" ON verification_documents FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM creators c WHERE c.id = auth.uid() AND c.role = 'admin'));
CREATE POLICY "vd_admin_upd" ON verification_documents FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM creators c WHERE c.id = auth.uid() AND c.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM creators c WHERE c.id = auth.uid() AND c.role = 'admin'));

CREATE TABLE IF NOT EXISTS creator_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid UNIQUE NOT NULL REFERENCES creators(id) ON DELETE CASCADE,
  display_name text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  welcome_message text NOT NULL DEFAULT 'Hey! Ask me anything.',
  avatar_url text,
  ai_personality text NOT NULL DEFAULT '',
  ai_system_prompt text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE creator_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cp_sel_own"    ON creator_profiles;
DROP POLICY IF EXISTS "cp_ins_own"    ON creator_profiles;
DROP POLICY IF EXISTS "cp_upd_own"    ON creator_profiles;
DROP POLICY IF EXISTS "cp_del_own"    ON creator_profiles;
DROP POLICY IF EXISTS "cp_pub"        ON creator_profiles;
DROP POLICY IF EXISTS "cp_admin_sel"  ON creator_profiles;

CREATE POLICY "cp_sel_own"   ON creator_profiles FOR SELECT TO authenticated USING (creator_id = auth.uid());
CREATE POLICY "cp_ins_own"   ON creator_profiles FOR INSERT TO authenticated WITH CHECK (creator_id = auth.uid());
CREATE POLICY "cp_upd_own"   ON creator_profiles FOR UPDATE TO authenticated USING (creator_id = auth.uid()) WITH CHECK (creator_id = auth.uid());
CREATE POLICY "cp_del_own"   ON creator_profiles FOR DELETE TO authenticated USING (creator_id = auth.uid());
CREATE POLICY "cp_pub"       ON creator_profiles FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM creators c WHERE c.id = creator_profiles.creator_id AND c.verification_status = 'approved'));
CREATE POLICY "cp_admin_sel" ON creator_profiles FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM creators c WHERE c.id = auth.uid() AND c.role = 'admin'));

INSERT INTO storage.buckets (id, name, public) VALUES ('verification-docs','verification-docs',false) ON CONFLICT (id) DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('avatars','avatars',true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "vdocs_upload"   ON storage.objects;
DROP POLICY IF EXISTS "vdocs_read"     ON storage.objects;
DROP POLICY IF EXISTS "avatars_upload" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update" ON storage.objects;
DROP POLICY IF EXISTS "avatars_read"   ON storage.objects;

CREATE POLICY "vdocs_upload"   ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'verification-docs' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "vdocs_read"     ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'verification-docs' AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR EXISTS (SELECT 1 FROM creators c WHERE c.id = auth.uid() AND c.role = 'admin')
  ));
CREATE POLICY "avatars_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_read"   ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'avatars');

CREATE INDEX IF NOT EXISTS creators_username_idx ON creators(username);
CREATE INDEX IF NOT EXISTS creators_role_idx ON creators(role);
CREATE INDEX IF NOT EXISTS creators_vstatus_idx ON creators(verification_status);
