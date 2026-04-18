'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, BookText, PenTool, Settings, LogOut, ShieldCheck, Layers3, Sparkles, ChevronRight, FileUp } from 'lucide-react'
import { BabyMaanWidget } from '@/components/baby-maan-widget'
import { SyncBadge } from '@/components/sync-badge'
import { ThemeToggle } from '@/components/theme-toggle'
import { createClient } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, match: ['/'] as string[] },
  { name: 'Study', href: '/syllabus', icon: BookText, match: ['/syllabus', '/revisions'] },
  { name: 'Assessments', href: '/assessments', icon: ShieldCheck, match: ['/assessments', '/calculator-drills'] },
  { name: 'Flashcards', href: '/flashcards', icon: Layers3, match: ['/flashcards'] },
  { name: 'Notebook', href: '/notes', icon: PenTool, match: ['/notes', '/short-notes'] },
  { name: 'Admin Bank', href: '/admin/question-bank', icon: FileUp, match: ['/admin/question-bank'] },
]

function isNavActive(pathname: string, item: (typeof navItems)[number]) {
  return item.match.some((prefix) => (prefix === '/' ? pathname === '/' : pathname === prefix || pathname.startsWith(`${prefix}/`)))
}

const authRoutes = new Set(['/login', '/signup'])

function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleSignOut() {
    await fetch('/api/demo-logout', { method: 'POST' })
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const activeItem = navItems.find((item) => isNavActive(pathname, item)) ?? navItems[0]

  return (
    <aside className="hidden lg:flex w-[284px] shrink-0 flex-col border-r border-border/80 bg-card/78 px-4 py-4 backdrop-blur-2xl">
      <div className="rounded-[1.75rem] border border-border bg-card/92 px-4 py-4 shadow-[0_18px_40px_-28px_rgba(var(--primary),0.35)]">
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[1.35rem] border border-primary/20 bg-primary text-primary-foreground shadow-[0_16px_30px_-14px_rgba(var(--primary),0.7)]">
            <span className="text-[0.65rem] font-bold tracking-[0.3em]">TA</span>
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] uppercase tracking-[0.32em] text-primary/70">Tutor AI</p>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="truncate text-[1.02rem] font-semibold tracking-tight text-foreground">Private study cockpit</h1>
              <Sparkles size={14} className="shrink-0 text-primary/50 transition-transform group-hover:rotate-12" />
            </div>
          </div>
        </Link>

        <div className="mt-4 rounded-2xl border border-border bg-secondary/70 px-3 py-2">
          <p className="text-[0.68rem] uppercase tracking-[0.28em] text-primary/70">Current section</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-foreground">{activeItem.name}</p>
            <ChevronRight size={14} className="text-primary/40" />
          </div>
        </div>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = isNavActive(pathname, item)
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium transition-all',
                isActive
                  ? 'border border-primary/20 bg-secondary/80 text-foreground shadow-[0_12px_28px_-20px_rgba(var(--primary),0.6)]'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border transition-colors',
                  isActive ? 'border-primary/20 bg-card text-primary' : 'border-transparent bg-secondary/70 text-primary/70 group-hover:bg-card',
                )}
              >
                <Icon size={17} />
              </span>
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {isActive ? <span className="h-2 w-2 rounded-full bg-primary" /> : null}
            </Link>
          )
        })}
      </nav>

      <div className="mt-auto space-y-3 border-t border-border/80 pt-3">
        <ThemeToggle className="mb-4" />

        <div className="rounded-[1.5rem] border border-border bg-card/90 p-3 shadow-[0_14px_32px_-28px_rgba(var(--primary),0.45)]">
          <p className="text-[0.68rem] uppercase tracking-[0.28em] text-primary/70">Workspace status</p>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">Login, onboarding, and study state stay private.</p>
          <SyncBadge className="mt-3" />
        </div>

        <div className="grid gap-2">
          <Link
            href="/settings"
            className="flex items-center justify-between rounded-2xl border border-border bg-card/90 px-3.5 py-3 text-sm font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-secondary/70 hover:text-foreground"
          >
            <span className="flex items-center gap-3">
              <Settings size={17} className="text-primary/70" />
              Settings
            </span>
            <ChevronRight size={14} className="text-primary/30" />
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center justify-between rounded-2xl border border-border bg-card/90 px-3.5 py-3 text-left text-sm font-medium text-muted-foreground transition hover:border-primary/30 hover:bg-secondary/70 hover:text-foreground"
          >
            <span className="flex items-center gap-3">
              <LogOut size={17} className="text-primary/70" />
              Sign out
            </span>
            <ChevronRight size={14} className="text-primary/30" />
          </button>
        </div>
      </div>
    </aside>
  )
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const authMode = authRoutes.has(pathname) || pathname.startsWith('/login') || pathname.startsWith('/signup')

  if (authMode) {
    return (
      <div className="min-h-screen bg-background px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <Sidebar />
        <main className="min-w-0 flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <div className="mb-6 lg:hidden">
            <div className="soft-panel rounded-[1.75rem] p-3">
              <div className="flex items-center justify-between gap-3 rounded-[1.35rem] border border-border bg-card/90 px-3 py-3">
                <Link href="/" className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.15rem] border border-primary/20 bg-primary text-primary-foreground shadow-[0_14px_24px_-14px_rgba(var(--primary),0.7)]">
                    <span className="text-[0.62rem] font-bold tracking-[0.25em]">TA</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] uppercase tracking-[0.3em] text-primary/70">Tutor AI</p>
                    <p className="truncate text-sm font-semibold text-foreground">Private study cockpit</p>
                  </div>
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await fetch('/api/demo-logout', { method: 'POST' })
                    const supabase = createClient()
                    await supabase.auth.signOut()
                    window.location.href = '/login'
                  }}
                  className="rounded-full border border-primary/30 bg-secondary px-3 py-2 text-xs font-semibold text-primary"
                >
                  Sign out
                </button>
              </div>
              <div className="mt-3">
                <ThemeToggle className="mb-3 px-2" />
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = isNavActive(pathname, item)
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors',
                        isActive
                          ? 'border-primary/30 bg-secondary text-foreground'
                          : 'border-border bg-card text-muted-foreground hover:bg-secondary/70 hover:text-foreground',
                      )}
                    >
                      <Icon size={14} className={isActive ? 'text-primary' : 'text-primary/70'} />
                      {item.name}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>
          <div className="mx-auto max-w-[1360px]">{children}</div>
        </main>
      </div>
      {pathname.startsWith('/assistant') ? null : <BabyMaanWidget />}
    </div>
  )
}
