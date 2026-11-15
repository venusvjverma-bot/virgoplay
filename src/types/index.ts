export type VerificationStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type UserRole = 'creator' | 'admin';

export interface Client {
  id: string;
  email: string;
  email_verified: boolean;
  is_active: boolean;
  created_at: string;
  full_name?: string | null;
  phone?: string | null;
  country?: string | null;
  credit_balance: number;
}

export interface ClientSpendingRecord {
  id: string;
  client_id: string;
  credits: number;
  transaction_type: 'grant' | 'spend';
  description: string | null;
  created_at: string;
}

export interface Creator {
  id: string;
  email: string;
  username: string;
  country: string;
  role: UserRole;
  is_super_admin: boolean;
  is_content_master: boolean;
  verification_status: VerificationStatus;
  is_temporarily_deactivated: boolean;
  created_at: string;
  full_name?: string | null;
  dob?: string | null;
}

export interface VerificationDocument {
  id: string;
  creator_id: string;
  government_id_url: string | null;
  selfie_url: string | null;
  admin_notes: string | null;
  uploaded_at: string;
}

export interface AdminAuditLog {
  id: string;
  admin_id: string;
  creator_id: string | null;
  target_email: string | null;
  action: 'approved' | 'rejected' | 'admin_created' | 'admin_removed' | 'deactivated' | 'reactivated';
  reason: string | null;
  created_at: string;
}

export interface CreatorProfile {
  id: string;
  creator_id: string;
  display_name: string;
  bio: string;
  welcome_message: string;
  avatar_url: string | null;
  ai_personality: string;
  ai_system_prompt: string;
  categories: string[];
  personality_traits: string[];
  services_offered: string[];
  ai_companion_name: string;
  ai_companion_gender: string;
  ai_companion_age: number;
  ai_companion_personality_type: string;
  ai_companion_personality_intensity: number;
  ai_companion_emotional_style: string;
  ai_companion_flirting_style: number;
  ai_companion_personality_desc: string;
  ai_comm_conversation_pace: string;
  ai_comm_initiative_level: number;
  ai_comm_response_length: string;
  ai_comm_engagement_style: string;
  ai_comm_story_guidance: string;
  ai_comm_consistency: number;
  ai_rel_dynamic: string;
  ai_rel_attachment: string;
  ai_rel_affection_level:    number;
  ai_rel_affection_category: string;
  ai_rel_description: string;
  ai_bp_media_permissions: string;
  ai_bp_relationship_escalation: string;
  ai_bp_creator_instructions: string;
  front_face_photo_url: string;
  left_face_photo_url: string;
  right_face_photo_url: string;
  creator_consent: boolean;
  updated_at: string;
}

// ── Engine Types ──────────────────────────────────────────────────────────────

export interface DialogueChoice {
  id:    string;
  label: string;
}

export interface EngineState {
  mode:         'fetch';
  package_code: string;
  seq:          number;
  path:         string;
  next_seq:     number | null;
  next_path:    string;
  is_terminal:  boolean;
  transition_to: string | null;
}

// ── Test Companion ────────────────────────────────────────────────────────────

/**
 * Character Blueprint Snapshot — keyed by permanent engine identifiers.
 * See src/lib/engineCodes.ts for the full code registry.
 * Source of truth: companion_segment_registry table.
 */
export interface CompanionBlueprint {
  // AID — AI Identity
  AID001: string;    // Name
  AID002: string;    // Gender
  AID003: number;    // Age (18–60)
  // PS — Personality
  PS001:  string;    // Core Personality
  PS002:  number;    // Personality Intensity (1–5)
  PS003:  string;    // Emotional Style
  PS004:  number;    // Flirting Style (1–5)
  PS005:  string;    // Personality Description
  // COM — Communication
  COM001: string;    // Conversation Pace
  COM002: number;    // Initiative Level (1–5)
  COM003: string;    // Response Length
  COM004: string;    // Engagement Style
  COM005: string;    // Story Guidance Level
  COM006: number;    // Conversation Consistency (1–5)
  // RS — Relationship Style
  RS001:  string;    // Relationship Dynamic
  RS002:  string;    // Attachment Level
  RS003:  string;    // Affection Level — 'Low' | 'Medium' | 'High' → AF-001/002/003
  RS004:  string;    // Relationship Description
  // BP — Boundaries & Permissions
  BP001:  string;    // Media Permission
  BP002:  string;    // Escalation Level
  BP003?: string;    // Interaction Permission (reserved — future)
  BP004?: string;    // Content Permission (reserved — future)
  // Supplemental (pending code assignment)
  creator_instructions: string;  // ai_bp_creator_instructions
}

export interface TestSession {
  id: string;
  creator_id: string;
  blueprint: CompanionBlueprint;
  engine_state: EngineState | null;
  created_at: string;
}

export interface TestMessage {
  id: string;
  session_id: string;
  role: 'user' | 'companion';
  content: string;
  image_url?: string | null;
  message_type?: 'text' | 'image';
  trigger_seq?: number | null;
  choices: DialogueChoice[] | null;
  created_at: string;
}
