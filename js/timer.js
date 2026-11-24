/**
 * ARC - Focus Pomodoro Engine
 * Uses absolute timestamps (Date.now()), Screen Wake Lock API,
 * Web Audio sound engine (sound.js), Focus Shield lifecycle hooks,
 * and reactive store subscriptions.
 */

import { store } from './store.js';
import { getPomodoroSettings } from './settings.js';
import { getLocalDateString, saveFocusSession, getFocusSessionsByDate, getTaskById } from './db.js';
import { showToast, openModal, closeModal, renderHomeScreen } from './ui.js';
import {
  ensureAudioContext,
  playSessionCompleteAlert,
  playBreakOverAlert,
  stopRepeatingSound,
  playSound,
  getSoundSettings,
  syncAmbientWithTimer
} from './sound.js';
import {
  onFocusSessionStarted,
  onFocusSessionEnded,
  isCurrentSessionBroken,
  initShieldListeners
} from './shield.js';

const TIMER_STORAGE_KEY = 'arc_active_timer_state';

export const PHASES = Object.freeze({
  FOCUS: 'focus',
  SHORT_BREAK: 'short_break',
  LONG_BREAK: 'long_break'
});

export const STATES = Object.freeze({
  IDLE: 'idle',
  RUNNING: 'running',
  PAUSED: 'paused'
});

let timerInterval = null;
let wakeLockSentinel = null;
let pendingCompletionNotice = null;

// Timer State
let timerState = {
  phase: PHASES.FOCUS,
  state: STATES.IDLE,
  endTime: null,
  remainingMs: 25 * 60 * 1000,
  sessionRound: 1,
  linkedTaskId: null,
  activeSessionId: null
};

// Global helper for Focus Shield checking
window.__isFocusTimerRunning = () => {
  return timerState.state === STATES.RUNNING && timerState.phase === PHASES.FOCUS;
};

// ============================================================================
// SCREEN WAKE LOCK API
// ============================================================================

export async function requestWakeLock() {
  if (!('wakeLock' in navigator)) {
    updateWakeLockUI(false, 'NOT SUPPORTED');
    return;
  }

  try {
    if (!wakeLockSentinel || wakeLockSentinel.released) {
      wakeLockSentinel = await navigator.wakeLock.request('screen');
      updateWakeLockUI(true, 'WAKE LOCK ACTIVE');

      wakeLockSentinel.addEventListener('release', () => {
        updateWakeLockUI(false, 'WAKE LOCK STANDBY');
      });
    }
  } catch (err) {
    console.warn('Screen Wake Lock request failed:', err);
    updateWakeLockUI(false, 'WAKE LOCK STANDBY');
  }
}

export async function releaseWakeLock() {
  if (wakeLockSentinel && !wakeLockSentinel.released) {
    try {
      await wakeLockSentinel.release();
    } catch (e) {
      // ignore
    }
  }
  wakeLockSentinel = null;
  updateWakeLockUI(false, 'WAKE LOCK STANDBY');
}

function updateWakeLockUI(isActive, label) {
  const statusEl = document.getElementById('wake-lock-status');
  const textEl = document.getElementById('wake-lock-text');
  if (statusEl) {
    if (isActive) {
      statusEl.classList.add('active');
    } else {
      statusEl.classList.remove('active');
    }
  }
  if (textEl) textEl.textContent = label;
}

// ============================================================================
// TIMER PERSISTENCE
// ============================================================================

function saveState() {
  localStorage.setItem(TIMER_STORAGE_KEY, JSON.stringify(timerState));
  store.emit('timer_state_updated', timerState);
}

function loadState() {
  try {
    const raw = localStorage.getItem(TIMER_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

// ============================================================================
// TIMER LOGIC & CONTROLS
// ============================================================================

export function initTimer() {
  const saved = loadState();

  if (saved) {
    timerState = { ...saved };
    // If was running, check if time elapsed while inactive
    if (timerState.state === STATES.RUNNING && timerState.endTime) {
      const now = Date.now();
      if (now >= timerState.endTime) {
        handlePhaseComplete();
      } else {
        timerState.remainingMs = timerState.endTime - now;
        startTicking();
        requestWakeLock();
      }
    }
  } else {
    resetToPhase(PHASES.FOCUS);
  }

  setupEventListeners();
  updateTimerUI();
  updateTodayFocusSummary();

  // Initialize Focus Shield Visibility / Blur Listeners
  initShieldListeners(() => window.__isFocusTimerRunning());

  // Handle visibility change for Wake Lock and Background Catch-up
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (timerState.state === STATES.RUNNING) {
        requestWakeLock();
        if (timerState.endTime) {
          const remaining = timerState.endTime - Date.now();
          if (remaining <= 0) {
            handlePhaseComplete();
          } else {
            timerState.remainingMs = remaining;
            updateTimerUI();
          }
        }
      }

      // Check if a phase finished while the tab was hidden!
      if (pendingCompletionNotice) {
        const { phase, round } = pendingCompletionNotice;
        pendingCompletionNotice = null;
        // Play sound once on return
        const soundConfig = getSoundSettings();
        if (soundConfig.enabled) {
          playSound(phase === PHASES.FOCUS ? soundConfig.sound : 'break_over');
        }
        showSessionCompleteModal(phase, round);
      }
    }
  });

  // Reactive subscription: when pomodoro durations change
  store.subscribe('pomodoro', (newPomo, oldPomo, meta) => {
    if (meta && meta.source === 'initial') return;

    if (timerState.state === STATES.IDLE) {
      timerState.remainingMs = getPhaseDurationMs(timerState.phase);
      saveState();
      updateTimerUI();
    } else if (timerState.state === STATES.RUNNING) {
      showToast('APPLIES NEXT PHASE');
    }
  });
}

function getPhaseDurationMs(phase) {
  const pomo = getPomodoroSettings();
  switch (phase) {
    case PHASES.SHORT_BREAK:
      return pomo.shortBreakMin * 60 * 1000;
    case PHASES.LONG_BREAK:
      return pomo.longBreakMin * 60 * 1000;
    case PHASES.FOCUS:
    default:
      return pomo.focusMin * 60 * 1000;
  }
}

export function resetToPhase(phase) {
  timerState.phase = phase;
  timerState.state = STATES.IDLE;
  timerState.endTime = null;
  timerState.remainingMs = getPhaseDurationMs(phase);
  timerState.activeSessionId = null;
  stopTicking();
  releaseWakeLock();
  stopRepeatingSound();
  syncAmbientWithTimer(false);
  saveState();
  updateTimerUI();
}

export function startTimer() {
  if (timerState.state === STATES.RUNNING) return;

  // Ensure AudioContext is ready on user gesture
  ensureAudioContext();

  timerState.endTime = Date.now() + timerState.remainingMs;
  timerState.state = STATES.RUNNING;

  const taskSelect = document.getElementById('focus-task-select');
  if (taskSelect) {
    timerState.linkedTaskId = taskSelect.value || null;
  }

  // Hook into Focus Shield
  if (timerState.phase === PHASES.FOCUS) {
    timerState.activeSessionId = `session_${Date.now()}`;
    onFocusSessionStarted(timerState.activeSessionId);
  }

  // Seamless procedural ambient noise during active focus (auto-pauses on breaks)
  syncAmbientWithTimer(timerState.phase === PHASES.FOCUS);

  saveState();
  startTicking();
  requestWakeLock();
  updateTimerUI();
}

export function pauseTimer() {
  if (timerState.state !== STATES.RUNNING) return;

  timerState.remainingMs = Math.max(0, timerState.endTime - Date.now());
  timerState.endTime = null;
  timerState.state = STATES.PAUSED;

  stopTicking();
  releaseWakeLock();
  syncAmbientWithTimer(false);
  saveState();
  updateTimerUI();
}

export function resetTimer() {
  resetToPhase(timerState.phase);
}

export function skipTimer() {
  stopTicking();
  releaseWakeLock();
  stopRepeatingSound();
  advancePhase(false);
}

function startTicking() {
  stopTicking();
  timerInterval = setInterval(() => {
    const now = Date.now();
    const remaining = timerState.endTime - now;

    if (remaining <= 0) {
      timerState.remainingMs = 0;
      handlePhaseComplete();
    } else {
      timerState.remainingMs = remaining;
      updateTimerUI();
    }
  }, 250);
}

function stopTicking() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

async function handlePhaseComplete() {
  stopTicking();
  releaseWakeLock();
  syncAmbientWithTimer(false);

  const finishedPhase = timerState.phase;
  const currentRound = timerState.sessionRound;

  // Focus Shield hook
  let shieldResult = { wasClean: true, isBroken: false };
  if (finishedPhase === PHASES.FOCUS) {
    shieldResult = onFocusSessionEnded();
  }

  // Vibration
  if ('vibrate' in navigator) {
    navigator.vibrate([250, 100, 250, 100, 500]);
  }

  // Record completed focus session in IndexedDB
  if (finishedPhase === PHASES.FOCUS) {
    const pomo = getPomodoroSettings();
    const session = {
      date: getLocalDateString(),
      duration: pomo.focusMin,
      linkedTaskId: timerState.linkedTaskId,
      phase: 'focus',
      timestamp: Date.now(),
      wasClean: shieldResult.wasClean,
      isBroken: shieldResult.isBroken
    };
    await saveFocusSession(session);

    if (shieldResult.isBroken) {
      showToast(`SESSION BROKEN: EXCEEDED LEAVES LIMIT`);
    } else {
      showToast(`FOCUS SESSION #${currentRound} COMPLETED!`);
    }

    await updateTodayFocusSummary();
    store.emit('focus_session_completed', session);
  } else {
    showToast('BREAK FINISHED! TIME TO FOCUS.');
    store.emit('break_completed');
  }

  // System Notification via Service Worker
  notifyPhaseComplete(finishedPhase);

  // Sound & Modal Handling:
  if (document.visibilityState === 'visible') {
    if (finishedPhase === PHASES.FOCUS) {
      playSessionCompleteAlert();
    } else {
      playBreakOverAlert();
    }
    showSessionCompleteModal(finishedPhase, currentRound);
  } else {
    // Hidden tab: flag for catch-up on return
    pendingCompletionNotice = { phase: finishedPhase, round: currentRound };
  }

  // Advance timer state
  advancePhase(true);
}

function advancePhase(wasCompleted) {
  const pomo = getPomodoroSettings();

  if (timerState.phase === PHASES.FOCUS) {
    if (wasCompleted) {
      if (timerState.sessionRound >= pomo.rounds) {
        timerState.sessionRound = 1;
        resetToPhase(PHASES.LONG_BREAK);
      } else {
        timerState.sessionRound++;
        resetToPhase(PHASES.SHORT_BREAK);
      }
    } else {
      resetToPhase(PHASES.SHORT_BREAK);
    }
  } else {
    resetToPhase(PHASES.FOCUS);
  }

  saveState();
  updateTimerUI();
}

function showSessionCompleteModal(phase, round) {
  const modal = document.getElementById('modal-session-complete');
  if (!modal) return;

  const titleEl = document.getElementById('modal-complete-title');
  const msgEl = document.getElementById('modal-complete-message');
  const subEl = document.getElementById('modal-complete-submessage');
  const actionBtn = document.getElementById('session-complete-action-btn');

  if (phase === PHASES.FOCUS) {
    if (titleEl) titleEl.textContent = '// FOCUS COMPLETE!';
    if (msgEl) msgEl.textContent = `FOCUS SESSION #${round} FINISHED!`;
    if (subEl) subEl.textContent = 'Great work! Take a breath and let your mind recharge.';
    if (actionBtn) {
      actionBtn.textContent = 'TAKE BREAK';
      actionBtn.onclick = () => {
        stopRepeatingSound();
        closeModal('modal-session-complete');
      };
    }
  } else {
    if (titleEl) titleEl.textContent = '// BREAK OVER!';
    if (msgEl) msgEl.textContent = 'BREAK TIME IS FINISHED!';
    if (subEl) subEl.textContent = 'Ready to dive back into your productive arc?';
    if (actionBtn) {
      actionBtn.textContent = 'START NEXT FOCUS';
      actionBtn.onclick = () => {
        stopRepeatingSound();
        closeModal('modal-session-complete');
        startTimer();
      };
    }
  }

  openModal('modal-session-complete');
}

async function notifyPhaseComplete(phase) {
  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const title = phase === PHASES.FOCUS ? 'ARC // FOCUS SESSION DONE!' : 'ARC // BREAK OVER!';
  const options = {
    body: phase === PHASES.FOCUS ? 'Great job! Time to take a breather.' : 'Ready to resume your productive arc?',
    icon: 'icons/icon-192.svg',
    badge: 'icons/favicon.svg',
    tag: 'arc-focus-alert',
    vibrate: [200, 100, 200]
  };

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(title, options);
    } else {
      new Notification(title, options);
    }
  } catch (e) {
    console.warn('Notification trigger error:', e);
  }
}

// ============================================================================
// UI SYNC
// ============================================================================

export async function updateTimerUI() {
  const displayEl = document.getElementById('timer-display');
  const badgeEl = document.getElementById('focus-phase-badge');
  const startBtn = document.getElementById('timer-start-btn');
  const pauseBtn = document.getElementById('timer-pause-btn');
  const taskNameEl = document.getElementById('timer-current-task-name');

  const totalSec = Math.ceil(timerState.remainingMs / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const timeFormatted = `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;

  if (displayEl) displayEl.textContent = timeFormatted;

  if (timerState.state === STATES.RUNNING) {
    const phaseLabel = timerState.phase === PHASES.FOCUS ? 'FOCUS' : 'BREAK';
    document.title = `(${timeFormatted}) ARC // ${phaseLabel}`;
  } else {
    document.title = 'ARC // RETRO PRODUCTIVITY';
  }

  if (badgeEl) {
    if (timerState.phase === PHASES.FOCUS) {
      badgeEl.textContent = `FOCUS SESSION #${timerState.sessionRound}`;
      badgeEl.classList.remove('break');
    } else if (timerState.phase === PHASES.SHORT_BREAK) {
      badgeEl.textContent = 'SHORT BREAK';
      badgeEl.classList.add('break');
    } else {
      badgeEl.textContent = 'LONG BREAK';
      badgeEl.classList.add('break');
    }
  }

  if (startBtn) {
    startBtn.disabled = timerState.state === STATES.RUNNING;
  }
  if (pauseBtn) {
    pauseBtn.disabled = timerState.state !== STATES.RUNNING;
  }

  if (taskNameEl) {
    if (timerState.linkedTaskId) {
      const task = await getTaskById(timerState.linkedTaskId);
      taskNameEl.textContent = task ? `TASK: ${task.title.toUpperCase()}` : 'GENERAL FOCUS';
    } else {
      taskNameEl.textContent = 'GENERAL FOCUS';
    }
  }
}

export async function updateTodayFocusSummary() {
  const todayStr = getLocalDateString();
  const sessions = await getFocusSessionsByDate(todayStr);

  const validSessions = sessions.filter((s) => !s.isBroken);
  const totalMins = validSessions.reduce((acc, s) => acc + (s.duration || 0), 0);
  const count = validSessions.length;

  const minsEl = document.getElementById('focus-today-mins');
  const countEl = document.getElementById('focus-today-count');

  if (minsEl) minsEl.textContent = String(totalMins);
  if (countEl) countEl.textContent = String(count);
}

function setupEventListeners() {
  const startBtn = document.getElementById('timer-start-btn');
  const pauseBtn = document.getElementById('timer-pause-btn');
  const resetBtn = document.getElementById('timer-reset-btn');
  const skipBtn = document.getElementById('timer-skip-btn');

  if (startBtn) startBtn.onclick = () => startTimer();
  if (pauseBtn) pauseBtn.onclick = () => pauseTimer();
  if (resetBtn) resetBtn.onclick = () => resetTimer();
  if (skipBtn) skipBtn.onclick = () => skipTimer();
}
