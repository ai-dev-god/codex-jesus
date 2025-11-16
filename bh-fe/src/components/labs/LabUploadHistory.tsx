import { useCallback, useEffect, useMemo, useState } from 'react';
import { RefreshCw, AlertTriangle, Clock, Activity, FileText, Download, Tag as TagIcon } from 'lucide-react';
import { toast } from 'sonner';

import {
  fetchLongevityPlans,
  fetchPanelUploadDownloadUrl,
  fetchPanelUploads,
  updatePanelUploadTags
} from '../../lib/api/ai';
import { apiFetchBlob } from '../../lib/api/http';
import type { LongevityPlan, PanelUploadSummary, BiomarkerDefinition } from '../../lib/api/types';
import { listBiomarkerDefinitions } from '../../lib/api/biomarkers';
import { useAuth } from '../../lib/auth/AuthContext';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { ScrollArea } from '../ui/scroll-area';
import { Checkbox } from '../ui/checkbox';
import { Label } from '../ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Textarea } from '../ui/textarea';

interface LabUploadHistoryProps {
  refreshKey: number;
}

const statusStyles: Record<
  PanelUploadSummary['status'],
  { label: string; badge: string; text: string }
> = {
  PENDING: {
    label: 'Processing',
    badge: 'bg-electric/10 text-electric border-electric/30',
    text: 'text-electric'
  },
  NORMALIZED: {
    label: 'Parsed',
    badge: 'bg-bio/10 text-bio border-bio/30',
    text: 'text-bio'
  },
  FAILED: {
    label: 'Failed',
    badge: 'bg-pulse/10 text-pulse border-pulse/30',
    text: 'text-pulse'
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

const formatMeasurementValue = (value: string | number | null | undefined): string => {
  if (value === null || value === undefined) {
    return '—';
  }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? value.toString() : value.toFixed(2);
  }
  const asNumber = Number(value);
  if (!Number.isNaN(asNumber)) {
    return Number.isInteger(asNumber) ? asNumber.toString() : asNumber.toFixed(2);
  }
  return value;
};

const POLL_INTERVAL_MS = 8000;
const NO_PLAN_VALUE = '__no_plan__';

export default function LabUploadHistory({ refreshKey }: LabUploadHistoryProps) {
  const { ensureAccessToken } = useAuth();
  const [uploads, setUploads] = useState<PanelUploadSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailUpload, setDetailUpload] = useState<PanelUploadSummary | null>(null);
  const [tagUpload, setTagUpload] = useState<PanelUploadSummary | null>(null);
  const [downloadTarget, setDownloadTarget] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [plans, setPlans] = useState<LongevityPlan[] | null>(null);
  const [biomarkers, setBiomarkers] = useState<BiomarkerDefinition[] | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedBiomarkerIds, setSelectedBiomarkerIds] = useState<string[]>([]);
  const [tagSaving, setTagSaving] = useState(false);

  const loadUploads = useCallback(async (options: { silent?: boolean } = {}) => {
    try {
      if (!options.silent) {
        setLoading(true);
      }
      setError(null);
      const token = await ensureAccessToken();
      const data = await fetchPanelUploads(token, 12);
      setUploads(data);
      setDetailUpload((current) => (current ? data.find((item) => item.id === current.id) ?? current : current));
      setTagUpload((current) => (current ? data.find((item) => item.id === current.id) ?? current : current));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to load uploads.';
      setError(message);
    } finally {
      if (!options.silent) {
        setLoading(false);
      }
    }
  }, [ensureAccessToken]);

  useEffect(() => {
    void loadUploads();
  }, [loadUploads, refreshKey]);

  useEffect(() => {
    if (!uploads || uploads.length === 0) {
      return;
    }

    const hasPending = uploads.some((upload) => upload.status === 'PENDING');
    if (!hasPending) {
      return;
    }

    const interval = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) {
        return;
      }
      void loadUploads({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [uploads, loadUploads]);

  useEffect(() => {
    if (!tagUpload) {
      setSelectedPlanId(null);
      setSelectedBiomarkerIds([]);
      return;
    }

    setSelectedPlanId(tagUpload.planId);
    setSelectedBiomarkerIds(tagUpload.biomarkerTags.map((tag) => tag.biomarker.id));
  }, [tagUpload]);

  useEffect(() => {
    if (!tagUpload) {
      return;
    }

    let cancelled = false;
    const loadMetadata = async () => {
      try {
        setMetadataLoading(true);
        const token = await ensureAccessToken();
        const [planData, biomarkerData] = await Promise.all([
          fetchLongevityPlans(token, 20),
          listBiomarkerDefinitions(token)
        ]);
        if (!cancelled) {
          setPlans(planData);
          setBiomarkers(biomarkerData);
        }
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : 'Unable to load tagging metadata.';
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          setMetadataLoading(false);
        }
      }
    };

    void loadMetadata();
    return () => {
      cancelled = true;
    };
  }, [tagUpload, ensureAccessToken]);

  const emptyState = !loading && (!uploads || uploads.length === 0);

  const stats = useMemo(() => {
    if (!uploads || uploads.length === 0) {
      return { parsed: 0, pending: 0 };
    }
    return uploads.reduce(
      (acc, upload) => {
        if (upload.status === 'NORMALIZED') {
          acc.parsed += 1;
        }
        if (upload.status === 'PENDING') {
          acc.pending += 1;
        }
        return acc;
      },
      { parsed: 0, pending: 0 }
    );
  }, [uploads]);

  const autoRefreshActive = useMemo(
    () => Boolean(uploads?.some((upload) => upload.status === 'PENDING')),
    [uploads]
  );

  const getFileLabel = (upload: PanelUploadSummary): string => {
    const metaName =
      upload.rawMetadata && typeof upload.rawMetadata.fileName === 'string'
        ? upload.rawMetadata.fileName
        : null;
    return metaName ?? upload.storageKey.split('/').pop() ?? upload.storageKey;
  };

  const handleDownloadJson = (upload: PanelUploadSummary) => {
    const payload =
      upload.normalizedPayload ??
      {
        measurements: upload.measurements ?? [],
        metadata: upload.rawMetadata ?? {}
      };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${getFileLabel(upload).replace(/\\s+/g, '_')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleDownloadSource = async (upload: PanelUploadSummary) => {
    try {
      setDownloadTarget(upload.id);
      const token = await ensureAccessToken();
      const session = await fetchPanelUploadDownloadUrl(token, upload.id);
      const blob = await apiFetchBlob(session.url, { authToken: token, method: 'GET' });
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = getFileLabel(upload).replace(/\s+/g, '_');
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to generate download link.';
      toast.error(message);
    } finally {
      setDownloadTarget(null);
    }
  };

  const handleSaveTags = async () => {
    if (!tagUpload) {
      return;
    }

    try {
      setTagSaving(true);
      const token = await ensureAccessToken();
      const updated = await updatePanelUploadTags(token, tagUpload.id, {
        planId: selectedPlanId ?? null,
        biomarkerIds: selectedBiomarkerIds
      });
      setUploads((current) =>
        current ? current.map((item) => (item.id === updated.id ? updated : item)) : [updated]
      );
      setDetailUpload((current) => (current?.id === updated.id ? updated : current));
      toast.success('Upload tags updated.');
      setTagUpload(null);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to update tags.';
      toast.error(message);
    } finally {
      setTagSaving(false);
    }
  };

  const toggleBiomarker = (biomarkerId: string) => {
    setSelectedBiomarkerIds((current) =>
      current.includes(biomarkerId)
        ? current.filter((id) => id !== biomarkerId)
        : [...current, biomarkerId]
    );
  };

  const renderMeasurements = (upload: PanelUploadSummary) => {
    const preview = upload.measurements?.slice(0, 3) ?? [];
    if (preview.length === 0) {
      return <p className="text-xs text-steel">Awaiting extraction</p>;
    }
    return (
      <div className="flex flex-wrap gap-2">
        {preview.map((measurement) => (
          <span
            key={measurement.id}
            className="px-3 py-1 rounded-lg bg-white border border-cloud text-xs font-semibold text-ink"
          >
            {measurement.markerName}:{' '}
            <span className="text-steel">
              {formatMeasurementValue(measurement.value)}
              {measurement.unit ? ` ${measurement.unit}` : ''}
            </span>
          </span>
        ))}
        {upload.measurementCount > preview.length && (
          <span className="px-3 py-1 rounded-lg bg-cloud text-xs font-semibold text-steel">
            +{upload.measurementCount - preview.length} more
          </span>
        )}
      </div>
    );
  };

  const primaryCtaLabel = loading ? 'Refreshing…' : 'Refresh';
  const detailJson = useMemo(() => {
    if (!detailUpload) {
      return '';
    }
    const payload =
      detailUpload.normalizedPayload ??
      {
        measurements: detailUpload.measurements ?? [],
        metadata: detailUpload.rawMetadata ?? {}
      };
    return JSON.stringify(payload, null, 2);
  }, [detailUpload]);
  const detailTitle = detailUpload ? getFileLabel(detailUpload) : '';
  const planSelectValue = selectedPlanId ?? NO_PLAN_VALUE;
  const biomarkerOptions = biomarkers ?? [];
  const isTagDialogOpen = Boolean(tagUpload);

  return (
    <div className="neo-card p-8 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="tag text-steel mb-2">UPLOAD HISTORY</div>
          <h3 className="text-2xl font-semibold text-ink">Recent Lab Files</h3>
          <p className="text-sm text-steel">Track ingestion status and extracted biomarkers.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="flex items-center gap-3">
            <div className="text-left">
              <div className="text-xs text-steel uppercase tracking-wide">Parsed</div>
              <div className="text-lg font-bold text-bio">{stats.parsed}</div>
            </div>
            <div className="text-left">
              <div className="text-xs text-steel uppercase tracking-wide">Pending</div>
              <div className="text-lg font-bold text-electric">{stats.pending}</div>
            </div>
            <Button variant="outline" onClick={() => void loadUploads()} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              {primaryCtaLabel}
            </Button>
          </div>
          {autoRefreshActive && (
            <div className="flex items-center gap-2 text-xs text-electric">
              <RefreshCw className="w-3 h-3 animate-spin" />
              Auto-updating pending uploads
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-pulse/30 bg-pulse/5 px-4 py-3 text-sm text-pulse mb-4 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" />
          <span>{error}</span>
        </div>
      )}

      {loading && !uploads && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-steel">
          <Clock className="w-6 h-6 animate-spin text-electric" />
          <p>Loading your uploads…</p>
        </div>
      )}

      {emptyState && (
        <div className="flex-1 flex flex-col items-center justify-center text-center rounded-xl border border-dashed border-cloud p-8">
          <Activity className="w-10 h-10 text-steel mb-4" />
          <h4 className="text-lg font-semibold text-ink mb-2">No uploads yet</h4>
          <p className="text-sm text-steel">
            Drop a PDF, CSV, or image to unlock AI parsing and automatically populate biomarkers here.
          </p>
        </div>
      )}

      {!emptyState && uploads && (
        <div className="space-y-4 overflow-y-auto pr-1">
          {uploads.map((upload) => {
            const fileLabel = getFileLabel(upload);
            const status = statusStyles[upload.status];
            const hasDetailPayload =
              Boolean(upload.normalizedPayload) || Boolean(upload.measurements?.length);
            return (
              <div key={upload.id} className="rounded-2xl border border-cloud bg-white/80 p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-12 h-12 rounded-xl bg-cloud flex items-center justify-center">
                      <FileText className="w-5 h-5 text-steel" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-ink truncate">{fileLabel}</p>
                      <p className="text-xs text-steel">{upload.contentType ?? 'Unknown type'}</p>
                    </div>
                  </div>
                  <Badge className={`${status.badge} border`}>{status.label}</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-steel">
                  <div>
                    <p className="text-xs font-semibold text-ink/70 uppercase">Uploaded</p>
                    <p>{formatDate(upload.createdAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink/70 uppercase">Processed</p>
                    <p>{formatDate(upload.processedAt)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-ink/70 uppercase">Biomarkers</p>
                    <p className="text-ink font-semibold">
                      {upload.measurementCount > 0 ? upload.measurementCount : 'Pending'}
                    </p>
                  </div>
                </div>

                {upload.status === 'FAILED' && upload.errorMessage && (
                  <div className="rounded-xl bg-pulse/5 border border-pulse/30 px-4 py-3 text-sm text-pulse flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    <span>{upload.errorMessage}</span>
                  </div>
                )}

                {upload.plan && (
                  <div className="rounded-xl border border-electric/30 bg-electric/5 px-3 py-2 text-sm text-electric">
                    Linked plan:{' '}
                    <span className="font-semibold">{upload.plan.title ?? 'Untitled plan'}</span> •{' '}
                    {new Date(upload.plan.createdAt).toLocaleDateString()}
                  </div>
                )}

                {upload.biomarkerTags.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {upload.biomarkerTags.map((tag) => (
                      <span
                        key={tag.id}
                        className="px-3 py-1 rounded-lg bg-pearl border border-cloud text-xs font-semibold text-ink"
                      >
                        {tag.biomarker.name}
                        {tag.biomarker.unit ? ` (${tag.biomarker.unit})` : ''}
                      </span>
                    ))}
                  </div>
                )}

                <div>{renderMeasurements(upload)}</div>

                <div className="flex flex-wrap gap-2 pt-3 border-t border-cloud/60">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetailUpload(upload)}
                    disabled={!hasDetailPayload}
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    Review JSON
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => handleDownloadJson(upload)}>
                    <Download className="w-4 h-4 mr-2" />
                    Download JSON
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void handleDownloadSource(upload)}
                    disabled={downloadTarget === upload.id}
                  >
                    <Download className={`w-4 h-4 mr-2 ${downloadTarget === upload.id ? 'animate-spin' : ''}`} />
                    {downloadTarget === upload.id ? 'Preparing...' : 'Download File'}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setTagUpload(upload)}>
                    <TagIcon className="w-4 h-4 mr-2" />
                    Tag Data
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={Boolean(detailUpload)} onOpenChange={(open) => {
        if (!open) {
          setDetailUpload(null);
        }
      }}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Parsed payload</DialogTitle>
            <DialogDescription>{detailTitle}</DialogDescription>
          </DialogHeader>
          <Textarea value={detailJson} readOnly className="min-h-[320px] font-mono text-xs bg-void/5" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailUpload(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={isTagDialogOpen}
        onOpenChange={(open) => {
          if (!open) {
            setTagUpload(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Tag upload</DialogTitle>
            <DialogDescription>
              Link this lab file to a plan or highlight key biomarkers for faster filtering.
            </DialogDescription>
          </DialogHeader>
          {metadataLoading && (
            <div className="rounded-xl border border-cloud px-4 py-3 text-sm text-steel mb-4">
              Loading plans and biomarkers…
            </div>
          )}
          <div className="space-y-4">
            <div>
              <Label className="text-sm font-semibold text-ink">Linked plan</Label>
              <Select
                value={planSelectValue}
                onValueChange={(value) => setSelectedPlanId(value === NO_PLAN_VALUE ? null : value)}
                disabled={metadataLoading}
              >
                <SelectTrigger className="mt-2">
                  <SelectValue placeholder="Select a plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PLAN_VALUE}>No linked plan</SelectItem>
                  {(plans ?? []).map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.title ?? 'Untitled plan'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-semibold text-ink">Biomarker tags</Label>
              <ScrollArea className="mt-2 h-48 rounded-xl border border-cloud p-3">
                {biomarkerOptions.length === 0 && !metadataLoading && (
                  <p className="text-sm text-steel">No biomarkers available yet.</p>
                )}
                {biomarkerOptions.map((biomarker) => {
                  const checked = selectedBiomarkerIds.includes(biomarker.id);
                  return (
                    <label
                      key={biomarker.id}
                      className="flex items-center gap-3 py-1.5 text-sm text-ink cursor-pointer"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleBiomarker(biomarker.id)}
                      />
                      <div>
                        <p className="font-semibold">{biomarker.name}</p>
                        <p className="text-xs text-steel">{biomarker.unit}</p>
                      </div>
                    </label>
                  );
                })}
              </ScrollArea>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setTagUpload(null)} disabled={tagSaving}>
              Cancel
            </Button>
            <Button onClick={handleSaveTags} disabled={tagSaving || metadataLoading}>
              {tagSaving ? 'Saving…' : 'Save tags'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
