'use client';

import { getApiBaseUrl } from '@/lib/api-base';

import { use, Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { WorkspaceProvider, useWorkspace } from '@/lib/workspace-context';
import { LayoutProvider } from '@/components/layout/layout-context';
import { Wrapper } from '@/components/layout/wrapper';
import { WorkspaceLoadingScreen } from '@/components/layout/workspace-loading-screen';
import { useOpenAgentsAuth } from '@/lib/openagents-auth-context';
import { goToCentralLogin, LOCAL_WORKSPACE_AUTH, redirectToLogin } from '@/lib/auth-redirects';
import { LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from '@/components/ui/empty';
import { useT } from '@/lib/i18n';
import { recallWorkspaceToken, rememberWorkspaceToken } from '@/lib/workspace-snapshot';


// Share the cookie across openagents.org subdomains, but fall back to a
// host-only cookie anywhere else. A browser silently drops a cookie whose
// Domain attribute it is not a member of, so hardcoding the attribute means no
// cookie at all on a self-hosted deployment.
function workspaceCookieDomain(hostname: string): string {
  return hostname === 'openagents.org' || hostname.endsWith('.openagents.org')
    ? ';domain=.openagents.org'
    : '';
}

function setWorkspaceCookie(slug: string, token: string) {
  if (LOCAL_WORKSPACE_AUTH) return;
  const maxAge = 30 * 24 * 60 * 60;
  const domain = workspaceCookieDomain(window.location.hostname);
  const shared = `path=/;max-age=${maxAge};secure;samesite=lax${domain}`;
  document.cookie = `oa_workspace=${encodeURIComponent(JSON.stringify({ slug, token }))};${shared}`;
  document.cookie = `oa_has_workspace=1;${shared}`;
}

function IdentityGate({ children }: { children: React.ReactNode }) {
  const { currentUser, setUserName } = useWorkspace();
  const t = useT();

  useEffect(() => {
    if (!currentUser.name.trim()) {
      setUserName(t('workspaceGate.guest'));
    }
  }, [currentUser.name, setUserName, t]);

  return <>{children}</>;
}

/**
 * Open a workspace by id/slug with no token in the URL: look the workspace token
 * up from the signed-in user's account (Membership Home data) and use it, plus
 * the bearer. Falls back to bearer-only if the token can't be resolved.
 */
type BearerState =
  | { kind: 'loading' }
  | { kind: 'ok'; token: string }
  | { kind: 'not_found' }
  | { kind: 'no_access' }
  | { kind: 'error' };

function BearerWorkspace({ workspaceId, idToken }: { workspaceId: string; idToken: string }) {
  const t = useT();
  // A token this page already resolved opens the workspace straight away; the
  // lookup below still runs and only replaces it if the account says otherwise.
  const [state, setState] = useState<BearerState>(() => {
    const known = recallWorkspaceToken(workspaceId, idToken);
    return known !== null ? { kind: 'ok', token: known } : { kind: 'loading' };
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const known = recallWorkspaceToken(workspaceId, idToken);
    // A previous lookup may have left this mounted gate loading under another
    // credential. Restore the cached state as well as the cached token.
    setState(known === null ? { kind: 'loading' } : { kind: 'ok', token: known });
    (async () => {
      try {
        const { listAccountWorkspaces } = await import('@/lib/account-api');
        const wss = await listAccountWorkspaces(idToken, AbortSignal.timeout(15_000));
        if (cancelled) return;
        const match = wss.find((w) => w.slug === workspaceId || w.workspaceId === workspaceId);
        if (match) {
          // The account lookup refreshes verified profile defaults. A shell
          // restored from a cached token may already have read an older roster.
          window.dispatchEvent(new Event('workspace-profile-updated'));
          setWorkspaceCookie(match.slug || workspaceId, match.token || '');
          rememberWorkspaceToken(workspaceId, idToken, match.token || '');
          const token = match.token || '';
          setState((previous) => previous.kind === 'ok' && previous.token === token
            ? previous : { kind: 'ok', token });
          return;
        }
        // Not one of the user's workspaces. Previously we rendered the full
        // workspace shell with an empty token — every API call then failed
        // silently and a nonexistent slug looked like a working (empty)
        // workspace. Probe existence so a typo'd link and a membership gap
        // get distinct, explicit error screens instead.
        const apiUrl = getApiBaseUrl();
        const res = await fetch(`${apiUrl}/v1/workspaces/${encodeURIComponent(workspaceId)}`, { cache: 'no-store', signal: AbortSignal.timeout(8_000) });
        if (cancelled) return;
        setState(res.status === 404 ? { kind: 'not_found' } : { kind: 'no_access' });
      } catch {
        // Already open on a known token: a failed re-check is not worth
        // tearing the workspace down for.
        if (!cancelled && known === null) setState({ kind: 'error' });
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, idToken, attempt]);

  if (state.kind === 'loading') return <WorkspaceLoadingScreen />;

  if (state.kind === 'ok') {
    return (
      <WorkspaceProvider workspaceId={workspaceId} token={state.token} bearerToken={idToken}>
        <IdentityGate>
          <LayoutProvider>
            <Wrapper />
          </LayoutProvider>
        </IdentityGate>
      </WorkspaceProvider>
    );
  }

  const title =
    state.kind === 'not_found' ? t('workspaceGate.notFoundTitle')
    : state.kind === 'no_access' ? t('workspaceGate.noAccessTitle')
    : t('workspaceGate.loadFailedTitle');
  const body =
    state.kind === 'not_found' ? t('workspaceGate.notFoundBody')
    : state.kind === 'no_access' ? t('workspaceGate.noAccessBody')
    : t('workspaceGate.loadFailedBody');

  return (
    <Empty className="min-h-screen rounded-none bg-background">
      <EmptyHeader>
        <EmptyTitle className="text-xl font-semibold">{title}</EmptyTitle>
        <EmptyDescription>{body}</EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="flex-row justify-center gap-2">
        {state.kind === 'error' && (
          <Button variant="outline" onClick={() => setAttempt((a) => a + 1)}>
            {t('common.retry')}
          </Button>
        )}
        <Button asChild>
          <a href="/">{t('workspaceGate.goHome')}</a>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

function WorkspaceContent({ workspaceId }: { workspaceId: string }) {
  const t = useT();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const { user, idToken, loading: authLoading, isOpenAgentsDomain, signIn } = useOpenAgentsAuth();

  useEffect(() => {
    if (token) {
      setWorkspaceCookie(workspaceId, token);
    }
  }, [workspaceId, token]);

  // "Add this workspace to my account": a signed-in user who opened a shared
  // ?token= link is persisted as a member so it shows on their Membership Home.
  useEffect(() => {
    if (token && idToken) {
      import('@/lib/account-api').then(({ joinWorkspaceSelf }) =>
        joinWorkspaceSelf(workspaceId, idToken, token),
      );
    }
  }, [workspaceId, token, idToken]);

  useEffect(() => {
    if (!authLoading && isOpenAgentsDomain && (!user || !idToken)) redirectToLogin();
  }, [authLoading, isOpenAgentsDomain, user, idToken]);

  // Wait for the person's identity before ever configuring a token-only client.
  if (authLoading || (isOpenAgentsDomain && (!user || !idToken))) return <WorkspaceLoadingScreen />;

  // Has workspace token in URL — use it directly
  if (token) {
    return (
      <WorkspaceProvider workspaceId={workspaceId} token={token} bearerToken={idToken || undefined}>
        <IdentityGate>
          <LayoutProvider>
            <Wrapper />
          </LayoutProvider>
        </IdentityGate>
      </WorkspaceProvider>
    );
  }

  // No token — check if user is logged in via OpenAgents
  if (isOpenAgentsDomain) {
    if (authLoading) {
      return <WorkspaceLoadingScreen />;
    }

    if (user && idToken) {
      // Logged in, no ?token in the URL — resolve the workspace token from the
      // account service using the user's identity, so the URL stays clean
      // (/{slug}) while realtime (SSE, which needs a token) still works.
      return <BearerWorkspace workspaceId={workspaceId} idToken={idToken} />;
    }

    // Not logged in — show login prompt
    return (
      <Empty className="min-h-screen rounded-none bg-background">
        <EmptyHeader>
          <EmptyTitle className="text-xl font-semibold">{t('workspaceGate.signInTitle')}</EmptyTitle>
          <EmptyDescription>{t('workspaceGate.signInBody')}</EmptyDescription>
        </EmptyHeader>
        {/* Redirects to the central login page (openagents.org/login), which
            offers all supported methods — not just Google — so the label/icon
            stay method-neutral. */}
        <EmptyContent>
          <Button size="lg" onClick={() => goToCentralLogin(signIn)}>
            <LogIn data-icon="inline-start" />
            {t('workspaceGate.logIn')}
          </Button>
        </EmptyContent>
      </Empty>
    );
  }

  // Not on OpenAgents domain and no token — show token instructions
  return (
    <Empty className="min-h-screen rounded-none bg-background">
      <EmptyHeader>
        <EmptyTitle className="text-xl font-semibold text-destructive">{t('workspaceGate.missingToken')}</EmptyTitle>
        <EmptyDescription>
          {t('workspaceGate.missingTokenBefore')}{' '}
          <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs text-foreground">?token=your_workspace_token</code>{' '}
          {t('workspaceGate.missingTokenAfter')}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export default function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = use(params);

  return (
    <Suspense fallback={<WorkspaceLoadingScreen />}>
      <WorkspaceContent workspaceId={workspaceId} />
    </Suspense>
  );
}
