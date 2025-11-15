import { LucideIcon } from 'lucide-react';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface VerticalNavProps {
  items: NavItem[];
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function VerticalNav({ items, currentView, onNavigate }: VerticalNavProps) {
  return (
    <nav className="fixed left-6 top-1/2 -translate-y-1/2 z-40">
      <div className="neo-card p-2 space-y-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`group relative w-14 h-14 rounded-xl flex items-center justify-center transition-all ${
                isActive
                  ? 'gradient-electric shadow-lg'
                  : 'bg-white hover:bg-pearl'
              }`}
            >
              <Icon className={`w-5 h-5 transition-colors ${
                isActive ? 'text-void' : 'text-steel group-hover:text-ink'
              }`} />
              
              {/* Tooltip */}
              <div className="absolute left-full ml-4 px-4 py-2 rounded-xl neo-card opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                <span className="text-sm font-semibold text-ink">{item.label}</span>
              </div>
              
              {/* Active Indicator */}
              {isActive && (
                <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full gradient-electric" />
              )}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
