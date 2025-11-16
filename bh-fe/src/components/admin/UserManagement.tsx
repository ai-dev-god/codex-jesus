import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  Download,
  Plus,
  MoreVertical,
  Mail,
  Ban,
  Edit,
  Trash2,
  Shield,
  User as UserIcon,
  Save,
  X,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../lib/auth/AuthContext';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { ApiError } from '../../lib/api/error';
import type { Role, UserStatus } from '../../lib/api/types';
import {
  createAdminUser,
  deleteAdminUser,
  listAdminUsers,
  setAdminUserStatus,
  updateAdminUser,
  type AdminUser,
  type AdminUserPlanTier,
  type CreateAdminUserPayload,
  type UpdateAdminUserPayload
} from '../../lib/api/admin';

import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

const PLAN_BADGES: Record<AdminUserPlanTier, string> = {
  explorer: 'bg-steel/20 text-steel',
  biohacker: 'bg-bio/20 text-bio',
  longevity_pro: 'bg-neural/20 text-neural'
};

const STATUS_BADGES: Record<UserStatus, string> = {
  ACTIVE: 'bg-bio/20 text-bio',
  SUSPENDED: 'bg-pulse/20 text-pulse',
  PENDING_ONBOARDING: 'bg-steel/20 text-steel'
};

const STATUS_LABELS: Record<UserStatus, string> = {
  ACTIVE: 'Active',
  SUSPENDED: 'Suspended',
  PENDING_ONBOARDING: 'Pending'
};

const DEFAULT_CREATE_FORM: CreateAdminUserPayload = {
  email: '',
  fullName: '',
  role: 'MEMBER',
  timezone: 'UTC'
};

const ROLE_LABELS: Record<Role, string> = {
  ADMIN: 'Admin',
  MEMBER: 'Member',
  COACH: 'Coach',
  PRACTITIONER: 'Practitioner',
  MODERATOR: 'Moderator'
};

export default function UserManagement() {
  const { ensureAccessToken, user: authUser } = useAuth();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const [filterRole, setFilterRole] = useState<'all' | Role>('all');
  const [filterPlan, setFilterPlan] = useState<'all' | AdminUserPlanTier>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | UserStatus>('all');

  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<UpdateAdminUserPayload>({});
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  const [createForm, setCreateForm] = useState<CreateAdminUserPayload>(DEFAULT_CREATE_FORM);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const [actionLoading, setActionLoading] = useState(false);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const requestCounterRef = useRef(0);
  const lastRequestKeyRef = useRef<string | null>(null);

  const buildRequestKey = useCallback(
    () =>
      JSON.stringify({
        userId: authUser?.id ?? 'anonymous',
        search: debouncedSearch.trim().toLowerCase(),
        role: filterRole,
        status: filterStatus
      }),
    [authUser?.id, debouncedSearch, filterRole, filterStatus]
  );

  const loadUsers = useCallback(async () => {
    const requestKey = buildRequestKey();
    const requestId = ++requestCounterRef.current;
    setLoading(true);
    setError(null);
    try {
      const token = await ensureAccessToken();
      const response = await listAdminUsers(token, {
        search: debouncedSearch.trim() || undefined,
        role: filterRole === 'all' ? undefined : filterRole,
        status: filterStatus === 'all' ? undefined : filterStatus,
        limit: 50
      });
      if (requestCounterRef.current !== requestId) {
        return;
      }
      setUsers(response.data);
      setHasLoadedOnce(true);
      setLastSyncedAt(new Date());
      lastRequestKeyRef.current = requestKey;
    } catch (err) {
      if (requestCounterRef.current !== requestId) {
        return;
      }
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to load users. Please try again.');
      }
    } finally {
      if (requestCounterRef.current === requestId) {
        setLoading(false);
      }
    }
  }, [ensureAccessToken, debouncedSearch, filterRole, filterStatus, buildRequestKey]);

  useEffect(() => {
    const requestKey = buildRequestKey();
    if (hasLoadedOnce && lastRequestKeyRef.current === requestKey) {
      return;
    }
    void loadUsers();
  }, [buildRequestKey, hasLoadedOnce, loadUsers]);

  const filteredUsers = useMemo(() => {
    return users.filter((user) => filterPlan === 'all' || user.planTier === filterPlan);
  }, [users, filterPlan]);

  const stats = useMemo(() => {
    const total = users.length;
    const active = users.filter((user) => user.status === 'ACTIVE').length;
    const suspended = users.filter((user) => user.status === 'SUSPENDED').length;
    const explorer = users.filter((user) => user.planTier === 'explorer').length;
    const biohacker = users.filter((user) => user.planTier === 'biohacker').length;
    const longevityPro = users.filter((user) => user.planTier === 'longevity_pro').length;

    return { total, active, suspended, explorer, biohacker, longevityPro };
  }, [users]);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filterRole !== 'all') count += 1;
    if (filterPlan !== 'all') count += 1;
    if (filterStatus !== 'all') count += 1;
    if (searchQuery.trim()) count += 1;
    return count;
  }, [filterRole, filterPlan, filterStatus, searchQuery]);

  const lastSyncedLabel = useMemo(() => {
    if (!lastSyncedAt) {
      return 'Awaiting sync';
    }
    const diffSeconds = Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000);
    if (diffSeconds < 5) {
      return 'Just now';
    }
    if (diffSeconds < 60) {
      return `${diffSeconds}s ago`;
    }
    if (diffSeconds < 3600) {
      return `${Math.floor(diffSeconds / 60)}m ago`;
    }
    if (diffSeconds < 86_400) {
      return `${Math.floor(diffSeconds / 3600)}h ago`;
    }
    return `${Math.floor(diffSeconds / 86_400)}d ago`;
  }, [lastSyncedAt]);

  const handleResetFilters = useCallback(() => {
    setSearchQuery('');
    setFilterRole('all');
    setFilterPlan('all');
    setFilterStatus('all');
  }, [setSearchQuery, setFilterRole, setFilterPlan, setFilterStatus]);

  const handleManualRefresh = useCallback(() => {
    void loadUsers();
  }, [loadUsers]);

  const handleEditUser = (user: AdminUser) => {
    setEditingUser(user);
    setEditForm({
      fullName: user.displayName,
      role: user.role,
      status: user.status
    });
    setIsEditDialogOpen(true);
  };

  const refreshUsers = useCallback(async () => {
    await loadUsers();
    setPendingUserId(null);
  }, [loadUsers]);

  const handleSaveUser = async () => {
    if (!editingUser) {
      return;
    }
    if (!editForm.fullName && !editForm.role && !editForm.status) {
      toast.info('Nothing to update.');
      return;
    }
    setActionLoading(true);
    try {
      const token = await ensureAccessToken();
      await updateAdminUser(token, editingUser.id, editForm);
      await refreshUsers();
      toast.success(`Updated ${editingUser.displayName}`);
      setIsEditDialogOpen(false);
      setEditingUser(null);
      setEditForm({});
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to update user.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const handleSuspendToggle = async (user: AdminUser) => {
    setPendingUserId(user.id);
    try {
      const token = await ensureAccessToken();
      const nextStatus: UserStatus = user.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
      await setAdminUserStatus(token, user.id, nextStatus);
      await refreshUsers();
      toast.success(`${user.displayName} is now ${STATUS_LABELS[nextStatus]}`);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to update user status.');
      }
      setPendingUserId(null);
    }
  };

  const handleDeleteUser = async (user: AdminUser) => {
    setPendingUserId(user.id);
    try {
      const token = await ensureAccessToken();
      await deleteAdminUser(token, user.id);
      await refreshUsers();
      toast.success(`${user.displayName} was archived`);
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to archive user.');
      }
      setPendingUserId(null);
    }
  };

  const handleCreateUser = async () => {
    if (!createForm.email || !createForm.fullName) {
      toast.error('Full name and email are required.');
      return;
    }
    setActionLoading(true);
    try {
      const token = await ensureAccessToken();
      const result = await createAdminUser(token, createForm);
      await refreshUsers();
      setIsCreateDialogOpen(false);
      setCreateForm(DEFAULT_CREATE_FORM);
      try {
        await navigator.clipboard.writeText(result.temporaryPassword);
        toast.success('User created. Temporary password copied to clipboard.');
      } catch {
        toast.success(`User created. Temporary password: ${result.temporaryPassword}`);
      }
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message);
      } else {
        toast.error('Failed to create user.');
      }
    } finally {
      setActionLoading(false);
    }
  };

  const getRoleBadge = (role: Role) => {
    switch (role) {
      case 'ADMIN':
        return <Badge className="bg-neural/20 text-neural"><Shield className="w-3 h-3 mr-1" />Admin</Badge>;
      case 'PRACTITIONER':
        return <Badge className="bg-electric/20 text-electric"><Shield className="w-3 h-3 mr-1" />Practitioner</Badge>;
      case 'MODERATOR':
        return <Badge className="bg-electric/20 text-electric"><Shield className="w-3 h-3 mr-1" />Moderator</Badge>;
      case 'COACH':
        return <Badge className="bg-bio/20 text-bio"><UserIcon className="w-3 h-3 mr-1" />Coach</Badge>;
      default:
        return <Badge className="bg-bio/20 text-bio"><UserIcon className="w-3 h-3 mr-1" />Member</Badge>;
    }
  };

  const getPlanBadge = (plan: AdminUserPlanTier) => {
    const className = PLAN_BADGES[plan];
    if (plan === 'longevity_pro') {
      return <Badge className={className}>Longevity Pro</Badge>;
    }
    if (plan === 'biohacker') {
      return <Badge className={className}>Biohacker</Badge>;
    }
    return <Badge className={className}>Explorer</Badge>;
  };

  const getStatusBadge = (status: UserStatus) => (
    <Badge className={STATUS_BADGES[status]}>{STATUS_LABELS[status]}</Badge>
  );

  const formatLastLogin = (lastLoginAt: string | null) => {
    if (!lastLoginAt) {
      return 'No logins';
    }
    return new Date(lastLoginAt).toLocaleString();
  };

  const canResetFilters = activeFilterCount > 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Total Users</p>
          <p className="text-2xl font-bold text-ink">{stats.total}</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Active</p>
          <p className="text-2xl font-bold text-bio">{stats.active}</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Suspended</p>
          <p className="text-2xl font-bold text-pulse">{stats.suspended}</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Explorer</p>
          <p className="text-2xl font-bold text-steel">{stats.explorer}</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Biohacker</p>
          <p className="text-2xl font-bold text-bio">{stats.biohacker}</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Longevity Pro</p>
          <p className="text-2xl font-bold text-neural">{stats.longevityPro}</p>
        </div>
      </div>

      <div className="neo-card bg-white p-6 space-y-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="tag text-steel mb-1">Membership Directory</p>
            <p className="text-2xl font-semibold text-ink">Users & Access Control</p>
            <p className="text-sm text-steel">Search, triage, and govern admin-eligible accounts.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="rounded-xl bg-pearl px-3 py-1 text-xs font-semibold text-steel">
              Last sync <span className="text-ink">{lastSyncedLabel}</span>
            </div>
            <Badge variant="outline" className="rounded-xl border-cloud px-3 py-1 text-steel">
              {activeFilterCount} active {activeFilterCount === 1 ? 'filter' : 'filters'}
            </Badge>
            <Button variant="outline" onClick={handleManualRefresh} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex-1 w-full lg:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-steel" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Add User
            </Button>
            <Button variant="outline" onClick={() => toast.info('Export coming soon')}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          <Select value={filterRole} onValueChange={(value: Role | 'all') => setFilterRole(value)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              {Object.entries(ROLE_LABELS).map(([key, label]) => (
                <SelectItem key={key} value={key}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={filterPlan} onValueChange={(value: AdminUserPlanTier | 'all') => setFilterPlan(value)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Plan" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              <SelectItem value="explorer">Explorer</SelectItem>
              <SelectItem value="biohacker">Biohacker</SelectItem>
              <SelectItem value="longevity_pro">Longevity Pro</SelectItem>
            </SelectContent>
          </Select>

          <Select value={filterStatus} onValueChange={(value: UserStatus | 'all') => setFilterStatus(value)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="ACTIVE">Active</SelectItem>
              <SelectItem value="PENDING_ONBOARDING">Pending</SelectItem>
              <SelectItem value="SUSPENDED">Suspended</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleResetFilters}
            disabled={!canResetFilters}
            className="text-steel hover:text-ink"
          >
            Reset filters
          </Button>
        </div>
        {error && <div className="rounded-xl border border-pulse/30 bg-pulse/5 px-4 py-3 text-sm text-pulse">{error}</div>}
      </div>

      <div className="neo-card bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Activity</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading &&
                Array.from({ length: 4 }).map((_, idx) => (
                  <TableRow key={`loading-${idx}`}>
                    <TableCell>
                      <div className="space-y-2">
                        <div className="h-4 w-40 rounded-lg bg-cloud animate-pulse" />
                        <div className="h-3 w-32 rounded-lg bg-cloud animate-pulse" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-6 w-20 rounded-full bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-6 w-24 rounded-full bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-6 w-24 rounded-full bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <div className="h-3 w-28 rounded-lg bg-cloud animate-pulse" />
                        <div className="h-3 w-20 rounded-lg bg-cloud animate-pulse" />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="h-3 w-24 rounded-lg bg-cloud animate-pulse" />
                    </TableCell>
                    <TableCell>
                      <div className="h-8 w-8 rounded-full bg-cloud animate-pulse" />
                    </TableCell>
                  </TableRow>
                ))}
              {!loading && filteredUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7}>
                    <div className="py-10 flex flex-col items-center text-center space-y-3">
                      <div className="w-12 h-12 rounded-2xl bg-pearl flex items-center justify-center text-steel">
                        <UserIcon className="w-5 h-5" />
                      </div>
                      <p className="font-semibold text-ink">No users match these filters</p>
                      <p className="text-sm text-steel">
                        Try adjusting your filters or invite a new member directly.
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <Button variant="outline" onClick={handleResetFilters} disabled={!canResetFilters}>
                          Reset filters
                        </Button>
                        <Button onClick={() => setIsCreateDialogOpen(true)}>
                          <Plus className="w-4 h-4 mr-2" />
                          Add user
                        </Button>
                      </div>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {!loading &&
                filteredUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-ink">{user.displayName}</p>
                        <p className="text-sm text-steel">{user.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(user.role)}</TableCell>
                    <TableCell>{getPlanBadge(user.planTier)}</TableCell>
                    <TableCell>{getStatusBadge(user.status)}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="text-sm text-ink">{user.biomarkersLogged} biomarkers</p>
                        <p className="text-xs text-steel">{user.protocolsActive} protocols</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-steel">{formatLastLogin(user.lastLoginAt)}</TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm">
                            <MoreVertical className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEditUser(user)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit User
                          </DropdownMenuItem>
                          <DropdownMenuItem>
                            <Mail className="w-4 h-4 mr-2" />
                            Send Email
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void handleSuspendToggle(user)}
                            className={user.status === 'SUSPENDED' ? 'text-bio' : 'text-pulse'}
                            disabled={pendingUserId === user.id}
                          >
                            <Ban className="w-4 h-4 mr-2" />
                            {user.status === 'SUSPENDED' ? 'Reactivate' : 'Suspend'}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => void handleDeleteUser(user)}
                            className="text-pulse"
                            disabled={pendingUserId === user.id}
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Archive
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="neo-card bg-white max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update profile details, role, and status.</DialogDescription>
          </DialogHeader>
          {editingUser && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input
                  value={editForm.fullName ?? editingUser.displayName}
                  onChange={(event) =>
                    setEditForm((prev) => ({
                      ...prev,
                      fullName: event.target.value
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select
                  value={editForm.role ?? editingUser.role}
                  onValueChange={(value: Role) =>
                    setEditForm((prev) => ({
                      ...prev,
                      role: value
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(ROLE_LABELS).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Status</Label>
                <Select
                  value={editForm.status ?? editingUser.status}
                  onValueChange={(value: UserStatus) =>
                    setEditForm((prev) => ({
                      ...prev,
                      status: value
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="PENDING_ONBOARDING">Pending</SelectItem>
                    <SelectItem value="SUSPENDED">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)} disabled={actionLoading}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={() => void handleSaveUser()} disabled={actionLoading}>
              <Save className="w-4 h-4 mr-2" />
              {actionLoading ? 'Saving…' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="neo-card bg-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>Send an invite to a staff member or client.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input
                placeholder="John Doe"
                value={createForm.fullName}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, fullName: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input
                type="email"
                placeholder="john@example.com"
                value={createForm.email}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>User Role</Label>
              <Select
                value={createForm.role}
                onValueChange={(value: Role) => setCreateForm((prev) => ({ ...prev, role: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Timezone</Label>
              <Input
                placeholder="UTC"
                value={createForm.timezone}
                onChange={(event) => setCreateForm((prev) => ({ ...prev, timezone: event.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)} disabled={actionLoading}>
              Cancel
            </Button>
            <Button onClick={() => void handleCreateUser()} disabled={actionLoading}>
              <Plus className="w-4 h-4 mr-2" />
              {actionLoading ? 'Creating…' : 'Create User'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

