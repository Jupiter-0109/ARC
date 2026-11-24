/**
 * ARC - IndexedDB Storage Engine
 * Manages tasks, goals, focus sessions, shield usage, and shield leave logs.
 */

const DB_NAME = 'ARC_DB';
const DB_VERSION = 2;

let dbInstance = null;

/**
 * Returns formatted local date string 'YYYY-MM-DD'
 * @param {Date} [date=new Date()]
 * @returns {string}
 */
export function getLocalDateString(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Open or initialize the IndexedDB database
 * @returns {Promise<IDBDatabase>}
 */
export function openDB() {
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Tasks Object Store
      if (!db.objectStoreNames.contains('tasks')) {
        const taskStore = db.createObjectStore('tasks', { keyPath: 'id' });
        taskStore.createIndex('by_date', 'date', { unique: false });
        taskStore.createIndex('by_goal', 'goalId', { unique: false });
        taskStore.createIndex('by_completed', 'completed', { unique: false });
      }

      // 2. Goals Object Store
      if (!db.objectStoreNames.contains('goals')) {
        const goalStore = db.createObjectStore('goals', { keyPath: 'id' });
        goalStore.createIndex('by_completed', 'completed', { unique: false });
      }

      // 3. Focus Sessions Object Store
      if (!db.objectStoreNames.contains('focusSessions')) {
        const sessionStore = db.createObjectStore('focusSessions', { keyPath: 'id' });
        sessionStore.createIndex('by_date', 'date', { unique: false });
        sessionStore.createIndex('by_task', 'linkedTaskId', { unique: false });
      }

      // 4. Focus Shield Usage Store
      if (!db.objectStoreNames.contains('shieldUsage')) {
        const usageStore = db.createObjectStore('shieldUsage', { keyPath: 'id' });
        usageStore.createIndex('by_date', 'date', { unique: false });
        usageStore.createIndex('by_app', 'appName', { unique: false });
      }

      // 5. Focus Shield Leaves Store
      if (!db.objectStoreNames.contains('shieldLeaves')) {
        const leavesStore = db.createObjectStore('shieldLeaves', { keyPath: 'id' });
        leavesStore.createIndex('by_date', 'date', { unique: false });
        leavesStore.createIndex('by_session', 'sessionId', { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('IndexedDB open failed:', event.target.error);
      reject(event.target.error);
    };
  });
}

/**
 * Helper to execute a transaction
 */
function getStore(storeName, mode = 'readonly') {
  return openDB().then((db) => {
    const tx = db.transaction(storeName, mode);
    return tx.objectStore(storeName);
  });
}

// ============================================================================
// TASKS OPERATIONS
// ============================================================================

export async function getAllTasks() {
  const store = await getStore('tasks', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getTasksByDate(dateStr) {
  const store = await getStore('tasks', 'readonly');
  const index = store.index('by_date');
  return new Promise((resolve, reject) => {
    const req = index.getAll(dateStr);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getTaskById(id) {
  const store = await getStore('tasks', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveTask(task) {
  const store = await getStore('tasks', 'readwrite');
  if (!task.id) {
    task.id = 'task_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }
  if (!task.createdAt) {
    task.createdAt = Date.now();
  }
  return new Promise((resolve, reject) => {
    const req = store.put(task);
    req.onsuccess = () => resolve(task);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTask(id) {
  const store = await getStore('tasks', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

export async function toggleTaskComplete(id) {
  const task = await getTaskById(id);
  if (!task) return null;
  task.completed = !task.completed;
  task.completedAt = task.completed ? Date.now() : null;
  return saveTask(task);
}

export async function rolloverUnfinishedTasks(fromDateStr, toDateStr) {
  const tasks = await getTasksByDate(fromDateStr);
  const unfinished = tasks.filter((t) => !t.completed);
  const updatedTasks = [];

  for (const t of unfinished) {
    t.date = toDateStr;
    await saveTask(t);
    updatedTasks.push(t);
  }
  return updatedTasks;
}

// ============================================================================
// GOALS OPERATIONS
// ============================================================================

export async function getAllGoals() {
  const store = await getStore('goals', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getGoalById(id) {
  const store = await getStore('goals', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

export async function saveGoal(goal) {
  const store = await getStore('goals', 'readwrite');
  if (!goal.id) {
    goal.id = 'goal_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }
  if (!goal.createdAt) {
    goal.createdAt = Date.now();
  }
  return new Promise((resolve, reject) => {
    const req = store.put(goal);
    req.onsuccess = () => resolve(goal);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteGoal(id) {
  const store = await getStore('goals', 'readwrite');
  return new Promise((resolve, reject) => {
    const req = store.delete(id);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// FOCUS SESSIONS OPERATIONS
// ============================================================================

export async function getAllFocusSessions() {
  const store = await getStore('focusSessions', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getFocusSessionsByDate(dateStr) {
  const store = await getStore('focusSessions', 'readonly');
  const index = store.index('by_date');
  return new Promise((resolve, reject) => {
    const req = index.getAll(dateStr);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveFocusSession(session) {
  const store = await getStore('focusSessions', 'readwrite');
  if (!session.id) {
    session.id = 'session_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }
  if (!session.timestamp) {
    session.timestamp = Date.now();
  }
  if (!session.date) {
    session.date = getLocalDateString(new Date(session.timestamp));
  }
  // Default clean if undefined
  if (session.wasClean === undefined) {
    session.wasClean = true;
  }
  if (session.isBroken === undefined) {
    session.isBroken = false;
  }

  return new Promise((resolve, reject) => {
    const req = store.put(session);
    req.onsuccess = () => resolve(session);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// FOCUS SHIELD: USAGE & LEAVES OPERATIONS
// ============================================================================

export async function saveShieldUsage(entry) {
  const store = await getStore('shieldUsage', 'readwrite');
  if (!entry.id) {
    entry.id = 'usage_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }
  if (!entry.timestamp) {
    entry.timestamp = Date.now();
  }
  if (!entry.date) {
    entry.date = getLocalDateString(new Date(entry.timestamp));
  }
  return new Promise((resolve, reject) => {
    const req = store.put(entry);
    req.onsuccess = () => resolve(entry);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllShieldUsage() {
  const store = await getStore('shieldUsage', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getShieldUsageByDate(dateStr) {
  const store = await getStore('shieldUsage', 'readonly');
  const index = store.index('by_date');
  return new Promise((resolve, reject) => {
    const req = index.getAll(dateStr);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function saveShieldLeave(leave) {
  const store = await getStore('shieldLeaves', 'readwrite');
  if (!leave.id) {
    leave.id = 'leave_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
  }
  if (!leave.timestamp) {
    leave.timestamp = Date.now();
  }
  if (!leave.date) {
    leave.date = getLocalDateString(new Date(leave.timestamp));
  }
  return new Promise((resolve, reject) => {
    const req = store.put(leave);
    req.onsuccess = () => resolve(leave);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllShieldLeaves() {
  const store = await getStore('shieldLeaves', 'readonly');
  return new Promise((resolve, reject) => {
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export async function getShieldLeavesByDate(dateStr) {
  const store = await getStore('shieldLeaves', 'readonly');
  const index = store.index('by_date');
  return new Promise((resolve, reject) => {
    const req = index.getAll(dateStr);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// ============================================================================
// BACKUP / EXPORT / IMPORT / RESET
// ============================================================================

export async function exportDatabaseData() {
  const [tasks, goals, focusSessions, shieldUsage, shieldLeaves] = await Promise.all([
    getAllTasks(),
    getAllGoals(),
    getAllFocusSessions(),
    getAllShieldUsage(),
    getAllShieldLeaves()
  ]);
  return { tasks, goals, focusSessions, shieldUsage, shieldLeaves };
}

export async function clearDatabaseData() {
  const db = await openDB();
  const storeNames = ['tasks', 'goals', 'focusSessions', 'shieldUsage', 'shieldLeaves'];
  return Promise.all(
    storeNames.map((name) => {
      if (!db.objectStoreNames.contains(name)) return Promise.resolve(true);
      return new Promise((resolve, reject) => {
        const tx = db.transaction(name, 'readwrite');
        const req = tx.objectStore(name).clear();
        req.onsuccess = () => resolve(true);
        req.onerror = () => reject(req.error);
      });
    })
  );
}

export async function importDatabaseData(data) {
  await clearDatabaseData();
  const db = await openDB();

  if (Array.isArray(data.tasks)) {
    const tx = db.transaction('tasks', 'readwrite');
    const store = tx.objectStore('tasks');
    for (const t of data.tasks) store.put(t);
  }

  if (Array.isArray(data.goals)) {
    const tx = db.transaction('goals', 'readwrite');
    const store = tx.objectStore('goals');
    for (const g of data.goals) store.put(g);
  }

  if (Array.isArray(data.focusSessions)) {
    const tx = db.transaction('focusSessions', 'readwrite');
    const store = tx.objectStore('focusSessions');
    for (const s of data.focusSessions) store.put(s);
  }

  if (Array.isArray(data.shieldUsage) && db.objectStoreNames.contains('shieldUsage')) {
    const tx = db.transaction('shieldUsage', 'readwrite');
    const store = tx.objectStore('shieldUsage');
    for (const u of data.shieldUsage) store.put(u);
  }

  if (Array.isArray(data.shieldLeaves) && db.objectStoreNames.contains('shieldLeaves')) {
    const tx = db.transaction('shieldLeaves', 'readwrite');
    const store = tx.objectStore('shieldLeaves');
    for (const l of data.shieldLeaves) store.put(l);
  }

  return true;
}
