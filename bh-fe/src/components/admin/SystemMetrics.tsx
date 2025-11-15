import { TrendingUp, Users, Activity, DollarSign, Zap } from 'lucide-react';
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
} from 'recharts';

export default function SystemMetrics() {
  const userGrowthData = [
    { month: 'May', users: 8234 },
    { month: 'Jun', users: 9156 },
    { month: 'Jul', users: 10289 },
    { month: 'Aug', users: 11456 },
    { month: 'Sep', users: 12103 },
    { month: 'Oct', users: 12589 },
    { month: 'Nov', users: 12847 },
  ];

  const revenueData = [
    { month: 'May', revenue: 164680 },
    { month: 'Jun', revenue: 183120 },
    { month: 'Jul', revenue: 205780 },
    { month: 'Aug', revenue: 229120 },
    { month: 'Sep', revenue: 242060 },
    { month: 'Oct', revenue: 251780 },
    { month: 'Nov', revenue: 256940 },
  ];

  const metrics = [
    { label: 'Total Users', value: '12,847', change: '+8.2%', icon: Users },
    { label: 'MRR', value: '$256,940', change: '+12.5%', icon: DollarSign },
    { label: 'Avg Session', value: '18.5 min', change: '+3.2%', icon: Activity },
    { label: 'API Calls/day', value: '2.4M', change: '-2.1%', icon: Zap },
  ];

  return (
    <div className="space-y-6">
      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metrics.map((metric, idx) => (
          <div key={idx} className="neo-card bg-white p-6">
            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <p className="tag text-steel">{metric.label}</p>
                <p className="text-3xl font-bold text-ink">{metric.value}</p>
                <p className="text-xs text-bio">{metric.change}</p>
              </div>
              <metric.icon className="w-8 h-8 text-electric" />
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <div className="neo-card bg-white p-6">
          <h3 className="mb-4">User Growth</h3>
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={userGrowthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cloud)" />
              <XAxis dataKey="month" stroke="var(--steel)" />
              <YAxis stroke="var(--steel)" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--pure)', 
                  border: '2px solid var(--cloud)',
                  borderRadius: '8px',
                }} 
              />
              <Line 
                type="monotone" 
                dataKey="users" 
                stroke="var(--electric)" 
                strokeWidth={3}
                dot={{ fill: 'var(--electric)', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Revenue Chart */}
        <div className="neo-card bg-white p-6">
          <h3 className="mb-4">Monthly Revenue</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={revenueData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--cloud)" />
              <XAxis dataKey="month" stroke="var(--steel)" />
              <YAxis stroke="var(--steel)" />
              <Tooltip 
                contentStyle={{ 
                  backgroundColor: 'var(--pure)', 
                  border: '2px solid var(--cloud)',
                  borderRadius: '8px',
                }} 
                formatter={(value: number) => `$${value.toLocaleString()}`}
              />
              <Bar dataKey="revenue" fill="var(--bio)" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Real-time Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="neo-card bg-white p-6 flex items-center gap-3">
          <Activity className="w-8 h-8 text-electric" />
          <div>
            <p className="tag text-steel">Active Now</p>
            <p className="text-2xl font-bold text-ink">2,341</p>
          </div>
        </div>
        <div className="neo-card bg-white p-6 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-bio" />
          <div>
            <p className="tag text-steel">Today's Signups</p>
            <p className="text-2xl font-bold text-ink">127</p>
          </div>
        </div>
        <div className="neo-card bg-white p-6 flex items-center gap-3">
          <Zap className="w-8 h-8 text-neural" />
          <div>
            <p className="tag text-steel">Avg Response Time</p>
            <p className="text-2xl font-bold text-ink">127ms</p>
          </div>
        </div>
      </div>
    </div>
  );
}
