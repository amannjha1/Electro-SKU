import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Cpu,
  Eye,
  Lightbulb,
  RefreshCw,
  Search,
  Trash2,
  WifiOff,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import type {
  CameraStatus,
  DashboardSummary,
  InspectionRecord,
  SystemHealthStatus,
} from '../types/electrosku';

interface DashboardPageProps {
  summary: DashboardSummary | null;
  health: SystemHealthStatus | null;
  loading: boolean;
  onStartInspection: () => void;
  onViewReport: (inspectionId: string) => void;
  onViewProject: (inspectionId: string, projectId: string) => void;
  onDeleteInspection: (inspectionId: string) => Promise<void>;
  onRefreshCamera: () => Promise<void>;
}

function formatTimestamp(iso: string | null | undefined): string {
  if (!iso) return 'No frame received';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  summary,
  health,
  loading,
  onStartInspection,
  onViewReport,
  onViewProject,
  onDeleteInspection,
  onRefreshCamera,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'failed'>('all');
  const [refreshingCam, setRefreshingCam] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const camera: CameraStatus | undefined = health?.camera;
  const stats = summary?.stats ?? {
    totalCaptures: 0,
    successfulAnalyses: 0,
    componentsIdentified: 0,
    projectsRecommended: 0,
  };

  const filteredInspections = useMemo(() => {
    const list = summary?.recentInspections || [];
    return list.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        return (
          item.id.toLowerCase().includes(q) ||
          item.boardType.toLowerCase().includes(q) ||
          item.likelyApplication.toLowerCase().includes(q) ||
          item.capture.label.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [summary?.recentInspections, searchQuery, statusFilter]);

  const handleRefreshCam = async () => {
    setRefreshingCam(true);
    try {
      await onRefreshCamera();
    } finally {
      setRefreshingCam(false);
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

  const renderStatusText = (item: InspectionRecord) => {
    if (item.status === 'completed') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#16834A]">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Completed</span>
        </span>
      );
    }
    if (item.status === 'analyzing' || item.status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
          <span className="w-2 h-2 rounded-full bg-amber-500" />
          <span>In Progress</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700">
        <span className="w-2 h-2 rounded-full bg-red-600" />
        <span>Failed</span>
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E5EAE6]">
        <div>
          <h1 className="font-display text-2xl sm:text-[28px] font-bold tracking-tight text-[#202520]">
            Good morning, Engineer
          </h1>
          <p className="text-sm sm:text-[15px] text-[#5C645E] mt-1">
            Welcome to ElectroSKU. Your intelligent PCB inspection workspace.
          </p>
        </div>

        <button
          type="button"
          onClick={onStartInspection}
          className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#16834A] text-white text-sm font-semibold hover:bg-[#126B3C] transition-colors shadow-[0_1px_2px_rgba(16,24,18,0.08)] whitespace-nowrap shrink-0"
        >
          <Camera className="w-4 h-4" />
          <span>Start New Inspection</span>
        </button>
      </div>

      {/* Four Real-Data KPI Cards */}
      <section aria-label="Workspace Statistics">
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {[
            {
              label: 'Total Captures',
              value: stats.totalCaptures,
              unit: 'PCB frames',
              icon: Camera,
            },
            {
              label: 'Successful AI Analyses',
              value: stats.successfulAnalyses,
              unit: 'verified reports',
              icon: CheckCircle2,
            },
            {
              label: 'Components Identified',
              value: stats.componentsIdentified,
              unit: 'total units',
              icon: Cpu,
            },
            {
              label: 'Projects Recommended',
              value: stats.projectsRecommended,
              unit: 'validated builds',
              icon: Lightbulb,
            },
          ].map((stat) => {
            const Icon = stat.icon;
            return (
              <div
                key={stat.label}
                className="bg-white rounded-xl border border-[#E5EAE6] p-5 shadow-[0_1px_2px_rgba(16,24,18,0.03)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-[#5C645E]">{stat.label}</span>
                  <Icon className="w-4 h-4 text-[#767E78]" />
                </div>
                <div className="mt-3 flex items-baseline gap-2">
                  <span className="font-display font-bold text-3xl text-[#202520] tabular-nums">
                    {loading && !summary ? '—' : stat.value}
                  </span>
                  <span className="text-xs text-[#767E78]">{stat.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Camera Status Panel & Recent AI Insights Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Camera Status Panel */}
        <section className="xl:col-span-5 bg-white rounded-xl border border-[#E5EAE6] p-5 flex flex-col justify-between shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
          <div>
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#E5EAE6]">
              <div>
                <h2 className="font-display text-base font-semibold text-[#202520]">
                  Camera Status Panel
                </h2>
                <p className="text-xs text-[#5C645E] mt-0.5">
                  ESP32-CAM · GC2145 Optical Sensor
                </p>
              </div>
              <button
                type="button"
                onClick={handleRefreshCam}
                disabled={refreshingCam}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5EAE6] text-xs font-medium text-[#202520] hover:bg-[#F7F9F7] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshingCam ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              <div>
                <div className="text-[#767E78]">ESP32-CAM Link</div>
                <div className="mt-1 font-medium text-[#202520] flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      camera?.connected
                        ? 'bg-[#16834A]'
                        : camera?.configured
                        ? 'bg-amber-500'
                        : 'bg-red-600'
                    }`}
                  />
                  <span>{camera?.statusLabel || 'Checking'}</span>
                </div>
              </div>

              <div>
                <div className="text-[#767E78]">Backend Connection</div>
                <div className="mt-1 font-medium text-[#202520] flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      health?.backend.connected ? 'bg-[#16834A]' : 'bg-red-600'
                    }`}
                  />
                  <span>{health?.backend.statusLabel || 'Checking'}</span>
                </div>
              </div>

              <div>
                <div className="text-[#767E78]">Camera Sensor</div>
                <div className="mt-1 font-mono text-[#202520]">
                  {camera?.sensor || 'GC2145'} ({camera?.device || 'ESP32-CAM'})
                </div>
              </div>

              <div>
                <div className="text-[#767E78]">Latest Frame Received</div>
                <div className="mt-1 font-mono tabular-nums text-[#202520]">
                  {formatTimestamp(camera?.lastFrameAt)}
                </div>
              </div>
            </div>

            {/* Latest Image Preview */}
            <div className="mt-4">
              {camera?.latestFrame ? (
                <div className="relative rounded-lg overflow-hidden border border-[#E5EAE6] bg-[#F7F9F7] aspect-[16/9]">
                  <img
                    src={camera.latestFrame.imageUrl}
                    alt="Latest ESP32-CAM GC2145 PCB frame"
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                  <div className="px-3 py-2 bg-white/95 border-t border-[#E5EAE6] flex items-center justify-between text-[11px] text-[#5C645E]">
                    <span className="font-mono">{camera.latestFrame.sourceType}</span>
                    <span className="font-mono tabular-nums">
                      {camera.latestFrame.width && camera.latestFrame.height
                        ? `${camera.latestFrame.width} × ${camera.latestFrame.height}`
                        : 'Frame ready'}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-dashed border-[#D6DDD7] bg-[#F7F9F7] p-6 text-center">
                  <WifiOff className="w-6 h-6 text-[#767E78] mx-auto mb-2" />
                  <div className="text-xs font-medium text-[#202520]">
                    No live ESP32-CAM frame received yet
                  </div>
                  <p className="text-xs text-[#5C645E] mt-1 leading-relaxed max-w-xs mx-auto">
                    {camera?.message ||
                      'Configure CAMERA_BACKEND_URL on the server or upload a PCB photograph on the Capture page.'}
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-[#E5EAE6] flex items-center justify-between text-xs">
            <span className="text-[#5C645E]">
              Adapter mode:{' '}
              <span className="font-mono text-[#202520]">
                {camera?.backendMode === 'supabase_adapter'
                  ? 'Supabase Edge Function'
                  : camera?.backendMode === 'direct_ingest'
                  ? 'Direct Ingest'
                  : 'Unconfigured'}
              </span>
            </span>
            <button
              type="button"
              onClick={onStartInspection}
              className="text-[#16834A] font-medium hover:underline inline-flex items-center gap-1 whitespace-nowrap"
            >
              <span>Open Camera Stage</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </section>

        {/* Recent AI Insights */}
        <section className="xl:col-span-7 bg-white rounded-xl border border-[#E5EAE6] p-5 flex flex-col justify-between shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
          <div>
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#E5EAE6]">
              <div>
                <h2 className="font-display text-base font-semibold text-[#202520]">
                  Recent AI Insights
                </h2>
                <p className="text-xs text-[#5C645E] mt-0.5">
                  Recently identified components and compatible low-voltage builds
                </p>
              </div>
            </div>

            {!summary || (summary.recentComponents.length === 0 && summary.recentProjects.length === 0) ? (
              <div className="py-12 text-center">
                <Cpu className="w-7 h-7 text-[#767E78] mx-auto mb-2.5" />
                <div className="text-sm font-medium text-[#202520]">
                  No PCB insights recorded yet
                </div>
                <p className="text-xs text-[#5C645E] mt-1 max-w-md mx-auto leading-relaxed">
                  Capture a frame from your ESP32-CAM, upload a PCB photograph manually, or test with
                  a labelled Demo Mode sample to generate component breakdowns and project ideas.
                </p>
                <button
                  type="button"
                  onClick={onStartInspection}
                  className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#16834A] text-white text-xs font-semibold hover:bg-[#126B3C] transition-colors"
                >
                  <span>Go to Capture Workspace</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Recent Components */}
                <div>
                  <h3 className="text-xs font-semibold text-[#5C645E] mb-2.5">
                    Recently Identified Components
                  </h3>
                  <div className="divide-y divide-[#E5EAE6] border border-[#E5EAE6] rounded-lg">
                    {summary.recentComponents.slice(0, 5).map((comp, idx) => (
                      <button
                        key={`${comp.inspectionId}-${idx}`}
                        type="button"
                        onClick={() => onViewReport(comp.inspectionId)}
                        className="w-full px-3.5 py-2.5 text-left hover:bg-[#F7F9F7] transition-colors flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-[#202520] truncate">
                            {comp.name}
                          </div>
                          <div className="text-[11px] text-[#5C645E] truncate mt-0.5">
                            {comp.category} · <span className="font-mono">{comp.marking}</span>
                            {comp.isDemo ? ' · Demo' : ''}
                          </div>
                        </div>
                        <span
                          className={`text-[11px] font-medium shrink-0 ${
                            comp.confidence === 'High'
                              ? 'text-[#16834A]'
                              : comp.confidence === 'Medium'
                              ? 'text-amber-700'
                              : 'text-[#5C645E]'
                          }`}
                        >
                          {comp.confidence}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recent Recommended Projects */}
                <div>
                  <h3 className="text-xs font-semibold text-[#5C645E] mb-2.5">
                    Compatible Project Builds
                  </h3>
                  <div className="divide-y divide-[#E5EAE6] border border-[#E5EAE6] rounded-lg">
                    {summary.recentProjects.length === 0 ? (
                      <div className="p-4 text-xs text-[#5C645E]">
                        Project recommendations will appear after a completed PCB inspection.
                      </div>
                    ) : (
                      summary.recentProjects.map((proj) => (
                        <button
                          key={proj.id}
                          type="button"
                          onClick={() => onViewProject(proj.inspectionId, proj.id)}
                          className="w-full px-3.5 py-2.5 text-left hover:bg-[#F7F9F7] transition-colors flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-[#202520] truncate">
                              {proj.projectName}
                            </div>
                            <div className="text-[11px] text-[#5C645E] truncate mt-0.5">
                              {proj.category} · {proj.difficulty}
                              {proj.isDemo ? ' · Demo' : ''}
                            </div>
                          </div>
                          <span className="font-mono tabular-nums text-[11px] text-[#16834A] shrink-0">
                            {proj.availableCount}/{proj.requiredCount} parts
                          </span>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Recent Inspection Activity Table */}
      <section className="bg-white rounded-xl border border-[#E5EAE6] shadow-[0_1px_2px_rgba(16,24,18,0.03)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5EAE6] flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-semibold text-[#202520]">
              Recent Inspection Activity
            </h2>
            <p className="text-xs text-[#5C645E] mt-0.5">
              Persistent inspection history stored in local database
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#767E78] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search ID or board..."
                className="pl-8 pr-3 py-1.5 text-xs rounded-lg border border-[#E5EAE6] bg-[#F7F9F7] focus:bg-white focus:outline-none focus:border-[#16834A] w-48"
              />
            </div>

            <div className="inline-flex items-center p-0.5 rounded-lg bg-[#F7F9F7] border border-[#E5EAE6]">
              {(['all', 'completed', 'failed'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors ${
                    statusFilter === tab
                      ? 'bg-white text-[#202520] shadow-xs'
                      : 'text-[#5C645E] hover:text-[#202520]'
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
        </div>

        {filteredInspections.length === 0 ? (
          <div className="py-12 px-5 text-center">
            <p className="text-sm font-medium text-[#202520]">
              {summary?.recentInspections.length
                ? 'No inspections match your search filter.'
                : 'No PCB inspections recorded yet.'}
            </p>
            <p className="text-xs text-[#5C645E] mt-1">
              {summary?.recentInspections.length
                ? 'Adjust your filter criteria to see past reports.'
                : 'Start a new inspection from the Capture workspace to analyze your first board.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#E5EAE6] bg-[#F7F9F7]/70 text-[11px] font-semibold text-[#5C645E]">
                  <th className="py-3 px-5">Inspection ID</th>
                  <th className="py-3 px-4">PCB Preview</th>
                  <th className="py-3 px-4">Board Identification</th>
                  <th className="py-3 px-4">Capture Date</th>
                  <th className="py-3 px-4 text-right">Detected Components</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E5EAE6] text-xs">
                {filteredInspections.map((item) => (
                  <tr key={item.id} className="hover:bg-[#F7F9F7]/60 transition-colors">
                    <td className="py-3 px-5 font-mono text-[#202520] whitespace-nowrap">
                      <div>{item.id}</div>
                      {item.isDemo && (
                        <div className="text-[10px] text-amber-700 font-sans mt-0.5">
                          Demo Sample
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <img
                        src={item.capture.imageUrl}
                        alt={item.boardType || item.capture.label}
                        referrerPolicy="no-referrer"
                        className="w-14 h-10 object-cover rounded border border-[#E5EAE6] bg-[#F7F9F7]"
                      />
                    </td>
                    <td className="py-3 px-4 max-w-[240px]">
                      <div className="font-medium text-[#202520] truncate">
                        {item.boardType || item.capture.label}
                      </div>
                      <div className="text-[#5C645E] truncate mt-0.5">
                        {item.likelyApplication || item.capture.sourceType}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-[#5C645E] whitespace-nowrap">
                      {formatTimestamp(item.createdAt)}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-right text-[#202520]">
                      {item.componentCount}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">{renderStatusText(item)}</td>
                    <td className="py-3 px-5 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onViewReport(item.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-[#E5EAE6] text-xs font-medium text-[#202520] hover:bg-white hover:border-[#16834A] hover:text-[#16834A] transition-colors"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Report</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDeleteId(item.id)}
                          className="p-1.5 rounded-lg border border-[#E5EAE6] text-[#767E78] hover:text-red-600 hover:border-red-200 hover:bg-red-50/40 transition-colors"
                          title="Delete inspection"
                          aria-label={`Delete inspection ${item.id}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmModal
        open={Boolean(pendingDeleteId)}
        title="Delete Inspection Report"
        message={`Permanently delete inspection ${pendingDeleteId}? This removes the stored report, component breakdown, and project recommendations.`}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteId(null)}
        loading={deleting}
      />
    </div>
  );
};
