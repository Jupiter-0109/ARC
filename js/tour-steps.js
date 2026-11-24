/**
 * ARC - Onboarding Tour Configuration
 * Single source of truth for all guided tour steps.
 * 
 * Schema:
 *   id: Unique string identifier
 *   target: Query selector matching [data-tour="..."]
 *   tab: 'home' | 'focus' | 'settings' | 'global'
 *   title: Short retro uppercase title
 *   description: Brief description (max 2 sentences)
 *   since: Semver string when the step was introduced
 */

export const TOUR_VERSION = '1.3.0';

export const tourSteps = [
  // ==========================================================================
  // HOME SCREEN STEPS (Natural top-to-bottom dashboard flow)
  // ==========================================================================
  {
    id: 'why-card',
    target: '[data-tour="why-card"]',
    tab: 'home',
    title: '// YOUR WHY',
    description: 'Keep your personal purpose pinned at the top while scrolling. Tap this sticky card anytime to edit your core motivation.',
    since: '1.0.0'
  },
  {
    id: 'arc-card',
    target: '[data-tour="arc-card"]',
    tab: 'home',
    title: 'ARC COUNTDOWN',
    description: 'Track your long-term focus cycle, remaining days, and segmented progress bar. Tap Edit Arc to customize your cycle dates.',
    since: '1.0.0'
  },
  {
    id: 'streak-card',
    target: '[data-tour="streak-card"]',
    tab: 'home',
    title: 'PRODUCTIVITY STREAK',
    description: 'Build daily consistency. Completing at least 1 task or 1 focus session each day keeps your flame burning.',
    since: '1.0.0'
  },
  {
    id: 'goals-card',
    target: '[data-tour="goals-card"]',
    tab: 'home',
    title: 'MAIN GOALS (1-5)',
    description: 'Set up to 5 priority targets. Linking your daily tasks to a goal automatically advances its progress bar.',
    since: '1.0.0'
  },
  {
    id: 'tasks-card',
    target: '[data-tour="tasks-card"]',
    tab: 'home',
    title: "TODAY'S TASKS",
    description: 'Check off daily tasks, assign reminders, or swipe left to delete. Tap Roll Over Unfinished to carry tasks into tomorrow.',
    since: '1.0.0'
  },
  {
    id: 'heatmap-card',
    target: '[data-tour="heatmap-card"]',
    tab: 'home',
    title: 'ACTIVITY HEATMAP',
    description: 'Visualize your 16-week productivity history. Tap any cell to view completed tasks and focus sessions for that day.',
    since: '1.0.0'
  },

  // ==========================================================================
  // GLOBAL NAVIGATION
  // ==========================================================================
  {
    id: 'bottom-nav',
    target: '[data-tour="bottom-nav"]',
    tab: 'global',
    title: 'BOTTOM NAVIGATION',
    description: 'Switch effortlessly between your Home dashboard, deep Focus mode, and app Settings.',
    since: '1.0.0'
  },

  // ==========================================================================
  // FOCUS SCREEN STEPS
  // ==========================================================================
  {
    id: 'focus-timer',
    target: '[data-tour="focus-timer"]',
    tab: 'focus',
    title: 'POMODORO TIMER',
    description: 'Time your work sprints with absolute timestamp accuracy and Screen Wake Lock. Auto-cycles between focus and break phases.',
    since: '1.0.0'
  },
  {
    id: 'focus-log',
    target: '[data-tour="focus-log"]',
    tab: 'focus',
    title: "TODAY'S FOCUS LOG",
    description: 'Monitor your cumulative focused minutes and completed Pomodoro rounds in real time.',
    since: '1.0.0'
  },
  {
    id: 'ambient-sound',
    target: '[data-tour="ambient-sound"]',
    tab: 'focus',
    title: 'AMBIENT NOISE (PROCEDURAL)',
    description: 'Synthesizes offline background audio: CRT Hum & Tape Hiss, Rainy Night, or Deep Space Brown Noise. Auto-plays during focus.',
    since: '1.2.0'
  },
  {
    id: 'focus-shield',
    target: '[data-tour="focus-shield"]',
    tab: 'focus',
    title: 'FOCUS SHIELD',
    description: 'Stay honest during deep work. Tracks tab leaves, enforces strict session rules, and provides friction cooldowns for distractions.',
    since: '1.1.0'
  },

  // ==========================================================================
  // QUICK THEME (TOP BAR)
  // ==========================================================================
  {
    id: 'quick-theme',
    target: '[data-tour="quick-theme"]',
    tab: 'global',
    title: 'CRT THEME TOGGLE',
    description: 'Tap CRT anytime to instantly cycle between Paper retro, CRT Green, and CRT Amber display themes.',
    since: '1.0.0'
  },

  // ==========================================================================
  // SETTINGS SCREEN STEPS
  // ==========================================================================
  {
    id: 'settings-sounds',
    target: '[data-tour="settings-sounds"]',
    tab: 'settings',
    title: 'SESSION SOUNDS',
    description: 'Choose from 4 retro synthesized completion chimes, adjust volume, and test break-over alerts.',
    since: '1.1.0'
  },
  {
    id: 'settings-reminders',
    target: '[data-tour="settings-reminders"]',
    tab: 'settings',
    title: 'DAILY REMINDERS',
    description: 'Schedule offline daily notifications to plan your mornings and keep your productivity habits on track.',
    since: '1.0.0'
  },
  {
    id: 'settings-backup',
    target: '[data-tour="settings-backup"]',
    tab: 'settings',
    title: 'BACKUP & TOUR REPLAY',
    description: 'Export and restore complete JSON data archives, or replay this tutorial anytime.',
    since: '1.0.0'
  }
];
