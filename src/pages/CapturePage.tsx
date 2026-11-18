import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  Camera,
  Cpu,
  FlaskConical,
  Image as ImageIcon,
  Maximize2,
  RefreshCw,
  RotateCcw,
  Trash2,
  Upload,
  WifiOff,
} from 'lucide-react';
import { ConfirmModal } from '../components/ConfirmModal';
import { ImageZoomModal } from '../components/ImageZoomModal';
import {
  deleteCapture,
  fetchDemoSamples,
  fetchRecentCaptures,
  loadDemoSample,
  refreshCameraFrame,
  sendCameraCaptureCommand,
  uploadPcbImage,
} from '../lib/api';
import type { CameraStatus, CaptureRecord, DemoSampleInfo } from '../types/electrosku';

interface CapturePageProps {
  cameraStatus: CameraStatus | null;
  activeCapture: CaptureRecord | null;
  onSelectCapture: (capture: CaptureRecord | null) => void;
  onAnalyzeCapture: (capture: CaptureRecord) => void;
  onCameraStatusUpdated: (status: CameraStatus) => void;
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return 'None';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatSourceLabel(sourceType: CaptureRecord['sourceType']): string {
  switch (sourceType) {
    case 'LIVE_FRAME':
      return 'LIVE FRAME (ESP32-CAM)';
    case 'MANUAL_CAPTURE':
      return 'MANUAL CAPTURE (ESP32-CAM)';
    case 'MANUAL_UPLOAD':
      return 'MANUAL UPLOAD';
    case 'DEMO_SAMPLE':
      return 'DEMO SAMPLE';
  }
}

export const CapturePage: React.FC<CapturePageProps> = ({
  cameraStatus,
  activeCapture,
  onSelectCapture,
  onAnalyzeCapture,
  onCameraStatusUpdated,
}) => {
  const [recentCaptures, setRecentCaptures] = useState<CaptureRecord[]>([]);
  const [demoSamples, setDemoSamples] = useState<DemoSampleInfo[]>([]);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [loadingDemo, setLoadingDemo] = useState<string | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'info' | 'success' | 'warning' | 'error';
    message: string;
  } | null>(null);
  const [fullscreenOpen, setFullscreenOpen] = useState(false);
  const [pendingDeleteCaptureId, setPendingDeleteCaptureId] = useState<string | null>(null);
  const [deletingCapture, setDeletingCapture] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const loadGalleryAndSamples = async () => {
    try {
      const [captures, samples] = await Promise.all([
        fetchRecentCaptures(12),
        fetchDemoSamples(),
      ]);
      setRecentCaptures(captures);
      setDemoSamples(samples);
      if (!activeCapture && cameraStatus?.latestFrame) {
        onSelectCapture(cameraStatus.latestFrame);
      }
    } catch {
      // Gallery error non-fatal
    }
  };

  useEffect(() => {
    loadGalleryAndSamples();
  }, []);

  const handleRefreshFrame = async () => {
    setRefreshing(true);
    setFeedback(null);
    try {
      const result = await refreshCameraFrame();
      onCameraStatusUpdated(result.status);
      if (result.capture) {
        onSelectCapture(result.capture);
        setFeedback({
          type: 'success',
          message: 'Latest GC2145 frame retrieved from ESP32-CAM adapter.',
        });
        await loadGalleryAndSamples();
      } else {
        setFeedback({
          type: result.status.configured ? 'warning' : 'info',
          message: result.status.message,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Unable to refresh camera preview.',
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleCaptureCommand = async () => {
    setCapturing(true);
    setFeedback(null);
    try {
      const res = await sendCameraCaptureCommand();
      onCameraStatusUpdated(res.status);

      if (res.supported && res.dispatched && res.capture) {
        onSelectCapture(res.capture);
        setFeedback({
          type: 'success',
          message: res.message,
        });
        await loadGalleryAndSamples();
      } else if (!res.supported) {
        setFeedback({
          type: 'warning',
          message: res.message,
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.message,
        });
      }
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to send capture request.',
      });
    } finally {
      setCapturing(false);
    }
  };

  const handleFileUpload = async (file: File) => {
    setUploading(true);
    setFeedback(null);
    try {
      const capture = await uploadPcbImage(file);
      onSelectCapture(capture);
      setFeedback({
        type: 'success',
        message: `Uploaded "${capture.originalName}" (${capture.width || '?'}×${capture.height || '?'}). Ready for Gemini AI analysis.`,
      });
      await loadGalleryAndSamples();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Image upload failed.',
      });
    } finally {
      setUploading(false);
    }
  };

  const handleLoadDemo = async (sampleId: 'microcontroller' | 'power_relay') => {
    setLoadingDemo(sampleId);
    setFeedback(null);
    try {
      const capture = await loadDemoSample(sampleId);
      onSelectCapture(capture);
      setFeedback({
        type: 'info',
        message: `Demo Mode: Loaded "${capture.label}". Click "Analyze PCB" to run real Gemini multimodal analysis.`,
      });
      await loadGalleryAndSamples();
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to load demo PCB sample.',
      });
    } finally {
      setLoadingDemo(null);
    }
  };

  const handleRetake = () => {
    onSelectCapture(null);
    setFeedback(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirmDeleteCapture = async () => {
    if (!pendingDeleteCaptureId) return;
    setDeletingCapture(true);
    try {
      await deleteCapture(pendingDeleteCaptureId);
      if (activeCapture?.id === pendingDeleteCaptureId) {
        onSelectCapture(null);
      }
      setPendingDeleteCaptureId(null);
      await loadGalleryAndSamples();
    } finally {
      setDeletingCapture(false);
    }
  };

  const displayedCapture = activeCapture || cameraStatus?.latestFrame || null;

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-[#E5EAE6]">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-[#202520]">
            PCB Inspection Capture
          </h1>
          <p className="text-sm text-[#5C645E] mt-1">
            Acquire PCB frames from the ESP32-CAM GC2145 optical station or upload a high-resolution photograph manually.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleRefreshFrame}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E5EAE6] bg-white text-xs font-medium text-[#202520] hover:bg-[#F7F9F7] disabled:opacity-50 transition-colors whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            <span>Refresh Preview</span>
          </button>

          {displayedCapture && (
            <button
              type="button"
              onClick={() => setFullscreenOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#E5EAE6] bg-white text-xs font-medium text-[#202520] hover:bg-[#F7F9F7] transition-colors whitespace-nowrap"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              <span>Fullscreen</span>
            </button>
          )}
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs flex items-start gap-2.5 ${
            feedback.type === 'error'
              ? 'bg-red-50/70 border-red-200 text-red-800'
              : feedback.type === 'warning'
              ? 'bg-amber-50/80 border-amber-200 text-amber-900'
              : feedback.type === 'success'
              ? 'bg-[#ECFDF3] border-[#16834A]/25 text-[#126B3C]'
              : 'bg-[#F7F9F7] border-[#E5EAE6] text-[#202520]'
          }`}
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <div className="leading-relaxed">{feedback.message}</div>
        </div>
      )}

      {/* Main Camera & Upload Split Workspace */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-stretch">
        {/* Large Camera Preview Stage */}
        <section className="xl:col-span-8 bg-white rounded-xl border border-[#E5EAE6] shadow-[0_1px_2px_rgba(16,24,18,0.03)] overflow-hidden flex flex-col">
          {/* Telemetry Bar */}
          <div className="px-5 py-3 bg-[#F7F9F7] border-b border-[#E5EAE6] flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-4">
              <span className="inline-flex items-center gap-1.5 font-medium text-[#202520]">
                <span
                  className={`w-2 h-2 rounded-full ${
                    cameraStatus?.connected
                      ? 'bg-[#16834A]'
                      : cameraStatus?.configured
                      ? 'bg-amber-500'
                      : 'bg-red-600'
                  }`}
                />
                <span>
                  ESP32-CAM: {cameraStatus?.statusLabel || 'Checking'}
                </span>
              </span>

              <span className="text-[#5C645E]">
                Source:{' '}
                <span className="font-mono text-[#202520]">
                  {displayedCapture ? formatSourceLabel(displayedCapture.sourceType) : 'Awaiting Frame'}
                </span>
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-4 font-mono tabular-nums text-[#5C645E]">
              <span>
                Resolution:{' '}
                <strong className="text-[#202520] font-medium">
                  {displayedCapture?.width && displayedCapture?.height
                    ? `${displayedCapture.width}×${displayedCapture.height}`
                    : '—'}
                </strong>
              </span>
              <span>
                Last Frame:{' '}
                <strong className="text-[#202520] font-medium">
                  {formatDateTime(displayedCapture?.capturedAt || cameraStatus?.lastFrameAt)}
                </strong>
              </span>
            </div>
          </div>

          {/* Optical Viewport */}
          <div className="flex-1 min-h-[380px] sm:min-h-[440px] bg-[#F7F9F7] flex items-center justify-center p-4 relative">
            {displayedCapture ? (
              <div className="relative w-full h-full flex items-center justify-center">
                <img
                  src={displayedCapture.imageUrl}
                  alt={displayedCapture.label}
                  referrerPolicy="no-referrer"
                  className="max-h-[460px] w-auto object-contain rounded-lg border border-[#E5EAE6] bg-white shadow-xs"
                />
              </div>
            ) : (
              <div className="max-w-md text-center p-6">
                <div className="w-12 h-12 rounded-xl bg-white border border-[#E5EAE6] flex items-center justify-center mx-auto mb-3">
                  <WifiOff className="w-5 h-5 text-[#767E78]" />
                </div>
                <h2 className="font-display text-base font-semibold text-[#202520]">
                  {cameraStatus?.connected
                    ? 'Waiting for next GC2145 frame'
                    : 'ESP32-CAM Camera Feed Disconnected'}
                </h2>
                <p className="text-xs text-[#5C645E] mt-1.5 leading-relaxed">
                  {cameraStatus?.message ||
                    'No camera backend URL is configured on the server. Upload a PCB image manually on the right or load a Demo Mode sample to run AI inspection.'}
                </p>
              </div>
            )}
          </div>

          {/* Primary Capture & Analysis Action Bar */}
          <div className="px-5 py-4 bg-white border-t border-[#E5EAE6] flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleCaptureCommand}
                disabled={capturing}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#16834A] text-white text-sm font-semibold hover:bg-[#126B3C] disabled:opacity-50 transition-colors whitespace-nowrap"
              >
                <Camera className="w-4 h-4" />
                <span>{capturing ? 'Requesting Frame...' : 'CAPTURE PCB'}</span>
              </button>

              {displayedCapture && (
                <button
                  type="button"
                  onClick={handleRetake}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-lg border border-[#E5EAE6] text-xs font-medium text-[#202520] hover:bg-[#F7F9F7] transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Retake</span>
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => displayedCapture && onAnalyzeCapture(displayedCapture)}
              disabled={!displayedCapture}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#202520] text-white text-sm font-semibold hover:bg-[#202520]/90 disabled:opacity-40 disabled:cursor-not-allowed transition-colors whitespace-nowrap"
            >
              <Cpu className="w-4 h-4" />
              <span>Analyze PCB</span>
            </button>
          </div>
        </section>

        {/* Right Column: Manual Upload + Hardware Integration Notice + Demo Mode */}
        <div className="xl:col-span-4 flex flex-col gap-5">
          {/* Manual Upload Card */}
          <section className="bg-white rounded-xl border border-[#E5EAE6] p-5 shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
            <h2 className="font-display text-base font-semibold text-[#202520]">
              Manual PCB Upload
            </h2>
            <p className="text-xs text-[#5C645E] mt-1">
              Upload a JPEG, PNG, or WebP photograph (up to 15 MB) for immediate Gemini inspection.
            </p>

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragActive(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleFileUpload(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
              }}
              className={`mt-4 rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${
                dragActive
                  ? 'border-[#16834A] bg-[#ECFDF3]/60'
                  : 'border-[#D6DDD7] bg-[#F7F9F7]/70 hover:border-[#16834A]/60 hover:bg-[#F7F9F7]'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileUpload(file);
                }}
              />
              <Upload className="w-6 h-6 text-[#16834A] mx-auto mb-2" />
              <div className="text-xs font-semibold text-[#202520]">
                {uploading ? 'Uploading and validating...' : 'Drop PCB photograph or click to browse'}
              </div>
              <div className="text-[11px] text-[#767E78] mt-1">
                Sharp overhead lighting recommended for reading IC markings
              </div>
            </div>
          </section>

          {/* ESP32-CAM Adapter Architecture Note */}
          <section className="bg-white rounded-xl border border-[#E5EAE6] p-5 shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
            <h2 className="font-display text-sm font-semibold text-[#202520]">
              Hardware Camera Adapter
            </h2>
            <p className="text-xs text-[#5C645E] mt-1.5 leading-relaxed">
              The ESP32-CAM (GC2145) firmware streams periodic <span className="font-mono text-[#202520]">LIVE FRAME</span> uploads every ~2.5s to your Supabase Edge Function. Remote <span className="font-mono text-[#202520]">MANUAL CAPTURE</span> commands become active once <span className="font-mono text-[#202520]">CAMERA_COMMAND_URL</span> is configured on the server.
            </p>
          </section>

          {/* Clearly Labelled Demo Mode */}
          <section className="bg-[#F7F9F7] rounded-xl border border-[#E5EAE6] p-5">
            <div className="flex items-center gap-2">
              <FlaskConical className="w-4 h-4 text-amber-700" />
              <h2 className="font-display text-sm font-semibold text-[#202520]">
                Demo Mode · Sample PCBs
              </h2>
            </div>
            <p className="text-xs text-[#5C645E] mt-1 leading-relaxed">
              Load a labelled sample board to test real Gemini Vision component identification without connected hardware.
            </p>

            <div className="mt-3.5 space-y-2">
              {demoSamples.map((sample) => (
                <button
                  key={sample.id}
                  type="button"
                  onClick={() => handleLoadDemo(sample.id)}
                  disabled={loadingDemo !== null}
                  className="w-full p-2.5 rounded-lg bg-white border border-[#E5EAE6] hover:border-[#16834A] text-left flex items-center gap-3 transition-colors disabled:opacity-50"
                >
                  <img
                    src={sample.imageUrl}
                    alt={sample.title}
                    referrerPolicy="no-referrer"
                    className="w-12 h-9 object-cover rounded border border-[#E5EAE6] shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-[#202520] truncate">
                      {loadingDemo === sample.id ? 'Loading sample...' : sample.title}
                    </div>
                    <div className="text-[11px] text-[#5C645E] truncate">{sample.subtitle}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* Recent Captures Gallery */}
      <section className="bg-white rounded-xl border border-[#E5EAE6] p-5 shadow-[0_1px_2px_rgba(16,24,18,0.03)]">
        <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#E5EAE6]">
          <div>
            <h2 className="font-display text-base font-semibold text-[#202520]">
              Recent Captures Gallery
            </h2>
            <p className="text-xs text-[#5C645E] mt-0.5">
              Select any captured or uploaded PCB photograph to preview or run AI analysis
            </p>
          </div>
          <span className="font-mono tabular-nums text-xs text-[#5C645E]">
            {recentCaptures.length} stored
          </span>
        </div>

        {recentCaptures.length === 0 ? (
          <div className="py-10 text-center">
            <ImageIcon className="w-6 h-6 text-[#767E78] mx-auto mb-2" />
            <p className="text-xs text-[#5C645E]">
              No PCB captures stored yet. Upload a photograph or load a Demo Mode sample above.
            </p>
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {recentCaptures.map((cap) => {
              const isSelected = displayedCapture?.id === cap.id;
              return (
                <div
                  key={cap.id}
                  className={`rounded-lg border overflow-hidden transition-colors bg-white ${
                    isSelected
                      ? 'border-[#16834A] ring-1 ring-[#16834A]/30'
                      : 'border-[#E5EAE6] hover:border-[#C7D1C9]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectCapture(cap)}
                    className="w-full text-left block"
                  >
                    <div className="aspect-[4/3] bg-[#F7F9F7] overflow-hidden">
                      <img
                        src={cap.imageUrl}
                        alt={cap.label}
                        referrerPolicy="no-referrer"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  </button>
                  <div className="p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-[#202520] truncate">
                        {cap.label}
                      </span>
                      <button
                        type="button"
                        onClick={() => setPendingDeleteCaptureId(cap.id)}
                        className="p-1 text-[#767E78] hover:text-red-600 transition-colors shrink-0"
                        title="Delete capture"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="text-[11px] text-[#5C645E] mt-1 flex items-center justify-between gap-2">
                      <span className="font-mono">{cap.sourceType}</span>
                      <span className="font-mono tabular-nums">
                        {cap.width && cap.height ? `${cap.width}×${cap.height}` : ''}
                      </span>
                    </div>
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => onSelectCapture(cap)}
                        className="flex-1 py-1.5 px-2.5 rounded border border-[#E5EAE6] text-[11px] font-medium text-[#202520] hover:bg-[#F7F9F7] transition-colors"
                      >
                        Select
                      </button>
                      <button
                        type="button"
                        onClick={() => onAnalyzeCapture(cap)}
                        className="flex-1 py-1.5 px-2.5 rounded bg-[#16834A] text-[11px] font-medium text-white hover:bg-[#126B3C] transition-colors"
                      >
                        Analyze
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {displayedCapture && (
        <ImageZoomModal
          open={fullscreenOpen}
          onClose={() => setFullscreenOpen(false)}
          imageUrl={displayedCapture.imageUrl}
          title={displayedCapture.label}
          subtitle={`${formatSourceLabel(displayedCapture.sourceType)} · ${
            displayedCapture.width && displayedCapture.height
              ? `${displayedCapture.width}×${displayedCapture.height}`
              : ''
          }`}
        />
      )}

      <ConfirmModal
        open={Boolean(pendingDeleteCaptureId)}
        title="Delete Captured Frame"
        message="Remove this PCB photograph from local storage? Any linked inspection reports will also be deleted."
        onConfirm={handleConfirmDeleteCapture}
        onCancel={() => setPendingDeleteCaptureId(null)}
        loading={deletingCapture}
      />
    </div>
  );
};
