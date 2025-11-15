import { useState } from 'react';
import { Brain, TrendingUp, DollarSign, Zap, AlertTriangle, CheckCircle } from 'lucide-react';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { 
  LineChart, 
  Line, 
  BarChart,
  Bar,
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';

export default function LlmUsageTracking() {
  const usageData = [
    { date: 'Nov 9', openBio: 12847, gemini: 8234 },
    { date: 'Nov 10', openBio: 14523, gemini: 9156 },
    { date: 'Nov 11', openBio: 13891, gemini: 8942 },
    { date: 'Nov 12', openBio: 15234, gemini: 9876 },
    { date: 'Nov 13', openBio: 16789, gemini: 10234 },
    { date: 'Nov 14', openBio: 15432, gemini: 9658 },
    { date: 'Nov 15', openBio: 17234, gemini: 10892 },
  ];

  const costData = [
    { date: 'Nov 9', openBio: 256.94, gemini: 164.68 },
    { date: 'Nov 10', openBio: 290.46, gemini: 183.12 },
    { date: 'Nov 11', openBio: 277.82, gemini: 178.84 },
    { date: 'Nov 12', openBio: 304.68, gemini: 197.52 },
    { date: 'Nov 13', openBio: 335.78, gemini: 204.68 },
    { date: 'Nov 14', openBio: 308.64, gemini: 193.16 },
    { date: 'Nov 15', openBio: 344.68, gemini: 217.84 },
  ];

  const featureUsage = [
    { name: 'Protocol Generation', value: 42.3, color: 'var(--electric)' },
    { name: 'Biomarker Analysis', value: 28.7, color: 'var(--bio)' },
    { name: 'Recommendations', value: 18.2, color: 'var(--neural)' },
    { name: 'Data Interpretation', value: 10.8, color: 'var(--pulse)' },
  ];

  const currentMonthStats = {
    openBio: {
      requests: 456789,
      tokens: 89234567,
      cost: 8942.34,
      avgLatency: 120,
      successRate: 99.87,
    },
    gemini: {
      requests: 298456,
      tokens: 52847931,
      cost: 5284.79,
      avgLatency: 340,
      successRate: 99.52,
    },
  };

  const totalCost = currentMonthStats.openBio.cost + currentMonthStats.gemini.cost;
  const totalRequests = currentMonthStats.openBio.requests + currentMonthStats.gemini.requests;

  return (
    <div className="space-y-6">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
              <Brain className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Total Requests</p>
              <p className="text-2xl font-bold text-ink">{(totalRequests / 1000).toFixed(0)}K</p>
              <p className="text-xs text-bio">This month</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bio flex items-center justify-center shadow-lg">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Total Cost</p>
              <p className="text-2xl font-bold text-ink">${totalCost.toLocaleString()}</p>
              <p className="text-xs text-bio">+8.2% vs last month</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-neural flex items-center justify-center shadow-lg">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Avg Latency</p>
              <p className="text-2xl font-bold text-ink">230ms</p>
              <p className="text-xs text-bio">Combined average</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-pulse flex items-center justify-center shadow-lg">
              <TrendingUp className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Success Rate</p>
              <p className="text-2xl font-bold text-ink">99.7%</p>
              <p className="text-xs text-bio">Combined rate</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="usage" className="space-y-6">
        <TabsList className="neo-card bg-white p-2">
          <TabsTrigger value="usage">Usage Metrics</TabsTrigger>
          <TabsTrigger value="cost">Cost Analysis</TabsTrigger>
          <TabsTrigger value="performance">Performance</TabsTrigger>
          <TabsTrigger value="features">Feature Usage</TabsTrigger>
        </TabsList>

        {/* Usage Metrics */}
        <TabsContent value="usage" className="space-y-6">
          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Daily AI Engine Requests (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={usageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cloud)" />
                <XAxis dataKey="date" stroke="var(--steel)" />
                <YAxis stroke="var(--steel)" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--pure)', 
                    border: '2px solid var(--cloud)',
                    borderRadius: '8px',
                  }} 
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="openBio" 
                  stroke="var(--electric)" 
                  strokeWidth={3}
                  name="OpenBioLLM"
                  dot={{ fill: 'var(--electric)', r: 4 }}
                />
                <Line 
                  type="monotone" 
                  dataKey="gemini" 
                  stroke="var(--bio)" 
                  strokeWidth={3}
                  name="Google Gemini"
                  dot={{ fill: 'var(--bio)', r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* OpenBioLLM Stats */}
            <div className="neo-card bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3>OpenBioLLM</h3>
                  <p className="text-sm text-steel">Primary AI Engine</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-steel">Requests</span>
                    <span className="text-sm font-bold text-ink">
                      {currentMonthStats.openBio.requests.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={61} className="h-2" />
                  <p className="text-xs text-steel mt-1">61% of total requests</p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-cloud">
                  <div>
                    <p className="text-xs text-steel">Tokens Used</p>
                    <p className="font-bold text-ink">
                      {(currentMonthStats.openBio.tokens / 1000000).toFixed(1)}M
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Avg Latency</p>
                    <p className="font-bold text-ink">{currentMonthStats.openBio.avgLatency}ms</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Success Rate</p>
                    <p className="font-bold text-bio">{currentMonthStats.openBio.successRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Cost</p>
                    <p className="font-bold text-ink">${currentMonthStats.openBio.cost.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Google Gemini Stats */}
            <div className="neo-card bg-white p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl gradient-bio flex items-center justify-center shadow-lg">
                  <Brain className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h3>Google Gemini</h3>
                  <p className="text-sm text-steel">Secondary AI Engine</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-steel">Requests</span>
                    <span className="text-sm font-bold text-ink">
                      {currentMonthStats.gemini.requests.toLocaleString()}
                    </span>
                  </div>
                  <Progress value={39} className="h-2" />
                  <p className="text-xs text-steel mt-1">39% of total requests</p>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-3 border-t border-cloud">
                  <div>
                    <p className="text-xs text-steel">Tokens Used</p>
                    <p className="font-bold text-ink">
                      {(currentMonthStats.gemini.tokens / 1000000).toFixed(1)}M
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Avg Latency</p>
                    <p className="font-bold text-ink">{currentMonthStats.gemini.avgLatency}ms</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Success Rate</p>
                    <p className="font-bold text-bio">{currentMonthStats.gemini.successRate}%</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Cost</p>
                    <p className="font-bold text-ink">${currentMonthStats.gemini.cost.toLocaleString()}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Cost Analysis */}
        <TabsContent value="cost" className="space-y-6">
          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Daily Cost Breakdown (Last 7 Days)</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={costData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--cloud)" />
                <XAxis dataKey="date" stroke="var(--steel)" />
                <YAxis stroke="var(--steel)" />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'var(--pure)', 
                    border: '2px solid var(--cloud)',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number) => `$${value.toFixed(2)}`}
                />
                <Legend />
                <Bar dataKey="openBio" fill="var(--electric)" name="OpenBioLLM" radius={[8, 8, 0, 0]} />
                <Bar dataKey="gemini" fill="var(--bio)" name="Google Gemini" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="neo-card bg-white p-6">
              <p className="tag text-steel mb-2">Current Month</p>
              <p className="text-3xl font-bold text-ink">${totalCost.toLocaleString()}</p>
              <p className="text-sm text-bio mt-1">+8.2% vs last month</p>
            </div>
            <div className="neo-card bg-white p-6">
              <p className="tag text-steel mb-2">Projected This Month</p>
              <p className="text-3xl font-bold text-ink">${(totalCost * 2.1).toLocaleString()}</p>
              <p className="text-sm text-steel mt-1">Based on current rate</p>
            </div>
            <div className="neo-card bg-white p-6">
              <p className="tag text-steel mb-2">Cost per Request</p>
              <p className="text-3xl font-bold text-ink">${(totalCost / totalRequests).toFixed(4)}</p>
              <p className="text-sm text-steel mt-1">Average across engines</p>
            </div>
          </div>

          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Budget Alerts</h3>
            <div className="space-y-3">
              <div className="neo-card bg-pearl p-4 flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-bio mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-ink">Within Budget</p>
                  <p className="text-sm text-steel mt-1">
                    Current spending is 68% of monthly budget ($20,000)
                  </p>
                  <Progress value={68} className="h-2 mt-2" />
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Performance */}
        <TabsContent value="performance" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">Response Time Comparison</h3>
              <div className="space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-electric"></div>
                      <span className="text-sm text-ink">OpenBioLLM</span>
                    </div>
                    <span className="text-sm font-bold text-ink">{currentMonthStats.openBio.avgLatency}ms</span>
                  </div>
                  <Progress value={30} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded bg-bio"></div>
                      <span className="text-sm text-ink">Google Gemini</span>
                    </div>
                    <span className="text-sm font-bold text-ink">{currentMonthStats.gemini.avgLatency}ms</span>
                  </div>
                  <Progress value={85} className="h-2" />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-cloud">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-4 h-4 text-bio" />
                  <p className="text-sm font-medium text-ink">OpenBioLLM is 2.8x faster</p>
                </div>
                <p className="text-xs text-steel">
                  Consider routing time-sensitive operations to OpenBioLLM
                </p>
              </div>
            </div>

            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">Error Rates</h3>
              <div className="space-y-4">
                <div className="neo-card bg-pearl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-ink">OpenBioLLM</span>
                    <Badge className="bg-bio/20 text-bio">{currentMonthStats.openBio.successRate}%</Badge>
                  </div>
                  <p className="text-xs text-steel">
                    {(currentMonthStats.openBio.requests * (1 - currentMonthStats.openBio.successRate / 100)).toFixed(0)} failed requests
                  </p>
                </div>

                <div className="neo-card bg-pearl p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-ink">Google Gemini</span>
                    <Badge className="bg-bio/20 text-bio">{currentMonthStats.gemini.successRate}%</Badge>
                  </div>
                  <p className="text-xs text-steel">
                    {(currentMonthStats.gemini.requests * (1 - currentMonthStats.gemini.successRate / 100)).toFixed(0)} failed requests
                  </p>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-cloud">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-bio" />
                  <p className="text-sm font-medium text-ink">Both engines performing well</p>
                </div>
              </div>
            </div>
          </div>

          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Performance Recommendations</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="neo-card bg-pearl p-4">
                <div className="flex items-start gap-3">
                  <Zap className="w-5 h-5 text-electric mt-0.5" />
                  <div>
                    <p className="font-medium text-ink mb-1">Optimize Routing</p>
                    <p className="text-sm text-steel">
                      Route real-time queries to OpenBioLLM for faster responses
                    </p>
                  </div>
                </div>
              </div>

              <div className="neo-card bg-pearl p-4">
                <div className="flex items-start gap-3">
                  <DollarSign className="w-5 h-5 text-bio mt-0.5" />
                  <div>
                    <p className="font-medium text-ink mb-1">Cache Frequent Queries</p>
                    <p className="text-sm text-steel">
                      Implement caching to reduce redundant AI requests by ~30%
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Feature Usage */}
        <TabsContent value="features" className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">AI Usage by Feature</h3>
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={featureUsage}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, value }) => `${name}: ${value}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {featureUsage.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="neo-card bg-white p-6">
              <h3 className="mb-4">Top Features</h3>
              <div className="space-y-3">
                {featureUsage.map((feature, idx) => (
                  <div key={idx} className="neo-card bg-pearl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm text-ink">{feature.name}</span>
                      <span className="text-sm font-bold text-ink">{feature.value}%</span>
                    </div>
                    <Progress value={feature.value} className="h-2" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
