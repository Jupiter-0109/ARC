/**
 * ARC - Application Entry Point (ES Modules)
 * Integrates Reactive Store, Database, UI, Timer, Audio, Focus Shield,
 * Notifications, and Service Worker.
 */

import { store } from './store.js';
import { openDB, saveTask, saveGoal, getLocalDateString } from './db.js';
import {
  showToast,
  setupTabs,
  setupClock,
  setupQuickAdd,
  renderHomeScreen,
  closeModal,
  openGoalModal,
  confirmAction,
  setupReactiveUIListeners,
  setupAmbientControls,
  setupSectionRefreshButtons
} from './ui.js';

import { initTimer } from './timer.js';
import {
  startReminderChecker,
  scheduleTaskReminder,
  cancelTaskReminder,
  testNotificationAndSound,
  ensureNotificationPermission
} from './notifications.js';

import { setupSettingsView } from './settings.js';
import { renderShieldCard } from './shield.js';
import { initOnboarding } from './onboarding.js';

let deferredInstallPrompt = null;

// ============================================================================
// BOOTSTRAP APPLICATION
// ============================================================================

async function bootstrap() {
  try {
    // 1. Initialize IndexedDB
    await openDB();

    // 2. Setup Central Reactive Store UI Subscriptions
    setupReactiveUIListeners();

    // 3. Setup Navigation, Clock, and Quick Add
    setupTabs();
    setupClock();
    setupQuickAdd();
    setupSectionRefreshButtons();

    // 4. Setup Focus Mode Timer
    initTimer();
    setupAmbientControls();

    // 5. Setup Reminder Monitoring & Fallback Checker
    startReminderChecker();

    // 6. Setup Focus Shield UI
    await renderShieldCard();

    // 7. Setup Settings View & Bindings
    setupSettingsView({
      showToast,
      confirmAction,
      renderHomeScreen,
      testNotification: testNotificationAndSound
    });

    // 8. Setup Modal Listeners (Task, Goal, Close buttons)
    setupModalBindings();

    // 9. Initial Render of Home Screen
    await renderHomeScreen();

    // 10. Check and Trigger Onboarding Tour (First launch or What's New)
    initOnboarding();

    // 11. Setup Service Worker & PWA Install Handling
    setupServiceWorker();
    setupPWAInstall();

  } catch (err) {
    console.error('Fatal initialization error:', err);
    showToast('SYSTEM INITIALIZATION ERROR');
  }
}

// ============================================================================
// MODAL BINDINGS & SUBMISSIONS
// ============================================================================

function setupModalBindings() {
  // Global close buttons on modals
  document.querySelectorAll('.close-modal-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      const backdrop = e.target.closest('.modal-backdrop');
      if (backdrop) backdrop.classList.remove('open');
    });
  });

  // Close modals on clicking backdrop (outside dialog)
  document.querySelectorAll('.modal-backdrop').forEach((backdrop) => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        backdrop.classList.remove('open');
      }
    });
  });

  // Add Goal Button opens Goal Modal
  const addGoalBtn = document.getElementById('add-goal-btn');
  if (addGoalBtn) {
    addGoalBtn.addEventListener('click', () => {
      openGoalModal(null);
    });
  }

  // Save Goal Button
  const saveGoalBtn = document.getElementById('save-goal-btn');
  if (saveGoalBtn) {
    saveGoalBtn.addEventListener('click', async () => {
      const idInput = document.getElementById('modal-goal-id');
      const titleInput = document.getElementById('modal-goal-title-input');
      const descInput = document.getElementById('modal-goal-desc-input');

      const title = titleInput ? titleInput.value.trim() : '';
      if (!title) {
        showToast('GOAL TITLE REQUIRED');
        return;
      }

      const goal = {
        id: idInput && idInput.value ? idInput.value : undefined,
        title: title,
        description: descInput ? descInput.value.trim() : '',
        completed: false
      };

      await saveGoal(goal);
      closeModal('modal-goal');
      showToast('SAVED: GOAL CREATED');
      store.emit('goals_changed');
    });
  }

  // Save Task Button
  const saveTaskBtn = document.getElementById('save-task-btn');
  if (saveTaskBtn) {
    saveTaskBtn.addEventListener('click', async () => {
      const idInput = document.getElementById('modal-task-id');
      const titleInput = document.getElementById('modal-task-title-input');
      const dateInput = document.getElementById('modal-task-date-input');
      const timeInput = document.getElementById('modal-task-time-input');
      const goalSelect = document.getElementById('modal-task-goal-select');
      const reminderInput = document.getElementById('modal-task-reminder-input');

      const title = titleInput ? titleInput.value.trim() : '';
      if (!title) {
        showToast('TASK TITLE REQUIRED');
        return;
      }

      const task = {
        id: idInput && idInput.value ? idInput.value : undefined,
        title: title,
        date: dateInput && dateInput.value ? dateInput.value : getLocalDateString(),
        time: timeInput ? timeInput.value : '',
        goalId: goalSelect && goalSelect.value ? goalSelect.value : null,
        reminder: reminderInput && reminderInput.value ? reminderInput.value : null,
        completed: false
      };

      if (task.reminder) {
        await ensureNotificationPermission();
      }

      await saveTask(task);

      if (task.reminder) {
        scheduleTaskReminder(task);
      } else if (task.id) {
        cancelTaskReminder(task.id);
      }

      closeModal('modal-task');
      showToast('SAVED: TASK UPDATED');
      store.emit('tasks_changed');
    });
  }
}

// ============================================================================
// SERVICE WORKER & UPDATE BANNER
// ============================================================================

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');

      // 1. If an updated worker is already installed & waiting, activate it
      if (reg.waiting) {
        showUpdateBanner(reg.waiting);
        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
      }

      // 2. Check for updates on install
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(newWorker);
          }
        });
      });

      // 3. Proactively trigger check for updated sw.js
      try {
        await reg.update();
      } catch (e) {}

      // 4. Auto-refresh when new worker takes control
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });

      // Handle message from service worker (e.g. task completed from notification)
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data && event.data.type === 'TASK_COMPLETED_VIA_NOTIFICATION') {
          showToast('TASK MARKED DONE VIA NOTIFICATION');
          store.emit('tasks_changed');
        }
      });

    } catch (err) {
      console.warn('Service Worker registration failed:', err);
    }
  });
}

function showUpdateBanner(worker) {
  const banner = document.getElementById('update-banner');
  const reloadBtn = document.getElementById('update-reload-btn');

  if (banner) {
    banner.classList.add('visible');
  }

  if (reloadBtn) {
    reloadBtn.addEventListener('click', () => {
      worker.postMessage({ type: 'SKIP_WAITING' });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        window.location.reload();
      });
    });
  }
}

// ============================================================================
// PWA INSTALLATION (beforeinstallprompt)
// ============================================================================

function setupPWAInstall() {
  const installBtn = document.getElementById('install-pwa-btn');

  const isStandalone =
    window.matchMedia('(display-mode: standalone)').matches ||
    window.navigator.standalone === true;

  if (isStandalone && installBtn) {
    installBtn.textContent = 'INSTALLED';
    installBtn.disabled = true;
    return;
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;

    if (installBtn) {
      installBtn.style.display = 'inline-flex';
      installBtn.disabled = false;
      installBtn.textContent = 'INSTALL APP';
    }
  });

  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) {
        showToast('USE "ADD TO HOME SCREEN" IN BROWSER MENU');
        return;
      }

      deferredInstallPrompt.prompt();
      const choice = await deferredInstallPrompt.userChoice;

      if (choice.outcome === 'accepted') {
        showToast('ARC INSTALLED SUCCESSFULLY!');
        installBtn.textContent = 'INSTALLED';
        installBtn.disabled = true;
      } else {
        showToast('INSTALLATION DISMISSED');
      }

      deferredInstallPrompt = null;
    });
  }

  window.addEventListener('appinstalled', () => {
    showToast('ARC IS NOW ON YOUR HOME SCREEN');
    if (installBtn) {
      installBtn.textContent = 'INSTALLED';
      installBtn.disabled = true;
    }
  });
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
