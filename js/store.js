/**
 * ARC - Central Reactive State Store & Event Bus
 * Provides pub/sub subscriptions, multi-tab sync via BroadcastChannel,
 * input debouncing, inline retro validation helpers, and midnight rollover.
 */

class ReactiveStore {
  constructor() {
    this._state = new Map();
    this._subscribers = new Map(); // key -> Set of callbacks
    this._eventListeners = new Map(); // event -> Set of callbacks
    this._channel = null;

    // Feature detect BroadcastChannel
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this._channel = new BroadcastChannel('arc_state_sync_channel');
        this._channel.onmessage = (event) => {
          const { type, key, value, eventName, data } = event.data || {};
          if (type === 'SET_STATE' && key) {
            this.set(key, value, { broadcast: false, source: 'remote' });
          } else if (type === 'EMIT_EVENT' && eventName) {
            this.emit(eventName, data, { broadcast: false, source: 'remote' });
          }
        };
      } catch (e) {
        console.warn('BroadcastChannel not supported or restricted, falling back to storage events');
      }
    }

    // Fallback: listen to localStorage events across tabs
    window.addEventListener('storage', (e) => {
      if (e.key && e.key.startsWith('arc_')) {
        // Emit general change so sections can re-query if needed
        this.emit('external_storage_change', { key: e.key, newValue: e.newValue }, { broadcast: false });
      }
    });

    // Setup Local Midnight Rollover Detection
    this._lastDateStr = this.getLocalDateString();
    this._setupMidnightTimer();

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        const currentDateStr = this.getLocalDateString();
        if (currentDateStr !== this._lastDateStr) {
          this._lastDateStr = currentDateStr;
          this.emit('midnight_rollover', { newDate: currentDateStr });
        }
      }
    });
  }

  getLocalDateString(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  _setupMidnightTimer() {
    const now = new Date();
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1);
    const msUntilMidnight = midnight.getTime() - now.getTime();

    setTimeout(() => {
      const newDateStr = this.getLocalDateString();
      if (newDateStr !== this._lastDateStr) {
        this._lastDateStr = newDateStr;
        this.emit('midnight_rollover', { newDate: newDateStr });
      }
      this._setupMidnightTimer();
    }, Math.max(1000, msUntilMidnight));
  }

  /**
   * Get value from store
   */
  get(key, defaultValue = null) {
    if (this._state.has(key)) {
      return this._state.get(key);
    }
    return defaultValue;
  }

  /**
   * Set value in store and notify subscribers
   */
  set(key, value, { broadcast = true, notify = true, source = 'local' } = {}) {
    const oldValue = this._state.get(key);
    this._state.set(key, value);

    if (notify) {
      const subs = this._subscribers.get(key);
      if (subs) {
        subs.forEach((cb) => {
          try {
            cb(value, oldValue, { source });
          } catch (err) {
            console.error(`Error in store subscriber for "${key}":`, err);
          }
        });
      }
    }

    if (broadcast && this._channel) {
      try {
        this._channel.postMessage({
          type: 'SET_STATE',
          key,
          value
        });
      } catch (err) {
        console.warn('Failed to broadcast state change:', err);
      }
    }

    return value;
  }

  /**
   * Subscribe to changes for a specific key
   */
  subscribe(key, callback) {
    if (!this._subscribers.has(key)) {
      this._subscribers.set(key, new Set());
    }
    this._subscribers.get(key).add(callback);

    // Call immediately with current value if exists
    if (this._state.has(key)) {
      try {
        callback(this._state.get(key), undefined, { source: 'initial' });
      } catch (err) {
        console.error(`Error in initial subscriber for "${key}":`, err);
      }
    }

    // Return unsubscribe function
    return () => {
      const set = this._subscribers.get(key);
      if (set) set.delete(callback);
    };
  }

  /**
   * Emit an event to event bus
   */
  emit(eventName, data = null, { broadcast = true, source = 'local' } = {}) {
    const listeners = this._eventListeners.get(eventName);
    if (listeners) {
      listeners.forEach((cb) => {
        try {
          cb(data, { source });
        } catch (err) {
          console.error(`Error in store event listener for "${eventName}":`, err);
        }
      });
    }

    if (broadcast && this._channel) {
      try {
        this._channel.postMessage({
          type: 'EMIT_EVENT',
          eventName,
          data
        });
      } catch (err) {
        console.warn('Failed to broadcast event:', err);
      }
    }
  }

  /**
   * Listen to an event
   */
  on(eventName, callback) {
    if (!this._eventListeners.has(eventName)) {
      this._eventListeners.set(eventName, new Set());
    }
    this._eventListeners.get(eventName).add(callback);

    return () => {
      const set = this._eventListeners.get(eventName);
      if (set) set.delete(callback);
    };
  }
}

// Global Store Singleton
export const store = new ReactiveStore();

// ============================================================================
// UTILITIES: DEBOUNCE & RETRO INLINE VALIDATION
// ============================================================================

/**
 * Creates a debounced function that delays invoking func
 */
export function debounce(func, wait = 300) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Display an inline retro error message below an input element
 */
export function showInlineError(inputEl, message) {
  if (!inputEl) return;
  inputEl.classList.add('input-error');

  let errorEl = inputEl.nextElementSibling;
  if (!errorEl || !errorEl.classList.contains('retro-inline-error')) {
    errorEl = document.createElement('div');
    errorEl.className = 'retro-inline-error';
    inputEl.parentNode.insertBefore(errorEl, inputEl.nextSibling);
  }
  errorEl.textContent = `! ${message.toUpperCase()}`;
}

/**
 * Clear any inline retro error message below an input element
 */
export function clearInlineError(inputEl) {
  if (!inputEl) return;
  inputEl.classList.remove('input-error');

  const errorEl = inputEl.nextElementSibling;
  if (errorEl && errorEl.classList.contains('retro-inline-error')) {
    errorEl.remove();
  }
}
