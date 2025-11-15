import { useState } from 'react';
import { Search, Download, Eye, User, Database, Settings, Shield } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

interface AuditLog {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  resource: string;
  status: 'success' | 'warning' | 'error';
  category: 'auth' | 'data' | 'config' | 'security';
}

export default function AuditLogs() {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');

  const auditLogs: AuditLog[] = [
    {
      id: '1',
      timestamp: '2025-11-15 14:32:15',
      user: 'admin@biohax.com',
      action: 'User Account Modified',
      resource: 'users/12847',
      status: 'success',
      category: 'auth',
    },
    {
      id: '2',
      timestamp: '2025-11-15 14:28:42',
      user: 'superadmin@biohax.com',
      action: 'Configuration Updated',
      resource: 'config/ai_engines',
      status: 'success',
      category: 'config',
    },
    {
      id: '3',
      timestamp: '2025-11-15 14:15:33',
      user: 'system',
      action: 'Failed Login Attempt',
      resource: 'auth/login',
      status: 'error',
      category: 'security',
    },
  ];

  const filteredLogs = auditLogs.filter(log => {
    const matchesSearch = 
      log.user.toLowerCase().includes(searchQuery.toLowerCase()) ||
      log.action.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesCategory = filterCategory === 'all' || log.category === filterCategory;

    return matchesSearch && matchesCategory;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-bio/20 text-bio">Success</Badge>;
      case 'warning':
        return <Badge className="bg-solar/20 text-solar">Warning</Badge>;
      case 'error':
        return <Badge className="bg-pulse/20 text-pulse">Error</Badge>;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'auth':
        return <User className="w-4 h-4" />;
      case 'data':
        return <Database className="w-4 h-4" />;
      case 'config':
        return <Settings className="w-4 h-4" />;
      case 'security':
        return <Shield className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Total Events</p>
          <p className="text-2xl font-bold text-ink">{auditLogs.length}</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Successful</p>
          <p className="text-2xl font-bold text-ink">2</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Warnings</p>
          <p className="text-2xl font-bold text-ink">0</p>
        </div>
        <div className="neo-card bg-white p-4">
          <p className="tag text-steel mb-1">Errors</p>
          <p className="text-2xl font-bold text-ink">1</p>
        </div>
      </div>

      {/* Controls */}
      <div className="neo-card bg-white p-6">
        <div className="flex flex-col lg:flex-row gap-4 items-start lg:items-center justify-between">
          <div className="flex-1 w-full lg:max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-steel" />
              <Input
                placeholder="Search audit logs..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
          
          <div className="flex gap-2 flex-wrap">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="auth">Authentication</SelectItem>
                <SelectItem value="data">Data Operations</SelectItem>
                <SelectItem value="config">Configuration</SelectItem>
                <SelectItem value="security">Security</SelectItem>
              </SelectContent>
            </Select>

            <Button variant="outline">
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="neo-card bg-white overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Timestamp</TableHead>
                <TableHead>User</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Resource</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLogs.map((log) => (
                <TableRow key={log.id}>
                  <TableCell className="text-steel font-mono text-sm">
                    {log.timestamp}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {getCategoryIcon(log.category)}
                      <span className="text-ink">{log.user}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-ink">{log.action}</TableCell>
                  <TableCell className="text-steel font-mono text-sm">{log.resource}</TableCell>
                  <TableCell>{getStatusBadge(log.status)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
