# Backend Setup (Supabase + Stripe)

This project already contains:

- Supabase migration for `public.user_billing`
- Edge functions for checkout, portal, Stripe webhook, and anonymous feedback submission

This guide completes the backend setup for local development and production.

For the browser-only Supabase dashboard steps, also follow `SUPABASE_DASHBOARD_SETUP.md`.

## 1. Prerequisites

Install:

- Node.js 20+
- Docker Desktop (required for local Supabase)

Supabase CLI is invoked through `npx` in this repo scripts, so a global install is optional.

## 2. Frontend Environment

Copy `.env.example` to `.env.local` and fill values:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-public-key-here
VITE_STRIPE_CHECKOUT_URL=https://buy.stripe.com/your-checkout-link
VITE_STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/p/login/your-portal-link
VITE_BILLING_SUPPORT_EMAIL=billing@yourdomain.com
```

## 3. Local Backend (Supabase)

This repo now includes `supabase/config.toml`.

Start local backend:

```bash
npm run backend:start
```

Check services and local keys:

```bash
npm run backend:status
```

Apply migrations:

```bash
npm run backend:db:push
```

Stop local backend:

```bash
npm run backend:stop
```

## 4. Local Edge Function Secrets

Copy `supabase/.env.example` to `supabase/.env.local` and fill Stripe secrets:

```env
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_SUCCESS_URL=http://localhost:5173/profile
STRIPE_CANCEL_URL=http://localhost:5173/profile
STRIPE_PORTAL_RETURN_URL=http://localhost:5173/profile
DISCORD_FEEDBACK_WEBHOOK_URL=https://discord.com/api/webhooks/your-webhook-id/your-webhook-token
```

Run functions locally:

```bash
npm run backend:functions:serve
```

## 5. Stripe Webhook Local Testing

Use Stripe CLI forwarding to local Supabase function runtime:

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
```

Take the `whsec_...` from Stripe CLI output and put it into `supabase/.env.local`.

## 6. Production Deploy

Link CLI to your remote project:

```bash
npx supabase login
npx supabase link --project-ref your-project-ref
```

Push migration:

```bash
npm run backend:db:push
```

Set production function secrets:

```bash
npx supabase secrets set STRIPE_SECRET_KEY=sk_live_...
npx supabase secrets set STRIPE_PRICE_ID=price_...
npx supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
npx supabase secrets set STRIPE_SUCCESS_URL=https://yourdomain.com/profile
npx supabase secrets set STRIPE_CANCEL_URL=https://yourdomain.com/profile
npx supabase secrets set STRIPE_PORTAL_RETURN_URL=https://yourdomain.com/profile
npx supabase secrets set DISCORD_FEEDBACK_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

Deploy all functions:

```bash
npm run backend:functions:deploy:all
```

## 7. Stripe Dashboard Webhook

Set endpoint to:

```text
https://<your-project-ref>.functions.supabase.co/stripe-webhook
```

Subscribe to events:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`

## 8. Smoke Test Checklist

1. Sign up a test user.
2. Start checkout from profile.
3. Complete test payment in Stripe.
4. Confirm `public.user_billing.plan_tier = 'paid'`.
5. Open billing portal and confirm it loads.
6. Cancel subscription and verify plan returns to `free`.
