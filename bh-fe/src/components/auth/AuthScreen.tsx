import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Lock, ArrowRight, Info, Loader2, Shield } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { Label } from '../ui/label';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { ApiError } from '../../lib/api/error';
import { fetchGoogleClientConfig, loginWithEmail, loginWithGoogle } from '../../lib/api/auth';
import type { AuthResponse } from '../../lib/api/types';

const GOOGLE_LOGO_SRC = 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';

interface AuthScreenProps {
  onAuth: (response: AuthResponse) => void;
  onBack: () => void;
}

export default function AuthScreen({ onAuth, onBack }: AuthScreenProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const envGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? null;
  const [googleClientId, setGoogleClientId] = useState<string | null>(envGoogleClientId);
  const [googleConfigLoading, setGoogleConfigLoading] = useState(!envGoogleClientId);
  const [googleConfigError, setGoogleConfigError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleInitialized, setGoogleInitialized] = useState(false);
  const [googleButtonRendered, setGoogleButtonRendered] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const timezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const loadGoogleConfig = async () => {
      setGoogleConfigLoading(true);
      try {
        const config = await fetchGoogleClientConfig();
        if (cancelled) {
          return;
        }
        if (config.enabled && config.clientId) {
          setGoogleClientId(config.clientId);
          setGoogleConfigError(null);
        } else if (!envGoogleClientId) {
          setGoogleConfigError('Google Sign-In is not available right now.');
        }
      } catch (err) {
        if (!cancelled && !envGoogleClientId) {
          setGoogleConfigError('Unable to load Google Sign-In configuration.');
        }
        console.error('Failed to load Google Sign-In config', err);
      } finally {
        if (!cancelled) {
          setGoogleConfigLoading(false);
        }
      }
    };

    loadGoogleConfig();

    return () => {
      cancelled = true;
    };
  }, [envGoogleClientId]);

  useEffect(() => {
    if (!googleClientId || googleConfigError) {
      setGoogleReady(false);
      setGoogleInitialized(false);
      setGoogleButtonRendered(false);
      return;
    }

    if (window.google?.accounts?.id) {
      setGoogleReady(true);
      return;
    }

    const scriptId = 'google-identity-services';
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;

    const handleLoad = () => setGoogleReady(true);

    if (existing) {
      existing.addEventListener('load', handleLoad, { once: true });
      return () => existing.removeEventListener('load', handleLoad);
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = handleLoad;
    document.head.appendChild(script);

    return () => {
      script.onload = null;
    };
  }, [googleClientId, googleConfigError]);

  const handleGoogleCredential = useCallback(
    async (response: { credential?: string }) => {
      setLoading(true);
      setError(null);
      if (!response.credential) {
        setLoading(false);
        setError('Google authentication failed. Please try again.');
        return;
      }

      try {
        const result = await loginWithGoogle({
          idToken: response.credential,
          timezone
        });
        onAuth(result);
      } catch (err) {
        if (err instanceof ApiError) {
          setError(err.message);
        } else {
          setError('Unable to authenticate with Google right now.');
        }
      } finally {
        setLoading(false);
      }
    },
    [onAuth, timezone]
  );

  useEffect(() => {
    if (!googleReady || googleInitialized || !googleClientId || !window.google?.accounts?.id) {
      return;
    }

    window.google.accounts.id.initialize({
      client_id: googleClientId,
      callback: handleGoogleCredential,
      ux_mode: 'popup'
    });
    setGoogleInitialized(true);
  }, [googleReady, googleInitialized, googleClientId, handleGoogleCredential]);

  useEffect(() => {
    if (
      !googleInitialized ||
      !window.google?.accounts?.id ||
      !googleButtonRef.current ||
      googleButtonRendered
    ) {
      return;
    }

    window.google.accounts.id.renderButton(googleButtonRef.current, {
      theme: 'outline',
      size: 'large',
      text: 'continue_with',
      shape: 'pill',
      width: 320,
      logo_alignment: 'left'
    });
    setGoogleButtonRendered(true);
  }, [googleInitialized, googleButtonRendered]);

  const handlePromptNotification = useCallback((notification: google.accounts.id.PromptMomentNotification) => {
    if (notification.isNotDisplayed() && notification.getNotDisplayedReason()) {
      console.warn('Google Sign-In not displayed:', notification.getNotDisplayedReason());
    }
    if (notification.isSkippedMoment() && notification.getSkippedReason()) {
      console.warn('Google Sign-In skipped:', notification.getSkippedReason());
    }
  }, []);

  useEffect(() => {
    if (!googleInitialized || !window.google?.accounts?.id) {
      return;
    }

    window.google.accounts.id.prompt(handlePromptNotification);
  }, [googleInitialized, handlePromptNotification]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const response = await loginWithEmail({ email, password });
      onAuth(response);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Something went wrong. Please try again.');
      }
    } finally {
      setLoading(false);
    }
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

          <h2 className="mb-3">Welcome back</h2>
          <p className="text-steel">Sign in to access your performance dashboard</p>
        </div>

        {/* Auth Card */}
        <div className="neo-card p-8 mb-6">
          {error && (
            <div className="mb-6 rounded-xl border border-pulse/30 bg-pulse/5 px-4 py-3 text-sm text-pulse flex items-center gap-3">
              <Info className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          <div className="mb-6 rounded-xl border border-cloud bg-white/70 px-4 py-3 text-sm text-steel flex items-center gap-3">
            <Shield className="w-4 h-4 text-ink" />
            <span>
              BioHax membership is now invitation-only and new member onboarding is paused. Contact your concierge
              partner for account assistance.
            </span>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-8">
            <div className="w-full space-y-2">
              <div
                className={`w-full flex justify-center ${googleButtonRendered ? '' : 'pointer-events-none opacity-0'}`}
                aria-live="polite"
              >
                <div ref={googleButtonRef} />
              </div>
              {!googleButtonRendered && (
                <button
                  type="button"
                  disabled
                  className="w-full flex items-center justify-between gap-4 px-6 py-4 rounded-2xl border-2 border-cloud bg-white font-semibold text-ink shadow-sm opacity-60 cursor-not-allowed"
                >
                  <span className="flex items-center gap-3">
                    <ImageWithFallback
                      src={GOOGLE_LOGO_SRC}
                      alt=""
                      className="w-5 h-5"
                      aria-hidden="true"
                    />
                    Continue with Google
                  </span>
                  <Loader2 className="w-5 h-5 text-steel animate-spin" />
                </button>
              )}
              {googleConfigLoading && (
                <p className="text-sm text-steel text-center">Preparing Google Sign-In…</p>
              )}
              {googleConfigError && (
                <div className="rounded-xl border border-solar/40 bg-solar/5 px-4 py-2 text-sm text-solar">
                  {googleConfigError}
                </div>
              )}
              {!googleConfigLoading && !googleConfigError && !googleClientId && (
                <p className="text-sm text-solar text-center">Google Sign-In is unavailable right now.</p>
              )}
            </div>
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

            <div className="text-right">
              <button type="button" className="text-sm font-semibold text-electric hover:text-electric-bright transition-colors">
                Forgot password?
              </button>
            </div>

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading}
            >
              {loading ? (
                'Loading...'
              ) : (
                <>
                  Sign In
                  <ArrowRight className="w-5 h-5 ml-2" />
                </>
              )}
            </Button>
          </form>
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
