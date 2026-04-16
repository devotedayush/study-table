'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { track } from '@vercel/analytics'

const MIN_TIME_SECONDS = 2
const MAX_LABEL_LENGTH = 80

function cleanText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL_LENGTH)
}

function getElementLabel(element: HTMLElement) {
  return (
    cleanText(element.dataset.analyticsLabel) ||
    cleanText(element.getAttribute('aria-label')) ||
    cleanText(element.getAttribute('title')) ||
    cleanText(element.textContent) ||
    element.tagName.toLowerCase()
  )
}

function getAreaName(element: HTMLElement) {
  const labelledSection = element.closest<HTMLElement>('[data-analytics-area]')
  if (labelledSection?.dataset.analyticsArea) {
    return cleanText(labelledSection.dataset.analyticsArea)
  }

  const landmark = element.closest<HTMLElement>('nav, main, aside, header, footer, section, form')
  return landmark?.tagName.toLowerCase() ?? 'page'
}

export function AnalyticsEvents() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const pageStartedAt = useRef(Date.now())
  const currentPath = `${pathname}${searchParams?.toString() ? `?${searchParams.toString()}` : ''}`

  useEffect(() => {
    pageStartedAt.current = Date.now()
  }, [currentPath])

  useEffect(() => {
    function sendPageTime(reason: string) {
      const seconds = Math.round((Date.now() - pageStartedAt.current) / 1000)
      if (seconds < MIN_TIME_SECONDS) {
        return
      }

      track('page_time', {
        path: currentPath,
        seconds,
        reason,
      })
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'hidden') {
        sendPageTime('hidden')
      } else {
        pageStartedAt.current = Date.now()
      }
    }

    function handlePageHide() {
      sendPageTime('pagehide')
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pagehide', handlePageHide)

    return () => {
      sendPageTime('route_change')
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pagehide', handlePageHide)
    }
  }, [currentPath])

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      const target = event.target
      if (!(target instanceof HTMLElement)) {
        return
      }

      const action = target.closest<HTMLElement>('button, a, [role="button"]')
      if (!action || action.dataset.analyticsIgnore === 'true') {
        return
      }

      track('ui_click', {
        path: currentPath,
        label: getElementLabel(action),
        element: action.tagName.toLowerCase(),
        href: action instanceof HTMLAnchorElement ? action.pathname || action.href : '',
        area: getAreaName(action),
      })
    }

    document.addEventListener('click', handleClick, { capture: true })

    return () => {
      document.removeEventListener('click', handleClick, { capture: true })
    }
  }, [currentPath])

  return null
}
