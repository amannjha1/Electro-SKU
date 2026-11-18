import crypto from 'node:crypto';
import { db } from '../db.ts';
import { mapCaptureRow, saveCaptureImage } from './imageService.ts';
import type { CameraStatus, CaptureRecord } from '../../src/types/electrosku.ts';

/**
 * ESP32-CAM (GC2145) + Supabase Edge Function Integration Adapter
 *
 * Security & Honesty Contract:
 * - Reads CAMERA_BACKEND_URL, CAMERA_API_TOKEN, CAMERA_COMMAND_URL, and CAMERA_POLL_INTERVAL_MS
 *   strictly from server-side environment variables. Never exposes tokens to the client.
 * - Does not invent an unverified Supabase Edge Function JSON schema; handles raw image binaries
 *   (image/jpeg, image/png, image/webp) as well as common JSON image payloads safely.
 * - Because existing ESP32-CAM firmware pushes periodic frames (~2.5s) and does not yet implement
 *   remote capture-command polling unless CAMERA_COMMAND_URL is configured, remote capture
 *   honestly reports unsupported/unconfigured rather than simulating hardware confirmation.
 */

interface CameraAdapterRuntimeState {
  lastCheckedAt: string;
  lastError: string | null;
  lastBackendReachable: boolean;
  lastFrameFingerprint: string | null;
}

const runtimeState: CameraAdapterRuntimeState = {
  lastCheckedAt: new Date().toISOString(),
  lastError: null,
  lastBackendReachable: false,
  lastFrameFingerprint: null,
};

function getCameraConfig() {
  const backendUrl = (process.env.CAMERA_BACKEND_URL || '').trim();
  const apiToken = (process.env.CAMERA_API_TOKEN || '').trim();
  const commandUrl = (process.env.CAMERA_COMMAND_URL || '').trim();
  const cadenceMs = Number(process.env.CAMERA_POLL_INTERVAL_MS || '2500') || 2500;

  return {
    backendUrl,
    apiToken,
    commandUrl,
    cadenceMs,
  };
}

export function getLatestCameraCaptureFromDb(): CaptureRecord | null {
  const row = db
    .prepare(
      `SELECT id, source_type, filename, original_name, mime_type, file_path,
              width, height, file_size, is_demo, label, captured_at, created_at
       FROM captures
       WHERE source_type IN ('LIVE_FRAME', 'MANUAL_CAPTURE')
       ORDER BY created_at DESC
       LIMIT 1`
    )
    .get() as Record<string, unknown> | undefined;

  return row ? mapCaptureRow(row) : null;
}

function buildAuthHeaders(apiToken: string): Record<string, string> {
  const headers: Record<string, string> = {};
  if (apiToken) {
    headers['Authorization'] = `Bearer ${apiToken}`;
    headers['apikey'] = apiToken;
  }
  return headers;
}

export function verifyIngestToken(providedHeader?: string): boolean {
  const { apiToken } = getCameraConfig();
  if (!apiToken) {
    // Only allow unauthenticated local ingest if explicitly opted-in via env
    return process.env.ALLOW_UNAUTHENTICATED_CAMERA_INGEST === 'true';
  }
  if (!providedHeader) return false;
  const cleaned = providedHeader.replace(/^Bearer\s+/i, '').trim();
  return cleaned.length > 0 && cleaned === apiToken;
}

export function ingestDirectCameraFrame(params: {
  buffer: Buffer;
  mimeType: string;
  sourceType?: 'LIVE_FRAME' | 'MANUAL_CAPTURE';
  label?: string;
}): CaptureRecord {
  const fingerprint = crypto.createHash('sha256').update(params.buffer).digest('hex');
  runtimeState.lastCheckedAt = new Date().toISOString();
  runtimeState.lastBackendReachable = true;
  runtimeState.lastError = null;
  runtimeState.lastFrameFingerprint = fingerprint;

  return saveCaptureImage({
    buffer: params.buffer,
    mimeType: params.mimeType,
    originalName: `esp32_gc2145_${Date.now()}.jpg`,
    sourceType: params.sourceType || 'LIVE_FRAME',
    isDemo: false,
    label: params.label || 'ESP32-CAM GC2145 Live Frame',
  });
}

export async function refreshLatestCameraFrame(): Promise<{
  status: CameraStatus;
  capture: CaptureRecord | null;
}> {
  const config = getCameraConfig();
  runtimeState.lastCheckedAt = new Date().toISOString();

  if (!config.backendUrl) {
    runtimeState.lastBackendReachable = false;
    runtimeState.lastError = null;
    return {
      status: getCameraStatus(),
      capture: getLatestCameraCaptureFromDb(),
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(config.backendUrl, {
      method: 'GET',
      headers: buildAuthHeaders(config.apiToken),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      runtimeState.lastBackendReachable = false;
      runtimeState.lastError = `Camera backend returned HTTP ${response.status}.`;
      return {
        status: getCameraStatus(),
        capture: getLatestCameraCaptureFromDb(),
      };
    }

    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    let imageBuffer: Buffer | null = null;
    let imageMime = 'image/jpeg';

    if (contentType.startsWith('image/')) {
      imageBuffer = Buffer.from(await response.arrayBuffer());
      imageMime = contentType.split(';')[0].trim();
    } else if (contentType.includes('application/json')) {
      const payload = (await response.json()) as Record<string, unknown>;
      const base64Candidate =
        typeof payload.imageBase64 === 'string'
          ? payload.imageBase64
          : typeof payload.image === 'string'
          ? payload.image
          : typeof payload.frame === 'string'
          ? payload.frame
          : null;
      const urlCandidate =
        typeof payload.imageUrl === 'string'
          ? payload.imageUrl
          : typeof payload.url === 'string'
          ? payload.url
          : null;

      if (base64Candidate) {
        const match = base64Candidate.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
        if (match) {
          imageMime = match[1];
          imageBuffer = Buffer.from(match[2], 'base64');
        } else {
          imageBuffer = Buffer.from(base64Candidate, 'base64');
        }
      } else if (urlCandidate) {
        const imgRes = await fetch(urlCandidate);
        if (!imgRes.ok) {
          throw new Error(`Referenced frame URL returned HTTP ${imgRes.status}.`);
        }
        imageMime = (imgRes.headers.get('content-type') || 'image/jpeg').split(';')[0].trim();
        imageBuffer = Buffer.from(await imgRes.arrayBuffer());
      } else {
        runtimeState.lastBackendReachable = true;
        runtimeState.lastError =
          'Camera backend responded with JSON, but no recognized image payload was present.';
        return {
          status: getCameraStatus(),
          capture: getLatestCameraCaptureFromDb(),
        };
      }
    } else {
      throw new Error(`Unsupported camera backend response content-type: ${contentType || 'unknown'}`);
    }

    runtimeState.lastBackendReachable = true;
    runtimeState.lastError = null;

    if (imageBuffer && imageBuffer.length > 128) {
      const fingerprint = crypto.createHash('sha256').update(imageBuffer).digest('hex');
      const existingLatest = getLatestCameraCaptureFromDb();

      if (fingerprint !== runtimeState.lastFrameFingerprint || !existingLatest) {
        runtimeState.lastFrameFingerprint = fingerprint;
        const saved = saveCaptureImage({
          buffer: imageBuffer,
          mimeType: imageMime,
          originalName: `esp32_gc2145_${Date.now()}.jpg`,
          sourceType: 'LIVE_FRAME',
          isDemo: false,
          label: 'ESP32-CAM GC2145 Live Frame',
        });
        return {
          status: getCameraStatus(),
          capture: saved,
        };
      }
      return {
        status: getCameraStatus(),
        capture: existingLatest,
      };
    }

    return {
      status: getCameraStatus(),
      capture: getLatestCameraCaptureFromDb(),
    };
  } catch (err) {
    runtimeState.lastBackendReachable = false;
    runtimeState.lastError = err instanceof Error ? err.message : 'Failed to reach camera backend.';
    return {
      status: getCameraStatus(),
      capture: getLatestCameraCaptureFromDb(),
    };
  }
}

export async function triggerRemoteCaptureCommand(): Promise<{
  supported: boolean;
  dispatched: boolean;
  capture: CaptureRecord | null;
  status: CameraStatus;
  message: string;
}> {
  const config = getCameraConfig();

  if (!config.commandUrl) {
    return {
      supported: false,
      dispatched: false,
      capture: getLatestCameraCaptureFromDb(),
      status: getCameraStatus(),
      message:
        'Remote capture-command channel is not active on the current ESP32-CAM firmware. The module streams periodic LIVE FRAME uploads (~2.5s) via the camera backend, or you can use Manual Upload / Demo Mode.',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(config.commandUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...buildAuthHeaders(config.apiToken),
      },
      body: JSON.stringify({
        command: 'CAPTURE_PCB',
        sensor: 'GC2145',
        requestedAt: new Date().toISOString(),
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      throw new Error(`Command channel responded with HTTP ${res.status}.`);
    }

    const refreshed = await refreshLatestCameraFrame();
    return {
      supported: true,
      dispatched: true,
      capture: refreshed.capture,
      status: refreshed.status,
      message: 'Capture command dispatched to ESP32-CAM command channel.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to dispatch capture command.';
    return {
      supported: true,
      dispatched: false,
      capture: getLatestCameraCaptureFromDb(),
      status: getCameraStatus(),
      message: `Remote capture command failed: ${msg}`,
    };
  }
}

export function getCameraStatus(): CameraStatus {
  const config = getCameraConfig();
  const latestFrame = getLatestCameraCaptureFromDb();
  const lastFrameAt = latestFrame ? latestFrame.capturedAt : null;

  // Consider direct ingest "connected" if a real frame arrived recently (within 30 seconds)
  const frameAgeMs = lastFrameAt ? Date.now() - new Date(lastFrameAt).getTime() : Infinity;
  const recentIngestActive = frameAgeMs <= 30_000;

  if (!config.backendUrl) {
    if (recentIngestActive) {
      return {
        configured: true,
        connected: true,
        device: 'ESP32-CAM',
        sensor: 'GC2145',
        cadenceMs: config.cadenceMs,
        remoteCaptureSupported: Boolean(config.commandUrl),
        backendMode: 'direct_ingest',
        latestFrame,
        lastCheckedAt: runtimeState.lastCheckedAt,
        lastFrameAt,
        statusLabel: 'Connected',
        message: 'Receiving live GC2145 frames via direct ingest endpoint.',
      };
    }

    return {
      configured: false,
      connected: false,
      device: 'ESP32-CAM',
      sensor: 'GC2145',
      cadenceMs: config.cadenceMs,
      remoteCaptureSupported: Boolean(config.commandUrl),
      backendMode: 'unconfigured',
      latestFrame,
      lastCheckedAt: runtimeState.lastCheckedAt,
      lastFrameAt,
      statusLabel: 'Disconnected',
      message:
        'Camera backend is not configured (CAMERA_BACKEND_URL unset). Connect the ESP32-CAM Supabase adapter or use Manual Image Upload to analyze PCBs immediately.',
    };
  }

  const connected = runtimeState.lastBackendReachable && !runtimeState.lastError;
  return {
    configured: true,
    connected,
    device: 'ESP32-CAM',
    sensor: 'GC2145',
    cadenceMs: config.cadenceMs,
    remoteCaptureSupported: Boolean(config.commandUrl),
    backendMode: 'supabase_adapter',
    latestFrame,
    lastCheckedAt: runtimeState.lastCheckedAt,
    lastFrameAt,
    statusLabel: connected ? 'Connected' : 'Disconnected',
    message: connected
      ? 'ESP32-CAM backend reachable. Periodic GC2145 frames (~2.5s) are synced via secure server adapter.'
      : runtimeState.lastError || 'Camera backend configured, awaiting reachable frame check.',
  };
}
