import { db } from '../db.ts';
import { deleteCaptureById, mapCaptureRow } from './imageService.ts';
import type {
  BlockDiagramEdge,
  BlockDiagramNode,
  ConfidenceLevel,
  DashboardSummary,
  DetectedComponent,
  InspectionRecord,
  InspectionStatus,
  PcbAnalysisReport,
  ProjectDifficulty,
  ProjectRecommendation,
} from '../../src/types/electrosku.ts';

function safeJsonParse<T>(raw: unknown, fallback: T): T {
  if (typeof raw !== 'string' || !raw.trim()) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function getComponentsForInspection(inspectionId: string): DetectedComponent[] {
  const rows = db
    .prepare(
      `SELECT id, name, category, marking, quantity_estimate, likely_function, confidence, confidence_reason
       FROM components
       WHERE inspection_id = ?`
    )
    .all(inspectionId) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    category: String(row.category),
    marking: String(row.marking),
    quantityEstimate: Number(row.quantity_estimate || 1),
    likelyFunction: String(row.likely_function),
    confidence: String(row.confidence || 'Medium') as ConfidenceLevel,
    confidenceReason: String(row.confidence_reason || ''),
  }));
}

function getRecommendationsForInspection(inspectionId: string): ProjectRecommendation[] {
  const rows = db
    .prepare(
      `SELECT id, inspection_id, project_name, category, description, difficulty,
              estimated_build_time, components_required_json, components_available_json,
              additional_components_json, learning_outcomes_json, suitability_explanation,
              compatibility_checks_json, block_diagram_json, created_at
       FROM recommendations
       WHERE inspection_id = ?
       ORDER BY created_at DESC`
    )
    .all(inspectionId) as Record<string, unknown>[];

  return rows.map((row) => ({
    id: String(row.id),
    inspectionId: String(row.inspection_id),
    projectName: String(row.project_name),
    category: String(row.category),
    description: String(row.description),
    difficulty: String(row.difficulty || 'Intermediate') as ProjectDifficulty,
    estimatedBuildTime: String(row.estimated_build_time || ''),
    componentsRequired: safeJsonParse<string[]>(row.components_required_json, []),
    componentsAvailableFromPcb: safeJsonParse<string[]>(row.components_available_json, []),
    additionalComponentsNeeded: safeJsonParse<string[]>(row.additional_components_json, []),
    learningOutcomes: safeJsonParse<string[]>(row.learning_outcomes_json, []),
    suitabilityExplanation: String(row.suitability_explanation || ''),
    compatibilityChecks: safeJsonParse<string[]>(row.compatibility_checks_json, []),
    blockDiagram: safeJsonParse<{ nodes: BlockDiagramNode[]; edges: BlockDiagramEdge[] }>(
      row.block_diagram_json,
      { nodes: [], edges: [] }
    ),
    createdAt: String(row.created_at),
  }));
}

export function getInspectionById(inspectionId: string): InspectionRecord | null {
  const row = db
    .prepare(
      `SELECT
        i.id AS i_id, i.capture_id AS i_capture_id, i.status AS i_status,
        i.board_type AS i_board_type, i.likely_application AS i_likely_application,
        i.board_summary AS i_board_summary, i.report_json AS i_report_json,
        i.error_message AS i_error_message, i.model_used AS i_model_used,
        i.is_demo AS i_is_demo, i.created_at AS i_created_at, i.completed_at AS i_completed_at,
        c.id AS c_id, c.source_type, c.filename, c.original_name, c.mime_type, c.file_path,
        c.width, c.height, c.file_size, c.is_demo AS c_is_demo, c.label, c.captured_at, c.created_at AS c_created_at
       FROM inspections i
       JOIN captures c ON i.capture_id = c.id
       WHERE i.id = ?`
    )
    .get(inspectionId) as Record<string, unknown> | undefined;

  if (!row) return null;

  const capture = mapCaptureRow({
    id: row.c_id,
    source_type: row.source_type,
    filename: row.filename,
    original_name: row.original_name,
    mime_type: row.mime_type,
    file_path: row.file_path,
    width: row.width,
    height: row.height,
    file_size: row.file_size,
    is_demo: row.c_is_demo,
    label: row.label,
    captured_at: row.captured_at,
    created_at: row.c_created_at,
  });

  const report = safeJsonParse<PcbAnalysisReport | null>(row.i_report_json, null);
  const components = getComponentsForInspection(inspectionId);
  if (report && components.length > 0) {
    report.components = components;
  }

  const recommendations = getRecommendationsForInspection(inspectionId);

  return {
    id: String(row.i_id),
    captureId: String(row.i_capture_id),
    capture,
    status: String(row.i_status) as InspectionStatus,
    boardType: String(row.i_board_type || ''),
    likelyApplication: String(row.i_likely_application || ''),
    boardSummary: String(row.i_board_summary || ''),
    componentCount: components.length,
    report,
    recommendations,
    errorMessage: row.i_error_message ? String(row.i_error_message) : null,
    modelUsed: row.i_model_used ? String(row.i_model_used) : null,
    isDemo: Boolean(row.i_is_demo),
    createdAt: String(row.i_created_at),
    completedAt: row.i_completed_at ? String(row.i_completed_at) : null,
  };
}

export function listInspections(filters?: {
  search?: string;
  status?: string;
  limit?: number;
}): InspectionRecord[] {
  const limit = Math.min(Math.max(Number(filters?.limit || 50), 1), 200);
  const rows = db
    .prepare(
      `SELECT id FROM inspections
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as Array<{ id: string }>;

  let records = rows
    .map((r) => getInspectionById(r.id))
    .filter((r): r is InspectionRecord => r !== null);

  if (filters?.status && filters.status !== 'all') {
    records = records.filter((r) => r.status === filters.status);
  }

  if (filters?.search && filters.search.trim()) {
    const q = filters.search.trim().toLowerCase();
    records = records.filter((r) => {
      const inHeader =
        r.id.toLowerCase().includes(q) ||
        r.boardType.toLowerCase().includes(q) ||
        r.likelyApplication.toLowerCase().includes(q) ||
        r.capture.label.toLowerCase().includes(q);
      const inComponents =
        r.report?.components.some(
          (c) =>
            c.name.toLowerCase().includes(q) ||
            c.marking.toLowerCase().includes(q) ||
            c.category.toLowerCase().includes(q)
        ) || false;
      return inHeader || inComponents;
    });
  }

  return records;
}

export function deleteInspectionById(inspectionId: string): boolean {
  const existing = db
    .prepare(`SELECT capture_id FROM inspections WHERE id = ?`)
    .get(inspectionId) as { capture_id: string } | undefined;

  if (!existing) return false;

  db.prepare(`DELETE FROM inspections WHERE id = ?`).run(inspectionId);

  const remainingForCapture = db
    .prepare(`SELECT COUNT(*) AS cnt FROM inspections WHERE capture_id = ?`)
    .get(existing.capture_id) as { cnt: number };

  if ((remainingForCapture?.cnt || 0) === 0) {
    deleteCaptureById(existing.capture_id);
  }

  return true;
}

export function getDashboardSummary(): DashboardSummary {
  const totalCapturesRow = db.prepare(`SELECT COUNT(*) AS cnt FROM captures`).get() as { cnt: number };
  const completedAnalysesRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM inspections WHERE status = 'completed'`)
    .get() as { cnt: number };
  const componentsCountRow = db
    .prepare(`SELECT COALESCE(SUM(quantity_estimate), 0) AS total FROM components`)
    .get() as { total: number };
  const projectsCountRow = db
    .prepare(`SELECT COUNT(*) AS cnt FROM recommendations`)
    .get() as { cnt: number };

  const recentInspections = listInspections({ limit: 8 });

  const recentCompRows = db
    .prepare(
      `SELECT cmp.inspection_id, i.board_type, cmp.name, cmp.category, cmp.marking, cmp.confidence, i.is_demo
       FROM components cmp
       JOIN inspections i ON cmp.inspection_id = i.id
       WHERE i.status = 'completed'
       ORDER BY i.completed_at DESC
       LIMIT 6`
    )
    .all() as Record<string, unknown>[];

  const recentProjRows = db
    .prepare(
      `SELECT r.id, r.inspection_id, r.project_name, r.category, r.difficulty,
              r.components_available_json, r.components_required_json, i.is_demo
       FROM recommendations r
       JOIN inspections i ON r.inspection_id = i.id
       ORDER BY r.created_at DESC
       LIMIT 4`
    )
    .all() as Record<string, unknown>[];

  return {
    stats: {
      totalCaptures: Number(totalCapturesRow?.cnt || 0),
      successfulAnalyses: Number(completedAnalysesRow?.cnt || 0),
      componentsIdentified: Number(componentsCountRow?.total || 0),
      projectsRecommended: Number(projectsCountRow?.cnt || 0),
    },
    recentInspections,
    recentComponents: recentCompRows.map((row) => ({
      inspectionId: String(row.inspection_id),
      boardType: String(row.board_type || 'PCB Inspection'),
      name: String(row.name),
      category: String(row.category),
      marking: String(row.marking),
      confidence: String(row.confidence || 'Medium') as ConfidenceLevel,
      isDemo: Boolean(row.is_demo),
    })),
    recentProjects: recentProjRows.map((row) => {
      const avail = safeJsonParse<string[]>(row.components_available_json, []);
      const req = safeJsonParse<string[]>(row.components_required_json, []);
      return {
        id: String(row.id),
        inspectionId: String(row.inspection_id),
        projectName: String(row.project_name),
        category: String(row.category),
        difficulty: String(row.difficulty || 'Intermediate') as ProjectDifficulty,
        availableCount: avail.length,
        requiredCount: req.length,
        isDemo: Boolean(row.is_demo),
      };
    }),
  };
}
