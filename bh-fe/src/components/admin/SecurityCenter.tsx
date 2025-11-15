import { useState } from 'react';
import { Shield, AlertTriangle, Lock, Key, CheckCircle, Ban, Globe, Server } from 'lucide-react';
import { Button } from '../ui/button';
import { Badge } from '../ui/badge';
import { Switch } from '../ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

export default function SecurityCenter() {
  const [autoBlockEnabled, setAutoBlockEnabled] = useState(true);
  const [twoFactorRequired, setTwoFactorRequired] = useState(true);

  const securityScore = 87;

  const blockedIPs = [
    { ip: '45.142.212.61', reason: 'Brute force attack', attempts: 127 },
    { ip: '203.0.113.87', reason: 'Suspicious activity', attempts: 45 },
    { ip: '198.51.100.23', reason: 'SQL injection attempt', attempts: 12 },
  ];

  return (
    <div className="space-y-6">
      {/* Security Score */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="neo-card bg-white p-6 lg:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-6 h-6 text-electric" />
            <h3>Security Health Score</h3>
          </div>
          
          <div className="flex items-center gap-6">
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
            
            <div className="flex-1 space-y-3">
              <div className="neo-card bg-pearl p-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-bio" />
                <span className="text-sm text-ink">SSL/TLS Encryption Active</span>
              </div>
              <div className="neo-card bg-pearl p-3 flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-bio" />
                <span className="text-sm text-ink">Firewall Protection Active</span>
              </div>
              <div className="neo-card bg-pearl p-3 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-solar" />
                <span className="text-sm text-ink">Password Policy Needs Review</span>
              </div>
            </div>
          </div>
        </div>

        <div className="neo-card bg-white p-6">
          <h3 className="mb-4">Quick Actions</h3>
          <div className="space-y-3">
            <Button className="w-full">
              <Shield className="w-4 h-4 mr-2" />
              Run Security Scan
            </Button>
            <Button variant="outline" className="w-full">
              <Lock className="w-4 h-4 mr-2" />
              Update Firewall Rules
            </Button>
            <Button variant="outline" className="w-full">
              <Key className="w-4 h-4 mr-2" />
              Rotate API Keys
            </Button>
          </div>
        </div>
      </div>

      {/* Security Settings */}
      <div className="neo-card bg-white p-6">
        <h3 className="mb-4">Security Settings</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">Auto-Block Suspicious IPs</p>
              <p className="text-sm text-steel">Automatically block suspicious activity</p>
            </div>
            <Switch checked={autoBlockEnabled} onCheckedChange={setAutoBlockEnabled} />
          </div>
          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">Require 2FA for Admins</p>
              <p className="text-sm text-steel">Mandatory two-factor authentication</p>
            </div>
            <Switch checked={twoFactorRequired} onCheckedChange={setTwoFactorRequired} />
          </div>
          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">HIPAA Audit Logging</p>
              <p className="text-sm text-steel">Comprehensive audit trail</p>
            </div>
            <Switch defaultChecked />
          </div>
          <div className="neo-card bg-pearl p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-ink">Data Encryption at Rest</p>
              <p className="text-sm text-steel">AES-256 encryption</p>
            </div>
            <Switch defaultChecked />
          </div>
        </div>
      </div>

      {/* Active Threats */}
      <div className="neo-card bg-white p-6">
        <div className="flex items-center justify-between mb-4">
          <h3>Active Security Threats</h3>
          <Badge className="bg-pulse/20 text-pulse">1 Active</Badge>
        </div>
        
        <div className="neo-card bg-pearl p-4">
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-solar" />
              <div>
                <p className="font-medium text-ink">High API Latency Detected</p>
                <p className="text-sm text-steel">2 hours ago</p>
              </div>
            </div>
            <Badge className="bg-solar/20 text-solar">Investigating</Badge>
          </div>
          <p className="text-sm text-steel">Response times increased to 350ms. Monitoring situation.</p>
        </div>
      </div>

      {/* Blocked IPs */}
      <div className="neo-card bg-white overflow-hidden">
        <div className="p-6 pb-0">
          <h3 className="mb-4">Blocked IP Addresses</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>IP Address</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Attempts</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {blockedIPs.map((item, idx) => (
                <TableRow key={idx}>
                  <TableCell className="font-mono text-ink">{item.ip}</TableCell>
                  <TableCell className="text-steel">{item.reason}</TableCell>
                  <TableCell className="text-pulse font-bold">{item.attempts}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="text-bio">
                      <Ban className="w-4 h-4 mr-1" />
                      Unblock
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
