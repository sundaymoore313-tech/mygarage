# MyGarage 3D Editor Pro Launch Checklist

## Non-Negotiable Constraint

This checklist is **polish and production-hardening only**.

- Do not change existing behavior for:
  - orbit camera flow
  - decal placement basics
  - text creation/edit flow
  - paint/color workflows
  - existing split/stripe/tint mechanics
- Any task that would alter user-facing behavior must be marked as a separate optional enhancement and excluded from this launch scope.

---

## Definition of Done (Pro Editor Page)

The 3D editor is considered pro-ready when all of the following are true:

1. Reliability
- No blocking runtime errors during a standard 30-minute editing session.
- No missing imports/modules in dev or build.
- App recovers gracefully from failed asset loads.

2. Predictability
- Viewport state, layer state, and export output are consistent.
- Save/load preserves all expected layer and paint properties.

3. Performance
- Typical project interactions feel responsive on desktop.
- Heavy operations show progress/feedback instead of appearing frozen.

4. Production Confidence
- Print/export warnings are clear and actionable.
- Legal and rights confirmations are visible before export actions.

---

## Phase 1: Stability Baseline (Must Pass First)

### 1. Build and Runtime Integrity
- [ ] `npm run build` passes consistently.
- [ ] No unresolved import/module references in editor-related files.
- [ ] Dev server reload does not produce red-overlay blocking errors.

Pass criteria:
- Three consecutive successful builds after clean restart.

### 2. Error Boundaries and Failure UX
- [ ] Add editor-level error boundary for render failures.
- [ ] Add friendly fallback UI when model/asset fails to load.
- [ ] Add retry action for failed manifest/model fetches.

Pass criteria:
- Simulated failure paths show fallback messages and recover without page reload.

### 3. Regression Smoke Coverage
- [ ] Add smoke test checklist for core unchanged flows:
  - orbit camera
  - add/select decal
  - add/edit text
  - car color updates
  - split/stripe/tint toggles
- [ ] Document expected behavior snapshots.

Pass criteria:
- All smoke checks pass before each merge.

---

## Phase 2: Pro Workflow Confidence (No Core Behavior Changes)

### 4. Layer and Selection Reliability
- [ ] Verify multi-select edge cases do not desync selection state.
- [ ] Verify drag reorder never drops/duplicates layers unexpectedly.
- [ ] Ensure rename, duplicate, lock, hide are deterministic.

Pass criteria:
- 100 action stress test (reorder/select/duplicate/delete) completes with no state corruption.

### 5. Inspector and Panel Validation
- [ ] Clamp invalid numeric inputs safely.
- [ ] Ensure disabled states are visually obvious and functionally enforced.
- [ ] Ensure panel open/close state never blocks editor input unexpectedly.

Pass criteria:
- Invalid inputs do not break rendering or produce NaN state.

### 6. Save/Load Trust
- [ ] Confirm all relevant fields serialize/deserialize correctly.
- [ ] Verify local/cloud sync does not silently drop data.
- [ ] Add warning if save is partial/fallback.

Pass criteria:
- 10 random projects round-trip save/load without data drift.

---

## Phase 3: Export Readiness (Print + Social + Video)

### 7. Print Export Hardening
- [ ] Validate capture pipeline with multiple car models.
- [ ] Ensure guide overlays behave as labeled in exports.
- [ ] Add pre-export validation summary (dimensions/settings sanity).

Pass criteria:
- Export succeeds for all supported view presets without blank/corrupt panels.

### 8. Social and Video Export Guardrails
- [ ] Add clear progress and completion states.
- [ ] Improve failure messaging for unsupported recording MIME types.
- [ ] Ensure memory cleanup after repeated exports.

Pass criteria:
- 10 repeated social/video exports complete with no crash or frozen UI.

---

## Phase 4: Performance and Polish

### 9. Interaction Performance
- [ ] Profile editor open and first interaction times.
- [ ] Reduce expensive re-renders in panel-heavy interactions.
- [ ] Add loading skeletons/placeholders where operations exceed instant response.

Pass criteria:
- No severe frame hitches during common editing operations on target desktop machine.

### 10. Large Project Resilience
- [ ] Test with high layer counts and large assets.
- [ ] Ensure UI remains responsive under heavy scenes.
- [ ] Add clear user feedback for long operations.

Pass criteria:
- Editor remains usable with stress project profile and does not crash.

---

## Release Gate Checklist

All must be true before calling the editor page pro-ready:

- [ ] Build passes
- [ ] Core behavior smoke tests pass (orbit/text/decals/color unchanged)
- [ ] No P0/P1 runtime bugs open
- [ ] Save/load round-trip checks pass
- [ ] Print/social/video export checks pass
- [ ] Legal/risk notices visible in required flows
- [ ] Performance sanity checks pass

---

## Scope Control Rules

To avoid accidental behavior drift during launch hardening:

1. Tag all PRs as one of:
- `stability`
- `validation`
- `error-handling`
- `performance`
- `ux-polish`
- `behavior-change` (out of scope for this launch)

2. Reject changes that modify core interaction semantics unless explicitly approved.

3. For each merged change, include:
- what was fixed
- what behavior was intentionally unchanged
- how it was validated
