import { useState, useEffect, useMemo } from 'react';
import {
  BoxSelect, Users, ChevronDown, ChevronRight,
  GitBranch, Package2, ArrowRight, ArrowLeft,
  Loader2, AlertCircle, Clock, MessageSquare, Eye,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScenarioRow {
  code:        string;
  role_code:   string;
  label:       string;
  description: string;
  hint:        string;
  sort_order:  number;
  is_active:   boolean;
  updated_at:  string;
}

interface BranchEdge {
  from_scenario_code: string;
  to_scenario_code:   string;
  label:              string | null;
  sort_order:         number;
}

interface PkgLink {
  scenario_code: string;
  package_code:  string;
  package_role:  'main' | 'final';
  sort_order:    number;
  pkg_label:     string;
}

interface ReplyOption {
  sort_order:        number;
  display_text:      string;
  next_package_code: string | null;
}

interface SeqRow {
  id:                string;
  package_code:      string;
  sequence:          number;
  stage:             string;
  status:            string;
  dialogue_text:     string;
  emotion:           string;
  camera_angle:      string;
  scene_context:     string;
  generation_status: string;
  replies:           ReplyOption[];
}

interface Props {
  onViewPackage?: (packageCode: string) => void;
}

// ── ScenarioLibrary ───────────────────────────────────────────────────────────

export default function ScenarioLibrary({ onViewPackage }: Props) {
  const [scenarios,     setScenarios]     = useState<ScenarioRow[]>([]);
  const [branches,      setBranches]      = useState<BranchEdge[]>([]);
  const [pkgLinks,      setPkgLinks]      = useState<PkgLink[]>([]);
  const [roleLabels,    setRoleLabels]    = useState<Record<string, string>>({});
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set());
  const [expandedPkgs,  setExpandedPkgs]  = useState<Set<string>>(new Set());
  const [pkgContent,    setPkgContent]    = useState<Record<string, SeqRow[]>>({});
  const [pkgLoading,    setPkgLoading]    = useState<Record<string, boolean>>({});
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const [scRes, brRes, pkRes, rlRes] = await Promise.all([
          supabase
            .from('engine_scenario_registry')
            .select('code, role_code, label, description, hint, sort_order, is_active, updated_at')
            .order('role_code')
            .order('sort_order'),
          supabase
            .from('engine_scenario_branches')
            .select('from_scenario_code, to_scenario_code, label, sort_order')
            .order('from_scenario_code')
            .order('sort_order'),
          supabase
            .from('engine_scenario_packages')
            .select('scenario_code, package_code, package_role, sort_order, pkg_data:engine_package_registry!package_code(label)')
            .order('scenario_code')
            .order('sort_order'),
          supabase
            .from('engine_package_registry')
            .select('code, label')
            .eq('package_type', 'role'),
        ]);

        if (scRes.error) throw scRes.error;

        setScenarios((scRes.data ?? []) as ScenarioRow[]);
        setBranches((brRes.data ?? []) as BranchEdge[]);

        const links: PkgLink[] = ((pkRes.data ?? []) as unknown as {
          scenario_code: string;
          package_code:  string;
          package_role:  'main' | 'final';
          sort_order:    number;
          pkg_data:      { label: string } | null;
        }[]).map(row => ({
          scenario_code: row.scenario_code,
          package_code:  row.package_code,
          package_role:  row.package_role,
          sort_order:    row.sort_order,
          pkg_label:     row.pkg_data?.label ?? row.package_code,
        }));
        setPkgLinks(links);

        const rlMap: Record<string, string> = {};
        for (const r of (rlRes.data ?? [])) rlMap[r.code] = r.label;
        setRoleLabels(rlMap);

      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // ── Derived lookup maps ───────────────────────────────────────────────────

  const pkgsByScenario = useMemo(() => {
    const m: Record<string, PkgLink[]> = {};
    for (const l of pkgLinks) (m[l.scenario_code] ??= []).push(l);
    return m;
  }, [pkgLinks]);

  const outgoingByScenario = useMemo(() => {
    const m: Record<string, BranchEdge[]> = {};
    for (const b of branches) (m[b.from_scenario_code] ??= []).push(b);
    return m;
  }, [branches]);

  const incomingByScenario = useMemo(() => {
    const m: Record<string, BranchEdge[]> = {};
    for (const b of branches) (m[b.to_scenario_code] ??= []).push(b);
    return m;
  }, [branches]);

  const scenarioByCode = useMemo(() => {
    const m: Record<string, ScenarioRow> = {};
    for (const s of scenarios) m[s.code] = s;
    return m;
  }, [scenarios]);

  const roleGroups = useMemo(() => {
    const m: Record<string, ScenarioRow[]> = {};
    for (const s of scenarios) (m[s.role_code] ??= []).push(s);
    return m;
  }, [scenarios]);

  function toggleScenario(code: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      return next;
    });
  }

  function togglePackage(key: string, packageCode: string) {
    setExpandedPkgs(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        loadPackageContent(packageCode);
      }
      return next;
    });
  }

  async function loadPackageContent(packageCode: string) {
    if (pkgContent[packageCode] !== undefined) return;
    setPkgLoading(prev => ({ ...prev, [packageCode]: true }));

    const [seqRes, replyRes] = await Promise.all([
      supabase
        .from('dialogue_packages')
        .select('id, package_code, sequence, stage, status, dialogue_text, emotion, camera_angle, scene_context, generation_status')
        .eq('package_code', packageCode)
        .eq('is_system', true)
        .order('sequence'),
      supabase
        .from('dialogue_package_responses')
        .select('package_code, sort_order, display_text, next_package_code')
        .eq('package_code', packageCode)
        .order('sort_order'),
    ]);

    const replyMap: Record<string, ReplyOption[]> = {};
    for (const r of (replyRes.data ?? [])) {
      (replyMap[r.package_code] ??= []).push({
        sort_order:        r.sort_order,
        display_text:      r.display_text,
        next_package_code: r.next_package_code,
      });
    }

    const rows: SeqRow[] = ((seqRes.data ?? []) as Omit<SeqRow, 'replies'>[]).map(s => ({
      ...s,
      replies: replyMap[s.package_code] ?? [],
    }));

    setPkgContent(prev => ({ ...prev, [packageCode]: rows }));
    setPkgLoading(prev => ({ ...prev, [packageCode]: false }));
  }

  // ── Loading / error / empty states ───────────────────────────────────────

  if (loading) {
    return (
      <div className="card space-y-4">
        <SectionHeader />
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-5 h-5 animate-spin text-surface-500" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card space-y-4">
        <SectionHeader />
        <div className="flex items-center gap-2 text-danger-400 text-sm py-4">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      </div>
    );
  }

  if (scenarios.length === 0) {
    return (
      <div className="card space-y-4">
        <SectionHeader />
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Clock className="w-8 h-8 text-surface-600 mb-3" />
          <p className="text-sm text-surface-500">No scenarios configured yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      <SectionHeader />

      <div className="text-[11px] text-surface-500 leading-relaxed bg-surface-900 border border-surface-800 rounded-lg px-3 py-2">
        <span className="text-surface-400 font-medium">Architecture: </span>
        Role → Scenario → Dialogue Packages → Dialogue Content.
        Expand a scenario to see its packages. Expand a package to see its full dialogue content and reply options.
      </div>

      <div className="space-y-3">
        {Object.entries(roleGroups).map(([roleCode, roleScenarios]) => (
          <RoleGroup
            key={roleCode}
            roleCode={roleCode}
            roleLabel={roleLabels[roleCode]}
            scenarios={roleScenarios}
            expanded={expanded}
            expandedPkgs={expandedPkgs}
            pkgsByScenario={pkgsByScenario}
            pkgContent={pkgContent}
            pkgLoading={pkgLoading}
            outgoingByScenario={outgoingByScenario}
            incomingByScenario={incomingByScenario}
            scenarioByCode={scenarioByCode}
            onToggleScenario={toggleScenario}
            onTogglePackage={togglePackage}
            onViewPackage={onViewPackage}
          />
        ))}
      </div>
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader() {
  return (
    <div className="flex items-center gap-2 pb-3 border-b border-surface-800">
      <BoxSelect className="w-4 h-4 text-surface-400" />
      <h3 className="text-sm font-semibold text-surface-200">Scenario Library</h3>
    </div>
  );
}

// ── Role group ────────────────────────────────────────────────────────────────

function RoleGroup({
  roleCode, roleLabel, scenarios, expanded, expandedPkgs,
  pkgsByScenario, pkgContent, pkgLoading,
  outgoingByScenario, incomingByScenario, scenarioByCode,
  onToggleScenario, onTogglePackage, onViewPackage,
}: {
  roleCode:           string;
  roleLabel:          string | undefined;
  scenarios:          ScenarioRow[];
  expanded:           Set<string>;
  expandedPkgs:       Set<string>;
  pkgsByScenario:     Record<string, PkgLink[]>;
  pkgContent:         Record<string, SeqRow[]>;
  pkgLoading:         Record<string, boolean>;
  outgoingByScenario: Record<string, BranchEdge[]>;
  incomingByScenario: Record<string, BranchEdge[]>;
  scenarioByCode:     Record<string, ScenarioRow>;
  onToggleScenario:   (code: string) => void;
  onTogglePackage:    (key: string, packageCode: string) => void;
  onViewPackage:      ((code: string) => void) | undefined;
}) {
  return (
    <div className="border border-surface-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-900/60 border-b border-surface-800">
        <Users className="w-3.5 h-3.5 text-primary-400 flex-shrink-0" />
        <span className="text-sm font-semibold text-surface-200 flex-1">{roleLabel ?? roleCode}</span>
        <span className="text-[10px] font-mono text-surface-600">{roleCode}</span>
        <span className="text-[10px] text-surface-600">
          {scenarios.length} scenario{scenarios.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="divide-y divide-surface-800/40">
        {scenarios.map(sc => (
          <ScenarioCard
            key={sc.code}
            scenario={sc}
            isOpen={expanded.has(sc.code)}
            expandedPkgs={expandedPkgs}
            pkgs={pkgsByScenario[sc.code] ?? []}
            pkgContent={pkgContent}
            pkgLoading={pkgLoading}
            outEdges={outgoingByScenario[sc.code] ?? []}
            inEdges={incomingByScenario[sc.code] ?? []}
            scenarioByCode={scenarioByCode}
            onToggle={onToggleScenario}
            onTogglePackage={onTogglePackage}
            onViewPackage={onViewPackage}
          />
        ))}
      </div>
    </div>
  );
}

// ── Scenario card ─────────────────────────────────────────────────────────────

function ScenarioCard({
  scenario, isOpen, expandedPkgs, pkgs, pkgContent, pkgLoading,
  outEdges, inEdges, scenarioByCode, onToggle, onTogglePackage, onViewPackage,
}: {
  scenario:        ScenarioRow;
  isOpen:          boolean;
  expandedPkgs:    Set<string>;
  pkgs:            PkgLink[];
  pkgContent:      Record<string, SeqRow[]>;
  pkgLoading:      Record<string, boolean>;
  outEdges:        BranchEdge[];
  inEdges:         BranchEdge[];
  scenarioByCode:  Record<string, ScenarioRow>;
  onToggle:        (code: string) => void;
  onTogglePackage: (key: string, packageCode: string) => void;
  onViewPackage:   ((code: string) => void) | undefined;
}) {
  const isSharedMerge = inEdges.length > 1;

  return (
    <div>
      <button
        onClick={() => onToggle(scenario.code)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-surface-800/30 transition-colors text-left"
      >
        <span className="flex-shrink-0 text-surface-600">
          {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
        </span>

        <span className="text-[11px] font-mono text-accent-400 w-[88px] flex-shrink-0">
          {scenario.code}
        </span>

        <span className="text-sm text-surface-200 flex-1 min-w-0 truncate">
          {scenario.label}
        </span>

        <div className="hidden sm:flex items-center gap-3 flex-shrink-0 text-surface-600">
          {inEdges.length > 0 && (
            <span className="flex items-center gap-1 text-[10px]" title={`Reached from ${inEdges.length} scenario${inEdges.length !== 1 ? 's' : ''}`}>
              <ArrowLeft className="w-3 h-3" />{inEdges.length}
            </span>
          )}
          {outEdges.length > 0 && (
            <span className="flex items-center gap-1 text-[10px]" title={`Branches to ${outEdges.length} scenario${outEdges.length !== 1 ? 's' : ''}`}>
              <GitBranch className="w-3 h-3" />{outEdges.length}
            </span>
          )}
          <span className="flex items-center gap-1 text-[10px]" title="Dialogue packages">
            <Package2 className="w-3 h-3" />{pkgs.length}
          </span>
        </div>

        <span className={[
          'text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0',
          scenario.is_active
            ? 'bg-success-500/10 text-success-400 border-success-500/20'
            : 'bg-surface-700/50 text-surface-500 border-surface-700',
        ].join(' ')}>
          {scenario.is_active ? 'Active' : 'Inactive'}
        </span>

        {isSharedMerge && (
          <span className="hidden sm:inline text-[10px] font-medium px-1.5 py-0.5 rounded border bg-primary-500/10 text-primary-400 border-primary-500/20 flex-shrink-0">
            Merge
          </span>
        )}
      </button>

      {isOpen && (
        <div className="border-t border-surface-800/40 bg-surface-950/20 px-5 py-5 space-y-5">
          <p className="text-xs text-surface-400 leading-relaxed">{scenario.description}</p>

          <BranchSection
            title="Reached from"
            icon={<ArrowLeft className="w-3 h-3 text-surface-600" />}
            count={inEdges.length}
            empty={<span className="text-xs text-surface-600 italic pl-1">Entry point — not preceded by any scenario.</span>}
          >
            {inEdges.map((edge, i) => {
              const src = scenarioByCode[edge.from_scenario_code];
              return (
                <BranchRow
                  key={edge.from_scenario_code}
                  isLast={i === inEdges.length - 1}
                  code={edge.from_scenario_code}
                  label={src?.label}
                  sublabel={edge.label ?? undefined}
                />
              );
            })}
            {isSharedMerge && (
              <p className="text-[10px] text-primary-500 italic pl-5 mt-1">
                Shared merge point — reached from multiple scenarios.
              </p>
            )}
          </BranchSection>

          {/* Dialogue Packages */}
          <div>
            <SubLabel icon={<Package2 className="w-3 h-3 text-surface-600" />} count={pkgs.length}>
              Dialogue Packages
            </SubLabel>
            {pkgs.length === 0 ? (
              <p className="text-xs text-surface-600 italic pl-1 mt-2">No packages linked yet.</p>
            ) : (
              <div className="space-y-1.5 mt-2">
                {pkgs.map(lp => {
                  const pkgKey  = `${scenario.code}::${lp.package_code}`;
                  const isPkgOpen = expandedPkgs.has(pkgKey);
                  return (
                    <PackageRow
                      key={lp.package_code}
                      link={lp}
                      pkgKey={pkgKey}
                      isOpen={isPkgOpen}
                      content={pkgContent[lp.package_code]}
                      isLoading={pkgLoading[lp.package_code] ?? false}
                      onToggle={onTogglePackage}
                      onView={onViewPackage}
                    />
                  );
                })}
              </div>
            )}
          </div>

          <BranchSection
            title="Branches to"
            icon={<GitBranch className="w-3 h-3 text-surface-600" />}
            count={outEdges.length}
            empty={null}
          >
            {outEdges.map((edge, i) => {
              const target = scenarioByCode[edge.to_scenario_code];
              return (
                <BranchRow
                  key={edge.to_scenario_code}
                  isLast={i === outEdges.length - 1}
                  code={edge.to_scenario_code}
                  label={target?.label}
                  sublabel={edge.label ?? undefined}
                />
              );
            })}
          </BranchSection>

          {scenario.hint && (
            <div className="border border-surface-800 rounded-lg px-3 py-2.5 bg-surface-900/50">
              <p className="text-[11px] font-medium text-surface-600 mb-1.5">Ending Hint</p>
              <p className="text-xs text-surface-400 italic leading-relaxed">"{scenario.hint}"</p>
            </div>
          )}

          <div className="flex items-center gap-3 pt-1 border-t border-surface-800/40 text-[10px] text-surface-700">
            <span className="font-mono">{scenario.code}</span>
            <span>·</span>
            <span>Updated {new Date(scenario.updated_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}</span>
            <span>·</span>
            <span>{pkgs.length} package{pkgs.length !== 1 ? 's' : ''}</span>
            {outEdges.length > 0 && <><span>·</span><span>{outEdges.length} branch{outEdges.length !== 1 ? 'es' : ''}</span></>}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Package row (expandable) ──────────────────────────────────────────────────

function PackageRow({
  link, pkgKey, isOpen, content, isLoading, onToggle, onView,
}: {
  link:      PkgLink;
  pkgKey:    string;
  isOpen:    boolean;
  content:   SeqRow[] | undefined;
  isLoading: boolean;
  onToggle:  (key: string, packageCode: string) => void;
  onView?:   (code: string) => void;
}) {
  return (
    <div className="border border-surface-800/60 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 hover:bg-surface-800/20 transition-colors group">
        <button
          onClick={() => onToggle(pkgKey, link.package_code)}
          className="flex items-center gap-2 flex-1 min-w-0 text-left"
        >
          <span className="flex-shrink-0 text-surface-600">
            {isOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </span>
          <span className="text-[11px] font-mono text-surface-400 w-24 flex-shrink-0">
            {link.package_code}
          </span>
          <span className="text-xs text-surface-400 flex-1 truncate min-w-0">
            {link.pkg_label}
          </span>
        </button>

        <span className={[
          'text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0',
          link.package_role === 'main'
            ? 'bg-accent-500/8 text-accent-400 border-accent-500/20'
            : 'bg-success-500/8 text-success-400 border-success-500/20',
        ].join(' ')}>
          {link.package_role}
        </span>

        {onView && (
          <button
            onClick={() => onView(link.package_code)}
            className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 text-[10px] text-primary-400 hover:text-primary-300 flex-shrink-0"
          >
            Edit <ArrowRight className="w-2.5 h-2.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="border-t border-surface-800/40 bg-surface-950/40">
          {isLoading ? (
            <div className="flex items-center gap-2 px-4 py-3">
              <Loader2 className="w-3 h-3 animate-spin text-surface-600" />
              <span className="text-[11px] text-surface-600">Loading…</span>
            </div>
          ) : !content || content.length === 0 ? (
            <p className="text-[11px] text-surface-600 italic px-4 py-3">No dialogue content found.</p>
          ) : (
            <div className="divide-y divide-surface-800/30">
              {content.map(seq => <DialogueContent key={seq.id} seq={seq} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Dialogue content (expanded package detail) ────────────────────────────────

function DialogueContent({ seq }: { seq: SeqRow }) {
  const genColor =
    seq.generation_status === 'generated' ? 'text-success-400 border-success-500/20 bg-success-500/10' :
    seq.generation_status === 'pending'    ? 'text-warning-400 border-warning-500/20 bg-warning-500/10' :
    seq.generation_status === 'error'      ? 'text-danger-400 border-danger-500/20 bg-danger-500/10'   :
                                             'text-surface-500 border-surface-700 bg-surface-800/50';

  const statusColor =
    seq.status === 'active'  ? 'text-success-400 border-success-500/20 bg-success-500/10' :
    seq.status === 'draft'   ? 'text-surface-500 border-surface-700 bg-surface-700/50'    :
    seq.status === 'review'  ? 'text-warning-400 border-warning-500/20 bg-warning-500/10' :
                               'text-surface-600 border-surface-800 bg-surface-900';

  return (
    <div className="px-4 py-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-mono text-surface-600 bg-surface-900 border border-surface-800 px-1.5 py-0.5 rounded">
          seq {seq.sequence}
        </span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${statusColor}`}>
          {seq.status}
        </span>
        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${genColor}`}>
          {seq.generation_status}
        </span>
        <span className="text-[10px] text-surface-600 italic">{seq.emotion}</span>
        <span className="text-[10px] text-surface-700">·</span>
        <span className="text-[10px] text-surface-600 italic">{seq.camera_angle}</span>
      </div>

      {/* Scene context */}
      {seq.scene_context && (
        <div className="flex items-start gap-1.5">
          <Eye className="w-3 h-3 text-surface-700 flex-shrink-0 mt-0.5" />
          <p className="text-[10px] text-surface-600 italic leading-relaxed">{seq.scene_context}</p>
        </div>
      )}

      {/* Dialogue text */}
      <div className="flex items-start gap-1.5">
        <MessageSquare className="w-3 h-3 text-surface-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-surface-300 leading-relaxed">{seq.dialogue_text}</p>
      </div>

      {/* Reply options */}
      {seq.replies.length > 0 && (
        <div className="space-y-1 pl-4 border-l-2 border-surface-800">
          {seq.replies.map(r => (
            <div key={r.sort_order} className="flex items-center gap-2">
              <span className="text-[10px] text-surface-600 w-3 flex-shrink-0">{r.sort_order}.</span>
              <span className="text-[11px] text-surface-400 flex-1 min-w-0">{r.display_text}</span>
              {r.next_package_code && (
                <span className="text-[10px] font-mono text-accent-500 flex-shrink-0 flex items-center gap-1">
                  <ArrowRight className="w-2.5 h-2.5" />
                  {r.next_package_code}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Branch section ────────────────────────────────────────────────────────────

function BranchSection({
  title, icon, count, empty, children,
}: {
  title:    string;
  icon:     React.ReactNode;
  count:    number;
  empty:    React.ReactNode;
  children: React.ReactNode;
}) {
  if (count === 0 && empty === null) return null;
  return (
    <div>
      <SubLabel icon={icon} count={count}>{title}</SubLabel>
      <div className="mt-2">{count === 0 ? empty : children}</div>
    </div>
  );
}

// ── Branch row ────────────────────────────────────────────────────────────────

function BranchRow({
  isLast, code, label, sublabel,
}: {
  isLast:   boolean;
  code:     string;
  label:    string | undefined;
  sublabel: string | undefined;
}) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-surface-700 font-mono text-[11px] flex-shrink-0 w-5 select-none">
        {isLast ? '└─' : '├─'}
      </span>
      <span className="text-[11px] font-mono text-accent-400 w-[88px] flex-shrink-0">{code}</span>
      <span className="text-xs text-surface-400 flex-1 truncate min-w-0">{label ?? code}</span>
      {sublabel && (
        <span className="text-[10px] text-surface-600 italic flex-shrink-0 hidden sm:inline">
          {sublabel}
        </span>
      )}
    </div>
  );
}

// ── Sub-label ─────────────────────────────────────────────────────────────────

function SubLabel({ icon, count, children }: {
  icon:     React.ReactNode;
  count:    number;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5">
      {icon}
      <span className="text-[11px] font-medium text-surface-500 uppercase tracking-wide">
        {children}
        {count > 0 && <span className="ml-1 text-surface-600 normal-case font-normal tracking-normal">({count})</span>}
      </span>
    </div>
  );
}
