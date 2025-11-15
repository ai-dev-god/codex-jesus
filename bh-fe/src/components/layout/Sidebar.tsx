import { LucideIcon } from 'lucide-react';

interface SidebarProps {
  items: Array<{
    id: string;
    label: string;
    icon: LucideIcon;
  }>;
  currentView: string;
  onNavigate: (view: string) => void;
}

export default function Sidebar({ items, currentView, onNavigate }: SidebarProps) {
  return (
    <aside className="w-72 bg-white border-r-2 border-[rgba(123,165,145,0.1)] flex flex-col nature-pattern">
      {/* Logo Area */}
      <div className="p-8 border-b-2 border-[rgba(123,165,145,0.1)]">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-12 h-12 rounded-3xl wellness-gradient flex items-center justify-center shadow-lg shadow-sage/20">
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M14 6C14 6 10 10 10 14C10 16.2 11.8 18 14 18C16.2 18 18 16.2 18 14C18 10 14 6 14 6Z" fill="white" opacity="0.9"/>
              <path d="M14 12L8 18L14 24L20 18L14 12Z" fill="white" opacity="0.6"/>
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-semibold text-forest" style={{ letterSpacing: '-0.01em' }}>
              BioHax
            </h2>
            <p className="text-xs text-stone">Human Performance OS</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = currentView === item.id;
          
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300 ${
                isActive
                  ? 'sage-gradient text-white shadow-lg shadow-sage/25 scale-[1.02]'
                  : 'text-slate-light hover:bg-cloud hover:text-forest hover:scale-[1.01]'
              }`}
            >
              <Icon className={`w-5 h-5 ${isActive ? 'text-white' : ''}`} />
              <span className="font-medium">{item.label}</span>
              {isActive && (
                <div className="ml-auto">
                  <div className="w-2 h-2 bg-white rounded-full animate-pulse-glow" />
                </div>
              )}
            </button>
          );
        })}
      </nav>

      {/* User Profile Area */}
      <div className="p-4 border-t-2 border-[rgba(123,165,145,0.1)]">
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-gradient-to-br from-cloud to-sand border-2 border-[rgba(123,165,145,0.08)] hover:shadow-md transition-shadow">
          <div className="w-12 h-12 rounded-full coral-gradient flex items-center justify-center text-white shadow-md">
            <span className="text-lg font-semibold">AR</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-forest truncate">Alex Rivera</p>
            <p className="text-xs text-stone">Biohacker Plan</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
