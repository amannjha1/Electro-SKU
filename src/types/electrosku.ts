export type CaptureSourceType =
  | 'LIVE_FRAME'
  | 'MANUAL_CAPTURE'
  | 'MANUAL_UPLOAD'
  | 'DEMO_SAMPLE';

export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export type InspectionStatus = 'pending' | 'analyzing' | 'completed' | 'failed';

export type ProjectDifficulty = 'Beginner' | 'Intermediate' | 'Advanced';

export type AnalysisStepId =
  | 'receiving_image'
  | 'examining_layout'
  | 'reading_markings'
  | 'identifying_components'
  | 'preparing_report'
  | 'generating_projects';

export type AnalysisStepState = 'pending' | 'active' | 'completed' | 'failed';

export interface CaptureRecord {
  id: string;
  sourceType: CaptureSourceType;
  filename: string;
  originalName: string;
  mimeType: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  fileSize: number;
  isDemo: boolean;
  label: string;
  capturedAt: string;
  createdAt: string;
}

export interface DetectedComponent {
  id?: string;
  name: string;
  category: string;
  marking: string;
  quantityEstimate: number;
  likelyFunction: string;
  confidence: ConfidenceLevel;
  confidenceReason: string;
}

export interface PcbAnalysisReport {
  pcbIdentification: {
    boardType: string;
    likelyApplication: string;
    visibleBoardMarkings: string[];
    generalBoardLayout: string;
  };
  components: DetectedComponent[];
  componentMarkingsSummary: {
    readableMarkings: string[];
    unreadableMarkings: string[];
  };
  functionalAnalysis: {
    powerSection: string;
    controlSection: string;
    communicationSection: string;
    otherSections: string;
  };
  technicalObservations: {
    visibleDamage: string;
    missingComponents: string;
    corrosionOrDiscoloration: string;
    unusualFeatures: string;
  };
  overallAssessment: {
    summary: string;
    likelyPurpose: string;
    requiresPhysicalVerification: string[];
  };
  technicalSummary: string;
  visualInspectionDisclaimer: string;
}

export interface BlockDiagramNode {
  id: string;
  label: string;
  role: string;
}

export interface BlockDiagramEdge {
  from: string;
  to: string;
  signal: string;
}

export interface ProjectRecommendation {
  id: string;
  inspectionId: string;
  projectName: string;
  category: string;
  description: string;
  difficulty: ProjectDifficulty;
  estimatedBuildTime: string;
  componentsRequired: string[];
  componentsAvailableFromPcb: string[];
  additionalComponentsNeeded: string[];
  learningOutcomes: string[];
  suitabilityExplanation: string;
  compatibilityChecks: string[];
  blockDiagram: {
    nodes: BlockDiagramNode[];
    edges: BlockDiagramEdge[];
  };
  createdAt: string;
}

export interface InspectionRecord {
  id: string;
  captureId: string;
  capture: CaptureRecord;
  status: InspectionStatus;
  boardType: string;
  likelyApplication: string;
  boardSummary: string;
  componentCount: number;
  report: PcbAnalysisReport | null;
  recommendations: ProjectRecommendation[];
  errorMessage: string | null;
  modelUsed: string | null;
  isDemo: boolean;
  createdAt: string;
  completedAt: string | null;
}

export interface CameraStatus {
  configured: boolean;
  connected: boolean;
  device: string;
  sensor: string;
  cadenceMs: number;
  remoteCaptureSupported: boolean;
  backendMode: 'supabase_adapter' | 'direct_ingest' | 'unconfigured';
  latestFrame: CaptureRecord | null;
  lastCheckedAt: string;
  lastFrameAt: string | null;
  statusLabel: string;
  message: string;
}

export interface SystemHealthStatus {
  backend: {
    connected: boolean;
    statusLabel: string;
    uptimeSeconds: number;
    databaseReady: boolean;
  };
  gemini: {
    configured: boolean;
    model: string;
    statusLabel: string;
  };
  camera: CameraStatus;
}

export interface DashboardSummary {
  stats: {
    totalCaptures: number;
    successfulAnalyses: number;
    componentsIdentified: number;
    projectsRecommended: number;
  };
  recentInspections: InspectionRecord[];
  recentComponents: Array<{
    inspectionId: string;
    boardType: string;
    name: string;
    category: string;
    marking: string;
    confidence: ConfidenceLevel;
    isDemo: boolean;
  }>;
  recentProjects: Array<{
    id: string;
    inspectionId: string;
    projectName: string;
    category: string;
    difficulty: ProjectDifficulty;
    availableCount: number;
    requiredCount: number;
    isDemo: boolean;
  }>;
}

export interface DemoSampleInfo {
  id: 'microcontroller' | 'power_relay';
  title: string;
  subtitle: string;
  imageUrl: string;
}
