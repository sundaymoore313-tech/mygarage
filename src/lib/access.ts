export type NonGuestPlanTier = 'free' | 'paid'
export type PlanTier = 'guest' | NonGuestPlanTier

/** Owner email gets unrestricted paid access regardless of billing state. */
const OWNER_EMAIL = 'sundaymoore313@gmail.com'

/**
 * Returns true if the authenticated email is the site owner.
 * Always grants 'paid' tier — bypass is applied server-side from the
 * Supabase session email, not from localStorage.
 */
export function isOwnerEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase() === OWNER_EMAIL
}

export type FeatureId =
  | 'svg-maker'
  | 'editor-2d'
  | 'export-glb'
  | 'print-export'
  | 'svg-export'
  | 'record-video'

const FEATURE_REQUIREMENTS: Record<FeatureId, PlanTier> = {
  'svg-maker': 'paid',
  'editor-2d': 'free',
  'export-glb': 'free',
  'print-export': 'paid',
  'svg-export': 'paid',
  'record-video': 'free',
}

const PLAN_LABELS: Record<PlanTier, string> = {
  guest: 'Guest',
  free: 'Free',
  paid: 'Paid',
}

const FEATURE_LABELS: Record<FeatureId, string> = {
  'svg-maker': 'Create a Logo',
  'editor-2d': '2D Editor',
  'export-glb': 'GLB export',
  'print-export': 'Print / Wrap Export',
  'svg-export': 'SVG export',
  'record-video': 'Video recording',
}

export function getPlanLabel(plan: PlanTier): string {
  return PLAN_LABELS[plan]
}

export function getFeatureLabel(feature: FeatureId): string {
  return FEATURE_LABELS[feature]
}

export function isFeatureAllowed(plan: PlanTier, feature: FeatureId): boolean {
  const required = FEATURE_REQUIREMENTS[feature]

  if (required === 'guest') {
    return true
  }
  if (required === 'free') {
    return plan !== 'guest'
  }
  return plan === 'paid'
}

export function getAccessPrompt(plan: PlanTier, feature: FeatureId): { message: string; actionLabel: string } {
  const featureLabel = getFeatureLabel(feature)
  if (plan === 'guest') {
    return {
      message: `Create an account to use ${featureLabel}.`,
      actionLabel: 'Sign In',
    }
  }

  return {
    message: `Upgrade to Paid to unlock ${featureLabel}.`,
    actionLabel: 'Upgrade',
  }
}