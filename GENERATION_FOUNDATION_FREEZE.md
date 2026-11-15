# Generation Foundation — Frozen

## Status: FROZEN

The Universal Generation Foundation is complete and frozen as of 2026-08-01.
No further architectural changes are required before new providers or workers are added.

---

## Foundation Components

### 1. Database Tables (frozen)

**`generations`** — the single source of truth for every AI generation.

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | Primary key |
| `creator_id` | uuid FK→creators | Who initiated the generation |
| `asset_type` | text | 'image' \| 'video' \| 'audio' \| 'text' \| 'face_swap' |
| `asset_subtype` | text | 'character_identity' \| 'role_image' \| 'uniform' \| etc. |
| `business_ref_type` | text | Which business table owns this generation |
| `business_ref_id` | uuid | PK of the business table row |
| `provider_id` | uuid FK→provider_configurations | Provider configuration used |
| `provider_name` | text | 'Fal.ai' \| 'Promptchan' \| etc. |
| `provider_model` | text | Specific model (e.g. 'flux-pro') |
| `provider_generation_id` | text | Async provider's internal ID for polling |
| `snapshot` | jsonb NOT NULL | Immutable complete request context |
| `status` | text | Lifecycle status (queued→...→completed\|failed) |
| `failed_at_step` | text | Which lifecycle step failed |
| `error_message` | text | Human-readable error |
| `error_details` | jsonb | Full error context |
| `output_storage_bucket` | text | Supabase Storage bucket |
| `output_storage_path` | text | Path within bucket |
| `output_public_url` | text | Final accessible URL |
| `output_metadata` | jsonb | Width, height, format, etc. |
| `provider_cost_units` | text | 'credits' \| 'gems' \| 'dollars' |
| `provider_cost_amount` | numeric(12,4) | Cost amount |
| `created_at` | timestamptz | Creation timestamp |
| `started_at` | timestamptz | When provider call began |
| `completed_at` | timestamptz | When output was stored |
| `version` | integer | Version number for regeneration chains |
| `parent_generation_id` | uuid FK→generations | Parent generation for regenerations |

**`generation_history`** — tracks every status transition.

| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | Primary key |
| `generation_id` | uuid FK→generations | Which generation this event belongs to |
| `from_status` | text | Previous status (null for creation) |
| `to_status` | text | New status |
| `event_description` | text | Human-readable description |
| `event_metadata` | jsonb | Additional context |
| `created_at` | timestamptz | When the event occurred |

### 2. Indexes (frozen)

- `idx_generations_creator_id` — list a creator's generations
- `idx_generations_business_ref` — find generations for a business entity
- `idx_generations_parent_id` — traverse regeneration chains (partial: WHERE parent IS NOT NULL)
- `idx_generations_status` — find queued/active generations (partial: WHERE status IN active statuses)
- `idx_generations_provider_name` — provider-specific analysis
- `idx_generation_history_generation_id` — timeline queries

### 3. RLS Policies (frozen)

**generations** — 4 owner-scoped policies (SELECT, INSERT, UPDATE, DELETE), all `TO authenticated` with `auth.uid() = creator_id`.

**generation_history** — 2 owner-scoped policies (SELECT, INSERT), both check ownership via subquery on `generations` table. No UPDATE or DELETE from the client.

### 4. Shared Modules (frozen)

| File | Purpose | Provider-Specific? |
|---|---|---|
| `_shared/generation-types.ts` | All shared types, enums, interfaces | No — fully generic |
| `_shared/generation-lifecycle.ts` | Status transitions, history logging, query helpers | No — fully generic |
| `_shared/generation-provider.ts` | Provider config loading, auth headers, endpoint resolution | No — fully generic |
| `_shared/image-provider.ts` | Image adapter registry + Fal.ai and Promptchan adapters | Yes — adapters are provider-specific by design; registry is generic |
| `_shared/crypto.ts` | AES-256-GCM API key encryption/decryption | No — fully generic |
| `_shared/worker-contract.ts` | Stateless worker interface and registry | No — fully generic |

### 5. Shared Enums (frozen)

- `GenerationStatus`: queued → uploading_assets → generating → processing → downloading → storing → completed | failed
- `FailedAtStep`: validation | upload | provider_call | provider_timeout | provider_rejection | poll | poll_timeout | download | storage | db_update
- `AssetType`: image | video | audio | text | face_swap
- `AssetSubtype`: character_identity | role_image | storyboard_image | uniform | appearance_preset | body_type_preset | dialogue | scene | future
- `ProviderMode`: sync | async
- `ProviderServiceType`: image | text | video | audio
- `ProviderAuthMethod`: bearer | key | x-api-key | none

### 6. Shared Interfaces (frozen)

- `ImageProviderAdapter` — textToImage, imageToImage, faceSwap, redux, virtualTryOn
- `TextProviderAdapter` — generateText
- `ProviderResult` — completed/processing/failed with outputUrl/outputData/providerGenerationId
- `GenerationSnapshot` — immutable complete request context
- `GenerationRow` — database row type
- `GenerationHistoryRow` — history row type
- `GenerationRequest` / `GenerationRequestContext` — frontend request shape
- `GenerationResponse` — response shape
- `GenerationWorker` — stateless worker contract (assetType + execute)

---

## Provider Validation

The foundation supports the following providers without architectural changes:

| Provider | Service Type | Auth Method | Mode | Adapter Implemented? |
|---|---|---|---|---|
| Fal.ai | image | bearer (Authorization) | sync | Yes — FalAiAdapter |
| Promptchan | image | x-api-key | sync | Yes — PromptchanAdapter |
| ZenCreator | image/text | configurable | configurable | Not yet — add adapter to registry |
| RunPod | text | bearer | async | Not yet — add adapter to registry |
| Atlas | configurable | configurable | configurable | Not yet — add adapter to registry |
| Future providers | configurable | configurable | configurable | Add adapter to registry |

**Adding a new provider requires only:**
1. Implement the `ImageProviderAdapter` (or `TextProviderAdapter`) interface
2. Add an entry to `ADAPTER_REGISTRY` in `_shared/image-provider.ts`
3. Configure the provider in the `provider_configurations` table

The Generation Engine itself remains unchanged.

---

## Stateless Worker Contract

Every Generation Worker MUST implement the `GenerationWorker` interface from `_shared/worker-contract.ts`.

### Worker Flow

```
Generation Snapshot
      │
      ▼
Provider Adapter
      │
Execute Generation
      │
Update Generation Lifecycle
      │
Store Output
      │
Return Result
```

### Worker MUST NOT

- Resolve business rules
- Resolve APR / BT / Dress / Accessories / Role / Blueprint
- Build prompts
- Choose providers
- Store permanent business data
- Read unrelated business tables
- Modify snapshots

### Worker MUST

- Receive an immutable `WorkerInput` (generationId, snapshot, providerConfig)
- Use the provider adapter to execute the generation
- Use `GenerationLifecycle` to update status transitions
- Store output in Supabase Storage
- Return a `WorkerResult`

### Immutable Snapshot Rule

The Generation Snapshot is the only source of truth for execution.
After the snapshot is created it must never change.
Every regeneration creates a new Generation with a new immutable snapshot.
Workers must never modify snapshots.

---

## Refactoring Applied During Freeze

1. **`image-provider.ts`** — removed duplicated types and provider loading logic; now imports from `generation-types.ts` and `generation-provider.ts`. Replaced hardcoded `if (name.includes("promptchan"))` dispatch with `ADAPTER_REGISTRY` pattern. Unknown providers now throw an explicit error instead of defaulting to Fal.ai.

2. **`worker-contract.ts`** — new file defining the `GenerationWorker` interface, `WorkerInput`, `WorkerResult`, and `WORKER_REGISTRY`.

---

## What Is NOT Implemented (by design)

- Dispatcher
- Image Worker
- Video Worker
- Dialogue Worker
- Queue
- Frontend migration
- Business table migration
- Prompt migration
- Existing generation replacement

These will be implemented only after the foundation is approved.
