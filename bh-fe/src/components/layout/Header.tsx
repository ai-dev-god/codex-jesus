import { Bell, Search, Sun, Sparkles, Leaf } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { LanguageSwitcher } from './LanguageSwitcher';
import { useTranslation } from '../../lib/i18n/LanguageContext';

interface HeaderProps {
  onStartOnboarding: () => void;
}

export default function Header({ onStartOnboarding }: HeaderProps) {
  const t = useTranslation();
  
  return (
    <header className="h-20 bg-white border-b-2 border-[rgba(123,165,145,0.1)] px-8 flex items-center justify-between nature-pattern">
      {/* Search */}
      <div className="flex-1 max-w-xl">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-stone" />
          <input
            type="text"
            placeholder={t.common.search + ' biomarkers, protocols, insights...'}
            className="w-full pl-12 pr-4 py-3.5 rounded-2xl bg-cloud border-2 border-transparent focus:border-sage/30 focus:bg-white outline-none transition-all text-forest placeholder:text-stone shadow-sm"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 ml-6">
        {/* Wellness Score */}
        <div className="hidden md:flex items-center gap-3 px-5 py-3 rounded-2xl bg-gradient-to-br from-cloud to-sand border-2 border-[rgba(123,165,145,0.08)] hover:shadow-md transition-all">
          <div className="w-10 h-10 rounded-2xl wellness-gradient flex items-center justify-center text-white shadow-md">
            <Leaf className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-stone">{t.dashboard.longevityScore}</p>
            <p className="text-lg font-semibold text-forest">86</p>
          </div>
        </div>

        {/* Today's Progress */}
        <div className="hidden lg:flex items-center gap-3 px-5 py-3 rounded-2xl bg-gradient-to-br from-cloud to-sand border-2 border-[rgba(123,165,145,0.08)] hover:shadow-md transition-all">
          <div className="w-10 h-10 rounded-2xl vitality-gradient flex items-center justify-center text-white shadow-md">
            <Sun className="w-5 h-5" />
          </div>
          <div>
            <p className="text-xs text-stone">{t.protocols.daily} {t.dashboard.protocols}</p>
            <p className="text-lg font-semibold text-forest">4/6</p>
          </div>
        </div>

        {/* Language Switcher */}
        <LanguageSwitcher />

        {/* Notifications */}
        <button className="relative w-12 h-12 rounded-2xl bg-cloud hover:bg-sand border-2 border-transparent hover:border-sage/20 flex items-center justify-center transition-all hover:scale-105 hover:shadow-md">
          <Bell className="w-5 h-5 text-forest" />
          <Badge className="absolute -top-1 -right-1 w-5 h-5 p-0 flex items-center justify-center coral-gradient border-2 border-white text-xs shadow-sm">
            3
          </Badge>
        </button>

        {/* Get Started */}
        <Button 
          onClick={onStartOnboarding}
          className="hidden md:flex sage-gradient hover:shadow-lg hover:shadow-sage/30 hover:scale-105 transition-all rounded-2xl px-6 h-12"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {t.landing.ctaPrimary}
        </Button>
      </div>
    </header>
  );
}
