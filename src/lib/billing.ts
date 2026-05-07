import { getCurrentUser, isSupabaseConfigured, supabase } from './supabase'
import type { NonGuestPlanTier } from './access'

type BillingProvider = 'stripe'

export type BillingConfig = {
  provider: BillingProvider
  checkoutUrl: string | null
  portalUrl: string | null
  supportEmail: string | null
  configured: boolean
}

export function getBillingConfig(): BillingConfig {
  const checkoutUrl = normalizeUrl(import.meta.env.VITE_STRIPE_CHECKOUT_URL as string | undefined)
  const portalUrl = normalizeUrl(import.meta.env.VITE_STRIPE_CUSTOMER_PORTAL_URL as string | undefined)
  const supportEmail = normalizeText(import.meta.env.VITE_BILLING_SUPPORT_EMAIL as string | undefined)

  return {
    provider: 'stripe',
    checkoutUrl,
    portalUrl,
    supportEmail,
    configured: Boolean(checkoutUrl),
  }
}

export function canUseBillingDevOverride(): boolean {
  if (typeof window === 'undefined') {
    return false
  }

  return window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
}

export function readCachedPlanTier(): NonGuestPlanTier {
  if (typeof window === 'undefined') {
    return 'free'
  }

  try {
    const raw = localStorage.getItem('mygarage-plan-tier')
    return raw === 'paid' ? 'paid' : 'free'
  } catch {
    return 'free'
  }
}

export function writeCachedPlanTier(plan: NonGuestPlanTier) {
  if (typeof window === 'undefined') {
    return
  }

  try {
    localStorage.setItem('mygarage-plan-tier', plan)
  } catch {
    // Ignore persistence failures.
  }
}

export function openBillingUrl(url: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.open(url, '_blank', 'noopener,noreferrer')
}

export async function startStripeCheckout(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isSupabaseConfigured && supabase) {
    const user = await getCurrentUser()
    if (!user) {
      return { ok: false, error: 'Sign in before starting checkout.' }
    }

    const { data, error } = await supabase.functions.invoke<{ url?: string }>('create-stripe-checkout-session', {
      body: {},
    })

    if (!error && data?.url) {
      openBillingUrl(data.url)
      return { ok: true }
    }
  }

  const config = getBillingConfig()
  if (config.checkoutUrl) {
    openBillingUrl(config.checkoutUrl)
    return { ok: true }
  }

  return { ok: false, error: 'Stripe checkout is not configured yet. Deploy the checkout function or add a hosted checkout URL.' }
}

export async function openStripeBillingPortal(): Promise<{ ok: true } | { ok: false; error: string }> {
  if (isSupabaseConfigured && supabase) {
    const user = await getCurrentUser()
    if (!user) {
      return { ok: false, error: 'Sign in before opening billing management.' }
    }

    const { data, error } = await supabase.functions.invoke<{ url?: string }>('create-stripe-portal-session', {
      body: {},
    })

    if (!error && data?.url) {
      openBillingUrl(data.url)
      return { ok: true }
    }
  }

  const config = getBillingConfig()
  if (config.portalUrl) {
    openBillingUrl(config.portalUrl)
    return { ok: true }
  }

  return { ok: false, error: 'Stripe customer portal is not configured yet. Deploy the portal function or add a hosted portal URL.' }
}

function normalizeUrl(value?: string | null): string | null {
  const trimmed = value?.trim()
  if (!trimmed) {
    return null
  }
  return /^https?:\/\//i.test(trimmed) ? trimmed : null
}

function normalizeText(value?: string | null): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}