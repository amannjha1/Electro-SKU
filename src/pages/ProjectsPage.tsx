import React, { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  GraduationCap,
  Layers,
  Lightbulb,
  RefreshCw,
  ShieldAlert,
  Wifi,
  Zap,
} from 'lucide-react';
import type {
  InspectionRecord,
  ProjectDifficulty,
  ProjectRecommendation,
} from '../types/electrosku';

interface ProjectsPageProps {
  completedInspections: InspectionRecord[];
  selectedInspection: InspectionRecord | null;
  selectedProjectId: string | null;
  onSelectInspection: (inspection: InspectionRecord) => void;
  onSelectProject: (projectId: string | null) => void;
  onRegenerateProjects: (inspectionId: string) => Promise<void>;
  onGoToCapture: () => void;
}

function getCategoryIcon(category: string) {
  const c = category.toLowerCase();
  if (c.includes('iot') || c.includes('wireless') || c.includes('comm')) return Wifi;
  if (c.includes('led') || c.includes('display') || c.includes('light')) return Zap;
  if (c.includes('sensor') || c.includes('monitor')) return Activity;
  if (c.includes('education')) return GraduationCap;
  if (c.includes('automation') || c.includes('relay')) return Layers;
  return Cpu;
}

function renderDifficultyText(difficulty: ProjectDifficulty) {
  const color =
    difficulty === 'Beginner'
      ? 'text-[#16834A]'
      : difficulty === 'Intermediate'
      ? 'text-amber-700'
      : 'text-[#202520]';

  return <span className={`text-xs font-semibold ${color}`}>{difficulty}</span>;
}

const ConceptualBlockDiagram: React.FC<{ project: ProjectRecommendation }> = ({ project }) => {
  const { nodes, edges } = project.blockDiagram;
  if (!nodes || nodes.length === 0) {
    return (
      <div className="rounded-lg border border-[#E5EAE6] bg-[#F7F9F7] p-6 text-center text-xs text-[#5C645E]">
        Conceptual block diagram nodes were not provided for this project.
      </div>
    );
  }

  const nodeWidth = 172;
  const nodeHeight = 64;
  const cols = Math.min(3, Math.max(2, Math.ceil(Math.sqrt(nodes.length))));
  const gapX = 56;
  const gapY = 48;
  const padX = 28;
  const padY = 28;

  const positioned = nodes.map((node, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    const x = padX + col * (nodeWidth + gapX);
    const y = padY + row * (nodeHeight + gapY);
    return {
      ...node,
      x,
      y,
      cx: x + nodeWidth / 2,
      cy: y + nodeHeight / 2,
    };
  });

  const rowsCount = Math.ceil(nodes.length / cols);
  const svgWidth = padX * 2 + cols * nodeWidth + (cols - 1) * gapX;
  const svgHeight = padY * 2 + rowsCount * nodeHeight + (rowsCount - 1) * gapY;

  const nodeById = new Map(positioned.map((n) => [n.id, n]));

  return (
    <div className="rounded-xl border border-[#E5EAE6] bg-[#F7F9F7] p-4 overflow-x-auto">
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="mx-auto block"
        role="img"
        aria-label={`Conceptual block diagram for ${project.projectName}`}
      >
        <defs>
          <marker
            id="electrosku-arrow"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="6"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <path d="M 0 1 L 10 5 L 0 9 z" fill="#16834A" />
          </marker>
        </defs>

        {edges.map((edge, idx) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;

          const midX = (from.cx + to.cx) / 2;
          const midY = (from.cy + to.cy) / 2;

          return (
            <g key={`${edge.from}-${edge.to}-${idx}`}>
              <line
                x1={from.cx}
                y1={from.cy}
                x2={to.cx}
                y2={to.cy}
                stroke="#16834A"
                strokeWidth="1.5"
                strokeOpacity="0.6"
                markerEnd="url(#electrosku-arrow)"
              />
              {edge.signal && (
                <g>
                  <rect
                    x={midX - Math.min(64, edge.signal.length * 3.4 + 8)}
                    y={midY - 9}
                    width={Math.min(128, edge.signal.length * 6.8 + 16)}
                    height={18}
                    rx={4}
                    fill="#FFFFFF"
                    stroke="#E5EAE6"
                  />
                  <text
                    x={midX}
                    y={midY + 3}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontFamily="JetBrains Mono, monospace"
                    fill="#5C645E"
                  >
                    {edge.signal.slice(0, 20)}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {positioned.map((node) => (
          <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
            <rect
              width={nodeWidth}
              height={nodeHeight}
              rx={8}
              fill="#FFFFFF"
              stroke="#C7D1C9"
              strokeWidth="1.2"
            />
            <text
              x={12}
              y={22}
              fontSize="10"
              fontFamily="JetBrains Mono, monospace"
              fill="#16834A"
            >
              {node.role.slice(0, 22)}
            </text>
            <text
              x={12}
              y={42}
              fontSize="12"
              fontWeight="600"
              fontFamily="Plus Jakarta Sans, sans-serif"
              fill="#202520"
            >
              {node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
};

export const ProjectsPage: React.FC<ProjectsPageProps> = ({
  completedInspections,
  selectedInspection,
  selectedProjectId,
  onSelectInspection,
  onSelectProject,
  onRegenerateProjects,
  onGoToCapture,
}) => {
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [difficultyFilter, setDifficultyFilter] = useState<'all' | ProjectDifficulty>('all');
  const [regenerating, setRegenerating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [checkedParts, setCheckedParts] = useState<Record<string, boolean>>({});

  const activeInspection =
    selectedInspection?.status === 'completed'
      ? selectedInspection
      : completedInspections[0] || null;

  const recommendations = activeInspection?.recommendations || [];

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const r of recommendations) {
      if (r.category) set.add(r.category);
    }
    return ['all', ...Array.from(set)];
  }, [recommendations]);

  const filteredProjects = useMemo(() => {
    return recommendations.filter((proj) => {
      if (categoryFilter !== 'all' && proj.category !== categoryFilter) return false;
      if (difficultyFilter !== 'all' && proj.difficulty !== difficultyFilter) return false;
      return true;
    });
  }, [recommendations, categoryFilter, difficultyFilter]);

  const activeProject = useMemo(() => {
    if (!selectedProjectId) return null;
    return recommendations.find((r) => r.id === selectedProjectId) || null;
  }, [recommendations, selectedProjectId]);

  const handleRegenerate = async () => {
    if (!activeInspection) return;
    setRegenerating(true);
    setErrorMsg(null);
    try {
      await onRegenerateProjects(activeInspection.id);
      onSelectProject(null);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to regenerate project recommendations.'
      );
    } finally {
      setRegenerating(false);
    }
  };

  const togglePartCheck = (key: string) => {
    setCheckedParts((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // Detailed Single-Project Page
  if (activeInspection && activeProject) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E5EAE6]">
          <div>
            <button
              type="button"
              onClick={() => onSelectProject(null)}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16834A] hover:underline mb-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Recommended Projects</span>
            </button>
            <h1 className="font-display text-2xl font-bold tracking-tight text-[#202520]">
              {activeProject.projectName}
            </h1>
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C645E] mt-1.5">
              <span>{activeProject.category}</span>
              <span aria-hidden="true">·</span>
              {renderDifficultyText(activeProject.difficulty)}
              <span aria-hidden="true">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                <span>{activeProject.estimatedBuildTime}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">Source: {activeInspection.id}</span>
            </div>
          </div>
        </div>

        {/* Overview & Suitability */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <section className="lg:col-span-7 bg-white rounded-xl border border-[#E5EAE6] p-6 space-y-4 shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
            <h2 className="font-display text-base font-semibold text-[#202520]">
              Engineering Overview
            </h2>
            <p className="text-sm text-[#202520] leading-relaxed">
              {activeProject.description}
            </p>

            <div className="pt-3 border-t border-[#E5EAE6]">
              <h3 className="text-xs font-semibold text-[#202520]">
                Why Identified PCB Components Are Suitable
              </h3>
              <p className="text-xs sm:text-sm text-[#5C645E] mt-1.5 leading-relaxed">
                {activeProject.suitabilityExplanation}
              </p>
            </div>

            {activeProject.learningOutcomes.length > 0 && (
              <div className="pt-3 border-t border-[#E5EAE6]">
                <h3 className="text-xs font-semibold text-[#202520]">Learning Outcomes</h3>
                <ul className="mt-2 space-y-1.5 text-xs text-[#5C645E] list-disc list-inside">
                  {activeProject.learningOutcomes.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Safety & Compatibility Checks */}
          <section className="lg:col-span-5 bg-white rounded-xl border border-[#E5EAE6] p-6 space-y-4 shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-700" />
              <h2 className="font-display text-base font-semibold text-[#202520]">
                Compatibility &amp; Bench Verification
              </h2>
            </div>

            <p className="text-xs text-[#5C645E] leading-relaxed">
              Never assume an inspected PCB component is safe or functional solely from visual
              inspection. Complete these checks before wiring:
            </p>

            <ul className="space-y-2.5 text-xs text-[#202520]">
              {activeProject.compatibilityChecks.map((check, idx) => (
                <li
                  key={idx}
                  className="rounded-lg border border-amber-200 bg-amber-50/70 px-3.5 py-2.5 leading-relaxed text-amber-900"
                >
                  {check}
                </li>
              ))}
            </ul>
          </section>
        </div>

        {/* Interactive Component Checklist */}
        <section className="bg-white rounded-xl border border-[#E5EAE6] p-6 shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 border-b border-[#E5EAE6]">
            <div>
              <h2 className="font-display text-base font-semibold text-[#202520]">
                Component Checklist
              </h2>
              <p className="text-xs text-[#5C645E] mt-0.5">
                Verify availability and electrical health of each part before bench assembly
              </p>
            </div>
            <div className="font-mono tabular-nums text-xs text-[#16834A] font-medium">
              {activeProject.componentsAvailableFromPcb.length} on PCB ·{' '}
              {activeProject.additionalComponentsNeeded.length} additional needed
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-semibold text-[#16834A] mb-3">
                Available from Scanned PCB (Verify Before Use)
              </h3>
              <div className="space-y-2">
                {activeProject.componentsAvailableFromPcb.length === 0 ? (
                  <p className="text-xs text-[#5C645E]">None directly reusable without extraction.</p>
                ) : (
                  activeProject.componentsAvailableFromPcb.map((part, idx) => {
                    const key = `avail-${activeProject.id}-${idx}`;
                    const checked = Boolean(checkedParts[key]);
                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#ECFDF3]/60 border-[#16834A]/30'
                            : 'bg-[#F7F9F7] border-[#E5EAE6]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePartCheck(key)}
                          className="mt-0.5 accent-[#16834A]"
                        />
                        <span className={`text-xs ${checked ? 'line-through text-[#5C645E]' : 'text-[#202520]'}`}>
                          {part}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>

            <div>
              <h3 className="text-xs font-semibold text-[#202520] mb-3">
                Additional Supporting Components Needed
              </h3>
              <div className="space-y-2">
                {activeProject.additionalComponentsNeeded.length === 0 ? (
                  <p className="text-xs text-[#5C645E]">No additional parts required.</p>
                ) : (
                  activeProject.additionalComponentsNeeded.map((part, idx) => {
                    const key = `add-${activeProject.id}-${idx}`;
                    const checked = Boolean(checkedParts[key]);
                    return (
                      <label
                        key={key}
                        className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-[#ECFDF3]/60 border-[#16834A]/30'
                            : 'bg-white border-[#E5EAE6]'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePartCheck(key)}
                          className="mt-0.5 accent-[#16834A]"
                        />
                        <span className={`text-xs ${checked ? 'line-through text-[#5C645E]' : 'text-[#202520]'}`}>
                          {part}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Conceptual Block Diagram */}
        <section className="bg-white rounded-xl border border-[#E5EAE6] p-6 shadow-[0_1px_2px_rgba(16,24,18,0.03)] space-y-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#202520]">
              Conceptual System Block Diagram
            </h2>
            <p className="text-xs text-[#5C645E] mt-0.5">
              Low-voltage functional signal flow combining scanned PCB blocks with supporting hardware
            </p>
          </div>
          <ConceptualBlockDiagram project={activeProject} />
        </section>
      </div>
    );
  }

  // Project Recommendations Grid View
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E5EAE6]">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#202520]">
            Intelligent Project Recommendations
          </h1>
          <p className="text-sm text-[#5C645E] mt-1">
            Practical, educational low-voltage electronics builds derived from your inspected PCB components
          </p>
        </div>

        {activeInspection && (
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#16834A] text-white text-xs font-semibold hover:bg-[#126B3C] disabled:opacity-50 transition-colors whitespace-nowrap shrink-0"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${regenerating ? 'animate-spin' : ''}`} />
            <span>{regenerating ? 'Generating...' : 'Regenerate Projects'}</span>
          </button>
        )}
      </div>

      {errorMsg && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {!activeInspection ? (
        <section className="bg-white rounded-xl border border-[#E5EAE6] p-12 text-center shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
          <Lightbulb className="w-9 h-9 text-[#767E78] mx-auto mb-3" />
          <h2 className="font-display text-lg font-semibold text-[#202520]">
            Analyze a PCB First to Unlock Recommendations
          </h2>
          <p className="text-xs sm:text-sm text-[#5C645E] mt-1.5 max-w-md mx-auto leading-relaxed">
            Once Gemini AI identifies the microcontrollers, regulators, sensors, or passives on a
            printed circuit board, ElectroSKU recommends compatible builds you can create.
          </p>
          <button
            type="button"
            onClick={onGoToCapture}
            className="mt-5 px-4 py-2 rounded-lg bg-[#16834A] text-white text-xs font-semibold hover:bg-[#126B3C] transition-colors"
          >
            Capture or Upload PCB
          </button>
        </section>
      ) : (
        <>
          {/* Active Source Inspection Bar & Filters */}
          <div className="bg-white rounded-xl border border-[#E5EAE6] p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
            <div className="flex items-center gap-3 min-w-0">
              <img
                src={activeInspection.capture.imageUrl}
                alt={activeInspection.boardType}
                referrerPolicy="no-referrer"
                className="w-14 h-10 object-cover rounded border border-[#E5EAE6] shrink-0"
              />
              <div className="min-w-0">
                <div className="text-[11px] text-[#767E78]">Source PCB Inspection</div>
                <select
                  value={activeInspection.id}
                  onChange={(e) => {
                    const found = completedInspections.find((i) => i.id === e.target.value);
                    if (found) {
                      onSelectInspection(found);
                      onSelectProject(null);
                    }
                  }}
                  aria-label="Select source PCB inspection"
                  className="mt-0.5 text-xs font-semibold text-[#202520] bg-transparent border border-[#E5EAE6] rounded-md px-2 py-1 focus:outline-none focus:border-[#16834A] max-w-xs"
                >
                  {completedInspections.map((ins) => (
                    <option key={ins.id} value={ins.id}>
                      {ins.id} — {ins.boardType || ins.capture.label} ({ins.componentCount} parts)
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              {/* Category Filter */}
              <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg bg-[#F7F9F7] border border-[#E5EAE6]">
                {categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                      categoryFilter === cat
                        ? 'bg-white text-[#202520] shadow-xs'
                        : 'text-[#5C645E] hover:text-[#202520]'
                    }`}
                  >
                    {cat === 'all' ? 'All Categories' : cat}
                  </button>
                ))}
              </div>

              {/* Difficulty Filter */}
              <select
                value={difficultyFilter}
                onChange={(e) =>
                  setDifficultyFilter(e.target.value as 'all' | ProjectDifficulty)
                }
                aria-label="Filter by difficulty"
                className="text-xs rounded-lg border border-[#E5EAE6] bg-white px-3 py-1.5 text-[#202520] focus:outline-none focus:border-[#16834A]"
              >
                <option value="all">All Difficulties</option>
                <option value="Beginner">Beginner</option>
                <option value="Intermediate">Intermediate</option>
                <option value="Advanced">Advanced</option>
              </select>
            </div>
          </div>

          {/* Recommendations Grid */}
          {recommendations.length === 0 ? (
            <section className="bg-white rounded-xl border border-[#E5EAE6] p-10 text-center">
              <p className="text-sm font-medium text-[#202520]">
                No project recommendations generated for {activeInspection.id} yet.
              </p>
              <p className="text-xs text-[#5C645E] mt-1">
                Click "Regenerate Projects" to evaluate compatible low-voltage builds using Gemini.
              </p>
            </section>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {filteredProjects.map((proj) => {
                const Icon = getCategoryIcon(proj.category);
                return (
                  <article
                    key={proj.id}
                    className="bg-white rounded-xl border border-[#E5EAE6] p-6 flex flex-col justify-between shadow-[0_1px_2px_rgba(16,24,18,0.03)] hover:border-[#C7D1C9] transition-colors"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-[#16834A]/10 flex items-center justify-center shrink-0">
                            <Icon className="w-4 h-4 text-[#16834A]" />
                          </div>
                          <div>
                            <h2 className="font-display text-base font-semibold text-[#202520] leading-snug">
                              {proj.projectName}
                            </h2>
                            <div className="flex items-center gap-2 text-[11px] text-[#5C645E] mt-0.5">
                              <span>{proj.category}</span>
                              <span aria-hidden="true">·</span>
                              {renderDifficultyText(proj.difficulty)}
                              <span aria-hidden="true">·</span>
                              <span>{proj.estimatedBuildTime}</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <p className="text-xs sm:text-[13px] text-[#5C645E] mt-3.5 leading-relaxed">
                        {proj.description}
                      </p>

                      <div className="mt-4 pt-3.5 border-t border-[#E5EAE6] flex items-center justify-between text-xs">
                        <span className="text-[#5C645E] inline-flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#16834A]" />
                          <span>
                            <strong className="font-mono tabular-nums text-[#202520]">
                              {proj.componentsAvailableFromPcb.length}
                            </strong>{' '}
                            of{' '}
                            <strong className="font-mono tabular-nums text-[#202520]">
                              {proj.componentsRequired.length}
                            </strong>{' '}
                            required parts on PCB
                          </span>
                        </span>
                      </div>
                    </div>

                    <div className="mt-5">
                      <button
                        type="button"
                        onClick={() => onSelectProject(proj.id)}
                        className="w-full py-2 px-4 rounded-lg border border-[#E5EAE6] bg-[#F7F9F7] hover:bg-[#16834A] hover:text-white hover:border-[#16834A] text-xs font-semibold text-[#202520] inline-flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <span>Explore Project</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
