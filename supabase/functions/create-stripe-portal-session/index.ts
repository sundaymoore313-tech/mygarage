import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
    const portalReturnUrl = Deno.env.get('STRIPE_PORTAL_RETURN_URL') ?? ''

    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !portalReturnUrl) {
      return json({ error: 'Missing billing environment configuration.' }, 500)
    }

    const authHeader = req.headers.get('Authorization')
    const jwt = authHeader?.replace('Bearer ', '')
    if (!jwt) {
      return json({ error: 'Missing auth token.' }, 401)
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)
    const { data: authData, error: authError } = await supabase.auth.getUser(jwt)
    if (authError || !authData.user) {
      return json({ error: 'Invalid auth token.' }, 401)
    }

    const { data: billingRow } = await supabase
      .from('user_billing')
      .select('stripe_customer_id')
      .eq('user_id', authData.user.id)
      .maybeSingle()

    const customerId = billingRow?.stripe_customer_id as string | null | undefined
    if (!customerId) {
      return json({ error: 'No Stripe customer is linked to this account yet.' }, 400)
    }

    const stripe = new Stripe(stripeSecretKey)
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: portalReturnUrl,
    })

    return json({ url: session.url }, 200)
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unknown error' }, 500)
  }
})

function json(payload: unknown, status: number) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}