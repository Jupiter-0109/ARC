/**
 * ARC - Streak Engine
 * Evaluates productivity streak based on daily task completion and valid focus sessions.
 * Broken sessions (where strict mode leave limit was exceeded) do NOT qualify.
 */

import { getLocalDateString } from './db.js';
import { getBestStreak, setBestStreak } from './settings.js';

/**
 * Single constant rule defining what qualifies a day for the streak
 */
export const STREAK_QUALIFY_RULE = Object.freeze({
  MIN_COMPLETED_TASKS: 1,
  MIN_FOCUS_SESSIONS: 1
});

/**
 * Check if the activity counts for a given day qualify for the streak
 * @param {number} completedTasksCount
 * @param {number} focusSessionsCount
 * @returns {boolean}
 */
export function isDayQualified(completedTasksCount = 0, focusSessionsCount = 0) {
  return (
    completedTasksCount >= STREAK_QUALIFY_RULE.MIN_COMPLETED_TASKS ||
    focusSessionsCount >= STREAK_QUALIFY_RULE.MIN_FOCUS_SESSIONS
  );
}

/**
 * Calculate current streak, best streak, and today's status
 * @param {Array<Object>} allTasks
 * @param {Array<Object>} allFocusSessions
 * @returns {{ currentStreak: number, bestStreak: number, isTodayQualified: boolean }}
 */
export function calculateStreak(allTasks = [], allFocusSessions = []) {
  // Build a map of dateStr -> { tasks: number, sessions: number }
  const activityMap = new Map();

  for (const t of allTasks) {
    if (t.completed && t.date) {
      const counts = activityMap.get(t.date) || { tasks: 0, sessions: 0 };
      counts.tasks += 1;
      activityMap.set(t.date, counts);
    }
  }

  for (const s of allFocusSessions) {
    // Only count non-broken sessions toward the streak
    if (s.date && !s.isBroken) {
      const counts = activityMap.get(s.date) || { tasks: 0, sessions: 0 };
      counts.sessions += 1;
      activityMap.set(s.date, counts);
    }
  }

  const today = new Date();
  const todayStr = getLocalDateString(today);
  const todayData = activityMap.get(todayStr) || { tasks: 0, sessions: 0 };
  const isTodayDone = isDayQualified(todayData.tasks, todayData.sessions);

  // Check consecutive days starting from today or yesterday
  let currentStreak = 0;
  let checkDate = new Date(today);

  if (isTodayDone) {
    // Today qualifies, count today and walk backward
    while (true) {
      const dateStr = getLocalDateString(checkDate);
      const data = activityMap.get(dateStr) || { tasks: 0, sessions: 0 };
      if (isDayQualified(data.tasks, data.sessions)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  } else {
    // Today not done yet; streak isn't lost if yesterday was qualified
    checkDate.setDate(checkDate.getDate() - 1);
    while (true) {
      const dateStr = getLocalDateString(checkDate);
      const data = activityMap.get(dateStr) || { tasks: 0, sessions: 0 };
      if (isDayQualified(data.tasks, data.sessions)) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
  }

  // Calculate historical all-time best streak across all activity dates
  let maxConsecutive = 0;
  const sortedDates = Array.from(activityMap.keys())
    .filter((d) => {
      const item = activityMap.get(d);
      return isDayQualified(item.tasks, item.sessions);
    })
    .sort();

  if (sortedDates.length > 0) {
    let tempStreak = 1;
    maxConsecutive = 1;

    for (let i = 1; i < sortedDates.length; i++) {
      const prev = new Date(sortedDates[i - 1]);
      const curr = new Date(sortedDates[i]);
      const diffDays = Math.round((curr - prev) / (1000 * 60 * 60 * 24));

      if (diffDays === 1) {
        tempStreak++;
      } else if (diffDays > 1) {
        tempStreak = 1;
      }
      if (tempStreak > maxConsecutive) {
        maxConsecutive = tempStreak;
      }
    }
  }

  const storedBest = getBestStreak();
  const bestStreak = Math.max(storedBest, maxConsecutive, currentStreak);
  setBestStreak(bestStreak);

  return {
    currentStreak,
    bestStreak,
    isTodayQualified: isTodayDone
  };
}
