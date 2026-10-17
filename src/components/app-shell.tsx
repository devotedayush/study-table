'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { Activity, ArrowUpRight, BookOpen, Check, Cloud, LogOut, PanelsTopLeft } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import { useLearningData } from '@/lib/learning-store'

const navigation = [
  { name: 'Track', href: '/', icon: Activity },
  { name: 'Notes & Flashcards', href: '/notes', icon: BookOpen },
  { name: 'Mocks & Assessments', href: '/mocks', icon: PanelsTopLeft },
]
export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname()
  const router = useRouter()
  const { syncStatus, scopeKey } = useLearningData()
  const authPage = path === '/login' || path === '/signup'
  async function signOut() {
    await fetch('/api/demo-logout', { method: 'POST' })
    await createClient().auth.signOut()
    router.replace('/login'); router.refresh()
  }
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur-xl">
        <div className="mx-auto flex h-20 max-w-[1500px] items-center justify-between gap-4 px-5 sm:px-8 lg:px-12">
          <Link href="/" className="flex min-w-0 shrink-0 items-center gap-3" aria-label="Study Table home">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#183d53] text-white"><BookOpen size={19} strokeWidth={1.6} /></span>
            <span><span className="block text-lg font-semibold tracking-tight">study table<span className="text-[#d77a62]">.</span></span><span className="hidden text-[10px] uppercase sm:block tracking-[.22em] text-muted-foreground">CFA Level I · Your workspace</span></span>
          </Link>
          {!authPage && <nav aria-label="Main navigation" className="hidden h-full items-center gap-2 lg:flex">
            {navigation.map(({ name, href, icon: Icon }) => <Link key={href} href={href} aria-current={path === href ? 'page' : undefined} className={`flex h-full items-center gap-2.5 border-b-2 px-5 text-sm font-medium transition ${path === href ? 'border-[#183d53] text-[#183d53]' : 'border-transparent text-muted-foreground hover:text-foreground'}`}><Icon size={17} strokeWidth={1.7} />{name}</Link>)}
          </nav>}
          <div className="flex items-center gap-4">
            {!authPage && <span className="hidden items-center gap-1.5 text-xs text-muted-foreground xl:flex">{syncStatus === 'Synced' ? <Check size={13} /> : <Cloud size={13} />}{syncStatus}</span>}
            {scopeKey !== 'guest' ? <button onClick={signOut} aria-label="Sign out" className="rounded-full border border-border p-2.5 hover:bg-secondary"><LogOut size={16} /></button> : <Link href={authPage ? '/' : '/login'} className="flex items-center gap-2 text-sm font-medium"><span className="hidden sm:inline">{authPage ? 'Explore workspace' : 'Sign in to sync'}</span><span className="sm:hidden">{authPage ? 'Explore' : 'Sign in'}</span><ArrowUpRight size={14} /></Link>}
          </div>
        </div>
        {!authPage && <nav aria-label="Mobile navigation" className="flex border-t border-border lg:hidden">{navigation.map(({name,href,icon:Icon}) => <Link key={href} href={href} aria-current={path===href?'page':undefined} className={`flex min-h-14 flex-1 items-center justify-center gap-2 border-b-2 px-2 py-3 text-center text-xs font-medium ${path===href?'border-primary text-primary':'border-transparent text-muted-foreground'}`}><Icon size={15}/>{name}</Link>)}</nav>}
      </header>
      <main className="mx-auto max-w-[1500px] px-5 py-8 sm:px-8 lg:px-12 lg:py-11">{children}</main>
      <footer className="mx-auto flex max-w-[1500px] flex-wrap justify-between gap-2 px-5 py-7 text-[11px] text-muted-foreground sm:px-8 lg:px-12"><span>Study Table · A little less admin. More room to learn.</span><span>Independent practice tool. Not affiliated with CFA Institute.</span></footer>
    </div>
  )
}
