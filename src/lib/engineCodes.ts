/**
 * Permanent system identifiers for the AI Companion Engine.
 *
 * These codes are the authoritative references for:
 *   - Session Snapshots (CompanionBlueprint keys)
 *   - Package assignment (e.g. COM001 = Fast → CP-001)
 *   - Modifier assignment (e.g. RS002 = 3 → AL-003)
 *   - Decision Engine, Fetch Engine, and Smart Modifier reads
 *
 * Codes are permanent. They must never be changed or reused.
 * Source of truth: companion_segment_registry table.
 */

// ── AID: AI Identity ──────────────────────────────────────────────────────────

export const AID = {
  NAME:   'AID001',
  GENDER: 'AID002',
  AGE:    'AID003',
} as const;

// ── PS: Personality ───────────────────────────────────────────────────────────

export const PS = {
  CORE:        'PS001',
  INTENSITY:   'PS002',
  EMOTIONAL:   'PS003',
  FLIRTING:    'PS004',
  DESCRIPTION: 'PS005',
} as const;

// ── COM: Communication ────────────────────────────────────────────────────────

export const COM = {
  PACE:        'COM001',
  INITIATIVE:  'COM002',
  RESP_LENGTH: 'COM003',
  ENGAGEMENT:  'COM004',
  STORY:       'COM005',
  CONSISTENCY: 'COM006',
} as const;

// ── RS: Relationship Style ────────────────────────────────────────────────────

export const RS = {
  DYNAMIC:     'RS001',
  ATTACHMENT:  'RS002',
  AFFECTION:   'RS003',
  DESCRIPTION: 'RS004',
} as const;

// ── BP: Boundaries & Permissions ──────────────────────────────────────────────

export const BP = {
  MEDIA:       'BP001',
  ESCALATION:  'BP002',
  INTERACTION: 'BP003',  // reserved — future implementation
  CONTENT:     'BP004',  // reserved — future implementation
} as const;

// ── PV: Preview ───────────────────────────────────────────────────────────────

export const PV = {
  SUMMARY:    'PV001',
  COMPLETION: 'PV002',
  CONFIRM:    'PV003',
  TEST:       'PV004',
  PUBLISH:    'PV005',
} as const;

// ── Derived union types ───────────────────────────────────────────────────────

export type AIDCode  = typeof AID[keyof typeof AID];
export type PSCode   = typeof PS[keyof typeof PS];
export type COMCode  = typeof COM[keyof typeof COM];
export type RSCode   = typeof RS[keyof typeof RS];
export type BPCode   = typeof BP[keyof typeof BP];
export type PVCode   = typeof PV[keyof typeof PV];

export type SegmentCode = AIDCode | PSCode | COMCode | RSCode | BPCode | PVCode;

export type SegmentGroup = 'AID' | 'PS' | 'COM' | 'RS' | 'BP' | 'PV';

/** All segment group namespace objects, keyed by group name. */
export const SEGMENTS = { AID, PS, COM, RS, BP, PV } as const;

// ── Role synchronization ──────────────────────────────────────────────────────

/**
 * Maps ai_rel_dynamic text values to their corresponding role codes.
 * Used to synchronize the Portal's default active role tab across Uniform Library,
 * Image Library, and Message Library when the creator selects a relationship dynamic.
 *
 * Add new entries here when additional roles are introduced.
 */
export const RELATIONSHIP_DYNAMIC_TO_ROLE_CODE: Record<string, string> = {
  'Massage Therapist': 'MT-001',
};
