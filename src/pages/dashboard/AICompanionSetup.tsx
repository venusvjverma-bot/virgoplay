/**
 * AI Companion Builder
 *
 * Save / Continue contract (applies to every sub-segment):
 *   - Save button: enabled only when allFilled && isDirty
 *   - Continue button: enabled only when everSaved && !isDirty
 *   - Status: "● Unsaved Changes" when isDirty (post-first-save)
 *             "✓ Saved Successfully" when everSaved && !isDirty
 */
import { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, AlertCircle, CheckCircle, Circle, Info, X, Upload, FileImage, MessageCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import type { CreatorProfile, CompanionBlueprint } from '../../types';

// ─── Segment registry ─────────────────────────────────────────────────────────

type Segment =
  | 'identity'
  | 'personality'
  | 'communication'
  | 'relationship_style'
  | 'boundaries'
  | 'preview';

// ─── Identity constants ───────────────────────────────────────────────────────

const GENDERS = ['Female', 'Male'] as const;
const AGE_MIN = 18;
const AGE_MAX = 60;
const AGE_DEFAULT = 25;

// ─── Personality constants ────────────────────────────────────────────────────

const PERSONALITY_TYPES = [
  'Sweet', 'Caring', 'Playful', 'Confident', 'Dominant',
  'Mysterious', 'Romantic', 'Affectionate', 'Protective', 'Teasing',
] as const;

const EMOTIONAL_STYLES = ['Calm', 'Warm', 'Energetic', 'Passionate'] as const;

const INTENSITY_LABELS: Record<number, string> = {
  1: 'Very Light', 2: 'Light', 3: 'Balanced', 4: 'Strong', 5: 'Very Strong',
};

const FLIRTING_LABELS: Record<number, string> = {
  1: 'Very Subtle', 2: 'Light', 3: 'Moderate', 4: 'Strong', 5: 'Very Bold',
};

const DESC_MIN = 30;
const DESC_MAX = 500;

// ─── Communication constants ──────────────────────────────────────────────────

const CONV_PACE_OPTIONS    = ['Fast', 'Balanced', 'Slow']              as const;
const RESPONSE_LEN_OPTIONS = ['Short', 'Balanced', 'Detailed']         as const;
const ENGAGEMENT_OPTIONS   = ['Listener', 'Balanced', 'Leader']        as const;
const STORY_GUIDANCE_OPTIONS = ['Minimal', 'Balanced', 'Strong']       as const;

const INITIATIVE_LABELS: Record<number, string> = {
  1: 'Waits for user',
  2: 'Low initiative',
  3: 'Balanced',
  4: 'High initiative',
  5: 'Frequently initiates',
};

const CONSISTENCY_LABELS: Record<number, string> = {
  1: 'Highly Dynamic',
  2: 'Flexible',
  3: 'Balanced',
  4: 'Consistent',
  5: 'Strictly follows framework',
};

// ─── Boundaries & Permissions constants ──────────────────────────────────────

const MEDIA_PERMISSIONS_OPTIONS    = ['Disabled', 'Limited', 'Enabled']  as const;
const REL_ESCALATION_OPTIONS       = ['Slow', 'Balanced', 'Fast']        as const;
const BP_INSTRUCTIONS_MIN = 30;
const BP_INSTRUCTIONS_MAX = 1000;

// ─── Relationship Style constants ─────────────────────────────────────────────

const REL_DYNAMIC_OPTIONS    = ['Romantic Partner', 'Date Friend', 'Personal Escort', 'Massage Therapist', 'Role Player'] as const;
const ATTACHMENT_OPTIONS     = ['Balanced', 'Attached', 'Deeply Attached'] as const;
const AFFECTION_OPTIONS = ['Low', 'Medium', 'High'] as const;
const REL_DESC_MIN = 30;
const REL_DESC_MAX = 500;

// ─── Shared save-state hook ───────────────────────────────────────────────────

function useSegmentSave(initialEverSaved: boolean) {
  const [everSaved, setEverSaved] = useState(initialEverSaved);
  function markSaved() { setEverSaved(true); }
  return { everSaved, markSaved };
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  profile: CreatorProfile | null;
  onSaved: () => void;
}

export default function AICompanionSetup({ profile, onSaved }: Props) {
  const { creator } = useAuth();
  const navigate    = useNavigate();

  const identityComplete          = !!(profile?.ai_companion_name && profile?.ai_companion_gender);
  const personalityComplete       = !!(profile?.ai_companion_personality_type && profile?.ai_companion_emotional_style);
  const communicationComplete     = !!(profile?.ai_comm_conversation_pace && profile?.ai_comm_response_length);
  const relationshipStyleComplete = !!(profile?.ai_rel_dynamic && profile?.ai_rel_attachment);
  const boundariesComplete        = !!(profile?.ai_bp_media_permissions && profile?.ai_bp_relationship_escalation);
  const previewComplete           = !!(profile?.front_face_photo_url && profile?.left_face_photo_url && profile?.right_face_photo_url && profile?.creator_consent);

  const [segment, setSegment] = useState<Segment>(() => {
    if (!identityComplete)          return 'identity';
    if (!relationshipStyleComplete) return 'relationship_style';
    if (!personalityComplete)       return 'personality';
    if (!communicationComplete)     return 'communication';
    if (!boundariesComplete)        return 'boundaries';
    if (!previewComplete)           return 'preview';
    return 'preview';
  });

  // ── Identity field state ──────────────────────────────────────────────────

  const [idName,   setIdName]   = useState(profile?.ai_companion_name   ?? '');
  const [idGender, setIdGender] = useState(profile?.ai_companion_gender ?? '');
  const [idAge,    setIdAge]    = useState(profile?.ai_companion_age    ?? AGE_DEFAULT);

  const [idSavedName,   setIdSavedName]   = useState(profile?.ai_companion_name   ?? '');
  const [idSavedGender, setIdSavedGender] = useState(profile?.ai_companion_gender ?? '');
  const [idSavedAge,    setIdSavedAge]    = useState(profile?.ai_companion_age    ?? AGE_DEFAULT);

  const { everSaved: idEverSaved, markSaved: idMarkSaved } = useSegmentSave(identityComplete);
  const [idLoading, setIdLoading] = useState(false);
  const [idError,   setIdError]   = useState('');

  const idAllFilled = idName.trim().length > 0 && idGender !== '';
  const idIsDirty = useMemo(
    () => idName !== idSavedName || idGender !== idSavedGender || idAge !== idSavedAge,
    [idName, idGender, idAge, idSavedName, idSavedGender, idSavedAge],
  );
  const idCanSave     = idAllFilled && idIsDirty;
  const idCanContinue = idEverSaved && !idIsDirty;

  async function handleIdentitySave(e: React.FormEvent) {
    e.preventDefault();
    if (!idCanSave) return;
    setIdLoading(true); setIdError('');
    try {
      const payload = {
        ai_companion_name:   idName.trim(),
        ai_companion_gender: idGender,
        ai_companion_age:    idAge,
        updated_at:          new Date().toISOString(),
      };
      const { error } = profile
        ? await supabase.from('creator_profiles').update(payload).eq('id', profile.id)
        : await supabase.from('creator_profiles').insert({ ...payload, creator_id: creator!.id });
      if (error) throw new Error(error.message);
      setIdSavedName(idName.trim());
      setIdSavedGender(idGender);
      setIdSavedAge(idAge);
      idMarkSaved();
      onSaved();
    } catch (err: unknown) {
      setIdError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setIdLoading(false);
    }
  }

  // ── Personality field state ───────────────────────────────────────────────

  const [pType,  setPType]  = useState(profile?.ai_companion_personality_type      ?? '');
  const [pInt,   setPInt]   = useState(profile?.ai_companion_personality_intensity  ?? 3);
  const [pEmot,  setPEmot]  = useState(profile?.ai_companion_emotional_style        ?? '');
  const [pFlirt, setPFlirt] = useState(profile?.ai_companion_flirting_style         ?? 3);
  const [pDesc,  setPDesc]  = useState(profile?.ai_companion_personality_desc       ?? '');

  const [pSavedType,  setPSavedType]  = useState(profile?.ai_companion_personality_type      ?? '');
  const [pSavedInt,   setPSavedInt]   = useState(profile?.ai_companion_personality_intensity  ?? 3);
  const [pSavedEmot,  setPSavedEmot]  = useState(profile?.ai_companion_emotional_style        ?? '');
  const [pSavedFlirt, setPSavedFlirt] = useState(profile?.ai_companion_flirting_style         ?? 3);
  const [pSavedDesc,  setPSavedDesc]  = useState(profile?.ai_companion_personality_desc       ?? '');

  const { everSaved: pEverSaved, markSaved: pMarkSaved } = useSegmentSave(personalityComplete);
  const [pLoading, setPLoading] = useState(false);
  const [pError,   setPError]   = useState('');

  const pDescValid  = pDesc.trim().length >= DESC_MIN && pDesc.trim().length <= DESC_MAX;
  const pAllFilled  = pType !== '' && pEmot !== '' && pDescValid;
  const pIsDirty = useMemo(
    () =>
      pType  !== pSavedType  ||
      pInt   !== pSavedInt   ||
      pEmot  !== pSavedEmot  ||
      pFlirt !== pSavedFlirt ||
      pDesc  !== pSavedDesc,
    [pType, pInt, pEmot, pFlirt, pDesc, pSavedType, pSavedInt, pSavedEmot, pSavedFlirt, pSavedDesc],
  );
  const [pInvalidated, setPInvalidated] = useState(false);
  const pNeedsSave   = pIsDirty || pInvalidated;
  const pCanSave     = pAllFilled && pNeedsSave;
  const pCanContinue = pEverSaved && !pNeedsSave;

  async function handlePersonalitySave(e: React.FormEvent) {
    e.preventDefault();
    if (!pCanSave) return;
    setPLoading(true); setPError('');
    try {
      const payload = {
        ai_companion_personality_type:      pType,
        ai_companion_personality_intensity: pInt,
        ai_companion_emotional_style:       pEmot,
        ai_companion_flirting_style:        pFlirt,
        ai_companion_personality_desc:      pDesc.trim(),
        updated_at:                         new Date().toISOString(),
      };
      const { error } = profile
        ? await supabase.from('creator_profiles').update(payload).eq('id', profile.id)
        : await supabase.from('creator_profiles').insert({ ...payload, creator_id: creator!.id });
      if (error) throw new Error(error.message);
      setPSavedType(pType);
      setPSavedInt(pInt);
      setPSavedEmot(pEmot);
      setPSavedFlirt(pFlirt);
      setPSavedDesc(pDesc.trim());
      setPInvalidated(false);
      pMarkSaved();
      onSaved();
    } catch (err: unknown) {
      setPError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setPLoading(false);
    }
  }

  // ── Communication field state ─────────────────────────────────────────────

  const [cPace,    setCPace]    = useState(profile?.ai_comm_conversation_pace ?? '');
  const [cInit,    setCInit]    = useState(profile?.ai_comm_initiative_level  ?? 3);
  const [cRespLen, setCRespLen] = useState(profile?.ai_comm_response_length   ?? '');
  const [cEngag,   setCEngag]   = useState(profile?.ai_comm_engagement_style  ?? '');
  const [cStory,   setCStory]   = useState(profile?.ai_comm_story_guidance    ?? '');
  const [cConsis,  setCConsis]  = useState(profile?.ai_comm_consistency       ?? 3);

  const [cSavedPace,    setCCSavedPace]    = useState(profile?.ai_comm_conversation_pace ?? '');
  const [cSavedInit,    setCCSavedInit]    = useState(profile?.ai_comm_initiative_level  ?? 3);
  const [cSavedRespLen, setCCSavedRespLen] = useState(profile?.ai_comm_response_length   ?? '');
  const [cSavedEngag,   setCCSavedEngag]   = useState(profile?.ai_comm_engagement_style  ?? '');
  const [cSavedStory,   setCCSavedStory]   = useState(profile?.ai_comm_story_guidance    ?? '');
  const [cSavedConsis,  setCCSavedConsis]  = useState(profile?.ai_comm_consistency       ?? 3);

  const { everSaved: cEverSaved, markSaved: cMarkSaved } = useSegmentSave(communicationComplete);
  const [cLoading, setCLoading] = useState(false);
  const [cError,   setCError]   = useState('');

  const cAllFilled = cPace !== '' && cRespLen !== '' && cEngag !== '' && cStory !== '';
  const cIsDirty = useMemo(
    () =>
      cPace    !== cSavedPace    ||
      cInit    !== cSavedInit    ||
      cRespLen !== cSavedRespLen ||
      cEngag   !== cSavedEngag   ||
      cStory   !== cSavedStory   ||
      cConsis  !== cSavedConsis,
    [cPace, cInit, cRespLen, cEngag, cStory, cConsis,
     cSavedPace, cSavedInit, cSavedRespLen, cSavedEngag, cSavedStory, cSavedConsis],
  );
  const [cInvalidated, setCInvalidated] = useState(false);
  const cNeedsSave   = cIsDirty || cInvalidated;
  const cCanSave     = cAllFilled && cNeedsSave;
  const cCanContinue = cEverSaved && !cNeedsSave;

  async function handleCommunicationSave(e: React.FormEvent) {
    e.preventDefault();
    if (!cCanSave) return;
    setCLoading(true); setCError('');
    try {
      const payload = {
        ai_comm_conversation_pace: cPace,
        ai_comm_initiative_level:  cInit,
        ai_comm_response_length:   cRespLen,
        ai_comm_engagement_style:  cEngag,
        ai_comm_story_guidance:    cStory,
        ai_comm_consistency:       cConsis,
        updated_at:                new Date().toISOString(),
      };
      const { error } = profile
        ? await supabase.from('creator_profiles').update(payload).eq('id', profile.id)
        : await supabase.from('creator_profiles').insert({ ...payload, creator_id: creator!.id });
      if (error) throw new Error(error.message);
      setCCSavedPace(cPace);
      setCCSavedInit(cInit);
      setCCSavedRespLen(cRespLen);
      setCCSavedEngag(cEngag);
      setCCSavedStory(cStory);
      setCCSavedConsis(cConsis);
      setCInvalidated(false);
      cMarkSaved();
      onSaved();
    } catch (err: unknown) {
      setCError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setCLoading(false);
    }
  }

  // ── Relationship Style field state ───────────────────────────────────────

  const [rDynamic,  setRDynamic]  = useState(profile?.ai_rel_dynamic          ?? '');
  const [rAttach,   setRAttach]   = useState(profile?.ai_rel_attachment        ?? '');
  const [rAffect,   setRAffect]   = useState(profile?.ai_rel_affection_category ?? 'Medium');
  const [rDesc,     setRDesc]     = useState(profile?.ai_rel_description       ?? '');

  const [rSavedDynamic, setRSavedDynamic] = useState(profile?.ai_rel_dynamic              ?? '');
  const [rSavedAttach,  setRSavedAttach]  = useState(profile?.ai_rel_attachment            ?? '');
  const [rSavedAffect,  setRSavedAffect]  = useState(profile?.ai_rel_affection_category    ?? 'Medium');
  const [rSavedDesc,    setRSavedDesc]    = useState(profile?.ai_rel_description           ?? '');

  const { everSaved: rEverSaved, markSaved: rMarkSaved } = useSegmentSave(relationshipStyleComplete);
  const [rLoading, setRLoading] = useState(false);
  const [rError,   setRError]   = useState('');

  const rDescValid  = rDesc.trim().length >= REL_DESC_MIN && rDesc.trim().length <= REL_DESC_MAX;
  const rAllFilled  = rDynamic !== '' && rAttach !== '' && rDescValid;
  const rIsDirty = useMemo(
    () =>
      rDynamic !== rSavedDynamic ||
      rAttach  !== rSavedAttach  ||
      rAffect  !== rSavedAffect  ||
      rDesc    !== rSavedDesc,
    [rDynamic, rAttach, rAffect, rDesc, rSavedDynamic, rSavedAttach, rSavedAffect, rSavedDesc],
  );
  const [rInvalidated, setRInvalidated] = useState(false);
  const rNeedsSave   = rIsDirty || rInvalidated;
  const rCanSave     = rAllFilled && rNeedsSave;
  const rCanContinue = rEverSaved && !rNeedsSave;

  async function handleRelationshipStyleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!rCanSave) return;
    setRLoading(true); setRError('');
    try {
      const payload = {
        ai_rel_dynamic:         rDynamic,
        ai_rel_attachment:          rAttach,
        ai_rel_affection_category:  rAffect,
        ai_rel_description:     rDesc.trim(),
        updated_at:             new Date().toISOString(),
      };
      const { error } = profile
        ? await supabase.from('creator_profiles').update(payload).eq('id', profile.id)
        : await supabase.from('creator_profiles').insert({ ...payload, creator_id: creator!.id });
      if (error) throw new Error(error.message);
      const trimmedDesc = rDesc.trim();
      setRDesc(trimmedDesc);
      setRSavedDynamic(rDynamic);
      setRSavedAttach(rAttach);
      setRSavedAffect(rAffect);
      setRSavedDesc(trimmedDesc);
      setRInvalidated(false);
      rMarkSaved();
      onSaved();
    } catch (err: unknown) {
      setRError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setRLoading(false);
    }
  }

  // ── Boundaries & Permissions field state ─────────────────────────────────

  const [bMedia,  setBMedia]  = useState(profile?.ai_bp_media_permissions       ?? '');
  const [bEscal,  setBEscal]  = useState(profile?.ai_bp_relationship_escalation ?? '');
  const [bInstr,  setBInstr]  = useState(profile?.ai_bp_creator_instructions    ?? '');

  const [bSavedMedia, setBSavedMedia] = useState(profile?.ai_bp_media_permissions       ?? '');
  const [bSavedEscal, setBSavedEscal] = useState(profile?.ai_bp_relationship_escalation ?? '');
  const [bSavedInstr, setBSavedInstr] = useState(profile?.ai_bp_creator_instructions    ?? '');

  const { everSaved: bEverSaved, markSaved: bMarkSaved } = useSegmentSave(boundariesComplete);
  const [bLoading, setBLoading] = useState(false);
  const [bError,   setBError]   = useState('');

  const bInstrValid = bInstr.trim().length >= BP_INSTRUCTIONS_MIN && bInstr.trim().length <= BP_INSTRUCTIONS_MAX;
  const bAllFilled  = bMedia !== '' && bEscal !== '' && bInstrValid;
  const bIsDirty = useMemo(
    () =>
      bMedia !== bSavedMedia ||
      bEscal !== bSavedEscal ||
      bInstr !== bSavedInstr,
    [bMedia, bEscal, bInstr, bSavedMedia, bSavedEscal, bSavedInstr],
  );

  const [bInvalidated, setBInvalidated] = useState(false);
  const bNeedsSave   = bIsDirty || bInvalidated;
  const bCanSave     = bAllFilled && bNeedsSave;
  const bCanContinue = bEverSaved && !bNeedsSave;

  async function handleBoundariesSave(e: React.FormEvent) {
    e.preventDefault();
    if (!bCanSave) return;
    setBLoading(true); setBError('');
    try {
      const trimmedInstr = bInstr.trim();
      const payload = {
        ai_bp_media_permissions:       bMedia,
        ai_bp_relationship_escalation: bEscal,
        ai_bp_creator_instructions:    trimmedInstr,
        updated_at:                    new Date().toISOString(),
      };
      const { error } = profile
        ? await supabase.from('creator_profiles').update(payload).eq('id', profile.id)
        : await supabase.from('creator_profiles').insert({ ...payload, creator_id: creator!.id });
      if (error) throw new Error(error.message);
      setBInstr(trimmedInstr);
      setBSavedMedia(bMedia);
      setBSavedEscal(bEscal);
      setBSavedInstr(trimmedInstr);
      setBInvalidated(false);
      bMarkSaved();
      onSaved();
    } catch (err: unknown) {
      setBError(err instanceof Error ? err.message : 'Save failed.');
    } finally {
      setBLoading(false);
    }
  }

  // ── Preview field state ───────────────────────────────────────────────────

  const [pvFrontFile, setPvFrontFile] = useState<File | null>(null);
  const [pvLeftFile,  setPvLeftFile]  = useState<File | null>(null);
  const [pvRightFile, setPvRightFile] = useState<File | null>(null);
  const [pvConsent,   setPvConsent]   = useState(profile?.creator_consent ?? false);

  const [pvSavedFrontUrl, setPvSavedFrontUrl] = useState(profile?.front_face_photo_url ?? '');
  const [pvSavedLeftUrl,  setPvSavedLeftUrl]  = useState(profile?.left_face_photo_url  ?? '');
  const [pvSavedRightUrl, setPvSavedRightUrl] = useState(profile?.right_face_photo_url ?? '');
  const [pvSavedConsent,  setPvSavedConsent]  = useState(profile?.creator_consent      ?? false);

  const pvFrontRef = useRef<HTMLInputElement>(null);
  const pvLeftRef  = useRef<HTMLInputElement>(null);
  const pvRightRef = useRef<HTMLInputElement>(null);

  const { everSaved: pvEverSaved, markSaved: pvMarkSaved } = useSegmentSave(previewComplete);
  const [pvLoading,          setPvLoading]          = useState(false);
  const [pvError,            setPvError]            = useState('');
  const [pvInfoOpen,         setPvInfoOpen]         = useState(false);
  const [pvPreviewModalOpen, setPvPreviewModalOpen] = useState(false);

  const [tcLoading, setTcLoading] = useState(false);
  const [tcError,   setTcError]   = useState('');

  const pvFrontReady  = !!(pvFrontFile || pvSavedFrontUrl);
  const pvLeftReady   = !!(pvLeftFile  || pvSavedLeftUrl);
  const pvRightReady  = !!(pvRightFile || pvSavedRightUrl);
  const pvPhotosReady = pvFrontReady && pvLeftReady && pvRightReady;

  const pvIsDirty = useMemo(
    () =>
      pvFrontFile  !== null ||
      pvLeftFile   !== null ||
      pvRightFile  !== null ||
      pvConsent    !== pvSavedConsent,
    [pvFrontFile, pvLeftFile, pvRightFile, pvConsent, pvSavedConsent],
  );
  const [pvInvalidated, setPvInvalidated] = useState(false);
  const pvNeedsSave  = pvIsDirty || pvInvalidated;
  const anyUpstreamNeedsSave = pNeedsSave || cNeedsSave || rNeedsSave || bNeedsSave || idIsDirty;
  const pvCanPublish = pvPhotosReady && pvConsent && !anyUpstreamNeedsSave && (pvNeedsSave || !pvEverSaved);

  async function uploadFacePhoto(file: File, slot: string): Promise<string> {
    const ext  = file.name.split('.').pop() ?? 'jpg';
    const path = `${creator!.id}/${slot}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from('face-photos').upload(path, file, { upsert: true });
    if (error) throw new Error(error.message);
    return path;
  }

  async function handlePreviewPublish(e: React.FormEvent) {
    e.preventDefault();
    if (!pvCanPublish) return;
    setPvLoading(true); setPvError('');
    try {
      const [frontUrl, leftUrl, rightUrl] = await Promise.all([
        pvFrontFile ? uploadFacePhoto(pvFrontFile, 'front') : Promise.resolve(pvSavedFrontUrl),
        pvLeftFile  ? uploadFacePhoto(pvLeftFile,  'left')  : Promise.resolve(pvSavedLeftUrl),
        pvRightFile ? uploadFacePhoto(pvRightFile, 'right') : Promise.resolve(pvSavedRightUrl),
      ]);
      const payload = {
        front_face_photo_url: frontUrl,
        left_face_photo_url:  leftUrl,
        right_face_photo_url: rightUrl,
        creator_consent:      pvConsent,
        updated_at:           new Date().toISOString(),
      };
      const { error } = profile
        ? await supabase.from('creator_profiles').update(payload).eq('id', profile.id)
        : await supabase.from('creator_profiles').insert({ ...payload, creator_id: creator!.id });
      if (error) throw new Error(error.message);
      setPvSavedFrontUrl(frontUrl);
      setPvSavedLeftUrl(leftUrl);
      setPvSavedRightUrl(rightUrl);
      setPvSavedConsent(pvConsent);
      setPvFrontFile(null);
      setPvLeftFile(null);
      setPvRightFile(null);
      setPvInvalidated(false);
      pvMarkSaved();
      onSaved();
    } catch (err: unknown) {
      setPvError(err instanceof Error ? err.message : 'Publish failed.');
    } finally {
      setPvLoading(false);
    }
  }

  // ── Test Companion ────────────────────────────────────────────────────────

  async function handleTestCompanion() {
    if (!pvConsent || tcLoading || !creator) return;
    setTcLoading(true);
    setTcError('');
    try {
      const blueprint: CompanionBlueprint = {
        // AID — AI Identity
        AID001: idSavedName,
        AID002: idSavedGender,
        AID003: idSavedAge,
        // PS — Personality
        PS001:  pSavedType,
        PS002:  pSavedInt,
        PS003:  pSavedEmot,
        PS004:  pSavedFlirt,
        PS005:  pSavedDesc,
        // COM — Communication
        COM001: cSavedPace,
        COM002: cSavedInit,
        COM003: cSavedRespLen,
        COM004: cSavedEngag,
        COM005: cSavedStory,
        COM006: cSavedConsis,
        // RS — Relationship Style
        RS001:  rSavedDynamic,
        RS002:  rSavedAttach,
        RS003:  rSavedAffect,
        RS004:  rSavedDesc,
        // BP — Boundaries & Permissions
        BP001:  bSavedMedia,
        BP002:  bSavedEscal,
        // Supplemental
        creator_instructions: bSavedInstr,
      };
      const { data, error } = await supabase
        .from('companion_test_sessions')
        .insert({ creator_id: creator.id, blueprint })
        .select('id')
        .single();
      if (error) throw new Error(error.message);
      navigate(`/test-companion/${data.id}`);
    } catch (err) {
      setTcError(err instanceof Error ? err.message : 'Failed to start test session.');
    } finally {
      setTcLoading(false);
    }
  }

  // ── Downstream invalidation effects ──────────────────────────────────────
  // When a segment's OWN fields become dirty, every downstream segment is
  // invalidated — it must be explicitly re-saved even if its own fields didn't
  // change. Saving upstream never auto-restores downstream (by design).
  // React guarantees useState setters are stable, so they're safe in deps arrays.

  // Invalidation cascade follows the engine loading order:
  // AID → RS → PS → COM → BP → PV
  // Dirtying an upstream segment marks all downstream segments as invalidated.

  useEffect(() => {
    if (idIsDirty) {
      // AID dirty → invalidate RS, PS, COM, BP, PV
      setRInvalidated(true);
      setPInvalidated(true);
      setCInvalidated(true);
      setBInvalidated(true);
      setPvInvalidated(true);
    }
  }, [idIsDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (rIsDirty) {
      // RS dirty → invalidate PS, COM, BP, PV
      setPInvalidated(true);
      setCInvalidated(true);
      setBInvalidated(true);
      setPvInvalidated(true);
    }
  }, [rIsDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (pIsDirty) {
      // PS dirty → invalidate COM, BP, PV
      setCInvalidated(true);
      setBInvalidated(true);
      setPvInvalidated(true);
    }
  }, [pIsDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cIsDirty) {
      // COM dirty → invalidate BP, PV
      setBInvalidated(true);
      setPvInvalidated(true);
    }
  }, [cIsDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (bIsDirty) {
      // BP dirty → invalidate PV
      setPvInvalidated(true);
    }
  }, [bIsDirty]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to top of page whenever the active sub-segment changes so the
  // creator always lands at the heading of the newly-selected section.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [segment]);

  // ── Segment nav config ────────────────────────────────────────────────────

  const segmentCompleted: Record<Segment, boolean> = {
    identity:           idEverSaved && !idIsDirty,
    personality:        pEverSaved  && !pNeedsSave,
    communication:      cEverSaved  && !cNeedsSave,
    relationship_style: rEverSaved  && !rNeedsSave,
    boundaries:         bEverSaved  && !bNeedsSave,
    preview:            pvEverSaved && !pvNeedsSave,
  };

  const SEGMENTS: { id: Segment; label: string; available: boolean }[] = [
    { id: 'identity',           label: 'Identity',                 available: true },
    { id: 'relationship_style', label: 'Relationship Style',       available: idEverSaved },
    { id: 'personality',        label: 'Personality',              available: rEverSaved },
    { id: 'communication',      label: 'Communication',            available: pEverSaved },
    { id: 'boundaries',         label: 'Boundaries & Permissions', available: cEverSaved },
    { id: 'preview',            label: 'Preview',                  available: bEverSaved && !anyUpstreamNeedsSave },
  ];

  const idAgePct = ((idAge - AGE_MIN) / (AGE_MAX - AGE_MIN)) * 100;

  return (
    <div className="animate-fade-in space-y-6">

      {/* Page header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-5 h-5 text-primary-400" />
          <h2 className="page-header">AI Companion</h2>
        </div>
        <p className="text-sm text-surface-400 mt-1">
          Build and configure your AI companion step by step.
        </p>
      </div>

      {/* Sub-segment nav */}
      <div className="relative">
        <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-none">
          {SEGMENTS.map((s, i) => {
            const isActive    = segment === s.id;
            const isCompleted = segmentCompleted[s.id];
            return (
              <button
                key={s.id}
                type="button"
                disabled={!s.available}
                title={s.available ? undefined : 'Coming soon'}
                onClick={() => s.available && setSegment(s.id)}
                className={[
                  'flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-medium transition-colors whitespace-nowrap select-none',
                  !s.available
                    ? 'text-surface-700 cursor-default'
                    : isActive
                      ? 'bg-primary-600/15 text-primary-400 border border-primary-600/20'
                      : 'text-surface-500 hover:text-surface-300 hover:bg-surface-800',
                ].join(' ')}
              >
                <span className={[
                  'w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0',
                  !s.available
                    ? 'bg-surface-800 text-surface-700'
                    : isCompleted
                      ? 'bg-accent-500 text-white'
                      : isActive
                        ? 'bg-primary-500 text-white'
                        : 'bg-surface-700 text-surface-500',
                ].join(' ')}>
                  {isCompleted ? '✓' : i + 1}
                </span>
                {s.label}
              </button>
            );
          })}
        </div>
        <div className="sm:hidden absolute right-0 top-0 bottom-1 w-8 bg-gradient-to-l from-surface-950 to-transparent pointer-events-none" />
      </div>

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      {segment === 'identity' && (
        <form onSubmit={handleIdentitySave} className="space-y-6">
          {idError && <ErrorBanner message={idError} />}

          <div className="card space-y-6">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-surface-200">Identity</span>
              <SegmentSaveStatus everSaved={idEverSaved} isDirty={idIsDirty} />
            </div>

            {/* Name */}
            <div>
              <label className="label">AI Companion Name <Req /></label>
              <input
                type="text"
                className="input-field"
                placeholder="e.g. Luna, Aria, Nova…"
                value={idName}
                maxLength={50}
                onChange={e => { setIdName(e.target.value); setIdError(''); }}
              />
              <div className="flex justify-between mt-1.5">
                <p className="text-xs text-surface-500">The name your audience will know them by.</p>
                <span className={`text-xs tabular-nums ${idName.length >= 45 ? 'text-warning-400' : 'text-surface-600'}`}>
                  {idName.length}/50
                </span>
              </div>
            </div>

            {/* Gender */}
            <div>
              <label className="label">AI Companion Gender <Req /></label>
              <div className="flex gap-3 mt-1">
                {GENDERS.map(g => {
                  const active = idGender === g;
                  return (
                    <button
                      key={g}
                      type="button"
                      onClick={() => { setIdGender(g); setIdError(''); }}
                      className={[
                        'flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all select-none',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      <span aria-hidden="true">{g === 'Female' ? '♀' : '♂'}</span>
                      {g}
                      {active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Age */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">AI Companion Age <Req /></label>
                <div className="flex items-center gap-1.5 bg-surface-800 border border-surface-700 rounded-lg px-3 py-1">
                  <span className="text-lg font-bold text-primary-400 tabular-nums leading-none">{idAge}</span>
                  <span className="text-xs text-surface-500">yrs</span>
                </div>
              </div>
              <SliderTrack pct={idAgePct}>
                <input
                  type="range" min={AGE_MIN} max={AGE_MAX} step={1} value={idAge}
                  onChange={e => setIdAge(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" style={{ top: 0 }}
                />
              </SliderTrack>
              <div className="flex justify-between text-xs text-surface-600 mt-0.5">
                <span>{AGE_MIN}</span><span>{AGE_MAX}</span>
              </div>
            </div>
          </div>

          <SegmentActions
            saveLabel="Save Identity"
            loading={idLoading}
            canSave={idCanSave}
            canContinue={idCanContinue}
            onContinue={() => setSegment('relationship_style')}
          />
        </form>
      )}

      {/* ── Personality ──────────────────────────────────────────────────── */}
      {segment === 'personality' && (
        <form onSubmit={handlePersonalitySave} className="space-y-6">
          {pError && <ErrorBanner message={pError} />}

          <div className="card space-y-8">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-surface-200">Personality</span>
              <SegmentSaveStatus everSaved={pEverSaved} isDirty={pNeedsSave} />
            </div>

            {/* A. Core Personality Type */}
            <div>
              <label className="label">Core Personality Type <Req /></label>
              <p className="text-xs text-surface-500 mb-3">Choose one that best describes your AI companion.</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PERSONALITY_TYPES.map(t => {
                  const active = pType === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setPType(t)}
                      className={[
                        'flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all select-none text-left',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      {t}{active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* B. Personality Intensity */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Personality Intensity <Req /></label>
                <SliderValueBadge value={pInt} label={INTENSITY_LABELS[pInt]} />
              </div>
              <SliderTrack pct={((pInt - 1) / 4) * 100}>
                <input
                  type="range" min={1} max={5} step={1} value={pInt}
                  onChange={e => setPInt(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" style={{ top: 0 }}
                />
              </SliderTrack>
              <div className="flex justify-between text-xs text-surface-600 mt-0.5">
                <span>Very Light</span><span>Very Strong</span>
              </div>
            </div>

            {/* C. Emotional Style */}
            <div>
              <label className="label">Emotional Style <Req /></label>
              <p className="text-xs text-surface-500 mb-3">How does your AI companion express themselves emotionally?</p>
              <div className="grid grid-cols-2 gap-2">
                {EMOTIONAL_STYLES.map(s => {
                  const active = pEmot === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setPEmot(s)}
                      className={[
                        'flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all select-none',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      {s}{active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* D. Flirting Style */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Flirting Style <Req /></label>
                <SliderValueBadge value={pFlirt} label={FLIRTING_LABELS[pFlirt]} />
              </div>
              <SliderTrack pct={((pFlirt - 1) / 4) * 100}>
                <input
                  type="range" min={1} max={5} step={1} value={pFlirt}
                  onChange={e => setPFlirt(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" style={{ top: 0 }}
                />
              </SliderTrack>
              <div className="flex justify-between text-xs text-surface-600 mt-0.5">
                <span>Very Subtle</span><span>Very Bold</span>
              </div>
            </div>

            {/* E. Personality Description */}
            <div>
              <label className="label">Personality Description <Req /></label>
              <p className="text-xs text-surface-500 mb-2">Describe your AI companion's personality in your own words.</p>
              <textarea
                className="input-field min-h-[120px] resize-none"
                placeholder="e.g. She is playful and witty, always finding a way to make you smile…"
                value={pDesc}
                maxLength={DESC_MAX}
                onChange={e => setPDesc(e.target.value)}
              />
              <div className="flex justify-between mt-1.5">
                <span className={`text-xs ${
                  pDesc.trim().length > 0 && pDesc.trim().length < DESC_MIN
                    ? 'text-warning-400'
                    : 'text-surface-500'
                }`}>
                  {pDesc.trim().length < DESC_MIN
                    ? `${DESC_MIN - pDesc.trim().length} more characters required`
                    : 'Looks good'}
                </span>
                <span className={`text-xs tabular-nums ${pDesc.length >= 480 ? 'text-warning-400' : 'text-surface-600'}`}>
                  {pDesc.length}/{DESC_MAX}
                </span>
              </div>
            </div>

            {/* AI Generated Tagline — placeholder */}
            <div className="rounded-xl border border-surface-700 bg-surface-800/40 px-4 py-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-surface-500" />
                <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  AI Generated Tagline
                </span>
              </div>
              <p className="text-sm text-surface-600 italic">
                Tagline will be generated after Personality is saved.
              </p>
            </div>
          </div>

          <SegmentActions
            saveLabel="Save Personality"
            loading={pLoading}
            canSave={pCanSave}
            canContinue={pCanContinue}
            onContinue={() => setSegment('communication')}
          />
        </form>
      )}

      {/* ── Communication ────────────────────────────────────────────────── */}
      {segment === 'communication' && (
        <form onSubmit={handleCommunicationSave} className="space-y-6">
          {cError && <ErrorBanner message={cError} />}

          <div className="card space-y-8">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-surface-200">Communication</span>
              <SegmentSaveStatus everSaved={cEverSaved} isDirty={cNeedsSave} />
            </div>

            {/* 1. Conversation Pace */}
            <div>
              <label className="label">Conversation Pace <Req /></label>
              <p className="text-xs text-surface-500 mb-3">How quickly does your AI companion move a conversation forward?</p>
              <div className="grid grid-cols-3 gap-2">
                {CONV_PACE_OPTIONS.map(opt => {
                  const active = cPace === opt;
                  return (
                    <button key={opt} type="button" onClick={() => setCPace(opt)}
                      className={[
                        'flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all select-none',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      {opt}{active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Initiative Level */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Initiative Level <Req /></label>
                <SliderValueBadge value={cInit} label={INITIATIVE_LABELS[cInit]} />
              </div>
              <SliderTrack pct={((cInit - 1) / 4) * 100}>
                <input
                  type="range" min={1} max={5} step={1} value={cInit}
                  onChange={e => setCInit(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" style={{ top: 0 }}
                />
              </SliderTrack>
              <div className="flex justify-between text-xs text-surface-600 mt-0.5">
                <span>Waits for user</span><span>Frequently initiates</span>
              </div>
            </div>

            {/* 3. Response Length */}
            <div>
              <label className="label">Response Length <Req /></label>
              <p className="text-xs text-surface-500 mb-3">How long should your AI companion's responses typically be?</p>
              <div className="grid grid-cols-3 gap-2">
                {RESPONSE_LEN_OPTIONS.map(opt => {
                  const active = cRespLen === opt;
                  return (
                    <button key={opt} type="button" onClick={() => setCRespLen(opt)}
                      className={[
                        'flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all select-none',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      {opt}{active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Engagement Style */}
            <div>
              <label className="label">Engagement Style <Req /></label>
              <p className="text-xs text-surface-500 mb-3">Does your AI companion listen, lead, or balance both?</p>
              <div className="grid grid-cols-3 gap-2">
                {ENGAGEMENT_OPTIONS.map(opt => {
                  const active = cEngag === opt;
                  return (
                    <button key={opt} type="button" onClick={() => setCEngag(opt)}
                      className={[
                        'flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all select-none',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      {opt}{active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. Story Guidance Level */}
            <div>
              <label className="label">Story Guidance Level <Req /></label>
              <div className="grid grid-cols-3 gap-2 mb-2">
                {STORY_GUIDANCE_OPTIONS.map(opt => {
                  const active = cStory === opt;
                  return (
                    <button key={opt} type="button" onClick={() => setCStory(opt)}
                      className={[
                        'flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all select-none',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      {opt}{active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-surface-500">
                Minimal = mostly direct conversation &nbsp;·&nbsp;
                Balanced = mix of conversation and guided interaction &nbsp;·&nbsp;
                Strong = actively guides interaction and scenarios
              </p>
            </div>

            {/* 6. Conversation Consistency */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="label mb-0">Conversation Consistency <Req /></label>
                <SliderValueBadge value={cConsis} label={CONSISTENCY_LABELS[cConsis]} />
              </div>
              <SliderTrack pct={((cConsis - 1) / 4) * 100}>
                <input
                  type="range" min={1} max={5} step={1} value={cConsis}
                  onChange={e => setCConsis(Number(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full" style={{ top: 0 }}
                />
              </SliderTrack>
              <div className="flex justify-between text-xs text-surface-600 mt-0.5">
                <span>Highly Dynamic</span><span>Strictly follows framework</span>
              </div>
            </div>

            {/* Communication Preview — placeholder */}
            <div className="rounded-xl border border-surface-700 bg-surface-800/40 px-4 py-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-surface-500" />
                <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  Communication Preview
                </span>
              </div>
              <p className="text-sm text-surface-600 italic">
                Communication preview will be generated after this section is saved.
              </p>
            </div>
          </div>

          <SegmentActions
            saveLabel="Save Communication"
            loading={cLoading}
            canSave={cCanSave}
            canContinue={cCanContinue}
            onContinue={() => setSegment('boundaries')}
          />
        </form>
      )}

      {/* ── Relationship Style ────────────────────────────────────────────── */}
      {segment === 'relationship_style' && (
        <form onSubmit={handleRelationshipStyleSave} className="space-y-6">
          {rError && <ErrorBanner message={rError} />}

          <div className="card space-y-8">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-surface-200">Relationship Style</span>
              <SegmentSaveStatus everSaved={rEverSaved} isDirty={rNeedsSave} />
            </div>

            {/* 1. Relationship Dynamic */}
            <div>
              <label className="label">Relationship Dynamic <Req /></label>
              <p className="text-xs text-surface-500 mb-3">How does your AI companion relate to the client?</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {REL_DYNAMIC_OPTIONS.map(opt => {
                  const active = rDynamic === opt;
                  return (
                    <button key={opt} type="button" onClick={() => setRDynamic(opt)}
                      className={[
                        'flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all select-none text-left',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      {opt}{active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Attachment Level */}
            <div>
              <label className="label">Attachment Level <Req /></label>
              <p className="text-xs text-surface-500 mb-3">How emotionally attached is your AI companion to the client?</p>
              <div className="grid grid-cols-3 gap-2">
                {ATTACHMENT_OPTIONS.map(opt => {
                  const active = rAttach === opt;
                  return (
                    <button key={opt} type="button" onClick={() => setRAttach(opt)}
                      className={[
                        'flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all select-none',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      {opt}{active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Affection Level */}
            <div>
              <label className="label">Affection Level <Req /></label>
              <p className="text-xs text-surface-500 mb-2">
                Controls the warmth, personal expressions, and emoji usage in the companion's dialogue.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {AFFECTION_OPTIONS.map(opt => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setRAffect(opt)}
                    className={[
                      'px-3 py-2 rounded-lg border text-sm font-medium transition-colors text-center',
                      rAffect === opt
                        ? 'bg-primary-600 border-primary-500 text-white'
                        : 'bg-surface-800 border-surface-700 text-surface-300 hover:border-surface-500 hover:text-surface-200',
                    ].join(' ')}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <p className="text-xs text-surface-600 mt-1.5">
                {rAffect === 'Low'    && 'AF-001 — Base dialogue only. No warmth additions.'}
                {rAffect === 'Medium' && 'AF-002 — Light warmth, personal expressions, occasional emojis.'}
                {rAffect === 'High'   && 'AF-003 — Stronger personal touch, affectionate wording, frequent emojis.'}
              </p>
            </div>

            {/* 4. Relationship Description */}
            <div>
              <label className="label">Relationship Description <Req /></label>
              <p className="text-xs text-surface-500 mb-2">
                Describe how your AI companion should behave in the relationship with the client.
              </p>
              <textarea
                className="input-field min-h-[120px] resize-none"
                placeholder="e.g. She treats every client as a cherished partner, remembering small details…"
                value={rDesc}
                maxLength={REL_DESC_MAX}
                onChange={e => setRDesc(e.target.value)}
              />
              <div className="flex justify-between mt-1.5">
                <span className={`text-xs ${
                  rDesc.trim().length > 0 && rDesc.trim().length < REL_DESC_MIN
                    ? 'text-warning-400'
                    : 'text-surface-500'
                }`}>
                  {rDesc.trim().length < REL_DESC_MIN
                    ? `${REL_DESC_MIN - rDesc.trim().length} more characters required`
                    : 'Looks good'}
                </span>
                <span className={`text-xs tabular-nums ${rDesc.length >= 480 ? 'text-warning-400' : 'text-surface-600'}`}>
                  {rDesc.length}/{REL_DESC_MAX}
                </span>
              </div>
            </div>

            {/* AI Generated Relationship Preview — placeholder */}
            <div className="rounded-xl border border-surface-700 bg-surface-800/40 px-4 py-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-surface-500" />
                <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  Relationship Preview
                </span>
              </div>
              <p className="text-sm text-surface-600 italic">
                Relationship preview will be generated after this section is saved.
              </p>
            </div>
          </div>

          <SegmentActions
            saveLabel="Save Relationship Style"
            loading={rLoading}
            canSave={rCanSave}
            canContinue={rCanContinue}
            onContinue={() => setSegment('personality')}
          />
        </form>
      )}

      {/* ── Boundaries & Permissions ──────────────────────────────────────── */}
      {segment === 'boundaries' && (
        <form onSubmit={handleBoundariesSave} className="space-y-6">
          {bError && <ErrorBanner message={bError} />}

          <div className="card space-y-8">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-surface-200">Boundaries &amp; Permissions</span>
              <SegmentSaveStatus everSaved={bEverSaved} isDirty={bNeedsSave} />
            </div>

            {/* 1. Media Permissions */}
            <div>
              <label className="label">Media Permissions <Req /></label>
              <div className="grid grid-cols-3 gap-2 mt-1">
                {MEDIA_PERMISSIONS_OPTIONS.map(opt => {
                  const active = bMedia === opt;
                  return (
                    <button key={opt} type="button" onClick={() => setBMedia(opt)}
                      className={[
                        'flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all select-none',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      {opt}{active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 2. Relationship Escalation */}
            <div>
              <label className="label">Relationship Escalation <Req /></label>
              <p className="text-xs text-surface-500 mb-3">
                Controls how quickly your AI companion progresses through the interaction experience.
              </p>
              <div className="grid grid-cols-3 gap-2">
                {REL_ESCALATION_OPTIONS.map(opt => {
                  const active = bEscal === opt;
                  return (
                    <button key={opt} type="button" onClick={() => setBEscal(opt)}
                      className={[
                        'flex items-center justify-between px-3.5 py-2.5 rounded-xl border text-sm font-medium transition-all select-none',
                        active
                          ? 'bg-primary-600/15 border-primary-500/50 text-primary-300'
                          : 'bg-surface-800/50 border-surface-700 text-surface-400 hover:border-surface-600 hover:text-surface-200',
                      ].join(' ')}
                    >
                      {opt}{active && <InlineCheck />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 3. Creator Instructions */}
            <div>
              <label className="label">Special Instructions <Req /></label>
              <p className="text-xs text-surface-500 mb-2">
                Describe important behavior rules, tone, interaction style, and expectations for your AI companion.
              </p>
              <textarea
                className="input-field min-h-[140px] resize-none"
                placeholder="e.g. Always maintain a respectful tone. Never discuss real-world finances…"
                value={bInstr}
                maxLength={BP_INSTRUCTIONS_MAX}
                onChange={e => setBInstr(e.target.value)}
              />
              <div className="flex justify-between mt-1.5">
                <span className={`text-xs ${
                  bInstr.trim().length > 0 && bInstr.trim().length < BP_INSTRUCTIONS_MIN
                    ? 'text-warning-400'
                    : 'text-surface-500'
                }`}>
                  {bInstr.trim().length < BP_INSTRUCTIONS_MIN
                    ? `${BP_INSTRUCTIONS_MIN - bInstr.trim().length} more characters required`
                    : 'Looks good'}
                </span>
                <span className={`text-xs tabular-nums ${bInstr.length >= 960 ? 'text-warning-400' : 'text-surface-600'}`}>
                  {bInstr.length}/{BP_INSTRUCTIONS_MAX}
                </span>
              </div>
            </div>

            {/* Permission Preview — placeholder */}
            <div className="rounded-xl border border-surface-700 bg-surface-800/40 px-4 py-4">
              <div className="flex items-center gap-2 mb-1.5">
                <Sparkles className="w-3.5 h-3.5 text-surface-500" />
                <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">
                  Permission Preview
                </span>
              </div>
              <p className="text-sm text-surface-600 italic">
                Permission summary will be generated after this section is saved.
              </p>
            </div>
          </div>

          <SegmentActions
            saveLabel="Save Boundaries & Permissions"
            loading={bLoading}
            canSave={bCanSave}
            canContinue={bCanContinue}
            onContinue={() => setSegment('preview')}
          />
        </form>
      )}

      {/* ── Preview ────────────────────────────────────────────────────────── */}
      {segment === 'preview' && (
        <div className="space-y-6">
          {pvError && <ErrorBanner message={pvError} />}

          {/* Info Modal */}
          {pvInfoOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <div className="card max-w-sm w-full space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-surface-200">Photo Requirements</span>
                  <button type="button" onClick={() => setPvInfoOpen(false)}
                    className="text-surface-500 hover:text-surface-200 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ul className="space-y-2 text-sm text-surface-400">
                  {[
                    'Face must be clearly visible',
                    'Good lighting recommended',
                    'No sunglasses',
                    'No heavy face covering',
                    'Single person only',
                    'JPG or PNG',
                    'Recommended resolution: 1024×1024 or higher',
                    'Maximum file size: 10 MB per image',
                  ].map(line => (
                    <li key={line} className="flex items-start gap-2">
                      <CheckCircle className="w-3.5 h-3.5 text-accent-400 flex-shrink-0 mt-0.5" />
                      {line}
                    </li>
                  ))}
                </ul>
                <button type="button" className="btn-primary w-full" onClick={() => setPvInfoOpen(false)}>
                  Got it
                </button>
              </div>
            </div>
          )}

          {/* Preview Modal */}
          {pvPreviewModalOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <div className="card max-w-sm w-full space-y-4 text-center">
                <Sparkles className="w-8 h-8 text-primary-400 mx-auto" />
                <h3 className="font-semibold text-surface-200">Preview Coming Soon</h3>
                <p className="text-sm text-surface-400">
                  AI Companion preview generation will be available in a future update.
                </p>
                <button type="button" className="btn-primary w-full" onClick={() => setPvPreviewModalOpen(false)}>
                  Close
                </button>
              </div>
            </div>
          )}

          {anyUpstreamNeedsSave && (
            <div className="flex items-center gap-2.5 p-4 rounded-xl bg-warning-500/10 border border-warning-500/30 text-warning-300 text-sm">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>
                <span className="font-semibold">Preview Locked</span> — Please save all modified sections first.
              </span>
            </div>
          )}

          <form onSubmit={handlePreviewPublish} className="space-y-6">

            {/* Section 1: Face Photo Verification */}
            <div className="card space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-surface-200">Face Photo Verification</span>
                  <button type="button" onClick={() => setPvInfoOpen(true)}
                    className="text-surface-500 hover:text-surface-300 transition-colors" aria-label="Photo requirements">
                    <Info className="w-4 h-4" />
                  </button>
                </div>
                <SegmentSaveStatus everSaved={pvEverSaved} isDirty={pvNeedsSave} />
              </div>
              <p className="text-xs text-surface-500 -mt-2">
                Upload face reference photos. These will be used to inspire your AI companion's appearance.
              </p>

              <FacePhotoDropZone
                label="Front Face Photo"
                slot="front"
                file={pvFrontFile}
                savedUrl={pvSavedFrontUrl}
                inputRef={pvFrontRef}
                onChange={setPvFrontFile}
              />
              <FacePhotoDropZone
                label="Left Side Face Photo"
                slot="left"
                file={pvLeftFile}
                savedUrl={pvSavedLeftUrl}
                inputRef={pvLeftRef}
                onChange={setPvLeftFile}
              />
              <FacePhotoDropZone
                label="Right Side Face Photo"
                slot="right"
                file={pvRightFile}
                savedUrl={pvSavedRightUrl}
                inputRef={pvRightRef}
                onChange={setPvRightFile}
              />

              {!pvPhotosReady && (
                <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-warning-500/10 border border-warning-500/20 text-warning-400 text-sm">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  All three face photos are required before publishing.
                </div>
              )}
            </div>

            {/* Section 2: AI Companion Summary */}
            <div className="card space-y-4">
              <span className="text-sm font-semibold text-surface-200">AI Companion Summary</span>
              <SummaryCard title="Identity" onEdit={() => setSegment('identity')}>
                <SummaryRow label="Name"   value={profile?.ai_companion_name   ?? '—'} />
                <SummaryRow label="Gender" value={profile?.ai_companion_gender ?? '—'} />
                <SummaryRow label="Age"    value={profile?.ai_companion_age ? String(profile.ai_companion_age) : '—'} />
              </SummaryCard>
              <SummaryCard title="Personality" onEdit={() => setSegment('personality')}>
                <SummaryRow label="Type"           value={profile?.ai_companion_personality_type ?? '—'} />
                <SummaryRow label="Emotional Style" value={profile?.ai_companion_emotional_style ?? '—'} />
              </SummaryCard>
              <SummaryCard title="Communication" onEdit={() => setSegment('communication')}>
                <SummaryRow label="Pace"        value={profile?.ai_comm_conversation_pace ?? '—'} />
                <SummaryRow label="Responses"   value={profile?.ai_comm_response_length   ?? '—'} />
                <SummaryRow label="Engagement"  value={profile?.ai_comm_engagement_style  ?? '—'} />
              </SummaryCard>
              <SummaryCard title="Relationship Style" onEdit={() => setSegment('relationship_style')}>
                <SummaryRow label="Dynamic"    value={profile?.ai_rel_dynamic    ?? '—'} />
                <SummaryRow label="Attachment" value={profile?.ai_rel_attachment ?? '—'} />
              </SummaryCard>
              <SummaryCard title="Boundaries & Permissions" onEdit={() => setSegment('boundaries')}>
                <SummaryRow label="Media"      value={profile?.ai_bp_media_permissions       ?? '—'} />
                <SummaryRow label="Escalation" value={profile?.ai_bp_relationship_escalation ?? '—'} />
              </SummaryCard>
            </div>

            {/* Section 3: Completion Status */}
            <div className="card">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-surface-200">AI Companion Completion</span>
                <span className="text-sm font-bold text-accent-400">100%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-surface-700 overflow-hidden mb-3">
                <div className="h-full bg-accent-500 rounded-full" style={{ width: '100%' }} />
              </div>
              <p className="text-xs text-surface-500">All required setup sections completed.</p>
            </div>

            {/* Section 4: Creator Consent */}
            <div className="card">
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div className="relative mt-0.5 flex-shrink-0">
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={pvConsent}
                    onChange={e => setPvConsent(e.target.checked)}
                  />
                  <div className={[
                    'w-5 h-5 rounded border-2 flex items-center justify-center transition-all',
                    pvConsent
                      ? 'bg-primary-600 border-primary-500'
                      : 'bg-surface-800 border-surface-600 hover:border-surface-500',
                  ].join(' ')}>
                    {pvConsent && (
                      <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                        <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-sm text-surface-300 leading-relaxed">
                  I confirm these photos belong to me and I authorize their use for creating and operating my AI companion.
                </span>
              </label>
            </div>

            {/* Section 5: Test Companion */}
            <div className="card space-y-3">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-accent-400" />
                <span className="text-sm font-semibold text-surface-200">Engine Test</span>
              </div>
              <p className="text-xs text-surface-500">
                Start an isolated test conversation using your current saved configuration.
                Changes made after this point will not affect the active test session.
              </p>
              {tcError && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-xs">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />{tcError}
                </div>
              )}
              <button
                type="button"
                onClick={handleTestCompanion}
                disabled={!pvConsent || tcLoading}
                className={[
                  'btn-secondary w-full',
                  (!pvConsent || tcLoading) ? 'opacity-40 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {tcLoading
                  ? <><SaveSpinner />Starting session…</>
                  : <><MessageCircle className="w-4 h-4" />Test Companion</>}
              </button>
              {!pvConsent && (
                <p className="text-xs text-surface-500 text-center">
                  Confirm ownership above to enable testing.
                </p>
              )}
            </div>

            {/* Section 6: Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={() => setPvPreviewModalOpen(true)}
                className="btn-secondary flex-1 sm:flex-none"
              >
                <Sparkles className="w-4 h-4" />
                Preview AI Companion
              </button>
              <button
                type="submit"
                disabled={!pvCanPublish || pvLoading}
                className={[
                  'btn-primary flex-1',
                  (!pvCanPublish && !pvLoading) ? 'opacity-40 cursor-not-allowed' : '',
                ].join(' ')}
              >
                {pvLoading ? <><SaveSpinner />Publishing…</> : <><Sparkles className="w-4 h-4" />Publish AI Companion</>}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

// ─── Shared primitives (used by every sub-segment) ────────────────────────────

/** Red asterisk for required fields */
function Req() {
  return <span className="text-danger-400 ml-0.5">*</span>;
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2.5 p-3.5 rounded-lg bg-danger-500/10 border border-danger-500/20 text-danger-400 text-sm">
      <AlertCircle className="w-4 h-4 flex-shrink-0" />{message}
    </div>
  );
}

function InlineCheck() {
  return (
    <svg className="w-3.5 h-3.5 text-primary-400 flex-shrink-0 ml-1" viewBox="0 0 12 12" fill="none">
      <path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FacePhotoDropZone({
  label, slot, file, savedUrl, inputRef, onChange,
}: {
  label: string;
  slot: string;
  file: File | null;
  savedUrl: string;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onChange: (f: File) => void;
}) {
  const hasNew   = file !== null;
  const hasSaved = savedUrl !== '';

  return (
    <div>
      <label className="label">{label} <span className="text-danger-400 ml-0.5">*</span></label>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => e.key === 'Enter' && inputRef.current?.click()}
        className={[
          'border-2 border-dashed rounded-xl p-5 transition-all duration-150 text-center cursor-pointer',
          hasNew
            ? 'border-primary-500/50 bg-primary-500/5'
            : hasSaved
              ? 'border-accent-500/40 bg-accent-500/5'
              : 'border-surface-700 hover:border-primary-600/50 hover:bg-surface-800/50',
        ].join(' ')}
      >
        <input
          ref={inputRef as React.RefObject<HTMLInputElement>}
          type="file"
          accept="image/jpeg,image/png,image/jpg"
          className="hidden"
          onChange={e => e.target.files?.[0] && onChange(e.target.files[0])}
        />
        <FileImage className={`w-7 h-7 mx-auto mb-2 ${hasNew ? 'text-primary-400' : hasSaved ? 'text-accent-400' : 'text-surface-600'}`} />
        {hasNew ? (
          <p className="text-sm text-primary-400 font-medium truncate px-2">{file!.name}</p>
        ) : hasSaved ? (
          <>
            <p className="text-sm text-accent-400 font-medium mb-0.5">Photo uploaded</p>
            <p className="text-xs text-surface-500">
              <Upload className="w-3 h-3 inline mr-1" />Click to replace
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium text-surface-500 mb-0.5">
              <Upload className="w-3.5 h-3.5 inline mr-1" />Click to upload {slot} face photo
            </p>
            <p className="text-xs text-surface-600">JPG or PNG — max 10 MB</p>
          </>
        )}
      </div>
    </div>
  );
}

function SummaryCard({
  title, onEdit, children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-surface-700 bg-surface-800/30 px-4 py-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-surface-400 uppercase tracking-wider">{title}</span>
        <button type="button" onClick={onEdit}
          className="text-xs text-primary-400 hover:text-primary-300 transition-colors font-medium px-2 py-0.5 rounded border border-primary-500/30 hover:border-primary-400/50">
          Edit
        </button>
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-surface-500 flex-shrink-0">{label}</span>
      <span className="text-surface-300 text-right truncate max-w-[60%]">{value}</span>
    </div>
  );
}

function SliderTrack({ pct, children }: { pct: number; children: React.ReactNode }) {
  return (
    <div className="relative pt-1 pb-2">
      <div className="relative h-2 rounded-full bg-surface-700 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-primary-500 rounded-full transition-all duration-75"
          style={{ width: `${pct}%` }}
        />
      </div>
      {children}
    </div>
  );
}

function SliderValueBadge({ value, label }: { value: number; label: string }) {
  return (
    <div className="flex items-center gap-1.5 bg-surface-800 border border-surface-700 rounded-lg px-3 py-1 min-w-[100px] justify-center">
      <span className="text-sm font-bold text-primary-400 tabular-nums">{value}</span>
      <span className="text-xs text-surface-500 truncate">{label}</span>
    </div>
  );
}

/**
 * Consistent status indicator for every sub-segment.
 * Renders nothing until the user has saved at least once.
 */
function SegmentSaveStatus({ everSaved, isDirty }: { everSaved: boolean; isDirty: boolean }) {
  if (!everSaved && !isDirty) return null;
  if (everSaved && !isDirty) {
    return (
      <div className="flex items-center gap-1.5 text-xs text-accent-400">
        <CheckCircle className="w-3.5 h-3.5" />
        Saved Successfully
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 text-xs text-warning-400">
      <Circle className="w-3 h-3 fill-warning-400" />
      Unsaved Changes
    </div>
  );
}

function SaveSpinner() {
  return (
    <svg
      className="w-4 h-4 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

/**
 * Consistent Save + Continue button row for every sub-segment.
 *   Save:     enabled when canSave (allFilled && isDirty); disabled + spinner while loading
 *   Continue: enabled when canContinue (everSaved && !isDirty)
 */
function SegmentActions({
  saveLabel,
  loading,
  canSave,
  canContinue,
  onContinue,
}: {
  saveLabel: string;
  loading: boolean;
  canSave: boolean;
  canContinue: boolean;
  onContinue: () => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
      <button
        type="submit"
        disabled={!canSave || loading}
        className="btn-primary"
      >
        {loading ? <SaveSpinner /> : <Sparkles className="w-4 h-4" />}
        {loading ? 'Saving…' : saveLabel}
      </button>
      <button
        type="button"
        disabled={!canContinue}
        onClick={canContinue ? onContinue : undefined}
        className={[
          'btn-secondary',
          !canContinue ? 'opacity-40 cursor-not-allowed' : '',
        ].join(' ')}
      >
        Continue →
      </button>
    </div>
  );
}
