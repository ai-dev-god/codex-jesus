import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Link2, Check, X, RefreshCw, AlertCircle, Activity, FileText, Dna, Microscope, Heart, Smartphone, Sparkles, Upload, Shield, Star } from 'lucide-react';

const integrations = [
  {
    id: 'whoop',
    name: 'WHOOP',
    category: 'Wearable',
    description: 'Advanced recovery and strain tracking',
    icon: Activity,
    status: 'connected',
    lastSync: '2 hours ago',
    metrics: ['HRV', 'Recovery Score', 'Strain', 'Sleep Performance', 'Respiratory Rate'],
    color: 'pulse',
    dataPoints: '24/7 monitoring',
  },
  {
    id: 'biomarker-panel',
    name: 'Practitioner Biomarker Panel',
    category: 'Lab Testing',
    description: 'Custom biomarker panels edited by your practitioner (50 markers on Explorer, 150 on Biohacker)',
    icon: Microscope,
    status: 'connected',
    lastSync: '1 week ago',
    metrics: ['Custom Blood Panel', 'Metabolic Markers', 'Hormone Panel', 'Inflammation Markers', 'Thyroid Function', 'Liver & Kidney Health'],
    color: 'neural',
    dataPoints: '87 biomarkers currently tracked',
    practitionerEdited: true,
  },
  {
    id: 'trueage',
    name: 'TruAge Testing (TruDiagnostic)',
    category: 'Epigenetic',
    description: '1M+ methylation sites analyzed for biological age & organ-specific aging scores',
    icon: Dna,
    status: 'connected',
    lastSync: '2 months ago',
    metrics: ['Biological Age', 'Pace of Aging', 'Immune Age', 'Brain Age', 'Heart Age', 'Telomere Length', 'Inflammatory Age'],
    color: 'bio',
    dataPoints: 'Epigenetic DNA methylation analysis',
    premium: true,
  },
  {
    id: 'gi-effects',
    name: 'Geneva GI Effects Test',
    category: 'Microbiome',
    description: 'Advanced gut diagnostics using PCR, cultures & microscopy for 5 key biomarker areas',
    icon: Heart,
    status: 'connected',
    lastSync: '1 month ago',
    metrics: ['Maldigestion Markers', 'Inflammation Status', 'Dysbiosis Analysis', 'Metabolite Imbalance', 'Pathogen/Infection Detection', 'Methanogens & H2S Producers'],
    color: 'solar',
    dataPoints: 'Comprehensive stool profile with PCR analysis',
    premium: true,
  },
  {
    id: 'health-platforms',
    name: 'Google Health Connect & Apple Health',
    category: 'Health Platforms',
    description: 'Unified health data from your smartphone',
    icon: Smartphone,
    status: 'connected',
    lastSync: '1 hour ago',
    metrics: ['Steps', 'Heart Rate', 'Workouts', 'Active Energy', 'Sleep', 'Nutrition'],
    color: 'electric',
    dataPoints: 'Aggregated health data',
    platforms: ['Google Health Connect', 'Apple Health'],
  },
  {
    id: 'oura',
    name: 'Oura Ring',
    category: 'Wearable',
    description: 'Sleep and readiness tracking',
    icon: Activity,
    status: 'available',
    metrics: ['Sleep Score', 'Readiness', 'HRV', 'Temperature', 'Activity'],
    color: 'bio',
    dataPoints: '24/7 monitoring',
  },
];

export default function IntegrationsPage() {
  const connectedCount = integrations.filter(i => i.status === 'connected').length;

  return (
    <div className="min-h-screen mesh-gradient pt-28 pb-20 px-6">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="tag text-steel mb-3">INTEGRATIONS</div>
            <h2 className="mb-4">Connected data sources</h2>
            <p className="text-xl text-steel max-w-2xl">
              Manage your connected devices, wearables, and lab testing providers
            </p>
          </div>
          <Button size="lg">
            <Link2 className="w-5 h-5 mr-2" />
            Add Integration
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="neo-card-electric p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-electric flex items-center justify-center">
                <Activity className="w-6 h-6 text-void" />
              </div>
              <div>
                <div className="tag text-steel mb-1">ACTIVE INTEGRATIONS</div>
                <div className="text-4xl font-bold text-ink">{connectedCount}</div>
              </div>
            </div>
            <p className="text-sm text-steel">Connected sources</p>
          </div>

          <div className="neo-card-neural p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-neural flex items-center justify-center">
                <FileText className="w-6 h-6 text-void" />
              </div>
              <div>
                <div className="tag text-steel mb-1">DATA SOURCES</div>
                <div className="text-4xl font-bold text-ink">150+</div>
              </div>
            </div>
            <p className="text-sm text-steel">Biomarkers tracked</p>
          </div>

          <div className="neo-card-bio p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-bio flex items-center justify-center">
                <RefreshCw className="w-6 h-6 text-void" />
              </div>
              <div>
                <div className="tag text-steel mb-1">LAST SYNC</div>
                <div className="text-4xl font-bold text-ink">1h</div>
              </div>
            </div>
            <p className="text-sm text-steel">Most recent update</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="all" className="w-full">
          <TabsList>
            <TabsTrigger value="all">All Integrations</TabsTrigger>
            <TabsTrigger value="wearables">Wearables</TabsTrigger>
            <TabsTrigger value="labs">Lab Testing</TabsTrigger>
            <TabsTrigger value="api">API Access</TabsTrigger>
          </TabsList>

          {/* All Integrations Tab */}
          <TabsContent value="all" className="mt-8 space-y-6">
            {integrations.map((integration) => {
              const Icon = integration.icon;
              const isConnected = integration.status === 'connected';
              const cardClass = isConnected ? `neo-card-${integration.color}` : 'neo-card';
              const gradientClass = `gradient-${integration.color}`;

              return (
                <div key={integration.id} className={`${cardClass} p-8 hover:scale-[1.01] transition-transform`}>
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                    <div className="flex items-start gap-4 flex-1">
                      <div className={`w-16 h-16 rounded-2xl ${gradientClass} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-8 h-8 text-void" />
                      </div>
                      <div className="flex-1">
                        <div className="flex flex-wrap items-center gap-3 mb-3">
                          <h3>{integration.name}</h3>
                          {isConnected ? (
                            <Badge variant="success">
                              <Check className="w-3 h-3 mr-1" />
                              Connected
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              Available
                            </Badge>
                          )}
                          {integration.practitionerEdited && (
                            <Badge className="bg-electric text-void">
                              <Sparkles className="w-3 h-3 mr-1" />
                              Practitioner Managed
                            </Badge>
                          )}
                          {integration.premium && (
                            <Badge className="bg-gradient-to-r from-neural to-bio text-white">
                              <Star className="w-3 h-3 mr-1" />
                              Premium Test
                            </Badge>
                          )}
                        </div>
                        <p className="text-ink mb-3">{integration.description}</p>
                        
                        {isConnected && (
                          <p className="text-sm text-steel mb-4">
                            <span className="font-semibold">Last synced:</span> {integration.lastSync} • {integration.dataPoints}
                          </p>
                        )}
                        
                        {integration.platforms && (
                          <div className="flex flex-wrap gap-2 mb-4">
                            {integration.platforms.map((platform) => (
                              <span
                                key={platform}
                                className="px-4 py-2 bg-white rounded-xl text-sm font-semibold text-ink border-2 border-cloud"
                              >
                                {platform}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {integration.metrics.map((metric) => (
                            <span
                              key={metric}
                              className="px-3 py-1.5 bg-white rounded-lg text-xs font-semibold text-ink border border-cloud"
                            >
                              {metric}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      {isConnected ? (
                        <>
                          <Button variant="outline">
                            <RefreshCw className="w-5 h-5 mr-2" />
                            Sync Now
                          </Button>
                          <Button variant="outline">
                            View Data
                          </Button>
                          <Button variant="outline" className="text-pulse border-pulse/20 hover:bg-pulse/10">
                            <X className="w-5 h-5 mr-2" />
                            Disconnect
                          </Button>
                        </>
                      ) : (
                        <Button>
                          Connect
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Add New Integration Card */}
            <div className="neo-card p-12 w-full hover:scale-[1.01] transition-transform text-center border-dashed">
              <Link2 className="w-12 h-12 text-steel mx-auto mb-4" />
              <h4 className="mb-2">Add Another Integration</h4>
              <p className="text-steel mb-6 max-w-md mx-auto">
                Connect more data sources to get a complete picture of your health
              </p>
              <Button>Browse Available Integrations</Button>
            </div>
          </TabsContent>

          {/* Wearables Tab */}
          <TabsContent value="wearables" className="mt-8 space-y-6">
            {integrations
              .filter(i => i.category === 'Wearable' || i.category === 'Health Platforms')
              .map((integration) => {
                const Icon = integration.icon;
                const isConnected = integration.status === 'connected';
                const cardClass = isConnected ? `neo-card-${integration.color}` : 'neo-card';
                const gradientClass = `gradient-${integration.color}`;

                return (
                  <div key={integration.id} className={`${cardClass} p-8 hover:scale-[1.01] transition-transform`}>
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`w-16 h-16 rounded-2xl ${gradientClass} flex items-center justify-center flex-shrink-0`}>
                          <Icon className="w-8 h-8 text-void" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-3">
                            <h3>{integration.name}</h3>
                            {isConnected ? (
                              <Badge variant="success">
                                <Check className="w-3 h-3 mr-1" />
                                Connected
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Available</Badge>
                            )}
                          </div>
                          {isConnected && (
                            <p className="text-sm text-steel mb-4">
                              Last synced: {integration.lastSync}
                            </p>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {integration.metrics.map((metric) => (
                              <span
                                key={metric}
                                className="px-3 py-1.5 bg-white rounded-lg text-xs font-semibold text-ink border border-cloud"
                              >
                                {metric}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        {isConnected ? (
                          <>
                            <Button variant="outline">
                              <RefreshCw className="w-5 h-5 mr-2" />
                              Sync Now
                            </Button>
                            <Button variant="outline" className="text-pulse border-pulse/20 hover:bg-pulse/10">
                              <X className="w-5 h-5 mr-2" />
                              Disconnect
                            </Button>
                          </>
                        ) : (
                          <Button>Connect</Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
          </TabsContent>

          {/* Lab Testing Tab */}
          <TabsContent value="labs" className="mt-8 space-y-6">
            {integrations
              .filter(i => i.category === 'Lab Testing' || i.category === 'Epigenetic' || i.category === 'Microbiome')
              .map((integration) => {
                const Icon = integration.icon;
                const cardClass = `neo-card-${integration.color}`;
                const gradientClass = `gradient-${integration.color}`;

                return (
                  <div key={integration.id} className={`${cardClass} p-8 hover:scale-[1.01] transition-transform`}>
                    <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-6">
                      <div className="flex items-start gap-4 flex-1">
                        <div className={`w-16 h-16 rounded-2xl ${gradientClass} flex items-center justify-center flex-shrink-0`}>
                          <Icon className="w-8 h-8 text-void" />
                        </div>
                        <div className="flex-1">
                          <div className="flex flex-wrap items-center gap-3 mb-3">
                            <h3>{integration.name}</h3>
                            <Badge variant="success">
                              <Check className="w-3 h-3 mr-1" />
                              Connected
                            </Badge>
                            {integration.practitionerEdited && (
                              <Badge className="bg-electric text-void">
                                <Sparkles className="w-3 h-3 mr-1" />
                                Practitioner Managed
                              </Badge>
                            )}
                          </div>
                          <p className="text-ink mb-3">{integration.description}</p>
                          <p className="text-sm text-steel mb-4">
                            Last synced: {integration.lastSync}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {integration.metrics.map((metric) => (
                              <span
                                key={metric}
                                className="px-3 py-1.5 bg-white rounded-lg text-xs font-semibold text-ink border border-cloud"
                              >
                                {metric}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <Button variant="outline">
                          View Results
                        </Button>
                        <Button>
                          <Upload className="w-5 h-5 mr-2" />
                          Upload New
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}

            {/* Premium Testing Deep Dive */}
            <div className="neo-card-neural p-8 border-2 border-neural">
              <div className="flex items-start gap-4 mb-6">
                <div className="w-14 h-14 rounded-xl gradient-neural flex items-center justify-center flex-shrink-0">
                  <Dna className="w-7 h-7 text-void" />
                </div>
                <div>
                  <h3 className="mb-2">Premium Test Synergy</h3>
                  <div className="tag text-neural inline-block">Biohacking Intelligence</div>
                </div>
              </div>
              
              <p className="text-steel mb-6 leading-relaxed">
                <strong className="text-neural">TrueAge + Geneva GI Effects</strong> create the ultimate biohacking diagnostic combo. Our dual-engine AI (OpenBioLLM + Google Gemini) cross-references your epigenetic aging markers with gut health data to generate precision protocols.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                <div className="p-4 bg-neural/5 rounded-xl border border-neural/20">
                  <h4 className="text-sm mb-2 text-neural">Longitudinal Tracking</h4>
                  <p className="text-xs text-steel leading-relaxed">
                    Track how interventions affect your biological age and gut health over time. See correlations between gut inflammation and systemic aging.
                  </p>
                </div>
                <div className="p-4 bg-bio/5 rounded-xl border border-bio/20">
                  <h4 className="text-sm mb-2 text-bio">Personalized Stacks</h4>
                  <p className="text-xs text-steel leading-relaxed">
                    AI generates supplement recommendations based on your specific dysbiosis patterns and aging markers—no generic protocols.
                  </p>
                </div>
                <div className="p-4 bg-electric/5 rounded-xl border border-electric/20">
                  <h4 className="text-sm mb-2 text-electric">Early Detection</h4>
                  <p className="text-xs text-steel leading-relaxed">
                    Catch dysfunction signals years before symptoms appear. Methylation patterns reveal aging acceleration before biomarkers shift.
                  </p>
                </div>
                <div className="p-4 bg-pulse/5 rounded-xl border border-pulse/20">
                  <h4 className="text-sm mb-2 text-pulse">Root Cause Analysis</h4>
                  <p className="text-xs text-steel leading-relaxed">
                    Connect gut pathogens to systemic inflammation, mood issues, skin problems, and autoimmune-like symptoms with precision.
                  </p>
                </div>
              </div>

              <div className="p-6 bg-gradient-to-r from-neural/10 to-bio/10 rounded-xl border-2 border-dashed border-neural/30 mb-6">
                <h4 className="text-sm mb-3 flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-neural" />
                  Example Workflow
                </h4>
                <ol className="space-y-2 text-xs text-steel">
                  <li><strong>1.</strong> Upload TrueAge results → AI identifies accelerated organ-specific aging (e.g., immune age +5 years)</li>
                  <li><strong>2.</strong> Upload GI Effects → Reveals chronic gut inflammation and dysbiosis patterns</li>
                  <li><strong>3.</strong> Dual AI cross-checks → Links gut inflammation to accelerated immune aging</li>
                  <li><strong>4.</strong> Protocol generated → Targeted probiotics, anti-inflammatory diet, fasting strategies</li>
                  <li><strong>5.</strong> Re-test in 6 months → Track biological age reversal and gut healing</li>
                </ol>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button>
                  <Upload className="w-5 h-5 mr-2" />
                  Upload TrueAge Results
                </Button>
                <Button variant="outline">
                  <Upload className="w-5 h-5 mr-2" />
                  Upload GI Effects Results
                </Button>
              </div>
            </div>

            <div className="neo-card-electric p-8">
              <div className="flex items-start gap-4">
                <AlertCircle className="w-6 h-6 text-electric flex-shrink-0 mt-1" />
                <div className="flex-1">
                  <h4 className="mb-2">Manual Upload Available</h4>
                  <p className="text-steel mb-6">
                    Upload PDFs or CSV files of your lab results, or have your practitioner add custom biomarker panels.
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button>Upload Lab Results</Button>
                    <Button variant="outline">Request Practitioner Panel</Button>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* API Access Tab */}
          <TabsContent value="api" className="mt-8 space-y-6">
            <div className="neo-card p-8">
              <h3 className="mb-4">API Access</h3>
              <p className="text-steel mb-8">
                Connect BioHax to your own applications and services using our REST API. Available on Longevity Pro plan.
              </p>
              
              <div className="p-6 rounded-2xl bg-pearl border-2 border-cloud mb-8">
                <div className="flex items-center justify-between mb-4">
                  <h4>API Key</h4>
                  <Button variant="outline">Regenerate</Button>
                </div>
                <code className="block p-4 rounded-xl bg-white border-2 border-cloud font-mono text-sm text-ink">
                  bhx_sk_1234567890abcdef1234567890abcdef
                </code>
              </div>

              <div className="mb-8">
                <h4 className="mb-4">Available Endpoints</h4>
                <ul className="space-y-2 text-steel">
                  <li className="flex items-start gap-2">
                    <span className="text-electric">•</span>
                    <span>GET /api/v1/biomarkers - Retrieve biomarker data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-electric">•</span>
                    <span>GET /api/v1/protocols - Get active protocols</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-electric">•</span>
                    <span>POST /api/v1/data - Upload custom data</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-electric">•</span>
                    <span>GET /api/v1/insights - Fetch dual-engine AI insights (OpenBioLLM + Gemini)</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-electric">•</span>
                    <span>GET /api/v1/integrations - List connected integrations</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-electric">•</span>
                    <span>POST /api/v1/integrations/sync - Trigger manual sync</span>
                  </li>
                </ul>
              </div>

              <div className="flex gap-3">
                <Button>View API Documentation</Button>
                <Button variant="outline">API Playground</Button>
              </div>
            </div>

            <div className="neo-card-bio p-8">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl gradient-bio flex items-center justify-center flex-shrink-0">
                  <Shield className="w-6 h-6 text-void" />
                </div>
                <div>
                  <h4 className="mb-2">HIPAA Compliance</h4>
                  <p className="text-steel">
                    All API requests are encrypted and logged for HIPAA compliance. Your data is protected with 256-bit AES encryption.
                  </p>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
