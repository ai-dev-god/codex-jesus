import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { BookOpen, Clock, Award, TrendingUp, ChevronRight, Sparkles } from 'lucide-react';

const activeProtocols = [
  {
    id: '1',
    title: 'Mitochondrial Function Optimization',
    category: 'Energy & Longevity',
    duration: '12 weeks',
    evidence: 'High',
    adherence: 85,
    impact: '+12% energy levels',
    components: ['NAD+ Precursors', 'CoQ10', 'Zone 2 Cardio', 'Time-Restricted Eating'],
    citations: 3,
    color: 'electric',
  },
  {
    id: '2',
    title: 'Cardiovascular Health Enhancement',
    category: 'Heart Health',
    duration: '8 weeks',
    evidence: 'High',
    adherence: 92,
    impact: '+8% VO2 max',
    components: ['Omega-3 EPA/DHA', 'L-Citrulline', 'HIIT Training', 'Beetroot Extract'],
    citations: 5,
    color: 'bio',
  },
  {
    id: '3',
    title: 'Sleep Quality Improvement',
    category: 'Recovery',
    duration: '6 weeks',
    evidence: 'Medium',
    adherence: 78,
    impact: '+45 min deep sleep',
    components: ['Magnesium Glycinate', 'L-Theanine', 'Blue Light Blocking', 'Sleep Hygiene'],
    citations: 2,
    color: 'neural',
  },
];

const recommendedProtocols = [
  {
    id: '4',
    title: 'Cognitive Enhancement Protocol',
    description: 'Improve focus, memory, and mental clarity based on your biomarker profile',
    reason: 'Your homocysteine levels suggest potential benefit',
    evidence: 'High',
    duration: '10 weeks',
    color: 'neural',
  },
  {
    id: '5',
    title: 'Inflammation Reduction',
    description: 'Target chronic inflammation with evidence-based interventions',
    reason: 'CRP slightly elevated above optimal range',
    evidence: 'High',
    duration: '8 weeks',
    color: 'pulse',
  },
  {
    id: '6',
    title: 'Hormone Optimization',
    description: 'Balance key hormones for improved performance and recovery',
    reason: 'Testosterone/Cortisol ratio could be optimized',
    evidence: 'Medium',
    duration: '12 weeks',
    color: 'solar',
  },
];

export default function ProtocolsView() {
  return (
    <div className="min-h-screen mesh-gradient pt-28 pb-20 px-6">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="tag text-steel mb-3">PROTOCOLS</div>
            <h2 className="mb-4">Evidence-based interventions</h2>
            <p className="text-xl text-steel max-w-2xl">
              Personalized protocols powered by your biomarkers and AI analysis
            </p>
          </div>
          <Button size="lg">
            <BookOpen className="w-5 h-5 mr-2" />
            Research Library
          </Button>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="active" className="w-full">
          <TabsList>
            <TabsTrigger value="active">Active Protocols</TabsTrigger>
            <TabsTrigger value="recommended">Recommended</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>

          {/* Active Protocols */}
          <TabsContent value="active" className="mt-8 space-y-6">
            {activeProtocols.map((protocol) => {
              const cardClass = `neo-card-${protocol.color}`;
              const gradientClass = `gradient-${protocol.color}`;
              const evidenceBadge = protocol.evidence === 'High' ? 'success' : 'warning';

              return (
                <div key={protocol.id} className={`${cardClass} p-8 hover:scale-[1.02] transition-transform`}>
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6 mb-6">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <h3>{protocol.title}</h3>
                        <span className="tag text-steel">{protocol.category}</span>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-6 mb-4">
                        <div className="flex items-center gap-2">
                          <Clock className="w-5 h-5 text-steel" />
                          <span className="text-sm font-semibold text-ink">{protocol.duration}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Award className="w-5 h-5 text-steel" />
                          <Badge variant={evidenceBadge as any}>
                            {protocol.evidence} Evidence
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <BookOpen className="w-5 h-5 text-steel" />
                          <span className="text-sm font-semibold text-ink">{protocol.citations} Citations</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <TrendingUp className="w-5 h-5 text-bio" />
                          <span className="text-sm font-semibold text-bio">{protocol.impact}</span>
                        </div>
                      </div>
                    </div>
                    
                    <Button variant="outline">
                      View Details
                      <ChevronRight className="w-5 h-5 ml-2" />
                    </Button>
                  </div>

                  {/* Adherence Bar */}
                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-semibold text-steel">Protocol Adherence</span>
                      <span className="text-sm font-bold text-ink">{protocol.adherence}%</span>
                    </div>
                    <div className="w-full bg-pearl rounded-full h-3 overflow-hidden">
                      <div
                        className={`${gradientClass} h-3 rounded-full transition-all duration-500`}
                        style={{ width: `${protocol.adherence}%` }}
                      />
                    </div>
                  </div>

                  {/* Components */}
                  <div className="flex flex-wrap gap-2">
                    {protocol.components.map((component) => (
                      <span
                        key={component}
                        className="px-4 py-2 bg-white rounded-xl text-sm font-semibold text-ink border-2 border-cloud"
                      >
                        {component}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </TabsContent>

          {/* Recommended Protocols */}
          <TabsContent value="recommended" className="mt-8 space-y-6">
            {recommendedProtocols.map((protocol) => {
              const cardClass = `neo-card-${protocol.color}`;
              const evidenceBadge = protocol.evidence === 'High' ? 'success' : 'warning';

              return (
                <div key={protocol.id} className={`${cardClass} p-8 hover:scale-[1.02] transition-transform`}>
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                    <div className="flex-1">
                      <div className="flex flex-wrap items-center gap-3 mb-3">
                        <h3>{protocol.title}</h3>
                        <Badge variant="default" className="bg-electric text-void">
                          <Sparkles className="w-3 h-3 mr-1" />
                          AI Recommended
                        </Badge>
                      </div>
                      
                      <p className="text-ink mb-4">{protocol.description}</p>
                      
                      <div className="p-4 rounded-xl bg-neural/10 border-2 border-neural/20 mb-4">
                        <p className="text-sm font-semibold text-ink mb-1">Why this protocol?</p>
                        <p className="text-sm text-steel">{protocol.reason}</p>
                      </div>
                      
                      <div className="flex flex-wrap items-center gap-6">
                        <div className="flex items-center gap-2">
                          <Clock className="w-5 h-5 text-steel" />
                          <span className="text-sm font-semibold text-ink">{protocol.duration}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Award className="w-5 h-5 text-steel" />
                          <Badge variant={evidenceBadge as any}>
                            {protocol.evidence} Evidence
                          </Badge>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex flex-col gap-3">
                      <Button size="lg">
                        Start Protocol
                      </Button>
                      <Button variant="outline">
                        Learn More
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </TabsContent>

          {/* History */}
          <TabsContent value="history" className="mt-8">
            <div className="neo-card p-16 text-center">
              <div className="w-20 h-20 rounded-2xl bg-pearl mx-auto mb-6 flex items-center justify-center">
                <BookOpen className="w-10 h-10 text-steel" />
              </div>
              <h3 className="mb-3">No completed protocols yet</h3>
              <p className="text-steel max-w-md mx-auto">
                Complete your first protocol to see your history and track your longevity progress over time
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
