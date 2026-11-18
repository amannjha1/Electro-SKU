import crypto from 'node:crypto';
import { db } from '../db.ts';
import type { CaptureRecord, PcbAnalysisReport } from '../../src/types/electrosku.ts';

export function createInspectionEntry(capture: CaptureRecord): string {
  const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const randomPart = crypto.randomBytes(2).toString('hex').toUpperCase();
  const id = `INS-${datePart}-${randomPart}`;
  const now = new Date().toISOString();

  db.prepare(
    `INSERT INTO inspections (
      id, capture_id, status, board_type, likely_application, board_summary,
      report_json, error_message, model_used, is_demo, created_at, completed_at
    ) VALUES (?, ?, 'analyzing', '', '', '', NULL, NULL, NULL, ?, ?, NULL)`
  ).run(id, capture.id, capture.isDemo ? 1 : 0, now);

  return id;
}

export function saveCompletedInspectionReport(params: {
  inspectionId: string;
  report: PcbAnalysisReport;
  modelUsed: string;
}): void {
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE inspections
     SET status = 'completed',
         board_type = ?,
         likely_application = ?,
         board_summary = ?,
         report_json = ?,
         error_message = NULL,
         model_used = ?,
         completed_at = ?
     WHERE id = ?`
  ).run(
    params.report.pcbIdentification.boardType,
    params.report.pcbIdentification.likelyApplication,
    params.report.overallAssessment.summary,
    JSON.stringify(params.report),
    params.modelUsed,
    now,
    params.inspectionId
  );

  db.prepare(`DELETE FROM components WHERE inspection_id = ?`).run(params.inspectionId);

  const insertComp = db.prepare(
    `INSERT INTO components (
      id, inspection_id, name, category, marking, quantity_estimate,
      likely_function, confidence, confidence_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const comp of params.report.components) {
    const compId = `CMP-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    insertComp.run(
      compId,
      params.inspectionId,
      comp.name,
      comp.category,
      comp.marking,
      comp.quantityEstimate,
      comp.likelyFunction,
      comp.confidence,
      comp.confidenceReason
    );
  }
}

export function markInspectionFailed(inspectionId: string, errorMessage: string): void {
  db.prepare(
    `UPDATE inspections
     SET status = 'failed',
         error_message = ?
     WHERE id = ?`
  ).run(errorMessage, inspectionId);
}
