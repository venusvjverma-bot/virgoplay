/**
 * Character Generation Helper
 *
 * Bridges the Universal Prompt Schema to the frozen Generation Orchestrator
 * by creating a Blueprint Package with components whose metadata carries
 * the 16 prompt field values. The Orchestrator then runs its full pipeline
 * (Resolver → Snapshot Builder → Prompt Builder → Dispatcher) to produce
 * one canonical Master AI Identity image.
 *
 * This module does NOT bypass, duplicate, or modify any frozen foundation.
 * It creates Blueprint data in the database, then calls orchestrateGeneration.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { orchestrateGeneration } from './generation-orchestrator';
import type { OrchestratorResult } from './generation-orchestrator/types';
import type { UniversalPromptSchema, UniversalPromptFieldName } from '../types/character';

// ── Mapping: prompt fields → blueprint component types ──────────────────────
// Each prompt field maps to one of the 12 canonical component type codes.
// Fields that share a component type are merged into a single component's
// metadata, keyed by the prompt field name.

const FIELD_TO_COMPONENT_TYPE: Record<UniversalPromptFieldName, string> = {
  ethnicity: 'identity',
  age: 'identity',
  hair: 'identity',
  face: 'identity',
  skin_type: 'identity',
  body: 'body',
  breasts: 'body',
  clothing: 'dress',
  pose: 'pose',
  expression: 'expression',
  action: 'role',
  partner: 'role',
  camera_angle: 'camera',
  style: 'quality',
  lighting: 'lighting',
  atmosphere: 'environment',
  extra_details: 'accessory',
};

// Display order for components within the package
const COMPONENT_DISPLAY_ORDER: Record<string, number> = {
  identity: 1,
  body: 2,
  dress: 3,
  accessory: 4,
  role: 5,
  environment: 6,
  pose: 7,
  expression: 8,
  camera: 9,
  lighting: 10,
  quality: 11,
  negative_prompt: 12,
};

export interface CharacterGenerationResult {
  ok: boolean;
  generationId?: string;
  status?: string;
  error?: string;
}

/**
 * Create a Blueprint Package (with components) from a Universal Prompt Schema,
 * then call the Generation Orchestrator to produce one Master AI Identity image.
 *
 * Steps:
 * 1. Create a Blueprint Package (status: published) for this character.
 * 2. Create Blueprint Components, grouping prompt fields by component type.
 * 3. Attach components to the package via blueprint_package_components.
 * 4. Call orchestrateGeneration with the package ID.
 * 5. Return the generation result.
 */
export async function generateMasterAiIdentity(
  client: SupabaseClient,
  params: {
    creatorId: string;
    characterName: string;
    promptSchema: UniversalPromptSchema;
  },
): Promise<CharacterGenerationResult> {
  const { creatorId, characterName, promptSchema } = params;

  // ── Step 1: Create Blueprint Package ──────────────────────────────────────
  const packageCode = `CHAR-${Date.now()}`;
  const { data: pkg, error: pkgErr } = await client
    .from('blueprint_packages')
    .insert({
      creator_id: creatorId,
      name: `${characterName} — Identity`,
      code: packageCode,
      description: `Auto-generated package for Master AI Identity: ${characterName}`,
      metadata: { source: 'character_wizard', character_name: characterName },
      status: 'published',
      version: 1,
    })
    .select()
    .single();

  if (pkgErr || !pkg) {
    return { ok: false, error: `Failed to create blueprint package: ${pkgErr?.message ?? 'unknown'}` };
  }

  // ── Step 2: Group prompt fields by component type ────────────────────────
  const componentGroups = new Map<string, Record<string, string>>();

  for (const fieldName of Object.keys(promptSchema) as UniversalPromptFieldName[]) {
    const value = promptSchema[fieldName];
    if (!value || value.trim() === '') continue;

    const componentType = FIELD_TO_COMPONENT_TYPE[fieldName];
    if (!componentGroups.has(componentType)) {
      componentGroups.set(componentType, {});
    }
    componentGroups.get(componentType)![fieldName] = value.trim();
  }

  // ── Step 3: Create components and attach to package ───────────────────────
  // Fetch component type IDs
  const { data: componentTypes, error: ctErr } = await client
    .from('blueprint_component_types')
    .select('id, code');

  if (ctErr || !componentTypes) {
    return { ok: false, error: `Failed to fetch component types: ${ctErr?.message ?? 'unknown'}` };
  }

  const typeCodeToId = new Map<string, string>();
  for (const ct of componentTypes) {
    typeCodeToId.set(ct.code, ct.id);
  }

  let displayOrder = 0;
  for (const [typeCode, metadata] of componentGroups) {
    const typeId = typeCodeToId.get(typeCode);
    if (!typeId) continue;

    displayOrder++;
    const componentCode = `${packageCode}-${typeCode.toUpperCase()}`;

    // Create the component
    const { data: component, error: compErr } = await client
      .from('blueprint_components')
      .insert({
        creator_id: creatorId,
        component_type_id: typeId,
        name: `${characterName} — ${typeCode}`,
        code: componentCode,
        description: `Auto-generated ${typeCode} component for ${characterName}`,
        metadata: metadata,
        status: 'published',
        version: 1,
      })
      .select()
      .single();

    if (compErr || !component) {
      continue;
    }

    // Attach to package
    await client.from('blueprint_package_components').insert({
      package_id: pkg.id,
      component_id: component.id,
      component_type_id: typeId,
      display_order: COMPONENT_DISPLAY_ORDER[typeCode] ?? displayOrder,
      metadata: {},
    });
  }

  // ── Step 4: Call the Generation Orchestrator ─────────────────────────────
  const result: OrchestratorResult = await orchestrateGeneration(client, {
    packageId: pkg.id,
    asset_type: 'image',
    asset_subtype: 'character_identity',
    render_technique: 'text_to_image',
    business_ref_type: 'master_ai_characters',
  });

  if (result.ok) {
    return {
      ok: true,
      generationId: result.generationId,
      status: result.status,
    };
  } else {
    return {
      ok: false,
      error: result.error.message,
    };
  }
}

/**
 * Poll the generations table for a completed generation and return the output URL.
 * Returns null if the generation is still pending.
 */
export async function pollGenerationStatus(
  client: SupabaseClient,
  generationId: string,
): Promise<{ status: string; outputUrl: string | null } | null> {
  const { data, error } = await client
    .from('generations')
    .select('status, output_public_url')
    .eq('id', generationId)
    .single();

  if (error || !data) return null;
  return {
    status: data.status,
    outputUrl: data.output_public_url,
  };
}
