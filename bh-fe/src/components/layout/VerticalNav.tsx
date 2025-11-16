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
    <>
      <aside
        className="hidden lg:flex lg:flex-col lg:w-24 xl:w-28 lg:shrink-0 lg:px-4 lg:py-6"
        aria-label="Primary navigation"
      >
        <div className="sticky top-6">
          <div className="neo-card p-2 space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  type="button"
                  aria-label={item.label}
                  aria-pressed={isActive}
                  className={`group relative w-full h-14 rounded-xl flex items-center justify-center transition-all ${
                    isActive ? 'gradient-electric shadow-lg' : 'bg-white hover:bg-pearl'
                  }`}
                >
                  <Icon
                    className={`w-5 h-5 transition-colors ${
                      isActive ? 'text-void' : 'text-steel group-hover:text-ink'
                    }`}
                  />

                  <div className="absolute left-full ml-4 px-4 py-2 rounded-xl neo-card opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity whitespace-nowrap">
                    <span className="text-sm font-semibold text-ink">{item.label}</span>
                  </div>

                  {isActive && (
                    <div className="absolute -left-1 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full gradient-electric" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </aside>

      <nav
        className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-cloud bg-background/95 backdrop-blur-sm"
        aria-label="Mobile navigation"
      >
        <div className="flex items-stretch gap-1 px-3 py-2 overflow-x-auto">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;

            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                type="button"
                aria-label={item.label}
                aria-pressed={isActive}
                className={`flex flex-col items-center justify-center gap-1 rounded-xl px-3 py-2 text-[11px] font-semibold min-w-[72px] transition-colors ${
                  isActive ? 'text-ink bg-pearl' : 'text-steel/80'
                }`}
              >
                <Icon className={`w-5 h-5 ${isActive ? 'text-electric' : 'text-steel/80'}`} />
                <span className="leading-tight">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
