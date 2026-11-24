/**
 * ARC - Feature-Agnostic Onboarding Tour Engine
 * Provides spotlight focus, retro tooltips, tab switching,
 * accessible keyboard navigation, and versioned mini-tours.
 */

import { TOUR_VERSION, tourSteps } from './tour-steps.js';

const STORAGE_KEY = 'arc_onboarding_state';

// State model
function getOnboardingState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { completed: false, skipped: false, lastSeenStep: 0, tourVersion: '0.0.0' };
    return JSON.parse(raw);
  } catch (e) {
    return { completed: false, skipped: false, lastSeenStep: 0, tourVersion: '0.0.0' };
  }
}

function saveOnboardingState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

/**
 * Compare two semver strings: a > b => 1, a < b => -1, a == b => 0
 */
function compareSemver(a, b) {
  if (!a || !b) return 0;
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] || 0) - (pb[i] || 0);
    if (diff !== 0) return diff > 0 ? 1 : -1;
  }
  return 0;
}

// Global active tour reference
let activeTour = null;

// ============================================================================
// INITIALIZATION & FLOW ORCHESTRATION
// ============================================================================

export function initOnboarding() {
  const state = getOnboardingState();

  // 1. First-time launch: user has never completed or skipped
  if (!state.completed && !state.skipped && (!state.tourVersion || state.tourVersion === '0.0.0')) {
    // Show Welcome Modal on first visit (after short tick to allow initial render)
    setTimeout(() => {
      showWelcomeModal();
    }, 400);
    return;
  }

  // 2. Returning user: check if there is a newer TOUR_VERSION with new steps
  if (state.tourVersion && compareSemver(TOUR_VERSION, state.tourVersion) > 0) {
    const newSteps = tourSteps.filter((s) => compareSemver(s.since, state.tourVersion) > 0);
    if (newSteps.length > 0) {
      setTimeout(() => {
        showWhatsNewModal(newSteps);
      }, 500);
    } else {
      // Version bumped with no new tour steps; update version silently
      state.tourVersion = TOUR_VERSION;
      saveOnboardingState(state);
    }
  }
}

// ============================================================================
// WELCOME & WHAT'S NEW MODALS
// ============================================================================

export function showWelcomeModal() {
  const modal = document.getElementById('modal-tour-welcome');
  if (!modal) return;

  const startBtn = document.getElementById('tour-welcome-start-btn');
  const skipBtn = document.getElementById('tour-welcome-skip-btn');

  modal.classList.add('open');

  if (startBtn) {
    startBtn.onclick = () => {
      modal.classList.remove('open');
      startTour({ isMiniTour: false });
    };
  }

  if (skipBtn) {
    skipBtn.onclick = () => {
      modal.classList.remove('open');
      const state = getOnboardingState();
      state.skipped = true;
      state.tourVersion = TOUR_VERSION;
      saveOnboardingState(state);
    };
  }
}

export function showWhatsNewModal(newSteps) {
  const modal = document.getElementById('modal-tour-whats-new');
  if (!modal) return;

  const countBadge = document.getElementById('whats-new-step-count');
  const startBtn = document.getElementById('tour-whats-new-start-btn');
  const skipBtn = document.getElementById('tour-whats-new-skip-btn');

  if (countBadge) countBadge.textContent = `${newSteps.length} NEW FEATURE${newSteps.length > 1 ? 'S' : ''}`;
  modal.classList.add('open');

  if (startBtn) {
    startBtn.onclick = () => {
      modal.classList.remove('open');
      startTour({ isMiniTour: true, steps: newSteps });
    };
  }

  if (skipBtn) {
    skipBtn.onclick = () => {
      modal.classList.remove('open');
      const state = getOnboardingState();
      state.tourVersion = TOUR_VERSION;
      saveOnboardingState(state);
    };
  }
}

// ============================================================================
// TOUR ENGINE CORE
// ============================================================================

export function startTour({ isMiniTour = false, steps = null, startIndex = 0, forceReplay = false } = {}) {
  // If a tour is already active, close it first
  if (activeTour) {
    activeTour.destroy();
  }

  const effectiveSteps = steps && steps.length > 0 ? steps : tourSteps;
  if (!effectiveSteps || effectiveSteps.length === 0) return;

  let currentIndex = startIndex;
  let overlayEl = null;
  let spotlightEl = null;
  let tooltipEl = null;
  let announcerEl = null;
  let currentTargetEl = null;
  let resizeRaf = null;

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Build UI elements in DOM
  overlayEl = document.createElement('div');
  overlayEl.className = 'retro-tour-overlay';
  overlayEl.setAttribute('aria-hidden', 'true');

  spotlightEl = document.createElement('div');
  spotlightEl.className = 'retro-tour-spotlight pulse';
  spotlightEl.setAttribute('aria-hidden', 'true');

  tooltipEl = document.createElement('div');
  tooltipEl.className = 'retro-tour-tooltip';
  tooltipEl.setAttribute('role', 'dialog');
  tooltipEl.setAttribute('aria-modal', 'true');
  tooltipEl.setAttribute('aria-labelledby', 'retro-tour-active-title');
  tooltipEl.setAttribute('aria-describedby', 'retro-tour-active-desc');

  announcerEl = document.createElement('div');
  announcerEl.className = 'retro-tour-sr-announcer';
  announcerEl.setAttribute('aria-live', 'polite');

  document.body.appendChild(overlayEl);
  document.body.appendChild(spotlightEl);
  document.body.appendChild(tooltipEl);
  document.body.appendChild(announcerEl);

  // Keyboard navigation & Focus trap listener
  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      destroyTour(true);
      return;
    }
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      goToStep(currentIndex + 1);
      return;
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (currentIndex > 0) goToStep(currentIndex - 1);
      return;
    }

    // Focus trap inside tooltip
    if (e.key === 'Tab') {
      const focusable = tooltipEl.querySelectorAll('button:not([disabled])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  window.addEventListener('keydown', handleKeyDown);

  // Debounced reposition on resize / scroll
  const handleViewportChange = () => {
    if (!currentTargetEl) return;
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      updatePositions(currentTargetEl);
    });
  };

  window.addEventListener('resize', handleViewportChange, { passive: true });
  window.addEventListener('scroll', handleViewportChange, { passive: true, capture: true });

  let lockRaf = null;
  function lockOntoTarget(target) {
    if (lockRaf) cancelAnimationFrame(lockRaf);
    let frames = 0;
    const track = () => {
      if (!currentTargetEl || currentTargetEl !== target) return;
      updatePositions(target);
      frames++;
      if (frames < 15) {
        lockRaf = requestAnimationFrame(track);
      }
    };
    lockRaf = requestAnimationFrame(track);
  }

  /**
   * Position spotlight and tooltip around element
   */
  function updatePositions(target) {
    if (!target) return;
    const rect = target.getBoundingClientRect();
    const pad = 6;

    // Position spotlight
    spotlightEl.style.top = `${Math.max(0, rect.top - pad)}px`;
    spotlightEl.style.left = `${Math.max(0, rect.left - pad)}px`;
    spotlightEl.style.width = `${Math.max(0, rect.width + pad * 2)}px`;
    spotlightEl.style.height = `${Math.max(0, rect.height + pad * 2)}px`;

    // Position tooltip
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width || 320;
    const tooltipHeight = tooltipRect.height || 180;
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = 0;
    let left = 0;

    const topBarHeight = 52;
    const navBarHeight = 60;
    const spaceBelow = viewportHeight - navBarHeight - (rect.bottom + pad + 8);
    const spaceAbove = (rect.top - pad - 8) - topBarHeight;

    if (spaceBelow >= tooltipHeight + 8) {
      top = rect.bottom + pad + 8;
    } else if (spaceAbove >= tooltipHeight + 8) {
      top = rect.top - pad - 8 - tooltipHeight;
    } else {
      if (spaceAbove > spaceBelow) {
        top = Math.max(topBarHeight + 8, rect.top - tooltipHeight - 8);
      } else {
        top = Math.min(viewportHeight - navBarHeight - tooltipHeight - 8, rect.bottom + 8);
      }
    }

    // Horizontal placement: align center with target
    left = rect.left + rect.width / 2 - tooltipWidth / 2;

    // Clamp within viewport
    left = Math.max(12, Math.min(left, viewportWidth - tooltipWidth - 12));
    top = Math.max(topBarHeight + 8, Math.min(top, viewportHeight - navBarHeight - tooltipHeight - 8));

    tooltipEl.style.top = `${top}px`;
    tooltipEl.style.left = `${left}px`;
  }

  /**
   * Render and transition to a specific step
   */
  async function goToStep(index) {
    if (index < 0) return;
    if (index >= effectiveSteps.length) {
      destroyTour(false); // Completed successfully
      return;
    }

    currentIndex = index;
    const step = effectiveSteps[index];

    // Auto-switch tabs if step belongs to another screen
    if (step.tab && step.tab !== 'global') {
      const activeTabBtn = document.querySelector('.bottom-nav .nav-tab.active');
      const expectedBtnId = `tab-btn-${step.tab}`;
      if (!activeTabBtn || activeTabBtn.id !== expectedBtnId) {
        const targetBtn = document.getElementById(expectedBtnId);
        if (targetBtn) {
          targetBtn.click();
          // Allow tab view DOM transition to settle
          await new Promise((r) => setTimeout(r, 120));
        }
      }
    }

    // Locate target element
    let target = document.querySelector(step.target);

    // If target is missing or hidden, safely skip to next step
    if (!target || target.offsetParent === null) {
      console.warn(`Tour step target not found or hidden: ${step.target}. Skipping.`);
      if (index + 1 < effectiveSteps.length) {
        goToStep(index + 1);
      } else {
        destroyTour(false);
      }
      return;
    }

    currentTargetEl = target;

    // Scroll target into view synchronously without lag
    target.scrollIntoView({
      behavior: 'auto',
      block: 'center',
      inline: 'center'
    });

    // Populate Tooltip HTML
    const isLast = index === effectiveSteps.length - 1;
    const counterText = `${index + 1} / ${effectiveSteps.length}`;

    tooltipEl.innerHTML = `
      <div class="retro-tour-header">
        <h3 class="retro-tour-title" id="retro-tour-active-title">
          <span>&#x25B6;</span> ${escapeHTML(step.title)}
        </h3>
        <span class="retro-tour-counter">${counterText}</span>
      </div>
      <p class="retro-tour-desc" id="retro-tour-active-desc">
        ${escapeHTML(step.description)}
      </p>
      <div class="retro-tour-actions">
        <button id="retro-tour-skip-btn" class="btn btn-sm btn-skip" aria-label="Skip onboarding tour">SKIP</button>
        <div class="retro-tour-nav-btns">
          <button id="retro-tour-prev-btn" class="btn btn-sm" ${index === 0 ? 'disabled' : ''} aria-label="Previous tour step">BACK</button>
          <button id="retro-tour-next-btn" class="btn btn-sm btn-primary" aria-label="${isLast ? 'Finish tour' : 'Next tour step'}">
            ${isLast ? 'FINISH' : 'NEXT'}
          </button>
        </div>
      </div>
    `;

    // Announce to screen readers
    announcerEl.textContent = `Tour Step ${counterText}: ${step.title}. ${step.description}`;

    // Position immediately and lock onto target over animation frames
    updatePositions(target);
    lockOntoTarget(target);

    setTimeout(() => {
      const nextBtn = document.getElementById('retro-tour-next-btn');
      if (nextBtn) nextBtn.focus();
    }, 20);

    // Bind tooltip actions
    const prevBtn = document.getElementById('retro-tour-prev-btn');
    const nextBtn = document.getElementById('retro-tour-next-btn');
    const skipBtn = document.getElementById('retro-tour-skip-btn');

    if (prevBtn) {
      prevBtn.onclick = () => goToStep(currentIndex - 1);
    }
    if (nextBtn) {
      nextBtn.onclick = () => goToStep(currentIndex + 1);
    }
    if (skipBtn) {
      skipBtn.onclick = () => destroyTour(true);
    }

    // Persist progress
    const state = getOnboardingState();
    state.lastSeenStep = currentIndex;
    saveOnboardingState(state);
  }

  /**
   * Cleanup and save completion status
   */
  function destroyTour(wasSkipped = false) {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('resize', handleViewportChange);
    window.removeEventListener('scroll', handleViewportChange);
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    if (lockRaf) cancelAnimationFrame(lockRaf);

    if (overlayEl) overlayEl.remove();
    if (spotlightEl) spotlightEl.remove();
    if (tooltipEl) tooltipEl.remove();
    if (announcerEl) announcerEl.remove();

    activeTour = null;

    const state = getOnboardingState();
    if (wasSkipped) {
      state.skipped = true;
    } else {
      state.completed = true;
      state.skipped = false;
    }
    state.tourVersion = TOUR_VERSION;
    saveOnboardingState(state);
  }

  // Register public reference
  activeTour = {
    destroy: () => destroyTour(true),
    goToStep
  };

  // Launch first step
  goToStep(currentIndex);
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
