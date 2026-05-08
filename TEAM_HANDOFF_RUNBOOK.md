# MyGarage Team Handoff Runbook

## Purpose

This document explains how production is set up, what each service does, and where to fix issues.
Use this as the first read for any new engineer, contractor, or operator.

## Current Production Stack

- Frontend hosting: Vercel (project: mygarage)
- Frontend domain: mygaragewrapstudio.com and www.mygaragewrapstudio.com
- Backend: Supabase (project ref: wdlanuzxmfcuknkurtwg)
- Billing: Stripe (Checkout + Customer Portal + Webhooks)
- DNS registrar: Porkbun

## System Architecture

1. User opens the React app hosted on Vercel.
2. App uses Supabase Auth for sign-in and identity.
3. App requests billing actions through Supabase Edge Functions.
4. Edge Functions call Stripe using server-side secret keys.
5. Stripe sends webhook events to Supabase Edge Function stripe-webhook.
6. Webhook updates billing state in Supabase table public.user_billing.
7. App reads billing state from Supabase and gates paid features.

## Service Responsibilities

### Vercel (Frontend)

- Builds and hosts the React/Vite app.
- Serves custom domain and TLS certificate.
- Not the source of truth for billing status.

Where to use it:
- Deploy previews and production deploy logs
- Build failures and frontend runtime issues

### Supabase (Backend)

- Auth and user identity
- Database and billing state
- Serverless Edge Functions for Stripe operations
- Secret management for Stripe keys and redirect URLs

Where to use it:
- Function logs and deployment status
- Database row verification
- Secret updates

### Stripe (Billing)

- Checkout session creation target
- Customer portal session target
- Subscription lifecycle events

Where to use it:
- Product and price management
- Webhook endpoint health
- Payment/account onboarding

### Porkbun (DNS)

- Domain ownership and DNS records

Where to use it:
- DNS changes for domain routing
- Domain renewal/lock/privacy

## Repository Map (Important Paths)

- Backend function: supabase/functions/create-stripe-checkout-session/index.ts
- Backend function: supabase/functions/create-stripe-portal-session/index.ts
- Backend function: supabase/functions/stripe-webhook/index.ts
- Billing migration: supabase/migrations/20260507164500_billing_sync.sql
- State store: src/store/editorStore.ts
- Frontend app entry: src/App.tsx

## Edge Functions in Production

Active functions expected:

1. create-stripe-checkout-session
2. create-stripe-portal-session
3. stripe-webhook

If one is missing or inactive, billing flow is partially broken.

## Required Supabase Secrets

Expected secret names:

1. STRIPE_SECRET_KEY
2. STRIPE_PRICE_ID
3. STRIPE_MONTHLY_PRICE_ID
4. STRIPE_WEBHOOK_SECRET
5. STRIPE_SUCCESS_URL
6. STRIPE_CANCEL_URL
7. STRIPE_PORTAL_RETURN_URL

Do not store raw secret values in git or docs.

## Required Stripe Webhook Events

Endpoint should subscribe to:

1. checkout.session.completed
2. customer.subscription.created
3. customer.subscription.updated
4. customer.subscription.deleted

If these events are wrong, billing sync will drift.

## DNS State Expected

At minimum:

1. A record for root domain mygaragewrapstudio.com -> 76.76.21.21
2. A record for www.mygaragewrapstudio.com -> 76.76.21.21

## Day-to-Day Operations

### Deploy frontend

Use Vercel deployment flow from repo root.

Typical command:
npx vercel --prod

### Deploy backend functions

Typical commands:
npx supabase login
npx supabase link --project-ref wdlanuzxmfcuknkurtwg
npm run backend:functions:deploy:all

### Update backend secrets

Use Supabase secrets set command or Supabase dashboard Edge Function secrets UI.

## Production Incident Playbook

### Symptom: Upgrade button fails

Check:

1. Vercel browser console/network errors
2. Supabase function create-stripe-checkout-session logs
3. STRIPE_SECRET_KEY and STRIPE_PRICE_ID presence in Supabase secrets

### Symptom: Payment succeeds but user still free

Check:

1. Stripe webhook delivery logs
2. stripe-webhook function logs
3. Webhook secret match between Stripe and Supabase
4. public.user_billing row for that user

### Symptom: Portal button fails

Check:

1. create-stripe-portal-session logs
2. STRIPE_PORTAL_RETURN_URL secret
3. user_billing row has stripe_customer_id

### Symptom: Domain resolves but HTTPS fails

Check:

1. DNS records in Porkbun
2. Domain status in Vercel Domains
3. Wait for certificate provisioning and verify again

## Access and Ownership Model

Recommended roles:

1. Product Owner
- Owns billing policy, pricing, legal pages, and launch decisions

2. Frontend Engineer
- Owns React/Vite UI and client-side billing entry points

3. Backend Engineer
- Owns Supabase functions, webhook processing, database migration, and secrets

4. DevOps/Release Owner
- Owns Vercel project settings, DNS, deploy policy, and incident response

## Security and Change Rules

1. Never expose secret keys in frontend code.
2. Keep all Stripe secret operations in Supabase functions.
3. Require PR review for function or migration changes.
4. Rotate leaked or suspected leaked keys immediately.
5. Use MFA on Stripe, Supabase, Vercel, Porkbun, and GitHub.

## New Team Member Onboarding Checklist

1. Read README.md and this runbook.
2. Confirm access to GitHub repo, Supabase project, Stripe account, Vercel project, Porkbun account.
3. Run app locally and confirm login flow.
4. Inspect the 3 edge functions in Supabase dashboard.
5. Review billing table schema in Supabase.
6. Review Stripe webhook endpoint and events.
7. Review Vercel latest production deployment logs.

## Known Operational Facts

1. Backend is serverless and managed through Supabase, not a VM.
2. Frontend is static/SSR-hosted on Vercel and separate from backend execution.
3. Billing source of truth is Stripe events synced into Supabase.

## Quick Command Reference

List functions:
npx supabase functions list --project-ref wdlanuzxmfcuknkurtwg

List secrets:
npx supabase secrets list --project-ref wdlanuzxmfcuknkurtwg

Deploy all billing functions:
npm run backend:functions:deploy:all

Deploy frontend:
npx vercel --prod

## Change Log Placeholder

Keep a simple log when production-critical settings change.

Template:
- Date:
- Changed by:
- System changed (Stripe/Supabase/Vercel/DNS):
- What changed:
- Why:
- Verification performed:
