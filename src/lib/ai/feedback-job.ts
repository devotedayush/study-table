import { createHmac, timingSafeEqual } from 'node:crypto'
import type { FeedbackContext } from './exam-feedback'

type FeedbackJob = { responseId: string; owner: string; expiresAt: number; context: FeedbackContext; cacheKey?: string }
const LIFETIME_MS = 9 * 60 * 1000

function signature(body: string, secret: string) {
  return createHmac('sha256', secret).update(`exam-feedback:${body}`).digest('base64url')
}

export function signFeedbackJob(responseId: string, owner: string, context: FeedbackContext, secret: string, cacheKey?: string) {
  const body = Buffer.from(JSON.stringify({ responseId, owner, context, cacheKey, expiresAt: Date.now() + LIFETIME_MS })).toString('base64url')
  return `${body}.${signature(body, secret)}`
}

export function verifyFeedbackJob(token: string, owner: string, secret: string): FeedbackJob | null {
  try {
    if (token.length > 50000) return null
    const [body, provided, extra] = token.split('.')
    if (!body || !provided || extra) return null
    const expected = signature(body, secret)
    if (provided.length !== expected.length || !timingSafeEqual(Buffer.from(provided), Buffer.from(expected))) return null
    const job = JSON.parse(Buffer.from(body, 'base64url').toString()) as FeedbackJob
    if (job.owner !== owner || job.expiresAt <= Date.now() || !/^resp_[a-zA-Z0-9_-]+$/.test(job.responseId) || !Array.isArray(job.context)) return null
    return job
  } catch { return null }
}
