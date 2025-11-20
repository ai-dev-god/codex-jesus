import { useEffect, useState } from 'react';
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
import { toast } from 'sonner';
import { useAuth } from '../../lib/auth/AuthContext';
import { fetchSystemMetrics, type SystemMetrics } from '../../lib/api/admin';

export default function SystemMetrics() {
  const { ensureAccessToken } = useAuth();
  const [data, setData] = useState<SystemMetrics | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      try {
        const token = await ensureAccessToken();
        const result = await fetchSystemMetrics(token);
        setData(result);
      } catch (error) {
        toast.error('Failed to load system metrics');
      } finally {
        setLoading(false);
      }
    };
    void loadData();
  }, [ensureAccessToken]);

  if (loading || !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <div key={i} className="neo-card bg-white p-6 h-32" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="neo-card bg-white p-6 h-80" />
          <div className="neo-card bg-white p-6 h-80" />
        </div>
      </div>
    );
  }

  const metrics = data.keyMetrics.map(m => ({
    ...m,
    icon: m.label.includes('User') ? Users : m.label.includes('MRR') ? DollarSign : m.label.includes('Session') ? Activity : Zap
  }));

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
            <LineChart data={data.userGrowth}>
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
          <h3 className="mb-4">Est. Monthly Revenue</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={data.revenue}>
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
            <p className="text-2xl font-bold text-ink">{data.realtime.activeNow.toLocaleString()}</p>
          </div>
        </div>
        <div className="neo-card bg-white p-6 flex items-center gap-3">
          <TrendingUp className="w-8 h-8 text-bio" />
          <div>
            <p className="tag text-steel">Today's Signups</p>
            <p className="text-2xl font-bold text-ink">{data.realtime.todaySignups.toLocaleString()}</p>
          </div>
        </div>
        <div className="neo-card bg-white p-6 flex items-center gap-3">
          <Zap className="w-8 h-8 text-neural" />
          <div>
            <p className="tag text-steel">Avg Response Time</p>
            <p className="text-2xl font-bold text-ink">{data.realtime.avgResponseTime}ms</p>
          </div>
        </div>
      </div>
    </div>
  );
}
