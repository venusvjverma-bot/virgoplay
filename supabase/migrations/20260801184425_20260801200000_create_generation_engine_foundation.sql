/*
# Generation Engine V2 — Foundation Tables

## Purpose

Creates the core `generations` and `generation_history` tables that serve as the
universal, permanent source of truth for every AI generation on the platform.

This is the foundation of the Generation-Centric Architecture: business tables
will eventually reference `generation_id` instead of owning media URLs directly.

## New Tables

### 1. `generations`
The single source of truth for every generation request, regardless of asset
type (image, video, audio, text) or provider (Fal.ai, Promptchan, ZenCreator,
RunPod, future providers).

Key columns:
- `id` — UUID primary key
- `creator_id` — UUID, references `creators(id)`, the user who initiated the generation
- `asset_type` — text: 'image' | 'video' | 'audio' | 'text' | 'face_swap'
- `asset_subtype` — text: 'character_identity' | 'role_image' | 'uniform' | 'appearance_preset' | 'body_type_preset' | 'storyboard_image' | 'dialogue' | etc.
- `business_ref_type` — text: identifies which business table this generation belongs to (e.g. 'role_image_library')
- `business_ref_id` — UUID: the PK of the business table row this generation produces
- `provider_id` — UUID, references `provider_configurations(id)`
- `provider_name` — text: 'Fal.ai' | 'Promptchan' | 'ZenCreator' | 'RunPod' | etc.
- `provider_model` — text: specific model/endpoint used (e.g. 'flux-pro', 'face-swap')
- `provider_generation_id` — text: ID returned by async providers for polling
- `snapshot` — jsonb NOT NULL: immutable complete request context (prompt, input assets, identity, dress, role, provider parameters, etc.)
- `status` — text: 'queued' | 'uploading_assets' | 'generating' | 'processing' | 'downloading' | 'storing' | 'completed' | 'failed'
- `failed_at_step` — text: which lifecycle step failed
- `error_message` — text: human-readable error
- `error_details` — jsonb: full provider error response, stack trace, etc.
- `output_storage_bucket` — text
- `output_storage_path` — text
- `output_public_url` — text: the final accessible URL for the generated asset
- `output_metadata` — jsonb: width, height, format, file_size, etc.
- `provider_cost_units` — text: 'credits' | 'gems' | 'dollars'
- `provider_cost_amount` — numeric
- `created_at` — timestamptz, default now()
- `started_at` — timestamptz: when the provider call began
- `completed_at` — timestamptz: when the output was stored
- `version` — integer, default 1
- `parent_generation_id` — UUID, references `generations(id)` for regeneration chains

### 2. `generation_history`
Tracks every status transition for debugging, auditing, and timeline reconstruction.

Key columns:
- `id` — UUID primary key
- `generation_id` — UUID, references `generations(id)` ON DELETE CASCADE
- `from_status` — text (nullable, null for the initial creation event)
- `to_status` — text NOT NULL
- `event_description` — text
- `event_metadata` — jsonb
- `created_at` — timestamptz, default now()

## Security

Both tables have RLS enabled with owner-scoped CRUD policies:
- SELECT: `auth.uid() = creator_id`
- INSERT: `auth.uid() = creator_id`
- UPDATE: `auth.uid() = creator_id`
- DELETE: `auth.uid() = creator_id`

Note: Edge functions use the service role key which bypasses RLS, so they can
write to these tables on behalf of any creator. The RLS policies protect direct
client access.

## Indexes

- `generations(creator_id)` — for listing a creator's generations
- `generations(business_ref_type, business_ref_id)` — for finding generations for a specific business entity
- `generations(parent_generation_id)` — for traversing regeneration chains
- `generations(status)` — for finding queued/failed generations (future cleanup worker)
- `generations(provider_name)` — for provider-specific analysis
- `generation_history(generation_id)` — for timeline queries

## Important Notes

1. This migration is purely additive — no existing tables are modified.
2. The `snapshot` jsonb column stores the complete immutable request context.
   It is never updated after the generation is created. This enables regeneration,
   auditing, debugging, and provider migration without schema changes.
3. The `parent_generation_id` self-reference enables version chains: when a
   generation is regenerated, a new record is created with the original as parent.
4. `generation_history` is INSERT-only from the client perspective — edge functions
   write to it using the service role key. RLS still applies for direct client reads.
5. The `business_ref_type` and `business_ref_id` columns create a loose link to
   business tables without a hard foreign key, because different business tables
   have different PK types (some UUID, some text). This is a polymorphic reference.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- generations table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS generations (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id               uuid        NOT NULL REFERENCES creators(id) ON DELETE CASCADE,

  -- Asset classification
  asset_type               text        NOT NULL,
  asset_subtype            text,
  business_ref_type        text,
  business_ref_id          uuid,

  -- Provider linkage
  provider_id              uuid        REFERENCES provider_configurations(id) ON DELETE SET NULL,
  provider_name            text        NOT NULL,
  provider_model           text,
  provider_generation_id   text,

  -- Immutable snapshot (never updated after creation)
  snapshot                 jsonb       NOT NULL DEFAULT '{}'::jsonb,

  -- Status lifecycle
  status                   text        NOT NULL DEFAULT 'queued',
  failed_at_step           text,
  error_message            text,
  error_details            jsonb,

  -- Output storage
  output_storage_bucket    text,
  output_storage_path       text,
  output_public_url         text,
  output_metadata          jsonb,

  -- Provider cost tracking
  provider_cost_units      text,
  provider_cost_amount     numeric(12,4),

  -- Timestamps
  created_at               timestamptz NOT NULL DEFAULT now(),
  started_at               timestamptz,
  completed_at             timestamptz,

  -- Versioning
  version                  integer     NOT NULL DEFAULT 1,
  parent_generation_id     uuid        REFERENCES generations(id) ON DELETE SET NULL
);

-- ═══════════════════════════════════════════════════════════════════════════
-- generation_history table
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS generation_history (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_id            uuid        NOT NULL REFERENCES generations(id) ON DELETE CASCADE,
  from_status              text,
  to_status                text        NOT NULL,
  event_description        text,
  event_metadata           jsonb       DEFAULT '{}'::jsonb,
  created_at               timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Indexes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE INDEX IF NOT EXISTS idx_generations_creator_id
  ON generations(creator_id);

CREATE INDEX IF NOT EXISTS idx_generations_business_ref
  ON generations(business_ref_type, business_ref_id);

CREATE INDEX IF NOT EXISTS idx_generations_parent_id
  ON generations(parent_generation_id)
  WHERE parent_generation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_generations_status
  ON generations(status)
  WHERE status IN ('queued', 'uploading_assets', 'generating', 'processing', 'downloading', 'storing');

CREATE INDEX IF NOT EXISTS idx_generations_provider_name
  ON generations(provider_name);

CREATE INDEX IF NOT EXISTS idx_generation_history_generation_id
  ON generation_history(generation_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE generation_history ENABLE ROW LEVEL SECURITY;

-- generations: owner-scoped CRUD
DROP POLICY IF EXISTS "select_own_generations" ON generations;
CREATE POLICY "select_own_generations"
  ON generations FOR SELECT
  TO authenticated
  USING (auth.uid() = creator_id);

DROP POLICY IF EXISTS "insert_own_generations" ON generations;
CREATE POLICY "insert_own_generations"
  ON generations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "update_own_generations" ON generations;
CREATE POLICY "update_own_generations"
  ON generations FOR UPDATE
  TO authenticated
  USING (auth.uid() = creator_id)
  WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "delete_own_generations" ON generations;
CREATE POLICY "delete_own_generations"
  ON generations FOR DELETE
  TO authenticated
  USING (auth.uid() = creator_id);

-- generation_history: owner-scoped SELECT + INSERT (no UPDATE/DELETE from client)
DROP POLICY IF EXISTS "select_own_generation_history" ON generation_history;
CREATE POLICY "select_own_generation_history"
  ON generation_history FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM generations
      WHERE generations.id = generation_history.generation_id
        AND generations.creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "insert_own_generation_history" ON generation_history;
CREATE POLICY "insert_own_generation_history"
  ON generation_history FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM generations
      WHERE generations.id = generation_history.generation_id
        AND generations.creator_id = auth.uid()
    )
  );
