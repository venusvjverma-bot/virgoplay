/*
# Promotional page: community feedback, ideas, and voting backend

1. Purpose
- Backend for the redesigned promotional page's community sections.
- Visitors (no registration) can send feedback and vote on published ideas.
- Fully isolated from every existing table; nothing existing is modified.

2. New Tables
- `promo_feedback`
  - `id` (uuid, primary key)
  - `category` (text: new_idea | website_feedback | roleplay_suggestion | bug_report | general)
  - `message` (text, the visitor's feedback)
  - `email` (text, nullable, optional contact address — NEVER exposed to any client)
  - `status` (text: new | reviewed | archived, for admin triage)
  - `submitter_hash` (bytea, sha-256 of submitter IP for rate limiting — never raw IPs)
  - `created_at`
- `promo_ideas`
  - `id` (uuid, primary key)
  - `title` (text, short idea title shown in the voting list)
  - `details` (text, nullable, optional longer description)
  - `category` (same allowed values as promo_feedback)
  - `status` (text: pending | approved | rejected — only 'approved' rows are publicly listed)
  - `vote_count` (int, denormalized tally maintained by the voting RPC)
  - `created_at`
- `promo_idea_votes`
  - `idea_id` (uuid, FK to promo_ideas, ON DELETE CASCADE)
  - `voter_hash` (bytea, sha-256 of voter IP — abuse-resistant duplicate prevention)
  - `created_at`
  - primary key (idea_id, voter_hash): one vote per idea per visitor fingerprint

3. Security (RLS)
- RLS enabled on all three tables. All three are deny-by-default: NO direct
  SELECT, INSERT, UPDATE, or DELETE policy exists for anon/authenticated, so
  the Data API cannot read or write any row of these tables directly.
- All public interaction happens through two SECURITY DEFINER functions:
  - `promo_submit_feedback(p_category, p_message, p_email)` — validates
    category/message/email, enforces per-fingerprint rate limiting
    (3 submissions per rolling 24 hours), inserts the feedback row.
  - `promo_get_ideas()` — lists only approved ideas for public voting.
  - `promo_vote_idea(p_idea_id)` — atomically cast a vote: prevents
    duplicates per fingerprint, updates the tally, returns the new count.
- Fingerprints are sha-256 digests computed inside the functions from the
  client IP (via `crypto.hash`), so raw IPs are never stored and cannot be
  recovered from the tables.
- EXECUTE on all three functions is revoked from PUBLIC/anon-authenticated
  as direct callers and re-granted only to `service_role` (the promo edge
  function). This prevents bypassing the edge function's validation layer.

4. Important Notes
- Emails are stored only to let admins reply; there is no read path for any
  client role — not even via the edge function — so addresses never leave
  the server.
- Rate limiting state lives in `promo_feedback.submitter_hash` + `created_at`
  (database-side, no in-memory state).
- Vote duplicate-prevention lives in `promo_idea_votes`' composite primary
  key (database-side).
- No transaction control statements; safe to re-run.
*/

-- Extensions (idempotent; pgcrypto provides digest(), http is installed)
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA public;

CREATE TABLE IF NOT EXISTS promo_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category text NOT NULL CHECK (category = ANY (ARRAY[
    'new_idea', 'website_feedback', 'roleplay_suggestion', 'bug_report', 'general'
  ])),
  message text NOT NULL,
  email text,
  status text NOT NULL DEFAULT 'new' CHECK (status = ANY (ARRAY['new', 'reviewed', 'archived'])),
  submitter_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  details text,
  category text NOT NULL DEFAULT 'new_idea' CHECK (category = ANY (ARRAY[
    'new_idea', 'website_feedback', 'roleplay_suggestion', 'bug_report', 'general'
  ])),
  status text NOT NULL DEFAULT 'pending' CHECK (status = ANY (ARRAY['pending', 'approved', 'rejected'])),
  vote_count integer NOT NULL DEFAULT 0 CHECK (vote_count >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_idea_votes (
  idea_id uuid NOT NULL REFERENCES promo_ideas(id) ON DELETE CASCADE,
  voter_hash bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (idea_id, voter_hash)
);

CREATE INDEX IF NOT EXISTS promo_feedback_created_at_idx ON promo_feedback (created_at);
CREATE INDEX IF NOT EXISTS promo_feedback_submitter_hash_idx ON promo_feedback (submitter_hash, created_at);
CREATE INDEX IF NOT EXISTS promo_ideas_status_vote_idx ON promo_ideas (status, vote_count DESC);
CREATE INDEX IF NOT EXISTS promo_idea_votes_voter_hash_idx ON promo_idea_votes (voter_hash);

ALTER TABLE promo_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_idea_votes ENABLE ROW LEVEL SECURITY;

-- Deny-by-default: no policies at all. No anon/authenticated role can read
-- or write these tables through the Data API. Only service_role (edge
-- function) and the security definer functions reach the data.

-- ── Shared fingerprint helper (SECURITY DEFINER, called by the RPCs) ────
CREATE OR REPLACE FUNCTION promo_client_fingerprint() RETURNS bytea
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  SELECT digest(coalesce(current_setting('request.header.x-forwarded-for', true), ''), 'sha256');
$$;

-- ── Public feedback submission (server-validated, rate-limited) ─────────
CREATE OR REPLACE FUNCTION promo_submit_feedback(
  p_category text,
  p_message text,
  p_email text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_fingerprint bytea;
BEGIN
  -- Validate category
  IF p_category IS NULL OR NOT (p_category = ANY (ARRAY[
    'new_idea', 'website_feedback', 'roleplay_suggestion', 'bug_report', 'general'
  ])) THEN
    RAISE EXCEPTION 'Invalid category';
  END IF;

  -- Validate message
  IF p_message IS NULL THEN
    RAISE EXCEPTION 'Message is required';
  END IF;
  IF char_length(trim(p_message)) < 10 OR char_length(trim(p_message)) > 2000 THEN
    RAISE EXCEPTION 'Message must be between 10 and 2000 characters';
  END IF;

  -- Validate optional email
  IF p_email IS NOT NULL AND (
    char_length(trim(p_email)) = 0
    OR char_length(trim(p_email)) > 254
    OR trim(p_email) !~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'
  ) THEN
    RAISE EXCEPTION 'Invalid email address';
  END IF;

  v_fingerprint := promo_client_fingerprint();

  -- Spam guard 1: no more than 3 submissions per fingerprint per rolling 24h
  IF (
    SELECT count(*) FROM promo_feedback
    WHERE submitter_hash = v_fingerprint AND created_at > now() - interval '24 hours'
  ) >= 3 THEN
    RAISE EXCEPTION 'Too many submissions. Please try again later.';
  END IF;

  -- Spam guard 2: block obvious link-dump spam (more than 3 URLs)
  IF (SELECT count(*) FROM regexp_matches(p_message, 'https?://', 'g')) > 3 THEN
    RAISE EXCEPTION 'Message contains too many links';
  END IF;

  INSERT INTO promo_feedback (category, message, email, submitter_hash)
  VALUES (
    p_category,
    trim(p_message),
    CASE WHEN p_email IS NOT NULL AND char_length(trim(p_email)) > 0 THEN trim(p_email) ELSE NULL END,
    v_fingerprint
  );

  RETURN true;
END;
$$;

-- ── Public ideas list (approved only) ───────────────────────────────────
CREATE OR REPLACE FUNCTION promo_get_ideas() RETURNS TABLE (
  id uuid,
  title text,
  details text,
  category text,
  vote_count integer,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id, title, details, category, vote_count, created_at
  FROM promo_ideas
  WHERE status = 'approved'
  ORDER BY vote_count DESC, created_at DESC
  LIMIT 50;
$$;

-- ── Vote casting (duplicate-proof per fingerprint, atomic tally update) ─
CREATE OR REPLACE FUNCTION promo_vote_idea(p_idea_id uuid) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fingerprint bytea;
  v_new_count integer;
BEGIN
  -- Idea must exist and be approved
  IF NOT EXISTS (SELECT 1 FROM promo_ideas WHERE id = p_idea_id AND status = 'approved') THEN
    RAISE EXCEPTION 'Idea not found or not open for voting';
  END IF;

  v_fingerprint := promo_client_fingerprint();

  -- Duplicate-vote prevention: insert-or-ignore, then detect via FOUND
  INSERT INTO promo_idea_votes (idea_id, voter_hash)
  VALUES (p_idea_id, v_fingerprint)
  ON CONFLICT (idea_id, voter_hash) DO NOTHING;

  IF NOT FOUND THEN
    -- Already voted: report current count without counting again
    SELECT vote_count INTO v_new_count FROM promo_ideas WHERE id = p_idea_id;
    RETURN v_new_count;
  END IF;

  UPDATE promo_ideas
  SET vote_count = vote_count + 1
  WHERE id = p_idea_id
  RETURNING vote_count INTO v_new_count;

  RETURN v_new_count;
END;
$$;

-- Lock direct calls: only the edge function's service role may execute.
REVOKE EXECUTE ON FUNCTION promo_submit_feedback(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION promo_get_ideas() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION promo_vote_idea(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION promo_submit_feedback(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION promo_get_ideas() TO service_role;
GRANT EXECUTE ON FUNCTION promo_vote_idea(uuid) TO service_role;
