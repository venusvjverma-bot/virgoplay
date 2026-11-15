CREATE TABLE IF NOT EXISTS admin_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    uuid NOT NULL REFERENCES auth.users(id),
  creator_id  uuid NOT NULL REFERENCES public.creators(id) ON DELETE CASCADE,
  action      text NOT NULL CHECK (action IN ('approved', 'rejected')),
  reason      text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_admin_insert" ON admin_audit_log FOR INSERT TO authenticated
  WITH CHECK (public.is_admin() AND admin_id = auth.uid());

CREATE POLICY "audit_admin_select" ON admin_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

CREATE INDEX admin_audit_log_creator_idx ON admin_audit_log(creator_id);
CREATE INDEX admin_audit_log_created_idx ON admin_audit_log(created_at DESC);
