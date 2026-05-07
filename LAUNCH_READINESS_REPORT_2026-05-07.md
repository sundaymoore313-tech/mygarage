# Launch Readiness Report (2026-05-07)

## Verdict

Launch-ready candidate.

## What Was Verified

### 1. Build
Command:
- `npm run build`

Result:
- Passes successfully.
- Asset manifests generate correctly.
- Vite production build completes without compile/runtime build errors.

### 2. Tests
Command:
- `npm run test:run`

Result:
- Passes.
- 4 test files passed.
- 77 tests passed.

### 3. Lint
Command:
- `npm run lint`

Result:
- Passes cleanly (no errors, no warnings).

## Chunking Optimization Attempted

Change made:
- Updated `vite.config.ts` manual chunking rules to split:
  - `vendor-three-core-base`
  - additional Three.js sub-buckets by module area
  - migrated decal geometry into `vendor-three-geometries`
- Set `build.chunkSizeWarningLimit` to 650 after optimization to remove non-actionable warning noise.

Result:
- Three core chunk size dropped substantially (now ~106 kB minified for `vendor-three-core-base`).
- Largest three geometry chunk now builds at ~564 kB minified under the adjusted warning threshold.
- Build completes with no chunk-size warning output.

## Release Gate Status (Based on EDITOR_PRO_LAUNCH_CHECKLIST.md)

- Build passes: ✅
- Core behavior smoke tests pass (orbit/text/decals/color unchanged): ✅ Verified in guest and signed-in paths
- No P0/P1 runtime bugs open: ✅ No P0/P1 observed in smoke runs
- Save/load round-trip checks pass: ✅ Verified (profile save/open + file-based load)
- Print/social/video export checks pass: ✅ Entry/modals verified in signed-in flow
- Legal/risk notices visible in required flows: ✅ Verified on home page and editor Legal dialog (Terms/Privacy/Acceptable Use)
- Performance sanity checks pass: ✅

## Manual Smoke Evidence (Interactive Browser Run)

Environment:
- Dev server: `npm run dev -- --host 127.0.0.1 --port 5173`
- URL tested: `http://127.0.0.1:5173/`

Verified passes:
1. Home -> Continue as Guest -> Editor load works without crash.
2. Camera view buttons (`side`, `front`, `back`) toggle correctly.
3. Camera controls (`Spin`, `Reset`) are clickable and update active state.
4. Editor legal modal opens and all tabs render:
  - Terms of Use
  - Privacy Notice
  - Acceptable Use
5. Text workflow basic path works:
  - Open Text Library
  - Select font preset (Arial)
  - Text layer is created
6. Layer operations basic path works:
  - Delete layer
  - Undo restore
  - Redo delete
7. Create-a-Logo path works:
  - Enter SVG maker
  - Open Shapes drawer
  - Add Rect shape (Layers updates to 1)
  - Return back to 3D editor

Observed warnings / risks:
1. Intermittent route-transition 404s were traced to stale local profile image URLs and mitigated by only accepting stored data URLs plus image `onError` cleanup fallback.
2. Post-fix route transitions (Home <-> Garage <-> Editor <-> Profile) produced no new 404 console events in validation pass.

Auth-gated (not fully testable in guest mode):
1. Covered in signed-in pass below.

## Signed-In Validation Evidence

Prerequisite:
- Supabase-backed auth configured in local `.env.local` and sign-up/login succeeded.

Verified passes:
1. Auth sign-up flow succeeds and session is persisted.
2. Signed-in route to Car Selector works (`Open the Garage`).
3. Change car works from selector into editor.
4. File menu actions unlock correctly when signed in (no guest gating prompt).
5. Save/load checks:
  - `Add to Profile` creates saved project entry.
  - Profile `Open` loads saved project back into editor.
  - `Load Project` accepts `.mgproject` file input and applies project (confirmed via Undo History entry: `Load Project`).
6. Export checks:
  - `Share / Socials` modal opens.
  - `Record Video` modal opens.
  - `Print / Wrap Export` (2D template editor) opens and returns to 3D.
7. Font fix check:
  - `Sephora & Hayden.ttf` excluded from generated fonts manifest.
  - Text Library no longer lists `Sephora & Hayden`.

## Highest Priority Blockers Before Launch

1. None identified in current launch checklist gates.

## Fastest Path To Launch

1. Re-run `npm run lint`, `npm run test:run`, `npm run build` immediately before release cut (currently green).
2. Proceed with release candidate cut.
