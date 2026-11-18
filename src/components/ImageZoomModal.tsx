import React, { useState } from 'react';
import { RotateCcw, X, ZoomIn, ZoomOut } from 'lucide-react';

interface ImageZoomModalProps {
  open: boolean;
  onClose: () => void;
  imageUrl: string;
  title: string;
  subtitle?: string;
}

export const ImageZoomModal: React.FC<ImageZoomModalProps> = ({
  open,
  onClose,
  imageUrl,
  title,
  subtitle,
}) => {
  const [zoom, setZoom] = useState(1);

  if (!open) return null;

  const handleZoomIn = () => setZoom((z) => Math.min(4, Number((z + 0.5).toFixed(1))));
  const handleZoomOut = () => setZoom((z) => Math.max(1, Number((z - 0.5).toFixed(1))));
  const handleReset = () => setZoom(1);

  return (
    <div
      className="fixed inset-0 z-50 bg-[#202520]/80 backdrop-blur-sm flex flex-col no-print"
      role="dialog"
      aria-modal="true"
      aria-label="Fullscreen PCB image inspector"
    >
      <div className="flex items-center justify-between gap-4 px-5 py-3.5 bg-white/95 border-b border-[#E5EAE6]">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[#202520] truncate">{title}</div>
          {subtitle && (
            <div className="text-xs text-[#5C645E] truncate">{subtitle}</div>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleZoomOut}
            disabled={zoom <= 1}
            className="p-2 rounded-lg border border-[#E5EAE6] text-[#202520] hover:bg-[#F7F9F7] disabled:opacity-40 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="font-mono tabular-nums text-xs text-[#202520] min-w-[46px] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            type="button"
            onClick={handleZoomIn}
            disabled={zoom >= 4}
            className="p-2 rounded-lg border border-[#E5EAE6] text-[#202520] hover:bg-[#F7F9F7] disabled:opacity-40 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="p-2 rounded-lg border border-[#E5EAE6] text-[#202520] hover:bg-[#F7F9F7] transition-colors"
            title="Reset zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="ml-2 px-3 py-2 rounded-lg bg-[#202520] text-white text-xs font-medium hover:bg-[#202520]/90 inline-flex items-center gap-1.5 transition-colors whitespace-nowrap"
          >
            <X className="w-4 h-4" />
            <span>Close</span>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6 flex items-center justify-center">
        <div className="relative inline-block">
          <img
            src={imageUrl}
            alt={title}
            referrerPolicy="no-referrer"
            style={{
              transform: `scale(${zoom})`,
              transformOrigin: 'center center',
            }}
            className="max-h-[80vh] max-w-[88vw] object-contain rounded-lg border border-white/20 shadow-2xl transition-transform duration-150 bg-[#F7F9F7]"
          />
        </div>
      </div>
    </div>
  );
};
