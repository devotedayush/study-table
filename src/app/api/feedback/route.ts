import { NextResponse } from 'next/server'
import { DEMO_AUTH_COOKIE } from '@/lib/demo-auth'
import { createClient } from '@/lib/supabase/server'

type FeedbackBody = {
  message?: string
  area?: string
  source?: 'button' | 'baby_maan'
}

export async function POST(request: Request) {
  const body = (await request.json()) as FeedbackBody
  const message = body.message?.trim()

  if (!message) {
    return NextResponse.json({ error: 'Feedback message is required.' }, { status: 400 })
  }
  if (message.length > 4000) {
    return NextResponse.json({ error: 'Feedback is too long.' }, { status: 400 })
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    const cookieStore = await import('next/headers').then((mod) => mod.cookies())
    const hasDemoSession = cookieStore.get(DEMO_AUTH_COOKIE)?.value === '1'

    if (hasDemoSession) {
      return NextResponse.json({
        saved: false,
        reply: 'Demo mode can\'t save feedback — sign in with your real account and I\'ll log it.',
      })
    }

    return NextResponse.json({ error: 'Please sign in first.' }, { status: 401 })
  }

  const source = body.source === 'baby_maan' ? 'baby_maan' : 'button'
  const area = body.area?.trim().slice(0, 120) || null

  const { error } = await supabase.from('user_feedback').insert({
    user_id: user.id,
    message,
    area,
    source,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ saved: true })
}
