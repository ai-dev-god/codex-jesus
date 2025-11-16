import { useCallback, useEffect, useState } from 'react';
import { Download, HardDrive, Clock, CheckCircle, RotateCcw, Trash2, Server } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/error';
import {
  deleteBackupJob,
  fetchBackupDownloadLink,
  fetchBackupSettings,
  listBackupJobs,
  requestBackupRestore,
  triggerBackupJob,
  updateBackupSettings,
  type BackupJob,
  type BackupSettings
} from '../../lib/api/admin';

import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';

export default function BackupManagement() {
  const { ensureAccessToken } = useAuth();
  const [backups, setBackups] = useState<BackupJob[]>([]);
  const [settings, setSettings] = useState<BackupSettings>({
    autoBackupEnabled: true,
    frequency: 'daily'
  });
  const [loading, setLoading] = useState(false);
  const [updatingSettings, setUpdatingSettings] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const token = await ensureAccessToken();
      const [jobsData, settingsData] = await Promise.all([listBackupJobs(token), fetchBackupSettings(token)]);
      setBackups(jobsData.data);
      setSettings(settingsData);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Unable to load backup data.');
      }
    } finally {
      setLoading(false);
    }
  }, [ensureAccessToken]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleToggleAutoBackup = async (enabled: boolean) => {
    setUpdatingSettings(true);
    try {
      const token = await ensureAccessToken();
      const updated = await updateBackupSettings(token, { ...settings, autoBackupEnabled: enabled });
      setSettings(updated);
      toast.success(`Automatic backups ${enabled ? 'enabled' : 'paused'}`);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to update settings.');
      }
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleFrequencyChange = async (frequency: BackupSettings['frequency']) => {
    setUpdatingSettings(true);
    try {
      const token = await ensureAccessToken();
      const updated = await updateBackupSettings(token, { ...settings, frequency });
      setSettings(updated);
      toast.success('Backup frequency updated');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to update settings.');
      }
    } finally {
      setUpdatingSettings(false);
    }
  };

  const handleManualBackup = async () => {
    setCreatingBackup(true);
    try {
      const token = await ensureAccessToken();
      const job = await triggerBackupJob(token);
      setBackups((prev) => [job, ...prev]);
      toast.success('Backup completed');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to run backup.');
      }
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleRestore = async (jobId: string) => {
    try {
      const token = await ensureAccessToken();
      const job = await requestBackupRestore(token, jobId);
      setBackups((prev) => prev.map((entry) => (entry.id === job.id ? job : entry)));
      toast.success('Restore requested');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to request restore.');
      }
    }
  };

  const handleDownload = async (jobId: string) => {
    try {
      const token = await ensureAccessToken();
      const { url } = await fetchBackupDownloadLink(token, jobId);
      await navigator.clipboard.writeText(url);
      toast.success('Backup link copied to clipboard');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Unable to fetch download link.');
      }
    }
  };

  const handleDelete = async (jobId: string) => {
    try {
      const token = await ensureAccessToken();
      await deleteBackupJob(token, jobId);
      setBackups((prev) => prev.filter((job) => job.id !== jobId));
      toast.success('Backup removed');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to delete backup.');
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <OverviewCard icon={HardDrive} label="Total Size" value={formatBytes(backups[0]?.sizeBytes)} />
        <OverviewCard icon={CheckCircle} label="Last Backup" value={relativeTime(backups[0]?.completedAt)} />
        <OverviewCard icon={Clock} label="Next Backup" value={nextBackupLabel(settings)} />
        <OverviewCard icon={Server} label="Retention" value="30 days" />
      </div>

      <div className="neo-card bg-white p-6">
        <div className="flex items-center justify-between mb-6">
          <h3>Backup Configuration</h3>
          <Button onClick={() => void handleManualBackup()} disabled={creatingBackup}>
            <Download className={`w-4 h-4 mr-2 ${creatingBackup ? 'animate-pulse' : ''}`} />
            {creatingBackup ? 'Backing Up…' : 'Manual Backup'}
          </Button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">Automatic Backups</p>
              <p className="text-sm text-steel">Schedule automated backups</p>
            </div>
            <Switch
              checked={settings.autoBackupEnabled}
              onCheckedChange={(value) => void handleToggleAutoBackup(value)}
              disabled={updatingSettings}
            />
          </div>
          <div className="neo-card bg-pearl p-4">
            <p className="font-medium text-ink mb-2">Backup Frequency</p>
            <Select
              value={settings.frequency}
              onValueChange={(value) => void handleFrequencyChange(value as BackupSettings['frequency'])}
              disabled={updatingSettings}
            >
              <SelectTrigger>
                <SelectValue placeholder="Frequency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hourly">Every Hour</SelectItem>
                <SelectItem value="six_hours">Every 6 Hours</SelectItem>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="neo-card bg-white overflow-hidden">
        <div className="p-6 pb-0 flex items-center justify-between">
          <h3 className="mb-4">Backup History</h3>
          {loading && <span className="text-sm text-steel">Loading…</span>}
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
                  <TableCell className="text-ink font-mono text-sm">{formatDate(backup.completedAt)}</TableCell>
                  <TableCell>
                    <Badge className={backup.type === 'FULL' ? 'bg-electric/20 text-electric' : 'bg-bio/20 text-bio'}>
                      {backup.type === 'FULL' ? 'Full' : 'Incremental'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-steel">{formatBytes(backup.sizeBytes)}</TableCell>
                  <TableCell className="text-steel">
                    {backup.durationSeconds ? `${Math.round(backup.durationSeconds / 60)} min` : '—'}
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-bio/20 text-bio">{backup.status}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="text-bio" onClick={() => void handleRestore(backup.id)}>
                        <RotateCcw className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-electric" onClick={() => void handleDownload(backup.id)}>
                        <Download className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="text-pulse" onClick={() => void handleDelete(backup.id)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!backups.length && !loading && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-steel">
                    No backups recorded yet.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

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
              <span className="text-bio font-bold">{backups[0] ? relativeTime(backups[0].completedAt) : 'Pending'}</span>
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
          </div>
        </div>
      </div>
    </div>
  );
}

const OverviewCard = ({
  icon: Icon,
  label,
  value
}: {
  icon: typeof HardDrive;
  label: string;
  value: string | number;
}) => (
  <div className="neo-card bg-white p-4 flex items-center gap-3">
    <div className="w-10 h-10 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
      <Icon className="w-5 h-5 text-white" />
    </div>
    <div>
      <p className="tag text-steel">{label}</p>
      <p className="text-xl font-bold text-ink">{value}</p>
    </div>
  </div>
);

const formatBytes = (bytes?: number | null) => {
  if (!bytes) {
    return '0 B';
  }
  if (bytes < 1024) {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
};

const relativeTime = (iso?: string | null) => {
  if (!iso) {
    return 'Never';
  }
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(delta / 60000);
  if (minutes < 1) {
    return 'Just now';
  }
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} hr ago`;
  }
  const days = Math.round(hours / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
};

const nextBackupLabel = (settings: BackupSettings) => {
  switch (settings.frequency) {
    case 'hourly':
      return 'In < 1 hour';
    case 'six_hours':
      return 'In < 6 hours';
    case 'weekly':
      return 'In < 7 days';
    default:
      return 'In < 24 hours';
  }
};

const formatDate = (iso?: string | null) => {
  if (!iso) {
    return '—';
  }
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short'
  }).format(new Date(iso));
};

