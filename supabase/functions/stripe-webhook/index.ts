import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import Stripe from 'https://esm.sh/stripe@18.5.0?target=deno'

const relevantEvents = new Set([
  'checkout.session.completed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    const stripeSecretKey = Deno.env.get('STRIPE_SECRET_KEY') ?? ''
    const stripeWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? ''

    if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey || !stripeWebhookSecret) {
      return new Response('Missing webhook configuration.', { status: 500 })
    }

    const signature = req.headers.get('stripe-signature')
    if (!signature) {
      return new Response('Missing stripe signature.', { status: 400 })
    }

    const body = await req.text()
    const stripe = new Stripe(stripeSecretKey)
    const event = await stripe.webhooks.constructEventAsync(body, signature, stripeWebhookSecret)

    if (!relevantEvents.has(event.type)) {
      return new Response('Ignored', { status: 200 })
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey)

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session
      const userId = session.client_reference_id ?? session.metadata?.supabase_user_id
      if (userId) {
        await supabase.from('user_billing').upsert({
          user_id: userId,
          plan_tier: 'paid',
          stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
          stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
          billing_email: session.customer_details?.email ?? null,
          subscription_status: 'active',
        })
      }

      return new Response('ok', { status: 200 })
    }

    const subscription = event.data.object as Stripe.Subscription
    const userId = subscription.metadata?.supabase_user_id ?? await findUserIdByCustomerId(supabase, subscription.customer)
    if (!userId) {
      return new Response('No linked user.', { status: 200 })
    }

    const planTier = subscription.status === 'active' || subscription.status === 'trialing' ? 'paid' : 'free'
    const currentPeriodEndUnix = subscription.items.data[0]?.current_period_end ?? null
    const currentPeriodEnd = currentPeriodEndUnix ? new Date(currentPeriodEndUnix * 1000).toISOString() : null

    await supabase.from('user_billing').upsert({
      user_id: userId,
      plan_tier: planTier,
      stripe_customer_id: typeof subscription.customer === 'string' ? subscription.customer : null,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      current_period_end: currentPeriodEnd,
    })

    return new Response('ok', { status: 200 })
  } catch (error) {
    return new Response(error instanceof Error ? error.message : 'Webhook error', { status: 400 })
  }
})

async function findUserIdByCustomerId(
  supabase: ReturnType<typeof createClient>,
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null,
) {
  const customerId = typeof customer === 'string' ? customer : customer?.id
  if (!customerId) return null

  const { data } = await supabase
    .from('user_billing')
    .select('user_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle<{ user_id: string }>()

  return data?.user_id ?? null
}