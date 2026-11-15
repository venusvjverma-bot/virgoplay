import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import {
  Cpu, ChevronDown, Loader2, AlertCircle, Lock,
  BookOpen, Layers, MapPin, Package2, FileText,
  Zap, CheckCircle, XCircle, Clock, BarChart2,
  MessageSquare, Pencil, Save,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

// ── Access gate ───────────────────────────────────────────────────────────────
// Deployment Task 002: restricted to Mother Creator development account only.
// Must NOT be exposed to child creators, public users, or the normal chat interface.
const MOTHER_CREATOR_EMAIL = 'test.test@gmail.com';

// ── Static Generation Rules ───────────────────────────────────────────────────
// Platform-level system prompt. Not user-editable. Not stored in the database.

const GENERATION_RULES = `You are generating dialogue content for a single Dialogue Package in a structured AI companion experience.

HARD RULES:
0. Never invent information that is not provided in the blueprints.
   If a blueprint does not mention something, do not assume, infer, expand, or create new business logic.
   Generate only what is required for the selected package.
1. Generate dialogue for THIS ONE PACKAGE ONLY — never multiple packages, stages, or sessions.
2. Stay fully in character as defined in the Role Blueprint.
3. Dialogue must match the Role Blueprint (Target Audience, Generation Type, Core Personality).
4. Story Blueprint defines the overarching narrative goal — remain aligned with it.
5. Scenario Blueprint defines the specific scene, relationship state, and scenario goal — honour them.
6. Package Blueprint defines the exact conversation objective, word count range, and content rules — follow them precisely.
7. Respect Must Include and Must Avoid fields absolutely.
8. Each generated dialogue must contain 70–90 words, exactly as specified in the Package Blueprint.
9. Emotion defines the tone — maintain it throughout every line.
10. Output must be natural, warm, and appropriate to the companion relationship style.
11. Every generated dialogue must be unique.
    Never repeat previously generated dialogue for the same package.
    If regeneration is requested, create a different dialogue while still satisfying all blueprint requirements.

OUTPUT FORMAT: Plain dialogue text only. Do not include labels, stage directions, or metadata.`;

// ── Types ─────────────────────────────────────────────────────────────────────

interface RoleOption {
  code: string;
  label: string;
}

interface RoleDefinition {
  package_code: string;
  description: string;
  core_characteristics: string[];
  human_nature: string[];
  target_audience: string;
  generation_type: string;
  story_name: string;
  story_goal: string;
  current_story: string;
  stage_objectives: Record<string, string[]>;
  modifier_tones: Record<string, { label: string; traits: string[] }>;
  attachment_modifiers: Record<string, { label: string; traits: string[] }>;
  emotional_journey: Record<string, {
    client_emotions: string[];
    mt_goals: string[];
    desired_outcome: string[];
  }>;
}

interface ScenarioOption {
  code: string;
  label: string;
  description: string;
  hint: string;
  sort_order: number;
  scene: string;
  current_relationship: string;
  scenario_goal: string;
}

interface PackageOption {
  package_code: string;
  label: string;
  package_role: 'main' | 'final';
  sort_order: number;
}

interface PackageBlueprint {
  code: string;
  label: string;
  purpose: string;
  scene: string;
  current_relationship: string;
  emotion: string;
  conversation_goal: string;
  target_outcome: string;
  word_count_range: string;
  must_include: string;
  must_avoid: string;
}

interface ValidationResult {
  valid: boolean;
  missing: string[];
}

interface RunpodResult {
  status: 'success' | 'error';
  generation_time_ms: number;
  output: string | null;
  error?: string;
  provider_name?: string;
}

interface DialoguePackageContent {
  id: string;
  package_code: string;
  sequence: number;
  dialogue_text: string;
  dialogue_text_a: string;
  dialogue_text_b: string;
  dialogue_text_c: string;
}

// ── Validation ────────────────────────────────────────────────────────────────

function validateBlueprints(
  roleDef: RoleDefinition | null,
  scenario: ScenarioOption | null,
  pkg: PackageBlueprint | null,
): ValidationResult {
  const missing: string[] = [];

  if (!roleDef) { missing.push('Role definition'); return { valid: false, missing }; }
  if (!scenario) { missing.push('Scenario'); return { valid: false, missing }; }
  if (!pkg)      { missing.push('Package blueprint'); return { valid: false, missing }; }

  // Role Blueprint
  if (!roleDef.target_audience?.trim())  missing.push('Role → Target Audience');
  if (!roleDef.generation_type?.trim())  missing.push('Role → Generation Type');
  if (!roleDef.description?.trim())      missing.push('Role → Role Description');

  // Story Blueprint
  if (!roleDef.story_name?.trim())   missing.push('Story → Story Name');
  if (!roleDef.story_goal?.trim())   missing.push('Story → Story Goal');
  if (!roleDef.current_story?.trim()) missing.push('Story → Current Story');

  // Scenario Blueprint
  if (!scenario.scene?.trim())                missing.push('Scenario → Scene');
  if (!scenario.current_relationship?.trim()) missing.push('Scenario → Current Relationship');
  if (!(scenario.scenario_goal?.trim() || scenario.description?.trim())) {
    missing.push('Scenario → Scenario Goal');
  }

  // Package Blueprint
  if (!pkg.purpose?.trim())              missing.push('Package → Purpose');
  if (!pkg.emotion?.trim())              missing.push('Package → Emotion');
  if (!pkg.conversation_goal?.trim())    missing.push('Package → Conversation Goal');
  if (!pkg.target_outcome?.trim())       missing.push('Package → Target Outcome');
  if (!pkg.word_count_range?.trim())     missing.push('Package → Word Count Range');
  if (!pkg.must_include?.trim())         missing.push('Package → Must Include');
  if (!pkg.must_avoid?.trim())           missing.push('Package → Must Avoid');

  return { valid: missing.length === 0, missing };
}

// ── Final Prompt Assembly ─────────────────────────────────────────────────────

function assemblePrompt(
  role: RoleOption,
  roleDef: RoleDefinition,
  scenario: ScenarioOption,
  pkgBlueprint: PackageBlueprint,
): string {
  const div = '─'.repeat(64);
  const sec = (label: string) => `\n${div}\n ${label}\n${div}\n`;

  let p = sec('GENERATION RULES');
  p += GENERATION_RULES + '\n';

  p += sec(`ROLE BLUEPRINT  ·  ${role.code}: ${role.label}`);
  p += `Role: ${role.code} — ${role.label}\n`;
  p += `Target Audience: ${roleDef.target_audience}\n`;
  p += `Generation Type: ${roleDef.generation_type}\n`;
  p += `Role Description:\n  ${roleDef.description}\n`;
  if ((roleDef.core_characteristics ?? []).length) {
    p += `Core Personality: ${roleDef.core_characteristics.join(', ')}\n`;
  }
  p += '\n';

  p += sec(`STORY BLUEPRINT  ·  ${role.label}`);
  p += `Story Name: ${roleDef.story_name}\n`;
  p += `Story Goal: ${roleDef.story_goal}\n`;
  p += `Current Story: ${roleDef.current_story}\n\n`;

  p += sec(`SCENARIO BLUEPRINT  ·  ${scenario.code}: ${scenario.label}`);
  p += `Scenario Code: ${scenario.code}\n`;
  p += `Scenario Name: ${scenario.label}\n`;
  p += `Scene: ${scenario.scene}\n`;
  p += `Current Relationship: ${scenario.current_relationship}\n`;
  p += `Scenario Goal: ${scenario.scenario_goal || scenario.description}\n`;
  p += `Expected Ending: ${scenario.hint || '—'}\n\n`;

  p += sec(`PACKAGE BLUEPRINT  ·  ${pkgBlueprint.code}`);
  p += `Package Code: ${pkgBlueprint.code}\n`;
  p += `Package Name: ${pkgBlueprint.label}\n`;
  p += `Purpose: ${pkgBlueprint.purpose}\n`;
  p += `Scene: ${pkgBlueprint.scene}\n`;
  p += `Current Relationship: ${pkgBlueprint.current_relationship}\n`;
  p += `Emotion: ${pkgBlueprint.emotion}\n`;
  p += `Conversation Goal: ${pkgBlueprint.conversation_goal}\n`;
  p += `Target Outcome: ${pkgBlueprint.target_outcome}\n`;
  p += `Word Count Range: ${pkgBlueprint.word_count_range}\n`;
  p += `Must Include: ${pkgBlueprint.must_include}\n`;
  p += `Must Avoid: ${pkgBlueprint.must_avoid}\n`;

  return p;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PackageGenerationPage() {
  const { creator } = useAuth();

  const isMotherCreator =
    creator?.email === MOTHER_CREATOR_EMAIL || creator?.is_super_admin === true;

  if (!isMotherCreator) {
    return <AccessRestricted email={creator?.email} />;
  }

  return <PackageGenerationContent />;
}

function PackageGenerationContent() {
  // ── Selection state ──────────────────────────────────────────────────────
  const [selectedRole,     setSelectedRole]     = useState<RoleOption | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioOption | null>(null);
  const [selectedPkg,      setSelectedPkg]      = useState<PackageOption | null>(null);

  const [roles,     setRoles]     = useState<RoleOption[]>([]);
  const [scenarios, setScenarios] = useState<ScenarioOption[]>([]);
  const [packages,  setPackages]  = useState<PackageOption[]>([]);

  // ── Blueprint state ──────────────────────────────────────────────────────
  const [roleDef,       setRoleDef]       = useState<RoleDefinition | null>(null);
  const [pkgBlueprint,  setPkgBlueprint]  = useState<PackageBlueprint | null>(null);

  // ── Loading / error state ────────────────────────────────────────────────
  const [rolesLoading,     setRolesLoading]     = useState(false);
  const [scenariosLoading, setScenariosLoading] = useState(false);
  const [packagesLoading,  setPackagesLoading]  = useState(false);
  const [blueprintLoading, setBlueprintLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── RunPod generation state ──────────────────────────────────────────────
  const [generating,    setGenerating]    = useState(false);
  const [runpodResult,  setRunpodResult]  = useState<RunpodResult | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // ── Dialogue content state ────────────────────────────────────────────────
  const [dialoguePackage,  setDialoguePackage]  = useState<DialoguePackageContent | null>(null);
  const [dialogueLoading,  setDialogueLoading]  = useState(false);

  // ── Load roles on mount ──────────────────────────────────────────────────
  useEffect(() => {
    setRolesLoading(true);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('engine_package_registry')
          .select('code, label')
          .eq('package_type', 'role')
          .order('sort_order');
        if (err) setError(err.message);
        else setRoles((data ?? []) as RoleOption[]);
      } finally {
        setRolesLoading(false);
      }
    })();
  }, []);

  // ── Load scenarios when role changes ─────────────────────────────────────
  useEffect(() => {
    if (!selectedRole) {
      setScenarios([]);
      setSelectedScenario(null);
      setSelectedPkg(null);
      setRoleDef(null);
      setPkgBlueprint(null);
      setDialoguePackage(null);
      return;
    }
    setScenariosLoading(true);
    setSelectedScenario(null);
    setSelectedPkg(null);
    setRoleDef(null);
    setPkgBlueprint(null);
    setRunpodResult(null);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('engine_scenario_registry')
          .select('code, label, description, hint, sort_order, scene, current_relationship, scenario_goal')
          .eq('role_code', selectedRole.code)
          .eq('is_active', true)
          .order('sort_order');
        if (err) setError(err.message);
        else setScenarios((data ?? []) as ScenarioOption[]);
      } finally {
        setScenariosLoading(false);
      }
    })();
  }, [selectedRole?.code]);

  // ── Load packages when scenario changes ──────────────────────────────────
  useEffect(() => {
    if (!selectedScenario) {
      setPackages([]);
      setSelectedPkg(null);
      setPkgBlueprint(null);
      return;
    }
    setPackagesLoading(true);
    setSelectedPkg(null);
    setPkgBlueprint(null);
    setRunpodResult(null);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('engine_scenario_packages')
          .select('package_code, package_role, sort_order, reg:engine_package_registry!package_code(label)')
          .eq('scenario_code', selectedScenario.code)
          .order('sort_order');
        if (err) { setError(err.message); return; }
        const opts: PackageOption[] = ((data ?? []) as unknown as {
          package_code: string;
          package_role: 'main' | 'final';
          sort_order: number;
          reg: { label: string } | null;
        }[]).map(row => ({
          package_code: row.package_code,
          label:        row.reg?.label ?? row.package_code,
          package_role: row.package_role,
          sort_order:   row.sort_order,
        }));
        setPackages(opts);
      } finally {
        setPackagesLoading(false);
      }
    })();
  }, [selectedScenario?.code]);

  // ── Load blueprints when package changes ─────────────────────────────────
  useEffect(() => {
    if (!selectedPkg || !selectedRole) {
      setRoleDef(null);
      setPkgBlueprint(null);
      setRunpodResult(null);
      return;
    }
    setBlueprintLoading(true);
    setError(null);
    setRunpodResult(null);

    Promise.all([
      supabase
        .from('engine_role_definitions')
        .select('package_code, description, core_characteristics, human_nature, target_audience, generation_type, story_name, story_goal, current_story, stage_objectives, modifier_tones, attachment_modifiers, emotional_journey')
        .eq('package_code', selectedRole.code)
        .maybeSingle(),
      supabase
        .from('engine_package_registry')
        .select('code, label, purpose, scene, current_relationship, emotion, conversation_goal, target_outcome, word_count_range, must_include, must_avoid')
        .eq('code', selectedPkg.package_code)
        .maybeSingle(),
    ]).then(([roleRes, pkgRes]) => {
      if (roleRes.error) throw roleRes.error;
      if (pkgRes.error)  throw pkgRes.error;
      setRoleDef(roleRes.data as unknown as RoleDefinition ?? null);
      setPkgBlueprint(pkgRes.data as unknown as PackageBlueprint ?? null);
    }).catch(err => setError((err as Error).message))
      .finally(() => setBlueprintLoading(false));
  }, [selectedPkg?.package_code, selectedRole?.code]);

  // ── Load dialogue package content when package changes ───────────────────
  useEffect(() => {
    if (!selectedPkg) {
      setDialoguePackage(null);
      return;
    }
    setDialogueLoading(true);
    (async () => {
      try {
        const { data, error: err } = await supabase
          .from('dialogue_packages')
          .select('id, package_code, sequence, dialogue_text, dialogue_text_a, dialogue_text_b, dialogue_text_c')
          .eq('package_code', selectedPkg.package_code)
          .maybeSingle();
        if (err) setError(err.message);
        else setDialoguePackage(data as DialoguePackageContent ?? null);
      } finally {
        setDialogueLoading(false);
      }
    })();
  }, [selectedPkg?.package_code]);

  // ── Save a single dialogue field ──────────────────────────────────────────
  async function handleDialogueSave(
    field: 'dialogue_text' | 'dialogue_text_a' | 'dialogue_text_b' | 'dialogue_text_c',
    value: string,
  ): Promise<void> {
    if (!dialoguePackage) throw new Error('No dialogue package loaded');
    const { error: updateErr } = await supabase
      .from('dialogue_packages')
      .update({ [field]: value, updated_at: new Date().toISOString() })
      .eq('id', dialoguePackage.id);
    if (updateErr) throw new Error(updateErr.message);
    setDialoguePackage(prev => prev ? { ...prev, [field]: value } : null);
  }

  // ── Generate ─────────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!selectedRole || !selectedScenario || !selectedPkg || !roleDef || !pkgBlueprint) return;
    const validation = validateBlueprints(roleDef, selectedScenario, pkgBlueprint);
    if (!validation.valid) return;

    setGenerating(true);
    setGenerateError(null);
    setRunpodResult(null);

    const prompt = assemblePrompt(selectedRole, roleDef, selectedScenario, pkgBlueprint);

    setGenerateError('This generation tool has been retired.');
    setGenerating(false);
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const allSelected     = !!(selectedRole && selectedScenario && selectedPkg);
  const blueprintsReady = allSelected && !blueprintLoading && !!roleDef && !!pkgBlueprint;
  const validation      = blueprintsReady
    ? validateBlueprints(roleDef!, selectedScenario!, pkgBlueprint!)
    : null;
  const promptText      = blueprintsReady && validation?.valid
    ? assemblePrompt(selectedRole!, roleDef!, selectedScenario!, pkgBlueprint!)
    : '';

  const canGenerate = blueprintsReady && validation?.valid && !generating;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in space-y-6">

      {/* Page header */}
      <div className="pb-5 border-b border-surface-800">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-8 h-8 rounded-lg bg-primary-600/15 border border-primary-600/20 flex items-center justify-center flex-shrink-0">
            <Cpu className="w-4 h-4 text-primary-400" />
          </div>
          <h1 className="text-xl font-semibold text-surface-100">Package Generation</h1>
          <span className="text-[10px] font-mono text-warning-400 bg-warning-500/10 border border-warning-500/20 px-1.5 py-0.5 rounded">
            DEV ONLY
          </span>
        </div>
        <p className="text-sm text-surface-500 ml-11 leading-relaxed">
          Verify the complete Bolt → RunPod generation pipeline. No dialogue is saved. Chat is unaffected.
        </p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 text-danger-400 text-sm bg-danger-500/5 border border-danger-500/20 rounded-lg px-3 py-2.5">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Selection panel */}
      <div className="card space-y-4">
        <SectionHeader icon={<ChevronDown className="w-4 h-4 text-surface-400" />} title="Package Selection" />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Role */}
          <SelectField
            label="Role"
            placeholder={rolesLoading ? 'Loading…' : 'Select Role'}
            disabled={rolesLoading}
            value={selectedRole?.code ?? ''}
            onChange={code => setSelectedRole(roles.find(r => r.code === code) ?? null)}
            options={roles.map(r => ({ value: r.code, label: `${r.code} — ${r.label}` }))}
          />

          {/* Story — linked 1:1 to Role in current data model */}
          <div>
            <label className="block text-xs font-medium text-surface-400 mb-1.5">Story</label>
            <div className={[
              'w-full bg-surface-900 border rounded-lg px-3 py-2.5 text-sm',
              selectedRole
                ? 'border-primary-600/40 text-surface-300'
                : 'border-surface-800 text-surface-600',
            ].join(' ')}>
              {selectedRole
                ? `${selectedRole.code} — ${selectedRole.label}`
                : <span className="text-surface-600">Select Role first</span>
              }
            </div>
          </div>

          {/* Scenario */}
          <SelectField
            label="Scenario"
            placeholder={!selectedRole ? 'Select Role first' : scenariosLoading ? 'Loading…' : 'Select Scenario'}
            disabled={!selectedRole || scenariosLoading}
            value={selectedScenario?.code ?? ''}
            onChange={code => setSelectedScenario(scenarios.find(s => s.code === code) ?? null)}
            options={scenarios.map(s => ({ value: s.code, label: `${s.code} — ${s.label}` }))}
          />

          {/* Package */}
          <SelectField
            label="Package"
            placeholder={!selectedScenario ? 'Select Scenario first' : packagesLoading ? 'Loading…' : 'Select Package'}
            disabled={!selectedScenario || packagesLoading}
            value={selectedPkg?.package_code ?? ''}
            onChange={code => setSelectedPkg(packages.find(p => p.package_code === code) ?? null)}
            options={packages.map(p => ({ value: p.package_code, label: `${p.package_code} — ${p.label}` }))}
          />
        </div>

        {/* Selection path */}
        {allSelected && (
          <div className="pt-2.5 border-t border-surface-800 flex flex-wrap items-center gap-x-2 gap-y-1">
            <PathCrumb label="Role"     value={selectedRole!.code} />
            <span className="text-surface-700 text-xs">›</span>
            <PathCrumb label="Story"    value={selectedRole!.code} />
            <span className="text-surface-700 text-xs">›</span>
            <PathCrumb label="Scenario" value={selectedScenario!.code} />
            <span className="text-surface-700 text-xs">›</span>
            <PathCrumb label="Package"  value={selectedPkg!.package_code} />
          </div>
        )}
      </div>

      {/* Blueprint loading */}
      {allSelected && blueprintLoading && (
        <div className="flex items-center justify-center py-10 gap-2 text-surface-500 text-sm">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading blueprints…
        </div>
      )}

      {/* Dialogue Editor — rendered independently as soon as a package is selected */}
      {allSelected && (
        <DialogueEditorSection
          dialoguePackage={dialoguePackage}
          loading={dialogueLoading}
          onSave={handleDialogueSave}
        />
      )}

      {/* Blueprints + Preview + Generate */}
      {blueprintsReady && (
        <>
          {/* Blueprint grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <RoleBlueprintPanel role={selectedRole!} roleDef={roleDef!} />
            <StoryBlueprintPanel role={selectedRole!} roleDef={roleDef!} />
            <ScenarioBlueprintPanel scenario={selectedScenario!} />
            <PackageBlueprintPanel pkg={pkgBlueprint!} />
          </div>

          {/* Generation Summary */}
          <GenerationSummary
            role={selectedRole!}
            roleDef={roleDef!}
            scenario={selectedScenario!}
            pkg={pkgBlueprint!}
          />

          {/* Missing fields warning */}
          {validation && !validation.valid && (
            <div className="bg-warning-500/5 border border-warning-500/20 rounded-lg px-4 py-3 space-y-2">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-warning-400 flex-shrink-0" />
                <p className="text-sm font-medium text-warning-300">
                  {validation.missing.length} required {validation.missing.length === 1 ? 'field' : 'fields'} are empty
                </p>
              </div>
              <p className="text-xs text-warning-500/80 pl-6">
                The Generate button is disabled until all fields are filled. Update the database values to unlock generation.
              </p>
              <ul className="pl-6 space-y-0.5">
                {validation.missing.map(field => (
                  <li key={field} className="text-xs text-warning-400 font-mono">· {field}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Generation Preview */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-surface-800">
              <SectionHeader icon={<FileText className="w-4 h-4 text-surface-400" />} title="Generation Preview" />
              <span className="text-[10px] font-mono text-surface-600 bg-surface-900 border border-surface-800 px-1.5 py-0.5 rounded">
                Final Prompt · Read-only
              </span>
            </div>
            {validation && !validation.valid ? (
              <p className="text-xs text-surface-600 italic py-2">
                Preview unavailable — fill all required fields above to see the assembled prompt.
              </p>
            ) : (
              <>
                <p className="text-[11px] text-surface-500 leading-relaxed">
                  Exact prompt sent to RunPod. All sections are configured and ready to generate.
                </p>
                <pre className="bg-surface-950 border border-surface-800 rounded-lg px-4 py-4 text-[11px] text-surface-400 font-mono leading-relaxed overflow-x-auto whitespace-pre-wrap max-h-[520px] overflow-y-auto">
                  {promptText}
                </pre>
              </>
            )}
          </div>

          {/* Generate button */}
          <div className="flex justify-end gap-3 items-center">
            {generateError && (
              <p className="text-sm text-danger-400 flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                {generateError}
              </p>
            )}
            <button
              onClick={handleGenerate}
              disabled={!canGenerate}
              title={!validation?.valid ? 'Fill all required blueprint fields to enable generation' : undefined}
              className={[
                'flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors',
                !canGenerate
                  ? 'bg-primary-600/10 border border-primary-600/20 text-primary-500/50 cursor-not-allowed'
                  : 'bg-primary-600 hover:bg-primary-700 text-white border border-primary-700 cursor-pointer',
              ].join(' ')}
            >
              {generating ? (
                <><Loader2 className="w-4 h-4 animate-spin" />Generating…</>
              ) : (
                <><Zap className="w-4 h-4" />Generate Package</>
              )}
            </button>
          </div>

          {/* RunPod Test Output */}
          {(runpodResult || generating) && (
            <RunpodTestOutput result={runpodResult} loading={generating} />
          )}
        </>
      )}
    </div>
  );
}

// ── Generation Summary ────────────────────────────────────────────────────────

function GenerationSummary({
  role, roleDef, scenario, pkg,
}: {
  role: RoleOption;
  roleDef: RoleDefinition;
  scenario: ScenarioOption;
  pkg: PackageBlueprint;
}) {
  const items: { label: string; value: string; mono?: boolean }[] = [
    { label: 'ROLE',           value: `${role.code} — ${role.label}`, mono: true },
    { label: 'TARGET',         value: roleDef.target_audience || '—' },
    { label: 'TYPE',           value: roleDef.generation_type || '—' },
    { label: 'STORY',          value: roleDef.story_name || '—' },
    { label: 'SCENARIO',       value: `${scenario.code} — ${scenario.label}`, mono: true },
    { label: 'PACKAGE',        value: `${pkg.code} — ${pkg.label}`, mono: true },
    { label: 'EMOTION',        value: pkg.emotion || '—' },
    { label: 'WORD COUNT',     value: pkg.word_count_range || '—' },
  ];

  return (
    <div className="card space-y-3">
      <SectionHeader icon={<BarChart2 className="w-4 h-4 text-accent-400" />} title="Generation Summary" />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
        {items.map(({ label, value, mono }) => (
          <div key={label} className="bg-surface-900 border border-surface-800 rounded-lg px-3 py-2.5">
            <p className="text-[9px] font-semibold tracking-wider text-surface-600 uppercase mb-1">{label}</p>
            <p className={[
              'text-xs leading-snug',
              value === '—' ? 'text-surface-700 italic' : 'text-surface-300',
              mono ? 'font-mono' : '',
            ].join(' ')}>
              {value}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Access restricted screen ──────────────────────────────────────────────────

function AccessRestricted({ email }: { email?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center px-4">
      <div className="w-16 h-16 rounded-full bg-danger-500/10 border border-danger-500/20 flex items-center justify-center mb-5">
        <Lock className="w-7 h-7 text-danger-400" />
      </div>
      <h2 className="text-xl font-semibold text-surface-100 mb-3">Development Access Only</h2>
      <p className="text-sm text-surface-400 max-w-sm leading-relaxed mb-2">
        Package Generation is restricted to the Mother Creator development account.
      </p>
      {email && (
        <p className="text-xs text-surface-600 font-mono">{email}</p>
      )}
    </div>
  );
}

// ── RunPod Test Output ────────────────────────────────────────────────────────

function RunpodTestOutput({ result, loading }: { result: RunpodResult | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="card space-y-3">
        <SectionHeader icon={<Zap className="w-4 h-4 text-warning-400" />} title="RunPod Test Output" />
        <div className="flex items-center gap-2 text-surface-500 text-sm py-4">
          <Loader2 className="w-4 h-4 animate-spin" />
          Waiting for RunPod response…
        </div>
      </div>
    );
  }
  if (!result) return null;

  const isSuccess = result.status === 'success';

  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-surface-800">
        <SectionHeader icon={<Zap className="w-4 h-4 text-warning-400" />} title="RunPod Test Output" />
        <span className="text-[10px] text-surface-600 bg-surface-900 border border-surface-800 px-1.5 py-0.5 rounded font-mono">
          Temporary · Not saved
        </span>
      </div>

      {/* Status row */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5">
          {isSuccess
            ? <CheckCircle className="w-4 h-4 text-success-400" />
            : <XCircle className="w-4 h-4 text-danger-400" />
          }
          <span className={`text-sm font-medium ${isSuccess ? 'text-success-400' : 'text-danger-400'}`}>
            Generation {isSuccess ? 'Successful' : 'Failed'}
          </span>
        </div>

        <div className="flex items-center gap-1.5 text-surface-500 text-xs">
          <Clock className="w-3.5 h-3.5" />
          {result.generation_time_ms.toLocaleString()}ms
        </div>

        {result.provider_name && (
          <div className="text-xs text-surface-600">
            Provider: <span className="text-surface-400 font-mono">{result.provider_name}</span>
          </div>
        )}
      </div>

      {/* Error message */}
      {!isSuccess && result.error && (
        <div className="bg-danger-500/5 border border-danger-500/20 rounded-lg px-3 py-2.5">
          <p className="text-xs text-danger-400 leading-relaxed">{result.error}</p>
        </div>
      )}

      {/* Returned dialogue */}
      {isSuccess && result.output && (
        <div>
          <p className="text-[10px] font-medium text-surface-600 uppercase tracking-wide mb-2">Returned Dialogue</p>
          <pre className="bg-surface-950 border border-surface-800 rounded-lg px-4 py-4 text-xs text-surface-300 font-mono leading-relaxed whitespace-pre-wrap overflow-x-auto max-h-[400px] overflow-y-auto">
            {result.output}
          </pre>
        </div>
      )}

      <p className="text-[10px] text-surface-700 italic pt-1 border-t border-surface-800">
        This output is temporary. It has not been saved to the Dialogue Library. Chat is unaffected.
      </p>
    </div>
  );
}

// ── Shared UI atoms ───────────────────────────────────────────────────────────

function SectionHeader({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      {icon}
      <h2 className="text-sm font-semibold text-surface-200">{title}</h2>
    </div>
  );
}

function PathCrumb({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-surface-600">{label}:</span>
      <span className="text-[11px] font-mono text-accent-400">{value}</span>
    </div>
  );
}

function SelectField({ label, placeholder, disabled, value, onChange, options }: {
  label: string;
  placeholder: string;
  disabled: boolean;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-surface-400 mb-1.5">{label}</label>
      <div className="relative">
        <select
          disabled={disabled}
          value={value}
          onChange={e => onChange(e.target.value)}
          className={[
            'w-full appearance-none bg-surface-900 border rounded-lg px-3 py-2.5 text-sm pr-8',
            'focus:outline-none focus:ring-1 focus:ring-primary-500/50 transition-colors',
            disabled
              ? 'border-surface-800 text-surface-600 cursor-not-allowed'
              : value
                ? 'border-primary-600/40 text-surface-200 cursor-pointer hover:border-primary-600/60'
                : 'border-surface-700 text-surface-500 cursor-pointer hover:border-surface-600',
          ].join(' ')}
        >
          <option value="">{placeholder}</option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-surface-600 pointer-events-none" />
      </div>
    </div>
  );
}

// ── Blueprint card shell ──────────────────────────────────────────────────────

function BlueprintCard({ title, icon, code, children }: {
  title: string;
  icon: ReactNode;
  code: string;
  children: ReactNode;
}) {
  return (
    <div className="card space-y-3">
      <div className="flex items-center justify-between pb-2.5 border-b border-surface-800">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="text-sm font-semibold text-surface-200">{title}</h3>
        </div>
        <span className="text-[10px] font-mono text-surface-600 bg-surface-800 border border-surface-700 px-1.5 py-0.5 rounded">
          {code}
        </span>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function BpField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="text-[10px] font-medium text-surface-600 uppercase tracking-wide mb-1">{label}</p>
      {children}
    </div>
  );
}

function BpValue({ text }: { text: string }) {
  if (!text) return <span className="text-[11px] text-surface-700 italic">Not configured</span>;
  return <p className="text-xs text-surface-400 leading-relaxed">{text}</p>;
}

function TagList({ items }: { items: string[] }) {
  if (!items?.length) return <span className="text-[11px] text-surface-700 italic">Not configured</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {items.map((item, i) => (
        <span key={i} className="text-[11px] bg-surface-800 text-surface-400 border border-surface-700/50 px-1.5 py-0.5 rounded">
          {item}
        </span>
      ))}
    </div>
  );
}

// ── Blueprint panels ──────────────────────────────────────────────────────────

function RoleBlueprintPanel({ role, roleDef }: { role: RoleOption; roleDef: RoleDefinition }) {
  return (
    <BlueprintCard
      title="Role Blueprint"
      icon={<BookOpen className="w-4 h-4 text-primary-400" />}
      code={role.code}
    >
      <BpField label="Role">
        <p className="text-xs text-surface-300 font-medium">{role.code} — {role.label}</p>
      </BpField>

      <BpField label="Target Audience">
        <BpValue text={roleDef.target_audience} />
      </BpField>

      <BpField label="Generation Type">
        <BpValue text={roleDef.generation_type} />
      </BpField>

      <BpField label="Role Description">
        <BpValue text={roleDef.description} />
      </BpField>

      <BpField label="Core Personality">
        <TagList items={roleDef.core_characteristics ?? []} />
      </BpField>
    </BlueprintCard>
  );
}

function StoryBlueprintPanel({ role, roleDef }: { role: RoleOption; roleDef: RoleDefinition }) {
  return (
    <BlueprintCard
      title="Story Blueprint"
      icon={<Layers className="w-4 h-4 text-accent-400" />}
      code={role.code}
    >
      <BpField label="Story Name">
        <BpValue text={roleDef.story_name} />
      </BpField>

      <BpField label="Story Goal">
        <BpValue text={roleDef.story_goal} />
      </BpField>

      <BpField label="Current Story">
        <BpValue text={roleDef.current_story} />
      </BpField>
    </BlueprintCard>
  );
}

function ScenarioBlueprintPanel({ scenario }: { scenario: ScenarioOption }) {
  return (
    <BlueprintCard
      title="Scenario Blueprint"
      icon={<MapPin className="w-4 h-4 text-warning-400" />}
      code={scenario.code}
    >
      <BpField label="Scenario Code">
        <p className="text-xs font-mono text-accent-400">{scenario.code}</p>
      </BpField>

      <BpField label="Scenario Name">
        <p className="text-xs text-surface-300 font-medium">{scenario.label}</p>
      </BpField>

      <BpField label="Scene">
        <BpValue text={scenario.scene} />
      </BpField>

      <BpField label="Current Relationship">
        <BpValue text={scenario.current_relationship} />
      </BpField>

      <BpField label="Scenario Goal">
        <BpValue text={scenario.scenario_goal || scenario.description} />
      </BpField>

      <BpField label="Expected Ending">
        <BpValue text={scenario.hint} />
      </BpField>
    </BlueprintCard>
  );
}

function PackageBlueprintPanel({ pkg }: { pkg: PackageBlueprint }) {
  return (
    <BlueprintCard
      title="Package Blueprint"
      icon={<Package2 className="w-4 h-4 text-success-400" />}
      code={pkg.code}
    >
      <BpField label="Package Code">
        <p className="text-xs font-mono text-accent-400">{pkg.code}</p>
      </BpField>

      <BpField label="Package Name">
        <p className="text-xs text-surface-300 font-medium">{pkg.label}</p>
      </BpField>

      <BpField label="Purpose">
        <BpValue text={pkg.purpose} />
      </BpField>

      <BpField label="Scene">
        <BpValue text={pkg.scene} />
      </BpField>

      <BpField label="Current Relationship">
        <BpValue text={pkg.current_relationship} />
      </BpField>

      <BpField label="Emotion">
        <BpValue text={pkg.emotion} />
      </BpField>

      <BpField label="Conversation Goal">
        <BpValue text={pkg.conversation_goal} />
      </BpField>

      <BpField label="Target Outcome">
        <BpValue text={pkg.target_outcome} />
      </BpField>

      <BpField label="Word Count Range">
        <BpValue text={pkg.word_count_range} />
      </BpField>

      <BpField label="Must Include">
        <BpValue text={pkg.must_include} />
      </BpField>

      <BpField label="Must Avoid">
        <BpValue text={pkg.must_avoid} />
      </BpField>
    </BlueprintCard>
  );
}

// ── Dialogue Editor ───────────────────────────────────────────────────────────

function DialogueEditorSection({
  dialoguePackage,
  loading,
  onSave,
}: {
  dialoguePackage: DialoguePackageContent | null;
  loading: boolean;
  onSave: (
    field: 'dialogue_text' | 'dialogue_text_a' | 'dialogue_text_b' | 'dialogue_text_c',
    value: string,
  ) => Promise<void>;
}) {
  if (loading) {
    return (
      <div className="card flex items-center gap-2 text-surface-500 text-sm py-5">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading dialogue content…
      </div>
    );
  }
  if (!dialoguePackage) return null;

  // MT-BEG-001 (sequence 1): single opening dialogue — no branching
  if (dialoguePackage.sequence === 1) {
    return (
      <div className="card space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-surface-800">
          <SectionHeader icon={<MessageSquare className="w-4 h-4 text-surface-400" />} title="Dialogue Editor" />
          <span className="text-[10px] font-mono text-surface-600 bg-surface-900 border border-surface-800 px-1.5 py-0.5 rounded">
            Opening Dialogue · No Branching
          </span>
        </div>
        <DialogueVariantCard
          variantCode={dialoguePackage.package_code}
          variantLabel="Opening Dialogue"
          text={dialoguePackage.dialogue_text}
          onSave={v => onSave('dialogue_text', v)}
        />
      </div>
    );
  }

  // MT-BEG-002+: three branching dialogue variants
  return (
    <div className="card space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-surface-800">
        <SectionHeader icon={<MessageSquare className="w-4 h-4 text-accent-400" />} title="Dialogue Editor" />
        <span className="text-[10px] font-mono text-accent-500/70 bg-accent-500/5 border border-accent-500/20 px-1.5 py-0.5 rounded">
          3 Branching Variants
        </span>
      </div>
      <p className="text-[11px] text-surface-600 leading-relaxed -mt-1">
        Each variant is triggered by the corresponding client response from the previous package.
        Edit and save each dialogue independently.
      </p>
      <div className="space-y-0">
        <DialogueVariantCard
          variantCode={dialoguePackage.package_code + 'A'}
          variantLabel="Dialogue A"
          text={dialoguePackage.dialogue_text_a}
          onSave={v => onSave('dialogue_text_a', v)}
        />
        <div className="border-t border-surface-800/60 my-4" />
        <DialogueVariantCard
          variantCode={dialoguePackage.package_code + 'B'}
          variantLabel="Dialogue B"
          text={dialoguePackage.dialogue_text_b}
          onSave={v => onSave('dialogue_text_b', v)}
        />
        <div className="border-t border-surface-800/60 my-4" />
        <DialogueVariantCard
          variantCode={dialoguePackage.package_code + 'C'}
          variantLabel="Dialogue C"
          text={dialoguePackage.dialogue_text_c}
          onSave={v => onSave('dialogue_text_c', v)}
        />
      </div>
    </div>
  );
}

function DialogueVariantCard({
  variantCode,
  variantLabel,
  text,
  onSave,
}: {
  variantCode: string;
  variantLabel: string;
  text: string;
  onSave: (value: string) => Promise<void>;
}) {
  const [editing,   setEditing]   = useState(false);
  const [draft,     setDraft]     = useState(text);
  const [saving,    setSaving]    = useState(false);
  const [saved,     setSaved]     = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Reset UI when switching to a different variant/package
  useEffect(() => {
    setEditing(false);
    setSaved(false);
    setSaveError(null);
  }, [variantCode]);

  // Sync draft when parent text changes
  useEffect(() => {
    setDraft(text);
  }, [text]);

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      await onSave(draft);
      setSaved(true);
      setEditing(false);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setSaveError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function handleCancel() {
    setEditing(false);
    setDraft(text);
    setSaveError(null);
  }

  return (
    <div className="space-y-2">
      {/* Header row */}
      <div className="flex items-center justify-between min-h-[28px]">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-surface-300">{variantLabel}</span>
          <span className="text-[10px] font-mono bg-surface-800 border border-surface-700 text-accent-400 px-1.5 py-0.5 rounded tracking-wide">
            {variantCode}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {saved && (
            <div className="flex items-center gap-1 text-success-400 text-xs">
              <CheckCircle className="w-3.5 h-3.5" />
              Saved
            </div>
          )}
          {saveError && (
            <span className="text-xs text-danger-400 max-w-[200px] truncate" title={saveError}>
              {saveError}
            </span>
          )}
          {editing ? (
            <>
              <button
                onClick={handleCancel}
                className="text-xs text-surface-500 hover:text-surface-300 transition-colors px-2 py-1 rounded"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-xs font-medium text-white bg-primary-600 hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed px-2.5 py-1 rounded transition-colors"
              >
                {saving
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <Save className="w-3 h-3" />
                }
                Save
              </button>
            </>
          ) : (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs text-surface-500 hover:text-surface-200 hover:bg-surface-800 transition-colors px-2 py-1 rounded"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      {editing ? (
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          rows={4}
          autoFocus
          className="w-full bg-surface-900 border border-primary-600/40 rounded-lg px-3 py-2.5 text-xs text-surface-200 leading-relaxed resize-y focus:outline-none focus:ring-1 focus:ring-primary-500/50 transition-colors"
        />
      ) : (
        <div className="text-xs text-surface-400 leading-relaxed bg-surface-900/50 border border-surface-800 rounded-lg px-3 py-2.5 min-h-[3.5rem] whitespace-pre-wrap">
          {draft || <span className="text-surface-700 italic">No dialogue authored yet.</span>}
        </div>
      )}
    </div>
  );
}
