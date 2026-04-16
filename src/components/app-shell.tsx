'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { LayoutDashboard, BookText, PenTool, CheckSquare, Settings, LogOut, ShieldCheck, Layers3, MessageCircleHeart, Sparkles, ChevronRight, FileUp } from 'lucide-react'
import { BabyMaanWidget } from '@/components/baby-maan-widget'
import { SyncBadge } from '@/components/sync-badge'
import { createClient } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'

const navItems = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Syllabus', href: '/syllabus', icon: BookText },
  { name: 'Revisions', href: '/revisions', icon: CheckSquare },
  { name: 'Assessments', href: '/assessments', icon: ShieldCheck },
  { name: 'Flashcards', href: '/flashcards', icon: Layers3 },
  { name: 'Baby Maan', href: '/assistant', icon: MessageCircleHeart },
  { name: 'Notes', href: '/notes', icon: PenTool },
  { name: 'Admin Bank', href: '/admin/question-bank', icon: FileUp },
]

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

  const activeItem =
    navItems.find((item) => item.href === pathname || (item.href !== '/' && pathname.startsWith(item.href))) ?? navItems[0]

  return (
    <aside className="hidden lg:flex w-[284px] shrink-0 flex-col border-r border-pink-100/80 bg-white/78 px-4 py-4 backdrop-blur-2xl">
      <div className="rounded-[1.75rem] border border-pink-100 bg-white/92 px-4 py-4 shadow-[0_18px_40px_-28px_rgba(244,114,182,0.35)]">
        <Link href="/" className="group flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-[1.35rem] border border-pink-100 bg-pink-500 text-white shadow-[0_16px_30px_-14px_rgba(244,114,182,0.7)]">
            <span className="text-[0.65rem] font-bold tracking-[0.3em]">TA</span>
          </div>
          <div className="min-w-0">
            <p className="text-[0.68rem] uppercase tracking-[0.32em] text-pink-400">Tutor AI</p>
            <div className="mt-1 flex items-center gap-2">
              <h1 className="truncate text-[1.02rem] font-semibold tracking-tight text-slate-900">Private study cockpit</h1>
              <Sparkles size={14} className="shrink-0 text-rose-300 transition-transform group-hover:rotate-12" />
            </div>
          </div>
        </Link>

        <div className="mt-4 rounded-2xl border border-pink-100 bg-pink-50/70 px-3 py-2">
          <p className="text-[0.68rem] uppercase tracking-[0.28em] text-pink-400">Current section</p>
          <div className="mt-1 flex items-center justify-between gap-2">
            <p className="truncate text-sm font-medium text-slate-800">{activeItem.name}</p>
            <ChevronRight size={14} className="text-pink-300" />
          </div>
        </div>
      </div>

      <nav className="mt-4 flex flex-1 flex-col gap-1.5">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-2xl px-3.5 py-3 text-sm font-medium transition-all',
                isActive
                  ? 'border border-pink-100 bg-pink-50/80 text-slate-900 shadow-[0_12px_28px_-20px_rgba(244,114,182,0.6)]'
                  : 'text-slate-600 hover:bg-white hover:text-slate-900',
              )}
            >
              <span
                className={cn(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border transition-colors',
                  isActive ? 'border-pink-100 bg-white text-pink-500' : 'border-transparent bg-pink-50/70 text-pink-400 group-hover:bg-white',
                )}
              >
                <Icon size={17} />
              </span>
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              {isActive ? <span className="h-2 w-2 rounded-full bg-pink-400" /> : null}
            </Link>
          )
        })}
      </nav>

      <div className="mt-3 space-y-3 border-t border-pink-100/80 pt-3">
        <div className="rounded-[1.5rem] border border-pink-100 bg-white/90 p-3 shadow-[0_14px_32px_-28px_rgba(244,114,182,0.45)]">
          <p className="text-[0.68rem] uppercase tracking-[0.28em] text-pink-400">Workspace status</p>
          <p className="mt-1 text-sm leading-6 text-slate-600">Login, onboarding, and study state stay private.</p>
          <SyncBadge className="mt-3" />
        </div>

        <div className="grid gap-2">
          <Link
            href="/settings"
            className="flex items-center justify-between rounded-2xl border border-pink-100 bg-white/90 px-3.5 py-3 text-sm font-medium text-slate-600 transition hover:border-pink-200 hover:bg-pink-50/70 hover:text-slate-900"
          >
            <span className="flex items-center gap-3">
              <Settings size={17} className="text-pink-400" />
              Settings
            </span>
            <ChevronRight size={14} className="text-pink-300" />
          </Link>
          <button
            type="button"
            onClick={handleSignOut}
            className="flex items-center justify-between rounded-2xl border border-pink-100 bg-white/90 px-3.5 py-3 text-left text-sm font-medium text-slate-600 transition hover:border-pink-200 hover:bg-pink-50/70 hover:text-slate-900"
          >
            <span className="flex items-center gap-3">
              <LogOut size={17} className="text-pink-400" />
              Sign out
            </span>
            <ChevronRight size={14} className="text-pink-300" />
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
      <div className="min-h-screen bg-[#fff8fb] px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fff8fb]">
      <div className="mx-auto flex min-h-screen max-w-[1600px]">
        <Sidebar />
        <main className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
          <div className="mb-6 lg:hidden">
            <div className="soft-panel rounded-[1.75rem] p-3">
              <div className="flex items-center justify-between gap-3 rounded-[1.35rem] border border-pink-100 bg-white/90 px-3 py-3">
                <Link href="/" className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[1.15rem] border border-pink-100 bg-pink-500 text-white shadow-[0_14px_24px_-14px_rgba(244,114,182,0.7)]">
                    <span className="text-[0.62rem] font-bold tracking-[0.25em]">TA</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[0.65rem] uppercase tracking-[0.3em] text-pink-400">Tutor AI</p>
                    <p className="truncate text-sm font-semibold text-slate-900">Private study cockpit</p>
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
                  className="rounded-full border border-pink-200 bg-pink-50 px-3 py-2 text-xs font-semibold text-pink-500"
                >
                  Sign out
                </button>
              </div>
              <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                {navItems.map((item) => {
                  const Icon = item.icon
                  const isActive = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href))
                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={cn(
                        'flex shrink-0 items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium transition-colors',
                        isActive
                          ? 'border-pink-200 bg-pink-50 text-slate-900'
                          : 'border-pink-100 bg-white text-slate-600 hover:bg-pink-50/70 hover:text-slate-900',
                      )}
                    >
                      <Icon size={14} className={isActive ? 'text-pink-500' : 'text-pink-400'} />
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
