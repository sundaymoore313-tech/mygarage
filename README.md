# MyGarage 3D Car Editor

React Three Fiber based car editor foundation for paint, decals, and text.

## Run

```bash
npm install
npm run dev
```

## Billing

The app is set up for Stripe-hosted billing links.

1. Create a Stripe product and recurring price.
2. Create a Checkout Link and Customer Portal link in Stripe.
3. Put those URLs into `.env.local` using the keys from `.env.example`.
4. For production access control, add webhook or server-side billing sync before trusting paid status.

See `BILLING_SETUP.md` for the production checklist.
For Supabase dashboard browser steps, see `SUPABASE_DASHBOARD_SETUP.md`.

## Backend Setup

For complete local and production backend setup (Supabase + Stripe), see:

- `BACKEND_SETUP.md`

Quick start:

```bash
npm run backend:start
npm run backend:db:push
npm run backend:functions:serve
```

## Asset Folders

Put your files in these exact locations:

- Car model: /models/car.glb
- Decals: /decals/<image-file>
- Fonts: /fonts/<font-file>

On disk, those map to:

- public/models/car.glb
- public/decals/
- public/fonts/

The app now starts on a Car Selector page. The editor only opens after picking a car.

## Supported Asset Types

- Car model: .glb
- Decals: .png, .webp, .jpg
- Fonts: .ttf, .otf, .woff, .woff2

## Decal Library Auto-Load

Decals are auto-indexed into /decals/manifest.json by:

- npm run dev
- npm run build

Flow:

1. Drop files into public/decals
2. Start or restart dev server
3. Open the Decal Library panel and click any image to add it as a new decal layer

## Car Selector Auto-Load

Cars are auto-indexed into /models/manifest.json by:

- npm run dev
- npm run build

Flow:

1. Drop .glb or .gltf files into public/models
2. Start or restart dev server
3. Pick a car from the selector page
4. Editor opens with the selected model

See these notes for naming and examples:

- public/models/README.txt
- public/decals/README.txt
- public/fonts/README.txt

## Architecture and Roadmap

Implementation plan and phase order are documented in:

- EDITOR_IMPLEMENTATION_PLAN.md

## Team Handoff

For production architecture, ownership, operations, and incident playbooks, see:

- TEAM_HANDOFF_RUNBOOK.md
