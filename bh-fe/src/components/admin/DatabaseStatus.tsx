import { useState } from 'react';
import { 
  Database, 
  HardDrive, 
  Activity, 
  Clock,
  Users,
  Zap,
  RefreshCw,
  Download
} from 'lucide-react';
import { Button } from '../ui/button';
import { Progress } from '../ui/progress';
import { Badge } from '../ui/badge';
import { toast } from 'sonner';

interface DatabaseInstance {
  name: string;
  type: 'primary' | 'replica' | 'cache';
  status: 'healthy';
  connections: number;
  maxConnections: number;
  size: string;
  cpu: number;
  memory: number;
  queries: number;
  latency: number;
}

export default function DatabaseStatus() {
  const [isRefreshing, setIsRefreshing] = useState(false);

  const databases: DatabaseInstance[] = [
    {
      name: 'Primary Database (PostgreSQL)',
      type: 'primary',
      status: 'healthy',
      connections: 142,
      maxConnections: 500,
      size: '487 GB',
      cpu: 45,
      memory: 68,
      queries: 2847,
      latency: 12,
    },
    {
      name: 'Read Replica 1',
      type: 'replica',
      status: 'healthy',
      connections: 89,
      maxConnections: 500,
      size: '487 GB',
      cpu: 32,
      memory: 54,
      queries: 1532,
      latency: 15,
    },
    {
      name: 'Redis Cache',
      type: 'cache',
      status: 'healthy',
      connections: 234,
      maxConnections: 1000,
      size: '24 GB',
      cpu: 15,
      memory: 42,
      queries: 15847,
      latency: 2,
    },
  ];

  const handleRefresh = () => {
    setIsRefreshing(true);
    setTimeout(() => {
      setIsRefreshing(false);
      toast.success('Database status refreshed');
    }, 1500);
  };

  const totalConnections = databases.reduce((sum, db) => sum + db.connections, 0);
  const totalQueries = databases.reduce((sum, db) => sum + db.queries, 0);
  const avgLatency = databases.reduce((sum, db) => sum + db.latency, 0) / databases.length;

  return (
    <div className="space-y-6">
      {/* Database Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
              <Database className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Instances</p>
              <p className="text-2xl font-bold text-ink">{databases.length}</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bio flex items-center justify-center shadow-lg">
              <Users className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Connections</p>
              <p className="text-2xl font-bold text-ink">{totalConnections}</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-pulse flex items-center justify-center shadow-lg">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Queries/sec</p>
              <p className="text-2xl font-bold text-ink">{totalQueries}</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-neural flex items-center justify-center shadow-lg">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Avg Latency</p>
              <p className="text-2xl font-bold text-ink">{avgLatency.toFixed(1)}ms</p>
            </div>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 flex-wrap">
        <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline">
          <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
          Refresh Status
        </Button>
        <Button variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Manual Backup
        </Button>
        <Button>
          <Zap className="w-4 h-4 mr-2" />
          Optimize Database
        </Button>
      </div>

      {/* Database Instances */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {databases.map((db, idx) => (
          <div key={idx} className="neo-card bg-white p-6">
            <div className="flex items-start justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
                  {db.type === 'cache' ? (
                    <Zap className="w-6 h-6 text-white" />
                  ) : (
                    <Database className="w-6 h-6 text-white" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-ink">{db.name}</h3>
                  <p className="tag text-steel uppercase">{db.type}</p>
                </div>
              </div>
              <Badge className="bg-bio/20 text-bio">Healthy</Badge>
            </div>

            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-steel">Connections</span>
                  <span className="text-sm font-bold text-ink">
                    {db.connections} / {db.maxConnections}
                  </span>
                </div>
                <Progress value={(db.connections / db.maxConnections) * 100} className="h-2" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-steel">CPU Usage</span>
                  <span className="text-sm font-bold text-ink">{db.cpu}%</span>
                </div>
                <Progress value={db.cpu} className="h-2" />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-steel">Memory Usage</span>
                  <span className="text-sm font-bold text-ink">{db.memory}%</span>
                </div>
                <Progress value={db.memory} className="h-2" />
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-cloud">
                <div>
                  <p className="text-xs text-steel">Size</p>
                  <p className="text-sm font-bold text-ink">{db.size}</p>
                </div>
                <div>
                  <p className="text-xs text-steel">Queries/s</p>
                  <p className="text-sm font-bold text-ink">{db.queries}</p>
                </div>
                <div>
                  <p className="text-xs text-steel">Latency</p>
                  <p className="text-sm font-bold text-ink">{db.latency}ms</p>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Backup Status */}
      <div className="neo-card bg-white p-6">
        <h3 className="mb-4">Backup Status</h3>
        <div className="space-y-3">
          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Download className="w-5 h-5 text-bio" />
              <div>
                <p className="font-medium text-ink">Last Full Backup</p>
                <p className="text-sm text-steel">Completed 15 minutes ago • 487 GB</p>
              </div>
            </div>
            <Badge className="bg-bio/20 text-bio">Success</Badge>
          </div>

          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Activity className="w-5 h-5 text-electric" />
              <div>
                <p className="font-medium text-ink">Continuous Archiving</p>
                <p className="text-sm text-steel">Last WAL archive: 2 minutes ago</p>
              </div>
            </div>
            <Badge className="bg-electric/20 text-electric">Active</Badge>
          </div>

          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-neural" />
              <div>
                <p className="font-medium text-ink">Next Scheduled Backup</p>
                <p className="text-sm text-steel">In 23 hours 45 minutes</p>
              </div>
            </div>
            <Badge className="bg-neural/20 text-neural">Scheduled</Badge>
          </div>
        </div>
      </div>
    </div>
  );
}
