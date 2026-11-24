# ARC // Retro-Style Personal Productivity PWA

> Simple, tactile, offline-first personal productivity progressive web application with zero build step, zero dependencies, and an authentic 8-bit arcade aesthetic.

![ARC Version](https://img.shields.io/badge/version-1.3.2-E0A526?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-Installable-2A9D8F?style=flat-square)
![Stack](https://img.shields.io/badge/stack-HTML%20%7C%20CSS%20%7C%20Vanilla%20ES%20Modules-D9534F?style=flat-square)
![Offline](https://img.shields.io/badge/offline-Service%20Worker%20%2B%20IndexedDB-2B2B2B?style=flat-square)

---

## What's New in v1.3.2 (PWABuilder & App Store Readiness)

1. **Square High-Res PNG Icons (`icons/icon-192.png`, `icons/icon-512.png`, `icons/icon-maskable.png`)**:
   - Generated genuine 192x192 PNG and 512x512 PNG icons with `purpose: "any"`.
   - Generated 512x512 maskable PNG icon with a 20% safe zone margin for Android adaptive icon cropping.
2. **App Store Showcase Screenshots (`icons/screenshot-mobile.png`, `icons/screenshot-desktop.png`)**:
   - Added 750x1334 mobile screenshot (`form_factor: "narrow"`).
   - Added 1280x800 desktop screenshot (`form_factor: "wide"`).
3. **Explicit Service Worker Registration & Store Metadata**:
   - Added direct Service Worker registration in `index.html` to satisfy PWABuilder's static scanner.
   - Enhanced `manifest.webmanifest` with `id: "/"`, `start_url: "/"`, `scope: "/"`, `lang: "en"`, and `dir: "ltr"`.

---

## What's New in v1.3.1

1. **Spotlight Tracking & Scroll Alignment Fix**:
   - Replaced asynchronous smooth scrolling with synchronous layout scrolling (`behavior: 'auto'`) during tour transitions.
   - Removed laggy CSS positional transitions on `.retro-tour-spotlight` that caused the spotlight box to decouple from targets during view transitions.
   - Added active target frame-tracking loop (`lockOntoTarget`) and global captured scroll listener (`capture: true`) to ensure the spotlight remains pixel-perfect during any scroll or resize.
   - Added `scroll-margin-top` and `scroll-margin-bottom` to `.retro-card` so cards are never tucked under the top bar or bottom navigation bar.

2. **Universal Section Refresh Buttons**:
   - Added a tactile, retro ↻ refresh button to the top-right corner of every section across HOME, FOCUS, and SETTINGS screens.
   - Tapping any refresh button displays a "REFRESHING SYSTEM..." toast, animates a retro spin, and cleanly reloads the entire PWA.

---

## What's New in v1.3.0

1. **Feature-Agnostic Guided Onboarding Tour (`js/onboarding.js`, `js/tour-steps.js`, `css/onboarding.css`)**:
   - **First-Launch Experience**: Clean retro welcome prompt with "TAKE THE TOUR" and "SKIP, I'LL EXPLORE" (zero upfront permission demands).
   - **Retro Spotlight Overlay**: Dimmed backdrop masking the application with an animated pixel-bordered spotlight locked around each active target element.
   - **Auto-Positioning Tooltip**: Floats cleanly within the mobile/desktop viewport, displays step counter (`3 / 15`), and features retro BACK, NEXT, and SKIP actions (`FINISH` on the last step).
   - **Seamless Tab Switching**: Automatically switches between HOME, FOCUS, and SETTINGS tabs and scrolls targets smoothly into view.
   - **Versioned Mini-Tours**: Uses `TOUR_VERSION` semver logic. When a returning user arrives after new steps are released (`since > lastTourVersion`), a "WHAT'S NEW IN ARC" mini-tour runs only for the new features.
   - **Accessible & Touch-Friendly**: Full keyboard navigation (ArrowRight/ArrowLeft/Esc), focus trap, `aria-live` screen reader announcements, `prefers-reduced-motion` support, and 44px+ tap targets.
   - **Replay Anytime**: Dedicated "REPLAY TUTORIAL" button in Settings; resetting all system data re-triggers the first-time tour.

2. **Procedural 8-Bit Ambient Noise Generator (`js/sound.js`)**:
   - Zero external audio files: 100% offline procedural Web Audio synthesis adding 0 kB to network assets.
   - **3 Hand-Crafted Focus Soundscapes**:
     - 📼 **CRT Hum & Warm Tape Hiss**: Band-pass filtered white noise combined with subtle 60Hz and 120Hz transformer hum, replicating a vintage CRT terminal.
     - 🌧️ **8-Bit Rainy Night**: Multi-pole pink noise passed through a resonant low-pass filter modulated by a 0.25Hz LFO to mimic raindrops falling on glass.
     - 🌌 **Deep Space Brown Noise**: Integrated Brownian noise rumble designed for deep work, ADHD focus, and high sensory isolation.
   - **Seamless Focus Integration**:
     - Controls conveniently located directly on the **FOCUS** tab.
     - Auto-plays during active focus sessions and seamlessly pauses during breaks and timer pauses.
     - Real-time volume slider (0–100%) with logarithmic gain ramps to prevent audio popping.
     - "TEST PLAY" preview button to test audio on demand without starting the timer.
   - Multi-tab synchronization and backup export/import support.

3. **Session-End Web Audio Synthesizer (`js/sound.js`)**:
   - 4 selectable custom-synthesized chimes (**Chime** arpeggio, **Bell** resonance, **Retro 8-bit** arcade victory fanfare, **Soft Marimba** wooden pluck) + distinct two-tone **Break Over** chime.
   - Master volume slider (0–100%), sound on/off toggle, preview buttons, and "repeat until dismissed" (repeats 3 times, 5s apart).
   - In-app retro `SESSION COMPLETE!` modal that terminates repeating audio on tap.
   - AudioContext kept alive from initial user interaction; background-catchup plays audio once upon foreground return if session completed while tab was hidden.

4. **Central Reactive State Store (`js/store.js`)**:
   - Central pub/sub store ensuring changes in settings (Arc dates, theme, Pomodoro durations, daily reminders) and data (tasks, goals, sessions) update affected sections instantly without page reloads.
   - Cross-tab / multi-window synchronization via `BroadcastChannel` (with `storage` event fallback).
   - Debounced inputs and inline retro error messages (e.g. Arc end date must be after start date).
   - Scheduled local midnight rollover timer and `visibilitychange` date reconciliation.

5. **Focus Shield (`js/shield.js`)**:
   - Distraction tracker with presets (Instagram, YouTube, X, Facebook, TikTok, Snapchat, Reddit, WhatsApp, Netflix) and custom apps.
   - Page Visibility and Blur/Focus monitor: tracks user leaves during active focus sessions, shows duration away warnings, and sends away alerts after 30s away.
   - **Strict Mode**: marks session "broken" if leaves exceed user-defined threshold $N$ (default 3), disqualifying it from streak and heatmap.
   - **Timed Allowed-Use Budget**: "I'm Opening [App]" countdown timer; triggers notification and alarm when daily limit is reached and logs actual self-reported time.
   - **Active Focus Cooldown**: 10-second friction wait prompt when attempting to open a distraction during an active focus session.
   - **Distraction Stats**: Today and 7-day usage breakdown, clean focus session counter, and clean session streak.
   - **Reality-Check Helper**: "SET UP REAL BLOCKING" modal with step-by-step Android Digital Wellbeing instructions.

---

## File Structure

```text
ARC/
├── index.html              # Main HTML markup, modals, and tab views
├── manifest.webmanifest    # PWA configuration and standalone rules
├── sw.js                   # Service Worker (Cache-first v1.3.0, notifications, offline)
├── css/
│   ├── style.css           # Retro design system, CRT themes, scanlines, range slider
│   └── onboarding.css      # Retro spotlight overlay, pixel cutout, and tooltip styles
├── js/
│   ├── app.js              # Application entry point & bootstrapping
│   ├── tour-steps.js       # Central configuration for guided onboarding tour steps
│   ├── onboarding.js       # Feature-agnostic spotlight tour engine & mini-tour manager
│   ├── store.js            # Central reactive store, pub/sub, BroadcastChannel, debouncing
│   ├── sound.js            # Web Audio API chime, ambient noise, & break synthesizer
│   ├── shield.js           # Focus Shield leave detector, budgets, & Digital Wellbeing guide
│   ├── db.js               # IndexedDB engine (tasks, goals, sessions, shieldUsage, shieldLeaves)
│   ├── ui.js               # UI renderer, modals, gestures, reactive subscriptions
│   ├── timer.js            # Pomodoro countdown (Date.now()), Wake Lock, sound & shield hooks
│   ├── notifications.js    # Task reminders, Notification Triggers, daily alerts
│   ├── heatmap.js          # SVG 16-week contribution grid with clean session tooltips
│   ├── streak.js           # Streak engine & midnight rollover logic (filters broken sessions)
│   └── settings.js         # LocalStorage config, themes, audio/shield settings, JSON backup
└── icons/
    ├── favicon.svg         # 32x32 crisp favicon
    ├── icon-192.svg        # 192x192 pixel-art PWA icon
    ├── icon-512.svg        # 512x512 pixel-art PWA icon
    └── icon-maskable.svg   # 512x512 maskable icon with 20% safe zone
```

---

## How to Add a Tour Step (Developer Guide)

The onboarding tour engine is completely **feature-agnostic**. Adding a new tour step requires zero engine modifications:

1. **Add `data-tour` to your HTML or component**:
   ```html
   <div class="my-feature-card" data-tour="my-feature">
   ```
2. **Add a step object to `js/tour-steps.js`**:
   ```javascript
   {
     id: 'my-feature',
     target: '[data-tour="my-feature"]',
     tab: 'home', // 'home' | 'focus' | 'settings' | 'global'
     title: 'MY RETRO FEATURE',
     description: 'Explain the core benefit in at most two clear sentences.',
     since: '1.4.0'
   }
   ```
3. **Bump `TOUR_VERSION` in `js/tour-steps.js`**:
   - Increment `TOUR_VERSION = '1.4.0'`.
   - Returning users who have already seen `1.3.0` will automatically be offered a **"WHAT'S NEW"** mini-tour highlighting only the steps introduced in `1.4.0`.

---

## How to Run Locally

Because ARC uses standard ES Modules and Service Workers, it must be served over `http://localhost` (or HTTPS), not loaded directly via `file://`.

### Option 1: Python 3 (Built-in)
```bash
python -m http.server 8000
```
Open [http://localhost:8000](http://localhost:8000) in your browser.

### Option 2: Node.js `npx serve`
```bash
npx serve .
```

---

## How to Deploy to Netlify

Because ARC has **no build step, no bundlers, and no npm packages**, deploying to Netlify takes under 1 minute.

### Method 1: Netlify Drag & Drop (Zero Git, 30 seconds)
1. Go to [app.netlify.com/drop](https://app.netlify.com/drop) and log into your free Netlify account.
2. Drag and drop the entire `ARC` folder (`d:\ARC`) into the upload box in your browser.
3. Netlify will instantly upload the static files and generate a free HTTPS URL (e.g. `https://arc-retro.netlify.app`).
4. Open the URL on your Android or desktop browser to test installability ("Add to Home Screen").

### Method 2: Git Repository (Continuous Deployment)
1. Push your `ARC` repository to GitHub, GitLab, or Bitbucket.
2. In your Netlify dashboard, tap **Add new site** $\rightarrow$ **Import an existing project**.
3. Select your repository.
4. Set the build settings:
   - **Build command**: *(leave completely blank)*
   - **Publish directory**: `.` (or leave blank)
5. Tap **Deploy ARC**.
6. The included `netlify.toml` automatically configures headers so `sw.js` is never stale and `manifest.webmanifest` is served with the correct MIME type.

---

## How to Remove the Browser Address Bar in the APK (Digital Asset Links)

When converting your PWA into an Android APK using **PWABuilder** (Trusted Web Activity), Android displays a browser URL bar at the top by default for security.

To remove the address bar completely and achieve a 100% full-screen native app experience:

### 1. The AssetLinks Requirement
Android verifies that you own the website by requesting `https://<your-domain>/.well-known/assetlinks.json`.

- When deploying to **Netlify** (e.g. `https://arc-retro.netlify.app`), the `/.well-known` folder is served automatically at the domain root with CORS headers configured in `netlify.toml`.
- When deploying to **GitHub Pages**:
  - The site must be hosted at a **root domain** (e.g. `https://<username>.github.io`), not a subpath (`https://<username>.github.io/arc/`), because Android strictly checks the root `.well-known` directory.
  - The repository includes an empty `.nojekyll` file at the root, instructing GitHub Pages to serve hidden dotfolders like `.well-known`.

### 2. Updating with your PWABuilder SHA-256 Fingerprint
1. Package your app at [PWABuilder.com](https://www.pwabuilder.com/).
2. On the Android APK download screen, PWABuilder provides your **Package Name** (e.g. `app.netlify.arc_retro.twa`) and your **SHA-256 certificate fingerprint**.
3. Open [.well-known/assetlinks.json](file:///d:/ARC/.well-known/assetlinks.json) in your project.
4. Replace `package_name` and `sha256_cert_fingerprints` with the values given by PWABuilder:
   ```json
   [
     {
       "relation": ["delegate_permission/common.handle_all_urls"],
       "target": {
         "namespace": "android_app",
         "package_name": "app.netlify.arc_retro.twa",
         "sha256_cert_fingerprints": [
           "14:6D:E9:7F:0F:52:EA:4B:E5:43:8E:87:07:18:7B:3B:71:3F:65:8B:82:76:1E:20:C7:E0:F7:E2:4F:4A:04:1B"
         ]
       }
     }
   ]
   ```
5. Deploy or drag-and-drop the updated files to Netlify or GitHub Pages.
6. Install the generated APK on your phone: Android will verify the asset links file and the address bar will vanish!

---

## Manual Test Checklist

Use this checklist to verify every feature:

### 1. Procedural 8-Bit Ambient Noise Generator
- [ ] In the **FOCUS** tab, locate the **AMBIENT NOISE (PROCEDURAL)** card.
- [ ] Tap **TEST PLAY** on each soundscape preset:
  - [ ] **CRT Hum & Tape Hiss**: Soft filtered tape hiss with warm 60Hz/120Hz CRT monitor hum.
  - [ ] **8-Bit Rainy Night**: Resonant rainfall effect with organic undulating intensity.
  - [ ] **Deep Space Brown Noise**: Heavy, deep rumble ideal for ADHD focus.
- [ ] Adjust the volume slider (0% to 100%) and verify smooth, click-free volume adjustment.
- [ ] Check **AUTO-PLAY** during focus:
  - [ ] Tap **START** on a focus session: ambient sound starts playing automatically.
  - [ ] Tap **PAUSE**: ambient sound fades out gracefully.
  - [ ] Tap **RESUME**: ambient sound resumes.
  - [ ] When focus session completes and transitions to Break: ambient sound auto-pauses.

### 2. Session-End Sound & Modal
- [ ] Open the **SETTINGS** tab and verify the **SESSION SOUNDS** card is visible.
- [ ] Tap **PREVIEW CHIME** for each sound preset (**Chime**, **Bell**, **Retro 8-bit**, **Soft Marimba**). Verify clear, distinct synthesized audio without static.
- [ ] Tap **PREVIEW BREAK** and verify the distinct two-tone descending call plays.
- [ ] Adjust the volume slider (e.g. to 30%) and preview again to confirm volume scaling.
- [ ] In the **FOCUS** tab, start a 1-minute test focus session. When it reaches 0:
  - [ ] Sound alert plays (repeating up to 3 times, 5s apart if enabled).
  - [ ] In-app **SESSION COMPLETE!** modal opens.
  - [ ] Tapping **TAKE BREAK** immediately silences any repeating sound and advances to Short Break.
- [ ] Minimize/switch away from the tab when 10 seconds remain. Verify that upon tab return, the catch-up routine plays the sound once and displays the completion modal.

### 3. Live, Reactive Updates Across All Sections
- [ ] **Arc Name & Dates**: In **SETTINGS**, edit the Arc title or start/end dates. Tap **SAVE ARC DATES**. Switch to **HOME** (or view in side-by-side tabs) and verify the Arc countdown, day counter, and progress bar updated instantly with no page reload.
- [ ] **Input Validation**: Set an Arc End Date that is before the Start Date. Verify an inline retro error appears: `! END DATE MUST BE AFTER START DATE`.
- [ ] **Theme Toggle**: Tap **CRT** in the top bar or select **CRT Green** in settings. Verify the palette switches immediately with no screen flicker and persists across reloads.
- [ ] **Pomodoro Durations**: While the timer is idle, change the Focus Duration from 25 to 30 min. Verify the big countdown display updates immediately to `30:00`. While the timer is running, change the duration and verify the toast `APPLIES NEXT PHASE` appears.
- [ ] **Tasks & Goals**: Add a task with a linked goal. Verify that checking the task immediately updates the goal's progress bar, the streak flame counter, and the activity heatmap.
- [ ] **Multi-Tab Sync**: Open ARC in two browser tabs side-by-side. Complete a task or toggle the theme in Tab A; verify Tab B updates instantaneously via the BroadcastChannel.

### 4. Focus Shield & Accountability
- [ ] In the **FOCUS** tab, locate the **FOCUS SHIELD** card. Toggle Shield ON.
- [ ] Start a focus session. Switch to another browser tab or minimize ARC for 5 seconds.
- [ ] Return to ARC. Verify a retro warning modal appears: `YOU LEFT THE APP FOR ~1 MIN. STAY ON TARGET. (Leaves: 1)`.
- [ ] **Strict Mode**: In Settings, turn on **Strict Mode** with a max of 2 leaves. Leave the app 3 times. Verify the session is flagged as **BROKEN** and does not increment the streak.
- [ ] **Timed Budget ("I'm opening")**: Tap **I'M OPENING** on Instagram.
  - [ ] If during a break: allowed immediately; countdown timer starts.
  - [ ] If during an active focus session: 10-second cooldown friction dialog appears with `WAIT (10S)` countdown before confirmation is enabled.
  - [ ] When budget expires, alarm chime and notification trigger.
  - [ ] Tap **DONE (LOG TIME)** to log self-reported minutes in IndexedDB.
- [ ] **Digital Wellbeing Guide**: Tap **SET UP REAL BLOCKING** and verify the step-by-step Android OS instructions display.

### 5. Interactive Onboarding Tour & What's New Mini-Tours
- [ ] **First Launch**: Open ARC in a private/incognito window (or clear `localStorage`).
  - [ ] Welcome modal appears: `// WELCOME TO ARC`. Verify no browser permissions are prompted.
  - [ ] Tap **TAKE THE TOUR**:
    - [ ] Screen dims with high-contrast spotlight around target elements and animated pixel border.
    - [ ] App underneath is blocked from receiving tap clicks.
    - [ ] Step counter displays `1 / 15` on Step 1 (`// YOUR WHY`).
    - [ ] Tap **NEXT** or press `ArrowRight`: tour advances smoothly to the Arc Countdown card.
    - [ ] Tap **BACK** or press `ArrowLeft`: tour returns to previous step.
    - [ ] Cross-screen transition: when advancing past Step 7, tab automatically switches to the **FOCUS** tab and scrolls down to the timer, focus log, ambient noise, and focus shield.
    - [ ] On Step 15 (last step), button changes to **FINISH**. Tapping **FINISH** closes the tour and persists `completed: true`.
- [ ] **Keyboard Accessibility**: Verify `Escape` skips the tour; `Tab` / `Shift+Tab` traps focus exclusively within tooltip buttons.
- [ ] **Skip Tour**: Reload in a clean session and tap **SKIP, I'LL EXPLORE**. Tour closes immediately and sets `skipped: true`.
- [ ] **Replay Tour**: Go to **SETTINGS**, scroll to Data Backup & Restore, and tap **REPLAY TUTORIAL**. Verify the tour launches immediately from Step 1.
- [ ] **Reset All Data**: Tap **RESET ALL DATA** in Settings. Verify that after reset, refreshing triggers the Welcome modal once again.
- [ ] **Responsive & Themes**: Test tour at 360px viewport width and switch themes to CRT Green / CRT Amber. Verify tooltip stays fully visible on-screen and borders adapt to the retro theme colors.

---

## Known Limitations

1. **Browser Sandboxing**: As a web app, ARC cannot forcibly kill other native apps on Android or iOS. Focus Shield relies on visibility monitoring, friction cooldowns, and self-reported budgets. Real hard blocking requires the device's native Digital Wellbeing settings.
2. **Web Audio Autoplay Policies**: Browsers require a user interaction (such as tapping "START" or "PREVIEW") before the AudioContext can produce sound. ARC handles this by initializing/resuming the context on the first user tap.
3. **Aggressive Mobile OS Sleep**: Deep background sleep on aggressive Android skins (MIUI, Samsung OneUI) may throttle timers. ARC calculates remaining time from `Date.now()`, ensuring complete accuracy when the user wakes the screen.
