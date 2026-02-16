/**
 * taskHud.js - Task HUD UI Component
 * 
 * Manages the task display panel showing progress, active tasks,
 * and scenario selection dropdown.
 * 
 * LAYER: UI Layer
 * This module listens to events from the Logic layer (taskManager).
 */

import { eventBus, Events } from './eventBus.js';
import { isMobile } from './scene.js';
// Keep these imports for backwards compatibility during refactoring
import {
  getProgress, getScenarioData, getCurrentScenario,
  getScenarioTasks, initTaskSystem, switchScenario, switchScenarioWithIntro,
  isTaskCompleted, showScenarioIntro, advanceTask, notifyComplete
} from './taskManager.js';
import { PointsBadge } from './pointsBadge.js';
import { tasksAPI } from './api.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const UI_CONFIG = {
  ROOT_ID: 'taskHudRoot',
  DROPDOWN_ID: 'scenarioDropdown',
  LIST_ID: 'taskHudList',
  PROGRESS_ID: 'taskProgressFill',
  PROGRESS_TEXT_ID: 'taskProgressText',
  TITLE_ID: 'taskHudTitle',
  TOAST_CONTAINER_ID: 'toastContainer',
  TERMINAL_ID: 'terminal',
  COLLAPSE_BTN_ID: 'taskHudCollapseBtn'
};

const TOAST_DURATION = 7000;

// ============================================================================
// STATE
// ============================================================================

const hudState = {
  root: null,
  list: null,
  progress: null,
  progressText: null,
  title: null,
  toastHost: null,
  isCollapsed: false,
  listenersSetup: false,
  hintShown: new Set(), // Track which tasks have shown hints
  unlockedHints: new Set(), // Track which tasks have unlocked hints (persistent)
  toastShown: new Set() // Track which tasks have shown completion toasts
};




// ============================================================================
// SETUP & INITIALIZATION
// ============================================================================

/**
 * Ensures the HUD root element exists
 */
function ensureRoot() {
  if (hudState.root) {
    console.log('TaskHud root already exists');
    return;
  }

  console.log('Creating TaskHud root...');

  const root = document.createElement('div');
  root.id = UI_CONFIG.ROOT_ID;
  root.className = 'task-hud';

  root.innerHTML = `
    <div class="task-hud-header">
      <i class="fas fa-tasks"></i>
      <span id="${UI_CONFIG.TITLE_ID}">Loading...</span>
      <div class="task-hud-header-actions">
        <button id="taskHudInfoBtn" class="task-hud-info-btn" title="Show scenario information">
          <i class="fas fa-info-circle"></i>
        </button>
        <button id="${UI_CONFIG.COLLAPSE_BTN_ID}" class="task-hud-collapse-btn" title="Toggle task list">
          <i class="fas fa-chevron-down"></i>
        </button>
      </div>
    </div>

    <div class="task-hud-collapsible">
      <div class="scenario-selector">
        <label for="${UI_CONFIG.DROPDOWN_ID}">Scenario:</label>
        <select id="${UI_CONFIG.DROPDOWN_ID}"></select>
      </div>

      <div id="${UI_CONFIG.LIST_ID}" class="task-list">
      </div>
      <div class="task-progress">
        <div class="progress-bar">
          <div id="${UI_CONFIG.PROGRESS_ID}" class="progress-fill"></div>
          <div id="${UI_CONFIG.PROGRESS_TEXT_ID}" class="progress-text">0/0</div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(root);

  hudState.root = root;
  hudState.list = root.querySelector(`#${UI_CONFIG.LIST_ID}`);
  hudState.progress = root.querySelector(`#${UI_CONFIG.PROGRESS_ID}`);
  hudState.progressText = root.querySelector(`#${UI_CONFIG.PROGRESS_TEXT_ID}`);
  hudState.title = root.querySelector(`#${UI_CONFIG.TITLE_ID}`);

  // Setup collapse button
  const collapseBtn = root.querySelector(`#${UI_CONFIG.COLLAPSE_BTN_ID}`);
  if (collapseBtn) {
    collapseBtn.addEventListener('click', toggleTaskHudCollapse);
  }

  // Setup info button
  const infoBtn = root.querySelector('#taskHudInfoBtn');
  if (infoBtn) {
    infoBtn.addEventListener('click', async () => {
      const currentScenario = getCurrentScenario();
      if (currentScenario && currentScenario.id) {
        await showScenarioIntro(currentScenario.id);
      }
    });
  }

  // Setup toast container
  let toastContainer = document.getElementById(UI_CONFIG.TOAST_CONTAINER_ID);
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = UI_CONFIG.TOAST_CONTAINER_ID;
    document.body.appendChild(toastContainer);
  }
  // Ensure toast container is visible
  toastContainer.style.display = 'flex';
  hudState.toastHost = toastContainer;

  // Populate dropdown
  populateScenarioDropdown();

  console.log('TaskHud created');
}


/**
 * Populates the scenario dropdown
 */
function populateScenarioDropdown() {
  const dropdown = document.getElementById(UI_CONFIG.DROPDOWN_ID);
  const scenarioData = getScenarioData();
  const currentScenario = getCurrentScenario();

  if (!dropdown || !scenarioData) {
    console.warn('Dropdown or scenario data not ready');
    return;
  }

  dropdown.innerHTML = '';
  const scenarios = Object.keys(scenarioData).filter(key => !key.startsWith('_'));

  scenarios.forEach(scenarioId => {
    const scenario = scenarioData[scenarioId];
    const option = document.createElement('option');
    option.value = scenarioId;
    option.textContent = scenario.title || scenarioId;

    if (currentScenario?.id === scenarioId) {
      option.selected = true;
    }

    dropdown.appendChild(option);
  });

  dropdown.addEventListener('change', async (e) => {
    const newScenarioId = e.target.value;
    console.log(`Switching to scenario: ${newScenarioId}`);

    const success = await switchScenarioWithIntro(newScenarioId);
    if (success) {
      TaskHud.update();
    }
  });
}

/**
 * Builds a single task item element
 */
// Store fetched hints to avoid re-fetching
const fetchedHints = new Map();

function buildTaskItem(task, index, currentIndex) {
  const taskId = task.id || `task_${index}`;
  // Check if task is completed by index OR by server-side completion status
  const isCompletedByIndex = index < currentIndex;
  const isCompletedByServer = task.id ? isTaskCompleted(task.id) : false;
  const isCompleted = isCompletedByIndex || isCompletedByServer;
  const isActive = index === currentIndex && !isCompleted;
  const hintShown = hudState.hintShown.has(taskId);
  const hintText = fetchedHints.get(taskId); // Get hint if already fetched

  let icon, statusClass;
  if (isCompleted) {
    icon = '<i class="fas fa-check-circle"></i>';
    statusClass = 'completed';
  } else if (isActive) {
    icon = '<i class="fas fa-circle-dot"></i>';
    statusClass = 'active';
  } else {
    icon = '<i class="far fa-circle"></i>';
    statusClass = 'pending';
  }

  // Build hint button and hint display for active tasks OR unlocked tasks
  // Show hint button if task has hintCost (indicates hint is available)
  let hintSection = '';
  const isUnlocked = hudState.unlockedHints.has(taskId);

  if ((isActive || isUnlocked) && task.hasHint && task.hintCost !== undefined && task.hintCost !== null) {
    const hintCost = task.hintCost || 0;
    const buttonText = isUnlocked ? 'Show Hint (Unlocked)' : `Hint (${hintCost} pts)`;
    const buttonTitle = isUnlocked ? 'Show hint (already unlocked)' : `Get hint (costs ${hintCost} points)`;
    const buttonClass = isUnlocked ? 'task-hint-btn unlocked' : 'task-hint-btn';

    hintSection = `
      <div class="task-hint-section">
        ${!hintShown ? `
          <button class="${buttonClass}" data-task-id="${taskId}" data-hint-cost="${isUnlocked ? 0 : hintCost}" title="${buttonTitle}">
            <i class="fas fa-lightbulb"></i>
            <span>${buttonText}</span>
          </button>
        ` : ''}
        ${hintShown && hintText ? `
          <div class="task-hint-display">
            <i class="fas fa-info-circle"></i>
            <span>${escapeHtml(hintText)}</span>
          </div>
        ` : ''}
      </div>
    `;
  }

  // Build flag input for CTF-style tasks (checkType === 'flag')
  let flagInputSection = '';
  if (isActive && task.checkType === 'flag') {
    flagInputSection = `
      <div class="task-flag-section">
        <div class="task-flag-input">
          <input type="text" class="flag-input" placeholder="Enter flag/answer..." data-task-id="${taskId}">
          <button class="flag-submit-btn" data-task-id="${taskId}" title="Submit flag">
            <i class="fas fa-paper-plane"></i>
          </button>
        </div>
      </div>
    `;
  }

  const item = document.createElement('div');
  item.className = `task-item ${statusClass}`;
  item.innerHTML = `
    <div class="task-item-header">
      <span class="task-item-icon ${statusClass}">${icon}</span>
      <span class="task-item-title">${task.title || 'Task'}</span>
    </div>
    ${task.details ? `<div class="task-item-details">${task.details}</div>` : ''}
    ${flagInputSection}
    ${hintSection}
  `;

  // Add event listener for hint button
  // Show hint button if task has hintCost (indicates hint is available)
  if ((isActive || isUnlocked) && task.hintCost !== undefined && task.hintCost !== null) {
    const hintBtn = item.querySelector('.task-hint-btn');
    if (hintBtn) {
      hintBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await handleHintClick(task, taskId);
      });
    }
  }

  // Add event listeners for flag input (CTF-style tasks)
  if (isActive && task.checkType === 'flag') {
    const flagInput = item.querySelector('.flag-input');
    const flagSubmitBtn = item.querySelector('.flag-submit-btn');

    if (flagInput && flagSubmitBtn) {
      // Submit on button click
      flagSubmitBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const answer = flagInput.value.trim();
        if (answer) {
          await handleFlagSubmit(task, taskId, answer, flagInput);
        }
      });

      // Submit on Enter key
      flagInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          const answer = flagInput.value.trim();
          if (answer) {
            await handleFlagSubmit(task, taskId, answer, flagInput);
          }
        }
      });

      // Prevent click from bubbling to task item
      flagInput.addEventListener('click', (e) => e.stopPropagation());
    }
  }

  return item;
}

/**
 * Escapes HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Handles hint button click
 */
async function handleHintClick(task, taskId) {
  if (hudState.hintShown.has(taskId)) {
    return; // Hint already shown
  }

  const isUnlocked = hudState.unlockedHints.has(taskId);
  const hintCost = isUnlocked ? 0 : (task.hintCost || 0);
  const currentPoints = PointsBadge.getPoints();

  if (!isUnlocked && currentPoints < hintCost) {
    showToast('Insufficient Points', `You need ${hintCost} points to view this hint. You currently have ${currentPoints} points.`);
    return;
  }

  // Fetch hint from server
  try {
    const result = await tasksAPI.getHint(taskId);

    if (result && result.hint) {
      // Store the fetched hint
      fetchedHints.set(taskId, result.hint);

      // Deduct points only if not already unlocked
      if (!isUnlocked && !result.alreadyUnlocked) {
        const success = PointsBadge.subtractPoints(hintCost);
        if (!success) {
          showToast('Error', 'Failed to deduct points. Please try again.');
          return;
        }
        showToast('Hint Revealed', `-${hintCost} points. Check the task for the hint.`);
      } else {
        showToast('Hint Revealed', 'Hint is unlocked.');
      }

      // Mark hint as shown and unlocked
      hudState.hintShown.add(taskId);
      hudState.unlockedHints.add(taskId);

      // Update the display to show the hint
      updateDisplay();
    } else {
      showToast('Error', 'Failed to fetch hint from server.');
    }

  } catch (error) {
    console.error('[TaskHud] Error fetching hint:', error);
    if (error.message && error.message.includes('Insufficient points')) {
      showToast('Insufficient Points', `You need ${hintCost} points to view this hint.`);
    } else {
      showToast('Error', 'Failed to fetch hint. Please try again.');
    }
  }
}

/**
 * Handles flag/CTF-style task submission
 * @param {Object} task - The task object
 * @param {string} taskId - The task ID
 * @param {string} answer - The submitted flag/answer
 * @param {HTMLInputElement} inputElement - The input element (to clear on success)
 */
async function handleFlagSubmit(task, taskId, answer, inputElement) {
  try {
    console.log('[TaskHud] Submitting flag for task:', taskId, 'answer:', answer);
    
    // Disable input during submission
    inputElement.disabled = true;
    const submitBtn = inputElement.parentElement.querySelector('.flag-submit-btn');
    if (submitBtn) submitBtn.disabled = true;

    const result = await tasksAPI.submitTask(taskId, answer);
    console.log('[TaskHud] Flag submission result:', result);

    if (result.correct) {
      // Success - update points and advance task
      showToast('Correct!', `+${result.scoreAwarded} points`);

      // Sync points with server's authoritative total score
      if (result.newTotalScore !== undefined) {
        console.log('[TaskHud] Updating points to', result.newTotalScore, '(from server)');
        PointsBadge.setPoints(result.newTotalScore);
      }

      // Handle badges if unlocked
      if (result.badgesUnlocked && result.badgesUnlocked.length > 0) {
        result.badgesUnlocked.forEach(badge => {
          PointsBadge.addBadge(badge);
        });

        // Show badge toasts
        const skillBadges = ['Hint-Free Expert', 'Speed Runner'];
        const unlockedSkillBadges = result.badgesUnlocked.filter(badge => 
          skillBadges.includes(badge)
        );
        unlockedSkillBadges.forEach(skillBadge => {
          showToast('Badge Unlocked', skillBadge, 'badge', skillBadge, 30);
        });
      }

      // Advance to next task
      advanceTask();
      
      // Notify UI of completion
      notifyComplete(task.title, taskId);

      // Update display
      updateDisplay();
    } else {
      // Incorrect answer
      showToast('Incorrect', 'Try again!');
      
      // Re-enable input
      inputElement.disabled = false;
      if (submitBtn) submitBtn.disabled = false;
      
      // Clear and focus input for retry
      inputElement.value = '';
      inputElement.focus();
    }
  } catch (error) {
    console.error('[TaskHud] Error submitting flag:', error);
    showToast('Error', 'Failed to submit flag. Please try again.');
    
    // Re-enable input on error
    inputElement.disabled = false;
    const submitBtn = inputElement.parentElement.querySelector('.flag-submit-btn');
    if (submitBtn) submitBtn.disabled = false;
  }
}

/**
 * Updates HUD display
 */
function updateDisplay() {
  const scenarioTasks = getScenarioTasks();
  if (!hudState.root) ensureRoot();

  const progress = getProgress?.() || null;
  if (!progress?.scenarioTitle) {
    return;
  }

  const allTasks = scenarioTasks || [];

  // Update title
  if (hudState.title) {
    hudState.title.textContent = progress.scenarioTitle;
  }

  // Update task list
  hudState.list.innerHTML = '';
  allTasks.forEach((task, index) => {
    const item = buildTaskItem(task, index, progress.current);
    hudState.list.appendChild(item);
  });

  // Update progress bar
  const percentage = progress.percentage || 0;
  if (hudState.progress) {
    hudState.progress.style.width = percentage + '%';
  }
  if (hudState.progressText) {
    hudState.progressText.textContent = `${progress.current}/${progress.total} completed`;
  }
}

/**
 * Shows a toast notification
 * @param {string} title - Toast title
 * @param {string} message - Toast message
 * @param {string} type - Toast type: 'task', 'scenario', or 'badge'
 * @param {string} badge - Badge name (optional, for scenario completion or badge toasts)
 * @param {number} pointsAwarded - Points awarded (optional, for badges)
 */
function showToast(title, message, type = 'task', badge = null, pointsAwarded = 0) {
  if (!hudState.toastHost) return;

  const toast = document.createElement('div');
  const isScenarioComplete = type === 'scenario';
  const isBadgeToast = type === 'badge';
  const isLongDurationToast = isScenarioComplete || isBadgeToast;

  toast.className = `toast${isLongDurationToast ? ' scenario-complete' : ''}`;

  // Build toast content
  let toastContent;
  if (isScenarioComplete) {
    // Modern, clean design for scenario completion
    toastContent = `
      <div class="toast-header">
        <div class="toast-icon"><i class="fas fa-flag-checkered"></i></div>
        <div class="toast-title-group">
          <div class="toast-main-title">Scenario Complete</div>
          <div class="toast-subtitle">${escapeHtml(message || '')}</div>
        </div>
        <button class="toast-close-btn" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      ${badge ? `
        <div class="toast-badge">
          <span class="badge-icon"><i class="fas fa-trophy"></i></span>
          <span class="badge-text">${escapeHtml(badge)}</span>
          ${pointsAwarded > 0 ? `<span class="badge-points">+${pointsAwarded} points</span>` : ''}
        </div>
      ` : ''}
    `;
  } else if (isBadgeToast) {
    // Badge toast design (for skill badges like Hint-Free Expert, Speed Runner)
    toastContent = `
      <div class="toast-header">
        <div class="toast-icon"><i class="fas fa-medal"></i></div>
        <div class="toast-title-group">
          <div class="toast-main-title">Badge Unlocked</div>
          <div class="toast-subtitle">${escapeHtml(badge || title || '')}</div>
        </div>
        <button class="toast-close-btn" aria-label="Close">
          <i class="fas fa-times"></i>
        </button>
      </div>
      ${pointsAwarded > 0 ? `
        <div class="toast-badge">
          <span class="badge-icon"><i class="fas fa-star"></i></span>
          <span class="badge-text">Points Awarded</span>
          <span class="badge-points">+${pointsAwarded} points</span>
        </div>
      ` : ''}
    `;
  } else {
    // Simple design for task completion
    toastContent = `<strong>${title}</strong>`;
    if (message) {
      toastContent += `<div>${message}</div>`;
    }
  }

  toast.innerHTML = toastContent;

  hudState.toastHost.appendChild(toast);

  const duration = isLongDurationToast ? 30000 : TOAST_DURATION;

  // Add close button event listener for long-duration toasts
  if (isLongDurationToast) {
    const closeBtn = toast.querySelector('.toast-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        if (toast._timeoutId) {
          clearTimeout(toast._timeoutId);
          toast._timeoutId = null;
        }
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      });
    }
  }

  // Store timeout ID on toast element so close button can access it
  toast._timeoutId = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

/**
 * Toggles the task HUD collapse state
 */
function toggleTaskHudCollapse() {
  if (!hudState.root) return;

  hudState.isCollapsed = !hudState.isCollapsed;

  if (hudState.isCollapsed) {
    hudState.root.classList.add('collapsed');
  } else {
    hudState.root.classList.remove('collapsed');
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const TaskHud = {
  mount() {
    console.log('TaskHud.mount()');
    ensureRoot();
    updateDisplay();

    // Only setup event listeners once
    if (!hudState.listenersSetup) {
      this._setupEventListeners();
      hudState.listenersSetup = true;
    }

    adjustHUDForMobile();

    // Fetch unlocked hints
    this._fetchUnlockedHints();
  },

  async _fetchUnlockedHints() {
    try {
      const result = await tasksAPI.getUnlockedHints();
      if (result && result.unlocked) {
        // First mark all as unlocked
        result.unlocked.forEach(taskId => hudState.unlockedHints.add(taskId));

        // Then fetch the text for each one
        // We do this in parallel but update display as they come in or once at the end
        const fetchPromises = result.unlocked.map(async (taskId) => {
          try {
            const hintResult = await tasksAPI.getHint(taskId);
            if (hintResult && hintResult.hint) {
              fetchedHints.set(taskId, hintResult.hint);
              hudState.hintShown.add(taskId);
            }
          } catch (err) {
            console.error(`Failed to fetch hint text for ${taskId}`, err);
          }
        });

        await Promise.all(fetchPromises);
        updateDisplay();
      }
    } catch (error) {
      console.error('Failed to fetch unlocked hints:', error);
    }
  },

  _setupEventListeners() {
    // Listen for progress updates
    eventBus.on(Events.PROGRESS_UPDATED, (data) => {
      console.log('[TaskHud] Progress updated:', data);
      updateDisplay();
    });

    // Listen for task completion
    eventBus.on(Events.TASK_COMPLETED, (data) => {
      console.log('[TaskHud] Task completed:', data);

      // Create a unique key for this task completion
      const isNotification = data.isNotification === true;

      let taskKey;

      // Prefer taskId if available (most reliable)
      if (data.taskId) {
        taskKey = isNotification ? `notification_${data.taskId}` : `task_${data.taskId}`;
      } else {
        // Fallback: try to get task ID from scenario tasks using taskIndex
        const scenarioTasks = getScenarioTasks();
        const taskIndex = data.taskIndex !== undefined ? data.taskIndex : -1;
        let taskId = null;

        if (taskIndex >= 0 && taskIndex < scenarioTasks.length) {
          taskId = scenarioTasks[taskIndex]?.id;
        }

        if (taskId) {
          taskKey = isNotification ? `notification_${taskId}` : `task_${taskId}`;
        } else {
          // Last resort: use taskTitle + taskIndex (less reliable but better than nothing)
          taskKey = isNotification
            ? `notification_${data.taskTitle}_${taskIndex}_${Date.now()}` // Unique timestamp for notifications
            : `task_${data.taskTitle}_${taskIndex}`;
        }
      }

      // Only show toast if we haven't shown one for this task yet
      if (!hudState.toastShown.has(taskKey)) {
        showToast('Task Completed', data.taskTitle);
        hudState.toastShown.add(taskKey);
      }

      updateDisplay();
    });

    // Listen for scenario completion
    eventBus.on(Events.SCENARIO_COMPLETED, (data) => {
      console.log('[TaskHud] Scenario completed:', data);

      // Create a unique key for this scenario completion
      const scenarioKey = data.scenarioId
        ? `scenario_${data.scenarioId}`
        : `scenario_${data.scenarioTitle}`;

      // Only show toast if we haven't shown one for this scenario yet
      if (!hudState.toastShown.has(scenarioKey)) {
        showToast('Scenario Complete', data.scenarioTitle, 'scenario', data.badge, data.pointsAwarded || 0);
        hudState.toastShown.add(scenarioKey);
      }

      updateDisplay();
    });

    eventBus.on(Events.SCENARIO_CHANGED, (data) => {
      console.log('[TaskHud] Scenario changed:', data);
      updateDisplay();
    });
  },

  update() {
    console.log('TaskHud.update()');
    updateDisplay();
  },

  show() {
    ensureRoot();
    if (hudState.root) {
      hudState.root.style.setProperty('display', 'block', 'important');
      hudState.root.style.setProperty('opacity', '1', 'important');
      hudState.root.style.setProperty('visibility', 'visible', 'important');

      if (!document.body.contains(hudState.root)) {
        document.body.appendChild(hudState.root);
      }
    }
  },

  hide() {
    if (hudState.root) {
      hudState.root.style.setProperty('display', 'none', 'important');
      hudState.root.style.setProperty('visibility', 'hidden', 'important');
    }
  },

  reset() {
    // Clear hint state on logout/reset
    hudState.hintShown.clear();
    fetchedHints.clear();
    // Clear toast tracking on logout/reset
    hudState.toastShown.clear();
    // Reset listeners setup flag so they can be set up again
    hudState.listenersSetup = false;

  },

  toast(title, message, type = 'task', badge = null, pointsAwarded = 0) {
    showToast(title, message, type, badge, pointsAwarded);
  },

  notifyComplete(taskTitle) {
    //showToast('Task Completed', taskTitle);
    this.update();
  }
};

window.addEventListener('orientationchange', () => {
  setTimeout(() => {
    // Only resize if engine is available
    if (typeof engine !== 'undefined') {
      engine.resize();
    }
    adjustHUDForMobile();
  }, 100);
});

function adjustHUDForMobile() {
  if (!isMobile()) return;

  const hud = document.getElementById(UI_CONFIG.ROOT_ID);

  if (!hud) return;

  const isLandscape = window.innerWidth > window.innerHeight;
  const screenWidth = window.innerWidth;

  if (isLandscape) {
    // Landscape: VERY compact, top-left corner
    hud.style.setProperty('top', '70px', 'important');
    hud.style.setProperty('left', '5px', 'important');
    hud.style.setProperty('right', 'auto', 'important');
    hud.style.setProperty('max-width', '180px', 'important');
    hud.style.setProperty('min-width', 'auto', 'important');
    hud.style.setProperty('width', 'auto', 'important');
    hud.style.setProperty('transform', 'none', 'important');
    hud.style.fontSize = '0.6rem';
    hud.style.padding = '4px';
    hud.style.boxSizing = 'border-box';
  } else {
    // Portrait: use available width with margins
    hud.style.setProperty('top', '5px', 'important');
    hud.style.setProperty('left', '15px', 'important');
    hud.style.setProperty('right', '15px', 'important');
    hud.style.setProperty('max-width', 'none', 'important');
    hud.style.setProperty('width', 'auto', 'important');
    hud.style.setProperty('transform', 'none', 'important');
    hud.style.fontSize = '0.65rem';
    hud.style.padding = '5px';
    hud.style.boxSizing = 'border-box';
  }

  console.log(`Adjusted HUD and Timer for mobile: ${isLandscape ? 'landscape' : 'portrait'} (${screenWidth}px)`);
}
console.log('TaskHud module loaded');
