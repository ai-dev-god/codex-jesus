import { Settings, Mail, Zap, DollarSign } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { Button } from '../ui/button';

export default function ApplicationConfig() {
  return (
    <div className="space-y-6">
      <Tabs defaultValue="general" className="space-y-6">
        <TabsList className="neo-card bg-white p-2">
          <TabsTrigger value="general">
            <Settings className="w-4 h-4 mr-2" />
            General
          </TabsTrigger>
          <TabsTrigger value="email">
            <Mail className="w-4 h-4 mr-2" />
            Email
          </TabsTrigger>
          <TabsTrigger value="ai">
            <Zap className="w-4 h-4 mr-2" />
            AI Engines
          </TabsTrigger>
          <TabsTrigger value="payment">
            <DollarSign className="w-4 h-4 mr-2" />
            Payment
          </TabsTrigger>
        </TabsList>

        {/* General Settings */}
        <TabsContent value="general" className="space-y-6">
          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Application Settings</h3>
            <div className="space-y-4">
              <div>
                <Label>Application Name</Label>
                <Input defaultValue="BioHax - Human Performance OS" className="mt-2" />
              </div>
              <div>
                <Label>Application URL</Label>
                <Input defaultValue="https://app.biohax.com" className="mt-2" />
              </div>
              <div>
                <Label>Default Language</Label>
                <Select defaultValue="en">
                  <SelectTrigger className="mt-2">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="en">English</SelectItem>
                    <SelectItem value="ro">Romanian</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="neo-card bg-pearl p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink">Maintenance Mode</p>
                  <p className="text-sm text-steel">Disable public access</p>
                </div>
                <Switch />
              </div>
              <div className="neo-card bg-pearl p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-ink">User Registration</p>
                  <p className="text-sm text-steel">Allow new signups</p>
                </div>
                <Switch defaultChecked />
              </div>
            </div>
          </div>
        </TabsContent>

        {/* AI Engines */}
        <TabsContent value="ai" className="space-y-6">
          <div className="neo-card bg-white p-6">
            <h3 className="mb-1">OpenChat 5 (OpenRouter)</h3>
            <p className="text-sm text-steel mb-4">Primary creative engine routed through the shared OpenRouter credential.</p>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>OpenRouter Endpoint</Label>
                <Input defaultValue="https://openrouter.ai/api/v1" className="mt-2" />
              </div>
              <div>
                <Label>Model ID</Label>
                <Input defaultValue="openrouter/openchat/openchat-5" className="mt-2" />
              </div>
              <div>
                <Label>API Key (GOOGLE_APPLICATION_CREDENTIALS)</Label>
                <Input type="password" placeholder="••••••••••••••••" className="mt-2" />
              </div>
              <div>
                <Label>Routing weight</Label>
                <Input defaultValue="60%" className="mt-2" />
              </div>
            </div>
            <div className="neo-card bg-pearl p-4 flex items-center justify-between mt-4">
              <div>
                <p className="font-medium text-ink">Enable OpenChat 5</p>
                <p className="text-sm text-steel">Primary dual-engine channel</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>

          <div className="neo-card bg-white p-6">
            <h3 className="mb-1">Gemini 2.5 Pro (OpenRouter)</h3>
            <p className="text-sm text-steel mb-4">Secondary reasoning engine for numeric and safety workloads.</p>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <Label>Model ID</Label>
                <Input defaultValue="openrouter/google/gemini-2.5-pro" className="mt-2" />
              </div>
              <div>
                <Label>Routing weight</Label>
                <Input defaultValue="40%" className="mt-2" />
              </div>
              <div className="md:col-span-2">
                <Label>Shared OpenRouter Key</Label>
                <Input type="password" placeholder="Managed via secrets" disabled className="mt-2 cursor-not-allowed" />
              </div>
            </div>
            <div className="neo-card bg-pearl p-4 flex items-center justify-between mt-4">
              <div>
                <p className="font-medium text-ink">Enable Gemini 2.5 Pro</p>
                <p className="text-sm text-steel">Secondary verification channel</p>
              </div>
              <Switch defaultChecked />
            </div>
          </div>

          <div className="neo-card bg-cloud p-6 border border-dashed border-steel/30 text-steel">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="mb-1 text-steel">OpenBioLLM (Legacy)</h3>
                <p className="text-sm">
                  Legacy biomedical model is greyed out while dual-engine traffic is handled exclusively by OpenChat 5 and Gemini 2.5 Pro.
                </p>
              </div>
              <Switch checked={false} disabled className="opacity-50" />
            </div>
          </div>
        </TabsContent>

        <TabsContent value="email">
          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Email Configuration</h3>
            <div className="space-y-4">
              <div>
                <Label>SMTP Host</Label>
                <Input defaultValue="smtp.sendgrid.net" className="mt-2" />
              </div>
              <div>
                <Label>From Email</Label>
                <Input defaultValue="noreply@biohax.com" className="mt-2" />
              </div>
              <Button className="w-full mt-4">Send Test Email</Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="payment">
          <div className="neo-card bg-white p-6">
            <h3 className="mb-4">Stripe Configuration</h3>
            <div className="space-y-4">
              <div>
                <Label>Publishable Key</Label>
                <Input placeholder="pk_live_..." className="mt-2" />
              </div>
              <div>
                <Label>Secret Key</Label>
                <Input type="password" placeholder="sk_live_..." className="mt-2" />
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
