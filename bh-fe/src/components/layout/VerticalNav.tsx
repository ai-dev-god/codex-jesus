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
      <div className="w-20 shrink-0 sm:w-24 xl:w-28" aria-hidden="true" />

      <nav
        className="fixed left-4 top-1/2 -translate-y-1/2 z-40 sm:left-6"
        aria-label="Primary navigation"
      >
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
                title={item.label}
                className={`group relative h-14 w-14 rounded-xl flex items-center justify-center transition-all ${
                  isActive ? 'gradient-electric shadow-lg' : 'bg-white hover:bg-pearl'
                }`}
              >
                <Icon
                  className={`h-5 w-5 transition-colors ${
                    isActive ? 'text-void' : 'text-steel group-hover:text-ink'
                  }`}
                />

                <div className="pointer-events-none absolute left-full ml-4 whitespace-nowrap rounded-xl neo-card px-4 py-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <span className="text-sm font-semibold text-ink">{item.label}</span>
                </div>

                {isActive && (
                  <div className="gradient-electric absolute -left-1 top-1/2 h-8 w-1 -translate-y-1/2 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
