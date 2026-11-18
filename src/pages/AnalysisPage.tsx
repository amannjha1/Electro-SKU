import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Cpu,
  Download,
  FileJson,
  History,
  Lightbulb,
  Loader2,
  Maximize2,
  Printer,
  Search,
  ShieldAlert,
  Trash2,
  XCircle,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { ImageZoomModal } from '../components/ImageZoomModal';
import { exportInspectionReportPdf } from '../lib/pdfExport';
import type {
  AnalysisStepId,
  AnalysisStepState,
  CaptureRecord,
  ConfidenceLevel,
  InspectionRecord,
} from '../types/electrosku';

export interface AnalysisProgressState {
  active: boolean;
  capture: CaptureRecord | null;
  steps: Record<AnalysisStepId, { state: AnalysisStepState; detail?: string }>;
  error: string | null;
  warning: string | null;
}

interface AnalysisPageProps {
  inspections: InspectionRecord[];
  selectedInspection: InspectionRecord | null;
  progress: AnalysisProgressState;
  onSelectInspection: (inspection: InspectionRecord) => void;
  onDeleteInspection: (inspectionId: string) => Promise<void>;
  onGoToCapture: () => void;
  onGenerateOrViewProjects: (inspectionId: string) => Promise<void>;
}

const PROGRESS_STEPS: Array<{ id: AnalysisStepId; number: string; label: string }> = [
  { id: 'receiving_image', number: '01', label: 'Receiving PCB image' },
  { id: 'examining_layout', number: '02', label: 'Examining board layout' },
  { id: 'reading_markings', number: '03', label: 'Reading component markings' },
  { id: 'identifying_components', number: '04', label: 'Identifying components' },
  { id: 'preparing_report', number: '05', label: 'Preparing technical report' },
  { id: 'generating_projects', number: '06', label: 'Generating project recommendations' },
];

export const AnalysisPage: React.FC<AnalysisPageProps> = ({
  inspections,
  selectedInspection,
  progress,
  onSelectInspection,
  onDeleteInspection,
  onGoToCapture,
  onGenerateOrViewProjects,
}) => {
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState<'all' | 'completed' | 'failed'>('all');

  const [componentSearch, setComponentSearch] = useState('');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | ConfidenceLevel>('all');
  const [zoomOpen, setZoomOpen] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [generatingProjects, setGeneratingProjects] = useState(false);

  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredHistory = useMemo(() => {
    return inspections.filter((ins) => {
      if (historyStatus !== 'all' && ins.status !== historyStatus) return false;
      if (historySearch.trim()) {
        const q = historySearch.trim().toLowerCase();
        return (
          ins.id.toLowerCase().includes(q) ||
          ins.boardType.toLowerCase().includes(q) ||
          ins.likelyApplication.toLowerCase().includes(q) ||
          ins.capture.label.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [inspections, historySearch, historyStatus]);

  const filteredComponents = useMemo(() => {
    const list = selectedInspection?.report?.components || [];
    return list.filter((comp) => {
      if (confidenceFilter !== 'all' && comp.confidence !== confidenceFilter) return false;
      if (componentSearch.trim()) {
        const q = componentSearch.trim().toLowerCase();
        return (
          comp.name.toLowerCase().includes(q) ||
          comp.category.toLowerCase().includes(q) ||
          comp.marking.toLowerCase().includes(q) ||
          comp.likelyFunction.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [selectedInspection, componentSearch, confidenceFilter]);

  const handleDownloadJson = () => {
    if (!selectedInspection) return;
    const blob = new Blob([JSON.stringify(selectedInspection, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedInspection.id}_ElectroSKU_Report.json`;
    a.click();
    URL.revokeObjectURL(url);
    setSavedNotice(`Report ${selectedInspection.id} saved to database and exported as JSON.`);
    setTimeout(() => setSavedNotice(null), 4000);
  };

  const handleSaveReport = () => {
    if (!selectedInspection) return;
    setSavedNotice(
      `Inspection ${selectedInspection.id} is permanently saved in ElectroSKU local storage.`
    );
    setTimeout(() => setSavedNotice(null), 4000);
  };

  const handleProjectsAction = async () => {
    if (!selectedInspection) return;
    setGeneratingProjects(true);
    try {
      await onGenerateOrViewProjects(selectedInspection.id);
    } finally {
      setGeneratingProjects(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!pendingDeleteId) return;
    setDeleting(true);
    try {
      await onDeleteInspection(pendingDeleteId);
      setPendingDeleteId(null);
    } finally {
      setDeleting(false);
    }
  };

  const renderConfidenceLabel = (level: ConfidenceLevel) => {
    if (level === 'High') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16834A]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#16834A]" />
          <span>High</span>
        </span>
      );
    }
    if (level === 'Medium') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
          <span>Medium</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#5C645E]">
        <span className="w-1.5 h-1.5 rounded-full bg-[#767E78]" />
        <span>Low</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header & History Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E5EAE6] no-print">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#202520]">
            AI PCB Inspection &amp; Technical Report
          </h1>
          <p className="text-sm text-[#5C645E] mt-1">
            Gemini multimodal visual component analysis, marking extraction, and engineering assessment
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
              historyOpen
                ? 'bg-[#202520] text-white border-[#202520]'
                : 'bg-white text-[#202520] border-[#E5EAE6] hover:bg-[#F7F9F7]'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Inspection History ({inspections.length})</span>
          </button>

          <button
            type="button"
            onClick={onGoToCapture}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#16834A] text-white text-xs font-semibold hover:bg-[#126B3C] transition-colors whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>New Inspection</span>
          </button>
        </div>
      </div>

      {/* Collapsible Inspection History Drawer */}
      {historyOpen && (
        <section className="bg-[#F7F9F7] rounded-xl border border-[#E5EAE6] p-4 space-y-3 no-print">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div className="text-xs font-semibold text-[#202520]">
              Saved PCB Inspection Reports
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#767E78] absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search ID, board, or marking..."
                  className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#E5EAE6] bg-white focus:outline-none focus:border-[#16834A] w-56"
                />
              </div>

              <div className="inline-flex p-0.5 rounded-lg bg-white border border-[#E5EAE6]">
                {(['all', 'completed', 'failed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setHistoryStatus(st)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                      historyStatus === st
                        ? 'bg-[#202520] text-white'
                        : 'text-[#5C645E] hover:text-[#202520]'
                    }`}
                  >
                    {st}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="py-6 text-center text-xs text-[#5C645E]">
              No matching inspection records found.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 max-h-72 overflow-y-auto pr-1">
              {filteredHistory.map((item) => {
                const isSelected = selectedInspection?.id === item.id;
                return (
                  <div
                    key={item.id}
                    className={`rounded-lg border p-3 bg-white flex items-center gap-3 transition-colors ${
                      isSelected ? 'border-[#16834A] ring-1 ring-[#16834A]/25' : 'border-[#E5EAE6]'
                    }`}
                  >
                    <img
                      src={item.capture.imageUrl}
                      alt={item.boardType || item.capture.label}
                      referrerPolicy="no-referrer"
                      className="w-14 h-11 object-cover rounded border border-[#E5EAE6] shrink-0"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        onSelectInspection(item);
                        setHistoryOpen(false);
                      }}
                      className="min-w-0 flex-1 text-left"
                    >
                      <div className="font-mono text-[11px] text-[#5C645E] truncate">
                        {item.id} {item.isDemo ? '· Demo' : ''}
                      </div>
                      <div className="text-xs font-semibold text-[#202520] truncate">
                        {item.boardType || item.capture.label}
                      </div>
                      <div className="text-[11px] text-[#5C645E] mt-0.5">
                        {item.status === 'completed'
                          ? `${item.componentCount} components · Completed`
                          : item.status === 'failed'
                          ? 'Analysis Failed'
                          : 'Analyzing'}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDeleteId(item.id)}
                      className="p-1.5 text-[#767E78] hover:text-red-600 transition-colors shrink-0"
                      title="Delete inspection"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Real-time 6-Step Analysis Progress Sequence */}
      {(progress.active || progress.error) && (
        <section className="bg-white rounded-xl border border-[#E5EAE6] p-6 shadow-[0_1px_2px_rgba(16,24,18,0.03)] no-print">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-5 border-b border-[#E5EAE6]">
            <div>
              <h2 className="font-display text-base font-semibold text-[#202520]">
                {progress.error
                  ? 'Inspection Pipeline Encountered an Error'
                  : 'Running Gemini Multimodal PCB Inspection'}
              </h2>
              <p className="text-xs text-[#5C645E] mt-0.5">
                {progress.capture
                  ? `Target Frame: ${progress.capture.label} (${progress.capture.sourceType})`
                  : 'Processing optical PCB frame'}
              </p>
            </div>
            {progress.capture && (
              <img
                src={progress.capture.imageUrl}
                alt={progress.capture.label}
                referrerPolicy="no-referrer"
                className="w-20 h-14 object-cover rounded-lg border border-[#E5EAE6]"
              />
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROGRESS_STEPS.map((step) => {
              const stepInfo = progress.steps[step.id];
              const state = stepInfo?.state || 'pending';
              return (
                <div
                  key={step.id}
                  className={`rounded-lg border p-3.5 transition-colors ${
                    state === 'completed'
                      ? 'bg-[#ECFDF3]/60 border-[#16834A]/30'
                      : state === 'active'
                      ? 'bg-[#F7F9F7] border-[#16834A]'
                      : state === 'failed'
                      ? 'bg-red-50/70 border-red-200'
                      : 'bg-white border-[#E5EAE6]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[11px] text-[#767E78]">{step.number}</span>
                    {state === 'completed' && (
                      <CheckCircle2 className="w-4 h-4 text-[#16834A]" />
                    )}
                    {state === 'active' && (
                      <Loader2 className="w-4 h-4 text-[#16834A] animate-spin" />
                    )}
                    {state === 'failed' && <XCircle className="w-4 h-4 text-red-600" />}
                    {state === 'pending' && (
                      <span className="w-2 h-2 rounded-full bg-[#D6DDD7]" />
                    )}
                  </div>
                  <div className="mt-2 text-xs font-semibold text-[#202520]">
                    {step.label}
                  </div>
                  {stepInfo?.detail && (
                    <div className="mt-1 text-[11px] text-[#5C645E] leading-snug">
                      {stepInfo.detail}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {progress.error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Analysis Error</div>
                <div className="mt-0.5">{progress.error}</div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Save / Export confirmation notice */}
      {savedNotice && (
        <div className="rounded-xl border border-[#16834A]/25 bg-[#ECFDF3] px-4 py-3 text-xs text-[#126B3C] flex items-center gap-2 no-print">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{savedNotice}</span>
        </div>
      )}

      {/* Warning if report completed but project generation had a warning */}
      {progress.warning && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900 flex items-center gap-2 no-print">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            Technical report completed, but project recommendation step reported: {progress.warning}
          </span>
        </div>
      )}

      {/* Empty State when no report is active or selected */}
      {!progress.active && !selectedInspection && (
        <section className="bg-white rounded-xl border border-[#E5EAE6] p-12 text-center shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
          <Cpu className="w-9 h-9 text-[#767E78] mx-auto mb-3" />
          <h2 className="font-display text-lg font-semibold text-[#202520]">
            No Inspection Report Selected
          </h2>
          <p className="text-xs sm:text-sm text-[#5C645E] mt-1.5 max-w-md mx-auto leading-relaxed">
            Capture a PCB frame or upload an image in the Capture workspace to generate a technical
            Gemini AI inspection report, or open a saved report from Inspection History.
          </p>
          <div className="mt-5 flex items-center justify-center gap-3">
            <button
              type="button"
              onClick={onGoToCapture}
              className="px-4 py-2 rounded-lg bg-[#16834A] text-white text-xs font-semibold hover:bg-[#126B3C] transition-colors"
            >
              Go to Capture Workspace
            </button>
            {inspections.length > 0 && (
              <button
                type="button"
                onClick={() => setHistoryOpen(true)}
                className="px-4 py-2 rounded-lg border border-[#E5EAE6] text-xs font-medium text-[#202520] hover:bg-[#F7F9F7] transition-colors"
              >
                Browse History ({inspections.length})
              </button>
            )}
          </div>
        </section>
      )}

      {/* Failed Selected Report State */}
      {!progress.active && selectedInspection && selectedInspection.status === 'failed' && (
        <section className="bg-white rounded-xl border border-red-200 p-6">
          <div className="flex items-start gap-3">
            <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <h2 className="font-display text-base font-semibold text-[#202520]">
                Inspection {selectedInspection.id} Failed
              </h2>
              <p className="text-xs text-red-700 mt-1">
                {selectedInspection.errorMessage || 'An error occurred during Gemini PCB analysis.'}
              </p>
              <button
                type="button"
                onClick={onGoToCapture}
                className="mt-4 px-4 py-2 rounded-lg bg-[#16834A] text-white text-xs font-semibold hover:bg-[#126B3C] transition-colors"
              >
                Return to Capture
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Completed Full Technical Report */}
      {selectedInspection && selectedInspection.report && (
        <div className="space-y-6">
          {/* F. Report Actions Toolbar */}
          <div className="bg-white rounded-xl border border-[#E5EAE6] p-4 flex flex-wrap items-center justify-between gap-3 shadow-[0_1px_2px_rgba(16,24,18,0.03)] no-print">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#5C645E]">
              <span className="font-mono font-semibold text-[#202520]">
                {selectedInspection.id}
              </span>
              <span aria-hidden="true">·</span>
              <span>
                {new Date(
                  selectedInspection.completedAt || selectedInspection.createdAt
                ).toLocaleString()}
              </span>
              {selectedInspection.modelUsed && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{selectedInspection.modelUsed}</span>
                </>
              )}
              {selectedInspection.isDemo && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-amber-700 font-medium">Demo Sample</span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => exportInspectionReportPdf(selectedInspection)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5EAE6] text-xs font-medium text-[#202520] hover:bg-[#F7F9F7] transition-colors whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5EAE6] text-xs font-medium text-[#202520] hover:bg-[#F7F9F7] transition-colors whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Report</span>
              </button>
              <button
                type="button"
                onClick={handleSaveReport}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5EAE6] text-xs font-medium text-[#202520] hover:bg-[#F7F9F7] transition-colors whitespace-nowrap"
              >
                <FileJson className="w-3.5 h-3.5" />
                <span>Save Report</span>
              </button>
              <button
                type="button"
                onClick={handleDownloadJson}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5EAE6] text-xs font-medium text-[#202520] hover:bg-[#F7F9F7] transition-colors whitespace-nowrap"
              >
                <span>Export JSON</span>
              </button>
              <button
                type="button"
                onClick={() => setZoomOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5EAE6] text-xs font-medium text-[#202520] hover:bg-[#F7F9F7] transition-colors whitespace-nowrap"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>View Original Photo</span>
              </button>
              <button
                type="button"
                onClick={handleProjectsAction}
                disabled={generatingProjects}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#16834A] text-white text-xs font-semibold hover:bg-[#126B3C] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>
                  {generatingProjects
                    ? 'Generating...'
                    : selectedInspection.recommendations.length > 0
                    ? `Project Recommendations (${selectedInspection.recommendations.length})`
                    : 'Generate Project Recommendations'}
                </span>
              </button>
            </div>
          </div>

          {/* A. PCB Overview */}
          <section className="bg-white rounded-xl border border-[#E5EAE6] p-6 shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
            <h2 className="font-display text-base font-semibold text-[#202520] pb-3 border-b border-[#E5EAE6]">
              A. PCB Overview
            </h2>

            <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              <div className="lg:col-span-5">
                <button
                  type="button"
                  onClick={() => setZoomOpen(true)}
                  className="group relative w-full rounded-lg overflow-hidden border border-[#E5EAE6] bg-[#F7F9F7] block text-left"
                >
                  <img
                    src={selectedInspection.capture.imageUrl}
                    alt={selectedInspection.report.pcbIdentification.boardType}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[300px] object-contain mx-auto"
                  />
                  <div className="px-3 py-2 bg-white border-t border-[#E5EAE6] flex items-center justify-between text-[11px] text-[#5C645E]">
                    <span className="font-mono">{selectedInspection.capture.sourceType}</span>
                    <span className="text-[#16834A] font-medium group-hover:underline no-print">
                      Click to inspect fullscreen
                    </span>
                  </div>
                </button>
              </div>

              <div className="lg:col-span-7 space-y-4">
                <div>
                  <div className="text-xs font-medium text-[#767E78]">Board Identification</div>
                  <div className="font-display text-xl font-bold text-[#202520] mt-0.5">
                    {selectedInspection.report.pcbIdentification.boardType}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-[#767E78]">Likely Application</div>
                  <div className="text-sm text-[#202520] mt-0.5">
                    {selectedInspection.report.pcbIdentification.likelyApplication}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-medium text-[#767E78]">General Board Layout</div>
                  <p className="text-sm text-[#5C645E] mt-0.5 leading-relaxed">
                    {selectedInspection.report.pcbIdentification.generalBoardLayout}
                  </p>
                </div>

                {selectedInspection.report.pcbIdentification.visibleBoardMarkings.length > 0 && (
                  <div>
                    <div className="text-xs font-medium text-[#767E78]">
                      Visible Board Markings &amp; Silkscreen
                    </div>
                    <div className="mt-1 text-xs font-mono text-[#202520] leading-relaxed">
                      {selectedInspection.report.pcbIdentification.visibleBoardMarkings.join(' · ')}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-[#E5EAE6]">
                  <div className="text-xs font-medium text-[#767E78]">Overall Analysis Summary</div>
                  <p className="text-sm text-[#202520] mt-1 leading-relaxed">
                    {selectedInspection.report.overallAssessment.summary}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* B. Detected Components Table */}
          <section className="bg-white rounded-xl border border-[#E5EAE6] shadow-[0_1px_2px_rgba(16,24,18,0.03)] overflow-hidden">
            <div className="px-6 py-4 border-b border-[#E5EAE6] flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-base font-semibold text-[#202520]">
                  B. Detected Components ({selectedInspection.report.components.length} entries)
                </h2>
                <p className="text-xs text-[#5C645E] mt-0.5">
                  Searchable inventory of visually observed electronic parts with confidence ratings
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 no-print">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-[#767E78] absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={componentSearch}
                    onChange={(e) => setComponentSearch(e.target.value)}
                    placeholder="Filter name, marking, role..."
                    className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#E5EAE6] bg-[#F7F9F7] focus:bg-white focus:outline-none focus:border-[#16834A] w-52"
                  />
                </div>

                <div className="inline-flex p-0.5 rounded-lg bg-[#F7F9F7] border border-[#E5EAE6]">
                  {(['all', 'High', 'Medium', 'Low'] as const).map((level) => (
                    <button
                      key={level}
                      type="button"
                      onClick={() => setConfidenceFilter(level)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        confidenceFilter === level
                          ? 'bg-white text-[#202520] shadow-xs'
                          : 'text-[#5C645E] hover:text-[#202520]'
                      }`}
                    >
                      {level === 'all' ? 'All' : level}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#E5EAE6] bg-[#F7F9F7]/70 text-[11px] font-semibold text-[#5C645E]">
                    <th className="py-3 px-6">Component Name</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Detected Marking</th>
                    <th className="py-3 px-4 text-right">Qty Est.</th>
                    <th className="py-3 px-4">Likely Function &amp; Notes</th>
                    <th className="py-3 px-6">Confidence</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5EAE6] text-xs">
                  {filteredComponents.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-8 text-center text-[#5C645E]">
                        No components match the current filter.
                      </td>
                    </tr>
                  ) : (
                    filteredComponents.map((comp, idx) => (
                      <tr key={comp.id || idx} className="hover:bg-[#F7F9F7]/50 transition-colors align-top">
                        <td className="py-3.5 px-6 font-medium text-[#202520]">
                          {comp.name}
                        </td>
                        <td className="py-3.5 px-4 text-[#5C645E] whitespace-nowrap">
                          {comp.category}
                        </td>
                        <td className="py-3.5 px-4 font-mono text-[#202520]">
                          {comp.marking}
                        </td>
                        <td className="py-3.5 px-4 font-mono tabular-nums text-right text-[#202520]">
                          {comp.quantityEstimate}
                        </td>
                        <td className="py-3.5 px-4 text-[#5C645E] max-w-md leading-relaxed">
                          <div className="text-[#202520]">{comp.likelyFunction}</div>
                          {comp.confidenceReason && (
                            <div className="text-[11px] text-[#767E78] mt-1">
                              {comp.confidenceReason}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-6 whitespace-nowrap">
                          {renderConfidenceLabel(comp.confidence)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* C. Technical Analysis & D. Visual Observations */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-white rounded-xl border border-[#E5EAE6] p-6 shadow-[0_1px_2px_rgba(16,24,18,0.03)] space-y-4">
              <h2 className="font-display text-base font-semibold text-[#202520] pb-3 border-b border-[#E5EAE6]">
                C. Technical Functional Analysis
              </h2>

              {[
                { label: 'Power Section', value: selectedInspection.report.functionalAnalysis.powerSection },
                { label: 'Control & Processing Section', value: selectedInspection.report.functionalAnalysis.controlSection },
                { label: 'Communication Interfaces', value: selectedInspection.report.functionalAnalysis.communicationSection },
                { label: 'Other Identifiable Sections', value: selectedInspection.report.functionalAnalysis.otherSections },
              ].map((block) => (
                <div key={block.label}>
                  <div className="text-xs font-semibold text-[#202520]">{block.label}</div>
                  <p className="text-xs text-[#5C645E] mt-1 leading-relaxed">{block.value}</p>
                </div>
              ))}
            </section>

            <section className="bg-white rounded-xl border border-[#E5EAE6] p-6 shadow-[0_1px_2px_rgba(16,24,18,0.03)] space-y-4">
              <h2 className="font-display text-base font-semibold text-[#202520] pb-3 border-b border-[#E5EAE6]">
                D. Visual Observations &amp; Markings
              </h2>

              {[
                { label: 'Visible Damage', value: selectedInspection.report.technicalObservations.visibleDamage },
                { label: 'Missing or Unpopulated Components', value: selectedInspection.report.technicalObservations.missingComponents },
                { label: 'Corrosion or Discoloration', value: selectedInspection.report.technicalObservations.corrosionOrDiscoloration },
                { label: 'Unusual Board Features', value: selectedInspection.report.technicalObservations.unusualFeatures },
              ].map((obs) => (
                <div key={obs.label}>
                  <div className="text-xs font-semibold text-[#202520]">{obs.label}</div>
                  <p className="text-xs text-[#5C645E] mt-1 leading-relaxed">{obs.value}</p>
                </div>
              ))}

              <div className="pt-2 border-t border-[#E5EAE6]">
                <div className="text-xs font-semibold text-[#202520]">
                  Unreadable or Ambiguous Markings
                </div>
                {selectedInspection.report.componentMarkingsSummary.unreadableMarkings.length === 0 ? (
                  <p className="text-xs text-[#5C645E] mt-1">
                    All major IC markings were legible, though unmarked passives still require bench verification.
                  </p>
                ) : (
                  <ul className="mt-1.5 space-y-1 text-xs text-[#5C645E] list-disc list-inside">
                    {selectedInspection.report.componentMarkingsSummary.unreadableMarkings.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                )}
              </div>
            </section>
          </div>

          {/* E. AI Summary & Physical Verification */}
          <section className="bg-white rounded-xl border border-[#E5EAE6] p-6 shadow-[0_1px_2px_rgba(16,24,18,0.03)] space-y-4">
            <h2 className="font-display text-base font-semibold text-[#202520] pb-3 border-b border-[#E5EAE6]">
              E. AI Technical Summary &amp; Verification Scope
            </h2>

            <p className="text-sm text-[#202520] leading-relaxed">
              {selectedInspection.report.technicalSummary}
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
              <div className="rounded-lg border border-[#E5EAE6] bg-[#F7F9F7] p-4">
                <div className="text-xs font-semibold text-[#202520] mb-2">
                  Items Requiring Physical Verification
                </div>
                <ul className="space-y-1.5 text-xs text-[#5C645E] list-disc list-inside leading-relaxed">
                  {selectedInspection.report.overallAssessment.requiresPhysicalVerification.map(
                    (item, idx) => (
                      <li key={idx}>{item}</li>
                    )
                  )}
                </ul>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-2.5">
                <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <div className="text-xs font-semibold text-amber-900">
                    Optical Inspection Limitation
                  </div>
                  <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                    {selectedInspection.report.visualInspectionDisclaimer}
                  </p>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}

      {selectedInspection && (
        <ImageZoomModal
          open={zoomOpen}
          onClose={() => setZoomOpen(false)}
          imageUrl={selectedInspection.capture.imageUrl}
          title={selectedInspection.boardType || selectedInspection.capture.label}
          subtitle={`${selectedInspection.id} · ${selectedInspection.capture.sourceType}`}
        />
      )}

      <ConfirmModal
        open={Boolean(pendingDeleteId)}
        title="Delete Inspection Report"
        message={`Permanently delete inspection ${pendingDeleteId} and its stored analysis data?`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
        loading={deleting}
      />
    </div>
  );
};
