'use client'
import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

export default function SignupPage() {
  const [email,setEmail]=useState(''); const [password,setPassword]=useState('')
  const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [busy,setBusy]=useState(false)
  const router=useRouter()
  async function submit(event:FormEvent) {
    event.preventDefault();setError('');setBusy(true)
    try {
      const username=`${email.trim().split('@')[0].replace(/[^a-zA-Z0-9_]/g,'').slice(0,24) || 'learner'}_${crypto.randomUUID().slice(0,8)}`
      const supabase=createClient()
      const {data,error}=await supabase.auth.signUp({email:email.trim(),password,options:{data:{username}}})
      if(error)throw error
      if(!data.session){setMessage('Check your inbox to confirm your account, then sign in.');return}
      router.replace('/');router.refresh()
    } catch(e){setError(e instanceof Error?e.message:'Could not create account.')}
    finally{setBusy(false)}
  }
  return <div className="mx-auto max-w-md py-10"><BookOpen size={28} className="mb-6 text-primary"/><p className="mb-3 text-xs uppercase tracking-[.2em] text-muted-foreground">Your study space</p><h1 className="text-4xl">Keep your practice with you.</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">An account syncs your activity and attempts. No exam date, study plan or preparation history required.</p><form onSubmit={submit} className="mt-8 space-y-5"><label className="block text-sm">Email<input type="email" autoComplete="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 block w-full rounded-xl border bg-card px-4 py-3"/></label><label className="block text-sm">Password<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 block w-full rounded-xl border bg-card px-4 py-3"/></label>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{message&&<p role="status" className="text-sm">{message}</p>}<button disabled={busy} className="primary-button w-full">{busy?'Creating account…':'Create account'}<ArrowRight size={16}/></button></form><p className="mt-6 text-center text-sm text-muted-foreground">Already have an account? <Link href="/login" className="text-primary underline">Sign in</Link></p></div>
}
