'use client';
 // v1.1 M2
import { useT } from '@/lib/i18n';
import { WorkspaceMark } from '@/components/layout/workspace-mark';
import { LOCAL_WORKSPACE_AUTH } from '@/lib/auth-redirects';

export function WorkspaceLoadingScreen() {
  const t = useT();

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-5">
        <WorkspaceMark size={60} />
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-tight">{LOCAL_WORKSPACE_AUTH ? 'MultiAgentsPlatform' : 'OpenAgents'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{t('nav.workspaceFallback')}</p>
        </div>
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted overflow-hidden">
        <div className="h-full w-1/3 bg-primary rounded-full animate-[loading-bar_1.5s_ease-in-out_infinite]" />
      </div>
      <style>{`
        @keyframes loading-bar {
          0% { transform: translateX(-100%); }
          50% { transform: translateX(150%); }
          100% { transform: translateX(400%); }
        }
      `}</style>
    </div>
  );
}
