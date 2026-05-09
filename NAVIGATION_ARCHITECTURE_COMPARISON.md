# Navigation & Persistence Architecture Comparison

## Current System vs. Best Practices

### 1. BROWSER BACK BUTTON NAVIGATION

#### ✅ What's Already Implemented
- **popstate listener** (App.tsx:311-319) listens for Safari/browser back button
- **window.history.pushState** (App.tsx:333) tracks screen changes (home→selector→editor→profile)
- History state stores `{ mygarage: true, screen: 'editor' }` so back button can restore the screen

**Current Flow:**
```
Home → Selector → Editor → Profile → Back → Editor → Back → Selector → Back → Home
```

#### ❌ What's Missing
- **No project context in URL** — The URL is `?screen=editor` regardless of which project is open
- **No project ID preservation in history** — Hitting back from Profile doesn't restore which project was being edited
- **Back button shows selector, not the editor state** — If you were editing "2024 Mustang wrap" and went to Profile, back takes you to the selector page, not back to that specific project

**What Best Practices Expect:**
- Project ID in URL like `?screen=editor&projectId=abc-123-def`
- Back button restores the exact editor state + selected project
- Forward button (if you went back) restores to Profile with full context

---

### 2. PAGE RELOAD / BROWSER RELOAD BUTTON

#### ✅ What's Already Implemented
- URL params are read on startup (readScreenFromUrl() → App.tsx:52-55)
- If you reload while on `?screen=editor`, you'll see the editor screen load

#### ❌ What's Missing
- **Editor state is lost on reload** — All layers, paint colors, stripes, text, etc. are in Zustand store which is wiped
- **Selected car is lost** — selectedCar lives in Zustand and isn't persisted; reload clears it
- **No project auto-save** — The current work is not being periodically saved
- **Reload redirects to selector** — Zustand store is empty, so App.tsx:337-340 detects `!selectedCar` and forces screen back to 'selector'

**Current Behavior:**
```
User editing 3D car → Reloads page (Cmd+R / Safari refresh)
  → Loses all layers, paint, text, decals, stripes
  → Zustand store resets to defaults
  → App forces screen='selector' because selectedCar is null
  → User is now on car selector page (lost progress)
```

**What Best Practices Expect:**
- Page reload restores the exact editor state you were in
- A "frozen" state is saved somewhere (localStorage or sessionStorage)
- On reload, check for a saved session and restore it automatically
- User stays in the editor, not kicked back to selector

---

### 3. CURRENT SAVING MECHANISM

#### ✅ What's Already Implemented
- **localStorage storage** with key `mygarage-profile-saved-projects` (savedProjects.ts:24)
- **readSavedProjects()** reads the list of saved project cards
- **loadFullProjectByIdWithCloud()** loads a full project from localStorage or cloud (Supabase)
- **saveProfile()** in editorStore.ts can write the current project to storage
- **Cloud sync** (Supabase) for authenticated users — projects persist across devices

**Current Manual Save Flow:**
```
User edits → User clicks "Save Project" button (presumably TopBar.tsx)
  → saveProfile() called
  → Project JSON written to localStorage OR cloud (Supabase)
  → Project appears in ProfilePage saved projects list
  → User can open it later
```

#### ❌ What's Missing
- **No auto-save** — Changes aren't periodically saved to localStorage
- **No transient session save** — If browser crashes or page reloads, work is lost
- **No diff tracking** — Can't tell if the project was modified since last save
- **No "unsaved changes" indicator** — User doesn't know if they need to save
- **Save button not visible in Mobile Editor** — Current mobile layout has no save affordance
- **No session restoration** — After reload, there's no attempt to restore the last edited project

**What Best Practices Expect:**
- Auto-save every 10-30 seconds to a "draft" version
- Show "Last saved at 2:45 PM" or a spinner while saving
- On page load, detect if there's a draft/session and offer to restore
- Distinguish between "saved to profile" and "draft in session"
- Unsaved changes should show a warning on navigation away

---

### 4. SESSION MANAGEMENT ON RELOAD

#### ✅ What's Already Implemented
- **Guest session** stored in sessionStorage (GuestAuthModal.tsx, HomePage.tsx)
  - `AUTH_SESSION_KEY` holds guest session token
  - Survives page reload within same browser tab
- **Permanent auth** stored in localStorage (AUTH_LOCAL_KEY)
  - Survives browser restart
- **Zustand store** persists editor state within the page lifetime

#### ❌ What's Missing
- **No "current project session"** — sessionStorage doesn't track which project you were editing
- **No editor state backup** — Zustand store state isn't saved anywhere for reload recovery
- **No session metadata** — No timestamp of last activity, no "resume" prompt
- **No tab sync** — If you open the site in a new tab, it doesn't know about the project in the other tab

**What Best Practices Expect:**
```
Tab 1: Editing "2024 Mustang" → User refreshes (Cmd+R)
  → sessionStorage contains: { projectId: "abc-123", screen: "editor" }
  → On page load, App checks sessionStorage
  → Restores Zustand store from localStorage backup
  → User is back in the exact editor with their project
```

---

### 5. PROJECT ID & URL PERSISTENCE

#### Current URL Structure
```
https://mygaragewrapstudio.com/                    (home)
https://mygaragewrapstudio.com/?screen=selector   (car selector)
https://mygaragewrapstudio.com/?screen=editor     (editor — any project)
https://mygaragewrapstudio.com/?screen=profile    (profile)
```

#### ❌ Missing
- **No project ID in URL** → Can't deep link to a specific project
- **Can't share "edit this project" link** → URL doesn't encode which project to load
- **History doesn't track projects** → Back from profile loses context

#### Best Practice URL Structure
```
https://mygaragewrapstudio.com/                                    (home)
https://mygaragewrapstudio.com/?screen=selector                   (car selector)
https://mygaragewrapstudio.com/?screen=editor&projectId=abc-123   (editor + project)
https://mygaragewrapstudio.com/?screen=profile                    (profile)
```

---

## PROPOSED CHANGES (Summary)

### Phase 1: URL & History (Low effort, high impact)
1. Add `projectId` query param when navigating to editor
2. Track projectId in `window.history.pushState` state
3. Restore projectId on popstate (back button)
4. Build a URL builder that includes projectId: `buildUrlForScreen('editor', 'abc-123')`

### Phase 2: Auto-Save & Session Storage (Medium effort)
1. Add `sessionStorage` backup of current project ID + editor state snapshot
2. Add auto-save function that runs every 15 seconds if anything changed
3. On app load, check sessionStorage for an abandoned session and prompt to resume
4. Save only a lightweight summary to sessionStorage, full JSON to localStorage

### Phase 3: Page Reload Recovery (Medium effort)
1. On app mount, check if `screen=editor` and `projectId` exist in URL
2. If yes, load that project from localStorage/cloud and populate Zustand store
3. Check sessionStorage for a state backup and restore it
4. Show a "Resuming your project..." spinner briefly

### Phase 4: Unsaved Changes & Save Indicator (Low effort)
1. Track if editor state differs from last saved project
2. Show "Unsaved changes" badge in TopBar on mobile/desktop
3. Show "Auto-saving..." spinner when sessionStorage is updated
4. Prompt "Save changes?" if user navigates away with unsaved changes

### Phase 5: Tab Sync (Optional, low priority)
1. Use `storage` event listener to sync state across tabs in same origin
2. Show "This project is open in another tab" warning

---

## COMPARISON TABLE: Current vs. Proposed

| Feature | Current | Best Practice | Effort |
|---------|---------|----------------|--------|
| **Back button navigation** | Screen only | Screen + Project ID | Low |
| **Deep linking projects** | ❌ Not possible | ✅ ?screen=editor&projectId=X | Low |
| **Page reload recovery** | ❌ Loses all state | ✅ Restores exact state | Medium |
| **Auto-save** | ❌ Manual only | ✅ Every 15 sec | Medium |
| **Unsaved indicator** | ❌ None | ✅ Show badge/spinner | Low |
| **Session restore prompt** | ❌ None | ✅ "Resume last edit?" | Low |
| **Tab sync** | ❌ None | ✅ Detect & warn | Optional |

---

## RISK ANALYSIS

### If we DON'T implement this:
- **User frustration**: "I was editing my wrap design and reloaded by accident—everything's gone!"
- **Data loss**: No auto-save means manual saves are easily forgotten
- **Bad UX**: Back button doesn't behave like other sites (doesn't restore project context)
- **No deep linking**: Can't send "edit this design" links to collaborators
- **Browser history broken**: Forward/back buttons feel "stuck"

### If we implement it correctly:
- ✅ Matches user expectations from other web apps (Gmail, Figma, etc.)
- ✅ Prevents accidental data loss
- ✅ Back/forward buttons work intuitively
- ✅ Users can share "edit this" links
- ✅ Cross-device sync works better (Supabase already supports it)

---

## RECOMMENDED EXECUTION ORDER

1. **Start with Phase 1 (URL)** — Adds projectId param, fixes back button history (1–2 hours)
2. **Then Phase 2 (Session storage)** — Adds auto-save to sessionStorage (2–3 hours)
3. **Then Phase 3 (Reload recovery)** — Load project on page mount (1–2 hours)
4. **Then Phase 4 (Indicators)** — Show unsaved/saving UI (1 hour)
5. Optionally Phase 5 (Tab sync) — Nice-to-have, can wait

**Total effort:** ~1–2 days of development

---

## QUESTIONS FOR YOU

Before I start implementing, please confirm:

1. **Should we auto-save?** How often? Every 10 sec? 30 sec? Only on layer/paint changes?
2. **Partial vs. full backup in sessionStorage?** Save just `{ projectId, lastSaveTime }` or full Zustand state?
3. **Should page reload stay in editor?** Or should it kick back to selector as a safety measure?
4. **Guest vs. Authenticated users** — Do guests get session restore, or just authenticated users?
5. **Cloud vs. local?** For guests, save to localStorage only? For auth users, try cloud first?
6. **UI for unsaved changes?** Where should we show "Saving..." and "Unsaved changes" badges?

