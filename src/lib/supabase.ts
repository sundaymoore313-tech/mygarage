import { createClient } from '@supabase/supabase-js'
import type { NonGuestPlanTier } from './access'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * True once VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set in .env.local.
 * When false the app falls back to a "not configured" notice in the auth modal.
 */
export const isSupabaseConfigured = Boolean(
  supabaseUrl && supabaseAnonKey &&
  supabaseUrl !== 'https://your-project-id.supabase.co',
)

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl!, supabaseAnonKey!)
  : null

// ── Auth helpers ─────────────────────────────────────────────────────────────

export type AuthUser = {
  id: string
  name: string
  email: string
}

type BillingRow = {
  plan_tier: NonGuestPlanTier
}

/** Read the currently active Supabase session user, or null. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const user = data.session?.user
  if (!user) return null
  return {
    id: user.id,
    name: (user.user_metadata?.name as string | undefined) ?? user.email?.split('@')[0] ?? 'User',
    email: user.email ?? '',
  }
}

export async function getCurrentUserPlanTier(): Promise<NonGuestPlanTier | null> {
  if (!supabase) return null
  const user = await getCurrentUser()
  if (!user) return null

  const { data, error } = await supabase
    .from('user_billing')
    .select('plan_tier')
    .eq('user_id', user.id)
    .maybeSingle<BillingRow>()

  if (error) return null
  return data?.plan_tier === 'paid' ? 'paid' : 'free'
}

export type SignUpResult =
  | { ok: true; user: AuthUser; needsConfirmation: boolean }
  | { ok: false; error: string }

export async function supabaseSignUp(
  email: string,
  password: string,
  name: string,
): Promise<SignUpResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name } },
  })

  if (error) return { ok: false, error: error.message }
  if (!data.user) return { ok: false, error: 'Sign up failed. Please try again.' }

  const authUser: AuthUser = {
    id: data.user.id,
    name: (data.user.user_metadata?.name as string | undefined) ?? name,
    email: data.user.email ?? email,
  }

  // Supabase may require email confirmation depending on your project settings.
  // If session is null the user needs to click the confirmation email first.
  const needsConfirmation = data.session === null

  return { ok: true, user: authUser, needsConfirmation }
}

export type SignInResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string }

export type SignOutResult =
  | { ok: true }
  | { ok: false; error: string }

export async function supabaseSignIn(
  email: string,
  password: string,
): Promise<SignInResult> {
  if (!supabase) return { ok: false, error: 'Supabase is not configured.' }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { ok: false, error: error.message }
  if (!data.user) return { ok: false, error: 'Sign in failed. Please try again.' }

  const authUser: AuthUser = {
    id: data.user.id,
    name: (data.user.user_metadata?.name as string | undefined) ?? data.user.email?.split('@')[0] ?? 'User',
    email: data.user.email ?? email,
  }

  return { ok: true, user: authUser }
}

export async function supabaseSignOut(): Promise<SignOutResult> {
  if (!supabase) return { ok: true }

  const globalResult = await supabase.auth.signOut()
  if (!globalResult.error) {
    return { ok: true }
  }

  const localResult = await supabase.auth.signOut({ scope: 'local' })
  if (!localResult.error) {
    return { ok: true }
  }

  return { ok: false, error: globalResult.error.message }
}
