/**
 * ARC - Task & System Notifications Module
 * Uses ServiceWorkerRegistration.showNotification(), Notification Triggers API
 * (TimestampTrigger) when available, fallback checks, and user permission dialog.
 */

import { store } from './store.js';
import { getAllTasks, saveTask, getLocalDateString } from './db.js';
import { getDailyReminderConfig } from './settings.js';
import { openModal, closeModal, showToast } from './ui.js';
import { playSound, ensureAudioContext } from './sound.js';

let reminderCheckInterval = null;
const FIRED_REMINDERS_KEY = 'arc_fired_reminders';
const DAILY_FIRED_KEY = 'arc_daily_plan_fired_date';

function getFiredReminders() {
  try {
    const raw = localStorage.getItem(FIRED_REMINDERS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function recordFiredReminder(id) {
  const list = getFiredReminders();
  if (!list.includes(id)) {
    list.push(id);
    localStorage.setItem(FIRED_REMINDERS_KEY, JSON.stringify(list.slice(-100)));
  }
}

// ============================================================================
// PERMISSION WORKFLOW WITH RETRO DIALOG
// ============================================================================

export function ensureNotificationPermission() {
  return new Promise((resolve) => {
    if (!('Notification' in window)) {
      showToast('NOTIFICATIONS NOT SUPPORTED BY BROWSER');
      resolve(false);
      return;
    }

    if (Notification.permission === 'granted') {
      resolve(true);
      return;
    }

    if (Notification.permission === 'denied') {
      showToast('NOTIFICATION PERMISSION BLOCKED IN BROWSER SETTINGS');
      resolve(false);
      return;
    }

    openModal('modal-permission');

    const allowBtn = document.getElementById('permission-allow-btn');
    const denyBtn = document.getElementById('permission-deny-btn');

    const onAllow = async () => {
      cleanup();
      closeModal('modal-permission');
      try {
        const result = await Notification.requestPermission();
        if (result === 'granted') {
          showToast('SAVED: NOTIFICATIONS ENABLED');
          resolve(true);
        } else {
          showToast('NOTIFICATIONS NOT ENABLED');
          resolve(false);
        }
      } catch (e) {
        resolve(false);
      }
    };

    const onDeny = () => {
      cleanup();
      closeModal('modal-permission');
      resolve(false);
    };

    const cleanup = () => {
      allowBtn.removeEventListener('click', onAllow);
      denyBtn.removeEventListener('click', onDeny);
    };

    allowBtn.addEventListener('click', onAllow);
    denyBtn.addEventListener('click', onDeny);
  });
}

// ============================================================================
// SCHEDULING TASK REMINDERS
// ============================================================================

export async function scheduleTaskReminder(task) {
  if (!task.reminder) return;

  const reminderDate = new Date(task.reminder);
  const reminderTimeMs = reminderDate.getTime();
  const now = Date.now();

  if (reminderTimeMs <= now) return;

  if (!('Notification' in window) || Notification.permission !== 'granted') {
    return;
  }

  const hasTriggers =
    'showTrigger' in Notification.prototype && typeof TimestampTrigger !== 'undefined';

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const notificationOptions = {
        body: task.time ? `Scheduled for ${task.time}` : 'Task reminder due now!',
        icon: 'icons/icon-192.svg',
        badge: 'icons/favicon.svg',
        tag: `task-reminder-${task.id}`,
        vibrate: [200, 100, 200],
        data: {
          taskId: task.id,
          taskTitle: task.title,
          type: 'task_reminder'
        },
        actions: [
          { action: 'done', title: 'Done' },
          { action: 'snooze', title: 'Snooze 10m' }
        ]
      };

      if (hasTriggers) {
        notificationOptions.showTrigger = new TimestampTrigger(reminderTimeMs);
      }

      await reg.showNotification(`ARC // TASK: ${task.title.toUpperCase()}`, notificationOptions);
    }
  } catch (err) {
    console.warn('Could not schedule notification via Service Worker:', err);
  }
}

export async function cancelTaskReminder(taskId) {
  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      const notifications = await reg.getNotifications({
        tag: `task-reminder-${taskId}`,
        includeTriggered: true
      });
      notifications.forEach((n) => n.close());
    }
  } catch (e) {
    // Ignore cancellation errors
  }
}

// ============================================================================
// FALLBACK CHECKER LOOP
// ============================================================================

export function startReminderChecker() {
  if (reminderCheckInterval) clearInterval(reminderCheckInterval);

  const checkDueReminders = async () => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;

    const now = Date.now();
    const tasks = await getAllTasks();
    const fired = getFiredReminders();

    for (const task of tasks) {
      if (task.reminder && !task.completed) {
        const reminderMs = new Date(task.reminder).getTime();
        if (reminderMs <= now && now - reminderMs < 5 * 60 * 1000 && !fired.includes(task.id)) {
          triggerImmediateTaskNotification(task);
          recordFiredReminder(task.id);
        }
      }
    }

    checkDailyPlanReminder();
  };

  checkDueReminders();
  reminderCheckInterval = setInterval(checkDueReminders, 30000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkDueReminders();
    }
  });

  registerPeriodicSync();

  // Reactive subscription: when daily reminder time or toggle changes, update immediately
  store.subscribe('dailyReminder', async (config, oldConfig, meta) => {
    if (meta && meta.source === 'initial') return;
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        const dailyNotifs = await reg.getNotifications({ tag: 'arc-daily-plan', includeTriggered: true });
        dailyNotifs.forEach((n) => n.close());
      }
    } catch (e) {}

    showToast('SAVED: DAILY REMINDER UPDATED');
    checkDailyPlanReminder();
  });
}

async function triggerImmediateTaskNotification(task) {
  playSound('chime');
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200]);

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification(`ARC // TASK: ${task.title.toUpperCase()}`, {
        body: task.time ? `Scheduled for ${task.time}` : 'Task reminder due now!',
        icon: 'icons/icon-192.svg',
        badge: 'icons/favicon.svg',
        tag: `task-reminder-${task.id}`,
        vibrate: [200, 100, 200],
        data: {
          taskId: task.id,
          taskTitle: task.title,
          type: 'task_reminder'
        },
        actions: [
          { action: 'done', title: 'Done' },
          { action: 'snooze', title: 'Snooze 10m' }
        ]
      });
    }
  } catch (err) {
    console.warn('Notification trigger error:', err);
  }
}

// ============================================================================
// DAILY "PLAN YOUR DAY" REMINDER
// ============================================================================

async function checkDailyPlanReminder() {
  const config = getDailyReminderConfig();
  if (!config.enabled || !config.time) return;

  const todayStr = getLocalDateString();
  const lastFired = localStorage.getItem(DAILY_FIRED_KEY);
  if (lastFired === todayStr) return;

  const [targetH, targetM] = config.time.split(':').map((n) => parseInt(n, 10));
  const now = new Date();
  const currentH = now.getHours();
  const currentM = now.getMinutes();

  if (currentH === targetH && currentM >= targetM) {
    localStorage.setItem(DAILY_FIRED_KEY, todayStr);
    playSound('chime');

    if ('serviceWorker' in navigator && Notification.permission === 'granted') {
      const reg = await navigator.serviceWorker.ready;
      reg.showNotification('ARC // PLAN YOUR DAY', {
        body: 'A new day has begun in your arc. Review and set your daily targets!',
        icon: 'icons/icon-192.svg',
        badge: 'icons/favicon.svg',
        tag: 'arc-daily-plan',
        vibrate: [200, 100, 200]
      });
    }
  }
}

// ============================================================================
// TEST NOTIFICATION & SOUND
// ============================================================================

export async function testNotificationAndSound() {
  ensureAudioContext();
  playSound('chime');
  if ('vibrate' in navigator) navigator.vibrate([200, 100, 200, 100, 400]);

  const hasPerm = await ensureNotificationPermission();
  if (!hasPerm) {
    showToast('CHIME & VIBRATION TESTED (NOTIFICATIONS NOT PERMITTED)');
    return;
  }

  try {
    if ('serviceWorker' in navigator) {
      const reg = await navigator.serviceWorker.ready;
      await reg.showNotification('ARC // SYSTEM TEST OK', {
        body: 'Synthesized sound, vibration, and system alerts are operational!',
        icon: 'icons/icon-192.svg',
        badge: 'icons/favicon.svg',
        tag: 'arc-system-test',
        vibrate: [200, 100, 200]
      });
      showToast('TEST ALERT TRANSMITTED');
    }
  } catch (e) {
    showToast('COULD NOT DISPLAY NOTIFICATION');
  }
}

// ============================================================================
// PERIODIC BACKGROUND SYNC (FEATURE DETECTION)
// ============================================================================

async function registerPeriodicSync() {
  if ('serviceWorker' in navigator && 'periodicSync' in (await navigator.serviceWorker.ready)) {
    try {
      const reg = await navigator.serviceWorker.ready;
      const status = await navigator.permissions.query({ name: 'periodic-background-sync' });
      if (status.state === 'granted') {
        await reg.periodicSync.register('check-reminders', {
          minInterval: 15 * 60 * 1000
        });
      }
    } catch (e) {
      // Periodic sync not granted or unsupported
    }
  }
}
