const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FEEDBACK_MAX_CHARS = 1000
const THROTTLE_WINDOW_MS = 20_000
const DUPLICATE_WINDOW_MS = 10 * 60_000

type FingerprintState = {
  lastSentAt: number
  lastMessage: string
  lastMessageAt: number
}

const feedbackFingerprintStore = new Map<string, FingerprintState>()

function getClientFingerprint(req: Request): string {
  const ip = (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    req.headers.get('cf-connecting-ip') ||
    'unknown-ip'
  )
  const userAgent = req.headers.get('user-agent') ?? 'unknown-ua'
  return `${ip}|${userAgent.slice(0, 120)}`
}

function cleanupFingerprintStore(now: number) {
  for (const [key, value] of feedbackFingerprintStore.entries()) {
    if (now - value.lastMessageAt > DUPLICATE_WINDOW_MS) {
      feedbackFingerprintStore.delete(key)
    }
  }
}

function sanitizeForDiscord(message: string): string {
  return message
    .replaceAll('@everyone', '@\u200beveryone')
    .replaceAll('@here', '@\u200bhere')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed.' }, 405)
  }

  const webhookUrl = Deno.env.get('DISCORD_FEEDBACK_WEBHOOK_URL')?.trim()
  if (!webhookUrl) {
    return json({ error: 'Feedback webhook is not configured.' }, 500)
  }

  let payload: { message?: string }
  try {
    payload = await req.json()
  } catch {
    return json({ error: 'Invalid JSON payload.' }, 400)
  }

  const message = payload.message?.trim() ?? ''
  if (!message) {
    return json({ error: 'Feedback message is required.' }, 400)
  }
  if (message.length > FEEDBACK_MAX_CHARS) {
    return json({ error: `Feedback must be ${FEEDBACK_MAX_CHARS} characters or fewer.` }, 400)
  }

  const now = Date.now()
  cleanupFingerprintStore(now)
  const fingerprint = getClientFingerprint(req)
  const previousState = feedbackFingerprintStore.get(fingerprint)

  if (previousState) {
    const sinceLastSend = now - previousState.lastSentAt
    if (sinceLastSend < THROTTLE_WINDOW_MS) {
      const waitSeconds = Math.ceil((THROTTLE_WINDOW_MS - sinceLastSend) / 1000)
      return json({ error: `Please wait ${waitSeconds}s before sending another message.` }, 429)
    }

    const isDuplicate = previousState.lastMessage === message
    const sinceLastDuplicate = now - previousState.lastMessageAt
    if (isDuplicate && sinceLastDuplicate < DUPLICATE_WINDOW_MS) {
      return json({ error: 'Duplicate message blocked. Please send new feedback.' }, 429)
    }
  }

  const userAgent = req.headers.get('user-agent') ?? 'unknown'
  const origin = req.headers.get('origin') ?? req.headers.get('referer') ?? 'unknown'

  const embed = {
    title: 'New Anonymous Website Feedback',
    description: sanitizeForDiscord(message),
    color: 0x3498db,
    fields: [
      { name: 'Origin', value: origin.slice(0, 1024), inline: false },
      { name: 'User Agent', value: userAgent.slice(0, 1024), inline: false },
      { name: 'Timestamp', value: new Date().toISOString(), inline: true },
    ],
    footer: {
      text: 'mygarage feedback',
    },
  }

  const discordResponse = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      username: 'MyGarage Feedback Bot',
      allowed_mentions: { parse: [] },
      embeds: [embed],
    }),
  })

  if (!discordResponse.ok) {
    const detail = await discordResponse.text()
    console.error('Discord webhook error:', discordResponse.status, detail)
    return json({ error: 'Discord rejected the feedback payload.' }, 502)
  }

  feedbackFingerprintStore.set(fingerprint, {
    lastSentAt: now,
    lastMessage: message,
    lastMessageAt: now,
  })

  return json({ ok: true }, 200)
})

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
