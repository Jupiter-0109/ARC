/**
 * ARC - Focus Shield (Distraction Blocker & Accountability Engine)
 * Monitors tab visibility during active focus sessions, tracks self-reported
 * distraction budgets, enforces strict mode, and records clean sessions.
 */

import { store } from './store.js';
import {
  getLocalDateString,
  saveShieldUsage,
  getShieldUsageByDate,
  getAllShieldUsage,
  saveShieldLeave,
  getShieldLeavesByDate,
  getAllShieldLeaves,
  getAllFocusSessions
} from './db.js';
import { showToast, openModal, closeModal, confirmAction } from './ui.js';
import { playSound } from './sound.js';

const SHIELD_STORAGE_KEY = 'arc_shield_config';

export const PRESET_APPS = [
  { name: 'Instagram', limit: 15 },
  { name: 'YouTube', limit: 30 },
  { name: 'X (Twitter)', limit: 15 },
  { name: 'Facebook', limit: 15 },
  { name: 'TikTok', limit: 15 },
  { name: 'Snapchat', limit: 10 },
  { name: 'Reddit', limit: 20 },
  { name: 'WhatsApp', limit: 20 },
  { name: 'Netflix', limit: 30 }
];

const DEFAULT_SHIELD_SETTINGS = {
  enabled: true,
  strictMode: false,
  maxLeaves: 3,
  notifyOnAway: true,
  apps: [
    { id: 'app_insta', name: 'Instagram', limit: 15 },
    { id: 'app_yt', name: 'YouTube', limit: 30 },
    { id: 'app_x', name: 'X (Twitter)', limit: 15 },
    { id: 'app_reddit', name: 'Reddit', limit: 20 }
  ]
};

// Current Active Session Monitoring State
let currentSessionLeaves = 0;
let awayStartTimestamp = null;
let awayNotificationTimeout = null;
let activeSessionIsBroken = false;
let currentFocusSessionId = null;

// Active Distraction Budget Timer State
let activeBudgetTimer = null;
let activeBudgetAppName = null;
let activeBudgetStartMs = null;
let activeBudgetLimitMs = null;

// ============================================================================
// SETTINGS PERSISTENCE & STORE SYNC
// ============================================================================

export function getShieldSettings() {
  const storeVal = store.get('shieldSettings');
  if (storeVal) return storeVal;

  try {
    const raw = localStorage.getItem(SHIELD_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SHIELD_SETTINGS };
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_SHIELD_SETTINGS, ...parsed };
  } catch (e) {
    return { ...DEFAULT_SHIELD_SETTINGS };
  }
}

export function saveShieldSettings(settings) {
  const current = getShieldSettings();
  const updated = {
    enabled: typeof settings.enabled === 'boolean' ? settings.enabled : current.enabled,
    strictMode: typeof settings.strictMode === 'boolean' ? settings.strictMode : current.strictMode,
    maxLeaves: Math.max(1, parseInt(settings.maxLeaves, 10) || current.maxLeaves),
    notifyOnAway: typeof settings.notifyOnAway === 'boolean' ? settings.notifyOnAway : current.notifyOnAway,
    apps: Array.isArray(settings.apps) ? settings.apps : current.apps
  };

  localStorage.setItem(SHIELD_STORAGE_KEY, JSON.stringify(updated));
  store.set('shieldSettings', updated);
  return updated;
}

// Initialize store with shield settings
store.set('shieldSettings', getShieldSettings(), { broadcast: false, notify: false });

// ============================================================================
// FOCUS SESSION LIFECYCLE HOOKS (INVOKED BY TIMER.JS)
// ============================================================================

export function onFocusSessionStarted(sessionId) {
  currentFocusSessionId = sessionId || `session_${Date.now()}`;
  currentSessionLeaves = 0;
  activeSessionIsBroken = false;
  awayStartTimestamp = null;
  clearAwayNotification();
  updateShieldStatusUI();
}

export function onFocusSessionEnded() {
  const result = {
    leavesCount: currentSessionLeaves,
    wasClean: currentSessionLeaves === 0,
    isBroken: activeSessionIsBroken
  };

  currentFocusSessionId = null;
  awayStartTimestamp = null;
  clearAwayNotification();
  updateShieldStatusUI();

  return result;
}

export function isCurrentSessionBroken() {
  return activeSessionIsBroken;
}

export function getCurrentSessionLeaves() {
  return currentSessionLeaves;
}

// ============================================================================
// LEAVE & VISIBILITY DETECTION DURING ACTIVE FOCUS
// ============================================================================

export function initShieldListeners(isFocusActiveChecker) {
  const handleUserLeft = () => {
    const settings = getShieldSettings();
    if (!settings.enabled || !isFocusActiveChecker() || awayStartTimestamp) return;

    awayStartTimestamp = Date.now();

    // 30-second away notification
    if (settings.notifyOnAway && 'Notification' in window && Notification.permission === 'granted') {
      clearAwayNotification();
      awayNotificationTimeout = setTimeout(async () => {
        try {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            reg.showNotification('ARC SHIELD // FOCUS IS RUNNING', {
              body: 'You stepped away from ARC. Return now to protect your focus arc!',
              icon: 'icons/icon-192.svg',
              badge: 'icons/favicon.svg',
              tag: 'shield-away-warning',
              vibrate: [250, 100, 250]
            });
          }
        } catch (e) {
          console.warn('Shield away notification failed:', e);
        }
      }, 30000);
    }
  };

  const handleUserReturned = async () => {
    clearAwayNotification();
    if (!awayStartTimestamp) return;

    const returnTimestamp = Date.now();
    const durationSeconds = Math.round((returnTimestamp - awayStartTimestamp) / 1000);
    awayStartTimestamp = null;

    // Filter tiny blips (< 3 seconds)
    if (durationSeconds < 3) return;

    const settings = getShieldSettings();
    if (!settings.enabled || !isFocusActiveChecker()) return;

    currentSessionLeaves++;
    const durationMin = Math.max(1, Math.round(durationSeconds / 60));

    // Log leave event in IndexedDB
    await saveShieldLeave({
      sessionId: currentFocusSessionId,
      timestamp: returnTimestamp,
      date: getLocalDateString(),
      durationSeconds: durationSeconds,
      reason: 'Tab blur / visibility change away from ARC'
    });

    // Check Strict Mode Limit
    if (settings.strictMode && currentSessionLeaves > settings.maxLeaves) {
      activeSessionIsBroken = true;
      playSound('break_over');
      showRetroLeaveModal(
        durationMin,
        currentSessionLeaves,
        true,
        `STRICT MODE TRIGGERED: Exceeded limit of ${settings.maxLeaves} leaves. This session is marked BROKEN and will not count toward your streak or heatmap.`
      );
    } else {
      showRetroLeaveModal(
        durationMin,
        currentSessionLeaves,
        false,
        `Stay on target! Leave count this session: ${currentSessionLeaves}.`
      );
    }

    updateShieldStatusUI();
    store.emit('shield_data_changed');
  };

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      handleUserLeft();
    } else if (document.visibilityState === 'visible') {
      handleUserReturned();
    }
  });

  window.addEventListener('blur', () => {
    handleUserLeft();
  });

  window.addEventListener('focus', () => {
    handleUserReturned();
  });
}

function clearAwayNotification() {
  if (awayNotificationTimeout) {
    clearTimeout(awayNotificationTimeout);
    awayNotificationTimeout = null;
  }
}

function showRetroLeaveModal(durationMin, totalLeaves, isBroken, details) {
  const modal = document.getElementById('modal-shield-warning');
  if (!modal) {
    showToast(`LEFT FOR ${durationMin} MIN (LEAVES: ${totalLeaves})`);
    return;
  }

  const titleEl = document.getElementById('shield-warning-title');
  const msgEl = document.getElementById('shield-warning-message');
  const detailsEl = document.getElementById('shield-warning-details');

  if (titleEl) {
    titleEl.textContent = isBroken ? '// STRICT MODE: SESSION BROKEN' : '// DISTRACTION WARNING';
  }
  if (msgEl) {
    msgEl.textContent = `YOU LEFT THE APP FOR ~${durationMin} MIN.`;
  }
  if (detailsEl) {
    detailsEl.textContent = details;
  }

  openModal('modal-shield-warning');
}

// ============================================================================
// TIMED ALLOWED-USE BUDGET WORKFLOW
// ============================================================================

export async function openAppBudgetWorkflow(app, isFocusActive) {
  // If focus session is active, require friction cooldown prompt!
  if (isFocusActive) {
    showFocusFrictionCooldown(app, () => {
      startAppBudgetCountdown(app);
    });
  } else {
    // During break or idle, start countdown immediately
    startAppBudgetCountdown(app);
  }
}

function showFocusFrictionCooldown(app, onProceed) {
  const modal = document.getElementById('modal-shield-cooldown');
  const confirmBtn = document.getElementById('shield-cooldown-confirm');
  const waitTimerEl = document.getElementById('shield-cooldown-timer');
  const appNameEl = document.getElementById('shield-cooldown-app-name');

  if (appNameEl) appNameEl.textContent = app.name.toUpperCase();

  let secondsLeft = 10;
  if (confirmBtn) {
    confirmBtn.disabled = true;
    confirmBtn.textContent = `WAIT (${secondsLeft}S)`;
  }
  if (waitTimerEl) waitTimerEl.textContent = `${secondsLeft}s`;

  openModal('modal-shield-cooldown');

  const intervalId = setInterval(() => {
    secondsLeft--;
    if (waitTimerEl) waitTimerEl.textContent = `${secondsLeft}s`;
    if (confirmBtn) confirmBtn.textContent = secondsLeft > 0 ? `WAIT (${secondsLeft}S)` : 'CONFIRM OPEN';

    if (secondsLeft <= 0) {
      clearInterval(intervalId);
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.onclick = () => {
          closeModal('modal-shield-cooldown');
          // Log intentional focus override leave
          saveShieldLeave({
            sessionId: currentFocusSessionId,
            timestamp: Date.now(),
            date: getLocalDateString(),
            durationSeconds: 0,
            reason: `Cooldown override to open ${app.name}`
          });
          onProceed();
        };
      }
    }
  }, 1000);

  const cancelBtn = document.getElementById('shield-cooldown-cancel');
  if (cancelBtn) {
    cancelBtn.onclick = () => {
      clearInterval(intervalId);
      closeModal('modal-shield-cooldown');
    };
  }
}

export async function startAppBudgetCountdown(app) {
  const todayStr = getLocalDateString();
  const allUsage = await getShieldUsageByDate(todayStr);
  const appUsageRecords = allUsage.filter((u) => u.appName.toLowerCase() === app.name.toLowerCase());
  const usedMinutes = appUsageRecords.reduce((acc, u) => acc + (u.minutesUsed || 0), 0);
  const remainingMinutes = Math.max(0, app.limit - usedMinutes);

  activeBudgetAppName = app.name;
  activeBudgetStartMs = Date.now();
  activeBudgetLimitMs = remainingMinutes * 60 * 1000;

  // Open the Active Budget Modal
  const modal = document.getElementById('modal-shield-budget');
  const nameEl = document.getElementById('budget-modal-app-name');
  const timerEl = document.getElementById('budget-modal-countdown');
  const doneBtn = document.getElementById('budget-modal-done-btn');

  if (nameEl) nameEl.textContent = app.name.toUpperCase();
  openModal('modal-shield-budget');

  if (activeBudgetTimer) clearInterval(activeBudgetTimer);

  const updateBudgetCountdown = () => {
    const elapsed = Date.now() - activeBudgetStartMs;
    const remaining = activeBudgetLimitMs - elapsed;

    if (remaining <= 0) {
      if (timerEl) timerEl.textContent = '00:00 - LIMIT REACHED!';
      playSound('break_over');
      if ('Notification' in window && Notification.permission === 'granted') {
        try {
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.ready.then((reg) => {
              reg.showNotification(`ARC SHIELD // ${app.name.toUpperCase()} LIMIT REACHED`, {
                body: `Your daily budget of ${app.limit} minutes for ${app.name} has expired!`,
                icon: 'icons/icon-192.svg',
                badge: 'icons/favicon.svg',
                tag: 'shield-limit-alert'
              });
            });
          }
        } catch (e) {}
      }
    } else {
      const totalSec = Math.ceil(remaining / 1000);
      const m = Math.floor(totalSec / 60);
      const s = totalSec % 60;
      if (timerEl) timerEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
  };

  updateBudgetCountdown();
  activeBudgetTimer = setInterval(updateBudgetCountdown, 1000);

  if (doneBtn) {
    doneBtn.onclick = async () => {
      clearInterval(activeBudgetTimer);
      activeBudgetTimer = null;

      const elapsedMs = Date.now() - activeBudgetStartMs;
      const actualMinutes = Math.max(1, Math.round(elapsedMs / (60 * 1000)));

      await saveShieldUsage({
        appName: app.name,
        date: getLocalDateString(),
        minutesUsed: actualMinutes,
        timestamp: Date.now()
      });

      closeModal('modal-shield-budget');
      showToast(`LOGGED ${actualMinutes} MIN FOR ${app.name.toUpperCase()}`);
      store.emit('shield_data_changed');
    };
  }
}

// ============================================================================
// STATS CALCULATOR
// ============================================================================

export async function calculateShieldStats() {
  const [allUsage, allLeaves, allSessions] = await Promise.all([
    getAllShieldUsage(),
    getAllShieldLeaves(),
    getAllFocusSessions()
  ]);

  const todayStr = getLocalDateString();

  // 1. Today usage per app
  const todayUsage = new Map();
  allUsage.filter((u) => u.date === todayStr).forEach((u) => {
    todayUsage.set(u.appName, (todayUsage.get(u.appName) || 0) + u.minutesUsed);
  });

  // 2. 7-day usage per app
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDaysAgoStr = getLocalDateString(sevenDaysAgo);

  const past7DaysUsage = new Map();
  allUsage.filter((u) => u.date >= sevenDaysAgoStr).forEach((u) => {
    past7DaysUsage.set(u.appName, (past7DaysUsage.get(u.appName) || 0) + u.minutesUsed);
  });

  // 3. Clean focus sessions count
  const cleanSessionsCount = allSessions.filter((s) => s.wasClean && !s.isBroken).length;

  // 4. Consecutive clean streak
  let cleanStreak = 0;
  const sortedSessions = [...allSessions].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  for (const s of sortedSessions) {
    if (s.wasClean && !s.isBroken) {
      cleanStreak++;
    } else {
      break;
    }
  }

  return {
    todayUsage,
    past7DaysUsage,
    totalLeavesCount: allLeaves.length,
    todayLeavesCount: allLeaves.filter((l) => l.date === todayStr).length,
    cleanSessionsCount,
    cleanStreak
  };
}

// ============================================================================
// UI RENDERING & COMPONENT BINDINGS
// ============================================================================

export async function renderShieldCard() {
  const container = document.getElementById('shield-card-container');
  if (!container) return;

  const settings = getShieldSettings();
  const stats = await calculateShieldStats();
  const todayStr = getLocalDateString();
  const todayUsageRecords = await getShieldUsageByDate(todayStr);

  const usageByApp = new Map();
  todayUsageRecords.forEach((u) => {
    usageByApp.set(u.appName.toLowerCase(), (usageByApp.get(u.appName.toLowerCase()) || 0) + u.minutesUsed);
  });

  container.innerHTML = `
    <div class="retro-card" id="focus-shield-card">
      <div class="card-header">
        <h2 class="card-title">&#x1F6E1; FOCUS SHIELD</h2>
        <div style="display:flex; align-items:center; gap:6px;">
          <label for="shield-master-toggle" style="font-size:14px; cursor:pointer;">SHIELD:</label>
          <input type="checkbox" id="shield-master-toggle" class="retro-checkbox" ${settings.enabled ? 'checked' : ''}>
          <button class="btn btn-sm btn-icon section-refresh-btn" title="Refresh entire app" aria-label="Refresh entire app"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M8 3a5 5 0 104.546 2.914.5.5 0 01.908-.417A6 6 0 118 2v1z"/><path d="M8 0l3 2.5-3 2.5V0z"/></svg></button>
        </div>
      </div>

      <div class="honesty-notice" style="margin: 4px 0; font-size:14px;">
        &#x26A0; A web app can't block other apps. Focus Shield helps you stay accountable.
      </div>

      <!-- Shield Status Summary -->
      <div class="setting-row" style="padding: 4px 0; border-bottom: 1px dashed var(--border-color);">
        <span>STRICT MODE: <strong>${settings.strictMode ? `ON (MAX ${settings.maxLeaves} LEAVES)` : 'OFF'}</strong></span>
        <span>CLEAN STREAK: <strong style="color:var(--teal);">${stats.cleanStreak} SESSIONS</strong></span>
      </div>

      <!-- App Distraction Budget List -->
      <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
        <span style="font-family:var(--font-heading); font-size:11px;">DISTRACTION BUDGETS (SELF-REPORTED):</span>
        <button id="add-custom-distraction-btn" class="btn btn-sm">+ CUSTOM</button>
      </div>

      <div class="distraction-list" id="distraction-app-list" style="display:flex; flex-direction:column; gap:8px; margin-top:4px;">
        ${settings.apps.map((app) => {
          const used = usageByApp.get(app.name.toLowerCase()) || 0;
          const pct = Math.min(100, Math.round((used / app.limit) * 100));
          const isOver = used > app.limit;

          return `
            <div class="distraction-item" style="border:1px solid var(--border-color); background:var(--bg-subtle); padding:6px 8px; display:flex; flex-direction:column; gap:4px;">
              <div style="display:flex; justify-content:space-between; align-items:center;">
                <strong style="font-size:17px;">${escapeHTML(app.name)}</strong>
                <div style="display:flex; gap:6px; align-items:center;">
                  <span style="font-size:14px; color:${isOver ? 'var(--tomato)' : 'var(--ink)'}; font-weight:bold;">
                    ${used} / ${app.limit} MIN ${isOver ? '(! OVER)' : ''}
                  </span>
                  <button class="btn btn-sm open-app-budget-btn" data-app-name="${escapeHTML(app.name)}" data-app-limit="${app.limit}">I'M OPENING</button>
                  <button class="btn btn-sm btn-icon remove-shield-app-btn" data-app-id="${app.id}" title="Remove app">&#x2715;</button>
                </div>
              </div>
              <div class="pixel-bar-container" style="height:12px;">
                <div class="pixel-bar-fill" style="width:${pct}%; background-color:${isOver ? 'var(--tomato)' : 'var(--teal)'};"></div>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <!-- Mini Pixel Bar Chart: 7-Day Usage -->
      <div style="margin-top:10px; border-top:1px dashed var(--border-color); padding-top:8px;">
        <div style="display:flex; justify-content:space-between; font-family:var(--font-heading); font-size:10px; margin-bottom:4px;">
          <span>PAST 7-DAY USAGE (MIN):</span>
          <span>TOTAL LEAVES: ${stats.totalLeavesCount}</span>
        </div>
        <div class="mini-pixel-chart" style="display:flex; flex-direction:column; gap:4px;">
          ${Array.from(stats.past7DaysUsage.entries()).slice(0, 5).map(([name, mins]) => {
            const chartPct = Math.min(100, Math.round((mins / 240) * 100));
            return `
              <div style="display:flex; align-items:center; gap:6px; font-size:14px;">
                <span style="width:80px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHTML(name)}</span>
                <div class="pixel-bar-container" style="flex:1; height:10px;">
                  <div class="pixel-bar-fill" style="width:${chartPct}%; background-color:var(--mustard);"></div>
                </div>
                <span style="width:40px; text-align:right;">${mins}m</span>
              </div>
            `;
          }).join('') || '<div style="font-size:14px; color:var(--ink-dim); text-align:center;">No distraction time logged yet this week.</div>'}
        </div>
      </div>

      <!-- Reality Check Helper Button -->
      <button id="open-real-blocking-btn" class="btn btn-primary" style="margin-top:8px; width:100%;">
        &#x2699; SET UP REAL BLOCKING (DIGITAL WELLBEING)
      </button>
    </div>
  `;

  // Attach event handlers
  const masterToggle = container.querySelector('#shield-master-toggle');
  if (masterToggle) {
    masterToggle.addEventListener('change', () => {
      saveShieldSettings({ enabled: masterToggle.checked });
      showToast(masterToggle.checked ? 'FOCUS SHIELD ACTIVE' : 'FOCUS SHIELD PAUSED');
      renderShieldCard();
    });
  }

  // "I'M OPENING" buttons
  container.querySelectorAll('.open-app-budget-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const name = btn.getAttribute('data-app-name');
      const limit = parseInt(btn.getAttribute('data-app-limit'), 10) || 15;
      const isFocusRunning = window.__isFocusTimerRunning ? window.__isFocusTimerRunning() : false;
      openAppBudgetWorkflow({ name, limit }, isFocusRunning);
    });
  });

  // Remove App buttons
  container.querySelectorAll('.remove-shield-app-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-app-id');
      const current = getShieldSettings();
      const updatedApps = current.apps.filter((a) => a.id !== id);
      saveShieldSettings({ apps: updatedApps });
      showToast('APP REMOVED FROM SHIELD');
      renderShieldCard();
    });
  });

  // Add Custom App button
  const addBtn = container.querySelector('#add-custom-distraction-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      openModal('modal-add-distraction');
    });
  }

  // Reality Check button
  const realBtn = container.querySelector('#open-real-blocking-btn');
  if (realBtn) {
    realBtn.addEventListener('click', () => {
      openModal('modal-digital-wellbeing');
    });
  }
}

export function updateShieldStatusUI() {
  const badge = document.getElementById('shield-session-leaves-badge');
  if (badge) {
    badge.textContent = `LEAVES: ${currentSessionLeaves}`;
    if (activeSessionIsBroken) {
      badge.textContent = `LEAVES: ${currentSessionLeaves} (BROKEN)`;
      badge.style.color = 'var(--tomato)';
    } else {
      badge.style.color = currentSessionLeaves > 0 ? 'var(--mustard)' : 'inherit';
    }
  }
}

// Utility
function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
