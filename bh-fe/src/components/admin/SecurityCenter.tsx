import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/error';
import {
  listAdminFlags,
  resolveAdminFlag,
  type AdminFlag,
  type FlagStatus
} from '../../lib/api/admin';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

type FlagAction = Extract<FlagStatus, 'TRIAGED' | 'RESOLVED'>;

export default function SecurityCenter() {
  const { ensureAccessToken } = useAuth();
  const [openFlags, setOpenFlags] = useState<AdminFlag[]>([]);
  const [triagedFlags, setTriagedFlags] = useState<AdminFlag[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingFlagId, setUpdatingFlagId] = useState<string | null>(null);
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

  const loadFlags = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const [openResponse, triagedResponse] = await Promise.all([
        listAdminFlags(token, { status: 'OPEN', limit: 25 }),
        listAdminFlags(token, { status: 'TRIAGED', limit: 10 })
      ]);
      setOpenFlags(openResponse.data);
      setTriagedFlags(triagedResponse.data);
      setLastFetchedAt(new Date());
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : 'Unable to load security threats.';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [ensureAccessToken]);

  useEffect(() => {
    void loadFlags();
  }, [loadFlags]);

  const securityScore = useMemo(() => {
    const penalty = Math.min(openFlags.length * 8, 70);
    return Math.max(15, 100 - penalty);
  }, [openFlags.length]);

  const topReason = useMemo(() => {
    if (openFlags.length === 0) {
      return 'No active flags';
    }
    const counts = new Map<string, number>();
    for (const flag of openFlags) {
      counts.set(flag.reason, (counts.get(flag.reason) ?? 0) + 1);
    }
    const [reason] = Array.from(counts.entries()).sort((a, b) => b[1] - a[1])[0];
    return reason;
  }, [openFlags]);

  const uniqueReporters = useMemo(() => {
    const reporters = new Set(openFlags.map((flag) => flag.openedBy.id));
    return reporters.size;
  }, [openFlags]);

  const formattedLastFetched = useMemo(
    () => (lastFetchedAt ? formatRelativeTime(lastFetchedAt) : '—'),
    [lastFetchedAt]
  );

  const handleUpdateFlag = useCallback(
    async (flag: AdminFlag, nextStatus: FlagAction) => {
      setUpdatingFlagId(flag.id);
      try {
        const token = await ensureAccessToken();
        const payload =
          nextStatus === 'RESOLVED'
            ? {
                status: 'RESOLVED' as const,
                resolutionNotes: 'Resolved via admin panel review'
              }
            : {
                status: 'TRIAGED' as const
              };
        const updated = await resolveAdminFlag(token, flag.id, payload);
        setOpenFlags((prev) => prev.filter((item) => item.id !== flag.id));
        if (nextStatus === 'TRIAGED') {
          setTriagedFlags((prev) => [updated, ...prev].slice(0, 10));
          toast.success('Flag triaged.');
        } else {
          toast.success('Flag resolved.');
        }
      } catch (err) {
        const message =
          err instanceof ApiError ? err.message : 'Unable to update flag status.';
        toast.error(message);
      } finally {
        setUpdatingFlagId(null);
      }
    },
    [ensureAccessToken]
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="neo-card bg-white p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-electric" />
            <h3>Security Health Score</h3>
          </div>

          <div className="flex flex-col md:flex-row md:items-center gap-6">
            <div className="relative w-32 h-32">
              <svg className="w-full h-full transform -rotate-90">
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="var(--cloud)"
                  strokeWidth="8"
                  fill="none"
                />
                <circle
                  cx="64"
                  cy="64"
                  r="56"
                  stroke="var(--electric)"
                  strokeWidth="8"
                  fill="none"
                  strokeDasharray={`${(securityScore / 100) * 352} 352`}
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-3xl font-bold text-ink">{securityScore}</p>
                  <p className="text-xs text-steel">/ 100</p>
                </div>
              </div>
            </div>

            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <MetricTile label="Active flags" value={openFlags.length.toString()} tone="pulse" />
              <MetricTile
                label="Unique reporters"
                value={uniqueReporters.toString()}
                tone="electric"
              />
              <MetricTile label="Top reason" value={topReason} tone="neural" />
              <MetricTile label="Last sync" value={formattedLastFetched} tone="bio" />
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3>Operations</h3>
            <Button variant="outline" size="sm" onClick={() => void loadFlags()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
          <div className="space-y-3">
            <QuickAction
              title="Review newest flag"
              description="Jump to the most recent report."
              disabled={openFlags.length === 0}
              onClick={() => {
                if (openFlags.length === 0) {
                  toast.info('No active flags to review.');
                  return;
                }
                toast.success('Scroll to the Active Flags table to review.');
              }}
            />
            <QuickAction
              title="Export flags"
              description="Copies open flag details to clipboard."
              onClick={async () => {
                if (openFlags.length === 0) {
                  toast.info('No active flags to export.');
                  return;
                }
                const payload = JSON.stringify(openFlags, null, 2);
                try {
                  await navigator.clipboard.writeText(payload);
                  toast.success('Flag details copied to clipboard.');
                } catch {
                  toast.error('Clipboard export unavailable.');
                }
              }}
            />
          </div>
        </div>
      </div>

      <div className="neo-card bg-white overflow-hidden">
        <div className="p-6 pb-4 flex items-center justify-between">
          <h3>Active Flags</h3>
          <Badge className="bg-pulse/20 text-pulse">{openFlags.length} open</Badge>
        </div>
        {error && (
          <div className="px-6 pb-2 text-sm text-pulse">{error}</div>
        )}
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Target</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Reporter</TableHead>
                <TableHead>Opened</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && openFlags.length === 0 &&
                Array.from({ length: 4 }).map((_, idx) => (
                  <TableRow key={`flag-skeleton-${idx}`}>
                    <TableCell>
                      <div className="h-4 w-48 rounded bg-cloud animate-pulse mb-2" />
                      <div className="h-3 w-32 rounded bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-32 rounded bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-4 w-40 rounded bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-3 w-20 rounded bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-8 w-20 rounded bg-cloud animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))}

              {openFlags.map((flag) => (
                <TableRow key={flag.id}>
                  <TableCell>
                    <p className="font-medium text-ink">{describeTarget(flag)}</p>
                    <p className="text-xs text-steel">
                      {flag.targetType.replace(/_/g, ' ').toLowerCase()}
                    </p>
                  </TableCell>
                  <TableCell>
                    <Badge className="bg-pulse/10 text-pulse">{flag.reason}</Badge>
                  </TableCell>
                  <TableCell>
                    <p className="text-sm text-ink">{flag.openedBy.displayName}</p>
                    <p className="text-xs text-steel">{flag.openedBy.email}</p>
                  </TableCell>
                  <TableCell className="text-sm text-steel">
                    {formatRelativeTime(flag.createdAt)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleUpdateFlag(flag, 'TRIAGED')}
                        disabled={updatingFlagId === flag.id}
                      >
                        Triaged
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => void handleUpdateFlag(flag, 'RESOLVED')}
                        disabled={updatingFlagId === flag.id}
                      >
                        Resolve
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}

              {!loading && openFlags.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-steel py-8">
                    No active flags. Security operations are clear.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="neo-card bg-white p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3>Recently triaged</h3>
          <Badge className="bg-electric/20 text-electric">{triagedFlags.length}</Badge>
        </div>
        {triagedFlags.length === 0 ? (
          <p className="text-sm text-steel">No triaged items yet. Triaged flags will appear here.</p>
        ) : (
          <div className="space-y-3">
            {triagedFlags.map((flag) => (
              <div key={`triaged-${flag.id}`} className="neo-card bg-pearl p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{describeTarget(flag)}</p>
                    <p className="text-xs text-steel">
                      Triaged {formatRelativeTime(flag.updatedAt ?? flag.createdAt)}
                    </p>
                  </div>
                  <Badge className="bg-electric/20 text-electric">Triaged</Badge>
                </div>
                <p className="text-sm text-steel mt-2">{flag.reason}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const MetricTile = ({
  label,
  value,
  tone
}: {
  label: string;
  value: string;
  tone: 'pulse' | 'electric' | 'neural' | 'bio';
}) => (
  <div className="neo-card bg-pearl p-4">
    <p className="tag text-steel mb-1">{label}</p>
    <p
      className={`text-xl font-semibold ${
        tone === 'pulse'
          ? 'text-pulse'
          : tone === 'electric'
            ? 'text-electric'
            : tone === 'neural'
              ? 'text-neural'
              : 'text-bio'
      }`}
    >
      {value}
    </p>
  </div>
);

const QuickAction = ({
  title,
  description,
  onClick,
  disabled
}: {
  title: string;
  description: string;
  onClick: () => void;
  disabled?: boolean;
}) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className={`w-full text-left rounded-xl border border-cloud px-4 py-3 transition hover:border-electric ${
      disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
    }`}
  >
    <p className="font-medium text-ink">{title}</p>
    <p className="text-sm text-steel">{description}</p>
  </button>
);

const describeTarget = (flag: AdminFlag): string => {
  const target = flag.target;
  if (!target) {
    return flag.targetType.replace(/_/g, ' ');
  }

  if (target.type === 'COMMENT') {
    const author = target.author?.displayName ?? 'member';
    return `Comment by ${author}: ${truncate(target.body, 48)}`;
  }
  if (target.type === 'POST') {
    const author = target.author?.displayName ?? 'member';
    return `Post by ${author}: ${truncate(target.body, 48)}`;
  }
  if (target.type === 'INSIGHT') {
    return target.title ?? 'Insight report';
  }
  if (target.type === 'BIOMARKER_LOG') {
    const name = target.biomarker?.name ?? 'Biomarker log';
    const owner = target.owner?.displayName ?? 'member';
    return `${name} for ${owner}`;
  }

  return flag.targetType.replace(/_/g, ' ');
};

const truncate = (value: string, length: number): string => {
  if (value.length <= length) {
    return value;
  }
  return `${value.slice(0, length - 1)}…`;
};

const formatRelativeTime = (value: Date | string): string => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return typeof value === 'string' ? value : 'Unknown';
  }

  const diffMs = Date.now() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) {
    return 'Just now';
  }
  if (diffMs < hour) {
    return `${Math.floor(diffMs / minute)}m ago`;
  }
  if (diffMs < day) {
    return `${Math.floor(diffMs / hour)}h ago`;
  }
  if (diffMs < day * 7) {
    return `${Math.floor(diffMs / day)}d ago`;
  }
  return date.toLocaleString();
};

