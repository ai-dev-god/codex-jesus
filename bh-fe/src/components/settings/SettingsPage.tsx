import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { Switch } from '../ui/switch';
import { Badge } from '../ui/badge';
import { Shield, Lock, Download, Trash2, Bell, User, CreditCard, CheckCircle2, Zap } from 'lucide-react';
import { Separator } from '../ui/separator';

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

  return (
    <div className="min-h-screen mesh-gradient pt-28 pb-20 px-6">
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
                  <Input defaultValue="Alex" className="h-12" />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input defaultValue="Rivera" className="h-12" />
                </div>
              </div>

              <div className="space-y-2 mb-6">
                <Label>Email</Label>
                <Input type="email" defaultValue="alex.rivera@email.com" className="h-12" />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div className="space-y-2">
                  <Label>Date of Birth</Label>
                  <Input type="date" defaultValue="1989-05-15" className="h-12" />
                </div>
                <div className="space-y-2">
                  <Label>Biological Sex</Label>
                  <Input defaultValue="Male" className="h-12" />
                </div>
              </div>

              <div className="space-y-2 mb-8">
                <Label>Timezone</Label>
                <Input defaultValue="Pacific Time (PT)" className="h-12" />
              </div>

              <Button size="lg">
                Save Changes
              </Button>
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
                  <div className="flex gap-3 mb-3">
                    <Button variant="outline">
                      <Download className="w-5 h-5 mr-2" />
                      Export All Data
                    </Button>
                    <Button variant="outline" className="text-pulse border-pulse/20 hover:bg-pulse/10">
                      <Trash2 className="w-5 h-5 mr-2" />
                      Delete Account
                    </Button>
                  </div>
                  <p className="text-sm text-steel">
                    Download a copy of your data or permanently delete your account and all associated data.
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
