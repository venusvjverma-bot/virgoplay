/*
# Lock direct table access on promo community tables

1. Purpose
- Defense-in-depth for `promo_feedback`, `promo_ideas`, `promo_idea_votes`.
- Supabase grants full table privileges to `anon` and `authenticated` by
  default. RLS (enabled, with zero policies) already blocks every direct
  read/write, but the stored feedback emails are sensitive, so the default
  grants are revoked entirely.
- All legitimate access flows through the `promo-feedback` edge function
  using `service_role`, which is unaffected by these revokes.

2. Security changes
- REVOKE all privileges on the three promo tables from `anon` and
  `authenticated`. No policy or grant changes for `service_role`.
*/

REVOKE ALL ON promo_feedback FROM anon, authenticated;
REVOKE ALL ON promo_ideas FROM anon, authenticated;
REVOKE ALL ON promo_idea_votes FROM anon, authenticated;
