import { Search, Zap, User, Bell } from 'lucide-react';
import { LucideIcon } from 'lucide-react';

interface CommandBarProps {
  onStartOnboarding: () => void;
}

export default function CommandBar({ onStartOnboarding }: CommandBarProps) {
  return (
    <div className="fixed top-0 left-0 right-0 z-50 px-6 pt-6">
      <div className="max-w-7xl mx-auto">
        <div className="neo-card p-3 flex items-center gap-3">
          {/* Search Command */}
          <div className="flex-1 flex items-center gap-3 px-4 py-2 rounded-xl bg-pearl hover:bg-mist transition-colors">
            <Search className="w-5 h-5 text-steel" />
            <input
              type="text"
              placeholder="Search biomarkers, protocols, insights..."
              className="flex-1 bg-transparent border-0 outline-none text-ink placeholder:text-steel"
            />
            <div className="flex items-center gap-1">
              <kbd className="px-2 py-1 rounded-lg bg-white border border-cloud text-xs text-steel">⌘</kbd>
              <kbd className="px-2 py-1 rounded-lg bg-white border border-cloud text-xs text-steel">K</kbd>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2">
            <button
              onClick={onStartOnboarding}
              className="px-5 py-2.5 rounded-xl gradient-electric text-void font-bold hover:scale-105 transition-transform shadow-lg"
            >
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4" />
                <span>Get Started</span>
              </div>
            </button>

            <button className="relative w-11 h-11 rounded-xl bg-white hover:bg-pearl transition-colors flex items-center justify-center">
              <Bell className="w-5 h-5 text-ink" />
              <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full gradient-pulse flex items-center justify-center">
                <span className="text-xs font-bold text-white">3</span>
              </div>
            </button>

            <button className="w-11 h-11 rounded-xl gradient-spectrum flex items-center justify-center hover:scale-105 transition-transform">
              <span className="text-sm font-bold text-white">AR</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
