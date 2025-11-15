import { useState } from 'react';
import { 
  Search, 
  Filter, 
  Download, 
  Plus, 
  MoreVertical, 
  Mail, 
  Ban, 
  CheckCircle, 
  Edit,
  Trash2,
  Shield,
  Crown,
  User as UserIcon,
  Save,
  X
} from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '../ui/table';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Switch } from '../ui/switch';
import { Textarea } from '../ui/textarea';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'practitioner' | 'admin' | 'super_admin';
  plan: 'explorer' | 'biohacker' | 'longevity_pro';
  status: 'active' | 'inactive' | 'suspended';
  lastLogin: string;
  biomarkersCount: number;
  protocolsActive: number;
  joinedDate: string;
  phoneNumber?: string;
  location?: string;
}

export default function UserManagement() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterRole, setFilterRole] = useState<string>('all');
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);

  const [users, setUsers] = useState<User[]>([
    {
      id: '1',
      email: 'john.doe@example.com',
      name: 'John Doe',
      role: 'user',
      plan: 'longevity_pro',
      status: 'active',
      lastLogin: '2 hours ago',
      biomarkersCount: 47,
      protocolsActive: 3,
      joinedDate: '2025-08-15',
      phoneNumber: '+1 (555) 123-4567',
      location: 'San Francisco, CA',
    },
    {
      id: '2',
      email: 'dr.smith@clinic.com',
      name: 'Dr. Sarah Smith',
      role: 'practitioner',
      plan: 'longevity_pro',
      status: 'active',
      lastLogin: '1 day ago',
      biomarkersCount: 12,
      protocolsActive: 8,
      joinedDate: '2025-06-20',
      phoneNumber: '+1 (555) 234-5678',
      location: 'New York, NY',
    },
    {
      id: '3',
      email: 'mike.wilson@email.com',
      name: 'Mike Wilson',
      role: 'user',
      plan: 'biohacker',
      status: 'active',
      lastLogin: '5 min ago',
      biomarkersCount: 28,
      protocolsActive: 2,
      joinedDate: '2025-09-10',
      phoneNumber: '+1 (555) 345-6789',
      location: 'Austin, TX',
    },
    {
      id: '4',
      email: 'admin@biohax.com',
      name: 'Admin User',
      role: 'admin',
      plan: 'longevity_pro',
      status: 'active',
      lastLogin: '30 min ago',
      biomarkersCount: 5,
      protocolsActive: 1,
      joinedDate: '2025-01-01',
      phoneNumber: '+1 (555) 456-7890',
      location: 'Remote',
    },
    {
      id: '5',
      email: 'jane.explorer@email.com',
      name: 'Jane Explorer',
      role: 'user',
      plan: 'explorer',
      status: 'active',
      lastLogin: '3 days ago',
      biomarkersCount: 8,
      protocolsActive: 1,
      joinedDate: '2025-10-25',
      location: 'Seattle, WA',
    },
    {
      id: '6',
      email: 'suspended.user@email.com',
      name: 'Suspended User',
      role: 'user',
      plan: 'biohacker',
      status: 'suspended',
      lastLogin: '15 days ago',
      biomarkersCount: 15,
      protocolsActive: 0,
      joinedDate: '2025-07-12',
      location: 'Chicago, IL',
    },
  ]);

  const handleEditUser = (user: User) => {
    setEditingUser({ ...user });
    setIsEditDialogOpen(true);
  };

  const handleSaveUser = () => {
    if (!editingUser) return;
    
    setUsers(users.map(u => u.id === editingUser.id ? editingUser : u));
    setIsEditDialogOpen(false);
    toast.success(`User "${editingUser.name}" updated successfully`);
    setEditingUser(null);
  };

  const handleDeleteUser = (user: User) => {
    setUsers(users.filter(u => u.id !== user.id));
    toast.success(`User "${user.name}" deleted successfully`);
  };

  const handleSuspendUser = (user: User) => {
    setUsers(users.map(u => 
      u.id === user.id 
        ? { ...u, status: u.status === 'suspended' ? 'active' : 'suspended' as 'active' | 'suspended' }
        : u
    ));
    toast.success(`User "${user.name}" ${user.status === 'suspended' ? 'reactivated' : 'suspended'}`);
  };

  const handleCreateUser = () => {
    setIsCreateDialogOpen(false);
    toast.success('New user created successfully');
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      user.email.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesRole = filterRole === 'all' || user.role === filterRole;
    const matchesPlan = filterPlan === 'all' || user.plan === filterPlan;
    const matchesStatus = filterStatus === 'all' || user.status === filterStatus;

    return matchesSearch && matchesRole && matchesPlan && matchesStatus;
  });

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super_admin':
        return <Badge className="bg-pulse/20 text-pulse"><Crown className="w-3 h-3 mr-1" />Super Admin</Badge>;
      case 'admin':
        return <Badge className="bg-neural/20 text-neural"><Shield className="w-3 h-3 mr-1" />Admin</Badge>;
      case 'practitioner':
        return <Badge className="bg-electric/20 text-electric"><Shield className="w-3 h-3 mr-1" />Practitioner</Badge>;
      default:
        return <Badge className="bg-bio/20 text-bio"><UserIcon className="w-3 h-3 mr-1" />User</Badge>;
    }
  };

  const getPlanBadge = (plan: string) => {
    switch (plan) {
      case 'longevity_pro':
        return <Badge className="bg-neural/20 text-neural">Longevity Pro</Badge>;
      case 'biohacker':
        return <Badge className="bg-bio/20 text-bio">Biohacker</Badge>;
      default:
        return <Badge className="bg-steel/20 text-steel">Explorer</Badge>;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-bio/20 text-bio">Active</Badge>;
      case 'suspended':
        return <Badge className="bg-pulse/20 text-pulse">Suspended</Badge>;
      case 'inactive':
        return <Badge className="bg-steel/20 text-steel">Inactive</Badge>;
    }
  };

  const stats = {
    total: users.length,
    active: users.filter(u => u.status === 'active').length,
    suspended: users.filter(u => u.status === 'suspended').length,
    practitioners: users.filter(u => u.role === 'practitioner').length,
    explorer: users.filter(u => u.plan === 'explorer').length,
    biohacker: users.filter(u => u.plan === 'biohacker').length,
    longevityPro: users.filter(u => u.plan === 'longevity_pro').length,
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
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

      {/* Controls */}
      <div className="neo-card bg-white p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
            <div className="flex-1 w-full lg:max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-steel" />
                <Input
                  placeholder="Search by name or email..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                <Plus className="w-4 h-4 mr-2" />
                Add User
              </Button>
              <Button variant="outline">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap">
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Roles</SelectItem>
                <SelectItem value="user">User</SelectItem>
                <SelectItem value="practitioner">Practitioner</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="super_admin">Super Admin</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterPlan} onValueChange={setFilterPlan}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Plan" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Plans</SelectItem>
                <SelectItem value="explorer">Explorer</SelectItem>
                <SelectItem value="biohacker">Biohacker</SelectItem>
                <SelectItem value="longevity_pro">Longevity Pro</SelectItem>
              </SelectContent>
            </Select>

            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
                <SelectItem value="suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Users Table */}
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
              {filteredUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-ink">{user.name}</p>
                      <p className="text-sm text-steel">{user.email}</p>
                    </div>
                  </TableCell>
                  <TableCell>{getRoleBadge(user.role)}</TableCell>
                  <TableCell>{getPlanBadge(user.plan)}</TableCell>
                  <TableCell>{getStatusBadge(user.status)}</TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <p className="text-sm text-ink">{user.biomarkersCount} biomarkers</p>
                      <p className="text-xs text-steel">{user.protocolsActive} protocols</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-steel">{user.lastLogin}</TableCell>
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
                          onClick={() => handleSuspendUser(user)}
                          className={user.status === 'suspended' ? 'text-bio' : 'text-pulse'}
                        >
                          <Ban className="w-4 h-4 mr-2" />
                          {user.status === 'suspended' ? 'Reactivate' : 'Suspend'}
                        </DropdownMenuItem>
                        <DropdownMenuItem 
                          onClick={() => handleDeleteUser(user)}
                          className="text-pulse"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete
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

      {/* Edit User Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="neo-card bg-white max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>
              Update user information, role, plan, and permissions
            </DialogDescription>
          </DialogHeader>

          {editingUser && (
            <div className="space-y-6 py-4">
              {/* Basic Information */}
              <div className="space-y-4">
                <h4 className="font-medium text-ink">Basic Information</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Full Name</Label>
                    <Input
                      value={editingUser.name}
                      onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Email Address</Label>
                    <Input
                      type="email"
                      value={editingUser.email}
                      onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label>Phone Number</Label>
                    <Input
                      value={editingUser.phoneNumber || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, phoneNumber: e.target.value })}
                      className="mt-2"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <Label>Location</Label>
                    <Input
                      value={editingUser.location || ''}
                      onChange={(e) => setEditingUser({ ...editingUser, location: e.target.value })}
                      className="mt-2"
                      placeholder="City, State"
                    />
                  </div>
                </div>
              </div>

              {/* Role & Permissions */}
              <div className="space-y-4">
                <h4 className="font-medium text-ink">Role & Permissions</h4>
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label>User Role</Label>
                    <Select 
                      value={editingUser.role} 
                      onValueChange={(value) => setEditingUser({ ...editingUser, role: value as User['role'] })}
                    >
                      <SelectTrigger className="mt-2">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">
                          <div className="flex items-center gap-2">
                            <UserIcon className="w-4 h-4" />
                            <span>User - Standard access</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="practitioner">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            <span>Practitioner - Manage clients</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="admin">
                          <div className="flex items-center gap-2">
                            <Shield className="w-4 h-4" />
                            <span>Admin - Platform administration</span>
                          </div>
                        </SelectItem>
                        <SelectItem value="super_admin">
                          <div className="flex items-center gap-2">
                            <Crown className="w-4 h-4" />
                            <span>Super Admin - Full control</span>
                          </div>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="neo-card bg-pearl p-4">
                    <p className="text-sm text-steel">
                      <strong>Role Permissions:</strong>{' '}
                      {editingUser.role === 'super_admin' && 'Full platform access, user management, system configuration'}
                      {editingUser.role === 'admin' && 'User management, content moderation, basic system settings'}
                      {editingUser.role === 'practitioner' && 'Client management, protocol creation, workspace access'}
                      {editingUser.role === 'user' && 'Personal dashboard, protocols, biomarker tracking'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Subscription Plan */}
              <div className="space-y-4">
                <h4 className="font-medium text-ink">Subscription Plan</h4>
                <div>
                  <Label>Plan Tier</Label>
                  <Select 
                    value={editingUser.plan} 
                    onValueChange={(value) => setEditingUser({ ...editingUser, plan: value as User['plan'] })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="explorer">
                        <div>
                          <p className="font-medium">Explorer - Free</p>
                          <p className="text-xs text-steel">Basic features, limited biomarkers</p>
                        </div>
                      </SelectItem>
                      <SelectItem value="biohacker">
                        <div>
                          <p className="font-medium">Biohacker - $20/month</p>
                          <p className="text-xs text-steel">Advanced tracking, AI protocols</p>
                        </div>
                      </SelectItem>
                      <SelectItem value="longevity_pro">
                        <div>
                          <p className="font-medium">Longevity Pro - $50/month</p>
                          <p className="text-xs text-steel">Premium tests, practitioner access</p>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div className="neo-card bg-pearl p-3 text-center">
                    <p className="text-xs text-steel mb-1">Biomarkers</p>
                    <p className="font-bold text-ink">
                      {editingUser.plan === 'explorer' ? '10' : editingUser.plan === 'biohacker' ? '50' : 'Unlimited'}
                    </p>
                  </div>
                  <div className="neo-card bg-pearl p-3 text-center">
                    <p className="text-xs text-steel mb-1">AI Protocols</p>
                    <p className="font-bold text-ink">
                      {editingUser.plan === 'explorer' ? '1' : editingUser.plan === 'biohacker' ? '5' : 'Unlimited'}
                    </p>
                  </div>
                  <div className="neo-card bg-pearl p-3 text-center">
                    <p className="text-xs text-steel mb-1">Premium Tests</p>
                    <p className="font-bold text-ink">
                      {editingUser.plan === 'longevity_pro' ? '✓' : '✗'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Account Status */}
              <div className="space-y-4">
                <h4 className="font-medium text-ink">Account Status</h4>
                <div>
                  <Label>Status</Label>
                  <Select 
                    value={editingUser.status} 
                    onValueChange={(value) => setEditingUser({ ...editingUser, status: value as User['status'] })}
                  >
                    <SelectTrigger className="mt-2">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="active">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-bio" />
                          <span>Active - Full access</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="inactive">
                        <div className="flex items-center gap-2">
                          <Ban className="w-4 h-4 text-steel" />
                          <span>Inactive - No recent activity</span>
                        </div>
                      </SelectItem>
                      <SelectItem value="suspended">
                        <div className="flex items-center gap-2">
                          <Ban className="w-4 h-4 text-pulse" />
                          <span>Suspended - Access blocked</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="neo-card bg-pearl p-3">
                    <p className="text-xs text-steel mb-1">Joined Date</p>
                    <p className="text-sm font-medium text-ink">{editingUser.joinedDate}</p>
                  </div>
                  <div className="neo-card bg-pearl p-3">
                    <p className="text-xs text-steel mb-1">Last Login</p>
                    <p className="text-sm font-medium text-ink">{editingUser.lastLogin}</p>
                  </div>
                </div>
              </div>

              {/* User Statistics */}
              <div className="neo-card bg-pearl p-4">
                <h4 className="font-medium text-ink mb-3">Current Activity</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-steel">Biomarkers Tracked</p>
                    <p className="text-xl font-bold text-ink">{editingUser.biomarkersCount}</p>
                  </div>
                  <div>
                    <p className="text-xs text-steel">Active Protocols</p>
                    <p className="text-xl font-bold text-ink">{editingUser.protocolsActive}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </Button>
            <Button onClick={handleSaveUser}>
              <Save className="w-4 h-4 mr-2" />
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create User Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="neo-card bg-white max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Add a new user to the platform
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Full Name</Label>
              <Input placeholder="John Doe" className="mt-2" />
            </div>
            <div>
              <Label>Email Address</Label>
              <Input type="email" placeholder="john@example.com" className="mt-2" />
            </div>
            <div>
              <Label>User Role</Label>
              <Select defaultValue="user">
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="practitioner">Practitioner</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Subscription Plan</Label>
              <Select defaultValue="explorer">
                <SelectTrigger className="mt-2">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="explorer">Explorer (Free)</SelectItem>
                  <SelectItem value="biohacker">Biohacker ($20/mo)</SelectItem>
                  <SelectItem value="longevity_pro">Longevity Pro ($50/mo)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateUser}>
              <Plus className="w-4 h-4 mr-2" />
              Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
