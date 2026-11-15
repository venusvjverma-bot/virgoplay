/**
 * Generation Orchestrator — Core Service
 *
 * The sole conductor of the Mother Creator generation pipeline. It coordinates
 * the flow between frozen foundations:
 *
 *   Blueprint Resolver → Snapshot Builder → Prompt Builder → Dispatcher
 *
 * The Orchestrator never:
 * - Generates prompts (that is the Prompt Builder's job)
 * - Resolves blueprint logic (that is the Resolver's job)
 * - Creates snapshots (that is the Snapshot Builder's job)
 * - Calls providers or adapters (that is the Dispatcher/Worker's job)
 * - Duplicates business rules from any foundation
 *
 * It only calls each foundation in sequence, propagates errors with clear
 * stage attribution, and returns the generation ID + status.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { GenerationSnapshot, GenerationStatus } from '../../types/generation';
import { resolveBlueprintPackage } from '../blueprint-resolver';
import { buildBlueprintSnapshot } from '../snapshot-builder';
import { buildGenerationSnapshot } from '../prompt-builder';
import type {
  OrchestratorRequest,
  RegenerateRequest,
  OrchestratorResult,
  OrchestratorError,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════
// Dispatcher call — sends the final snapshot to the generation-dispatcher
// edge function. This is the only network call the Orchestrator makes
// besides the Supabase queries done by the Resolver.
// ═══════════════════════════════════════════════════════════════════════════

async function dispatchToWorker(
  client: SupabaseClient,
  snapshot: GenerationSnapshot,
  request: OrchestratorRequest,
): Promise<{ generationId: string; status: GenerationStatus } | OrchestratorError> {
  const { data: sessionData } = await client.auth.getSession();
  const jwt = sessionData?.session?.access_token ?? '';

  const supabaseUrl =
    (client as unknown as { supabaseUrl?: string }).supabaseUrl ??
    import.meta.env.VITE_SUPABASE_URL ??
    'https://osatedtxkkymvrodczlg.supabase.co';

  const body: Record<string, unknown> = {
    asset_type: request.asset_type,
    asset_subtype: request.asset_subtype,
    business_ref_type: request.business_ref_type,
    business_ref_id: request.business_ref_id,
    snapshot,
  };

  if (request.parentGenerationId) {
    body.context = { parent_generation_id: request.parentGenerationId };
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/functions/v1/generation-dispatcher`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body),
      },
    );

    const json = await res.json() as { generation_id?: string; status?: GenerationStatus; error?: string; detail?: string };

    if (!res.ok || json.error) {
      return {
        code: 'dispatch_failed',
        message: json.detail ?? json.error ?? `HTTP ${res.status}`,
        stage: 'dispatch',
      };
    }

    return {
      generationId: json.generation_id!,
      status: json.status ?? 'queued',
    };
  } catch (e) {
    return {
      code: 'dispatch_failed',
      message: e instanceof Error ? e.message : String(e),
      stage: 'dispatch',
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Full pipeline: resolve → snapshot → prompt → dispatch
// ═══════════════════════════════════════════════════════════════════════════

export async function orchestrateGeneration(
  client: SupabaseClient,
  request: OrchestratorRequest,
): Promise<OrchestratorResult> {
  // ── Stage 1: Blueprint Resolver ─────────────────────────────────────────
  const resolveResult = await resolveBlueprintPackage(client, {
    packageId: request.packageId,
  });

  if (!resolveResult.ok) {
    return {
      ok: false,
      error: {
        code: 'resolver_failed',
        message: resolveResult.error.message,
        stage: 'resolve',
      },
    };
  }

  // ── Stage 2: Snapshot Builder ──────────────────────────────────────────
  const snapshotResult = buildBlueprintSnapshot({
    resolvedPackage: resolveResult.resolved,
    asset_type: request.asset_type,
    asset_subtype: request.asset_subtype,
    render_technique: request.render_technique,
    business_ref_type: request.business_ref_type,
    business_ref_id: request.business_ref_id,
  });

  if (!snapshotResult.ok) {
    return {
      ok: false,
      error: {
        code: 'snapshot_build_failed',
        message: snapshotResult.error.message,
        stage: 'snapshot',
      },
    };
  }

  // ── Stage 3: Prompt Builder ─────────────────────────────────────────────
  const promptResult = buildGenerationSnapshot({
    snapshot: snapshotResult.snapshot,
    providerName: request.providerName,
    providerParameters: request.providerParameters,
    inputAssets: request.inputAssets,
  });

  if (!promptResult.ok) {
    return {
      ok: false,
      error: {
        code: 'prompt_build_failed',
        message: promptResult.error.message,
        stage: 'prompt',
      },
    };
  }

  // ── Stage 4: Dispatch to Worker ─────────────────────────────────────────
  const dispatchResult = await dispatchToWorker(client, promptResult.snapshot, request);

  if ('code' in dispatchResult) {
    return { ok: false, error: dispatchResult };
  }

  return {
    ok: true,
    generationId: dispatchResult.generationId,
    status: dispatchResult.status,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// Regeneration: re-dispatch an existing generation's frozen snapshot
// ═══════════════════════════════════════════════════════════════════════════

export async function orchestrateRegeneration(
  client: SupabaseClient,
  request: RegenerateRequest,
): Promise<OrchestratorResult> {
  // ── Load the existing generation's frozen snapshot ─────────────────────
  const { data: genRow, error: genError } = await client
    .from('generations')
    .select('id, snapshot, asset_type, asset_subtype, business_ref_type, business_ref_id')
    .eq('id', request.generationId)
    .maybeSingle();

  if (genError) {
    return {
      ok: false,
      error: {
        code: 'generation_not_found',
        message: genError.message,
        stage: 'dispatch',
      },
    };
  }

  if (!genRow) {
    return {
      ok: false,
      error: {
        code: 'generation_not_found',
        message: `Generation ${request.generationId} not found.`,
        stage: 'dispatch',
      },
    };
  }

  const existingSnapshot = (genRow as { snapshot?: GenerationSnapshot }).snapshot;
  if (!existingSnapshot) {
    return {
      ok: false,
      error: {
        code: 'snapshot_missing',
        message: 'The original generation has no snapshot to regenerate from.',
        stage: 'dispatch',
      },
    };
  }

  // ── Apply optional prompt override ──────────────────────────────────────
  const finalSnapshot: GenerationSnapshot = request.promptOverride
    ? { ...existingSnapshot, prompt: request.promptOverride }
    : existingSnapshot;

  // ── Dispatch to Worker ──────────────────────────────────────────────────
  const { data: sessionData } = await client.auth.getSession();
  const jwt = sessionData?.session?.access_token ?? '';

  const supabaseUrl =
    (client as unknown as { supabaseUrl?: string }).supabaseUrl ??
    import.meta.env.VITE_SUPABASE_URL ??
    'https://osatedtxkkymvrodczlg.supabase.co';

  const body: Record<string, unknown> = {
    asset_type: (genRow as { asset_type: string }).asset_type,
    asset_subtype: (genRow as { asset_subtype: string | null }).asset_subtype,
    business_ref_type: (genRow as { business_ref_type: string | null }).business_ref_type,
    business_ref_id: (genRow as { business_ref_id: string | null }).business_ref_id,
    snapshot: finalSnapshot,
  };

  if (request.parentGenerationId) {
    body.context = { parent_generation_id: request.parentGenerationId };
  }

  try {
    const res = await fetch(
      `${supabaseUrl}/functions/v1/generation-dispatcher`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(body),
      },
    );

    const json = await res.json() as { generation_id?: string; status?: GenerationStatus; error?: string; detail?: string };

    if (!res.ok || json.error) {
      return {
        ok: false,
        error: {
          code: 'dispatch_failed',
          message: json.detail ?? json.error ?? `HTTP ${res.status}`,
          stage: 'dispatch',
        },
      };
    }

    return {
      ok: true,
      generationId: json.generation_id!,
      status: json.status ?? 'queued',
    };
  } catch (e) {
    return {
      ok: false,
      error: {
        code: 'dispatch_failed',
        message: e instanceof Error ? e.message : String(e),
        stage: 'dispatch',
      },
    };
  }
}
