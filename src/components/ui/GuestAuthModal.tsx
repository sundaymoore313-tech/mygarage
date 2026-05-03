import { useState } from 'react'
import { isSupabaseConfigured, supabaseSignIn, supabaseSignUp } from '../../lib/supabase'
import { LegalDocsModal } from './LegalDocsModal'

type AuthMode = 'login' | 'signup'
type LegalDocId = 'terms' | 'privacy' | 'acceptable'

type AuthUser = {
  name: string
  email: string
}

const AUTH_LOCAL_KEY = 'mygarage-auth-local'
const AUTH_SESSION_KEY = 'mygarage-auth-session'
const LEGAL_ACCEPTANCE_KEY = 'mygarage-legal-accepted-v1'

function saveAuth(user: AuthUser, remember: boolean) {
  const value = JSON.stringify(user)
  if (remember) {
    localStorage.setItem(AUTH_LOCAL_KEY, value)
    sessionStorage.removeItem(AUTH_SESSION_KEY)
  } else {
    sessionStorage.setItem(AUTH_SESSION_KEY, value)
    localStorage.removeItem(AUTH_LOCAL_KEY)
  }
}

type GuestAuthModalProps = {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function GuestAuthModal({ isOpen, onClose, onSuccess }: GuestAuthModalProps) {
  const [authMode, setAuthMode] = useState<AuthMode>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [rememberMe, setRememberMe] = useState(true)
  const [authError, setAuthError] = useState<string | null>(null)
  const [authLoading, setAuthLoading] = useState(false)
  const [authConfirmPending, setAuthConfirmPending] = useState(false)
  const [legalAccepted, setLegalAccepted] = useState(() => localStorage.getItem(LEGAL_ACCEPTANCE_KEY) === '1')
  const [legalDoc, setLegalDoc] = useState<LegalDocId>('terms')
  const [legalOpen, setLegalOpen] = useState(false)

  const resetForm = () => {
    setName('')
    setEmail('')
    setPassword('')
    setRememberMe(true)
    setAuthError(null)
    setAuthConfirmPending(false)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const openLegal = (doc: LegalDocId) => {
    setLegalDoc(doc)
    setLegalOpen(true)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)
    setAuthConfirmPending(false)

    if (!isSupabaseConfigured) {
      setAuthError('Auth is not configured yet. Add Supabase credentials to .env.local and restart dev server.')
      return
    }

    const safeName = name.trim()
    const safeEmail = email.trim().toLowerCase()
    const safePassword = password.trim()

    if (!safeEmail || !safePassword) {
      setAuthError('Email and password are required.')
      return
    }
    if (!legalAccepted) {
      setAuthError('Please accept the Terms, Privacy, and Acceptable Use notice to continue.')
      return
    }

    setAuthLoading(true)
    try {
      if (authMode === 'signup') {
        if (!safeName) {
          setAuthError('Name is required for sign up.')
          return
        }

        const result = await supabaseSignUp(safeEmail, safePassword, safeName)
        if (!result.ok) {
          setAuthError(result.error)
          return
        }

        if (result.needsConfirmation) {
          setAuthConfirmPending(true)
          return
        }

        saveAuth({ name: result.user.name, email: result.user.email }, rememberMe)
        localStorage.setItem(LEGAL_ACCEPTANCE_KEY, '1')
        onSuccess()
        return
      }

      const result = await supabaseSignIn(safeEmail, safePassword)
      if (!result.ok) {
        setAuthError(result.error)
        return
      }

      saveAuth({ name: result.user.name, email: result.user.email }, rememberMe)
      localStorage.setItem(LEGAL_ACCEPTANCE_KEY, '1')
      onSuccess()
    } finally {
      setAuthLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="guest-auth-backdrop" role="dialog" aria-modal="true" aria-label="Sign in to unlock features">
      <div className="guest-auth-modal">
        <button type="button" className="guest-auth-close" aria-label="Close" onClick={handleClose}>✕</button>

        <div className="guest-auth-tabs">
          <button
            type="button"
            className={`guest-auth-tab${authMode === 'login' ? ' active' : ''}`}
            onClick={() => { setAuthMode('login'); setAuthError(null); setAuthConfirmPending(false) }}
          >
            Log In
          </button>
          <button
            type="button"
            className={`guest-auth-tab${authMode === 'signup' ? ' active' : ''}`}
            onClick={() => { setAuthMode('signup'); setAuthError(null); setAuthConfirmPending(false) }}
          >
            Sign Up
          </button>
        </div>

        <h3 className="guest-auth-title">{authMode === 'login' ? 'Welcome back' : 'Create your account'}</h3>
        <p className="guest-auth-subtitle">
          {authMode === 'login' ? 'Sign in to save your design.' : 'Sign up to unlock saving and more.'}
        </p>

        <form className="guest-auth-form" onSubmit={handleSubmit}>
          {authMode === 'signup' && (
            <label className="guest-auth-field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Rivera"
                autoComplete="name"
              />
            </label>
          )}

          <label className="guest-auth-field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </label>

          <label className="guest-auth-field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={authMode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          <label className="guest-auth-remember">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>Remember me on this device</span>
          </label>

          <label className="guest-auth-remember">
            <input
              type="checkbox"
              checked={legalAccepted}
              onChange={(e) => setLegalAccepted(e.target.checked)}
            />
            <span>
              I agree to the
              {' '}
              <button type="button" className="home-auth-link" onClick={() => openLegal('terms')}>Terms</button>
              {', '}
              <button type="button" className="home-auth-link" onClick={() => openLegal('privacy')}>Privacy</button>
              {' and '}
              <button type="button" className="home-auth-link" onClick={() => openLegal('acceptable')}>Acceptable Use</button>
            </span>
          </label>

          {authError && <p className="guest-auth-error">{authError}</p>}
          {authConfirmPending && (
            <p className="guest-auth-error" style={{ background: 'rgba(37,99,235,0.15)', borderColor: '#3b82f6', color: '#bfdbfe' }}>
              Confirm your email from the Supabase message, then log in.
            </p>
          )}

          <button type="submit" className="guest-auth-submit" disabled={authLoading}>
            {authLoading ? 'Please wait…' : authMode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>
      </div>

      <LegalDocsModal
        isOpen={legalOpen}
        initialDoc={legalDoc}
        onSelectDoc={setLegalDoc}
        onClose={() => setLegalOpen(false)}
      />
    </div>
  )
}
