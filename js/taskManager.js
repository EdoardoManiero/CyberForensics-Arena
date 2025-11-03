/**
 * taskManager.js - Task and Scenario Management System
 * 
 * Handles loading scenarios, managing task progression, and scenario switching.
 * Provides a clean API for task-related operations.
 * 
 * LAYER: Logic Layer
 * This module emits events that the UI and Rendering layers listen to.
 */
import { eventBus, Events } from './eventBus.js';
import { ScenarioIntroManager } from './ScenarioIntroManager.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const SCENARIOS_PATH = '../scenarios.json';
const LOG_PREFIX = '[TaskManager]';

// ============================================================================
// STATE
// ============================================================================

const state = {
  scenarioData: null,
  currentScenario: null,
  scenarioTasks: [],
  taskIndex: 0,
  isScenarioActive: false,
  scenariosPromise: null,
  introManager: new ScenarioIntroManager()
};

// ============================================================================
// PUBLIC API - SCENARIOS
// ============================================================================

/**
 * Loads scenarios from JSON file (cached)
 * @returns {Promise<Object|null>} Scenario data or null on error
 */
export function loadScenarios() {
  if (!state.scenariosPromise) {
    console.log(`${LOG_PREFIX} Fetching scenarios from ${SCENARIOS_PATH}...`);
    
    state.scenariosPromise = fetch(SCENARIOS_PATH)
      .then(response => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        state.scenarioData = data;
        console.log(`${LOG_PREFIX} Successfully loaded ${Object.keys(data).length} scenarios`);
        return state.scenarioData;
      })
      .catch(error => {
        console.error(`${LOG_PREFIX} Failed to load scenarios:`, error);
        state.scenariosPromise = null;
        return null;
      });
  }

  return state.scenariosPromise;
}

/**
 * Gets all available scenarios
 * @returns {Array} Array of scenario metadata
 */
export function getAvailableScenarios() {
  if (!state.scenarioData) return [];

  return Object.keys(state.scenarioData)
    .filter(key => !key.startsWith('_'))
    .map(key => ({
      id: key,
      title: state.scenarioData[key].title || key,
      description: state.scenarioData[key].description || '',
      taskCount: state.scenarioData[key].tasks?.length || 0
    }));
}

/**
 * Gets the full scenario data object
 * @returns {Object|null} Scenario data or null
 */
export function getScenarioData() {
  return state.scenarioData;
}

/**
 * Gets the current active scenario
 * @returns {Object|null} Current scenario or null
 */
export function getCurrentScenario() {
  return state.currentScenario;
}

/**
 * Gets all tasks in the current scenario
 * @returns {Array} Tasks array
 */
export function getScenarioTasks() {
  return state.scenarioTasks;
}

// ============================================================================
// PUBLIC API - TASK SYSTEM
// ============================================================================

/**
 * Initializes the task system with a specific scenario
 * @param {string} scenarioId - ID of the scenario to initialize
 * @returns {boolean} True if successful, false otherwise
 */
export function initTaskSystem(scenarioId) {
  if (!state.scenarioData) {
    console.error(`${LOG_PREFIX} Scenarios not loaded yet`);
    return false;
  }

  if (!state.scenarioData[scenarioId]) {
    console.error(`${LOG_PREFIX} Scenario not found: ${scenarioId}`);
    return false;
  }

  try {
    state.currentScenario = state.scenarioData[scenarioId];
    state.currentScenario.id = scenarioId;
    state.scenarioTasks = state.currentScenario.tasks || [];
    state.taskIndex = 0;
    state.isScenarioActive = true;

    window.currentScenario = state.currentScenario;

    // Emit event for rendering layer to update highlights
    eventBus.emit(Events.SCENARIO_CHANGED, {
      scenarioId: scenarioId,
      scenario: state.currentScenario
    });

    console.log(`${LOG_PREFIX} Initialized scenario: "${state.currentScenario.title}" (${state.scenarioTasks.length} tasks)`);
    return true;

  } catch (error) {
    console.error(`${LOG_PREFIX} Error initializing task system:`, error);
    return false;
  }
}

/**
 * Gets the current active task
 * @returns {Object|null} Current task or null if no active task
 */
export function currentTask() {
  if (!state.isScenarioActive || !state.scenarioTasks) {
    return null;
  }

  if (state.taskIndex >= state.scenarioTasks.length) {
    return null;
  }

  return state.scenarioTasks[state.taskIndex];
}

/**
 * Advances to the next task
 */
export function advanceTask() {
  if (!state.isScenarioActive) {
    console.warn(`${LOG_PREFIX} Cannot advance: no active scenario`);
    return;
  }

  const previousTask = state.scenarioTasks[state.taskIndex];
  state.taskIndex++;

  console.log(`${LOG_PREFIX} Advanced to task ${state.taskIndex}/${state.scenarioTasks.length}`);

  // Emit event for UI layer to update progress
  const progress = getProgress();
  eventBus.emit(Events.PROGRESS_UPDATED, progress);

  if (state.taskIndex >= state.scenarioTasks.length) {
    onScenarioComplete();
  }
}

/**
 * Switches to a different scenario
 * @param {string} scenarioId - ID of the scenario to switch to
 * @returns {boolean} True if successful, false otherwise
 */
export function switchScenario(scenarioId) {
  if (!state.scenarioData || !state.scenarioData[scenarioId]) {
    console.error(`${LOG_PREFIX} Cannot switch: scenario not found - ${scenarioId}`);
    return false;
  }

  state.isScenarioActive = false;
  state.taskIndex = 0;

  console.log(`${LOG_PREFIX} Switching to scenario: ${scenarioId}`);
  const success = initTaskSystem(scenarioId);
  
  if (success) {
    // Emit event for rendering layer to update highlights
    eventBus.emit(Events.SCENARIO_CHANGED, {
      scenarioId: scenarioId,
      scenario: state.currentScenario
    });
    
    // Emit progress update for UI layer
    const progress = getProgress();
    eventBus.emit(Events.PROGRESS_UPDATED, progress);
  }
  
  return success;
}

/**
 * Switches to a scenario with introduction overlay
 * Shows the scenario introduction modal before starting
 * @param {string} scenarioId - ID of the scenario to switch to
 * @returns {Promise<boolean>} Promise that resolves to true if successful
 */
export async function switchScenarioWithIntro(scenarioId) {
  if (!state.scenarioData || !state.scenarioData[scenarioId]) {
    console.error(`${LOG_PREFIX} Cannot switch: scenario not found - ${scenarioId}`);
    return false;
  }

  try {
    // Show introduction modal
    const scenario = state.scenarioData[scenarioId];
    await state.introManager.showIntro(scenario);

    // Switch scenario after modal closes
    return switchScenario(scenarioId);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error switching scenario with intro:`, error);
    return false;
  }
}

/**
 * Gets current progress information
 * @returns {Object} Progress data with current, total, and percentage
 */
export function getProgress() {
  if (!state.isScenarioActive || !state.scenarioTasks) {
    return {
      current: 0,
      total: 0,
      percentage: 0,
      scenarioTitle: null
    };
  }

  const total = state.scenarioTasks.length;
  const current = Math.min(state.taskIndex, total);
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return {
    current,
    total,
    percentage,
    scenarioTitle: state.currentScenario?.title || 'Unknown'
  };
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Called when scenario is completed
 */
function onScenarioComplete() {
  state.isScenarioActive = false;

  const title = state.currentScenario?.title || 'Unknown Scenario';
  console.log(`${LOG_PREFIX} Scenario completed: ${title}`);

  // Emit event for UI layer to display notification
  eventBus.emit(Events.SCENARIO_COMPLETED, {
    scenarioTitle: title,
    scenarioId: state.currentScenario?.id
  });
}

/**
 * Notifies that a task has been completed
 * @param {string} taskTitle - Title of completed task
 */
export function notifyComplete(taskTitle) {
  console.log(`${LOG_PREFIX} Task completed: ${taskTitle}`);

  // Emit event for UI layer to display notification
  eventBus.emit(Events.TASK_COMPLETED, {
    taskTitle: taskTitle,
    taskIndex: state.taskIndex - 1
  });
}

// ============================================================================
// EVENT LISTENERS - RENDERING LAYER COMMUNICATION
// ============================================================================

/**
 * Helper function to check if a mesh matches a target name
 * This mimics the isMeshMatching function from interaction.js
 */
function isMeshMatching(mesh, targetName) {
  if (!mesh || !targetName) return false;

  const meshName = mesh?.name || '';
  const meshId = mesh?.id || '';

  // Exact match
  if (meshName === targetName || meshId === targetName) return true;

  // Starts with target
  if (meshName.startsWith(targetName + '_') || meshName.startsWith(targetName + '-')) return true;
  if (meshId.startsWith(targetName + '_') || meshId.startsWith(targetName + '-')) return true;

  // Contains target
  if (meshName.includes(targetName) || meshId.includes(targetName)) return true;

  // Metadata tag match
  if (mesh.metadata?.tag === targetName) return true;

  return false;
}

/**
 * Handles custom interactions from task definitions
 * Called when a mesh with onInteract action is clicked
 */
function handleCustomInteraction(actionObj) {
  if (!actionObj) return;

  console.log(`${LOG_PREFIX} Executing custom interaction:`, actionObj.action);

  if (actionObj.action === 'attach_device') {
    if (!window.attachedDevices) {
      window.attachedDevices = [];
    }

    const device = {
      name: actionObj.deviceName,
      type: actionObj.deviceType,
      size: actionObj.size || '500G',
      partitions: [
        {
          name: `${actionObj.deviceName}1`,
          size: '499G',
          mounted: false,
          mountPoint: '',
          content: actionObj.mountContent || {}
        }
      ]
    };

    window.attachedDevices.push(device);
    // Emit event for UI layer to show notification
    eventBus.emit(Events.TASK_COMPLETED, {
      taskTitle: actionObj.message,
      taskIndex: state.taskIndex,
      isNotification: true
    });

  } else if (actionObj.action === 'show_message') {
    // Emit event for UI layer to show notification
    eventBus.emit(Events.TASK_COMPLETED, {
      taskTitle: actionObj.message,
      taskIndex: state.taskIndex,
      isNotification: true
    });
  }
}

/**
 * Listen for mesh clicks from the rendering layer
 * When a mesh is clicked, check if it matches current task requirements
 */
eventBus.on(Events.MESH_CLICKED, (data) => {
  const task = currentTask();
  
  if (!task) {
    console.log(`${LOG_PREFIX} Mesh clicked but no active task`);
    return;
  }

  // Check if this mesh interaction completes the current task
  if (task.checkType === 'interaction' && task.interactionTarget) {
    if (isMeshMatching(data.mesh, task.interactionTarget)) {
      console.log(`${LOG_PREFIX} Task complete: Clicked ${data.meshName} (target: ${task.interactionTarget})`);

      // Handle custom interaction if defined
      if (task.onInteract) {
        handleCustomInteraction(task.onInteract);
      }

      // Advance to next task
      advanceTask();
      
      // Notify UI layer of completion
      notifyComplete(task.title);
    }
  }
});

console.log(`${LOG_PREFIX} Module loaded`);
