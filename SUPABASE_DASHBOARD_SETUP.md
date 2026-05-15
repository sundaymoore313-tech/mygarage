# Supabase Dashboard Setup (Browser)

Use this after signing in to Supabase Dashboard.

## 1. Open Your Project

1. Go to Supabase Dashboard.
2. Open the project used by this app.
3. Keep the project reference handy (Project Settings -> General).

## 2. Confirm API Keys for Frontend

1. Go to Project Settings -> API.
2. Copy:
   - Project URL
   - anon public key
3. Put them in `.env.local`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

## 3. Confirm Billing Table Exists

1. Go to SQL Editor.
2. Run migration from `supabase/migrations/20260507164500_billing_sync.sql` if not already applied.
3. Go to Table Editor and verify `public.user_billing` exists.

Expected columns include:

- `user_id`
- `plan_tier`
- `stripe_customer_id`
- `stripe_subscription_id`
- `subscription_status`
- `billing_email`
- `current_period_end`

## 3.5. Harden Auth Session Lifetime

If users report getting logged out too often, update Auth token lifetime in Supabase:

1. Go to Authentication -> Settings.
2. Set JWT expiry to `86400` seconds (24 hours).
3. Save settings.

This repo now matches that value in `supabase/config.toml` for local development.

## 4. Set Edge Function Secrets

In Dashboard go to Edge Functions -> Secrets, then add:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_SUCCESS_URL`
- `STRIPE_CANCEL_URL`
- `STRIPE_PORTAL_RETURN_URL`
- `DISCORD_FEEDBACK_WEBHOOK_URL`

Use your live values in production.

## 5. Deploy Edge Functions

From local repo terminal:

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npm run backend:functions:deploy:all
```

Then in Dashboard -> Edge Functions verify these are present:

- `create-stripe-checkout-session`
- `create-stripe-portal-session`
- `stripe-webhook`
- `submit-feedback`

## 6. Connect Stripe Webhook Endpoint

In Stripe Dashboard -> Developers -> Webhooks:

1. Add endpoint:
   `https://YOUR_PROJECT_REF.functions.supabase.co/stripe-webhook`
2. Subscribe to events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
3. Copy webhook signing secret (`whsec_...`) and store as `STRIPE_WEBHOOK_SECRET` in Supabase secrets.

## 7. Verify Browser Flow End-to-End

1. Sign in to your app.
2. Open profile page.
3. Click upgrade.
4. Complete Stripe test checkout.
5. In Supabase Table Editor, confirm user row changes to `plan_tier = paid`.
6. Cancel subscription in portal and confirm it returns to `free`.

## 8. Common Issues

- If functions fail with missing env: re-check Edge Function secrets in Supabase Dashboard.
- If webhook updates do not appear: verify Stripe endpoint URL project ref and webhook secret.
- If local backend commands fail: start Docker Desktop first, then run `npm run backend:start`.
