import { LOCAL_WORKSPACE_AUTH } from '@/lib/auth-redirects';

export function WorkspaceMark({ size }: { size: number }) {
  if (LOCAL_WORKSPACE_AUTH) return <img src="/observatory/mark.svg" width={size} height={size} alt="" />;
  return <>
    <img src="/logo-black.png" width={size} height={size} alt="" className="dark:hidden" />
    <img src="/logo-white.png" width={size} height={size} alt="" className="hidden dark:block" />
  </>;
}
