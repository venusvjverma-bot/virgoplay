/**
 * Universal Generation Engine V2 — Lifecycle Helpers (Deno/Edge Function)
 *
 * Shared utilities for managing generation status transitions, history logging,
 * and error handling. All edge functions that participate in the generation
 * lifecycle use these helpers to ensure consistent state management.
 *
 * Usage pattern:
 *   const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
 *   const gen = new GenerationLifecycle(admin, generationId);
 *   await gen.transition('generating', 'Provider call started');
 *   ...
 *   await gen.transition('completed', 'Output stored', { output_url });
 *   // or on failure:
 *   await gen.fail('provider_call', 'Provider returned 403', { status: 403 });
 */

import { createClient } from "jsr:@supabase/supabase-js@2";
import type {
  GenerationStatus,
  FailedAtStep,
  GenerationRow,
  GenerationHistoryRow,
} from "./generation-types.ts";

// ═══════════════════════════════════════════════════════════════════════════
// Lifecycle Manager
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Manages status transitions and history logging for a single generation.
 * Uses the service role key (bypasses RLS) since edge functions operate
 * with elevated privileges.
 */
export class GenerationLifecycle {
  private admin: ReturnType<typeof createClient>;
  private generationId: string;
  private currentStatus: GenerationStatus | null = null;

  constructor(admin: ReturnType<typeof createClient>, generationId: string) {
    this.admin = admin;
    this.generationId = generationId;
  }

  /**
   * Load the current generation state from the database.
   * Call this before using transition() to ensure the current status is known.
   */
  async load(): Promise<GenerationRow | null> {
    const { data, error } = await this.admin
      .from("generations")
      .select("*")
      .eq("id", this.generationId)
      .maybeSingle();

    if (error || !data) return null;
    this.currentStatus = (data as GenerationRow).status;
    return data as GenerationRow;
  }

  /**
   * Transition the generation to a new status and log a history entry.
   *
   * @param toStatus  Target status
   * @param description  Human-readable description of the transition
   * @param extraUpdates  Additional column updates to apply alongside the status change
   * @param eventMetadata  Metadata to store in the history entry
   */
  async transition(
    toStatus: GenerationStatus,
    description?: string,
    extraUpdates?: Record<string, unknown>,
    eventMetadata?: Record<string, unknown>,
  ): Promise<boolean> {
    const fromStatus = this.currentStatus;

    const updates: Record<string, unknown> = {
      status: toStatus,
      ...extraUpdates,
    };

    // Set timestamp fields based on the target status
    if (toStatus === "generating" && !extraUpdates?.started_at) {
      updates.started_at = new Date().toISOString();
    }
    if (toStatus === "completed" && !extraUpdates?.completed_at) {
      updates.completed_at = new Date().toISOString();
    }

    const { error: updateErr } = await this.admin
      .from("generations")
      .update(updates)
      .eq("id", this.generationId);

    if (updateErr) {
      console.error(`Failed to update generation ${this.generationId} to ${toStatus}:`, updateErr.message);
    }

    // Log the transition in history
    const { error: histErr } = await this.admin
      .from("generation_history")
      .insert({
        generation_id: this.generationId,
        from_status: fromStatus,
        to_status: toStatus,
        event_description: description ?? `Status: ${fromStatus ?? "null"} → ${toStatus}`,
        event_metadata: eventMetadata ?? {},
      });

    if (histErr) {
      console.error(`Failed to log history for generation ${this.generationId}:`, histErr.message);
    }

    this.currentStatus = toStatus;
    return !updateErr && !histErr;
  }

  /**
   * Mark the generation as failed at a specific lifecycle step.
   * Logs the error details and transitions to 'failed' status.
   *
   * @param step  Which lifecycle step failed
   * @param message  Human-readable error message
   * @param details  Full error context (provider response, stack trace, etc.)
   */
  async fail(
    step: FailedAtStep,
    message: string,
    details?: Record<string, unknown>,
  ): Promise<boolean> {
    return this.transition(
      "failed",
      `Failed at step: ${step} — ${message}`,
      {
        failed_at_step: step,
        error_message: message,
        error_details: details ?? null,
      },
      { step, message, details },
    );
  }

  /**
   * Mark the generation as completed with output storage information.
   */
  async complete(output: {
    bucket: string;
    path: string;
    publicUrl: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    return this.transition(
      "completed",
      "Generation completed successfully",
      {
        output_storage_bucket: output.bucket,
        output_storage_path: output.path,
        output_public_url: output.publicUrl,
        output_metadata: output.metadata ?? null,
        completed_at: new Date().toISOString(),
      },
      { bucket: output.bucket, path: output.path },
    );
  }

  /**
   * Save the provider's internal generation ID (for async providers).
   * Does not change the status — the generation remains in 'generating' or 'processing'.
   */
  async saveProviderGenerationId(providerGenId: string): Promise<void> {
    const { error } = await this.admin
      .from("generations")
      .update({ provider_generation_id: providerGenId })
      .eq("id", this.generationId);

    if (error) {
      console.error(`Failed to save provider_generation_id for ${this.generationId}:`, error.message);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Creation Helper
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a new generation record with status='queued' and an initial history entry.
 * Returns the generation ID.
 *
 * The snapshot is stored immutably — it is never updated after creation.
 */
export async function createGeneration(
  admin: ReturnType<typeof createClient>,
  params: {
    creator_id: string;
    asset_type: string;
    asset_subtype?: string;
    business_ref_type?: string;
    business_ref_id?: string;
    provider_id?: string;
    provider_name: string;
    provider_model?: string;
    snapshot: Record<string, unknown>;
    version?: number;
    parent_generation_id?: string;
  },
): Promise<string | null> {
  const { data, error } = await admin
    .from("generations")
    .insert({
      creator_id: params.creator_id,
      asset_type: params.asset_type,
      asset_subtype: params.asset_subtype ?? null,
      business_ref_type: params.business_ref_type ?? null,
      business_ref_id: params.business_ref_id ?? null,
      provider_id: params.provider_id ?? null,
      provider_name: params.provider_name,
      provider_model: params.provider_model ?? null,
      snapshot: params.snapshot,
      status: "queued",
      version: params.version ?? 1,
      parent_generation_id: params.parent_generation_id ?? null,
    })
    .select()
    .single();

  if (error || !data) {
    console.error("Failed to create generation record:", error?.message);
    return null;
  }

  const generationId = (data as GenerationRow).id;

  // Log the creation in history
  await admin.from("generation_history").insert({
    generation_id: generationId,
    from_status: null,
    to_status: "queued",
    event_description: "Generation record created",
    event_metadata: {
      asset_type: params.asset_type,
      asset_subtype: params.asset_subtype,
      provider_name: params.provider_name,
    },
  });

  return generationId;
}

// ═══════════════════════════════════════════════════════════════════════════
// Query Helpers
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Fetch the complete history timeline for a generation.
 * Returns entries ordered from oldest to newest.
 */
export async function getGenerationHistory(
  admin: ReturnType<typeof createClient>,
  generationId: string,
): Promise<GenerationHistoryRow[]> {
  const { data, error } = await admin
    .from("generation_history")
    .select("*")
    .eq("generation_id", generationId)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as GenerationHistoryRow[];
}

/**
 * Find all generations for a specific business entity.
 */
export async function getGenerationsForBusinessRef(
  admin: ReturnType<typeof createClient>,
  businessRefType: string,
  businessRefId: string,
): Promise<GenerationRow[]> {
  const { data, error } = await admin
    .from("generations")
    .select("*")
    .eq("business_ref_type", businessRefType)
    .eq("business_ref_id", businessRefId)
    .order("version", { ascending: false });

  if (error || !data) return [];
  return data as GenerationRow[];
}

/**
 * Find the latest version number for a business entity.
 * Used when regenerating to determine the next version number.
 */
export async function getLatestVersion(
  admin: ReturnType<typeof createClient>,
  businessRefType: string,
  businessRefId: string,
): Promise<number> {
  const { data } = await admin
    .from("generations")
    .select("version")
    .eq("business_ref_type", businessRefType)
    .eq("business_ref_id", businessRefId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (data as { version: number } | null)?.version ?? 0;
}

/**
 * Find all stale (active but not progressing) generations.
 * Used by a future cleanup worker to detect abandoned generations.
 */
export async function getStaleGenerations(
  admin: ReturnType<typeof createClient>,
  olderThanMinutes: number = 10,
): Promise<GenerationRow[]> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();

  const { data, error } = await admin
    .from("generations")
    .select("*")
    .in("status", ["queued", "uploading_assets", "generating", "processing", "downloading", "storing"])
    .lt("created_at", cutoff)
    .order("created_at", { ascending: true });

  if (error || !data) return [];
  return data as GenerationRow[];
}
