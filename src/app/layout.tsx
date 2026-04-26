import type { Metadata } from 'next'
import { Suspense } from 'react'
import { Cormorant_Garamond, IBM_Plex_Sans } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'
import { AppShell } from '@/components/app-shell'
import { AnalyticsEvents } from '@/components/analytics-events'
import { ThemeProvider } from '@/components/theme-provider'

const bodyFont = IBM_Plex_Sans({ subsets: ['latin'], variable: '--font-body', weight: ['400', '500', '600'] })
const displayFont = Cormorant_Garamond({ subsets: ['latin'], variable: '--font-display', weight: ['500', '600', '700'] })

export const metadata: Metadata = {
  title: 'Tutor AI',
  description: 'Private CFA Level 1 preparation cockpit with a simple sign in and signup flow.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${bodyFont.variable} ${displayFont.variable} antialiased text-foreground min-h-screen bg-background font-sans transition-colors duration-300 overflow-x-hidden`}>
        <ThemeProvider
          attribute="data-theme"
          defaultTheme="pink"
          enableSystem={false}
          disableTransitionOnChange
        >
          <AppShell>{children}</AppShell>
          <Analytics />
          <Suspense fallback={null}>
            <AnalyticsEvents />
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  )
}
