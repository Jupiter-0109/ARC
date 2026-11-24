/**
 * ARC - Activity Heatmap Component
 * Renders a 16-week GitHub-style contribution grid using SVG.
 * Mon-Sun rows with month labels, 4 activity intensity levels,
 * and clean focus session indicators in tooltips.
 */

import { getLocalDateString } from './db.js';

const WEEKS_COUNT = 16;
const CELL_SIZE = 14;
const CELL_GAP = 3;
const LABEL_LEFT_OFFSET = 24;
const LABEL_TOP_OFFSET = 18;

/**
 * Maps total activity count (tasks + focus sessions) to intensity level 0-4
 * @param {number} totalActivity
 * @returns {number}
 */
export function getActivityLevel(totalActivity) {
  if (totalActivity <= 0) return 0;
  if (totalActivity === 1) return 1;
  if (totalActivity <= 3) return 2;
  if (totalActivity <= 5) return 3;
  return 4;
}

/**
 * Render the activity heatmap into an SVG element
 * @param {SVGSVGElement} svgElement
 * @param {HTMLElement} tooltipElement
 * @param {Array<Object>} allTasks
 * @param {Array<Object>} allFocusSessions
 */
export function renderHeatmap(svgElement, tooltipElement, allTasks = [], allFocusSessions = []) {
  if (!svgElement) return;

  // Build activity count dictionary: dateStr -> { tasks: 0, sessions: 0, cleanSessions: 0, total: 0 }
  const countsByDate = new Map();

  for (const t of allTasks) {
    if (t.completed && t.date) {
      const entry = countsByDate.get(t.date) || { tasks: 0, sessions: 0, cleanSessions: 0, total: 0 };
      entry.tasks += 1;
      entry.total += 1;
      countsByDate.set(t.date, entry);
    }
  }

  for (const s of allFocusSessions) {
    // Only count non-broken sessions in total activity
    if (s.date && !s.isBroken) {
      const entry = countsByDate.get(s.date) || { tasks: 0, sessions: 0, cleanSessions: 0, total: 0 };
      entry.sessions += 1;
      entry.total += 1;
      if (s.wasClean) {
        entry.cleanSessions += 1;
      }
      countsByDate.set(s.date, entry);
    }
  }

  // Calculate the grid dates: End on current week Sunday, go back 16 weeks
  const today = new Date();
  const currentDayOfWeek = today.getDay(); // 0 (Sun) to 6 (Sat)
  const normalizedTodayDay = (currentDayOfWeek + 6) % 7;

  const endDate = new Date(today);
  endDate.setDate(today.getDate() + (6 - normalizedTodayDay));

  const totalDays = WEEKS_COUNT * 7;
  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - totalDays + 1);

  const svgWidth = LABEL_LEFT_OFFSET + WEEKS_COUNT * (CELL_SIZE + CELL_GAP) + 10;
  const svgHeight = LABEL_TOP_OFFSET + 7 * (CELL_SIZE + CELL_GAP) + 6;

  svgElement.setAttribute('viewBox', `0 0 ${svgWidth} ${svgHeight}`);
  svgElement.setAttribute('width', `${svgWidth}`);
  svgElement.setAttribute('height', `${svgHeight}`);

  // Clear existing content
  svgElement.innerHTML = '';

  const ns = 'http://www.w3.org/2000/svg';

  // 1. Day of week labels (M, W, F)
  const dayNames = ['M', '', 'W', '', 'F', '', 'S'];
  dayNames.forEach((name, index) => {
    if (!name) return;
    const text = document.createElementNS(ns, 'text');
    text.setAttribute('x', '4');
    text.setAttribute('y', String(LABEL_TOP_OFFSET + index * (CELL_SIZE + CELL_GAP) + CELL_SIZE - 2));
    text.setAttribute('fill', 'currentColor');
    text.setAttribute('font-size', '11');
    text.setAttribute('opacity', '0.6');
    text.textContent = name;
    svgElement.appendChild(text);
  });

  // 2. Month labels across top
  let lastMonth = -1;
  const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

  for (let week = 0; week < WEEKS_COUNT; week++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(startDate.getDate() + week * 7);
    const month = weekStart.getMonth();

    if (month !== lastMonth && week < WEEKS_COUNT - 1) {
      const monthText = document.createElementNS(ns, 'text');
      const posX = LABEL_LEFT_OFFSET + week * (CELL_SIZE + CELL_GAP);
      monthText.setAttribute('x', String(posX));
      monthText.setAttribute('y', String(LABEL_TOP_OFFSET - 5));
      monthText.setAttribute('fill', 'currentColor');
      monthText.setAttribute('font-size', '10');
      monthText.setAttribute('font-family', 'var(--font-heading)');
      monthText.setAttribute('opacity', '0.8');
      monthText.textContent = monthNames[month];
      svgElement.appendChild(monthText);
      lastMonth = month;
    }
  }

  // 3. Grid Cells
  const iterDate = new Date(startDate);
  const todayStr = getLocalDateString(today);

  for (let i = 0; i < totalDays; i++) {
    const dateStr = getLocalDateString(iterDate);
    const dayOfWeek = (iterDate.getDay() + 6) % 7; // Mon=0 .. Sun=6
    const weekIndex = Math.floor(i / 7);

    const x = LABEL_LEFT_OFFSET + weekIndex * (CELL_SIZE + CELL_GAP);
    const y = LABEL_TOP_OFFSET + dayOfWeek * (CELL_SIZE + CELL_GAP);

    const counts = countsByDate.get(dateStr) || { tasks: 0, sessions: 0, cleanSessions: 0, total: 0 };
    const level = getActivityLevel(counts.total);

    const rect = document.createElementNS(ns, 'rect');
    rect.setAttribute('x', String(x));
    rect.setAttribute('y', String(y));
    rect.setAttribute('width', String(CELL_SIZE));
    rect.setAttribute('height', String(CELL_SIZE));
    rect.setAttribute('class', `heatmap-cell level-${level}`);
    rect.setAttribute('data-date', dateStr);
    rect.setAttribute('data-tasks', String(counts.tasks));
    rect.setAttribute('data-sessions', String(counts.sessions));
    rect.setAttribute('data-clean', String(counts.cleanSessions));
    rect.setAttribute('data-total', String(counts.total));
    rect.setAttribute('tabindex', '0');
    rect.setAttribute('role', 'button');
    rect.setAttribute(
      'aria-label',
      `${dateStr}: ${counts.tasks} tasks, ${counts.sessions} focus sessions (${counts.cleanSessions} clean)`
    );

    // Highlight today cell outline
    if (dateStr === todayStr) {
      rect.setAttribute('stroke', 'var(--tomato)');
      rect.setAttribute('stroke-width', '2');
    }

    const showDetails = () => {
      if (tooltipElement) {
        tooltipElement.innerHTML = `<strong>${dateStr}</strong>: ${counts.tasks} task${
          counts.tasks === 1 ? '' : 's'
        }, ${counts.sessions} session${
          counts.sessions === 1 ? '' : 's'
        } (${counts.cleanSessions} clean) &bull; Level ${level}`;
      }
    };

    rect.addEventListener('click', showDetails);
    rect.addEventListener('focus', showDetails);

    svgElement.appendChild(rect);

    iterDate.setDate(iterDate.getDate() + 1);
  }
}
