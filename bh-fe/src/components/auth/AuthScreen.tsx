import { useState } from 'react';
import { Mail, Lock, Zap, ArrowRight } from 'lucide-react';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ImageWithFallback } from '../figma/ImageWithFallback';

interface AuthScreenProps {
  onAuth: () => void;
  onBack: () => void;
}

export default function AuthScreen({ onAuth, onBack }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setLoading(false);
      onAuth();
    }, 1500);
  };

  const handleOAuthConnect = (provider: 'google' | 'whoop') => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      onAuth();
    }, 1500);
  };

  return (
    <div className="min-h-screen mesh-gradient flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <button 
            onClick={onBack}
            className="inline-flex items-center gap-3 px-6 py-3 rounded-full neo-card mb-8 hover:scale-105 transition-transform"
          >
            <ImageWithFallback 
              src="https://images.unsplash.com/photo-1724525647271-e23385a7e19e?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxiaW9oYWNraW5nJTIwRE5BJTIwaGVsaXglMjBsb2dvfGVufDF8fHx8MTc2MjQzNTEzNnww&ixlib=rb-4.1.0&q=80&w=1080" 
              alt="BioHax Logo" 
              className="w-10 h-10 rounded-xl object-cover"
            />
            <span className="text-2xl font-bold text-ink">BioHax</span>
          </button>

          <h2 className="mb-3">
            {mode === 'signin' ? 'Welcome back' : 'Create account'}
          </h2>
          <p className="text-steel">
            {mode === 'signin' 
              ? 'Sign in to access your performance dashboard' 
              : 'Start your longevity optimization journey'}
          </p>
        </div>

        {/* Auth Card */}
        <div className="neo-card p-8 mb-6">
          {/* OAuth Buttons */}
          <div className="space-y-3 mb-8">
            <button
              onClick={() => handleOAuthConnect('google')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl bg-white hover:bg-pearl border-2 border-cloud transition-all font-semibold text-ink disabled:opacity-50"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Continue with Google
            </button>

            <button
              onClick={() => handleOAuthConnect('whoop')}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 px-6 py-4 rounded-xl gradient-pulse text-white transition-all font-semibold hover:scale-105 disabled:opacity-50"
            >
              <Activity className="w-5 h-5" />
              Connect with Whoop
            </button>
          </div>

          {/* Divider */}
          <div className="relative my-8">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-cloud" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-4 bg-white text-sm text-steel">Or continue with email</span>
            </div>
          </div>

          {/* Email/Password Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-sm font-semibold text-ink mb-2 block">
                Email
              </Label>
              <div className="relative">
                <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-steel" />
                <Input
                  id="email"
                  type="email"
                  placeholder="alex@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="pl-12"
                  required
                />
              </div>
            </div>

            <div>
              <Label htmlFor="password" className="text-sm font-semibold text-ink mb-2 block">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-steel" />
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-12"
                  required
                />
              </div>
            </div>

            {mode === 'signin' && (
              <div className="text-right">
                <button type="button" className="text-sm font-semibold text-electric hover:text-electric-bright transition-colors">
                  Forgot password?
                </button>
              </div>
            )}

            <Button type="submit" className="w-full" size="lg" disabled={loading}>
              {loading ? (
                'Loading...'
              ) : (
                <>
                  {mode === 'signin' ? 'Sign In' : 'Create Account'}
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Toggle Mode */}
        <div className="text-center">
          <p className="text-steel">
            {mode === 'signin' ? "Don't have an account?" : 'Already have an account?'}{' '}
            <button
              onClick={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
              className="font-semibold text-electric hover:text-electric-bright transition-colors"
            >
              {mode === 'signin' ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>

        {/* Privacy Notice */}
        <div className="mt-8 text-center">
          <p className="text-xs text-steel leading-relaxed">
            By continuing, you agree to BioHax's{' '}
            <button className="underline hover:text-ink transition-colors">Terms of Service</button>
            {' '}and{' '}
            <button className="underline hover:text-ink transition-colors">Privacy Policy</button>.
            <br />
            Your data is encrypted and HIPAA/GDPR compliant.
          </p>
        </div>
      </div>
    </div>
  );
}

function Activity({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
