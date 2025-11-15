import ScoreHero from './ScoreHero';
import BentoGrid from './BentoGrid';

export default function Dashboard() {
  return (
    <div className="min-h-screen mesh-gradient pt-28 pb-20 px-6">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Welcome Section */}
        <div className="text-center mb-12">
          <h1 className="mb-3">Welcome back, Alex</h1>
          <p className="text-xl text-steel">Your daily performance snapshot</p>
        </div>

        {/* Hero Score */}
        <ScoreHero />

        {/* Bento Grid Layout */}
        <div className="mt-16">
          <BentoGrid />
        </div>

        {/* Timeline */}
        <div className="mt-20">
          <div className="flex items-center justify-between mb-8">
            <div>
              <div className="tag text-steel mb-2">TODAY'S SCHEDULE</div>
              <h2>November 1, 2025</h2>
            </div>
            <button className="text-sm font-bold text-electric hover:text-electric-bright transition-colors">
              View Full Calendar →
            </button>
          </div>

          <div className="space-y-6">
            {[
              { time: '7:00 AM', title: 'Morning Protocol', status: 'completed', color: 'bio' },
              { time: '12:00 PM', title: 'Midday Optimization', status: 'completed', color: 'electric' },
              { time: '6:00 PM', title: 'Evening Training', status: 'active', color: 'pulse' },
              { time: '10:00 PM', title: 'Sleep Preparation', status: 'upcoming', color: 'neural' },
            ].map((event, i) => (
              <div key={i} className="flex items-center gap-6">
                <div className={`w-24 h-16 rounded-xl gradient-${event.color} flex flex-col items-center justify-center text-white flex-shrink-0 shadow-lg`}>
                  <span className="text-lg font-bold">{event.time.split(' ')[0]}</span>
                  <span className="text-xs opacity-80">{event.time.split(' ')[1]}</span>
                </div>

                <div className={`flex-1 p-6 rounded-xl transition-all ${
                  event.status === 'active'
                    ? `neo-card-${event.color} glow-${event.color}`
                    : event.status === 'completed'
                    ? 'neo-card bg-pearl'
                    : 'neo-card'
                }`}>
                  <div className="flex items-center justify-between">
                    <h4>{event.title}</h4>
                    <div className={`tag ${
                      event.status === 'completed'
                        ? 'text-bio bg-bio/10'
                        : event.status === 'active'
                        ? `text-${event.color} bg-${event.color}/10 animate-glow-pulse`
                        : 'text-steel bg-cloud'
                    } px-3 py-1.5 rounded-full`}>
                      {event.status === 'completed' ? '✓ DONE' : event.status === 'active' ? '● IN PROGRESS' : 'UPCOMING'}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
