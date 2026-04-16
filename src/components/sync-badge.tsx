'use client'

import { useEffect, useState } from 'react'
import { Cloud, CloudOff, LoaderCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import { cn } from '@/lib/utils'

type SyncBadgeProps = {
  className?: string
}

export function SyncBadge({ className }: SyncBadgeProps) {
  const [state, setState] = useState<'checking' | 'cloud' | 'local'>('checking')

  useEffect(() => {
    let active = true
    const supabase = createClient()

    async function hydrate() {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!active) {
        return
      }

      setState(user ? 'cloud' : 'local')
    }

    hydrate()

    return () => {
      active = false
    }
  }, [])

  if (state === 'checking') {
    return (
      <span className={cn('inline-flex items-center gap-2 rounded-full border border-pink-100 bg-white px-3 py-1 text-xs font-semibold text-slate-500', className)}>
        <LoaderCircle size={14} className="animate-spin text-pink-400" />
        Checking sync
      </span>
    )
  }

  if (state === 'cloud') {
    return (
      <span className={cn('inline-flex items-center gap-2 rounded-full border border-[#d9eef5] bg-[#eef8fb] px-3 py-1 text-xs font-semibold text-slate-700', className)}>
        <Cloud size={14} />
        Cloud synced
      </span>
    )
  }

  return (
    <span className={cn('inline-flex items-center gap-2 rounded-full border border-pink-100 bg-white px-3 py-1 text-xs font-semibold text-slate-500', className)}>
      <CloudOff size={14} />
      Local only
    </span>
  )
}
