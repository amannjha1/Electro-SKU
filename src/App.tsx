import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion, MotionConfig } from 'motion/react';
import { SystemStatusBadges, TopNav, type AppRoute } from './components/TopNav';
import {
  analyzeCaptureStream,
  deleteInspection,
  fetchDashboardSummary,
  fetchInspectionById,
  fetchInspections,
  fetchSystemHealth,
  refreshCameraFrame,
  regenerateRecommendations,
} from './lib/api';
import { AnalysisPage, type AnalysisProgressState } from './pages/AnalysisPage';
import { CapturePage } from './pages/CapturePage';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import type {
  AnalysisStepId,
  AnalysisStepState,
  CameraStatus,
  CaptureRecord,
  DashboardSummary,
  InspectionRecord,
  SystemHealthStatus,
} from './types/electrosku';

function createInitialSteps(): Record<
  AnalysisStepId,
  { state: AnalysisStepState; detail?: string }
> {
  return {
    receiving_image: { state: 'pending' },
    examining_layout: { state: 'pending' },
    reading_markings: { state: 'pending' },
    identifying_components: { state: 'pending' },
    preparing_report: { state: 'pending' },
    generating_projects: { state: 'pending' },
  };
}

function getInitialRoute(): AppRoute {
  const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
  if (hash === 'capture' || hash === 'analysis' || hash === 'projects' || hash === 'dashboard') {
    return hash;
  }
  return 'dashboard';
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(getInitialRoute);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [health, setHealth] = useState<SystemHealthStatus | null>(null);
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [inspections, setInspections] = useState<InspectionRecord[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);

  const [activeCapture, setActiveCapture] = useState<CaptureRecord | null>(null);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);

  const [analysisProgress, setAnalysisProgress] = useState<AnalysisProgressState>({
    active: false,
    capture: null,
    steps: createInitialSteps(),
    error: null,
    warning: null,
  });

  const navigate = useCallback((nextRoute: AppRoute) => {
    setRoute(nextRoute);
    window.location.hash = nextRoute;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const onHashChange = () => {
      setRoute(getInitialRoute());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const refreshWorkspaceData = useCallback(async () => {
    try {
      const [healthData, dashData, inspectionList] = await Promise.all([
        fetchSystemHealth(),
        fetchDashboardSummary(),
        fetchInspections({ limit: 100 }),
      ]);
      setHealth(healthData);
      setDashboard(dashData);
      setInspections(inspectionList);

      setSelectedInspectionId((prev) => {
        if (prev && inspectionList.some((i) => i.id === prev)) return prev;
        return inspectionList[0]?.id || null;
      });
    } catch {
      // Health/backend state handled gracefully via SystemHealthStatus check
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    refreshWorkspaceData();
    const interval = setInterval(() => {
      fetchSystemHealth()
        .then(setHealth)
        .catch(() => undefined);
    }, 15000);
    return () => clearInterval(interval);
  }, [refreshWorkspaceData]);

  const selectedInspection = useMemo(() => {
    if (!selectedInspectionId) return inspections[0] || null;
    return inspections.find((i) => i.id === selectedInspectionId) || inspections[0] || null;
  }, [inspections, selectedInspectionId]);

  const completedInspections = useMemo(
    () => inspections.filter((i) => i.status === 'completed'),
    [inspections]
  );

  const handleCameraStatusUpdated = useCallback((camera: CameraStatus) => {
    setHealth((prev) => (prev ? { ...prev, camera } : prev));
  }, []);

  const handleRefreshCamera = useCallback(async () => {
    const res = await refreshCameraFrame();
    handleCameraStatusUpdated(res.status);
    if (res.capture) {
      setActiveCapture(res.capture);
    }
    await refreshWorkspaceData();
  }, [handleCameraStatusUpdated, refreshWorkspaceData]);

  const handleAnalyzeCapture = useCallback(
    async (capture: CaptureRecord) => {
      setActiveCapture(capture);
      setSelectedProjectId(null);
      setAnalysisProgress({
        active: true,
        capture,
        steps: createInitialSteps(),
        error: null,
        warning: null,
      });
      navigate('analysis');

      try {
        await analyzeCaptureStream(capture.id, {
          onCreated: (inspectionId) => {
            setSelectedInspectionId(inspectionId);
          },
          onStep: (step, state, detail) => {
            setAnalysisProgress((prev) => ({
              ...prev,
              steps: {
                ...prev.steps,
                [step]: { state, detail },
              },
            }));
          },
          onComplete: async (inspection, warning) => {
            setSelectedInspectionId(inspection.id);
            setAnalysisProgress((prev) => ({
              ...prev,
              active: false,
              warning,
            }));
            await refreshWorkspaceData();
          },
          onError: async (errorMessage) => {
            setAnalysisProgress((prev) => ({
              ...prev,
              active: false,
              error: errorMessage,
            }));
            await refreshWorkspaceData();
          },
        });
      } catch (err) {
        setAnalysisProgress((prev) => ({
          ...prev,
          active: false,
          error: err instanceof Error ? err.message : 'PCB inspection failed.',
        }));
      }
    },
    [navigate, refreshWorkspaceData]
  );

  const handleViewReport = useCallback(
    async (inspectionId: string) => {
      setSelectedInspectionId(inspectionId);
      setAnalysisProgress((prev) => ({ ...prev, active: false, error: null, warning: null }));
      navigate('analysis');
      try {
        const fresh = await fetchInspectionById(inspectionId);
        setInspections((prev) =>
          prev.some((i) => i.id === fresh.id)
            ? prev.map((i) => (i.id === fresh.id ? fresh : i))
            : [fresh, ...prev]
        );
      } catch {
        // Fallback to existing list entry
      }
    },
    [navigate]
  );

  const handleViewProject = useCallback(
    (inspectionId: string, projectId: string) => {
      setSelectedInspectionId(inspectionId);
      setSelectedProjectId(projectId);
      navigate('projects');
    },
    [navigate]
  );

  const handleDeleteInspection = useCallback(
    async (inspectionId: string) => {
      await deleteInspection(inspectionId);
      if (selectedInspectionId === inspectionId) {
        setSelectedInspectionId(null);
      }
      await refreshWorkspaceData();
    },
    [refreshWorkspaceData, selectedInspectionId]
  );

  const handleRegenerateProjects = useCallback(
    async (inspectionId: string) => {
      const result = await regenerateRecommendations(inspectionId);
      setInspections((prev) =>
        prev.map((ins) => (ins.id === inspectionId ? result.inspection : ins))
      );
      await refreshWorkspaceData();
    },
    [refreshWorkspaceData]
  );

  const handleGenerateOrViewProjects = useCallback(
    async (inspectionId: string) => {
      const target = inspections.find((i) => i.id === inspectionId);
      setSelectedInspectionId(inspectionId);
      setSelectedProjectId(null);
      if (target && target.recommendations.length === 0) {
        await handleRegenerateProjects(inspectionId);
      }
      navigate('projects');
    },
    [handleRegenerateProjects, inspections, navigate]
  );

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen bg-white text-[#202520] flex flex-col">
        <TopNav
          activeRoute={route}
          onNavigate={navigate}
          health={health}
          mobileOpen={mobileNavOpen}
          onToggleMobile={setMobileNavOpen}
        />

        <main className="flex-1 min-w-0 bg-white">
          <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={route}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {route === 'dashboard' && (
                  <DashboardPage
                    summary={dashboard}
                    health={health}
                    loading={loadingInitial}
                    onStartInspection={() => navigate('capture')}
                    onViewReport={handleViewReport}
                    onViewProject={handleViewProject}
                    onDeleteInspection={handleDeleteInspection}
                    onRefreshCamera={handleRefreshCamera}
                  />
                )}

                {route === 'capture' && (
                  <CapturePage
                    cameraStatus={health?.camera || null}
                    activeCapture={activeCapture}
                    onSelectCapture={setActiveCapture}
                    onAnalyzeCapture={handleAnalyzeCapture}
                    onCameraStatusUpdated={handleCameraStatusUpdated}
                  />
                )}

                {route === 'analysis' && (
                  <AnalysisPage
                    inspections={inspections}
                    selectedInspection={selectedInspection}
                    progress={analysisProgress}
                    onSelectInspection={(ins) => {
                      setSelectedInspectionId(ins.id);
                      setAnalysisProgress((prev) => ({
                        ...prev,
                        active: false,
                        error: null,
                        warning: null,
                      }));
                    }}
                    onDeleteInspection={handleDeleteInspection}
                    onGoToCapture={() => navigate('capture')}
                    onGenerateOrViewProjects={handleGenerateOrViewProjects}
                  />
                )}

                {route === 'projects' && (
                  <ProjectsPage
                    completedInspections={completedInspections}
                    selectedInspection={selectedInspection}
                    selectedProjectId={selectedProjectId}
                    onSelectInspection={(ins) => setSelectedInspectionId(ins.id)}
                    onSelectProject={setSelectedProjectId}
                    onRegenerateProjects={handleRegenerateProjects}
                    onGoToCapture={() => navigate('capture')}
                  />
                )}
              </motion.div>
            </AnimatePresence>

            <footer className="mt-12 pt-5 border-t border-[#E5EAE6] flex flex-col lg:flex-row lg:items-center justify-between gap-4 text-xs text-[#767E78] no-print">
              <div className="space-y-1">
                <div className="text-[#5C645E] font-medium">
                  ElectroSKU — AI-Powered PCB Inspection &amp; Intelligence
                </div>
                <div>
                  Optical analysis supports inspection; verify electrical ratings physically before bench assembly.
                </div>
              </div>
              <SystemStatusBadges health={health} />
            </footer>
          </div>
        </main>
      </div>
    </MotionConfig>
  );
}
