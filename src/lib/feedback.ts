import { isSupabaseConfigured, supabase } from './supabase'

const FEEDBACK_MAX_CHARS = 1000
const CLIENT_COOLDOWN_MS = 15_000
const FEEDBACK_LAST_SENT_KEY = 'mygarage-feedback-last-sent-at'

function getRemainingCooldownMs(): number {
  try {
    const raw = localStorage.getItem(FEEDBACK_LAST_SENT_KEY)
    const lastSentAt = raw ? Number(raw) : 0
    if (!Number.isFinite(lastSentAt) || lastSentAt <= 0) return 0
    const remaining = CLIENT_COOLDOWN_MS - (Date.now() - lastSentAt)
    return remaining > 0 ? remaining : 0
  } catch {
    return 0
  }
}

export async function sendAnonymousFeedback(
  message: string,
): Promise<{ success: boolean; error?: string }> {
  const trimmed = message.trim()
  if (!trimmed) {
    return { success: false, error: 'Feedback message cannot be empty.' }
  }
  if (trimmed.length > FEEDBACK_MAX_CHARS) {
    return { success: false, error: `Feedback must be ${FEEDBACK_MAX_CHARS} characters or fewer.` }
  }
  const remainingCooldownMs = getRemainingCooldownMs()
  if (remainingCooldownMs > 0) {
    const seconds = Math.ceil(remainingCooldownMs / 1000)
    return { success: false, error: `Please wait ${seconds}s before sending another message.` }
  }
  if (!isSupabaseConfigured || !supabase) {
    return { success: false, error: 'Feedback is not configured yet.' }
  }

  const { data, error } = await supabase.functions.invoke<{ ok?: boolean; error?: string }>('submit-feedback', {
    body: { message: trimmed },
  })

  if (error) {
    return { success: false, error: error.message }
  }

  if (!data?.ok) {
    return { success: false, error: data?.error ?? 'Feedback failed to send.' }
  }

  try {
    localStorage.setItem(FEEDBACK_LAST_SENT_KEY, String(Date.now()))
  } catch {
    // Ignore storage failures and keep feedback flow working.
  }

  return { success: true }
}
