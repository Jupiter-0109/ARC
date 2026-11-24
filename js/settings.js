/**
 * ARC - Settings & LocalStorage Engine
 * Handles user preferences, theme persistence, arc dates, pomodoro settings,
 * sound preferences, focus shield configuration, and JSON backup export/import.
 */

import { store, debounce, showInlineError, clearInlineError } from './store.js';
import {
  getLocalDateString,
  exportDatabaseData,
  importDatabaseData,
  clearDatabaseData
} from './db.js';
import { getSoundSettings, saveSoundSettings, getAmbientSettings, saveAmbientSettings, playSound, ensureAudioContext } from './sound.js';
import { getShieldSettings, saveShieldSettings, renderShieldCard } from './shield.js';
import { startTour } from './onboarding.js';

const STORAGE_KEYS = {
  WHY: 'arc_user_why',
  ARC_DATES: 'arc_cycle_dates',
  POMO: 'arc_pomodoro_settings',
  THEME: 'arc_active_theme',
  SCANLINES: 'arc_scanlines_enabled',
  DAILY_REMINDER: 'arc_daily_reminder_config',
  BEST_STREAK: 'arc_best_streak_record'
};

const DEFAULT_WHY = 'FOCUS ON THE ARC. MAKE EVERY TICK COUNT.';

function getDefaultArcDates() {
  const start = new Date();
  const end = new Date();
  end.setDate(start.getDate() + 90);

  return {
    title: '90-DAY FOCUS ARC',
    startDate: getLocalDateString(start),
    endDate: getLocalDateString(end)
  };
}

const DEFAULT_POMO = {
  focusMin: 25,
  shortBreakMin: 5,
  longBreakMin: 15,
  rounds: 4
};

const DEFAULT_DAILY_REMINDER = {
  enabled: false,
  time: '09:00'
};

// ============================================================================
// GETTERS & SETTERS (WITH STORE INTEGRATION)
// ============================================================================

export function getWhyNote() {
  const fromStore = store.get('why');
  if (fromStore !== null && fromStore !== undefined) return fromStore;

  const note = localStorage.getItem(STORAGE_KEYS.WHY);
  const val = note !== null ? note : DEFAULT_WHY;
  store.set('why', val, { broadcast: false, notify: false });
  return val;
}

export function setWhyNote(note) {
  const sanitized = (note || '').trim().slice(0, 200);
  localStorage.setItem(STORAGE_KEYS.WHY, sanitized);
  store.set('why', sanitized);
  return sanitized;
}

export function getArcDates() {
  const fromStore = store.get('arcDates');
  if (fromStore) return fromStore;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ARC_DATES);
    if (!raw) {
      const def = getDefaultArcDates();
      store.set('arcDates', def, { broadcast: false, notify: false });
      return def;
    }
    const parsed = JSON.parse(raw);
    if (!parsed.startDate || !parsed.endDate) {
      const def = getDefaultArcDates();
      store.set('arcDates', def, { broadcast: false, notify: false });
      return def;
    }
    store.set('arcDates', parsed, { broadcast: false, notify: false });
    return parsed;
  } catch (e) {
    const def = getDefaultArcDates();
    store.set('arcDates', def, { broadcast: false, notify: false });
    return def;
  }
}

export function setArcDates(title, startDate, endDate) {
  const config = {
    title: (title || 'CURRENT ARC').trim().slice(0, 40),
    startDate: startDate,
    endDate: endDate
  };
  localStorage.setItem(STORAGE_KEYS.ARC_DATES, JSON.stringify(config));
  store.set('arcDates', config);
  return config;
}

export function getPomodoroSettings() {
  const fromStore = store.get('pomodoro');
  if (fromStore) return fromStore;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.POMO);
    if (!raw) {
      store.set('pomodoro', { ...DEFAULT_POMO }, { broadcast: false, notify: false });
      return { ...DEFAULT_POMO };
    }
    const val = { ...DEFAULT_POMO, ...JSON.parse(raw) };
    store.set('pomodoro', val, { broadcast: false, notify: false });
    return val;
  } catch (e) {
    const val = { ...DEFAULT_POMO };
    store.set('pomodoro', val, { broadcast: false, notify: false });
    return val;
  }
}

export function setPomodoroSettings(settings) {
  const sanitized = {
    focusMin: Math.max(1, parseInt(settings.focusMin, 10) || 25),
    shortBreakMin: Math.max(1, parseInt(settings.shortBreakMin, 10) || 5),
    longBreakMin: Math.max(1, parseInt(settings.longBreakMin, 10) || 15),
    rounds: Math.max(1, parseInt(settings.rounds, 10) || 4)
  };
  localStorage.setItem(STORAGE_KEYS.POMO, JSON.stringify(sanitized));
  store.set('pomodoro', sanitized);
  return sanitized;
}

export function getTheme() {
  const fromStore = store.get('theme');
  if (fromStore) return fromStore;

  const theme = localStorage.getItem(STORAGE_KEYS.THEME) || 'paper';
  store.set('theme', theme, { broadcast: false, notify: false });
  return theme;
}

export function setTheme(themeName) {
  const validThemes = ['paper', 'crt-green', 'crt-amber'];
  const theme = validThemes.includes(themeName) ? themeName : 'paper';
  localStorage.setItem(STORAGE_KEYS.THEME, theme);
  applyThemeToDOM(theme);
  store.set('theme', theme);
  return theme;
}

export function getScanlines() {
  const fromStore = store.get('scanlines');
  if (fromStore !== null && fromStore !== undefined) return fromStore;

  const val = localStorage.getItem(STORAGE_KEYS.SCANLINES) === 'true';
  store.set('scanlines', val, { broadcast: false, notify: false });
  return val;
}

export function setScanlines(enabled) {
  localStorage.setItem(STORAGE_KEYS.SCANLINES, enabled ? 'true' : 'false');
  applyScanlinesToDOM(enabled);
  store.set('scanlines', enabled);
  return enabled;
}

export function getDailyReminderConfig() {
  const fromStore = store.get('dailyReminder');
  if (fromStore) return fromStore;

  try {
    const raw = localStorage.getItem(STORAGE_KEYS.DAILY_REMINDER);
    if (!raw) {
      store.set('dailyReminder', { ...DEFAULT_DAILY_REMINDER }, { broadcast: false, notify: false });
      return { ...DEFAULT_DAILY_REMINDER };
    }
    const val = { ...DEFAULT_DAILY_REMINDER, ...JSON.parse(raw) };
    store.set('dailyReminder', val, { broadcast: false, notify: false });
    return val;
  } catch (e) {
    const val = { ...DEFAULT_DAILY_REMINDER };
    store.set('dailyReminder', val, { broadcast: false, notify: false });
    return val;
  }
}

export function setDailyReminderConfig(config) {
  const sanitized = {
    enabled: Boolean(config.enabled),
    time: config.time || '09:00'
  };
  localStorage.setItem(STORAGE_KEYS.DAILY_REMINDER, JSON.stringify(sanitized));
  store.set('dailyReminder', sanitized);
  return sanitized;
}

export function getBestStreak() {
  const raw = localStorage.getItem(STORAGE_KEYS.BEST_STREAK);
  return raw ? parseInt(raw, 10) || 0 : 0;
}

export function setBestStreak(val) {
  const best = Math.max(0, parseInt(val, 10) || 0);
  localStorage.setItem(STORAGE_KEYS.BEST_STREAK, String(best));
  store.set('bestStreak', best);
  return best;
}

// ============================================================================
// DOM APPLICATION
// ============================================================================

export function applyThemeToDOM(theme) {
  const root = document.documentElement;
  const metaTheme = document.getElementById('meta-theme-color');

  if (theme === 'paper') {
    root.removeAttribute('data-theme');
    if (metaTheme) metaTheme.setAttribute('content', '#F4ECD8');
  } else {
    root.setAttribute('data-theme', theme);
    if (metaTheme) {
      metaTheme.setAttribute('content', theme === 'crt-green' ? '#081008' : '#100A02');
    }
  }
}

export function applyScanlinesToDOM(enabled) {
  if (enabled) {
    document.body.classList.add('scanlines-enabled');
  } else {
    document.body.classList.remove('scanlines-enabled');
  }
}

// ============================================================================
// BACKUP EXPORT & IMPORT
// ============================================================================

export function exportAllSettings() {
  return {
    why: getWhyNote(),
    arcDates: getArcDates(),
    pomodoro: getPomodoroSettings(),
    theme: getTheme(),
    scanlines: getScanlines(),
    dailyReminder: getDailyReminderConfig(),
    bestStreak: getBestStreak(),
    soundSettings: getSoundSettings(),
    shieldSettings: getShieldSettings(),
    ambientSettings: getAmbientSettings()
  };
}

export function importAllSettings(imported) {
  if (!imported) return;
  if (typeof imported.why === 'string') setWhyNote(imported.why);
  if (imported.arcDates) {
    setArcDates(imported.arcDates.title, imported.arcDates.startDate, imported.arcDates.endDate);
  }
  if (imported.pomodoro) setPomodoroSettings(imported.pomodoro);
  if (imported.theme) setTheme(imported.theme);
  if (typeof imported.scanlines === 'boolean') setScanlines(imported.scanlines);
  if (imported.dailyReminder) setDailyReminderConfig(imported.dailyReminder);
  if (typeof imported.bestStreak === 'number') setBestStreak(imported.bestStreak);
  if (imported.soundSettings) saveSoundSettings(imported.soundSettings);
  if (imported.shieldSettings) saveShieldSettings(imported.shieldSettings);
  if (imported.ambientSettings) saveAmbientSettings(imported.ambientSettings);
}

export async function exportCompleteBackup() {
  const settings = exportAllSettings();
  const dbData = await exportDatabaseData();

  const backupPayload = {
    app: 'ARC',
    version: 2,
    exportedAt: new Date().toISOString(),
    settings,
    database: dbData
  };

  const jsonStr = JSON.stringify(backupPayload, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `arc-backup-${getLocalDateString()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function importCompleteBackup(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const payload = JSON.parse(e.target.result);
        if (!payload || payload.app !== 'ARC') {
          throw new Error('INVALID BACKUP FILE FORMAT');
        }

        if (payload.settings) {
          importAllSettings(payload.settings);
        }

        if (payload.database) {
          await importDatabaseData(payload.database);
        }

        store.emit('data_imported');
        resolve(true);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

export async function resetAllData() {
  await clearDatabaseData();
  Object.values(STORAGE_KEYS).forEach((k) => localStorage.removeItem(k));
  localStorage.removeItem('arc_sound_config');
  localStorage.removeItem('arc_shield_config');
  localStorage.removeItem('arc_ambient_config');
  localStorage.removeItem('arc_onboarding_state');
  localStorage.removeItem('arc_active_timer_state');
  saveAmbientSettings({ enabled: false, preset: 'tape_hiss', volume: 0.4 });

  applyThemeToDOM('paper');
  applyScanlinesToDOM(false);
  store.emit('data_reset');
}

// ============================================================================
// SETTINGS TAB UI BINDINGS
// ============================================================================

export function setupSettingsView(uiCallbacks) {
  const { showToast, confirmAction, renderHomeScreen, testNotification } = uiCallbacks;

  // 1. Theme Buttons
  const themeBtns = document.querySelectorAll('.theme-btn');
  const activeTheme = getTheme();
  applyThemeToDOM(activeTheme);

  themeBtns.forEach((btn) => {
    const choice = btn.getAttribute('data-theme-choice');
    if (choice === activeTheme) btn.classList.add('active');

    btn.addEventListener('click', () => {
      themeBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      setTheme(choice);
      showToast(`SAVED: THEME ${choice.toUpperCase()}`);
    });
  });

  // Reactive theme subscriber: keep UI in sync across tabs
  store.subscribe('theme', (theme) => {
    applyThemeToDOM(theme);
    themeBtns.forEach((btn) => {
      if (btn.getAttribute('data-theme-choice') === theme) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  });

  // 2. Scanlines Toggle
  const scanlinesToggle = document.getElementById('toggle-scanlines');
  if (scanlinesToggle) {
    scanlinesToggle.checked = getScanlines();
    applyScanlinesToDOM(scanlinesToggle.checked);
    scanlinesToggle.addEventListener('change', () => {
      setScanlines(scanlinesToggle.checked);
      showToast(scanlinesToggle.checked ? 'SAVED: SCANLINES ON' : 'SAVED: SCANLINES OFF');
    });
  }

  // 3. Arc Settings Inputs with Debounce & Inline Validation
  const arcTitleInput = document.getElementById('setting-arc-title');
  const arcStartInput = document.getElementById('setting-arc-start');
  const arcEndInput = document.getElementById('setting-arc-end');
  const saveArcBtn = document.getElementById('save-arc-settings-btn');

  const currentArc = getArcDates();
  if (arcTitleInput) arcTitleInput.value = currentArc.title;
  if (arcStartInput) arcStartInput.value = currentArc.startDate;
  if (arcEndInput) arcEndInput.value = currentArc.endDate;

  const validateAndSaveArc = () => {
    const title = arcTitleInput ? arcTitleInput.value.trim() || 'CURRENT ARC' : 'CURRENT ARC';
    const start = arcStartInput ? arcStartInput.value : '';
    const end = arcEndInput ? arcEndInput.value : '';

    clearInlineError(arcStartInput);
    clearInlineError(arcEndInput);

    if (!start) {
      showInlineError(arcStartInput, 'START DATE REQUIRED');
      return false;
    }
    if (!end) {
      showInlineError(arcEndInput, 'END DATE REQUIRED');
      return false;
    }
    if (new Date(end) <= new Date(start)) {
      showInlineError(arcEndInput, 'END DATE MUST BE AFTER START DATE');
      return false;
    }

    setArcDates(title, start, end);
    showToast('SAVED: ARC DATES UPDATED');
    return true;
  };

  if (saveArcBtn) {
    saveArcBtn.addEventListener('click', () => {
      validateAndSaveArc();
    });
  }

  // Debounced input validation
  const debouncedArcValidation = debounce(() => {
    if (arcStartInput.value && arcEndInput.value) {
      if (new Date(arcEndInput.value) <= new Date(arcStartInput.value)) {
        showInlineError(arcEndInput, 'END DATE MUST BE AFTER START DATE');
      } else {
        clearInlineError(arcEndInput);
      }
    }
  }, 400);

  if (arcStartInput) arcStartInput.addEventListener('input', debouncedArcValidation);
  if (arcEndInput) arcEndInput.addEventListener('input', debouncedArcValidation);

  // 4. Pomodoro Defaults
  const pomoFocus = document.getElementById('setting-pomo-focus');
  const pomoShort = document.getElementById('setting-pomo-short');
  const pomoLong = document.getElementById('setting-pomo-long');
  const pomoRounds = document.getElementById('setting-pomo-rounds');
  const savePomoBtn = document.getElementById('save-pomo-settings-btn');

  const currentPomo = getPomodoroSettings();
  if (pomoFocus) pomoFocus.value = currentPomo.focusMin;
  if (pomoShort) pomoShort.value = currentPomo.shortBreakMin;
  if (pomoLong) pomoLong.value = currentPomo.longBreakMin;
  if (pomoRounds) pomoRounds.value = currentPomo.rounds;

  if (savePomoBtn) {
    savePomoBtn.addEventListener('click', () => {
      const updated = {
        focusMin: parseInt(pomoFocus.value, 10) || 25,
        shortBreakMin: parseInt(pomoShort.value, 10) || 5,
        longBreakMin: parseInt(pomoLong.value, 10) || 15,
        rounds: parseInt(pomoRounds.value, 10) || 4
      };
      setPomodoroSettings(updated);
      showToast('SAVED: POMODORO SETTINGS');
    });
  }

  // 5. Sound & Audio Settings (Feature 1)
  const soundEnable = document.getElementById('setting-sound-enable');
  const soundChoice = document.getElementById('setting-sound-choice');
  const soundVol = document.getElementById('setting-sound-volume');
  const soundVolVal = document.getElementById('setting-sound-volume-val');
  const soundRepeat = document.getElementById('setting-sound-repeat');
  const previewChimeBtn = document.getElementById('preview-sound-btn');
  const previewBreakBtn = document.getElementById('preview-break-sound-btn');

  const currentSound = getSoundSettings();
  if (soundEnable) soundEnable.checked = currentSound.enabled;
  if (soundChoice) soundChoice.value = currentSound.sound;
  if (soundVol) soundVol.value = Math.round(currentSound.volume * 100);
  if (soundVolVal) soundVolVal.textContent = `${Math.round(currentSound.volume * 100)}%`;
  if (soundRepeat) soundRepeat.checked = currentSound.repeat;

  const persistSound = () => {
    const updated = saveSoundSettings({
      enabled: soundEnable ? soundEnable.checked : true,
      sound: soundChoice ? soundChoice.value : 'chime',
      volume: soundVol ? parseInt(soundVol.value, 10) / 100 : 0.8,
      repeat: soundRepeat ? soundRepeat.checked : true
    });
    showToast('SAVED: SOUND CONFIG');
  };

  if (soundEnable) soundEnable.addEventListener('change', persistSound);
  if (soundChoice) soundChoice.addEventListener('change', persistSound);
  if (soundRepeat) soundRepeat.addEventListener('change', persistSound);

  if (soundVol) {
    soundVol.addEventListener('input', () => {
      if (soundVolVal) soundVolVal.textContent = `${soundVol.value}%`;
    });
    soundVol.addEventListener('change', persistSound);
  }

  if (previewChimeBtn) {
    previewChimeBtn.addEventListener('click', () => {
      ensureAudioContext();
      playSound('preview');
      showToast(`PREVIEWING: ${soundChoice.value.toUpperCase()}`);
    });
  }

  if (previewBreakBtn) {
    previewBreakBtn.addEventListener('click', () => {
      ensureAudioContext();
      playSound('break_over');
      showToast('PREVIEWING: BREAK OVER CHIME');
    });
  }

  // 6. Focus Shield Settings (Feature 3)
  const shieldStrict = document.getElementById('setting-shield-strict');
  const shieldMaxLeaves = document.getElementById('setting-shield-max-leaves');
  const shieldNotifyAway = document.getElementById('setting-shield-notify-away');
  const saveShieldBtn = document.getElementById('save-shield-settings-btn');

  const currentShield = getShieldSettings();
  if (shieldStrict) shieldStrict.checked = currentShield.strictMode;
  if (shieldMaxLeaves) shieldMaxLeaves.value = currentShield.maxLeaves;
  if (shieldNotifyAway) shieldNotifyAway.checked = currentShield.notifyOnAway;

  if (saveShieldBtn) {
    saveShieldBtn.addEventListener('click', () => {
      saveShieldSettings({
        strictMode: shieldStrict.checked,
        maxLeaves: parseInt(shieldMaxLeaves.value, 10) || 3,
        notifyOnAway: shieldNotifyAway.checked
      });
      showToast('SAVED: SHIELD CONFIG');
      renderShieldCard();
    });
  }

  // 7. Daily Reminder Settings
  const reminderEnable = document.getElementById('setting-daily-reminder-enable');
  const reminderTime = document.getElementById('setting-daily-reminder-time');
  const currentReminder = getDailyReminderConfig();

  if (reminderEnable) reminderEnable.checked = currentReminder.enabled;
  if (reminderTime) reminderTime.value = currentReminder.time;

  const saveDailyReminder = () => {
    setDailyReminderConfig({
      enabled: reminderEnable ? reminderEnable.checked : false,
      time: reminderTime ? reminderTime.value : '09:00'
    });
    showToast('SAVED: REMINDER CONFIG');
  };

  if (reminderEnable) reminderEnable.addEventListener('change', saveDailyReminder);
  if (reminderTime) reminderTime.addEventListener('change', saveDailyReminder);

  // Test Notification Button
  const testNotifBtn = document.getElementById('test-notification-btn');
  if (testNotifBtn && testNotification) {
    testNotifBtn.addEventListener('click', () => {
      testNotification();
    });
  }

  // 8. Backup & Restore
  const exportBtn = document.getElementById('export-backup-btn');
  const importBtn = document.getElementById('import-backup-btn');
  const fileInput = document.getElementById('import-backup-input');

  if (exportBtn) {
    exportBtn.addEventListener('click', async () => {
      await exportCompleteBackup();
      showToast('BACKUP ARCHIVE DOWNLOADED');
    });
  }

  if (importBtn && fileInput) {
    importBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files[0];
      if (!file) return;

      confirmAction('RESTORE DATA FROM THIS BACKUP? CURRENT DATA WILL BE MERGED/REPLACED.', async () => {
        try {
          await importCompleteBackup(file);
          showToast('BACKUP RESTORED SUCCESSFULLY!');
          renderHomeScreen();
          setupSettingsView(uiCallbacks);
          renderShieldCard();
        } catch (e) {
          showToast('BACKUP RESTORE FAILED: ' + e.message);
        } finally {
          fileInput.value = '';
        }
      });
    });
  }

  // Replay Tour Tutorial Button
  const replayTourBtn = document.getElementById('replay-tour-btn');
  if (replayTourBtn) {
    replayTourBtn.addEventListener('click', () => {
      startTour({ forceReplay: true });
    });
  }

  // Reset All Data
  const resetBtn = document.getElementById('reset-all-data-btn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      confirmAction('DANGER: PERMANENTLY WIPE ALL ARC DATA, TASKS, AND FOCUS SESSIONS?', async () => {
        await resetAllData();
        showToast('SYSTEM DATA WIPED CLEAN');
        renderHomeScreen();
        setupSettingsView(uiCallbacks);
        renderShieldCard();
      });
    });
  }

  // 9. Network state indicator
  const networkEl = document.getElementById('network-status-display');
  const updateNetworkStatus = () => {
    if (networkEl) {
      if (navigator.onLine) {
        networkEl.textContent = 'ONLINE';
        networkEl.style.color = 'var(--teal)';
      } else {
        networkEl.textContent = 'OFFLINE (STANDALONE)';
        networkEl.style.color = 'var(--tomato)';
      }
    }
  };
  window.addEventListener('online', updateNetworkStatus);
  window.addEventListener('offline', updateNetworkStatus);
  updateNetworkStatus();
}
