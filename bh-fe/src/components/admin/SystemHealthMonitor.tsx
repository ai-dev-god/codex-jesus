import { useState } from 'react';
import { 
  Activity, 
  Server, 
  Database, 
  Zap, 
  CheckCircle, 
  AlertTriangle,
  RefreshCw,
  Cpu,
  HardDrive,
  Wifi
} from 'lucide-react';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'down';
  responseTime: number;
  uptime: number;
  icon: any;
}

export default function SystemHealthMonitor() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const [services] = useState<ServiceHealth[]>([
    {
      name: 'API Gateway',
      status: 'healthy',
      responseTime: 45,
      uptime: 99.98,
      icon: Server,
    },
    {
      name: 'Database Primary',
      status: 'healthy',
      responseTime: 12,
      uptime: 99.99,
      icon: Database,
    },
    {
      name: 'Cache Layer (Redis)',
      status: 'healthy',
      responseTime: 2,
      uptime: 99.99,
      icon: Zap,
    },
    {
      name: 'AI Engine - OpenBioLLM',
      status: 'healthy',
      responseTime: 120,
      uptime: 99.85,
      icon: Activity,
    },
    {
      name: 'AI Engine - Google Gemini',
      status: 'degraded',
      responseTime: 350,
      uptime: 99.50,
      icon: Activity,
    },
    {
      name: 'File Storage (S3)',
      status: 'healthy',
      responseTime: 89,
      uptime: 99.99,
      icon: HardDrive,
    },
  ]);

  const systemMetrics = {
    cpu: 42,
    memory: 68,
    disk: 54,
    network: 28,
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success('Health checks completed');
    }, 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'healthy':
        return <Badge className="bg-bio/20 text-bio"><CheckCircle className="w-3 h-3 mr-1" />Healthy</Badge>;
      case 'degraded':
        return <Badge className="bg-solar/20 text-solar"><AlertTriangle className="w-3 h-3 mr-1" />Degraded</Badge>;
      case 'down':
        return <Badge className="bg-pulse/20 text-pulse"><AlertTriangle className="w-3 h-3 mr-1" />Down</Badge>;
    }
  };

  const healthyCount = services.filter(s => s.status === 'healthy').length;
  const overallHealth = (healthyCount / services.length) * 100;

  return (
    <div className="space-y-6">
      {/* Overall Health Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="neo-card bg-white p-6">
          <div className="flex items-center justify-between mb-4">
            <h3>Overall System Health</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          
          <div className="space-y-4">
            <div className="text-center py-6">
              <div className="text-5xl font-bold text-ink mb-2">
                {overallHealth.toFixed(1)}%
              </div>
              <p className="text-steel">System Operational</p>
            </div>

            <div className="grid grid-cols-3 gap-4 pt-4 border-t border-cloud">
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl gradient-bio flex items-center justify-center shadow-lg">
                  <CheckCircle className="w-6 h-6 text-white" />
                </div>
                <p className="text-2xl font-bold text-ink">{healthyCount}</p>
                <p className="text-xs text-bio">Healthy</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl gradient-solar flex items-center justify-center shadow-lg">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <p className="text-2xl font-bold text-ink">1</p>
                <p className="text-xs text-solar">Degraded</p>
              </div>
              <div className="text-center">
                <div className="w-12 h-12 mx-auto mb-2 rounded-xl gradient-pulse flex items-center justify-center shadow-lg">
                  <AlertTriangle className="w-6 h-6 text-white" />
                </div>
                <p className="text-2xl font-bold text-ink">0</p>
                <p className="text-xs text-pulse">Down</p>
              </div>
            </div>
          </div>
        </div>

        {/* System Resources */}
        <div className="neo-card bg-white p-6">
          <h3 className="mb-4">System Resources</h3>
          
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-electric" />
                  <span className="text-sm text-ink">CPU Usage</span>
                </div>
                <span className="text-sm font-bold text-ink">{systemMetrics.cpu}%</span>
              </div>
              <Progress value={systemMetrics.cpu} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-bio" />
                  <span className="text-sm text-ink">Memory Usage</span>
                </div>
                <span className="text-sm font-bold text-ink">{systemMetrics.memory}%</span>
              </div>
              <Progress value={systemMetrics.memory} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-neural" />
                  <span className="text-sm text-ink">Disk Usage</span>
                </div>
                <span className="text-sm font-bold text-ink">{systemMetrics.disk}%</span>
              </div>
              <Progress value={systemMetrics.disk} className="h-2" />
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Wifi className="w-4 h-4 text-pulse" />
                  <span className="text-sm text-ink">Network Usage</span>
                </div>
                <span className="text-sm font-bold text-ink">{systemMetrics.network}%</span>
              </div>
              <Progress value={systemMetrics.network} className="h-2" />
            </div>
          </div>
        </div>
      </div>

      {/* Service Status Details */}
      <div className="neo-card bg-white p-6">
        <h3 className="mb-4">Service Status</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {services.map((service, idx) => (
            <div
              key={idx}
              className="neo-card bg-pearl p-4"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
                    service.status === 'healthy' ? 'gradient-bio' :
                    service.status === 'degraded' ? 'gradient-solar' :
                    'gradient-pulse'
                  }`}>
                    <service.icon className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h4 className="font-medium text-ink">{service.name}</h4>
                  </div>
                </div>
                {getStatusBadge(service.status)}
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-steel">Response Time</p>
                  <p className="font-bold text-ink">{service.responseTime}ms</p>
                </div>
                <div>
                  <p className="text-steel">Uptime</p>
                  <p className="font-bold text-ink">{service.uptime}%</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Incident History */}
      <div className="neo-card bg-white p-6">
        <h3 className="mb-4">Recent Incidents</h3>
        
        <div className="space-y-3">
          <div className="neo-card bg-pearl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-solar mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-ink">High API latency detected</p>
              <p className="text-sm text-steel mt-1">Google Gemini AI Engine - 2 hours ago</p>
              <p className="text-sm text-steel mt-2">Response times increased to 350ms. Monitoring situation.</p>
            </div>
            <Badge className="bg-solar/20 text-solar">Investigating</Badge>
          </div>

          <div className="neo-card bg-pearl p-4 flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-bio mt-0.5" />
            <div className="flex-1">
              <p className="font-medium text-ink">Database maintenance completed</p>
              <p className="text-sm text-steel mt-1">Primary Database - 1 day ago</p>
              <p className="text-sm text-steel mt-2">Scheduled maintenance completed successfully.</p>
            </div>
            <Badge className="bg-bio/20 text-bio">Resolved</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
