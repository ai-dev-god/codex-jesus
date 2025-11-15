import { useState } from 'react';
import { 
  Download, 
  HardDrive, 
  Clock,
  CheckCircle,
  Play,
  RotateCcw,
  Trash2,
  Server
} from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Progress } from '../ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';

interface Backup {
  id: string;
  type: 'full' | 'incremental';
  size: string;
  timestamp: string;
  status: 'completed' | 'failed';
  duration: string;
}

export default function BackupManagement() {
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(true);
  const [isBackingUp, setIsBackingUp] = useState(false);

  const backups: Backup[] = [
    {
      id: '1',
      type: 'full',
      size: '487 GB',
      timestamp: '2025-11-15 02:00:00',
      status: 'completed',
      duration: '2h 15m',
    },
    {
      id: '2',
      type: 'incremental',
      size: '12.4 GB',
      timestamp: '2025-11-14 14:00:00',
      status: 'completed',
      duration: '18m',
    },
    {
      id: '3',
      type: 'full',
      size: '478 GB',
      timestamp: '2025-11-13 02:00:00',
      status: 'completed',
      duration: '2h 8m',
    },
  ];

  const handleManualBackup = () => {
    setIsBackingUp(true);
    toast.success('Backup initiated');
    setTimeout(() => {
      setIsBackingUp(false);
      toast.success('Backup completed successfully');
    }, 3000);
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'full':
        return <Badge className="bg-electric/20 text-electric">Full Backup</Badge>;
      case 'incremental':
        return <Badge className="bg-bio/20 text-bio">Incremental</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Backup Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
              <HardDrive className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Total Size</p>
              <p className="text-xl font-bold text-ink">1.47 TB</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bio flex items-center justify-center shadow-lg">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Last Backup</p>
              <p className="text-xl font-bold text-ink">15 min ago</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-neural flex items-center justify-center shadow-lg">
              <Clock className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Next Backup</p>
              <p className="text-sm font-bold text-ink">Tomorrow 02:00</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-pulse flex items-center justify-center shadow-lg">
              <Server className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Retention</p>
              <p className="text-xl font-bold text-ink">30 days</p>
            </div>
          </div>
        </div>
      </div>

      {/* Backup Controls */}
      <div className="neo-card bg-white p-6">
        <div className="flex items-center justify-between mb-6">
          <h3>Backup Configuration</h3>
          <Button onClick={handleManualBackup} disabled={isBackingUp}>
            <Download className={`w-4 h-4 mr-2 ${isBackingUp ? 'animate-pulse' : ''}`} />
            {isBackingUp ? 'Backing Up...' : 'Manual Backup'}
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">Automatic Backups</p>
              <p className="text-sm text-steel">Schedule automated backups</p>
            </div>
            <Switch checked={autoBackupEnabled} onCheckedChange={setAutoBackupEnabled} />
          </div>

          <div className="neo-card bg-pearl p-4">
            <p className="font-medium text-ink mb-2">Backup Frequency</p>
            <Select defaultValue="daily">
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Every Hour</SelectItem>
                <SelectItem value="every-6">Every 6 Hours</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Current Backup Progress (if backing up) */}
      {isBackingUp && (
        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3 mb-4">
            <Download className="w-5 h-5 text-electric animate-pulse" />
            <h3>Backup in Progress</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-steel">Database backup</span>
              <span className="text-electric">Processing...</span>
            </div>
            <Progress value={45} className="h-2" />
            <div className="flex items-center justify-between text-xs text-steel">
              <span>218 GB of 487 GB</span>
              <span>Estimated time: 1h 20m</span>
            </div>
          </div>
        </div>
      )}

      {/* Backup History */}
      <div className="neo-card bg-white overflow-hidden">
        <div className="p-6 pb-0">
          <h3 className="mb-4">Backup History</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Size</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {backups.map((backup) => (
                <TableRow key={backup.id}>
                  <TableCell className="text-ink font-mono text-sm">
                    {backup.timestamp}
                  </TableCell>
                  <TableCell>{getTypeBadge(backup.type)}</TableCell>
                  <TableCell className="text-steel">{backup.size}</TableCell>
                  <TableCell className="text-steel">{backup.duration}</TableCell>
                  <TableCell>
                    <Badge className="bg-bio/20 text-bio">Completed</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="text-bio">
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-electric">
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-pulse">
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Recovery Objectives */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="neo-card bg-white p-6">
          <h3 className="mb-4">Recovery Point Objective (RPO)</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-steel">Target RPO</span>
              <span className="text-ink font-bold">1 hour</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-steel">Current RPO</span>
              <span className="text-bio font-bold">15 minutes</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-steel">Status</span>
              <Badge className="bg-bio/20 text-bio">
                <CheckCircle className="w-3 h-3 mr-1" />
                Meeting Target
              </Badge>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <h3 className="mb-4">Recovery Time Objective (RTO)</h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-steel">Target RTO</span>
              <span className="text-ink font-bold">4 hours</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-steel">Estimated RTO</span>
              <span className="text-bio font-bold">2.5 hours</span>
            </div>
            <div className="pt-4 border-t border-cloud">
              <Button className="w-full">
                <Play className="w-4 h-4 mr-2" />
                Test Recovery Process
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
