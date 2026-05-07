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
    const stripePriceId = Deno.env.get('STRIPE_PRICE_ID') ?? ''
    const successUrl = Deno.env.get('STRIPE_SUCCESS_URL') ?? ''
    const cancelUrl = Deno.env.get('STRIPE_CANCEL_URL') ?? ''

    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !stripePriceId || !successUrl || !cancelUrl) {
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

    const user = authData.user
    const stripe = new Stripe(stripeSecretKey)

    const { data: billingRow } = await supabase
      .from('user_billing')
      .select('stripe_customer_id, billing_email')
      .eq('user_id', user.id)
      .maybeSingle()

    let customerId = billingRow?.stripe_customer_id as string | null | undefined
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email ?? billingRow?.billing_email ?? undefined,
        metadata: { supabase_user_id: user.id },
        name: (user.user_metadata?.name as string | undefined) ?? undefined,
      })
      customerId = customer.id

      await supabase.from('user_billing').upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        billing_email: user.email ?? billingRow?.billing_email ?? null,
      })
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: stripePriceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: user.id,
      customer_update: { address: 'auto', name: 'auto' },
      metadata: { supabase_user_id: user.id },
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
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