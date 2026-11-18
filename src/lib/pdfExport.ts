import { jsPDF } from 'jspdf';
import type { InspectionRecord } from '../types/electrosku';

export function exportInspectionReportPdf(inspection: InspectionRecord): void {
  if (!inspection.report) return;
  const report = inspection.report;
  const doc = new jsPDF({ unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 44;
  const maxWidth = pageWidth - margin * 2;
  let y = 48;

  const ensureSpace = (needed: number) => {
    if (y + needed > pageHeight - 50) {
      doc.addPage();
      y = 48;
    }
  };

  const addSectionHeading = (title: string) => {
    ensureSpace(34);
    y += 10;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(22, 131, 74); // #16834A
    doc.text(title, margin, y);
    y += 6;
    doc.setDrawColor(229, 234, 230);
    doc.line(margin, y, pageWidth - margin, y);
    y += 14;
  };

  const addWrappedBlock = (label: string, text: string) => {
    ensureSpace(36);
    if (label) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(32, 37, 32);
      doc.text(label, margin, y);
      y += 13;
    }
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(65, 73, 67);
    const lines = doc.splitTextToSize(text || 'Not observed', maxWidth);
    for (const line of lines) {
      ensureSpace(14);
      doc.text(line, margin, y);
      y += 13;
    }
    y += 4;
  };

  // Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(22, 131, 74);
  doc.text('ElectroSKU', margin, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(92, 100, 94);
  doc.text('AI-Powered PCB Inspection & Technical Report', margin + 106, y - 1);
  y += 18;

  doc.setFontSize(9);
  doc.setTextColor(32, 37, 32);
  doc.text(`Inspection ID: ${inspection.id}`, margin, y);
  doc.text(
    `Generated: ${new Date(inspection.completedAt || inspection.createdAt).toLocaleString()}`,
    pageWidth - margin - 210,
    y
  );
  y += 14;
  doc.setDrawColor(22, 131, 74);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  // A. Overview
  addSectionHeading('A. PCB Overview');
  addWrappedBlock('Board Identification', report.pcbIdentification.boardType);
  addWrappedBlock('Likely Application', report.pcbIdentification.likelyApplication);
  addWrappedBlock('General Board Layout', report.pcbIdentification.generalBoardLayout);
  if (report.pcbIdentification.visibleBoardMarkings.length > 0) {
    addWrappedBlock(
      'Visible Board Markings',
      report.pcbIdentification.visibleBoardMarkings.join(' · ')
    );
  }

  // B. Detected Components
  addSectionHeading(`B. Detected Components (${report.components.length} entries)`);
  for (const comp of report.components) {
    ensureSpace(44);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(32, 37, 32);
    const title = `${comp.name} [${comp.category}]  —  Qty: ${comp.quantityEstimate}  |  Confidence: ${comp.confidence}`;
    doc.text(title, margin, y);
    y += 13;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.8);
    doc.setTextColor(75, 85, 78);
    const details = `Marking: ${comp.marking} | Function: ${comp.likelyFunction}`;
    const detailLines = doc.splitTextToSize(details, maxWidth - 10);
    for (const line of detailLines) {
      ensureSpace(12);
      doc.text(line, margin + 8, y);
      y += 12;
    }
    y += 4;
  }

  // C. Technical Analysis
  addSectionHeading('C. Functional & Technical Analysis');
  addWrappedBlock('Power-Management Section', report.functionalAnalysis.powerSection);
  addWrappedBlock('Processing & Control Section', report.functionalAnalysis.controlSection);
  addWrappedBlock('Communication Interfaces', report.functionalAnalysis.communicationSection);
  addWrappedBlock('Other Identifiable Sections', report.functionalAnalysis.otherSections);

  // D. Visual Observations
  addSectionHeading('D. Visual Observations & Markings');
  addWrappedBlock('Visible Damage', report.technicalObservations.visibleDamage);
  addWrappedBlock('Missing Components', report.technicalObservations.missingComponents);
  addWrappedBlock('Corrosion or Discoloration', report.technicalObservations.corrosionOrDiscoloration);
  addWrappedBlock('Unusual Features', report.technicalObservations.unusualFeatures);
  if (report.componentMarkingsSummary.unreadableMarkings.length > 0) {
    addWrappedBlock(
      'Unreadable Markings Reported',
      report.componentMarkingsSummary.unreadableMarkings.join('; ')
    );
  }

  // E. Summary & Physical Verification
  addSectionHeading('E. Engineering Summary & Physical Verification');
  addWrappedBlock('Technical Summary', report.technicalSummary);
  addWrappedBlock(
    'Requires Physical Verification',
    report.overallAssessment.requiresPhysicalVerification.map((v) => `• ${v}`).join('\n')
  );
  addWrappedBlock('Inspection Scope Disclaimer', report.visualInspectionDisclaimer);

  doc.save(`${inspection.id}_ElectroSKU_Report.pdf`);
}
