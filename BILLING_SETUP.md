# Billing Setup

## What Is Implemented

- Stripe-hosted checkout entry point in the profile page
- Stripe customer portal entry point in the profile page
- Free vs paid feature gating in the app shell
- Localhost-only paid/free override for testing before backend sync exists

## What Is Still Required For Production

The browser cannot be the source of truth for paid status. To make billing real in production, add one secure server-side sync path:

1. Stripe webhook endpoint
2. Verify Stripe webhook signature with your secret key
3. Update the user plan in your database when these Stripe events arrive:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Read that plan back into the app after login

## Recommended Stack For This Repo

- Auth: Supabase Auth
- Billing: Stripe Checkout + Stripe Customer Portal
- Secure sync: Supabase Edge Function or small backend route
- Plan storage: Supabase table keyed by `auth.users.id`

## Environment Variables

Add these to `.env.local`:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_STRIPE_CHECKOUT_URL=https://buy.stripe.com/...
VITE_STRIPE_CUSTOMER_PORTAL_URL=https://billing.stripe.com/...
VITE_BILLING_SUPPORT_EMAIL=billing@yourdomain.com
```

Add these as Supabase Edge Function secrets:

```bash
supabase secrets set STRIPE_SECRET_KEY=sk_live_...
supabase secrets set STRIPE_PRICE_ID=price_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_SUCCESS_URL=https://yourdomain.com/profile
supabase secrets set STRIPE_CANCEL_URL=https://yourdomain.com/profile
supabase secrets set STRIPE_PORTAL_RETURN_URL=https://yourdomain.com/profile
```

## Deploy Steps

1. Run the SQL in [supabase/migrations/20260507164500_billing_sync.sql](supabase/migrations/20260507164500_billing_sync.sql).
2. Deploy [supabase/functions/create-stripe-checkout-session/index.ts](supabase/functions/create-stripe-checkout-session/index.ts).
3. Deploy [supabase/functions/create-stripe-portal-session/index.ts](supabase/functions/create-stripe-portal-session/index.ts).
4. Deploy [supabase/functions/stripe-webhook/index.ts](supabase/functions/stripe-webhook/index.ts).
5. Point your Stripe webhook endpoint at the deployed `stripe-webhook` function.
6. In Stripe, use the same live price ID that you stored in `STRIPE_PRICE_ID`.
7. After a test purchase, click `Refresh Billing Status` in the profile page to confirm the app now reads the paid plan from Supabase.

## Stripe Dashboard Steps

1. Create your product: `MyGarage Paid`
2. Create a recurring monthly price
3. Turn on Customer Portal
4. Create a Checkout Link for that price
5. Set your return URL back to your domain
6. Add your legal business name, address, support email, and statement descriptor
7. Turn on Stripe Tax if you are handling tax yourself through Stripe

## Legal / Tax Reality

There are two sane paths:

1. Stripe path: lower platform fees, more control, but you are responsible for tax compliance and bookkeeping.
2. Merchant-of-record path like Paddle or Lemon Squeezy: higher fees, but they handle more sales tax / VAT burden.

If your main priority is the least chance of tax/compliance mistakes, merchant-of-record is safer.
If your main priority is best developer tooling and strong subscription support, Stripe is the better default.

## Minimum Business Setup

1. Form an LLC or other legal entity in your state or country.
2. Get an EIN or local tax ID.
3. Open a dedicated business bank account.
4. Keep bookkeeping from day one.
5. Save receipts for software, hosting, ads, contractors, and equipment.
6. Talk to a CPA in your jurisdiction before launch.

## Security Checklist

1. Turn on MFA for GitHub, Stripe, Supabase, your domain registrar, and email.
2. Use a password manager and unique passwords everywhere.
3. Keep Stripe secret keys and webhook secrets out of the frontend.
4. Lock GitHub branch protection on your main branch.
5. Restrict who can deploy production.
6. Use HTTPS only.
7. Add a CSP header before launch.
8. Review Supabase Row Level Security for any paid-plan data.
9. Audit admin roles so no normal user can self-upgrade.
10. Enable domain registrar transfer lock and registry lock if available.

## Site Theft / Takeover Reality

You cannot stop someone from visually copying a public site, but you can stop the real risks:

- account takeover
- domain hijacking
- secret-key leaks
- unauthorized deploys
- database abuse

The biggest real protections are MFA, secret management, least-privilege access, webhook verification, branch protection, and registrar security.