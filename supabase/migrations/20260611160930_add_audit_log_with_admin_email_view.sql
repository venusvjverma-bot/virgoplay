CREATE OR REPLACE VIEW admin_audit_log_with_email
WITH (security_invoker = false)
AS
SELECT
  l.id,
  l.admin_id,
  u.email AS admin_email,
  l.creator_id,
  l.action,
  l.reason,
  l.created_at
FROM admin_audit_log l
JOIN auth.users u ON u.id = l.admin_id;

-- Only admins may query this view (mirrors the underlying table policy).
REVOKE ALL ON admin_audit_log_with_email FROM PUBLIC;
GRANT SELECT ON admin_audit_log_with_email TO authenticated;
