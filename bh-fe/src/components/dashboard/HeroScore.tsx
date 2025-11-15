import { TrendingUp, Zap, Target } from 'lucide-react';

export default function HeroScore() {
  const score = 86;
  const change = +4;
  
  return (
    <div className="relative">
      {/* Background Glow */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-96 h-96 rounded-full bg-life/10 blur-3xl" />
      </div>
      
      {/* Main Score Display */}
      <div className="relative glass-card p-12 text-center">
        <div className="mb-6">
          <span className="text-micro text-text-tertiary">YOUR LONGEVITY SCORE</span>
        </div>
        
        {/* Massive Score */}
        <div className="relative inline-block">
          <div className="text-display font-black bg-gradient-to-br from-life via-focus to-calm bg-clip-text text-transparent">
            {score}
          </div>
          <div className="absolute -top-4 -right-16">
            <div className="px-4 py-2 rounded-full bg-life/10 border-2 border-life/30 flex items-center gap-2 animate-float">
              <TrendingUp className="w-4 h-4 text-life" />
              <span className="font-bold text-life">+{change}</span>
            </div>
          </div>
        </div>
        
        <div className="mt-4 text-text-secondary font-medium">
          Top 12% globally
        </div>
        
        {/* Quick Metrics */}
        <div className="grid grid-cols-3 gap-4 mt-12">
          <div className="p-4 rounded-2xl bg-gradient-to-br from-life/5 to-life/10 border border-life/20">
            <Zap className="w-6 h-6 text-life mx-auto mb-2" />
            <div className="text-2xl font-bold text-text-primary">92</div>
            <div className="text-xs text-text-tertiary mt-1">Energy</div>
          </div>
          
          <div className="p-4 rounded-2xl bg-gradient-to-br from-focus/5 to-focus/10 border border-focus/20">
            <Target className="w-6 h-6 text-focus mx-auto mb-2" />
            <div className="text-2xl font-bold text-text-primary">88</div>
            <div className="text-xs text-text-tertiary mt-1">Recovery</div>
          </div>
          
          <div className="p-4 rounded-2xl bg-gradient-to-br from-calm/5 to-calm/10 border border-calm/20">
            <svg className="w-6 h-6 text-calm mx-auto mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <div className="text-2xl font-bold text-text-primary">84</div>
            <div className="text-xs text-text-tertiary mt-1">Focus</div>
          </div>
        </div>
      </div>
    </div>
  );
}
