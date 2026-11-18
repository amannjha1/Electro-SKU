import type {
  AnalysisStepId,
  AnalysisStepState,
  CameraStatus,
  CaptureRecord,
  DashboardSummary,
  DemoSampleInfo,
  InspectionRecord,
  ProjectRecommendation,
  SystemHealthStatus,
} from '../types/electrosku';

async function parseJsonResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (data && typeof data.error === 'string' && data.error) ||
      `Request failed with status ${res.status}`;
    throw new Error(message);
  }
  return data as T;
}

export async function fetchSystemHealth(): Promise<SystemHealthStatus> {
  const res = await fetch('/api/health');
  return parseJsonResponse<SystemHealthStatus>(res);
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await fetch('/api/dashboard');
  return parseJsonResponse<DashboardSummary>(res);
}

export async function fetchCameraStatus(): Promise<CameraStatus> {
  const res = await fetch('/api/camera/status');
  return parseJsonResponse<CameraStatus>(res);
}

export async function refreshCameraFrame(): Promise<{ status: CameraStatus; capture: CaptureRecord | null }> {
  const res = await fetch('/api/camera/refresh', { method: 'POST' });
  return parseJsonResponse<{ status: CameraStatus; capture: CaptureRecord | null }>(res);
}

export async function sendCameraCaptureCommand(): Promise<{
  supported: boolean;
  dispatched: boolean;
  capture: CaptureRecord | null;
  status: CameraStatus;
  message: string;
}> {
  const res = await fetch('/api/camera/capture-command', { method: 'POST' });
  return parseJsonResponse(res);
}

export async function fetchRecentCaptures(limit = 16): Promise<CaptureRecord[]> {
  const res = await fetch(`/api/captures?limit=${limit}`);
  const data = await parseJsonResponse<{ captures: CaptureRecord[] }>(res);
  return data.captures;
}

export async function uploadPcbImage(file: File): Promise<CaptureRecord> {
  const formData = new FormData();
  formData.append('image', file);
  const res = await fetch('/api/captures/upload', {
    method: 'POST',
    body: formData,
  });
  const data = await parseJsonResponse<{ capture: CaptureRecord }>(res);
  return data.capture;
}

export async function deleteCapture(captureId: string): Promise<void> {
  const res = await fetch(`/api/captures/${encodeURIComponent(captureId)}`, {
    method: 'DELETE',
  });
  await parseJsonResponse<{ deleted: boolean }>(res);
}

export async function fetchDemoSamples(): Promise<DemoSampleInfo[]> {
  const res = await fetch('/api/demo/samples');
  const data = await parseJsonResponse<{ samples: DemoSampleInfo[] }>(res);
  return data.samples;
}

export async function loadDemoSample(sampleId: 'microcontroller' | 'power_relay'): Promise<CaptureRecord> {
  const res = await fetch('/api/demo/load', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sampleId }),
  });
  const data = await parseJsonResponse<{ capture: CaptureRecord }>(res);
  return data.capture;
}

export async function fetchInspections(params?: {
  search?: string;
  status?: string;
  limit?: number;
}): Promise<InspectionRecord[]> {
  const searchParams = new URLSearchParams();
  if (params?.search) searchParams.set('search', params.search);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const qs = searchParams.toString();
  const res = await fetch(`/api/inspections${qs ? `?${qs}` : ''}`);
  const data = await parseJsonResponse<{ inspections: InspectionRecord[] }>(res);
  return data.inspections;
}

export async function fetchInspectionById(id: string): Promise<InspectionRecord> {
  const res = await fetch(`/api/inspections/${encodeURIComponent(id)}`);
  const data = await parseJsonResponse<{ inspection: InspectionRecord }>(res);
  return data.inspection;
}

export async function deleteInspection(id: string): Promise<void> {
  const res = await fetch(`/api/inspections/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  await parseJsonResponse<{ deleted: boolean }>(res);
}

export async function regenerateRecommendations(inspectionId: string): Promise<{
  recommendations: ProjectRecommendation[];
  inspection: InspectionRecord;
}> {
  const res = await fetch(`/api/inspections/${encodeURIComponent(inspectionId)}/recommendations`, {
    method: 'POST',
  });
  return parseJsonResponse(res);
}

export interface StreamAnalysisCallbacks {
  onCreated?: (inspectionId: string) => void;
  onStep?: (step: AnalysisStepId, state: AnalysisStepState, detail?: string) => void;
  onComplete?: (inspection: InspectionRecord, warning: string | null) => void;
  onError?: (errorMessage: string, inspectionId?: string) => void;
}

export async function analyzeCaptureStream(
  captureId: string,
  callbacks: StreamAnalysisCallbacks
): Promise<void> {
  const response = await fetch('/api/inspections/analyze-stream', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ captureId }),
  });

  if (!response.ok || !response.body) {
    const errBody = await response.json().catch(() => ({}));
    const msg =
      (errBody && typeof errBody.error === 'string' && errBody.error) ||
      `Analysis failed with HTTP ${response.status}`;
    callbacks.onError?.(msg);
    throw new Error(msg);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  const processBlock = (block: string) => {
    const lines = block.split('\n');
    let eventName = 'message';
    let dataLine = '';

    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        dataLine += line.slice(5).trim();
      }
    }

    if (!dataLine) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(dataLine);
    } catch {
      return;
    }

    if (eventName === 'created' && typeof payload.inspectionId === 'string') {
      callbacks.onCreated?.(payload.inspectionId);
    } else if (eventName === 'step') {
      callbacks.onStep?.(
        payload.step as AnalysisStepId,
        payload.state as AnalysisStepState,
        typeof payload.detail === 'string' ? payload.detail : undefined
      );
    } else if (eventName === 'complete') {
      callbacks.onComplete?.(
        payload.inspection as InspectionRecord,
        typeof payload.warning === 'string' ? payload.warning : null
      );
    } else if (eventName === 'error') {
      callbacks.onError?.(
        typeof payload.error === 'string' ? payload.error : 'PCB inspection failed.',
        typeof payload.inspectionId === 'string' ? payload.inspectionId : undefined
      );
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let sepIndex: number;
    while ((sepIndex = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, sepIndex);
      buffer = buffer.slice(sepIndex + 2);
      if (chunk.trim()) {
        processBlock(chunk);
      }
    }
  }

  if (buffer.trim()) {
    processBlock(buffer);
  }
}
