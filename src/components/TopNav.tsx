import React from 'react';
import {
  Camera,
  Cpu,
  LayoutDashboard,
  Lightbulb,
  Menu,
  X,
} from 'lucide-react';
import { Logo } from './Logo';
import type { SystemHealthStatus } from '../types/electrosku';

export type AppRoute = 'dashboard' | 'capture' | 'analysis' | 'projects';

interface TopNavProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  health: SystemHealthStatus | null;
  mobileOpen: boolean;
  onToggleMobile: (open: boolean) => void;
}

const NAV_ITEMS: Array<{
  id: AppRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'capture', label: 'Capture', icon: Camera },
  { id: 'analysis', label: 'AI Analysis', icon: Cpu },
  { id: 'projects', label: 'Project Recommendations', icon: Lightbulb },
];

export const SystemStatusBadges: React.FC<{ health: SystemHealthStatus | null }> = ({
  health,
}) => {
  const cameraConnected = Boolean(health?.camera.connected);
  const cameraConfigured = Boolean(health?.camera.configured);
  const geminiReady = Boolean(health?.gemini.configured);
  const backendConnected = Boolean(health?.backend.connected && health?.backend.databaseReady);

  const renderIndicator = (
    name: string,
    state: 'green' | 'amber' | 'red',
    label: string
  ) => {
    const dotColor = {
      green: 'bg-[#16834A]',
      amber: 'bg-amber-500',
      red: 'bg-red-600',
    }[state];

    const textColor = {
      green: 'text-[#16834A]',
      amber: 'text-amber-700',
      red: 'text-red-700',
    }[state];

    return (
      <span className="inline-flex items-center gap-1.5 text-xs whitespace-nowrap">
        <span className="text-[#5C645E]">{name}:</span>
        <span className={`inline-flex items-center gap-1.5 font-medium ${textColor}`}>
          <span className={`w-2 h-2 rounded-full ${dotColor} shrink-0`} aria-hidden="true" />
          <span>{label}</span>
        </span>
      </span>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
      {cameraConnected
        ? renderIndicator('ESP32-CAM', 'green', 'Connected')
        : cameraConfigured
        ? renderIndicator('ESP32-CAM', 'amber', 'Standby')
        : renderIndicator('ESP32-CAM', 'red', 'Disconnected')}

      {geminiReady
        ? renderIndicator('Gemini AI', 'green', 'Ready')
        : renderIndicator('Gemini AI', 'amber', 'Key Needed')}

      {health
        ? backendConnected
          ? renderIndicator('Backend API', 'green', 'Connected')
          : renderIndicator('Backend API', 'red', 'Disconnected')
        : renderIndicator('Backend API', 'amber', 'Checking')}
    </div>
  );
};

export const TopNav: React.FC<TopNavProps> = ({
  activeRoute,
  onNavigate,
  health,
  mobileOpen,
  onToggleMobile,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-white/88 backdrop-blur-md border-b border-[#E5EAE6] no-print">
      <div className="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Brand Wordmark */}
        <button
          type="button"
          onClick={() => {
            onNavigate('dashboard');
            onToggleMobile(false);
          }}
          className="text-left whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#16834A] rounded-lg"
        >
          <Logo compact />
        </button>

        {/* Zone 2: Horizontal Navigation Links */}
        <nav
          className="hidden md:flex items-center gap-7 h-full"
          aria-label="Primary Navigation"
        >
          {NAV_ITEMS.map((item) => {
            const isActive = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onNavigate(item.id)}
                className={`h-full inline-flex items-center text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  isActive
                    ? 'border-[#16834A] text-[#16834A]'
                    : 'border-transparent text-[#5C645E] hover:text-[#202520] hover:border-[#D6DDD7]'
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* Zone 3: Primary Action & Mobile Drawer Trigger */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              onNavigate('capture');
              onToggleMobile(false);
            }}
            className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#16834A] text-white text-xs font-semibold hover:bg-[#126B3C] transition-colors whitespace-nowrap shrink-0"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>New Inspection</span>
          </button>

          <button
            type="button"
            onClick={() => onToggleMobile(!mobileOpen)}
            className="md:hidden p-2 rounded-lg border border-[#E5EAE6] text-[#202520] hover:bg-[#F7F9F7] transition-colors"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Dropdown Navigation Menu */}
      {mobileOpen && (
        <div className="md:hidden border-t border-[#E5EAE6] bg-white px-4 py-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onNavigate(item.id);
                  onToggleMobile(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  isActive
                    ? 'bg-[#F7F9F7] text-[#16834A]'
                    : 'text-[#5C645E] hover:text-[#202520] hover:bg-[#F7F9F7]/60'
                }`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-[#16834A]' : 'text-[#767E78]'
                  }`}
                />
                <span>{item.label}</span>
              </button>
            );
          })}

          <div className="pt-3 mt-2 border-t border-[#E5EAE6]">
            <SystemStatusBadges health={health} />
          </div>
        </div>
      )}
    </header>
  );
};
