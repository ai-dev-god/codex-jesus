import { useEffect, useState } from 'react';
import { Shield, Download, Trash2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../lib/auth/AuthContext';
import {
  listDataDeletionJobs,
  listDataExportJobs,
  type AdminDataDeletionJob,
  type AdminDataExportJob
} from '../../lib/api/admin';
import { Badge } from '../ui/badge';
import { Button } from '../ui/button';
import { Skeleton } from '../ui/skeleton';

type StatusVariant = 'QUEUED' | 'IN_PROGRESS' | 'COMPLETE' | 'FAILED';

const statusStyles: Record<
  StatusVariant,
  { label: string; badge: string }
> = {
  QUEUED: {
    label: 'Queued',
    badge: 'bg-cloud text-steel border-cloud'
  },
  IN_PROGRESS: {
    label: 'Processing',
    badge: 'bg-electric/15 text-electric border-electric/30'
  },
  COMPLETE: {
    label: 'Complete',
    badge: 'bg-bio/15 text-bio border-bio/30'
  },
  FAILED: {
    label: 'Failed',
    badge: 'bg-pulse/15 text-pulse border-pulse/30'
  }
};

const formatDate = (value: string | null): string => {
  if (!value) {
    return '—';
  }
  try {
    return new Date(value).toLocaleString();
  } catch {
    return value;
  }
};

export default function PrivacyCenter() {
  const { ensureAccessToken } = useAuth();
  const [exportJobs, setExportJobs] = useState<AdminDataExportJob[]>([]);
  const [deletionJobs, setDeletionJobs] = useState<AdminDataDeletionJob[]>([]);
  const [loading, setLoading] = useState(true);

  const loadJobs = async () => {
    try {
      setLoading(true);
      const token = await ensureAccessToken();
      const [exportsResponse, deletionsResponse] = await Promise.all([
        listDataExportJobs(token, { limit: 10 }),
        listDataDeletionJobs(token, { limit: 10 })
      ]);
      setExportJobs(exportsResponse.data);
      setDeletionJobs(deletionsResponse.data);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to load DSAR jobs.';
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadJobs();
  }, []);

  const renderTable = <T extends AdminDataExportJob | AdminDataDeletionJob>(
    jobs: T[],
    emptyLabel: string
  ) => {
    if (loading) {
      return (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </div>
      );
    }

    if (jobs.length === 0) {
      return <p className="text-sm text-steel">{emptyLabel}</p>;
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-steel uppercase tracking-wide border-b border-cloud">
              <th className="py-2 pr-4">User</th>
              <th className="py-2 pr-4">Status</th>
              <th className="py-2 pr-4">Requested</th>
              <th className="py-2 pr-4">Completed</th>
              <th className="py-2 pr-4">Details</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((job) => (
              <tr key={job.id} className="border-b border-cloud/60 last:border-b-0">
                <td className="py-3 pr-4">
                  <div className="font-semibold text-ink">{job.user.displayName}</div>
                  <div className="text-xs text-steel">{job.user.email}</div>
                </td>
                <td className="py-3 pr-4">
                  <Badge className={`border ${statusStyles[job.status].badge}`}>
                    {statusStyles[job.status].label}
                  </Badge>
                </td>
                <td className="py-3 pr-4 text-steel">{formatDate(job.requestedAt)}</td>
                <td className="py-3 pr-4 text-steel">
                  {'completedAt' in job ? formatDate(job.completedAt) : '—'}
                </td>
                <td className="py-3 pr-4 text-xs text-steel">
                  {'resultAvailable' in job
                    ? job.resultAvailable
                      ? 'Archive ready'
                      : 'Awaiting generation'
                    : job.summaryAvailable
                      ? 'Summary captured'
                      : 'Pending scrub'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="tag text-steel mb-2">PRIVACY OPERATIONS</div>
          <h3 className="text-2xl font-semibold text-ink">DSAR Control Center</h3>
          <p className="text-sm text-steel">
            Monitor data export and deletion workflows with HIPAA/GDPR traceability.
          </p>
        </div>
        <Button variant="outline" onClick={loadJobs} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="neo-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-electric/15 flex items-center justify-center">
              <Download className="w-5 h-5 text-electric" />
            </div>
            <div>
              <div className="font-semibold text-ink">Data Export Jobs</div>
              <p className="text-xs text-steel">
                Last {exportJobs.length} export requests with expiry tracking.
              </p>
            </div>
          </div>
          {renderTable(exportJobs, 'No export requests yet.')}
        </div>

        <div className="neo-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pulse/15 flex items-center justify-center">
              <Trash2 className="w-5 h-5 text-pulse" />
            </div>
            <div>
              <div className="font-semibold text-ink">Data Deletion Jobs</div>
              <p className="text-xs text-steel">
                Compliance queue for account erasure and anonymization.
              </p>
            </div>
          </div>
          {renderTable(deletionJobs, 'No deletion requests yet.')}
        </div>
      </div>

      <div className="neo-card p-6 flex items-center gap-4">
        <div className="w-12 h-12 rounded-xl bg-steel/10 flex items-center justify-center">
          <Shield className="w-6 h-6 text-steel" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold text-ink mb-1">Compliance Notes</h4>
          <p className="text-sm text-steel">
            Export archives expire after 14 days. Deletion jobs require human verification before marking
            as complete.
          </p>
        </div>
      </div>
    </div>
  );
}

