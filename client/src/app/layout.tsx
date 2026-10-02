import type { Metadata } from 'next';
import { ThemeStyles } from '@/theme';
import { AppProviders } from '@/providers/app-providers';
import { AppShell } from '@/components/layout/app-shell';
import { Sidebar } from '@/components/layout/sidebar';
import { copy } from '@/content/copy';
import './globals.css';

export const metadata: Metadata = {
  title: copy.app.name,
  description: copy.app.tagline,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Emitted before first paint so there is no flash of the wrong theme. */}
        <ThemeStyles />
      </head>
      <body>
        <AppProviders>
          <AppShell sidebar={<Sidebar />}>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
