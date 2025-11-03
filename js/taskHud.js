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
// Keep these imports for backwards compatibility during refactoring
import { 
  getProgress, getScenarioData, getCurrentScenario, 
  getScenarioTasks, initTaskSystem, switchScenario, switchScenarioWithIntro
} from './taskManager.js';

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
  TERMINAL_ID: 'terminal'
};

const TOAST_DURATION = 2800;

// ============================================================================
// STATE
// ============================================================================

const hudState = {
  root: null,
  list: null,
  progress: null,
  progressText: null,
  title: null,
  toastHost: null
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
    </div>

    <div class="scenario-selector">
      <label for="${UI_CONFIG.DROPDOWN_ID}">Scenario:</label>
      <select id="${UI_CONFIG.DROPDOWN_ID}"></select>
    </div>

    <div id="${UI_CONFIG.LIST_ID}" class="task-list"></div>
    
    <div class="task-progress">
      <div class="progress-bar">
        <div id="${UI_CONFIG.PROGRESS_ID}" class="progress-fill"></div>
      </div>
      <div id="${UI_CONFIG.PROGRESS_TEXT_ID}" class="progress-text">0/0</div>
    </div>
  `;

  // Inject styles
  injectStyles();

  document.body.appendChild(root);

  hudState.root = root;
  hudState.list = root.querySelector(`#${UI_CONFIG.LIST_ID}`);
  hudState.progress = root.querySelector(`#${UI_CONFIG.PROGRESS_ID}`);
  hudState.progressText = root.querySelector(`#${UI_CONFIG.PROGRESS_TEXT_ID}`);
  hudState.title = root.querySelector(`#${UI_CONFIG.TITLE_ID}`);

  // Setup toast container
  let toastContainer = document.getElementById(UI_CONFIG.TOAST_CONTAINER_ID);
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.id = UI_CONFIG.TOAST_CONTAINER_ID;
    document.body.appendChild(toastContainer);
  }
  hudState.toastHost = toastContainer;

  // Populate dropdown
  populateScenarioDropdown();

  console.log('TaskHud created');
}

/**
 * Injects HUD CSS styles into the document
 */
function injectStyles() {
  const style = document.createElement('style');
  style.textContent = `
    .task-hud {
      position: fixed !important;
      top: 20px !important;
      right: 20px !important;
      background: rgba(15, 15, 25, 0.95) !important;
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.15);
      border-radius: 12px;
      padding: 16px;
      min-width: 340px;
      max-width: 420px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 999999 !important;
      pointer-events: auto !important;
      animation: slideInRight 0.3s ease;
    }

    @keyframes slideInRight {
      from { opacity: 0; transform: translateX(30px); }
      to { opacity: 1; transform: translateX(0); }
    }

    .task-hud-header {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 1.1rem;
      font-weight: 700;
      color: #22c55e;
      margin-bottom: 14px;
      padding-bottom: 10px;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .scenario-selector {
      margin: 10px 0 14px 0;
      padding: 10px;
      background: rgba(0, 0, 0, 0.3);
      border-radius: 6px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .scenario-selector label {
      color: #22c55e;
      font-weight: bold;
      font-size: 0.85rem;
      min-width: 70px;
    }

    .scenario-selector select {
      flex: 1;
      padding: 6px 10px;
      background: rgba(0, 0, 0, 0.7);
      border: 1px solid #22c55e;
      border-radius: 4px;
      color: #22c55e;
      font-family: inherit;
      font-size: 0.9rem;
      cursor: pointer;
      transition: all 0.2s;
    }

    .scenario-selector select:hover {
      background: rgba(34, 197, 94, 0.1);
      border-color: #4ade80;
    }

    .scenario-selector select:focus {
      outline: none;
      border-color: #4ade80;
      box-shadow: 0 0 0 2px rgba(34, 197, 94, 0.2);
    }

    .task-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-bottom: 14px;
      max-height: 400px;
      overflow-y: auto;
    }

    .task-item {
      background: rgba(255, 255, 255, 0.05);
      border-left: 3px solid rgba(255, 255, 255, 0.2);
      padding: 10px 12px;
      border-radius: 6px;
      transition: all 0.2s;
    }

    .task-item.active {
      background: rgba(34, 197, 94, 0.1);
      border-left-color: #22c55e;
      box-shadow: 0 2px 8px rgba(34, 197, 94, 0.2);
    }

    .task-item.completed {
      background: rgba(255, 255, 255, 0.03);
      border-left-color: rgba(34, 197, 94, 0.5);
      opacity: 0.6;
    }

    .task-item-header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 4px;
    }

    .task-item-icon {
      font-size: 0.9rem;
      width: 18px;
    }

    .task-item-icon.completed { color: #22c55e; }
    .task-item-icon.active { color: #22c55e; }
    .task-item-icon.pending { color: rgba(255, 255, 255, 0.4); }

    .task-item-title {
      font-weight: 600;
      font-size: 0.95rem;
      flex: 1;
    }

    .task-item-details {
      font-size: 0.85rem;
      color: rgba(255, 255, 255, 0.7);
      margin-left: 26px;
      line-height: 1.4;
    }

    .task-progress {
      margin-top: 12px;
      padding-top: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .progress-bar {
      width: 100%;
      height: 6px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 3px;
      overflow: hidden;
      margin-bottom: 8px;
    }

    .progress-fill {
      height: 100%;
      background: linear-gradient(90deg, #4ade80, #22c55e);
      border-radius: 3px;
      transition: width 0.4s ease;
      width: 0%;
    }

    .progress-text {
      text-align: center;
      font-size: 0.9rem;
      color: rgba(255, 255, 255, 0.8);
      font-weight: 600;
    }

    #${UI_CONFIG.TOAST_CONTAINER_ID} {
      position: fixed;
      top: 20px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 10000;
      pointer-events: none;
    }

    .toast {
      background: linear-gradient(135deg, #10b981, #059669);
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      font-size: 0.95rem;
      margin-bottom: 10px;
      animation: toastSlide 0.3s ease;
    }

    @keyframes toastSlide {
      from { opacity: 0; transform: translateY(-20px); }
      to { opacity: 1; transform: translateY(0); }
    }
  `;

  document.head.appendChild(style);
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
function buildTaskItem(task, index, currentIndex) {
  const isActive = index === currentIndex;
  const isCompleted = index < currentIndex;

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

  const item = document.createElement('div');
  item.className = `task-item ${statusClass}`;
  item.innerHTML = `
    <div class="task-item-header">
      <span class="task-item-icon ${statusClass}">${icon}</span>
      <span class="task-item-title">${task.title || 'Task'}</span>
    </div>
    ${task.details ? `<div class="task-item-details">${task.details}</div>` : ''}
  `;

  return item;
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
 */
function showToast(title, message) {
  if (!hudState.toastHost) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<strong>${title}</strong>${message ? `<div>${message}</div>` : ''}`;
  
  hudState.toastHost.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 300);
  }, TOAST_DURATION);
}

// ============================================================================
// PUBLIC API
// ============================================================================

export const TaskHud = {
  mount() {
    console.log('TaskHud.mount()');
    ensureRoot();
    updateDisplay();
    this._setupEventListeners();
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
      showToast('Task Completed', data.taskTitle);
      updateDisplay();
    });

    // Listen for scenario completion
    eventBus.on(Events.SCENARIO_COMPLETED, (data) => {
      console.log('[TaskHud] Scenario completed:', data);
      showToast('Scenario Complete!', data.scenarioTitle);
      updateDisplay();
    });

    // Listen for scenario changes
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
    console.log('TaskHud.show()');
    ensureRoot();
    if (hudState.root) {
      hudState.root.style.display = 'block';
      hudState.root.style.opacity = '1';
      hudState.root.style.visibility = 'visible';

      if (!document.body.contains(hudState.root)) {
        document.body.appendChild(hudState.root);
      }
    }
  },

  hide() {
    if (hudState.root) {
      hudState.root.style.display = 'none';
    }
  },

  toast(title, message) {
    showToast(title, message);
  },

  notifyComplete(taskTitle) {
    showToast('Task Completed', taskTitle);
    this.update();
  }
};

console.log('TaskHud module loaded');
