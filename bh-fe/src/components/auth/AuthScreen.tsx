import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Mail, Lock, ArrowRight, Info, Loader2 } from 'lucide-react';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import { ImageWithFallback } from '../figma/ImageWithFallback';
import { ApiError } from '../../lib/api/error';
import { fetchGoogleClientConfig, loginWithEmail, loginWithGoogle, registerWithEmail, refreshTokens } from '../../lib/api/auth';
import type { AuthResponse } from '../../lib/api/types';
import { requestWhoopLink } from '../../lib/api/whoop';
import { clearPersistedSession, loadSession, normalizeTokens, persistSession } from '../../lib/auth/session';

const GOOGLE_LOGO_SRC = 'https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg';

interface AuthScreenProps {
  onAuth: (response: AuthResponse) => void;
  onBack: () => void;
}

export default function AuthScreen({ onAuth, onBack }: AuthScreenProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [marketingOptIn, setMarketingOptIn] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const envGoogleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? null;
  const [googleClientId, setGoogleClientId] = useState<string | null>(envGoogleClientId);
  const [googleConfigLoading, setGoogleConfigLoading] = useState(!envGoogleClientId);
  const [googleConfigError, setGoogleConfigError] = useState<string | null>(null);
  const [googleReady, setGoogleReady] = useState(false);
  const [googleInitialized, setGoogleInitialized] = useState(false);
  const [googleButtonRendered, setGoogleButtonRendered] = useState(false);
  const [googlePrompting, setGooglePrompting] = useState(false);
  const [whoopLinking, setWhoopLinking] = useState(false);
  const googleButtonRef = useRef<HTMLDivElement | null>(null);

  const inferredDisplayName = useMemo(() => {
    if (displayName.trim().length > 0) {
      return displayName;
    }

    const prefix = email.includes('@') ? email.split('@')[0] : '';
    return prefix ? prefix.replace(/[^a-zA-Z0-9\s]/g, '') || 'BioHax Member' : 'BioHax Member';
  }, [displayName, email]);

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

  const handleGoogleButtonClick = useCallback(() => {
    if (!googleInitialized || !window.google?.accounts?.id) {
      return;
    }

    setGooglePrompting(true);
    window.google.accounts.id.prompt((notification: google.accounts.id.PromptMomentNotification) => {
      handlePromptNotification(notification);
      setGooglePrompting(false);
    });
  }, [googleInitialized, handlePromptNotification]);

  const googleButtonDisabled =
    googleConfigLoading || !googleClientId || !!googleConfigError || !googleInitialized || loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'signin') {
        const response = await loginWithEmail({ email, password });
        onAuth(response);
        return;
      }

      const response = await registerWithEmail({
        email,
        password,
        displayName: inferredDisplayName,
        timezone,
        acceptedTerms,
        marketingOptIn
      });
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

  const handleWhoopConnect = useCallback(async () => {
    setError(null);
    setWhoopLinking(true);

    try {
      const storedSession = loadSession();
      if (!storedSession) {
        setError('Please sign in first, then connect your Whoop device from the dashboard.');
        return;
      }

      let session = storedSession;
      if (session.tokens.accessTokenExpiresAt <= Date.now()) {
        try {
          const refreshed = await refreshTokens(session.tokens.refreshToken);
          const normalizedTokens = normalizeTokens(refreshed);
          session = {
            ...session,
            tokens: normalizedTokens
          };
          persistSession(session);
        } catch (refreshError) {
          console.warn('Failed to refresh session before Whoop linking', refreshError);
          clearPersistedSession();
          setError('Your session expired. Please sign in again to continue.');
          return;
        }
      }

      const status = await requestWhoopLink(session.tokens.accessToken);
      if (status.linkUrl) {
        window.location.href = status.linkUrl;
        return;
      }

      if (status.linked) {
        setError('Your Whoop account is already linked.');
      } else {
        setError('Whoop linking is not available right now.');
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError('Unable to start Whoop linking. Please try again.');
      }
    } finally {
      setWhoopLinking(false);
    }
  }, [
    setError,
    setWhoopLinking,
    clearPersistedSession,
    loadSession,
    normalizeTokens,
    persistSession,
    refreshTokens,
    requestWhoopLink
  ]);

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
          {error && (
            <div className="mb-6 rounded-xl border border-pulse/30 bg-pulse/5 px-4 py-3 text-sm text-pulse flex items-center gap-3">
              <Info className="w-4 h-4" />
              <span>{error}</span>
            </div>
          )}

          {/* OAuth Buttons */}
          <div className="space-y-3 mb-8">
            <div className="w-full space-y-2">
            <button
              type="button"
                onClick={handleGoogleButtonClick}
                disabled={googleButtonDisabled}
                className="w-full flex items-center justify-between gap-4 px-6 py-4 rounded-2xl border-2 border-cloud bg-white font-semibold text-ink shadow-sm transition-all hover:shadow-md disabled:opacity-60 disabled:cursor-not-allowed"
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
                {googlePrompting ? (
                  <Loader2 className="w-5 h-5 text-steel animate-spin" />
                ) : (
                  <ArrowRight className="w-5 h-5 text-steel" />
                )}
            </button>
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
              <div className="sr-only" aria-hidden="true">
                <div
                  ref={googleButtonRef}
                  className={googleButtonRendered ? '' : 'opacity-0'}
                />
              </div>
            </div>

            <button
              onClick={(e) => {
                e.preventDefault();
                void handleWhoopConnect();
              }}
              type="button"
              disabled={loading || whoopLinking}
              className="w-full flex items-center justify-between gap-3 px-6 py-4 rounded-xl gradient-pulse text-white transition-all font-semibold hover:scale-105 disabled:opacity-50"
            >
              <span className="flex items-center gap-3">
                <Activity className="w-5 h-5" />
                Connect with Whoop
              </span>
              {whoopLinking && <Loader2 className="w-5 h-5 animate-spin" />}
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

            {mode === 'signup' && (
              <>
                <div>
                  <Label htmlFor="displayName" className="text-sm font-semibold text-ink mb-2 block">
                    Display name
                  </Label>
                  <Input
                    id="displayName"
                    type="text"
                    placeholder="Alex Byrne"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                  />
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="acceptedTerms"
                    type="checkbox"
                    checked={acceptedTerms}
                    onChange={(e) => setAcceptedTerms(e.target.checked)}
                    className="w-5 h-5 accent-electric"
                    required
                  />
                  <Label htmlFor="acceptedTerms" className="text-sm text-steel">
                    I agree to the Terms of Service and Privacy Policy.
                  </Label>
                </div>

                <div className="flex items-center gap-3">
                  <input
                    id="marketingOptIn"
                    type="checkbox"
                    checked={marketingOptIn}
                    onChange={(e) => setMarketingOptIn(e.target.checked)}
                    className="w-5 h-5 accent-electric"
                  />
                  <Label htmlFor="marketingOptIn" className="text-sm text-steel">
                    I’d like to receive product updates and optimization tips.
                  </Label>
                </div>
              </>
            )}

            {mode === 'signin' && (
              <div className="text-right">
                <button type="button" className="text-sm font-semibold text-electric hover:text-electric-bright transition-colors">
                  Forgot password?
                </button>
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              size="lg"
              disabled={loading || (mode === 'signup' && !acceptedTerms)}
            >
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
