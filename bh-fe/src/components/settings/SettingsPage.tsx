import { useCallback, useEffect, useMemo, useState } from 'react';
import { Shield, Lock, Download, Trash2, Bell, User, CreditCard, CheckCircle2, Zap, Activity, Link2, RefreshCw, Unplug } from 'lucide-react';
import { toast } from 'sonner';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Separator } from '../ui/separator';
import { useAuth } from '../../lib/auth/AuthContext';
import { useProfile } from '../../hooks/useProfile';
import {
  getLatestDataDeletionJob,
  getLatestDataExportJob,
  requestDataDeletionJob,
  requestDataExportJob,
  updateProfile,
  type DataDeletionJob,
  type DataExportJob,
  type UpdateProfilePayload
} from '../../lib/api/profile';
import { getStravaStatus, requestStravaLink, unlinkStrava, type StravaLinkStatus } from '../../lib/api/strava';
import { ApiError } from '../../lib/api/error';

const pricingPlans = [
  {
    id: 'explorer',
    tier: 'Explorer',
    price: 'Free',
    description: 'Perfect for getting started with longevity tracking',
    features: [
      'Up to 20 biomarkers',
      'Basic wearable integrations',
      'Weekly dual-engine insights (OpenBioLLM + Gemini)',
      'Community access',
      'Manual data entry',
    ],
    color: 'electric' as const,
  },
  {
    id: 'biohacker',
    tier: 'Biohacker',
    price: '$49',
    period: '/month',
    description: 'For serious optimizers who want it all',
    features: [
      'Up to 150 biomarkers',
      'All wearable integrations',
      'Daily dual-engine insights (OpenBioLLM + Gemini)',
      'Advanced protocols with cross-checked recommendations',
      'Practitioner collaboration',
      'Lab result parsing with dual AI verification',
      'Priority support',
    ],
    color: 'neural' as const,
    featured: true,
  },
  {
    id: 'longevity_pro',
    tier: 'Longevity Pro',
    price: '$99',
    period: '/month',
    description: 'Enterprise-grade for coaches & practitioners',
    features: [
      'Unlimited biomarkers',
      'White-label options',
      'Client management suite',
      'API access',
      'Custom protocols',
      'Dedicated account manager',
      '24/7 priority support',
    ],
    color: 'bio' as const,
  },
];

export default function SettingsPage() {
  const [isAnnual, setIsAnnual] = useState(false);
  const currentPlan = 'biohacker';
  const { user, ensureAccessToken } = useAuth();
  const { profile, loading: profileLoading, error: profileError, setProfile } = useProfile();
  const [exportJob, setExportJob] = useState<DataExportJob | null>(null);
  const [deletionJob, setDeletionJob] = useState<DataDeletionJob | null>(null);
  const [privacyLoading, setPrivacyLoading] = useState(true);
  const [privacyAction, setPrivacyAction] = useState<'export' | 'delete' | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [timezoneValue, setTimezoneValue] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [biologicalSex, setBiologicalSex] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileBaseline, setProfileBaseline] = useState({
    displayName: '',
    timezone: '',
    dateOfBirth: '',
    biologicalSex: ''
  });
  const [stravaStatus, setStravaStatus] = useState<StravaLinkStatus | null>(null);
  const [stravaLoading, setStravaLoading] = useState(false);
  const [stravaAction, setStravaAction] = useState<'link' | 'unlink' | null>(null);

  useEffect(() => {
    const fallbackDisplayName = profile?.displayName ?? user?.email ?? 'BioHacker';
    const segments = fallbackDisplayName.trim().split(/\s+/).filter(Boolean);
    const nextFirst = segments[0] ?? '';
    const nextLast = segments.slice(1).join(' ');
    const timezone = profile?.timezone ?? 'UTC';
    const baselineSurvey = (profile?.baselineSurvey ?? {}) as Record<string, unknown>;
    const dob = typeof baselineSurvey?.dateOfBirth === 'string' ? (baselineSurvey.dateOfBirth as string) : '';
    const sex = typeof baselineSurvey?.biologicalSex === 'string' ? (baselineSurvey.biologicalSex as string) : '';

    setFirstName(nextFirst);
    setLastName(nextLast);
    setTimezoneValue(timezone);
    setDateOfBirth(dob);
    setBiologicalSex(sex);
    setProfileBaseline({
      displayName: [nextFirst, nextLast].filter(Boolean).join(' ').trim(),
      timezone,
      dateOfBirth: dob,
      biologicalSex: sex
    });
  }, [profile, user]);

  const profileDirty = useMemo(() => {
    const normalizedDisplayName = [firstName, lastName].filter(Boolean).join(' ').trim();
    return (
      normalizedDisplayName !== profileBaseline.displayName ||
      timezoneValue !== profileBaseline.timezone ||
      (dateOfBirth || '') !== (profileBaseline.dateOfBirth || '') ||
      (biologicalSex || '') !== (profileBaseline.biologicalSex || '')
    );
  }, [firstName, lastName, timezoneValue, dateOfBirth, biologicalSex, profileBaseline]);

  const formatKilometers = (meters?: number | null) => {
    if (!meters || Number.isNaN(meters)) {
      return '0.0';
    }
    return (meters / 1000).toFixed(1);
  };

  const formatMinutes = (seconds?: number | null) => {
    if (!seconds || Number.isNaN(seconds)) {
      return '0.0';
    }
    return (seconds / 60).toFixed(1);
  };

  const handleSaveProfile = useCallback(async () => {
    const normalizedDisplayName = [firstName, lastName].filter(Boolean).join(' ').trim();
    if (!normalizedDisplayName) {
      toast.error('Please provide at least a first name.');
      return;
    }

    const payload: UpdateProfilePayload = {};
    if (normalizedDisplayName !== profileBaseline.displayName) {
      payload.displayName = normalizedDisplayName;
    }
    if (timezoneValue && timezoneValue !== profileBaseline.timezone) {
      payload.timezone = timezoneValue;
    }
    const surveyPayload: Record<string, unknown> = {
      dateOfBirth: dateOfBirth || null,
      biologicalSex: biologicalSex || null
    };
    const baselineChanged =
      (surveyPayload.dateOfBirth ?? '') !== (profileBaseline.dateOfBirth || '') ||
      (surveyPayload.biologicalSex ?? '') !== (profileBaseline.biologicalSex || '');
    if (baselineChanged) {
      payload.baselineSurvey = surveyPayload;
    }

    if (Object.keys(payload).length === 0) {
      toast.info('No profile changes detected.');
      return;
    }

    try {
      setProfileSaving(true);
      const token = await ensureAccessToken();
      const updatedProfile = await updateProfile(token, payload);
      setProfile(updatedProfile);
      const updatedSurvey = (updatedProfile.baselineSurvey ?? {}) as Record<string, unknown>;
      const updatedDob = typeof updatedSurvey.dateOfBirth === 'string' ? updatedSurvey.dateOfBirth : '';
      const updatedSex = typeof updatedSurvey.biologicalSex === 'string' ? updatedSurvey.biologicalSex : '';
      setProfileBaseline({
        displayName: updatedProfile.displayName ?? normalizedDisplayName,
        timezone: updatedProfile.timezone ?? timezoneValue,
        dateOfBirth: updatedDob,
        biologicalSex: updatedSex
      });
      toast.success('Profile updated.');
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to save profile changes.';
      toast.error(message);
    } finally {
      setProfileSaving(false);
    }
  }, [
    firstName,
    lastName,
    timezoneValue,
    dateOfBirth,
    biologicalSex,
    ensureAccessToken,
    profileBaseline.displayName,
    profileBaseline.timezone,
    profileBaseline.dateOfBirth,
    profileBaseline.biologicalSex,
    setProfile
  ]);

  const fetchStravaStatus = useCallback(async () => {
    setStravaLoading(true);
    try {
      const token = await ensureAccessToken();
      const status = await getStravaStatus(token);
      setStravaStatus(status);
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to load Strava status.';
      toast.error(message);
      setStravaStatus(null);
    } finally {
      setStravaLoading(false);
    }
  }, [ensureAccessToken]);

  useEffect(() => {
    void fetchStravaStatus();
  }, [fetchStravaStatus]);

  const handleStravaLink = useCallback(async () => {
    setStravaAction('link');
    try {
      const token = await ensureAccessToken();
      const redirectUri = typeof window !== 'undefined' ? `${window.location.origin}/oauth/strava/callback` : '';
      const status = await requestStravaLink(token, redirectUri ? { redirectUri } : undefined);
      setStravaStatus(status);
      if (status.linkUrl) {
        window.location.href = status.linkUrl;
      } else {
        toast.info('Strava integration is already linked or unavailable.');
      }
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to initiate Strava linking.';
      toast.error(message);
    } finally {
      setStravaAction(null);
    }
  }, [ensureAccessToken]);

  const handleStravaUnlink = useCallback(async () => {
    setStravaAction('unlink');
    try {
      const token = await ensureAccessToken();
      await unlinkStrava(token);
      toast.success('Strava disconnected.');
      await fetchStravaStatus();
    } catch (error) {
      const message = error instanceof ApiError ? error.message : 'Unable to disconnect Strava.';
      toast.error(message);
    } finally {
      setStravaAction(null);
    }
  }, [ensureAccessToken, fetchStravaStatus]);

  const statusStyles: Record<
    DataExportJob['status'],
    { label: string; badge: string; text: string }
  > = {
    QUEUED: {
      label: 'Queued',
      badge: 'bg-cloud text-steel border-cloud',
      text: 'text-steel'
    },
    IN_PROGRESS: {
      label: 'Processing',
      badge: 'bg-electric/15 text-electric border-electric/40',
      text: 'text-electric'
    },
    COMPLETE: {
      label: 'Complete',
      badge: 'bg-bio/15 text-bio border-bio/40',
      text: 'text-bio'
    },
    FAILED: {
      label: 'Failed',
      badge: 'bg-pulse/15 text-pulse border-pulse/40',
      text: 'text-pulse'
    }
  };

  const formatTimestamp = (value: string | null): string => {
    if (!value) {
      return '—';
    }
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  };

  const handleRequestDataExport = async () => {
    try {
      setPrivacyAction('export');
      const token = await ensureAccessToken();
      const job = await requestDataExportJob(token);
      setExportJob(job);
      toast.success('Data export request queued.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to request export.';
      toast.error(message);
    } finally {
      setPrivacyAction(null);
    }
  };

  const handleDownloadExportPayload = () => {
    if (!exportJob?.payload) {
      toast.info('Export bundle not ready yet.');
      return;
    }
    const filename = `biohax-export-${exportJob.id}.json`;
    const blob = new Blob([JSON.stringify(exportJob.payload, null, 2)], {
      type: 'application/json'
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const handleRequestDataDeletion = async () => {
    try {
      setPrivacyAction('delete');
      const token = await ensureAccessToken();
      const job = await requestDataDeletionJob(token);
      setDeletionJob(job);
      toast.success('Deletion request acknowledged. Our team will process it shortly.');
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'Unable to request deletion.';
      toast.error(message);
    } finally {
      setPrivacyAction(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await ensureAccessToken();
        const [latestExport, latestDeletion] = await Promise.all([
          getLatestDataExportJob(token),
          getLatestDataDeletionJob(token)
        ]);
        if (!cancelled) {
          setExportJob(latestExport);
          setDeletionJob(latestDeletion);
        }
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : 'Unable to load privacy requests.';
          toast.error(message);
        }
      } finally {
        if (!cancelled) {
          setPrivacyLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ensureAccessToken]);

  return (
    <div className="min-h-screen mesh-gradient py-12 px-6" data-testid="view-settings">
      <div className="max-w-6xl mx-auto space-y-12">
        {/* Header */}
        <div>
          <div className="tag text-steel mb-3">SETTINGS</div>
          <h2 className="mb-4">Manage your account</h2>
          <p className="text-xl text-steel">
            Control your profile, privacy, notifications, and subscription
          </p>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList>
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="privacy">Privacy & Security</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          {/* Profile Tab */}
          <TabsContent value="profile" className="mt-8 space-y-6">
            <div className="neo-card p-8">
              <h3 className="mb-8">Profile Information</h3>
              
              {profileError && (
                <div className="mb-4 rounded-xl border border-pulse/30 bg-pulse/5 px-4 py-3 text-sm text-pulse">
                  {profileError}
                </div>
              )}

              <div className="flex items-center gap-6 mb-8">
                <div className="w-20 h-20 rounded-full gradient-spectrum flex items-center justify-center">
                  <User className="w-10 h-10 text-void" />
                </div>
                <div>
                  <Button variant="outline">Change Photo</Button>
                  <p className="text-xs text-steel mt-2">JPG, PNG or GIF. Max 5MB.</p>
                </div>
              </div>
              
              <Separator className="mb-8" />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={firstName}
                    onChange={(event) => setFirstName(event.target.value)}
                    disabled={profileLoading || profileSaving}
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={lastName}
                    onChange={(event) => setLastName(event.target.value)}
                    disabled={profileLoading || profileSaving}
                    className="h-12"
                  />
                </div>
              </div>

              <div className="space-y-2 mb-6">
                <Label>Email</Label>
                <Input type="email" defaultValue={user?.email ?? 'member@biohax.ai'} disabled className="h-12" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input
                    type="date"
                    value={dateOfBirth}
                    onChange={(event) => setDateOfBirth(event.target.value)}
                    disabled={profileSaving}
                    className="h-12"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Biological Sex</Label>
                  <Input
                    value={biologicalSex}
                    onChange={(event) => setBiologicalSex(event.target.value)}
                    disabled={profileSaving}
                    className="h-12"
                  />
                </div>
              </div>

              <div className="space-y-2 mb-8">
                <Label>Timezone</Label>
                <Input
                  value={timezoneValue}
                  onChange={(event) => setTimezoneValue(event.target.value)}
                  disabled={profileLoading || profileSaving}
                  className="h-12"
                />
              </div>

              <Button size="lg" onClick={handleSaveProfile} disabled={!profileDirty || profileSaving || profileLoading}>
                {profileSaving ? 'Saving…' : 'Save Changes'}
              </Button>

              <div className="mt-10">
                <div className="space-y-4">
                  <div className="space-y-4">
                    <div className="neo-card p-6">
                      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-3">
                          <div className="w-12 h-12 rounded-xl gradient-electric flex items-center justify-center">
                            <Activity className="w-6 h-6 text-void" />
                          </div>
                          <div>
                            <h4 className="mb-1">Strava Integration</h4>
                            <p className="text-sm text-steel">
                              Sync real Strava efforts into biohax-777 for community performance battles.
                            </p>
                          </div>
                        </div>
                        {stravaStatus?.linked && (
                          <Badge variant="success" className="text-xs">
                            Linked
                          </Badge>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                          <p className="font-semibold text-ink">
                            {stravaStatus?.athlete?.name ?? 'Not connected'}
                          </p>
                          <p className="text-sm text-steel">
                            {stravaStatus?.linked
                              ? `Last sync ${
                                  stravaStatus.lastSyncAt
                                    ? new Date(stravaStatus.lastSyncAt).toLocaleString()
                                    : 'pending'
                                }`
                              : 'Connect Strava to import runs, rides, and recovery data.'}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            variant="outline"
                            onClick={() => fetchStravaStatus()}
                            disabled={stravaLoading || stravaAction !== null}
                          >
                            <RefreshCw
                              className={`w-4 h-4 mr-2 ${stravaLoading && stravaAction === null ? 'animate-spin' : ''}`}
                            />
                            Refresh
                          </Button>
                          {stravaStatus?.linked ? (
                            <Button
                              variant="outline"
                              className="text-pulse border-pulse/30 hover:bg-pulse/10"
                              onClick={handleStravaUnlink}
                              disabled={stravaAction === 'unlink'}
                            >
                              <Unplug className={`w-4 h-4 mr-2 ${stravaAction === 'unlink' ? 'animate-spin' : ''}`} />
                              Disconnect
                            </Button>
                          ) : (
                            <Button onClick={handleStravaLink} disabled={stravaAction === 'link' || stravaLoading}>
                              <Link2 className={`w-4 h-4 mr-2 ${stravaAction === 'link' ? 'animate-spin' : ''}`} />
                              Connect Strava
                            </Button>
                          )}
                        </div>
                      </div>

                      {stravaStatus?.summary ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
                          <div>
                            <p className="text-xs uppercase text-cloud mb-1">Last 14d Distance</p>
                            <p className="text-2xl font-semibold text-ink">
                              {formatKilometers(stravaStatus.summary.totalDistanceMeters)} km
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-cloud mb-1">Moving Minutes</p>
                            <p className="text-2xl font-semibold text-ink">
                              {formatMinutes(stravaStatus.summary.totalMovingTimeSeconds)} min
                            </p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-cloud mb-1">Activities</p>
                            <p className="text-2xl font-semibold text-ink">{stravaStatus.summary.activityCount}</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-cloud mb-1">Longest Effort</p>
                            <p className="text-2xl font-semibold text-ink">
                              {formatKilometers(stravaStatus.summary.longestDistanceMeters)} km
                            </p>
                            {stravaStatus.summary.longestActivityName && (
                              <p className="text-xs text-steel truncate">
                                {stravaStatus.summary.longestActivityName}
                              </p>
                            )}
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-steel mt-6">
                          {stravaStatus?.linked
                            ? 'Waiting for your first sync from Strava…'
                            : 'Once connected, your Strava efforts will feed performance leaderboards automatically.'}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Privacy & Security Tab */}
          <TabsContent value="privacy" className="mt-8 space-y-6">
            <div className="neo-card p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-xl gradient-electric flex items-center justify-center">
                  <Shield className="w-6 h-6 text-void" />
                </div>
                <div>
                  <h3 className="mb-1">Privacy & Security</h3>
                  <p className="text-steel">Control your data and security settings</p>
                </div>
              </div>

              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-ink mb-1">Two-Factor Authentication</div>
                    <p className="text-sm text-steel">Add an extra layer of security</p>
                  </div>
                  <Switch />
                </div>

                <Separator />

                <div>
                  <h4 className="mb-4">Data Encryption</h4>
                  <div className="p-6 rounded-2xl bg-bio/10 border-2 border-bio/20">
                    <div className="flex items-center gap-3 mb-2">
                      <Lock className="w-5 h-5 text-bio" />
                      <span className="font-semibold text-bio">256-bit AES Encryption Active</span>
                    </div>
                    <p className="text-steel">
                      Your data is encrypted at rest and in transit. We are HIPAA compliant.
                    </p>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-6">Data Sharing</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">Share with practitioners</div>
                        <p className="text-sm text-steel">Allow invited practitioners to view your data</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">Anonymous research contribution</div>
                        <p className="text-sm text-steel">Help improve longevity research with anonymized data</p>
                      </div>
                      <Switch />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">Community profile visibility</div>
                        <p className="text-sm text-steel">Show your profile in the community</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-4">Data Management</h4>
                  <div className="grid gap-4">
                    <div className="rounded-2xl border border-cloud bg-white/80 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="font-semibold text-ink mb-1">Data Export</div>
                          <p className="text-sm text-steel">
                            Generate a machine-readable snapshot of everything we store.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={handleRequestDataExport}
                          disabled={privacyAction === 'export'}
                        >
                          <Download className={`w-4 h-4 mr-2 ${privacyAction === 'export' ? 'animate-spin' : ''}`} />
                          {privacyAction === 'export' ? 'Requesting…' : 'Export All Data'}
                        </Button>
                      </div>
                      {privacyLoading && !exportJob && (
                        <p className="text-xs text-steel mt-3">Checking for existing exports…</p>
                      )}
                      {exportJob && (
                        <div className="mt-4 rounded-xl border border-cloud p-4 bg-pearl/60 space-y-3">
                          <div className="flex items-center gap-3">
                            <Badge className={`border ${statusStyles[exportJob.status].badge}`}>
                              {statusStyles[exportJob.status].label}
                            </Badge>
                            <span className={`text-xs ${statusStyles[exportJob.status].text}`}>
                              {exportJob.status === 'COMPLETE'
                                ? 'Ready for download'
                                : exportJob.status === 'FAILED'
                                  ? exportJob.errorMessage ?? 'See audit logs for details'
                                  : 'Processing'}
                            </span>
                          </div>
                          <dl className="grid grid-cols-2 gap-3 text-xs text-steel">
                            <div>
                              <dt className="uppercase tracking-wide text-[10px] text-cloud">Requested</dt>
                              <dd className="font-semibold text-ink">{formatTimestamp(exportJob.requestedAt)}</dd>
                            </div>
                            <div>
                              <dt className="uppercase tracking-wide text-[10px] text-cloud">Completed</dt>
                              <dd className="font-semibold text-ink">{formatTimestamp(exportJob.completedAt)}</dd>
                            </div>
                            <div>
                              <dt className="uppercase tracking-wide text-[10px] text-cloud">Expires</dt>
                              <dd className="font-semibold text-ink">{formatTimestamp(exportJob.expiresAt)}</dd>
                            </div>
                          </dl>
                          {exportJob.payload && (
                            <Button variant="outline" size="sm" onClick={handleDownloadExportPayload}>
                              <Download className="w-4 h-4 mr-2" />
                              Download JSON Archive
                            </Button>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="rounded-2xl border border-cloud bg-white/80 p-5">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="font-semibold text-ink mb-1">Data Deletion</div>
                          <p className="text-sm text-steel">
                            Permanently erase all personal data once compliance review completes.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          className="text-pulse border-pulse/20 hover:bg-pulse/10"
                          onClick={handleRequestDataDeletion}
                          disabled={privacyAction === 'delete' || deletionJob?.status === 'IN_PROGRESS'}
                        >
                          <Trash2 className={`w-4 h-4 mr-2 ${privacyAction === 'delete' ? 'animate-spin' : ''}`} />
                          {privacyAction === 'delete' ? 'Submitting…' : 'Delete Account'}
                        </Button>
                      </div>
                      {privacyLoading && !deletionJob && (
                        <p className="text-xs text-steel mt-3">Checking previous deletion requests…</p>
                      )}
                      {deletionJob && (
                        <div className="mt-4 rounded-xl border border-cloud p-4 bg-pearl/60 space-y-3">
                          <div className="flex items-center gap-3">
                            <Badge className={`border ${statusStyles[deletionJob.status].badge}`}>
                              {statusStyles[deletionJob.status].label}
                            </Badge>
                            <span className={`text-xs ${statusStyles[deletionJob.status].text}`}>
                              {deletionJob.status === 'COMPLETE'
                                ? 'All records anonymized'
                                : deletionJob.status === 'FAILED'
                                  ? deletionJob.errorMessage ?? 'Action required'
                                  : 'Processing with compliance'}
                            </span>
                          </div>
                          <dl className="grid grid-cols-2 gap-3 text-xs text-steel">
                            <div>
                              <dt className="uppercase tracking-wide text-[10px] text-cloud">Requested</dt>
                              <dd className="font-semibold text-ink">
                                {formatTimestamp(deletionJob.requestedAt)}
                              </dd>
                            </div>
                            <div>
                              <dt className="uppercase tracking-wide text-[10px] text-cloud">Completed</dt>
                              <dd className="font-semibold text-ink">
                                {formatTimestamp(deletionJob.completedAt)}
                              </dd>
                            </div>
                          </dl>
                          {deletionJob.summary && (
                            <div className="text-xs text-steel">
                              <p className="uppercase tracking-wide text-[10px] text-cloud mb-1">Records removed</p>
                              <div className="flex flex-wrap gap-2">
                                {Object.entries(deletionJob.summary).map(([key, value]) => (
                                  <span
                                    key={key}
                                    className="px-3 py-1 rounded-lg bg-white border border-cloud text-[11px] font-semibold text-ink"
                                  >
                                    {key}: <span className="text-steel">{String(value)}</span>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-steel mt-3">
                    Download a copy of your data or permanently delete your account and all associated records with
                    auditable transparency.
                  </p>
                </div>

                <Separator />

                <div className="p-6 rounded-2xl bg-electric/10 border-2 border-electric/20">
                  <h4 className="mb-2">Audit Log</h4>
                  <p className="text-steel mb-4">
                    View all access to your health data
                  </p>
                  <Button variant="outline">View Audit History</Button>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Notifications Tab */}
          <TabsContent value="notifications" className="mt-8 space-y-6">
            <div className="neo-card p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-xl gradient-neural flex items-center justify-center">
                  <Bell className="w-6 h-6 text-void" />
                </div>
                <div>
                  <h3 className="mb-1">Notification Preferences</h3>
                  <p className="text-steel">Choose what updates you want to receive</p>
                </div>
              </div>

              <div className="space-y-8">
                <div>
                  <h4 className="mb-6">Health Alerts</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">Critical biomarker changes</div>
                        <p className="text-sm text-steel">Immediate alerts for significant changes</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">Daily protocol reminders</div>
                        <p className="text-sm text-steel">Reminders for supplements and activities</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">Recovery score notifications</div>
                        <p className="text-sm text-steel">Morning recovery and readiness updates</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-6">Insights & Recommendations</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">Weekly progress reports</div>
                        <p className="text-sm text-steel">Summary of your weekly health data</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">AI protocol recommendations</div>
                        <p className="text-sm text-steel">New personalized protocol suggestions</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">Research updates</div>
                        <p className="text-sm text-steel">Latest longevity research relevant to you</p>
                      </div>
                      <Switch />
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-6">Community & Social</h4>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">Milestone celebrations</div>
                        <p className="text-sm text-steel">Notifications when you hit health milestones</p>
                      </div>
                      <Switch defaultChecked />
                    </div>
                    <div className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                      <div>
                        <div className="font-semibold text-ink mb-1">Community updates</div>
                        <p className="text-sm text-steel">New posts and discussions</p>
                      </div>
                      <Switch />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Billing Tab */}
          <TabsContent value="billing" className="mt-8 space-y-8">
            {/* Current Subscription */}
            <div className="neo-card p-8">
              <div className="flex items-center gap-4 mb-8">
                <div className="w-12 h-12 rounded-xl gradient-bio flex items-center justify-center">
                  <CreditCard className="w-6 h-6 text-void" />
                </div>
                <div>
                  <h3 className="mb-1">Current Subscription</h3>
                  <p className="text-steel">Manage your plan and billing</p>
                </div>
              </div>

              <div className="space-y-8">
                <div className="p-6 rounded-2xl bg-neural/10 border-2 border-neural/20">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                      <div className="font-semibold text-ink mb-1">Current Plan: Biohacker</div>
                      <p className="text-steel">$49/month • Renews Dec 1, 2025</p>
                    </div>
                    <Badge className="gradient-neural text-void w-fit">Active</Badge>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-6">Payment Method</h4>
                  <div className="p-6 rounded-2xl bg-pearl border-2 border-cloud">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-16 h-10 bg-void rounded-lg flex items-center justify-center text-white font-bold text-xs">
                          VISA
                        </div>
                        <div>
                          <div className="font-semibold text-ink">•••• •••• •••• 4242</div>
                          <p className="text-sm text-steel">Expires 12/2027</p>
                        </div>
                      </div>
                      <Button variant="outline">Update</Button>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h4 className="mb-6">Billing History</h4>
                  <div className="space-y-3">
                    {[
                      { date: 'Nov 1, 2025', amount: '$49.00', status: 'Paid' },
                      { date: 'Oct 1, 2025', amount: '$49.00', status: 'Paid' },
                      { date: 'Sep 1, 2025', amount: '$49.00', status: 'Paid' },
                    ].map((invoice, i) => (
                      <div key={i} className="flex items-center justify-between p-4 rounded-xl bg-pearl">
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="font-semibold text-ink">{invoice.date}</div>
                            <p className="text-sm text-steel">{invoice.amount}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <Badge variant="success">
                            {invoice.status}
                          </Badge>
                          <Button variant="ghost" size="sm">
                            <Download className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Available Plans - EXACT MATCH to LandingPage */}
            <div className="neo-card p-8">
              <div className="mb-8">
                <h3 className="mb-3">Upgrade or Change Plan</h3>
                <p className="text-steel mb-6">
                  Choose the plan that best fits your needs
                </p>
                
                <div className="flex items-center gap-3">
                  <span className={`font-semibold ${!isAnnual ? 'text-ink' : 'text-steel'}`}>
                    Monthly
                  </span>
                  <Switch
                    checked={isAnnual}
                    onCheckedChange={setIsAnnual}
                  />
                  <span className={`font-semibold ${isAnnual ? 'text-ink' : 'text-steel'}`}>
                    Annual
                  </span>
                  {isAnnual && (
                    <Badge className="bg-bio text-void">Save 20%</Badge>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {pricingPlans.map((plan) => {
                  const isCurrentPlan = plan.id === currentPlan;
                  const cardClass = plan.featured ? `neo-card-${plan.color} shadow-2xl scale-105` : 'neo-card';
                  const gradientClass = `gradient-${plan.color}`;
                  
                  return (
                    <div key={plan.id} className={`${cardClass} p-8 relative`}>
                      {plan.featured && (
                        <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                          <div className={`${gradientClass} px-4 py-2 rounded-full text-void text-sm font-bold shadow-lg`}>
                            MOST POPULAR
                          </div>
                        </div>
                      )}
                      
                      <div className="text-center mb-8">
                        <div className="tag text-steel mb-2">{plan.tier}</div>
                        <div className="flex items-baseline justify-center gap-1 mb-3">
                          <span className="text-5xl font-bold text-ink">{plan.price}</span>
                          {plan.period && <span className="text-steel">{plan.period}</span>}
                        </div>
                        <p className="text-sm text-steel">{plan.description}</p>
                      </div>

                      <ul className="space-y-3 mb-8">
                        {plan.features.map((feature, i) => (
                          <li key={i} className="flex items-start gap-3">
                            <CheckCircle2 className={`w-5 h-5 text-${plan.color} flex-shrink-0 mt-0.5`} />
                            <span className="text-sm text-ink">{feature}</span>
                          </li>
                        ))}
                      </ul>

                      <Button 
                        className="w-full" 
                        variant={isCurrentPlan ? 'outline' : (plan.featured ? 'default' : 'outline')}
                        disabled={isCurrentPlan}
                      >
                        {isCurrentPlan ? 'Current Plan' : (plan.price === 'Free' ? 'Downgrade' : 'Upgrade')}
                      </Button>
                    </div>
                  );
                })}
              </div>

              <div className="mt-8 p-6 rounded-2xl bg-electric/10 border-2 border-electric/20">
                <h4 className="mb-2">Enterprise Solutions</h4>
                <p className="text-sm text-steel mb-4">
                  Custom plans for hospitals, research institutions, and large wellness organizations.
                </p>
                <Button variant="outline">
                  <Zap className="w-5 h-5 mr-2" />
                  Contact Sales
                </Button>
              </div>

              <div className="mt-6 text-center text-sm text-steel">
                <p>All plans include 14-day free trial. No credit card required.</p>
                <p className="mt-1">Cancel anytime. HIPAA compliant. 256-bit encryption.</p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
