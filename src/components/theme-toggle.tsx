'use client'

import * as React from 'react'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'
import { Palette } from 'lucide-react'

const themes = [
  { name: 'pink', label: 'Pink', color: 'bg-pink-500' },
  { name: 'neutral', label: 'Neutral', color: 'bg-slate-500' },
  { name: 'white', label: 'White', color: 'bg-white border-slate-200' },
  { name: 'black', label: 'Black', color: 'bg-gradient-to-b from-slate-900 to-black border-slate-500' },
]

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // Prevent hydration mismatch
  React.useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center gap-2 px-1">
        <Palette size={14} className="text-primary/70" />
        <p className="text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-primary/70">Theme</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {themes.map((t) => (
          <button
            key={t.name}
            onClick={() => setTheme(t.name)}
            title={t.label}
            className={cn(
              'group relative flex h-11 items-center justify-center rounded-xl border transition-all duration-200',
              theme === t.name
                ? 'border-primary bg-primary/10 shadow-sm ring-2 ring-primary/20'
                : 'border-border bg-card/70 hover:border-primary/50 hover:bg-card/90'
            )}
          >
            <div
              className={cn(
                'h-5 w-5 rounded-full border shadow-sm transition-transform duration-200 group-hover:scale-110',
                t.color,
                theme === t.name && 'scale-110 ring-2 ring-white/50'
              )}
            />
            {theme === t.name && (
              <span className="absolute -top-1 -right-1 flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-primary"></span>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
