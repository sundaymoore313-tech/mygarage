import { useState } from 'react'

type AuthMode = 'login' | 'signup'

type AuthUser = {
  name: string
  email: string
}

type StoredUser = AuthUser & {
  password: string
}

const USERS_STORAGE_KEY = 'mygarage-users'
const AUTH_LOCAL_KEY = 'mygarage-auth-local'
const AUTH_SESSION_KEY = 'mygarage-auth-session'

function readUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as StoredUser[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeUsers(users: StoredUser[]) {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users))
}

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

  const resetForm = () => {
    setName('')
    setEmail('')
    setPassword('')
    setRememberMe(true)
    setAuthError(null)
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setAuthError(null)

    const safeName = name.trim()
    const safeEmail = email.trim().toLowerCase()
    const safePassword = password.trim()

    if (!safeEmail || !safePassword) {
      setAuthError('Email and password are required.')
      return
    }

    const users = readUsers()

    if (authMode === 'signup') {
      if (!safeName) {
        setAuthError('Name is required for sign up.')
        return
      }
      if (users.some((u) => u.email === safeEmail)) {
        setAuthError('An account with this email already exists.')
        return
      }

      const created: StoredUser = { name: safeName, email: safeEmail, password: safePassword }
      writeUsers([...users, created])
      const signedIn: AuthUser = { name: created.name, email: created.email }
      saveAuth(signedIn, rememberMe)
      onSuccess()
      return
    }

    const found = users.find((u) => u.email === safeEmail && u.password === safePassword)
    if (!found) {
      setAuthError('Invalid email or password.')
      return
    }
    const signedIn: AuthUser = { name: found.name, email: found.email }
    saveAuth(signedIn, rememberMe)
    onSuccess()
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
            onClick={() => { setAuthMode('login'); setAuthError(null) }}
          >
            Log In
          </button>
          <button
            type="button"
            className={`guest-auth-tab${authMode === 'signup' ? ' active' : ''}`}
            onClick={() => { setAuthMode('signup'); setAuthError(null) }}
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

          {authError && <p className="guest-auth-error">{authError}</p>}

          <button type="submit" className="guest-auth-submit">
            {authMode === 'login' ? 'Log In' : 'Sign Up'}
          </button>
        </form>
      </div>
    </div>
  )
}
