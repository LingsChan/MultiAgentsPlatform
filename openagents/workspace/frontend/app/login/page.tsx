'use client';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { LOCAL_WORKSPACE_AUTH } from '@/lib/auth-redirects';
import { useOpenAgentsAuth } from '@/lib/openagents-auth-context';
import { signInToLocalWorkspace } from '@/lib/workspace-session';
import { useT } from '@/lib/i18n';
import { Button } from '@/components/ui/reui/button';
import { Input } from '@/components/ui/reui/input';
import { ArrowRight } from 'lucide-react';

function Login() {
  const t = useT();
  const { user, idToken, loading, signIn, adoptWorkspaceSession } = useOpenAgentsAuth();
  const params = useSearchParams();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const target = params.get('returnTo') || '/';
  // Only same-origin application paths may be used as the return destination.
  const returnTo = target.startsWith('/') && !target.startsWith('//') && !/[\\\s]/.test(target) && !target.startsWith('/login') ? target : '/';
  useEffect(() => { if (!loading && user && idToken) window.location.replace(returnTo); }, [loading, user, idToken, returnTo]);

  async function submitLocalLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setBusy(true);
    setError('');
    try {
      const session = await signInToLocalWorkspace(String(fields.get('email')), String(fields.get('password')));
      adoptWorkspaceSession(session);
    } catch (error) {
      setError(error instanceof Error ? error.message : t('workspaceGate.loadFailedTitle'));
    } finally {
      setBusy(false);
    }
  }

  if (LOCAL_WORKSPACE_AUTH) {
    return <main className="observatory-login">
      <form method="post" onSubmit={submitLocalLogin} className="observatory-form">
        <header>
          <h1>{t('localLogin.title')}</h1>
        </header>
        <label className="block space-y-2 text-sm font-medium">
          <span>{t('localLogin.email')}</span>
          <Input name="email" type="email" autoComplete="username" maxLength={254} required />
        </label>
        <label className="block space-y-2 text-sm font-medium">
          <span>{t('localLogin.password')}</span>
          <Input name="password" type="password" autoComplete="current-password" required />
        </label>
        <Button type="submit" variant="primary" className="w-full justify-between" disabled={loading || busy || !!user}>
          {busy ? t('auth.signingIn') : t('workspaceGate.logIn')}<ArrowRight size={16} aria-hidden="true"/>
        </Button>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </form>
    </main>;
  }

  return <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background p-8">
    <h1 className="text-xl font-semibold">{t('workspaceGate.signInTitle')}</h1>
    <p className="max-w-md text-center text-sm text-muted-foreground">{t('workspaceGate.signInBody')}</p>
    <Button disabled={loading || busy} onClick={async () => {
      setBusy(true); setError('');
      try { await signIn(); } catch (e) { setError(e instanceof Error ? e.message : t('workspaceGate.loadFailedTitle')); }
      finally { setBusy(false); }
    }}>{t('workspaceGate.logIn')}</Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </main>;
}
export default function LoginPage() { return <Suspense><Login /></Suspense>; }
