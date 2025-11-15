import { Search, Bell, User, Sparkles } from 'lucide-react';
import { Badge } from '../ui/badge';

interface FloatingHeaderProps {
  onStartOnboarding: () => void;
}

export default function FloatingHeader({ onStartOnboarding }: FloatingHeaderProps) {
  return (
    <header className="fixed top-8 left-1/2 -translate-x-1/2 z-40 w-full max-w-4xl px-8">
      <div className="glass-card p-4 flex items-center gap-4">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-text-tertiary" />
          <input
            type="text"
            placeholder="Search anything..."
            className="w-full pl-12 pr-4 py-3 rounded-2xl bg-mist/30 border-0 outline-none text-sm font-medium text-text-primary placeholder:text-text-tertiary focus:bg-white transition-all"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button 
            onClick={onStartOnboarding}
            className="px-5 py-3 rounded-2xl gradient-life text-white font-semibold hover:scale-105 transition-all shadow-lg hover:shadow-xl flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            <span className="hidden md:inline">Get Started</span>
          </button>
          
          <button className="relative w-12 h-12 rounded-2xl bg-white hover:bg-mist transition-all flex items-center justify-center hover:scale-105">
            <Bell className="w-5 h-5 text-text-secondary" />
            <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-energy flex items-center justify-center">
              <span className="text-xs font-bold text-white">3</span>
            </div>
          </button>
          
          <button className="w-12 h-12 rounded-2xl gradient-vitality flex items-center justify-center hover:scale-105 transition-all shadow-lg">
            <span className="text-sm font-bold text-white">AR</span>
          </button>
        </div>
      </div>
    </header>
  );
}
