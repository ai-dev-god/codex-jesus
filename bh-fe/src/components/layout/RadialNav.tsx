import { LucideIcon } from 'lucide-react';
import { useState } from 'react';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface RadialNavProps {
  items: NavItem[];
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function RadialNav({ items, currentView, onNavigate }: RadialNavProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const radius = 120;
  const centerX = 80;
  const centerY = 80;
  
  return (
    <div className="fixed top-8 left-8 z-50">
      {/* Central Hub */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="relative w-40 h-40 rounded-full glass-card flex flex-col items-center justify-center group hover:scale-105 transition-all duration-500"
      >
        <div className="absolute inset-0 rounded-full bg-gradient-to-br from-life/20 via-focus/20 to-energy/20 animate-rotate-slow" />
        
        <div className="relative z-10 flex flex-col items-center">
          <div className="w-16 h-16 rounded-full gradient-vitality flex items-center justify-center mb-2 shadow-lg">
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none" className="text-white">
              <path d="M16 8C16 8 12 12 12 16C12 18.2 13.8 20 16 20C18.2 20 20 18.2 20 16C20 12 16 8 16 8Z" fill="currentColor" opacity="0.9"/>
              <circle cx="16" cy="24" r="2" fill="currentColor" opacity="0.6"/>
            </svg>
          </div>
          <span className="text-xs font-bold text-text-primary">BioHax</span>
          <span className="text-micro text-text-tertiary mt-0.5">
            {isExpanded ? 'CLOSE' : 'MENU'}
          </span>
        </div>
        
        <div className="absolute inset-0 rounded-full border-2 border-life/20 animate-scale-pulse" />
      </button>

      {/* Orbital Navigation Items */}
      {isExpanded && (
        <div className="absolute top-0 left-0">
          {items.map((item, index) => {
            const angle = (index / items.length) * 2 * Math.PI - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            const Icon = item.icon;
            const isActive = currentView === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => {
                  onNavigate(item.id);
                  setIsExpanded(false);
                }}
                className={`absolute w-16 h-16 rounded-2xl transition-all duration-500 group
                  ${isActive 
                    ? 'glass glow-life scale-110' 
                    : 'glass hover:scale-110 hover:glow-focus'
                  }`}
                style={{
                  left: `${x}px`,
                  top: `${y}px`,
                  transform: 'translate(-50%, -50%)',
                  transitionDelay: `${index * 50}ms`,
                }}
              >
                <div className="w-full h-full flex flex-col items-center justify-center relative">
                  {isActive && (
                    <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-life/30 to-focus/30 animate-pulse-glow" />
                  )}
                  <Icon className={`w-6 h-6 relative z-10 ${isActive ? 'text-life' : 'text-text-secondary group-hover:text-focus'}`} />
                </div>
                
                {/* Label on hover */}
                <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                  <span className="text-xs font-semibold px-3 py-1 rounded-full glass text-text-primary">
                    {item.label}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
