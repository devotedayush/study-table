'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Download, ExternalLink, Search } from 'lucide-react'

type Material = { id: string; title: string; filename: string; category: string; pages: number; bytes: number }

export function StudyMaterials() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All materials')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [signIn, setSignIn] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        setLoading(true); setError(''); setSignIn(false)
        const response = await fetch('/api/materials', { signal: controller.signal, cache: 'no-store' })
        const data = await response.json()
        if (!response.ok) {
          setSignIn(response.status === 401)
          throw new Error(data.error || 'Could not load the study materials.')
        }
        setMaterials(data)
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not load the study materials.')
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    void load()
    return () => controller.abort()
  }, [reload])

  const categories = ['All materials', ...new Set(materials.map(item => item.category))]
  const search = query.trim().toLowerCase()
  const visible = materials.filter(item => (category === 'All materials' || item.category === category) && `${item.title} ${item.category}`.toLowerCase().includes(search))

  return (
    <div className="space-y-7">
      <Link href="/notes" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} />Notes &amp; Flashcards</Link>
      <header className="rounded-[2rem] border border-border bg-card p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-[.22em] text-primary">CFA Level I · PDF collection</p>
        <h1 className="mt-3 font-heading text-4xl font-semibold tracking-tight">Study materials</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Your curriculum books, AI recall notes, practice packs and revision sheets. Open a PDF to read, or download it for offline study.</p>
        <p className="mt-3 text-xs text-muted-foreground">2024 resources retain their edition labels. AI summaries and practice aids are identified separately from official materials.</p>
      </header>
      {loading ? <p role="status" className="text-sm text-muted-foreground">Loading study materials…</p> : error ? (
        <div role="alert" className="rounded-2xl border border-border bg-card p-6">
          <p className="text-sm">{error}</p>
          {signIn ? <Link href="/login" className="mt-4 inline-flex rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Sign in</Link> : <button onClick={() => setReload(value => value + 1)} className="mt-4 rounded-xl border border-border px-4 py-2 text-sm">Try again</button>}
        </div>
      ) : <>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative flex-1"><span className="sr-only">Search study materials</span><Search size={17} aria-hidden="true" className="absolute left-4 top-4 text-muted-foreground" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search subjects, books or recall notes" className="h-12 w-full rounded-xl border border-border bg-card pl-11 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" /></label>
          <label><span className="sr-only">Material category</span><select value={category} onChange={event => setCategory(event.target.value)} className="h-12 w-full rounded-xl border border-border bg-card px-4 text-sm sm:max-w-80">{categories.map(name => <option key={name}>{name}</option>)}</select></label>
        </div>
        <p role="status" className="text-sm text-muted-foreground">{visible.length} of {materials.length} PDFs</p>
        {visible.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">No materials match. Try another subject or category.</p> : categories.slice(1).map(group => {
          const items = visible.filter(item => item.category === group)
          return items.length ? <section key={group} className="space-y-4" aria-label={group}>
            <h2 className="text-lg font-semibold">{group}<span className="ml-2 text-sm font-normal text-muted-foreground">{items.length}</span></h2>
            <div className="grid gap-4 md:grid-cols-2">{items.map(item => <article key={item.id} className="flex flex-col rounded-2xl border border-border bg-card p-5">
              <BookOpen size={20} aria-hidden="true" className="mb-3 text-primary" />
              <h3 className="font-semibold leading-6">{item.title}</h3>
              <p className="mb-5 mt-2 text-xs text-muted-foreground">{item.pages} pages · {(item.bytes / 1024 / 1024).toFixed(1)} MB · PDF</p>
              <div className="mt-auto flex flex-wrap gap-3">
                <a href={`/api/materials/${item.id}`} target="_blank" rel="noreferrer" aria-label={`Open ${item.title} (new tab)`} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"><ExternalLink size={15} />Open PDF</a>
                <a href={`/api/materials/${item.id}?download=1`} aria-label={`Download ${item.title}`} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-4 py-2 text-sm font-medium hover:bg-secondary"><Download size={15} />Download</a>
              </div>
            </article>)}</div>
          </section> : null
        })}
      </>}
    </div>
  )
}
