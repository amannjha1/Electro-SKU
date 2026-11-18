import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';
import { db } from './server/db.ts';
import {
  getCameraStatus,
  ingestDirectCameraFrame,
  refreshLatestCameraFrame,
  triggerRemoteCaptureCommand,
  verifyIngestToken,
} from './server/services/cameraService.ts';
import {
  analyzePcbImageWithGemini,
  GEMINI_ANALYSIS_MODEL,
  isGeminiConfigured,
} from './server/services/geminiService.ts';
import {
  deleteInspectionById,
  getDashboardSummary,
  getInspectionById,
  listInspections,
} from './server/services/historyService.ts';
import {
  createDemoSampleCapture,
  deleteCaptureById,
  getCaptureById,
  getCaptureImageBuffer,
  listDemoSamples,
  listRecentCaptures,
  MAX_IMAGE_BYTES,
  resolveSafeImagePath,
  saveCaptureImage,
} from './server/services/imageService.ts';
import { generateProjectRecommendationsForInspection } from './server/services/recommendationService.ts';
import {
  createInspectionEntry,
  markInspectionFailed,
  saveCompletedInspectionReport,
} from './server/services/reportService.ts';
import type { AnalysisStepId, AnalysisStepState, SystemHealthStatus } from './src/types/electrosku.ts';

const PORT = Number(process.env.PORT) || 3000;
const app = express();
const serverStartTime = Date.now();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_IMAGE_BYTES,
  },
});

app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));

// Security headers for engineering workspace
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Serve stored PCB images safely
app.get('/api/images/:filename', (req, res) => {
  const safePath = resolveSafeImagePath(req.params.filename);
  if (!safePath) {
    res.status(404).json({ error: 'Image not found.' });
    return;
  }
  res.sendFile(safePath);
});

// Health & real system status
app.get('/api/health', (_req, res) => {
  let databaseReady = false;
  try {
    db.prepare('SELECT 1 AS ok').get();
    databaseReady = true;
  } catch {
    databaseReady = false;
  }

  const geminiConfigured = isGeminiConfigured();
  const camera = getCameraStatus();

  const status: SystemHealthStatus = {
    backend: {
      connected: true,
      statusLabel: databaseReady ? 'Connected' : 'Degraded',
      uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
      databaseReady,
    },
    gemini: {
      configured: geminiConfigured,
      model: GEMINI_ANALYSIS_MODEL,
      statusLabel: geminiConfigured ? 'Ready' : 'Key Missing',
    },
    camera,
  };

  res.json(status);
});

// Dashboard overview metrics from real persisted data
app.get('/api/dashboard', (_req, res) => {
  try {
    const summary = getDashboardSummary();
    res.json(summary);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load dashboard metrics.',
    });
  }
});

// Camera adapter routes
app.get('/api/camera/status', (_req, res) => {
  res.json(getCameraStatus());
});

app.post('/api/camera/refresh', async (_req, res) => {
  try {
    const result = await refreshLatestCameraFrame();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to refresh camera frame.',
    });
  }
});

app.post('/api/camera/capture-command', async (_req, res) => {
  try {
    const result = await triggerRemoteCaptureCommand();
    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to dispatch capture command.',
    });
  }
});

// Optional direct ESP32-CAM frame push endpoint (secured by CAMERA_API_TOKEN)
app.post('/api/camera/frame-ingest', upload.single('image'), (req, res) => {
  const authHeader = req.header('authorization') || req.header('x-camera-token');
  if (!verifyIngestToken(authHeader)) {
    res.status(401).json({ error: 'Unauthorized camera ingest request.' });
    return;
  }

  try {
    if (!req.file) {
      res.status(400).json({ error: 'Missing multipart image field.' });
      return;
    }
    const sourceType = req.body?.sourceType === 'MANUAL_CAPTURE' ? 'MANUAL_CAPTURE' : 'LIVE_FRAME';
    const capture = ingestDirectCameraFrame({
      buffer: req.file.buffer,
      mimeType: req.file.mimetype,
      sourceType,
    });
    res.status(201).json({ capture, status: getCameraStatus() });
  } catch (err) {
    res.status(400).json({
      error: err instanceof Error ? err.message : 'Invalid camera frame payload.',
    });
  }
});

// Capture & upload routes
app.get('/api/captures', (req, res) => {
  const limit = Number(req.query.limit || 16);
  res.json({ captures: listRecentCaptures(limit) });
});

app.post('/api/captures/upload', (req, res) => {
  upload.single('image')(req, res, (uploadErr) => {
    if (uploadErr) {
      if (uploadErr instanceof multer.MulterError && uploadErr.code === 'LIMIT_FILE_SIZE') {
        res.status(400).json({ error: 'Uploaded image exceeds the 15 MB limit.' });
        return;
      }
      res.status(400).json({ error: uploadErr.message || 'File upload failed.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Please select a PCB image file (JPEG, PNG, or WebP).' });
      return;
    }

    try {
      const capture = saveCaptureImage({
        buffer: req.file.buffer,
        mimeType: req.file.mimetype,
        originalName: req.file.originalname || 'manual_pcb.jpg',
        sourceType: 'MANUAL_UPLOAD',
        isDemo: false,
        label: req.file.originalname || 'Manual PCB Upload',
      });
      res.status(201).json({ capture });
    } catch (err) {
      res.status(400).json({
        error: err instanceof Error ? err.message : 'Invalid PCB image.',
      });
    }
  });
});

app.delete('/api/captures/:id', (req, res) => {
  const existing = getCaptureById(req.params.id);
  if (!existing) {
    res.status(404).json({ error: 'Capture not found.' });
    return;
  }
  deleteCaptureById(req.params.id);
  res.json({ deleted: true });
});

// Demo mode sample PCB routes (clearly labelled)
app.get('/api/demo/samples', (_req, res) => {
  res.json({ samples: listDemoSamples() });
});

app.post('/api/demo/load', (req, res) => {
  const sampleId = req.body?.sampleId;
  if (sampleId !== 'microcontroller' && sampleId !== 'power_relay') {
    res.status(400).json({ error: 'Invalid demo sample identifier.' });
    return;
  }

  try {
    const capture = createDemoSampleCapture(sampleId);
    res.status(201).json({ capture });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to load demo PCB sample.',
    });
  }
});

// Inspection & AI analysis routes
app.get('/api/inspections', (req, res) => {
  const search = typeof req.query.search === 'string' ? req.query.search : undefined;
  const status = typeof req.query.status === 'string' ? req.query.status : undefined;
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  res.json({ inspections: listInspections({ search, status, limit }) });
});

app.get('/api/inspections/:id', (req, res) => {
  const inspection = getInspectionById(req.params.id);
  if (!inspection) {
    res.status(404).json({ error: 'Inspection report not found.' });
    return;
  }
  res.json({ inspection });
});

app.delete('/api/inspections/:id', (req, res) => {
  const deleted = deleteInspectionById(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Inspection report not found.' });
    return;
  }
  res.json({ deleted: true });
});

// Real-time SSE PCB Analysis pipeline
app.post('/api/inspections/analyze-stream', async (req, res) => {
  const captureId = typeof req.body?.captureId === 'string' ? req.body.captureId.trim() : '';
  if (!captureId) {
    res.status(400).json({ error: 'captureId is required to start PCB inspection.' });
    return;
  }

  const capture = getCaptureById(captureId);
  if (!capture) {
    res.status(404).json({ error: 'Selected PCB capture could not be found.' });
    return;
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const sendEvent = (event: string, payload: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
  };

  const emitStep = (step: AnalysisStepId, state: AnalysisStepState, detail?: string) => {
    sendEvent('step', { step, state, detail });
  };

  const inspectionId = createInspectionEntry(capture);
  sendEvent('created', { inspectionId });

  try {
    // Step 1: Receiving PCB image
    emitStep('receiving_image', 'active', 'Loading verified PCB photograph from persistent storage...');
    const { buffer, mimeType } = getCaptureImageBuffer(capture.id);
    emitStep('receiving_image', 'completed', `${Math.round(buffer.length / 1024)} KB ${mimeType} verified.`);

    // Step 2-4: Gemini Multimodal Inspection (layout, markings, components)
    emitStep('examining_layout', 'active', 'Inspecting board topology, silkscreen, and functional blocks...');
    emitStep('reading_markings', 'active', 'Reading visible IC part numbers and component designators...');
    emitStep('identifying_components', 'active', 'Classifying SMD & through-hole components with confidence levels...');

    const report = await analyzePcbImageWithGemini({
      imageBuffer: buffer,
      mimeType,
    });

    emitStep('examining_layout', 'completed', report.pcbIdentification.boardType);
    emitStep(
      'reading_markings',
      'completed',
      `${report.componentMarkingsSummary.readableMarkings.length} readable markings extracted.`
    );
    emitStep(
      'identifying_components',
      'completed',
      `${report.components.length} component groups identified.`
    );

    // Step 5: Preparing technical report
    emitStep('preparing_report', 'active', 'Validating and persisting technical inspection report...');
    saveCompletedInspectionReport({
      inspectionId,
      report,
      modelUsed: GEMINI_ANALYSIS_MODEL,
    });
    emitStep('preparing_report', 'completed', `Report ${inspectionId} saved.`);

    // Step 6: Generating project recommendations
    emitStep('generating_projects', 'active', 'Evaluating low-voltage project compatibility via Gemini...');
    let warningMessage: string | null = null;
    try {
      const recommendations = await generateProjectRecommendationsForInspection({
        inspectionId,
        report,
      });
      emitStep(
        'generating_projects',
        'completed',
        `${recommendations.length} educational project builds generated.`
      );
    } catch (recErr) {
      warningMessage = recErr instanceof Error ? recErr.message : 'Project recommendation generation failed.';
      emitStep('generating_projects', 'failed', warningMessage);
    }

    const fullInspection = getInspectionById(inspectionId);
    sendEvent('complete', {
      inspection: fullInspection,
      warning: warningMessage,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PCB inspection failed.';
    markInspectionFailed(inspectionId, message);
    sendEvent('error', {
      inspectionId,
      error: message,
    });
  } finally {
    res.end();
  }
});

// Regenerate project recommendations for an inspection
app.post('/api/inspections/:id/recommendations', async (req, res) => {
  const inspection = getInspectionById(req.params.id);
  if (!inspection) {
    res.status(404).json({ error: 'Inspection not found.' });
    return;
  }
  if (!inspection.report || inspection.status !== 'completed') {
    res.status(400).json({ error: 'Completed PCB analysis report is required before recommending projects.' });
    return;
  }

  try {
    const recommendations = await generateProjectRecommendationsForInspection({
      inspectionId: inspection.id,
      report: inspection.report,
    });
    res.json({ recommendations, inspection: getInspectionById(inspection.id) });
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Failed to generate project recommendations.',
    });
  }
});

// Vite middleware in dev, static dist in production
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found.');
      }
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ElectroSKU server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start ElectroSKU server:', err);
  process.exit(1);
});
