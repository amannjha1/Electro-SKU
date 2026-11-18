import crypto from 'node:crypto';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { db } from '../db.ts';
import { GEMINI_ANALYSIS_MODEL, mapGeminiError, withGeminiRetry } from './geminiService.ts';
import type {
  BlockDiagramEdge,
  BlockDiagramNode,
  PcbAnalysisReport,
  ProjectDifficulty,
  ProjectRecommendation,
} from '../../src/types/electrosku.ts';

const RECOMMENDATION_SYSTEM_INSTRUCTION = `You are ElectroSKU's embedded electronics engineering advisor.

Given the actual components and technical findings identified from a PCB inspection report, recommend practical, safe, educational, low-voltage electronics projects that can be built using the components observed on the PCB (plus clearly listed additional supporting components where required).

Strict Engineering Rules:
1. Do not recommend projects merely because a component name sounds relevant. Verify logical compatibility, typical voltage levels, and required supporting circuitry (e.g., current-limiting resistors, flyback diodes, decoupling capacitors, USB-UART bridges, level shifters).
2. If component ratings, capacitance/resistance values, or silicon pinouts could not be verified from the inspection image, explicitly state what must be checked with a multimeter, datasheet, or bench supply before use.
3. Never assume a salvaged or inspected PCB component is safe or electrically functional solely because it is visible in a photograph.
4. Keep all recommended projects educational and focused on safe low-voltage electronics (e.g., 3.3V, 5V, or 12V DC bench work — never recommend mains AC wiring without explicit isolation warnings and keep builds low-voltage).
5. Return 4 to 5 well-differentiated project ideas spanning relevant categories such as Microcontroller projects, LED-based projects, Sensor-based projects, Basic automation, Educational electronics, Simple monitoring systems, or Low-voltage IoT projects.`;

function createGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add your Gemini API key in Settings > Secrets.'
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function normalizeDifficulty(val: unknown): ProjectDifficulty {
  const s = String(val || '').trim().toLowerCase();
  if (s === 'beginner') return 'Beginner';
  if (s === 'advanced') return 'Advanced';
  return 'Intermediate';
}

function toStringArray(val: unknown): string[] {
  return Array.isArray(val) ? val.map((item) => String(item).trim()).filter(Boolean) : [];
}

export async function generateProjectRecommendationsForInspection(params: {
  inspectionId: string;
  report: PcbAnalysisReport;
}): Promise<ProjectRecommendation[]> {
  const ai = createGeminiClient();

  const compactContext = {
    pcbIdentification: params.report.pcbIdentification,
    detectedComponents: params.report.components,
    functionalAnalysis: params.report.functionalAnalysis,
    technicalObservations: params.report.technicalObservations,
    requiresPhysicalVerification: params.report.overallAssessment.requiresPhysicalVerification,
  };

  try {
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: GEMINI_ANALYSIS_MODEL,
      contents: `Based strictly on the following verified PCB inspection report, recommend 4 to 5 realistic, educational low-voltage electronics projects:\n\n${JSON.stringify(
        compactContext,
        null,
        2
      )}`,
      config: {
        systemInstruction: RECOMMENDATION_SYSTEM_INSTRUCTION,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MEDIUM,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              projectName: { type: Type.STRING },
              category: {
                type: Type.STRING,
                description:
                  'One of: Microcontroller, LED & Display, Sensor, Basic Automation, Educational Electronics, Monitoring System, Low-Voltage IoT.',
              },
              description: { type: Type.STRING },
              difficulty: {
                type: Type.STRING,
                description: 'Must be Beginner, Intermediate, or Advanced.',
              },
              estimatedBuildTime: { type: Type.STRING },
              componentsRequired: { type: Type.ARRAY, items: { type: Type.STRING } },
              componentsAvailableFromPcb: { type: Type.ARRAY, items: { type: Type.STRING } },
              additionalComponentsNeeded: { type: Type.ARRAY, items: { type: Type.STRING } },
              learningOutcomes: { type: Type.ARRAY, items: { type: Type.STRING } },
              suitabilityExplanation: { type: Type.STRING },
              compatibilityChecks: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: 'Missing specifications, voltage checks, or physical verification steps required before powering.',
              },
              blockDiagram: {
                type: Type.OBJECT,
                properties: {
                  nodes: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        id: { type: Type.STRING },
                        label: { type: Type.STRING },
                        role: { type: Type.STRING, description: 'e.g. Power, Control, Input, Output, Communication' },
                      },
                      required: ['id', 'label', 'role'],
                    },
                  },
                  edges: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        from: { type: Type.STRING },
                        to: { type: Type.STRING },
                        signal: { type: Type.STRING, description: 'e.g. 3.3V Regulated, I2C SDA/SCL, GPIO PWM' },
                      },
                      required: ['from', 'to', 'signal'],
                    },
                  },
                },
                required: ['nodes', 'edges'],
              },
            },
            required: [
              'projectName',
              'category',
              'description',
              'difficulty',
              'estimatedBuildTime',
              'componentsRequired',
              'componentsAvailableFromPcb',
              'additionalComponentsNeeded',
              'learningOutcomes',
              'suitabilityExplanation',
              'compatibilityChecks',
              'blockDiagram',
            ],
          },
        },
        },
      })
    );

    const rawText = (response.text || '[]').trim();
    const parsed = JSON.parse(rawText);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error('Gemini did not return any valid project recommendations.');
    }

    const now = new Date().toISOString();
    const recommendations: ProjectRecommendation[] = parsed
      .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
      .map((item) => {
        const rawDiagram = (item.blockDiagram || {}) as Record<string, unknown>;
        const nodes: BlockDiagramNode[] = Array.isArray(rawDiagram.nodes)
          ? rawDiagram.nodes
              .filter((n): n is Record<string, unknown> => Boolean(n && typeof n === 'object'))
              .map((n, idx) => ({
                id: String(n.id || `node_${idx + 1}`).trim(),
                label: String(n.label || 'Block').trim(),
                role: String(n.role || 'Module').trim(),
              }))
          : [];

        const edges: BlockDiagramEdge[] = Array.isArray(rawDiagram.edges)
          ? rawDiagram.edges
              .filter((e): e is Record<string, unknown> => Boolean(e && typeof e === 'object'))
              .map((e) => ({
                from: String(e.from || '').trim(),
                to: String(e.to || '').trim(),
                signal: String(e.signal || 'Signal').trim(),
              }))
              .filter((e) => e.from && e.to)
          : [];

        return {
          id: `PRJ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`,
          inspectionId: params.inspectionId,
          projectName: String(item.projectName || 'Low-Voltage Electronics Build').trim(),
          category: String(item.category || 'Educational Electronics').trim(),
          description: String(item.description || '').trim(),
          difficulty: normalizeDifficulty(item.difficulty),
          estimatedBuildTime: String(item.estimatedBuildTime || '2-3 hours').trim(),
          componentsRequired: toStringArray(item.componentsRequired),
          componentsAvailableFromPcb: toStringArray(item.componentsAvailableFromPcb),
          additionalComponentsNeeded: toStringArray(item.additionalComponentsNeeded),
          learningOutcomes: toStringArray(item.learningOutcomes),
          suitabilityExplanation: String(item.suitabilityExplanation || '').trim(),
          compatibilityChecks:
            toStringArray(item.compatibilityChecks).length > 0
              ? toStringArray(item.compatibilityChecks)
              : ['Verify operating voltage and continuity on the salvaged/inspected board before connecting external modules.'],
          blockDiagram: { nodes, edges },
          createdAt: now,
        };
      });

    saveRecommendationsForInspection(params.inspectionId, recommendations);
    return recommendations;
  } catch (err) {
    throw new Error(mapGeminiError(err));
  }
}

export function saveRecommendationsForInspection(
  inspectionId: string,
  recommendations: ProjectRecommendation[]
): void {
  db.prepare(`DELETE FROM recommendations WHERE inspection_id = ?`).run(inspectionId);

  const insert = db.prepare(`
    INSERT INTO recommendations (
      id, inspection_id, project_name, category, description, difficulty,
      estimated_build_time, components_required_json, components_available_json,
      additional_components_json, learning_outcomes_json, suitability_explanation,
      compatibility_checks_json, block_diagram_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const rec of recommendations) {
    insert.run(
      rec.id,
      inspectionId,
      rec.projectName,
      rec.category,
      rec.description,
      rec.difficulty,
      rec.estimatedBuildTime,
      JSON.stringify(rec.componentsRequired),
      JSON.stringify(rec.componentsAvailableFromPcb),
      JSON.stringify(rec.additionalComponentsNeeded),
      JSON.stringify(rec.learningOutcomes),
      rec.suitabilityExplanation,
      JSON.stringify(rec.compatibilityChecks),
      JSON.stringify(rec.blockDiagram),
      rec.createdAt
    );
  }
}
