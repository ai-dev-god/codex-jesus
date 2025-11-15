import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { Search, UserPlus, Download, FileText, TrendingUp, AlertCircle, Plus, Activity, Heart, Zap, Droplet, Flame, Brain, Shield, Sparkles } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Checkbox } from '../ui/checkbox';

const clients = [
  {
    id: '1',
    name: 'Sarah Chen',
    initials: 'SC',
    age: 34,
    longevityScore: 88,
    lastSync: '2 hours ago',
    alerts: 1,
    adherence: 92,
    status: 'optimal',
    statusLabel: 'Optimal',
  },
  {
    id: '2',
    name: 'Michael Torres',
    initials: 'MT',
    age: 42,
    longevityScore: 76,
    lastSync: '1 day ago',
    alerts: 3,
    adherence: 78,
    status: 'good',
    statusLabel: 'Good',
  },
  {
    id: '3',
    name: 'Emma Wilson',
    initials: 'EW',
    age: 29,
    longevityScore: 91,
    lastSync: '5 hours ago',
    alerts: 0,
    adherence: 95,
    status: 'optimal',
    statusLabel: 'Optimal',
  },
  {
    id: '4',
    name: 'David Park',
    initials: 'DP',
    age: 51,
    longevityScore: 72,
    lastSync: '3 days ago',
    alerts: 2,
    adherence: 65,
    status: 'warning',
    statusLabel: 'Needs Attention',
  },
];

const templates = [
  {
    id: '1',
    name: 'Executive Performance Protocol',
    description: 'Comprehensive protocol for high-performing professionals',
    uses: 23,
    color: 'electric',
  },
  {
    id: '2',
    name: 'Athletic Recovery Optimization',
    description: 'Advanced recovery and performance enhancement',
    uses: 18,
    color: 'bio',
  },
  {
    id: '3',
    name: 'Metabolic Health Foundation',
    description: 'Core metabolic health optimization protocol',
    uses: 31,
    color: 'neural',
  },
];

const biomarkerCategories = [
  { id: 'metabolic', name: 'Metabolic Health', color: 'electric', icon: Zap },
  { id: 'cardiovascular', name: 'Cardiovascular', color: 'pulse', icon: Heart },
  { id: 'hormones', name: 'Hormones', color: 'neural', icon: Brain },
  { id: 'inflammation', name: 'Inflammation', color: 'pulse', icon: Flame },
  { id: 'nutrients', name: 'Nutrients & Vitamins', color: 'solar', icon: Droplet },
  { id: 'liver', name: 'Liver Function', color: 'bio', icon: Shield },
  { id: 'kidney', name: 'Kidney Function', color: 'electric', icon: Activity },
  { id: 'thyroid', name: 'Thyroid', color: 'neural', icon: Sparkles },
];

const standardBiomarkers = [
  { id: 'glucose', name: 'Fasting Glucose', category: 'metabolic', unit: 'mg/dL', common: true },
  { id: 'hba1c', name: 'HbA1c', category: 'metabolic', unit: '%', common: true },
  { id: 'insulin', name: 'Fasting Insulin', category: 'metabolic', unit: 'μIU/mL', common: true },
  { id: 'cholesterol', name: 'Total Cholesterol', category: 'cardiovascular', unit: 'mg/dL', common: true },
  { id: 'ldl', name: 'LDL Cholesterol', category: 'cardiovascular', unit: 'mg/dL', common: true },
  { id: 'hdl', name: 'HDL Cholesterol', category: 'cardiovascular', unit: 'mg/dL', common: true },
  { id: 'triglycerides', name: 'Triglycerides', category: 'cardiovascular', unit: 'mg/dL', common: true },
  { id: 'crp', name: 'C-Reactive Protein', category: 'inflammation', unit: 'mg/L', common: true },
  { id: 'testosterone', name: 'Testosterone', category: 'hormones', unit: 'ng/dL', common: true },
  { id: 'cortisol', name: 'Cortisol', category: 'hormones', unit: 'μg/dL', common: true },
  { id: 'vitamin-d', name: 'Vitamin D (25-OH)', category: 'nutrients', unit: 'ng/mL', common: true },
  { id: 'b12', name: 'Vitamin B12', category: 'nutrients', unit: 'pg/mL', common: true },
  { id: 'tsh', name: 'TSH', category: 'thyroid', unit: 'μIU/mL', common: true },
  { id: 't3', name: 'Free T3', category: 'thyroid', unit: 'pg/mL', common: false },
  { id: 't4', name: 'Free T4', category: 'thyroid', unit: 'ng/dL', common: false },
  { id: 'alt', name: 'ALT', category: 'liver', unit: 'U/L', common: true },
  { id: 'ast', name: 'AST', category: 'liver', unit: 'U/L', common: true },
  { id: 'creatinine', name: 'Creatinine', category: 'kidney', unit: 'mg/dL', common: true },
  { id: 'bun', name: 'BUN', category: 'kidney', unit: 'mg/dL', common: true },
  { id: 'homocysteine', name: 'Homocysteine', category: 'cardiovascular', unit: 'μmol/L', common: false },
  { id: 'apob', name: 'ApoB', category: 'cardiovascular', unit: 'mg/dL', common: false },
  { id: 'ferritin', name: 'Ferritin', category: 'nutrients', unit: 'ng/mL', common: true },
  { id: 'magnesium', name: 'Magnesium', category: 'nutrients', unit: 'mg/dL', common: true },
];

export default function PractitionerWorkspace() {
  const [isAddingBiomarker, setIsAddingBiomarker] = useState(false);
  const [selectedClient, setSelectedClient] = useState<string | null>(null);
  const [selectedBiomarkers, setSelectedBiomarkers] = useState<string[]>([
    'glucose', 'hba1c', 'cholesterol', 'ldl', 'hdl', 'crp', 'testosterone', 'vitamin-d', 'tsh', 'alt', 'creatinine'
  ]);
  const [clientPlan, setClientPlan] = useState('biohacker');

  const maxBiomarkers = clientPlan === 'explorer' ? 50 : 150;
  const currentBiomarkerCount = selectedBiomarkers.length;

  const toggleBiomarker = (biomarkerId: string) => {
    if (selectedBiomarkers.includes(biomarkerId)) {
      setSelectedBiomarkers(selectedBiomarkers.filter(id => id !== biomarkerId));
    } else {
      if (currentBiomarkerCount < maxBiomarkers) {
        setSelectedBiomarkers([...selectedBiomarkers, biomarkerId]);
      }
    }
  };

  const getStatusConfig = (status: string) => {
    const configs: Record<string, { class: string; color: string }> = {
      optimal: { class: 'status-optimal', color: 'bio' },
      good: { class: 'status-good', color: 'electric' },
      warning: { class: 'status-warning', color: 'solar' },
      critical: { class: 'status-critical', color: 'pulse' },
    };
    return configs[status] || configs.good;
  };

  return (
    <div className="min-h-screen mesh-gradient pt-28 pb-20 px-6">
      <div className="max-w-7xl mx-auto space-y-12">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="tag text-steel mb-3">PRACTITIONER WORKSPACE</div>
            <h2 className="mb-4">Manage your clients</h2>
            <p className="text-xl text-steel max-w-2xl">
              Collaborate on health journeys, customize biomarker panels, and track cohort performance
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline">
              <Download className="w-5 h-5 mr-2" />
              Export Reports
            </Button>
            <Button size="lg">
              <UserPlus className="w-5 h-5 mr-2" />
              Add Client
            </Button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="neo-card-electric p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-electric flex items-center justify-center">
                <UserPlus className="w-6 h-6 text-void" />
              </div>
              <div>
                <div className="tag text-steel mb-1">TOTAL CLIENTS</div>
                <div className="text-4xl font-bold text-ink">24</div>
              </div>
            </div>
            <p className="text-sm text-bio font-semibold">+3 this month</p>
          </div>

          <div className="neo-card-bio p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-bio flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-void" />
              </div>
              <div>
                <div className="tag text-steel mb-1">AVG. ADHERENCE</div>
                <div className="text-4xl font-bold text-ink">84%</div>
              </div>
            </div>
            <p className="text-sm text-bio font-semibold">+5% vs last month</p>
          </div>

          <div className="neo-card-neural p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-neural flex items-center justify-center">
                <FileText className="w-6 h-6 text-void" />
              </div>
              <div>
                <div className="tag text-steel mb-1">ACTIVE PROTOCOLS</div>
                <div className="text-4xl font-bold text-ink">47</div>
              </div>
            </div>
            <p className="text-sm text-steel">Across all clients</p>
          </div>

          <div className="neo-card-pulse p-8">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-xl gradient-pulse flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-void" />
              </div>
              <div>
                <div className="tag text-steel mb-1">PENDING ACTIONS</div>
                <div className="text-4xl font-bold text-ink">6</div>
              </div>
            </div>
            <p className="text-sm text-pulse font-semibold">Needs attention</p>
          </div>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="clients" className="w-full">
          <TabsList>
            <TabsTrigger value="clients">Clients</TabsTrigger>
            <TabsTrigger value="biomarkers">Biomarker Panels</TabsTrigger>
            <TabsTrigger value="templates">Protocol Templates</TabsTrigger>
            <TabsTrigger value="cohort">Cohort Analysis</TabsTrigger>
          </TabsList>

          {/* Clients Tab */}
          <TabsContent value="clients" className="mt-8 space-y-6">
            <div className="neo-card p-8">
              <div className="mb-6">
                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-steel" />
                  <Input
                    placeholder="Search clients..."
                    className="pl-12 h-14"
                  />
                </div>
              </div>

              <div className="space-y-4">
                {clients.map((client) => {
                  const statusConfig = getStatusConfig(client.status);

                  return (
                    <div key={client.id} className="neo-card p-8 hover:scale-[1.01] transition-transform">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
                        <div className="flex items-center gap-4">
                          <div className="w-16 h-16 rounded-full gradient-electric flex items-center justify-center flex-shrink-0">
                            <span className="text-2xl font-bold text-void">{client.initials}</span>
                          </div>
                          <div>
                            <h3 className="mb-2">{client.name}</h3>
                            <div className="flex items-center gap-3">
                              <div className={statusConfig.class} />
                              <span className={`text-sm font-semibold text-${statusConfig.color}`}>
                                {client.statusLabel}
                              </span>
                              <span className="text-sm text-steel">• Age {client.age}</span>
                              <span className="text-sm text-steel">• {client.lastSync}</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-8">
                          <div className="text-center">
                            <div className="tag text-steel mb-2">LONGEVITY SCORE</div>
                            <div className="text-3xl font-bold gradient-text-electric">{client.longevityScore}</div>
                          </div>

                          <div className="text-center">
                            <div className="tag text-steel mb-2">ADHERENCE</div>
                            <div className="flex items-center gap-2">
                              <div className="w-24 bg-pearl rounded-full h-2 overflow-hidden">
                                <div 
                                  className="gradient-bio h-2 transition-all" 
                                  style={{ width: `${client.adherence}%` }}
                                />
                              </div>
                              <span className="text-sm font-bold text-ink">{client.adherence}%</span>
                            </div>
                          </div>

                          {client.alerts > 0 && (
                            <Badge variant="destructive" className="text-sm">
                              {client.alerts} Alert{client.alerts > 1 ? 's' : ''}
                            </Badge>
                          )}

                          <Button>View Details</Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* Biomarker Panels Tab */}
          <TabsContent value="biomarkers" className="mt-8 space-y-8">
            {/* Panel Header */}
            <div className="neo-card-neural p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                <div>
                  <h3 className="mb-3">Biomarker Panel Management</h3>
                  <p className="text-steel">
                    Customize biomarker panels for your clients based on their subscription tier
                  </p>
                </div>
                <Button>
                  <Plus className="w-5 h-5 mr-2" />
                  Add Custom Biomarker
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <Label htmlFor="client-select" className="mb-3 block font-semibold">Select Client</Label>
                  <Select value={selectedClient || ''} onValueChange={setSelectedClient}>
                    <SelectTrigger id="client-select" className="h-12">
                      <SelectValue placeholder="Choose a client to manage biomarkers" />
                    </SelectTrigger>
                    <SelectContent>
                      {clients.map((client) => (
                        <SelectItem key={client.id} value={client.id}>
                          {client.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-end gap-3">
                  <Badge variant="default" className="bg-neural text-white px-4 py-2">
                    {clientPlan === 'explorer' ? 'Explorer Plan' : 'Biohacker Plan'}
                  </Badge>
                  <Badge 
                    variant={currentBiomarkerCount >= maxBiomarkers * 0.9 ? 'warning' : 'success'}
                    className="px-4 py-2"
                  >
                    {currentBiomarkerCount}/{maxBiomarkers} Biomarkers
                  </Badge>
                </div>
              </div>

              {currentBiomarkerCount >= maxBiomarkers && (
                <div className="mt-6 p-6 rounded-2xl bg-solar/10 border-2 border-solar/20">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-6 h-6 text-solar flex-shrink-0 mt-1" />
                    <div>
                      <h4 className="mb-2">Biomarker Limit Reached</h4>
                      <p className="text-steel">
                        This client has reached the maximum of {maxBiomarkers} biomarkers for their plan.
                        {clientPlan === 'explorer' && ' Upgrade to Biohacker plan for up to 150 biomarkers.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Biomarker Categories */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {biomarkerCategories.map((category) => {
                const categoryBiomarkers = standardBiomarkers.filter(b => b.category === category.id);
                const selectedInCategory = categoryBiomarkers.filter(b => selectedBiomarkers.includes(b.id)).length;
                const Icon = category.icon;
                const cardClass = `neo-card-${category.color}`;
                const gradientClass = `gradient-${category.color}`;

                return (
                  <div key={category.id} className={`${cardClass} p-8`}>
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-xl ${gradientClass} flex items-center justify-center`}>
                          <Icon className="w-6 h-6 text-void" />
                        </div>
                        <div>
                          <h4 className="mb-1">{category.name}</h4>
                          <span className="text-sm text-steel">
                            {selectedInCategory} of {categoryBiomarkers.length} selected
                          </span>
                        </div>
                      </div>
                      <Button variant="outline" size="sm">
                        Select All
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {categoryBiomarkers.slice(0, 5).map((biomarker) => {
                        const isSelected = selectedBiomarkers.includes(biomarker.id);
                        const canSelect = currentBiomarkerCount < maxBiomarkers || isSelected;

                        return (
                          <div
                            key={biomarker.id}
                            className={`flex items-center justify-between p-4 rounded-xl transition-all ${
                              isSelected 
                                ? 'bg-white border-2 border-bio' 
                                : canSelect
                                ? 'bg-white/50 border-2 border-cloud hover:border-electric'
                                : 'bg-pearl/50 border-2 border-cloud opacity-50'
                            }`}
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleBiomarker(biomarker.id)}
                                disabled={!canSelect}
                              />
                              <div>
                                <div className="font-semibold text-ink">{biomarker.name}</div>
                                <div className="text-xs text-steel">{biomarker.unit}</div>
                              </div>
                            </div>
                            {biomarker.common && (
                              <Badge variant="secondary" className="text-xs">Common</Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Save Panel */}
            <div className="neo-card-electric p-8">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                  <h4 className="mb-2">Biomarker Panel Configuration</h4>
                  <p className="text-steel">
                    {currentBiomarkerCount} biomarkers selected • {maxBiomarkers - currentBiomarkerCount} remaining
                  </p>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline">Reset to Default</Button>
                  <Button>Save Panel</Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Protocol Templates Tab */}
          <TabsContent value="templates" className="mt-8 space-y-6">
            {templates.map((template) => {
              const cardClass = `neo-card-${template.color}`;
              const gradientClass = `gradient-${template.color}`;

              return (
                <div key={template.id} className={`${cardClass} p-8 hover:scale-[1.01] transition-transform`}>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                    <div className="flex items-center gap-4 flex-1">
                      <div className={`w-14 h-14 rounded-xl ${gradientClass} flex items-center justify-center flex-shrink-0`}>
                        <FileText className="w-7 h-7 text-void" />
                      </div>
                      <div>
                        <div className="flex items-center gap-3 mb-2">
                          <h3>{template.name}</h3>
                          <Badge variant="secondary">{template.uses} uses</Badge>
                        </div>
                        <p className="text-steel">{template.description}</p>
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline">Edit Template</Button>
                      <Button>Apply to Client</Button>
                    </div>
                  </div>
                </div>
              );
            })}
            
            <div className="neo-card p-12 w-full hover:scale-[1.01] transition-transform text-center cursor-pointer">
              <Plus className="w-12 h-12 mx-auto mb-4 text-steel" />
              <h4 className="mb-2">Create New Template</h4>
              <p className="text-steel">Build custom protocol templates for your practice</p>
            </div>
          </TabsContent>

          {/* Cohort Analysis Tab */}
          <TabsContent value="cohort" className="mt-8">
            <div className="neo-card p-12">
              <h3 className="mb-8 text-center">Cohort Performance Overview</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="neo-card-electric p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl gradient-electric mx-auto mb-4 flex items-center justify-center">
                    <TrendingUp className="w-8 h-8 text-void" />
                  </div>
                  <div className="tag text-steel mb-2">AVG. LONGEVITY SCORE</div>
                  <div className="text-5xl font-bold gradient-text-electric mb-2">82.5</div>
                  <p className="text-sm text-bio font-semibold">+3.2 vs last quarter</p>
                </div>

                <div className="neo-card-bio p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl gradient-bio mx-auto mb-4 flex items-center justify-center">
                    <Activity className="w-8 h-8 text-void" />
                  </div>
                  <div className="tag text-steel mb-2">AVG. ADHERENCE</div>
                  <div className="text-5xl font-bold gradient-text-bio mb-2">84%</div>
                  <p className="text-sm text-bio font-semibold">+5% vs last month</p>
                </div>

                <div className="neo-card-neural p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl gradient-neural mx-auto mb-4 flex items-center justify-center">
                    <Sparkles className="w-8 h-8 text-void" />
                  </div>
                  <div className="tag text-steel mb-2">AVG. IMPROVEMENT</div>
                  <div className="text-5xl font-bold gradient-text-neural mb-2">+7.2</div>
                  <p className="text-sm text-neural font-semibold">Score increase</p>
                </div>
              </div>

              <div className="text-center">
                <p className="text-steel mb-6">
                  Detailed cohort analysis and comparison tools coming soon
                </p>
                <Button size="lg" variant="outline">
                  Request Early Access
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
