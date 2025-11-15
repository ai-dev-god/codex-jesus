import { useCallback, useEffect, useMemo, useState } from 'react';
import { Key, Plus, Copy, Eye, EyeOff, Trash2, RefreshCw, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../lib/auth/AuthContext';
import { ApiError } from '../../lib/api/error';
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  rotateApiKey,
  type ApiKey,
  type CreateApiKeyPayload
} from '../../lib/api/admin';

import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const SCOPE_LABELS: Record<ApiKey['scope'], string> = {
  FULL: 'Full Access',
  READ: 'Read Only',
  WRITE: 'Write Only'
};

export default function ApiKeyManagement() {
  const { ensureAccessToken } = useAuth();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(false);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [pendingKeyId, setPendingKeyId] = useState<string | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateApiKeyPayload>({ name: '', scope: 'READ' });
  const [creating, setCreating] = useState(false);

  const loadKeys = useCallback(async () => {
    setLoading(true);
    try {
      const token = await ensureAccessToken();
      const data = await listApiKeys(token);
      setApiKeys(data.data);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Unable to load API keys.');
      }
    } finally {
      setLoading(false);
    }
  }, [ensureAccessToken]);

  useEffect(() => {
    void loadKeys();
  }, [loadKeys]);

  const stats = useMemo(() => {
    const active = apiKeys.filter((key) => key.status === 'ACTIVE').length;
    const totalRequests = apiKeys.reduce((sum, key) => sum + key.requestCount, 0);
    const rotated = apiKeys.filter((key) => key.lastRotatedAt).length;
    return { active, totalRequests, rotated };
  }, [apiKeys]);

  const handleToggleVisibility = (id: string) => {
    setShowKey((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleCopyMasked = async (key: ApiKey) => {
    try {
      await navigator.clipboard.writeText(key.maskedKey);
      toast.success('Masked key copied');
    } catch {
      toast.error('Unable to copy key');
    }
  };

  const handleCreateKey = async () => {
    if (!createForm.name.trim()) {
      toast.error('Key name is required.');
      return;
    }
    setCreating(true);
    try {
      const token = await ensureAccessToken();
      const result = await createApiKey(token, createForm);
      setApiKeys((prev) => [result.apiKey, ...prev]);
      setIsCreateDialogOpen(false);
      setCreateForm({ name: '', scope: 'READ' });
      await navigator.clipboard.writeText(result.plaintextKey);
      toast.success('API key created and copied to clipboard');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to create API key.');
      }
    } finally {
      setCreating(false);
    }
  };

  const handleRotateKey = async (keyId: string) => {
    setPendingKeyId(keyId);
    try {
      const token = await ensureAccessToken();
      const result = await rotateApiKey(token, keyId);
      setApiKeys((prev) => prev.map((key) => (key.id === result.apiKey.id ? result.apiKey : key)));
      await navigator.clipboard.writeText(result.plaintextKey);
      toast.success('API key rotated. New key copied to clipboard.');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to rotate API key.');
      }
    } finally {
      setPendingKeyId(null);
    }
  };

  const handleRevokeKey = async (keyId: string) => {
    setPendingKeyId(keyId);
    try {
      const token = await ensureAccessToken();
      const result = await revokeApiKey(token, keyId);
      setApiKeys((prev) => prev.map((key) => (key.id === result.id ? result : key)));
      toast.success('API key revoked');
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to revoke API key.');
      }
    } finally {
      setPendingKeyId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatsCard label="Active API Keys" value={stats.active} />
        <StatsCard label="Total Requests" value={`${(stats.totalRequests / 1_000_000).toFixed(1)}M`} />
        <StatsCard label="Keys Rotated" value={stats.rotated} description="Last 30 days" />
      </div>

      <div className="neo-card bg-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="mb-1">API Key Management</h3>
            <p className="text-sm text-steel">Manage access keys for external integrations</p>
          </div>

          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Create API Key
              </Button>
            </DialogTrigger>
            <DialogContent className="neo-card bg-white">
              <DialogHeader>
                <DialogTitle>Create New API Key</DialogTitle>
                <DialogDescription>Generate a new API key for external service integration</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div>
                  <Label>Key Name</Label>
                  <Input
                    placeholder="Production Integration"
                    className="mt-2"
                    value={createForm.name}
                    onChange={(event) => setCreateForm((prev) => ({ ...prev, name: event.target.value }))}
                  />
                </div>

                <div>
                  <Label>Access Scope</Label>
                  <Select
                    value={createForm.scope ?? 'READ'}
                    onValueChange={(value: ApiKey['scope']) => setCreateForm((prev) => ({ ...prev, scope: value }))}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="READ">Read Only</SelectItem>
                      <SelectItem value="WRITE">Write Only</SelectItem>
                      <SelectItem value="FULL">Full Access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="neo-card bg-pearl p-4 text-sm text-steel">
                  Store this key securely. You won't be able to view the secret again after creation.
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={creating}>
                  Cancel
                </Button>
                <Button onClick={() => void handleCreateKey()} disabled={creating}>
                  {creating ? 'Generating…' : 'Generate Key'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="neo-card bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>API Key</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Requests</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-steel">
                    Loading keys…
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                apiKeys.map((apiKey) => (
                  <TableRow key={apiKey.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Key className="w-4 h-4 text-electric" />
                        <span className="font-medium text-ink">{apiKey.name}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <code className="text-xs font-mono text-steel">
                          {showKey[apiKey.id] ? apiKey.maskedKey : maskKey(apiKey)}
                        </code>
                        <Button variant="ghost" size="sm" onClick={() => handleToggleVisibility(apiKey.id)}>
                          {showKey[apiKey.id] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => void handleCopyMasked(apiKey)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-electric/20 text-electric">{SCOPE_LABELS[apiKey.scope]}</Badge>
                    </TableCell>
                    <TableCell className="text-steel text-sm">{formatDate(apiKey.createdAt)}</TableCell>
                    <TableCell className="text-steel text-sm">{formatDate(apiKey.lastUsedAt)}</TableCell>
                    <TableCell className="text-ink font-medium">{apiKey.requestCount.toLocaleString()}</TableCell>
                    <TableCell>
                      <Badge className={apiKey.status === 'ACTIVE' ? 'bg-bio/20 text-bio' : 'bg-steel/20 text-steel'}>
                        {apiKey.status === 'ACTIVE' ? 'Active' : 'Revoked'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {apiKey.status === 'ACTIVE' && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleRotateKey(apiKey.id)}
                              title="Rotate key"
                              disabled={pendingKeyId === apiKey.id}
                            >
                              <RefreshCw className="w-4 h-4 text-electric" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void handleRevokeKey(apiKey.id)}
                              title="Revoke key"
                              disabled={pendingKeyId === apiKey.id}
                            >
                              <Trash2 className="w-4 h-4 text-pulse" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              {!loading && apiKeys.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-steel">
                    No API keys found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="neo-card bg-white p-6">
        <h3 className="mb-4">Security Best Practices</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <BestPractice title="Rotate Keys Regularly" description="Rotate API keys every 90 days to maintain security." />
          <BestPractice title="Use Limited Scopes" description="Grant only the minimum required permissions for each key." />
          <BestPractice title="Monitor Usage" description="Regularly review API key usage for anomalies." />
          <BestPractice title="Revoke Unused Keys" description="Remove API keys that haven't been used in 30+ days." />
        </div>
      </div>
    </div>
  );
}

const StatsCard = ({ label, value, description }: { label: string; value: string | number; description?: string }) => (
  <div className="neo-card bg-white p-6">
    <div className="flex items-center gap-3">
      <div className="w-10 h-10 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
        <Key className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="tag text-steel">{label}</p>
        <p className="text-2xl font-bold text-ink">{value}</p>
        {description && <p className="text-xs text-steel">{description}</p>}
      </div>
    </div>
  </div>
);

const BestPractice = ({ title, description }: { title: string; description: string }) => (
  <div className="neo-card bg-pearl p-4">
    <div className="flex items-start gap-3">
      <CheckCircle className="w-5 h-5 text-bio mt-0.5" />
      <div>
        <p className="font-medium text-ink mb-1">{title}</p>
        <p className="text-sm text-steel">{description}</p>
      </div>
    </div>
  </div>
);

const maskKey = (apiKey: ApiKey) => `${apiKey.prefix}${'•'.repeat(16)}${apiKey.suffix}`;

const formatDate = (iso?: string | null) => {
  if (!iso) {
    return '—';
  }
  return new Date(iso).toLocaleString();
};

