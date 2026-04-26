'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { LucideIcon } from 'lucide-react'
import { ShieldCheck, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils'

type Tab = { name: string; href: string; icon: LucideIcon; blurb: string }

const practiceTabs: Tab[] = [
  { name: 'Assessments', href: '/assessments', icon: ShieldCheck, blurb: 'Graded quizzes and readiness' },
  { name: 'Calculator drills', href: '/calculator-drills', icon: Calculator, blurb: 'BA II Plus speed reps' },
]

function TabStrip({ tabs, label }: { tabs: Tab[]; label: string }) {
  const pathname = usePathname()
  const active = tabs.find((tab) => pathname === tab.href || pathname.startsWith(`${tab.href}/`))

  return (
    <div className="soft-panel rounded-[1.75rem] p-3">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="px-2 md:px-3">
          <p className="text-[0.65rem] uppercase tracking-[0.28em] text-pink-400">{label}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">{active?.blurb ?? tabs[0].blurb}</p>
        </div>
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = active?.href === tab.href
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-semibold transition-colors',
                  isActive
                    ? 'border-border bg-secondary text-foreground shadow-[0_10px_24px_-18px_rgba(244,114,182,0.55)]'
                    : 'border-border bg-card text-muted-foreground hover:border-border hover:bg-secondary/70 hover:text-foreground',
                )}
              >
                <Icon size={14} className={isActive ? 'text-primary' : 'text-pink-400'} />
                {tab.name}
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export function PracticeHubTabs() {
  return <TabStrip tabs={practiceTabs} label="Practice hub" />
}
