import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type { ConfidenceLevel, DetectedComponent, PcbAnalysisReport } from '../../src/types/electrosku.ts';

export const GEMINI_ANALYSIS_MODEL = 'gemini-4-hydrogen';

const PCB_SYSTEM_INSTRUCTION = `You are ElectroSKU's professional electronic PCB inspection and component recognition AI.

Your task is to carefully examine uploaded photographs of printed circuit boards.

Analyze only what is visually supported by the photograph.

Identify visible electronic components, read their printed markings, recognize PCB sections and explain their likely functions.

Do not invent component specifications, model numbers, values or electrical ratings.

If a marking is unreadable, explicitly report it as unreadable.

If component identification is uncertain, provide a confidence level and explain the uncertainty.

Distinguish between confirmed observations and educated guesses.

Perform the following analysis:

1. PCB identification:
   - Board type, if recognizable.
   - Likely application.
   - Visible board markings.
   - General board layout.

2. Component identification:
   - Resistors.
   - Capacitors.
   - Diodes.
   - LEDs.
   - Transistors.
   - MOSFETs.
   - Integrated circuits.
   - Microcontrollers.
   - Connectors.
   - Inductors.
   - Relays.
   - Other identifiable electronic components.

3. Component markings:
   - Read visible text.
   - Extract printed model numbers.
   - Identify readable part numbers.
   - Report unreadable markings honestly.

4. Functional analysis:
   - Explain the likely purpose of major components.
   - Identify possible power-management sections.
   - Identify possible processing or control sections.
   - Identify communication interfaces when visible.

5. Technical observations:
   - Visible damage, if any.
   - Missing components, only when clearly evident.
   - Corrosion or discoloration, if visible.
   - Unusual board features.

6. Overall assessment:
   - Summarize the PCB.
   - Explain its likely purpose.
   - List information that requires physical verification.

7. Confidence:
   - Assign confidence (High, Medium, or Low) to each component identification.
   - Do not present uncertain guesses as confirmed facts.`;

function createGeminiClient(): GoogleGenAI {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add your Gemini API key in Settings > Secrets to enable AI PCB analysis.'
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

export function isGeminiConfigured(): boolean {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  return Boolean(apiKey && apiKey !== 'MY_GEMINI_API_KEY');
}

export function mapGeminiError(err: unknown): string {
  if (!(err instanceof Error)) {
    return 'Unexpected error while communicating with Gemini API.';
  }
  let msg = err.message || '';

  // Extract clean message if SDK returns raw JSON error string
  if (msg.trim().startsWith('{')) {
    try {
      const parsed = JSON.parse(msg) as { error?: { message?: string; code?: number; status?: string } };
      if (parsed?.error?.message) {
        msg = parsed.error.message;
      }
    } catch {
      // Keep original string if not valid JSON
    }
  }

  if (msg.includes('GEMINI_API_KEY')) {
    return msg;
  }
  if (msg.includes('API_KEY_INVALID') || msg.includes('PERMISSION_DENIED') || msg.includes('403')) {
    return 'Gemini API authentication failed. Verify GEMINI_API_KEY in Settings > Secrets.';
  }
  if (msg.includes('RESOURCE_EXHAUSTED') || msg.includes('429')) {
    return 'Gemini API rate limit or quota reached. Please wait briefly and try again.';
  }
  if (msg.includes('UNAVAILABLE') || msg.includes('503') || msg.toLowerCase().includes('high demand')) {
    return 'Gemini AI service is temporarily busy due to high demand. Please retry in a few seconds.';
  }
  if (msg.includes('NOT_FOUND') || msg.includes('404')) {
    return `Requested Gemini model "${GEMINI_ANALYSIS_MODEL}" was unavailable.`;
  }
  if (msg.toLowerCase().includes('fetch') || msg.toLowerCase().includes('network') || msg.toLowerCase().includes('timeout')) {
    return 'Network error while reaching Gemini API. Check server connectivity and retry.';
  }
  return msg;
}

export async function withGeminiRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : '';
      const isTransient =
        msg.includes('503') ||
        msg.includes('UNAVAILABLE') ||
        msg.includes('429') ||
        msg.toLowerCase().includes('high demand') ||
        msg.toLowerCase().includes('timeout');
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 1200 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function normalizeConfidence(value: unknown): ConfidenceLevel {
  const str = String(value || '').trim().toLowerCase();
  if (str === 'high') return 'High';
  if (str === 'low') return 'Low';
  return 'Medium';
}

function validatePcbReport(raw: unknown): PcbAnalysisReport {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Gemini returned an empty or malformed PCB analysis payload.');
  }
  const data = raw as Record<string, unknown>;
  const pcbId = (data.pcbIdentification || {}) as Record<string, unknown>;
  const markingsSummary = (data.componentMarkingsSummary || {}) as Record<string, unknown>;
  const functional = (data.functionalAnalysis || {}) as Record<string, unknown>;
  const observations = (data.technicalObservations || {}) as Record<string, unknown>;
  const assessment = (data.overallAssessment || {}) as Record<string, unknown>;

  const rawComponents = Array.isArray(data.components) ? data.components : [];
  const components: DetectedComponent[] = rawComponents
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item === 'object'))
    .map((item) => ({
      name: String(item.name || 'Unidentified Component').trim(),
      category: String(item.category || 'Other').trim(),
      marking: String(item.marking || 'Unreadable').trim(),
      quantityEstimate: Math.max(1, Math.round(Number(item.quantityEstimate) || 1)),
      likelyFunction: String(item.likelyFunction || 'Requires circuit tracing to confirm function.').trim(),
      confidence: normalizeConfidence(item.confidence),
      confidenceReason: String(
        item.confidenceReason || 'Based on visual package geometry and visible silkscreen/markings.'
      ).trim(),
    }));

  const toStringList = (val: unknown): string[] =>
    Array.isArray(val) ? val.map((v) => String(v).trim()).filter(Boolean) : [];

  return {
    pcbIdentification: {
      boardType: String(pcbId.boardType || 'Unidentified Printed Circuit Board').trim(),
      likelyApplication: String(pcbId.likelyApplication || 'Requires further physical inspection').trim(),
      visibleBoardMarkings: toStringList(pcbId.visibleBoardMarkings),
      generalBoardLayout: String(
        pcbId.generalBoardLayout || 'Layout details could not be fully determined from this angle.'
      ).trim(),
    },
    components,
    componentMarkingsSummary: {
      readableMarkings: toStringList(markingsSummary.readableMarkings),
      unreadableMarkings: toStringList(markingsSummary.unreadableMarkings),
    },
    functionalAnalysis: {
      powerSection: String(functional.powerSection || 'No clearly identifiable power-management section observed.').trim(),
      controlSection: String(functional.controlSection || 'No clearly identifiable control/processing section observed.').trim(),
      communicationSection: String(functional.communicationSection || 'No clearly identifiable communication interface observed.').trim(),
      otherSections: String(functional.otherSections || 'No additional distinct functional blocks observed.').trim(),
    },
    technicalObservations: {
      visibleDamage: String(observations.visibleDamage || 'No obvious physical damage observed from this image.').trim(),
      missingComponents: String(observations.missingComponents || 'No clearly evident missing components observed.').trim(),
      corrosionOrDiscoloration: String(observations.corrosionOrDiscoloration || 'No obvious corrosion or heat discoloration visible.').trim(),
      unusualFeatures: String(observations.unusualFeatures || 'No unusual board features noted.').trim(),
    },
    overallAssessment: {
      summary: String(assessment.summary || 'Visual inspection completed.').trim(),
      likelyPurpose: String(assessment.likelyPurpose || 'Purpose requires schematic or electrical verification.').trim(),
      requiresPhysicalVerification: toStringList(assessment.requiresPhysicalVerification).length > 0
        ? toStringList(assessment.requiresPhysicalVerification)
        : [
            'Electrical continuity, supply voltage ratings, and component health cannot be verified from a photograph alone.',
            'Confirm unreadable SMD values (such as ceramic capacitor capacitance and unmarked resistor tolerances) with a multimeter or LCR meter.',
          ],
    },
    technicalSummary: String(
      data.technicalSummary ||
        assessment.summary ||
        'Visual PCB analysis generated from optical photograph inspection.'
    ).trim(),
    visualInspectionDisclaimer:
      'Visual inspection only: optical analysis does not verify electrical functionality, internal silicon integrity, or exact unprinted component ratings. Always test rails and component values physically before powering or reusing parts.',
  };
}

export async function analyzePcbImageWithGemini(params: {
  imageBuffer: Buffer;
  mimeType: string;
}): Promise<PcbAnalysisReport> {
  const ai = createGeminiClient();
  const base64Data = params.imageBuffer.toString('base64');

  try {
    const response = await withGeminiRetry(() =>
      ai.models.generateContent({
        model: GEMINI_ANALYSIS_MODEL,
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: params.mimeType,
              data: base64Data,
            },
          },
          {
            text: 'Inspect this printed circuit board photograph thoroughly and return a complete, strictly grounded structured technical PCB inspection report. Report unreadable markings honestly and never fabricate component specifications or electrical ratings.',
          },
        ],
      },
      config: {
        systemInstruction: PCB_SYSTEM_INSTRUCTION,
        thinkingConfig: {
          thinkingLevel: ThinkingLevel.MEDIUM,
        },
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pcbIdentification: {
              type: Type.OBJECT,
              properties: {
                boardType: { type: Type.STRING, description: 'Board type if visually recognizable, else state uncertainty.' },
                likelyApplication: { type: Type.STRING, description: 'Likely engineering or device application.' },
                visibleBoardMarkings: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                  description: 'Silkscreen labels, revision strings, or printed board text.',
                },
                generalBoardLayout: { type: Type.STRING, description: 'Description of PCB form factor, mounting holes, connector placement, and copper routing.' },
              },
              required: ['boardType', 'likelyApplication', 'visibleBoardMarkings', 'generalBoardLayout'],
            },
            components: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING, description: 'Component type or identified part name.' },
                  category: {
                    type: Type.STRING,
                    description: 'Category such as Microcontroller, Integrated Circuit, Voltage Regulator, Resistor, Capacitor, Inductor, Diode, LED, Transistor, MOSFET, Connector, Relay, Oscillator, Switch, Fuse, or Other.',
                  },
                  marking: { type: Type.STRING, description: 'Exact readable marking/designator, or "Unreadable" if not legible.' },
                  quantityEstimate: { type: Type.INTEGER, description: 'Estimated visible count of this component type/marking.' },
                  likelyFunction: { type: Type.STRING, description: 'Likely circuit role supported by visual placement.' },
                  confidence: { type: Type.STRING, description: 'Must be exactly High, Medium, or Low.' },
                  confidenceReason: { type: Type.STRING, description: 'Why this confidence level was assigned, noting any visual ambiguity.' },
                },
                required: ['name', 'category', 'marking', 'quantityEstimate', 'likelyFunction', 'confidence', 'confidenceReason'],
              },
            },
            componentMarkingsSummary: {
              type: Type.OBJECT,
              properties: {
                readableMarkings: { type: Type.ARRAY, items: { type: Type.STRING } },
                unreadableMarkings: { type: Type.ARRAY, items: { type: Type.STRING } },
              },
              required: ['readableMarkings', 'unreadableMarkings'],
            },
            functionalAnalysis: {
              type: Type.OBJECT,
              properties: {
                powerSection: { type: Type.STRING },
                controlSection: { type: Type.STRING },
                communicationSection: { type: Type.STRING },
                otherSections: { type: Type.STRING },
              },
              required: ['powerSection', 'controlSection', 'communicationSection', 'otherSections'],
            },
            technicalObservations: {
              type: Type.OBJECT,
              properties: {
                visibleDamage: { type: Type.STRING },
                missingComponents: { type: Type.STRING },
                corrosionOrDiscoloration: { type: Type.STRING },
                unusualFeatures: { type: Type.STRING },
              },
              required: ['visibleDamage', 'missingComponents', 'corrosionOrDiscoloration', 'unusualFeatures'],
            },
            overallAssessment: {
              type: Type.OBJECT,
              properties: {
                summary: { type: Type.STRING },
                likelyPurpose: { type: Type.STRING },
                requiresPhysicalVerification: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['summary', 'likelyPurpose', 'requiresPhysicalVerification'],
            },
            technicalSummary: {
              type: Type.STRING,
              description: 'Concise professional engineering explanation of the PCB architecture and inspection findings.',
            },
          },
          required: [
            'pcbIdentification',
            'components',
            'componentMarkingsSummary',
            'functionalAnalysis',
            'technicalObservations',
            'overallAssessment',
            'technicalSummary',
          ],
        },
        },
      })
    );

    const rawText = (response.text || '').trim();
    if (!rawText) {
      throw new Error('Gemini returned an empty response for this PCB image.');
    }

    const parsed = JSON.parse(rawText);
    return validatePcbReport(parsed);
  } catch (err) {
    throw new Error(mapGeminiError(err));
  }
}
