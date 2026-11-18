import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, getDataPaths } from '../db.ts';
import type { CaptureRecord, CaptureSourceType, DemoSampleInfo } from '../../src/types/electrosku.ts';

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB

const DEMO_SAMPLES: Record<'microcontroller' | 'power_relay', {
  title: string;
  subtitle: string;
  assetRelativePath: string;
  mimeType: string;
}> = {
  microcontroller: {
    title: 'ESP32-WROOM-32 Dev Board (Demo)',
    subtitle: 'Wi-Fi / BLE microcontroller board with USB-C, AMS1117 3.3V LDO & GPIO headers',
    assetRelativePath: 'src/assets/images/demo_pcb_microcontroller_1794840950073.jpg',
    mimeType: 'image/jpeg',
  },
  power_relay: {
    title: 'LM2596 Buck & 12V Relay Driver (Demo)',
    subtitle: 'Power regulation stage with toroidal inductor, 1000uF capacitors & Omron 10A relay',
    assetRelativePath: 'src/assets/images/demo_pcb_power_sensor_1794840950363.jpg',
    mimeType: 'image/jpeg',
  },
};

export function listDemoSamples(): DemoSampleInfo[] {
  return [
    {
      id: 'microcontroller',
      title: DEMO_SAMPLES.microcontroller.title,
      subtitle: DEMO_SAMPLES.microcontroller.subtitle,
      imageUrl: `/${DEMO_SAMPLES.microcontroller.assetRelativePath}`,
    },
    {
      id: 'power_relay',
      title: DEMO_SAMPLES.power_relay.title,
      subtitle: DEMO_SAMPLES.power_relay.subtitle,
      imageUrl: `/${DEMO_SAMPLES.power_relay.assetRelativePath}`,
    },
  ];
}

export function validateImageBuffer(buffer: Buffer, mimeType: string): { valid: boolean; normalizedMime: string; error?: string } {
  const normalizedMime = mimeType.toLowerCase().split(';')[0].trim();
  if (!ALLOWED_MIME_TYPES[normalizedMime]) {
    return {
      valid: false,
      normalizedMime,
      error: `Unsupported image format "${mimeType}". Please upload JPEG, PNG, or WebP PCB photographs.`,
    };
  }
  if (!buffer || buffer.length < 128) {
    return {
      valid: false,
      normalizedMime,
      error: 'Uploaded file is empty or too small to be a valid PCB image.',
    };
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    return {
      valid: false,
      normalizedMime,
      error: `Image exceeds maximum size limit of ${Math.round(MAX_IMAGE_BYTES / (1024 * 1024))} MB.`,
    };
  }

  // Magic-byte validation
  const isJpeg = buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  const isPng =
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47;
  const isWebp =
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP';

  if (
    (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') && !isJpeg ||
    normalizedMime === 'image/png' && !isPng ||
    normalizedMime === 'image/webp' && !isWebp
  ) {
    return {
      valid: false,
      normalizedMime,
      error: 'File content does not match the declared image format.',
    };
  }

  return {
    valid: true,
    normalizedMime: normalizedMime === 'image/jpg' ? 'image/jpeg' : normalizedMime,
  };
}

export function extractImageDimensions(buffer: Buffer, mimeType: string): { width: number | null; height: number | null } {
  try {
    if (mimeType === 'image/png' && buffer.length >= 24) {
      return {
        width: buffer.readUInt32BE(16),
        height: buffer.readUInt32BE(20),
      };
    }

    if (mimeType === 'image/jpeg') {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) {
          offset++;
          continue;
        }
        const marker = buffer[offset + 1];
        if (marker === 0xd8 || marker === 0xd9) {
          offset += 2;
          continue;
        }
        const segmentLength = buffer.readUInt16BE(offset + 2);
        // SOF0 (0xC0), SOF1 (0xC1), SOF2 (0xC2)
        if (marker >= 0xc0 && marker <= 0xc3) {
          const height = buffer.readUInt16BE(offset + 5);
          const width = buffer.readUInt16BE(offset + 7);
          return { width, height };
        }
        if (segmentLength < 2) break;
        offset += 2 + segmentLength;
      }
    }

    if (mimeType === 'image/webp' && buffer.length >= 30) {
      const chunkHeader = buffer.subarray(12, 16).toString('ascii');
      if (chunkHeader === 'VP8X') {
        const width = 1 + buffer.readUIntLE(24, 3);
        const height = 1 + buffer.readUIntLE(27, 3);
        return { width, height };
      }
      if (chunkHeader === 'VP8 ' && buffer.length >= 30) {
        const width = buffer.readUInt16LE(26) & 0x3fff;
        const height = buffer.readUInt16LE(28) & 0x3fff;
        return { width, height };
      }
    }
  } catch {
    return { width: null, height: null };
  }
  return { width: null, height: null };
}

export function saveCaptureImage(params: {
  buffer: Buffer;
  mimeType: string;
  originalName: string;
  sourceType: CaptureSourceType;
  isDemo?: boolean;
  label?: string;
}): CaptureRecord {
  const validation = validateImageBuffer(params.buffer, params.mimeType);
  if (!validation.valid) {
    throw new Error(validation.error || 'Invalid image upload.');
  }

  const { uploadsDir } = getDataPaths();
  const ext = ALLOWED_MIME_TYPES[validation.normalizedMime] || '.jpg';
  const id = `CAP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
  const filename = `${id}${ext}`;
  const filePath = path.join(uploadsDir, filename);

  fs.writeFileSync(filePath, params.buffer);
  const { width, height } = extractImageDimensions(params.buffer, validation.normalizedMime);
  const now = new Date().toISOString();
  const isDemo = Boolean(params.isDemo);
  const label = params.label || params.originalName || filename;

  db.prepare(
    `INSERT INTO captures (
      id, source_type, filename, original_name, mime_type, file_path,
      width, height, file_size, is_demo, label, captured_at, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    params.sourceType,
    filename,
    params.originalName,
    validation.normalizedMime,
    filePath,
    width,
    height,
    params.buffer.length,
    isDemo ? 1 : 0,
    label,
    now,
    now
  );

  return {
    id,
    sourceType: params.sourceType,
    filename,
    originalName: params.originalName,
    mimeType: validation.normalizedMime,
    imageUrl: `/api/images/${encodeURIComponent(filename)}`,
    width,
    height,
    fileSize: params.buffer.length,
    isDemo,
    label,
    capturedAt: now,
    createdAt: now,
  };
}

export function createDemoSampleCapture(sampleId: 'microcontroller' | 'power_relay'): CaptureRecord {
  const sample = DEMO_SAMPLES[sampleId];
  if (!sample) {
    throw new Error(`Unknown demo sample "${sampleId}".`);
  }

  const candidatePaths = [
    path.resolve(process.cwd(), sample.assetRelativePath),
    path.resolve(process.cwd(), 'dist', sample.assetRelativePath),
  ];

  const resolvedPath = candidatePaths.find((p) => fs.existsSync(p));
  if (!resolvedPath) {
    throw new Error('Demo sample PCB asset could not be located on the server.');
  }

  const buffer = fs.readFileSync(resolvedPath);
  return saveCaptureImage({
    buffer,
    mimeType: sample.mimeType,
    originalName: path.basename(resolvedPath),
    sourceType: 'DEMO_SAMPLE',
    isDemo: true,
    label: sample.title,
  });
}

export function getCaptureById(captureId: string): CaptureRecord | null {
  const row = db
    .prepare(
      `SELECT id, source_type, filename, original_name, mime_type, file_path,
              width, height, file_size, is_demo, label, captured_at, created_at
       FROM captures WHERE id = ?`
    )
    .get(captureId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return mapCaptureRow(row);
}

export function getCaptureImageBuffer(captureId: string): { buffer: Buffer; mimeType: string } {
  const row = db
    .prepare(`SELECT file_path, mime_type FROM captures WHERE id = ?`)
    .get(captureId) as { file_path: string; mime_type: string } | undefined;

  if (!row || !fs.existsSync(row.file_path)) {
    throw new Error('Stored PCB photograph could not be found on disk.');
  }

  return {
    buffer: fs.readFileSync(row.file_path),
    mimeType: row.mime_type,
  };
}

export function resolveSafeImagePath(filename: string): string | null {
  const safeName = path.basename(filename);
  if (!safeName || safeName !== filename || safeName.includes('..')) {
    return null;
  }
  const { uploadsDir } = getDataPaths();
  const fullPath = path.resolve(uploadsDir, safeName);
  if (!fullPath.startsWith(path.resolve(uploadsDir))) {
    return null;
  }
  return fs.existsSync(fullPath) ? fullPath : null;
}

export function listRecentCaptures(limit = 16): CaptureRecord[] {
  const rows = db
    .prepare(
      `SELECT id, source_type, filename, original_name, mime_type, file_path,
              width, height, file_size, is_demo, label, captured_at, created_at
       FROM captures
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(limit) as Record<string, unknown>[];

  return rows.map(mapCaptureRow);
}

export function deleteCaptureById(captureId: string): void {
  const row = db
    .prepare(`SELECT file_path FROM captures WHERE id = ?`)
    .get(captureId) as { file_path: string } | undefined;

  db.prepare(`DELETE FROM captures WHERE id = ?`).run(captureId);
  if (row?.file_path && fs.existsSync(row.file_path)) {
    try {
      fs.unlinkSync(row.file_path);
    } catch {
      // Ignore cleanup error if already removed
    }
  }
}

export function mapCaptureRow(row: Record<string, unknown>): CaptureRecord {
  const filename = String(row.filename);
  return {
    id: String(row.id),
    sourceType: String(row.source_type) as CaptureSourceType,
    filename,
    originalName: String(row.original_name),
    mimeType: String(row.mime_type),
    imageUrl: `/api/images/${encodeURIComponent(filename)}`,
    width: typeof row.width === 'number' ? row.width : null,
    height: typeof row.height === 'number' ? row.height : null,
    fileSize: Number(row.file_size || 0),
    isDemo: Boolean(row.is_demo),
    label: String(row.label || filename),
    capturedAt: String(row.captured_at),
    createdAt: String(row.created_at),
  };
}
