import type { Metadata, Viewport } from 'next';
import { headers } from 'next/headers';
import { Inter } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/sonner';
import { OpenAgentsAuthProvider } from '@/lib/openagents-auth-context';
import { DialogsProvider } from '@/components/ui/dialogs-provider';
import { I18nProvider } from '@/lib/i18n';
import { MaintenanceBanner } from '@/components/maintenance/maintenance-banner';
import { Observatory } from '@/components/layout/observatory';
import { getServerTranslations, resolveLocale } from '@/lib/i18n/server';
import '@/styles/globals.css';

const inter = Inter({ subsets: ['latin'] });

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getServerTranslations();
  return {
    title: localPlatform ? 'MultiAgentsPlatform' : t('metadata.title'),
    description: t('metadata.description'),
    ...(localPlatform ? { icons: { icon: '/observatory/mark.svg', apple: '/observatory/icon-192.png' } } : staticMetadata),
  };
}

const localPlatform = process.env.NEXT_PUBLIC_WORKSPACE_LOCAL_AUTH === '1';
const staticMetadata: Metadata = {
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
  manifest: '/site.webmanifest',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Resolved per request from the persisted cookie, then `Accept-Language`,
  // then the edge geo header. Doing it here — rather than detecting in the
  // browser — means the first paint is already in the right language and SSR
  // and hydration agree on the markup.
  const { locale, hasStoredLocale } = await resolveLocale();
  const native = localPlatform && /\bElectron\//.test((await headers()).get('user-agent') || '');

  return (
    <html lang={locale} data-platform={localPlatform ? 'observatory' : undefined} data-native={native || undefined} suppressHydrationWarning>
      <head />
      {/* `suppressHydrationWarning` here is for the browser, not for us:
          extensions routinely stamp attributes onto <body> (cz-shortcut-listen,
          grammarly-*, …) before React hydrates, and each one raises a mismatch
          that buries real warnings. Scoped to this element — children still
          report normally. */}
      <body
        className={`${inter.className} ${localPlatform ? 'platform-body' : 'bg-zinc-100 dark:bg-zinc-900'}`}
        suppressHydrationWarning
      >
        <ThemeProvider attribute="class" defaultTheme={localPlatform ? 'dark' : 'system'} enableSystem disableTransitionOnChange>
          <I18nProvider initialLocale={locale} hasStoredLocale={hasStoredLocale}>
            {localPlatform && <Observatory />}
            <MaintenanceBanner />
            {/* Legacy email/password AuthProvider was removed in v1.0 —
                Firebase (OpenAgentsAuthProvider) is the sole identity path. */}
            <OpenAgentsAuthProvider>
              <DialogsProvider>
                {children}
              </DialogsProvider>
            </OpenAgentsAuthProvider>
            <Toaster />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
