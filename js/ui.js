/**
 * ARC - UI Rendering & Interaction Module
 * Manages reactive tabs, modals, home components, touch gestures,
 * and granular store event subscriptions.
 */

import { store } from './store.js';
import {
  getLocalDateString,
  getAllTasks,
  getTasksByDate,
  saveTask,
  deleteTask,
  toggleTaskComplete,
  rolloverUnfinishedTasks,
  getAllGoals,
  saveGoal,
  deleteGoal,
  getAllFocusSessions
} from './db.js';

import {
  getWhyNote,
  setWhyNote,
  getArcDates,
  setArcDates,
  getTheme,
  setTheme,
  getScanlines,
  setScanlines
} from './settings.js';

import { calculateStreak } from './streak.js';
import { renderHeatmap } from './heatmap.js';
import { getShieldSettings, saveShieldSettings, renderShieldCard } from './shield.js';
import {
  getAmbientSettings,
  saveAmbientSettings,
  startAmbientSound,
  stopAmbientSound,
  setAmbientVolume,
  isAmbientPlaying,
  ensureAudioContext
} from './sound.js';

// Cached memory data to avoid unnecessary full re-queries
let cachedTasks = [];
let cachedGoals = [];
let cachedSessions = [];

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

export function showToast(message, duration = 2800) {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'retro-toast';
  toast.setAttribute('role', 'status');
  toast.textContent = message;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    toast.style.transition = 'all 0.2s ease-in';
    setTimeout(() => toast.remove(), 200);
  }, duration);
}

// ============================================================================
// MODAL CONTROLLER
// ============================================================================

export function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.add('open');
    const firstInput = modal.querySelector('input:not([type=hidden]), textarea, select, button');
    if (firstInput) firstInput.focus();
  }
}

export function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('open');
  }
}

export function confirmAction(message, onConfirm) {
  const modal = document.getElementById('modal-confirm');
  const msgEl = document.getElementById('modal-confirm-message');
  const cancelBtn = document.getElementById('modal-confirm-cancel');
  const proceedBtn = document.getElementById('modal-confirm-proceed');

  msgEl.textContent = message;
  modal.classList.add('open');

  const cleanup = () => {
    modal.classList.remove('open');
    cancelBtn.removeEventListener('click', onCancel);
    proceedBtn.removeEventListener('click', onProceed);
  };

  const onCancel = () => cleanup();
  const onProceed = () => {
    cleanup();
    onConfirm();
  };

  cancelBtn.addEventListener('click', onCancel);
  proceedBtn.addEventListener('click', onProceed);
}

// ============================================================================
// TAB NAVIGATION
// ============================================================================

export function setupTabs() {
  const tabs = [
    { btnId: 'tab-btn-home', viewId: 'view-home' },
    { btnId: 'tab-btn-focus', viewId: 'view-focus' },
    { btnId: 'tab-btn-settings', viewId: 'view-settings' }
  ];

  tabs.forEach(({ btnId, viewId }) => {
    const btn = document.getElementById(btnId);
    if (!btn) return;

    btn.addEventListener('click', () => {
      tabs.forEach((t) => {
        const b = document.getElementById(t.btnId);
        const v = document.getElementById(t.viewId);
        if (b) {
          b.classList.remove('active');
          b.setAttribute('aria-selected', 'false');
        }
        if (v) {
          v.classList.remove('active');
        }
      });

      btn.classList.add('active');
      btn.setAttribute('aria-selected', 'true');
      const targetView = document.getElementById(viewId);
      if (targetView) targetView.classList.add('active');

      window.scrollTo({ top: 0, behavior: 'instant' });

      if (viewId === 'view-home') {
        renderHomeScreen();
      } else if (viewId === 'view-focus') {
        refreshFocusTaskOptions();
        renderShieldCard();
      }
    });
  });
}

// ============================================================================
// LIVE CLOCK & TOP BAR
// ============================================================================

export function setupClock() {
  const clockEl = document.getElementById('live-clock');

  const updateClock = () => {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    if (clockEl) clockEl.textContent = `${h}:${m}:${s}`;
  };
  updateClock();
  setInterval(updateClock, 1000);

  const quickThemeBtn = document.getElementById('quick-theme-btn');
  if (quickThemeBtn) {
    quickThemeBtn.addEventListener('click', () => {
      const current = getTheme();
      const next = current === 'paper' ? 'crt-green' : current === 'crt-green' ? 'crt-amber' : 'paper';
      setTheme(next);
      showToast(`SAVED: ${next.toUpperCase()}`);
    });
  }
}

// ============================================================================
// 1. PINNED WHY NOTE
// ============================================================================

export function setupWhyCard() {
  const card = document.getElementById('why-card');
  const whyText = document.getElementById('why-text');
  const whyCount = document.getElementById('why-char-count');
  const modalInput = document.getElementById('modal-why-input');
  const modalCounter = document.getElementById('modal-why-counter');
  const saveBtn = document.getElementById('save-why-btn');

  const updateCardDisplay = (text = getWhyNote()) => {
    if (whyText) whyText.textContent = text;
    if (whyCount) whyCount.textContent = `${text.length} / 200`;
  };

  updateCardDisplay();

  // Reactive subscription: update why display immediately if changed elsewhere
  store.subscribe('why', (newWhy) => {
    if (newWhy) updateCardDisplay(newWhy);
  });

  if (card) {
    card.addEventListener('click', () => {
      const current = getWhyNote();
      if (modalInput) modalInput.value = current;
      if (modalCounter) modalCounter.textContent = `${current.length} / 200`;
      openModal('modal-why');
    });

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        card.click();
      }
    });
  }

  if (modalInput && modalCounter) {
    modalInput.addEventListener('input', () => {
      modalCounter.textContent = `${modalInput.value.length} / 200`;
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const val = modalInput ? modalInput.value : '';
      setWhyNote(val);
      updateCardDisplay(val);
      closeModal('modal-why');
      showToast('SAVED: WHY NOTE');
    });
  }
}

// ============================================================================
// 2. ARC COUNTDOWN
// ============================================================================

export function renderArcCountdown() {
  const arcConfig = getArcDates();
  const nameDisplay = document.getElementById('arc-name-display');
  const daysLeftEl = document.getElementById('arc-days-left');
  const dayRatioEl = document.getElementById('arc-day-ratio');
  const fillEl = document.getElementById('arc-progress-fill');
  const endedBox = document.getElementById('arc-ended-box');

  if (nameDisplay) nameDisplay.textContent = arcConfig.title.toUpperCase();

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const start = new Date(arcConfig.startDate + 'T00:00:00');
  const end = new Date(arcConfig.endDate + 'T00:00:00');

  const totalDurationMs = end - start;
  const totalDays = Math.max(1, Math.round(totalDurationMs / (1000 * 60 * 60 * 24)));

  const elapsedMs = today - start;
  const elapsedDays = Math.max(0, Math.round(elapsedMs / (1000 * 60 * 60 * 24)));

  const remainingMs = end - today;
  const daysLeft = Math.round(remainingMs / (1000 * 60 * 60 * 24));

  const pct = Math.min(100, Math.max(0, Math.round(((elapsedDays + 1) / totalDays) * 100)));

  if (fillEl) fillEl.style.width = `${pct}%`;

  if (daysLeft < 0) {
    if (daysLeftEl) daysLeftEl.textContent = 'ARC COMPLETED';
    if (dayRatioEl) dayRatioEl.textContent = `FINAL: DAY ${totalDays} / ${totalDays}`;
    if (endedBox) endedBox.style.display = 'block';
  } else {
    if (daysLeftEl) daysLeftEl.textContent = `${daysLeft} DAYS LEFT`;
    if (dayRatioEl) dayRatioEl.textContent = `DAY ${elapsedDays + 1} / ${totalDays}`;
    if (endedBox) endedBox.style.display = 'none';
  }

  const editBtn = document.getElementById('edit-arc-btn');
  const startNewBtn = document.getElementById('start-new-arc-btn');

  const openArcSettingsTab = () => {
    const tabBtn = document.getElementById('tab-btn-settings');
    if (tabBtn) tabBtn.click();
    const titleInput = document.getElementById('setting-arc-title');
    if (titleInput) {
      setTimeout(() => titleInput.focus(), 150);
    }
  };

  if (editBtn) editBtn.onclick = openArcSettingsTab;
  if (startNewBtn) startNewBtn.onclick = openArcSettingsTab;
}

// ============================================================================
// 3. STREAK COUNTER
// ============================================================================

export async function renderStreakSection(allTasks, allSessions) {
  const { currentStreak, bestStreak, isTodayQualified } = calculateStreak(allTasks, allSessions);

  const currentEl = document.getElementById('streak-current-count');
  const bestEl = document.getElementById('streak-best-count');
  const badgeEl = document.getElementById('streak-status-badge');

  if (currentEl) currentEl.textContent = `${currentStreak} DAY${currentStreak === 1 ? '' : 'S'}`;
  if (bestEl) bestEl.textContent = `BEST: ${bestStreak} DAY${bestStreak === 1 ? '' : 'S'}`;

  if (badgeEl) {
    if (isTodayQualified) {
      badgeEl.textContent = 'MET TODAY';
      badgeEl.classList.add('met');
    } else {
      badgeEl.textContent = 'NOT MET TODAY';
      badgeEl.classList.remove('met');
    }
  }
}

// ============================================================================
// 4. MAIN GOALS (1 to 5)
// ============================================================================

export async function renderGoalsSection(allTasks) {
  const goals = cachedGoals.length > 0 ? cachedGoals : await getAllGoals();
  cachedGoals = goals;

  const listEl = document.getElementById('goal-list');
  const emptyEl = document.getElementById('goals-empty-state');
  const badgeEl = document.getElementById('goals-count-badge');
  const addBtn = document.getElementById('add-goal-btn');

  if (badgeEl) badgeEl.textContent = `${goals.length}/5`;

  if (addBtn) {
    addBtn.disabled = goals.length >= 5;
    addBtn.title = goals.length >= 5 ? 'Max 5 goals reached' : 'Add new goal';
  }

  if (!listEl) return;
  listEl.innerHTML = '';

  if (goals.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  goals.forEach((goal) => {
    const linked = allTasks.filter((t) => t.goalId === goal.id);
    const completedLinked = linked.filter((t) => t.completed);
    let pct = 0;
    if (linked.length > 0) {
      pct = Math.round((completedLinked.length / linked.length) * 100);
    } else {
      pct = goal.completed ? 100 : 0;
    }

    const item = document.createElement('div');
    item.className = 'goal-item';
    item.setAttribute('role', 'listitem');

    item.innerHTML = `
      <div class="goal-item-top">
        <span class="goal-item-title">${escapeHTML(goal.title)}</span>
        <div class="goal-actions">
          <button class="btn btn-sm edit-goal-btn" data-goal-id="${goal.id}" aria-label="Edit goal">EDIT</button>
          <button class="btn btn-sm btn-icon delete-goal-btn" data-goal-id="${goal.id}" aria-label="Delete goal">&#x2715;</button>
        </div>
      </div>
      ${goal.description ? `<p class="goal-desc">${escapeHTML(goal.description)}</p>` : ''}
      <div class="pixel-bar-container" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
        <div class="pixel-bar-fill" style="width: ${pct}%;"></div>
      </div>
      <div class="goal-progress-info">
        <span>${linked.length > 0 ? `${completedLinked.length}/${linked.length} TASKS` : (goal.completed ? 'COMPLETED' : 'NO LINKED TASKS')}</span>
        <span>${pct}%</span>
      </div>
    `;

    listEl.appendChild(item);
  });

  listEl.querySelectorAll('.edit-goal-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.getAttribute('data-goal-id');
      const goal = goals.find((g) => g.id === id);
      if (goal) openGoalModal(goal);
    });
  });

  listEl.querySelectorAll('.delete-goal-btn').forEach((b) => {
    b.addEventListener('click', () => {
      const id = b.getAttribute('data-goal-id');
      confirmAction('DELETE THIS GOAL?', async () => {
        await deleteGoal(id);
        cachedGoals = await getAllGoals();
        showToast('SAVED: GOAL DELETED');
        store.emit('goals_changed');
      });
    });
  });
}

export function openGoalModal(goal = null) {
  const modalId = document.getElementById('modal-goal-id');
  const titleInput = document.getElementById('modal-goal-title-input');
  const descInput = document.getElementById('modal-goal-desc-input');
  const deleteBtn = document.getElementById('delete-goal-modal-btn');

  if (goal) {
    if (modalId) modalId.value = goal.id;
    if (titleInput) titleInput.value = goal.title;
    if (descInput) descInput.value = goal.description || '';
    if (deleteBtn) {
      deleteBtn.style.display = 'inline-flex';
      deleteBtn.onclick = () => {
        confirmAction('DELETE THIS GOAL?', async () => {
          await deleteGoal(goal.id);
          cachedGoals = await getAllGoals();
          closeModal('modal-goal');
          showToast('SAVED: GOAL DELETED');
          store.emit('goals_changed');
        });
      };
    }
  } else {
    if (modalId) modalId.value = '';
    if (titleInput) titleInput.value = '';
    if (descInput) descInput.value = '';
    if (deleteBtn) deleteBtn.style.display = 'none';
  }

  openModal('modal-goal');
}

// ============================================================================
// 5. TODAY'S TASKS LIST
// ============================================================================

export async function renderTodayTasks(allTasks) {
  const todayStr = getLocalDateString();
  const dateLabel = document.getElementById('today-date-label');
  if (dateLabel) dateLabel.textContent = `TODAY // ${todayStr}`;

  const goals = cachedGoals.length > 0 ? cachedGoals : await getAllGoals();
  const goalMap = new Map(goals.map((g) => [g.id, g.title]));

  const todayTasks = allTasks.filter((t) => t.date === todayStr);

  todayTasks.sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    if (a.time && b.time) return a.time.localeCompare(b.time);
    return (a.createdAt || 0) - (b.createdAt || 0);
  });

  const listEl = document.getElementById('task-list');
  const emptyEl = document.getElementById('tasks-empty-state');

  if (!listEl) return;
  listEl.innerHTML = '';

  if (todayTasks.length === 0) {
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';

  todayTasks.forEach((task) => {
    const item = document.createElement('div');
    item.className = `task-item ${task.completed ? 'completed' : ''}`;
    item.setAttribute('role', 'listitem');
    item.setAttribute('data-task-id', task.id);

    const goalName = task.goalId ? goalMap.get(task.goalId) : null;

    item.innerHTML = `
      <input type="checkbox" class="retro-checkbox task-check-btn" ${task.completed ? 'checked' : ''} aria-label="Toggle task completed">
      <div class="task-content">
        <span class="task-title">${escapeHTML(task.title)}</span>
        <div class="task-meta">
          ${task.time ? `<span class="task-time-tag">&#x23F0; ${task.time}</span>` : ''}
          ${goalName ? `<span class="task-goal-tag">${escapeHTML(goalName)}</span>` : ''}
          ${task.reminder ? `<span title="Reminder scheduled">&#x1F514;</span>` : ''}
        </div>
      </div>
      <div class="task-actions">
        <button class="btn btn-sm btn-icon edit-task-btn" aria-label="Edit task" title="Edit task"><svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M11.5 0l4.5 4.5-9.5 9.5H2v-4.5l9.5-9.5zM1 15h14v1H1v-1z"/></svg></button>
        <button class="btn btn-sm btn-icon delete-task-btn" aria-label="Delete task" title="Delete task">&#x2715;</button>
      </div>
    `;

    // Touch swipe left to delete handling
    let touchStartX = 0;
    let touchCurrentX = 0;

    item.addEventListener('touchstart', (e) => {
      touchStartX = e.touches[0].clientX;
      touchCurrentX = touchStartX;
    }, { passive: true });

    item.addEventListener('touchmove', (e) => {
      touchCurrentX = e.touches[0].clientX;
      const diffX = touchCurrentX - touchStartX;
      if (diffX < 0 && diffX > -120) {
        item.style.transform = `translateX(${diffX}px)`;
      }
    }, { passive: true });

    item.addEventListener('touchend', () => {
      const diffX = touchCurrentX - touchStartX;
      if (diffX < -70) {
        item.style.transform = 'translateX(-100px)';
        confirmAction(`DELETE "${task.title.toUpperCase()}"?`, async () => {
          await deleteTask(task.id);
          showToast('SAVED: TASK DELETED');
          store.emit('tasks_changed');
        });
      } else {
        item.style.transform = 'translateX(0px)';
      }
    });

    // Checkbox toggle
    const checkbox = item.querySelector('.task-check-btn');
    checkbox.addEventListener('change', async () => {
      await toggleTaskComplete(task.id);
      showToast(task.completed ? 'TASK UNCHECKED' : 'TASK DONE!');
      store.emit('tasks_changed');
    });

    const content = item.querySelector('.task-content');
    content.addEventListener('click', () => openTaskModal(task));

    const editBtn = item.querySelector('.edit-task-btn');
    editBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTaskModal(task);
    });

    const deleteBtn = item.querySelector('.delete-task-btn');
    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      confirmAction(`DELETE "${task.title.toUpperCase()}"?`, async () => {
        await deleteTask(task.id);
        showToast('SAVED: TASK DELETED');
        store.emit('tasks_changed');
      });
    });

    listEl.appendChild(item);
  });
}

export async function openTaskModal(task = null) {
  const modalId = document.getElementById('modal-task-id');
  const titleInput = document.getElementById('modal-task-title-input');
  const dateInput = document.getElementById('modal-task-date-input');
  const timeInput = document.getElementById('modal-task-time-input');
  const goalSelect = document.getElementById('modal-task-goal-select');
  const reminderInput = document.getElementById('modal-task-reminder-input');
  const deleteBtn = document.getElementById('delete-task-modal-btn');

  const goals = cachedGoals.length > 0 ? cachedGoals : await getAllGoals();
  if (goalSelect) {
    goalSelect.innerHTML = '<option value="">-- None --</option>';
    goals.forEach((g) => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.title;
      goalSelect.appendChild(opt);
    });
  }

  const todayStr = getLocalDateString();

  if (task) {
    if (modalId) modalId.value = task.id;
    if (titleInput) titleInput.value = task.title;
    if (dateInput) dateInput.value = task.date || todayStr;
    if (timeInput) timeInput.value = task.time || '';
    if (goalSelect) goalSelect.value = task.goalId || '';
    if (reminderInput) reminderInput.value = task.reminder || '';
    if (deleteBtn) {
      deleteBtn.style.display = 'inline-flex';
      deleteBtn.onclick = () => {
        confirmAction('DELETE THIS TASK?', async () => {
          await deleteTask(task.id);
          closeModal('modal-task');
          showToast('SAVED: TASK DELETED');
          store.emit('tasks_changed');
        });
      };
    }
  } else {
    if (modalId) modalId.value = '';
    if (titleInput) titleInput.value = '';
    if (dateInput) dateInput.value = todayStr;
    if (timeInput) timeInput.value = '';
    if (goalSelect) goalSelect.value = '';
    if (reminderInput) reminderInput.value = '';
    if (deleteBtn) deleteBtn.style.display = 'none';
  }

  openModal('modal-task');
}

export function setupQuickAdd() {
  const form = document.getElementById('quick-add-form');
  const input = document.getElementById('quick-add-input');

  if (form && input) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const val = input.value.trim();
      if (!val) return;

      const newTask = {
        title: val,
        completed: false,
        date: getLocalDateString(),
        time: '',
        goalId: null,
        reminder: null
      };

      await saveTask(newTask);
      input.value = '';
      showToast('SAVED: TASK CREATED');
      store.emit('tasks_changed');
    });
  }

  const rolloverBtn = document.getElementById('rollover-tasks-btn');
  if (rolloverBtn) {
    rolloverBtn.addEventListener('click', async () => {
      const todayStr = getLocalDateString();
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      const tomorrowStr = getLocalDateString(tomorrow);

      confirmAction(`ROLL OVER ALL UNFINISHED TASKS TO TOMORROW (${tomorrowStr})?`, async () => {
        const moved = await rolloverUnfinishedTasks(todayStr, tomorrowStr);
        if (moved.length > 0) {
          showToast(`SAVED: ROLLED OVER ${moved.length} TASK${moved.length === 1 ? '' : 'S'}`);
        } else {
          showToast('NO UNFINISHED TASKS TO ROLL OVER');
        }
        store.emit('tasks_changed');
      });
    });
  }

  // Setup Add Distraction App Modal Form
  setupDistractionModal();
}

function setupDistractionModal() {
  const presetSelect = document.getElementById('preset-app-select');
  const customNameInput = document.getElementById('custom-app-name-input');
  const customLimitInput = document.getElementById('custom-app-limit-input');
  const saveBtn = document.getElementById('save-distraction-app-btn');

  if (presetSelect) {
    presetSelect.addEventListener('change', () => {
      const val = presetSelect.value;
      if (val) {
        const [name, limit] = val.split('|');
        if (customNameInput) customNameInput.value = name;
        if (customLimitInput) customLimitInput.value = limit;
      }
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', () => {
      const name = customNameInput ? customNameInput.value.trim() : '';
      const limit = parseInt(customLimitInput ? customLimitInput.value : 15, 10) || 15;

      if (!name) {
        showToast('APP NAME REQUIRED');
        return;
      }

      const settings = getShieldSettings();
      const newApp = {
        id: 'app_' + Date.now(),
        name,
        limit
      };

      settings.apps.push(newApp);
      saveShieldSettings({ apps: settings.apps });
      closeModal('modal-add-distraction');
      if (customNameInput) customNameInput.value = '';
      if (presetSelect) presetSelect.value = '';
      showToast(`SAVED: ${name.toUpperCase()} ADDED`);
      renderShieldCard();
    });
  }
}

// ============================================================================
// FOCUS TASK DROPDOWN REFRESH
// ============================================================================

export async function refreshFocusTaskOptions() {
  const select = document.getElementById('focus-task-select');
  if (!select) return;

  const todayStr = getLocalDateString();
  const tasks = await getTasksByDate(todayStr);
  const unfinished = tasks.filter((t) => !t.completed);

  const prevVal = select.value;
  select.innerHTML = '<option value="">-- No specific task --</option>';

  unfinished.forEach((t) => {
    const opt = document.createElement('option');
    opt.value = t.id;
    opt.textContent = t.title;
    select.appendChild(opt);
  });

  if (prevVal && unfinished.some((t) => t.id === prevVal)) {
    select.value = prevVal;
  }
}

// ============================================================================
// FULL HOME SCREEN RENDER & REACTIVE SUBSCRIPTIONS
// ============================================================================

export async function renderHomeScreen() {
  const [allTasks, allGoals, allSessions] = await Promise.all([
    getAllTasks(),
    getAllGoals(),
    getAllFocusSessions()
  ]);

  cachedTasks = allTasks;
  cachedGoals = allGoals;
  cachedSessions = allSessions;

  // 1. Why Card
  setupWhyCard();

  // 2. Arc Countdown
  renderArcCountdown();

  // 3. Streak Counter
  await renderStreakSection(allTasks, allSessions);

  // 4. Main Goals
  await renderGoalsSection(allTasks);

  // 5. Today's Tasks
  await renderTodayTasks(allTasks);

  // 6. Heatmap
  const heatmapSvg = document.getElementById('heatmap-svg');
  const tooltipEl = document.getElementById('heatmap-tooltip');
  if (heatmapSvg) {
    renderHeatmap(heatmapSvg, tooltipEl, allTasks, allSessions);
  }
}

// ============================================================================
// STORE REACTIVE EVENT BINDINGS
// ============================================================================

export function setupReactiveUIListeners() {
  // Arc countdown updates immediately when dates or title change
  store.subscribe('arcDates', () => {
    renderArcCountdown();
  });

  // Today tasks, goals, streak, and heatmap update together when tasks change
  store.on('tasks_changed', async () => {
    cachedTasks = await getAllTasks();
    await renderTodayTasks(cachedTasks);
    await renderGoalsSection(cachedTasks);
    await renderStreakSection(cachedTasks, cachedSessions);
    const heatmapSvg = document.getElementById('heatmap-svg');
    const tooltipEl = document.getElementById('heatmap-tooltip');
    if (heatmapSvg) renderHeatmap(heatmapSvg, tooltipEl, cachedTasks, cachedSessions);
    refreshFocusTaskOptions();
  });

  // Goals update
  store.on('goals_changed', async () => {
    cachedGoals = await getAllGoals();
    cachedTasks = await getAllTasks();
    await renderGoalsSection(cachedTasks);
    await renderTodayTasks(cachedTasks);
  });

  // Focus session completed: updates streak, heatmap, and focus summary
  store.on('focus_session_completed', async () => {
    cachedSessions = await getAllFocusSessions();
    await renderStreakSection(cachedTasks, cachedSessions);
    const heatmapSvg = document.getElementById('heatmap-svg');
    const tooltipEl = document.getElementById('heatmap-tooltip');
    if (heatmapSvg) renderHeatmap(heatmapSvg, tooltipEl, cachedTasks, cachedSessions);
    renderShieldCard();
  });

  // Focus Shield data changed: re-render shield card
  store.on('shield_data_changed', () => {
    renderShieldCard();
  });

  // Midnight Rollover: seamless update without reload!
  store.on('midnight_rollover', async ({ newDate }) => {
    showToast(`MIDNIGHT ROLLOVER: ${newDate}`);
    await renderHomeScreen();
    renderShieldCard();
  });

  // Full data import or reset
  store.on('data_imported', async () => {
    await renderHomeScreen();
    renderShieldCard();
  });

  store.on('data_reset', async () => {
    await renderHomeScreen();
    renderShieldCard();
  });
}

// ============================================================================
// PROCEDURAL AMBIENT SOUND GENERATOR CONTROLS
// ============================================================================

export function setupAmbientControls() {
  const toggle = document.getElementById('focus-ambient-toggle');
  const presetSelect = document.getElementById('focus-ambient-preset');
  const volSlider = document.getElementById('focus-ambient-vol');
  const volLabel = document.getElementById('focus-ambient-vol-label');
  const previewBtn = document.getElementById('focus-ambient-preview-btn');

  if (!toggle || !presetSelect || !volSlider) return;

  const currentSettings = getAmbientSettings();
  toggle.checked = Boolean(currentSettings.enabled);
  presetSelect.value = currentSettings.preset || 'tape_hiss';
  volSlider.value = Math.round((currentSettings.volume !== undefined ? currentSettings.volume : 0.4) * 100);
  if (volLabel) volLabel.textContent = `${volSlider.value}%`;

  toggle.addEventListener('change', () => {
    const isEnabled = toggle.checked;
    saveAmbientSettings({ enabled: isEnabled });
    showToast(isEnabled ? 'AMBIENT NOISE: ENABLED' : 'AMBIENT NOISE: DISABLED');

    // If focus timer is currently running, sync immediately
    if (window.__isFocusTimerRunning && window.__isFocusTimerRunning()) {
      if (isEnabled) {
        ensureAudioContext();
        startAmbientSound(presetSelect.value);
        if (previewBtn) previewBtn.textContent = 'STOP PLAY';
      } else {
        stopAmbientSound();
        if (previewBtn) previewBtn.textContent = 'TEST PLAY';
      }
    }
  });

  presetSelect.addEventListener('change', () => {
    saveAmbientSettings({ preset: presetSelect.value });
    showToast('SOUNDSCAPE UPDATED');

    // If currently playing, seamlessly switch soundscape
    if (isAmbientPlaying()) {
      ensureAudioContext();
      startAmbientSound(presetSelect.value);
    }
  });

  volSlider.addEventListener('input', () => {
    const val = parseInt(volSlider.value, 10);
    if (volLabel) volLabel.textContent = `${val}%`;
    setAmbientVolume(val / 100);
  });

  if (previewBtn) {
    previewBtn.addEventListener('click', () => {
      ensureAudioContext();
      if (isAmbientPlaying()) {
        stopAmbientSound();
        previewBtn.textContent = 'TEST PLAY';
        showToast('AMBIENT STOPPED');
      } else {
        startAmbientSound(presetSelect.value);
        previewBtn.textContent = 'STOP PLAY';
        showToast('PLAYING SOUNDSCAPE');
      }
    });
  }

  // Reactive store subscription for cross-tab sync / settings restore
  store.subscribe('ambientSettings', (newSettings) => {
    if (!newSettings) return;
    if (document.activeElement !== volSlider) {
      volSlider.value = Math.round((newSettings.volume !== undefined ? newSettings.volume : 0.4) * 100);
      if (volLabel) volLabel.textContent = `${volSlider.value}%`;
    }
    if (document.activeElement !== toggle) {
      toggle.checked = Boolean(newSettings.enabled);
    }
    if (document.activeElement !== presetSelect) {
      presetSelect.value = newSettings.preset || 'tape_hiss';
    }
  });
}

// ============================================================================
// SECTION REFRESH CONTROLLER
// ============================================================================

export function setupSectionRefreshButtons() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('.section-refresh-btn');
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();

    btn.classList.add('refreshing');
    showToast('REFRESHING SYSTEM...');
    setTimeout(() => {
      window.location.reload();
    }, 180);
  });
}

function escapeHTML(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
