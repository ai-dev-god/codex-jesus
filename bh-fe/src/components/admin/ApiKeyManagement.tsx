import { useState } from 'react';
import { Key, Plus, Copy, Eye, EyeOff, Trash2, RefreshCw, CheckCircle } from 'lucide-react';
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
  DialogTrigger,
} from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { toast } from 'sonner';

interface ApiKey {
  id: string;
  name: string;
  key: string;
  scope: 'full' | 'read' | 'write';
  created: string;
  lastUsed: string;
  requests: number;
  status: 'active' | 'revoked';
}

export default function ApiKeyManagement() {
  const [showKey, setShowKey] = useState<{ [key: string]: boolean }>({});
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const [apiKeys] = useState<ApiKey[]>([
    {
      id: '1',
      name: 'Production API Key',
      key: 'bh_live_sk_a8f7d9e2b4c1f6a3e5d8c2b9a7f4e1d3',
      scope: 'full',
      created: '2025-10-01',
      lastUsed: '2 hours ago',
      requests: 2847321,
      status: 'active',
    },
    {
      id: '2',
      name: 'Mobile App Key',
      key: 'bh_live_pk_c2d4e6f8a1b3c5d7e9f1a3b5c7d9e1f3',
      scope: 'read',
      created: '2025-09-15',
      lastUsed: '5 minutes ago',
      requests: 1532847,
      status: 'active',
    },
    {
      id: '3',
      name: 'Testing Environment',
      key: 'bh_test_sk_f3e1d9c7b5a3f1e9d7c5b3a1f9e7d5c3',
      scope: 'write',
      created: '2025-08-20',
      lastUsed: '1 day ago',
      requests: 45123,
      status: 'active',
    },
    {
      id: '4',
      name: 'Old Integration Key',
      key: 'bh_live_sk_d5c3b1a9f7e5d3c1b9a7f5e3d1c9b7a5',
      scope: 'full',
      created: '2025-06-10',
      lastUsed: '30 days ago',
      requests: 892341,
      status: 'revoked',
    },
  ]);

  const handleCopyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success('API key copied to clipboard');
  };

  const handleToggleVisibility = (id: string) => {
    setShowKey(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleRevokeKey = (name: string) => {
    toast.success(`API key "${name}" has been revoked`);
  };

  const handleRotateKey = (name: string) => {
    toast.success(`New API key generated for "${name}"`);
  };

  const getScopeBadge = (scope: string) => {
    switch (scope) {
      case 'full':
        return <Badge className="bg-electric/20 text-electric">Full Access</Badge>;
      case 'read':
        return <Badge className="bg-bio/20 text-bio">Read Only</Badge>;
      case 'write':
        return <Badge className="bg-neural/20 text-neural">Write Only</Badge>;
    }
  };

  const maskKey = (key: string) => {
    const prefix = key.substring(0, 12);
    const suffix = key.substring(key.length - 4);
    return `${prefix}${'•'.repeat(20)}${suffix}`;
  };

  const activeKeys = apiKeys.filter(k => k.status === 'active').length;
  const totalRequests = apiKeys.reduce((sum, k) => sum + k.requests, 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-electric flex items-center justify-center shadow-lg">
              <Key className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Active API Keys</p>
              <p className="text-2xl font-bold text-ink">{activeKeys}</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-bio flex items-center justify-center shadow-lg">
              <CheckCircle className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Total Requests</p>
              <p className="text-2xl font-bold text-ink">{(totalRequests / 1000000).toFixed(1)}M</p>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl gradient-pulse flex items-center justify-center shadow-lg">
              <RefreshCw className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="tag text-steel">Keys Rotated</p>
              <p className="text-2xl font-bold text-ink">12</p>
              <p className="text-xs text-steel">Last 30 days</p>
            </div>
          </div>
        </div>
      </div>

      {/* Create API Key Dialog */}
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
                <DialogDescription>
                  Generate a new API key for external service integration
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4 py-4">
                <div>
                  <Label>Key Name</Label>
                  <Input placeholder="e.g., Production Integration" className="mt-2" />
                </div>
                
                <div>
                  <Label>Access Scope</Label>
                  <Select defaultValue="read">
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="read">Read Only</SelectItem>
                      <SelectItem value="write">Write Only</SelectItem>
                      <SelectItem value="full">Full Access</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="neo-card bg-pearl p-4">
                  <p className="text-sm text-steel">
                    <strong>Note:</strong> Store this key securely. You won't be able to see it again after creation.
                  </p>
                </div>
              </div>
              
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => {
                  setIsCreateDialogOpen(false);
                  toast.success('API key created successfully');
                }}>
                  Generate Key
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* API Keys Table */}
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
              {apiKeys.map((apiKey) => (
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
                        {showKey[apiKey.id] ? apiKey.key : maskKey(apiKey.key)}
                      </code>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleToggleVisibility(apiKey.id)}
                      >
                        {showKey[apiKey.id] ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyKey(apiKey.key)}
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </TableCell>
                  <TableCell>{getScopeBadge(apiKey.scope)}</TableCell>
                  <TableCell className="text-steel text-sm">{apiKey.created}</TableCell>
                  <TableCell className="text-steel text-sm">{apiKey.lastUsed}</TableCell>
                  <TableCell className="text-ink font-medium">
                    {apiKey.requests.toLocaleString()}
                  </TableCell>
                  <TableCell>
                    {apiKey.status === 'active' ? (
                      <Badge className="bg-bio/20 text-bio">Active</Badge>
                    ) : (
                      <Badge className="bg-steel/20 text-steel">Revoked</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      {apiKey.status === 'active' && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRotateKey(apiKey.name)}
                            title="Rotate key"
                          >
                            <RefreshCw className="w-4 h-4 text-electric" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRevokeKey(apiKey.name)}
                            title="Revoke key"
                          >
                            <Trash2 className="w-4 h-4 text-pulse" />
                          </Button>
                        </>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Security Best Practices */}
      <div className="neo-card bg-white p-6">
        <h3 className="mb-4">Security Best Practices</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="neo-card bg-pearl p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-bio mt-0.5" />
              <div>
                <p className="font-medium text-ink mb-1">Rotate Keys Regularly</p>
                <p className="text-sm text-steel">
                  Rotate API keys every 90 days to maintain security
                </p>
              </div>
            </div>
          </div>

          <div className="neo-card bg-pearl p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-bio mt-0.5" />
              <div>
                <p className="font-medium text-ink mb-1">Use Limited Scopes</p>
                <p className="text-sm text-steel">
                  Grant only the minimum required permissions
                </p>
              </div>
            </div>
          </div>

          <div className="neo-card bg-pearl p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-bio mt-0.5" />
              <div>
                <p className="font-medium text-ink mb-1">Monitor Usage</p>
                <p className="text-sm text-steel">
                  Regularly check API key usage for anomalies
                </p>
              </div>
            </div>
          </div>

          <div className="neo-card bg-pearl p-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-bio mt-0.5" />
              <div>
                <p className="font-medium text-ink mb-1">Revoke Unused Keys</p>
                <p className="text-sm text-steel">
                  Remove API keys that haven't been used in 30+ days
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
