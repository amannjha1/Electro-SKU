import React from 'react';

interface LogoProps {
  compact?: boolean;
}

export const Logo: React.FC<LogoProps> = ({ compact = false }) => {
  return (
    <div className="flex items-center gap-3 select-none">
      <div className="w-9 h-9 rounded-lg bg-[#16834A]/10 border border-[#16834A]/20 flex items-center justify-center shrink-0">
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
          aria-hidden="true"
        >
          {/* PCB trace & optical inspection reticle */}
          <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="#16834A" strokeWidth="1.6" />
          <path
            d="M4 9H7.5L9.5 11H14.5L16.5 9H20"
            stroke="#16834A"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M4 15H8L10 13H14L16 15H20"
            stroke="#16834A"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="12" r="2.2" fill="#16834A" />
          <circle cx="7.5" cy="9" r="1" fill="#16834A" />
          <circle cx="16.5" cy="15" r="1" fill="#16834A" />
        </svg>
      </div>
      <div className="min-w-0">
        <div className="font-display font-bold text-[17px] tracking-tight text-[#202520] leading-tight whitespace-nowrap">
          ElectroSKU
        </div>
        {!compact && (
          <div className="text-[11px] text-[#5C645E] leading-tight truncate mt-0.5">
            AI-Powered PCB Inspection &amp; Intelligence
          </div>
        )}
      </div>
    </div>
  );
};
