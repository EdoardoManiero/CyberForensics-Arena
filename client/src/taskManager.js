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
import { PointsBadge } from './pointsBadge.js';
import { tasksAPI, scenariosAPI, devicesAPI, trackingAPI } from './api.js';
import { updateNavScore } from './navigation.js';
import { getCurrentUser } from './session.js';
import { TaskHud } from './taskHud.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const LOG_PREFIX = '[TaskManager]';
const COMPLETED_SCENARIOS_KEY = 'forensic_demo_completed_scenarios';

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
  introManager: new ScenarioIntroManager(),
  lastBadgePointsAwarded: 0, // Store points awarded from last badge unlock
  processingTaskIds: new Set(), // Track tasks currently being processed to prevent duplicates
  completedScenarioIds: new Set() // Track scenarios that have already completed to prevent duplicate events
};

// ============================================================================
// PUBLIC API - INITIALIZATION
// ============================================================================

/**
 * Sets up the task manager with scene reference for UI components
 * @param {BABYLON.Scene} scene - The Babylon.js scene
 */
export function setupTaskManager(scene) {
  state.introManager.scene = scene;
  console.log(`${LOG_PREFIX} Task manager setup complete with scene`);
}

/**
 * Sync devices from server for current scenario
 */
async function syncDevicesFromServer(scenarioCode) {
  if (!scenarioCode) return;

  try {
    const result = await devicesAPI.getDevices(scenarioCode);
    if (result.devices && result.devices.length > 0) {
      // Convert server device format to local cache format
      window.attachedDevices = result.devices.map(device => ({
        name: device.name,
        type: device.type,
        size: device.size,
        partitions: [{
          name: device.partitionName,
          size: device.size,
          mounted: device.mounted,
          mountPoint: device.mountPoint || '',
          content: device.content || {}
        }]
      }));
      console.log(`${LOG_PREFIX} Synced ${result.devices.length} devices from server`);
    } else {
      // Clear local cache if no devices
      window.attachedDevices = [];
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to sync devices from server:`, error);
    // Keep existing local cache on error
  }
}

/**
 * Resets the task manager state (used on logout)
 * Clears all scenario data, tasks, and resets to initial state
 */
export function resetTaskManager() {
  console.log(`${LOG_PREFIX} Resetting task manager state...`);

  // Clear scenario data
  state.scenarioData = null;
  state.currentScenario = null;
  state.scenarioTasks = [];
  state.taskIndex = 0;
  state.isScenarioActive = false;

  // Reset scenario promise cache to allow fresh load on next login
  state.scenariosPromise = null;

  // Reset intro manager scene reference
  state.introManager.scene = null;

  // Clear window reference
  if (window.currentScenario) {
    delete window.currentScenario;
  }

  // Clear attached devices if they exist
  if (window.attachedDevices) {
    window.attachedDevices = [];
  }

  // Clear completed task IDs
  completedTaskIds.clear();

  // Clear processing task IDs
  state.processingTaskIds.clear();

  // Clear completed scenario IDs
  state.completedScenarioIds.clear();

  console.log(`${LOG_PREFIX} Task manager state reset complete`);
}

/**
 * Mark a task as completed (called from console or other modules)
 * @param {string} taskId - Task ID to mark as completed
 */
export function markTaskCompleted(taskId) {
  if (taskId) {
    completedTaskIds.add(taskId);
    console.log(`${LOG_PREFIX} Marked task ${taskId} as completed`);
  }
}

// Export for use by console module
window.markTaskCompleted = markTaskCompleted;

// ============================================================================
// PUBLIC API - SCENARIOS
// ============================================================================

/**
 * Loads scenarios from API (cached)
 * @returns {Promise<Object|null>} Scenario data or null on error
 */
export function loadScenarios() {
  if (!state.scenariosPromise) {
    console.log(`${LOG_PREFIX} Fetching scenarios from API...`);

    state.scenariosPromise = scenariosAPI.getScenarios()
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

// Store completed task IDs for quick lookup
const completedTaskIds = new Set();

/**
 * Loads completed scenarios and tasks from server and updates sessionStorage
 * Should be called on initialization after user is authenticated
 */
export async function loadCompletedScenarios() {
  try {
    const user = getCurrentUser();
    if (!user) {
      console.log(`${LOG_PREFIX} No user logged in, skipping completion load`);
      return;
    }

    const completions = await tasksAPI.getCompletions();
    if (completions) {
      // Store completed scenarios
      if (completions.completedScenarios) {
        sessionStorage.setItem(COMPLETED_SCENARIOS_KEY, JSON.stringify(completions.completedScenarios));
        console.log(`${LOG_PREFIX} Loaded ${completions.completedScenarios.length} completed scenarios from server`);
      }

      // Store completed task IDs
      completedTaskIds.clear();
      if (completions.completedTasks) {
        completions.completedTasks.forEach(task => {
          completedTaskIds.add(task.taskCode);
        });
        console.log(`${LOG_PREFIX} Loaded ${completedTaskIds.size} completed tasks from server`);
      }

      return completions.completedScenarios || [];
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to load completed scenarios from server:`, error);
  }
  return [];
}

/**
 * Checks if a specific task is completed
 * @param {string} taskId - Task ID to check
 * @returns {boolean} True if task is completed
 */
export function isTaskCompleted(taskId) {
  return completedTaskIds.has(taskId);
}

/**
 * Initializes the task system with a specific scenario
 * @param {string} scenarioId - ID of the scenario to initialize
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function initTaskSystem(scenarioId) {
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

    // Check if scenario is already completed
    const isCompleted = isScenarioCompleted(scenarioId);
    if (isCompleted) {
      // Set task index to end (all tasks completed)
      state.taskIndex = state.scenarioTasks.length;
      state.isScenarioActive = false;
      console.log(`${LOG_PREFIX} Scenario "${state.currentScenario.title}" is already completed`);
    } else {
      // Find the highest completed task index
      let highestCompletedIndex = -1;
      for (let i = 0; i < state.scenarioTasks.length; i++) {
        const task = state.scenarioTasks[i];
        if (task.id && completedTaskIds.has(task.id)) {
          highestCompletedIndex = i;
        } else {
          // Stop at first incomplete task
          break;
        }
      }

      // Set task index to next incomplete task (or end if all are done)
      state.taskIndex = highestCompletedIndex + 1;
      state.isScenarioActive = state.taskIndex < state.scenarioTasks.length;

      if (highestCompletedIndex >= 0) {
        console.log(`${LOG_PREFIX} Found ${highestCompletedIndex + 1} completed tasks, starting at task ${state.taskIndex + 1}`);
      } else {
        console.log(`${LOG_PREFIX} No completed tasks found, starting fresh`);
      }
    }

    window.currentScenario = state.currentScenario;

    // Sync devices from server for this scenario (non-blocking)
    syncDevicesFromServer(scenarioId).catch(err => {
      console.warn(`${LOG_PREFIX} Background device sync failed:`, err);
    });

    // Emit event for rendering layer to update highlights
    eventBus.emit(Events.SCENARIO_CHANGED, {
      scenarioId: scenarioId,
      scenario: state.currentScenario
    });

    // Log scenario start for evaluation tracking (non-blocking)
    if (!isCompleted) {
      trackingAPI.scenarioStart(scenarioId).catch(err => {
        console.warn(`${LOG_PREFIX} Failed to log scenario start:`, err);
      });
    }

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
 * NOTE: This is called after backend validation confirms task completion
 */
export function advanceTask() {
  if (!state.isScenarioActive) {
    console.warn(`${LOG_PREFIX} Cannot advance: no active scenario`);
    return;
  }

  const previousTask = state.scenarioTasks[state.taskIndex];

  // Points are now awarded by backend, but we still update UI
  if (previousTask && previousTask.points) {
    // Backend handles scoring, but we can show visual feedback
    console.log(`${LOG_PREFIX} Task completed: ${previousTask.title}`);
  }

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
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
export async function switchScenario(scenarioId) {
  if (!state.scenarioData || !state.scenarioData[scenarioId]) {
    console.error(`${LOG_PREFIX} Cannot switch: scenario not found - ${scenarioId}`);
    return false;
  }

  // Don't reset state here - let initTaskSystem handle it based on completion status
  state.isScenarioActive = false;

  console.log(`${LOG_PREFIX} Switching to scenario: ${scenarioId}`);
  const success = await initTaskSystem(scenarioId);

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
 * Shows the scenario introduction modal before starting (only if not completed)
 * @param {string} scenarioId - ID of the scenario to switch to
 * @returns {Promise<boolean>} Promise that resolves to true if successful
 */
export async function switchScenarioWithIntro(scenarioId) {
  if (!state.scenarioData || !state.scenarioData[scenarioId]) {
    console.error(`${LOG_PREFIX} Cannot switch: scenario not found - ${scenarioId}`);
    return false;
  }

  try {
    // Check if scenario is already completed
    const isCompleted = isScenarioCompleted(scenarioId);

    if (!isCompleted) {
      // Ensure navbar, scene, TaskHud, and PointsBadge are fully visible and rendered before showing intro
      // Give the render loop a moment to render the scene
      await new Promise(resolve => setTimeout(resolve, 150));

      // Verify that TaskHud and PointsBadge are visible before showing intro
      const taskHudRoot = document.getElementById('taskHudRoot');
      const pointsBadgeRoot = document.getElementById('pointsBadgeRoot');

      // Ensure TaskHud is visible
      if (taskHudRoot) {
        TaskHud.show();
      }

      // Ensure PointsBadge is visible
      if (pointsBadgeRoot) {
        PointsBadge.show();
      }

      // Additional delay to ensure UI elements are fully rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Show introduction modal only if scenario is not completed
      const scenario = state.scenarioData[scenarioId];
      await state.introManager.showIntro(scenario);
    } else {
      console.log(`${LOG_PREFIX} Scenario already completed, skipping intro`);
    }

    // Switch scenario after modal closes (or immediately if skipped)
    return switchScenario(scenarioId);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error switching scenario with intro:`, error);
    return false;
  }
}

/**
 * Shows the scenario introduction modal manually (for info button)
 * @param {string} scenarioId - ID of the scenario to show intro for
 * @returns {Promise<void>} Promise that resolves when modal closes
 */
export async function showScenarioIntro(scenarioId) {
  if (!state.scenarioData || !state.scenarioData[scenarioId]) {
    console.error(`${LOG_PREFIX} Cannot show intro: scenario not found - ${scenarioId}`);
    return;
  }

  try {
    const scenario = state.scenarioData[scenarioId];
    await state.introManager.showIntro(scenario);
  } catch (error) {
    console.error(`${LOG_PREFIX} Error showing scenario intro:`, error);
  }
}

/**
 * Gets current progress information
 * @returns {Object} Progress data with current, total, and percentage
 */
export function getProgress() {
  // Handle case when scenario is not active (e.g., completed or not started)
  if (!state.scenarioTasks || state.scenarioTasks.length === 0) {
    return {
      current: 0,
      total: 0,
      percentage: 0,
      scenarioTitle: state.currentScenario?.title || null
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
 * Saves completed scenario to sessionStorage
 */
function saveCompletedScenario(scenarioId) {
  try {
    const completed = getCompletedScenarios();
    if (!completed.includes(scenarioId)) {
      completed.push(scenarioId);
      sessionStorage.setItem(COMPLETED_SCENARIOS_KEY, JSON.stringify(completed));
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to save completed scenario:`, error);
  }
}

/**
 * Gets list of completed scenario IDs from sessionStorage and server
 */
async function getCompletedScenarios() {
  // First try to get from server (authoritative source)
  try {
    const user = getCurrentUser();
    if (user) {
      const completions = await tasksAPI.getCompletions();
      if (completions && completions.completedScenarios) {
        // Update sessionStorage with server data
        sessionStorage.setItem(COMPLETED_SCENARIOS_KEY, JSON.stringify(completions.completedScenarios));
        return completions.completedScenarios;
      }
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to load completed scenarios from server:`, error);
  }

  // Fallback to sessionStorage
  try {
    const stored = sessionStorage.getItem(COMPLETED_SCENARIOS_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to load completed scenarios from storage:`, error);
  }
  return [];
}

/**
 * Checks if a scenario is completed
 * @param {string} scenarioId - Scenario ID to check
 * @returns {boolean} True if scenario is completed
 */
function isScenarioCompleted(scenarioId) {
  // This is called synchronously, so we use sessionStorage as cache
  // The server data should be loaded on initialization
  try {
    const stored = sessionStorage.getItem(COMPLETED_SCENARIOS_KEY);
    if (stored !== null) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        return parsed.includes(scenarioId);
      }
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to check scenario completion:`, error);
  }
  return false;
}

/**
 * Called when scenario is completed
 */
function onScenarioComplete() {
  const scenarioId = state.currentScenario?.id;

  // Prevent duplicate scenario completion events
  if (scenarioId && state.completedScenarioIds.has(scenarioId)) {
    console.log(`${LOG_PREFIX} Scenario ${scenarioId} already completed, skipping duplicate completion event`);
    return;
  }

  state.isScenarioActive = false;

  const title = state.currentScenario?.title || 'Unknown Scenario';
  const badge = state.currentScenario?.badge;

  console.log(`${LOG_PREFIX} Scenario completed: ${title}`);

  // Mark scenario as completed to prevent duplicate events
  if (scenarioId) {
    state.completedScenarioIds.add(scenarioId);
    saveCompletedScenario(scenarioId);
  }

  // Note: Badges are now awarded server-side when tasks are completed
  // The badge information is already stored from the last task submission response

  // Get points awarded for badges (stored from last task submission)
  const pointsAwarded = state.lastBadgePointsAwarded || 0;
  state.lastBadgePointsAwarded = 0; // Reset after use

  // Log scenario end for evaluation tracking (non-blocking)
  const completedTasksCount = state.scenarioTasks.length;
  const totalTasksCount = state.scenarioTasks.length;
  trackingAPI.scenarioEnd(scenarioId, completedTasksCount, totalTasksCount, pointsAwarded).catch(err => {
    console.warn(`${LOG_PREFIX} Failed to log scenario end:`, err);
  });

  // Emit event for UI layer to display notification
  eventBus.emit(Events.SCENARIO_COMPLETED, {
    scenarioTitle: title,
    scenarioId: scenarioId,
    badge: badge,
    pointsAwarded: pointsAwarded
  });
}

/**
 * Store badge points awarded (called from task submission handlers)
 * @param {number} points - Points awarded from badges
 */
export function storeBadgePointsAwarded(points) {
  state.lastBadgePointsAwarded = points || 0;
}

/**
 * Notifies that a task has been completed
 * @param {string} taskTitle - Title of completed task
 * @param {string} taskId - ID of completed task (optional)
 */
export function notifyComplete(taskTitle, taskId = null) {
  console.log(`${LOG_PREFIX} Task completed: ${taskTitle}`);

  // Emit event for UI layer to display notification
  eventBus.emit(Events.TASK_COMPLETED, {
    taskTitle: taskTitle,
    taskIndex: state.taskIndex - 1,
    taskId: taskId
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
 * @param {Object} actionObj - The action object from task definition
 * @param {string} taskId - The ID of the task (optional, for tracking)
 */
async function handleCustomInteraction(actionObj, taskId = null) {
  if (!actionObj) return;

  console.log(`${LOG_PREFIX} Executing custom interaction:`, actionObj.action);
  console.log(`${LOG_PREFIX} Full actionObj:`, actionObj);

  if (actionObj.action === 'attach_device') {
    // Sync device attachment to server
    const scenarioCode = state.currentScenario?.id;
    if (scenarioCode) {
      try {
        await devicesAPI.attachDevice(
          scenarioCode,
          actionObj.deviceName,
          actionObj.deviceType,
          actionObj.size || '500G',
          actionObj.mountContent || {}
        );
        console.log(`[taskManager] Device ${actionObj.deviceName} attached to server`);
      } catch (error) {
        console.error('[taskManager] Failed to attach device to server:', error);
        // Continue with local attachment as fallback
      }
    }

    // Update local cache for immediate use
    if (!window.attachedDevices) {
      window.attachedDevices = [];
    }

    const partition = {
      name: `${actionObj.deviceName}1`,
      size: '499G',
      mounted: false,
      mountPoint: '',
      content: actionObj.mountContent || {}
    };

    // For remote devices, automatically mount to specified mountPoint
    if (actionObj.deviceType === 'remote' && actionObj.mountPoint) {
      partition.mounted = true;
      partition.mountPoint = actionObj.mountPoint;

      // Auto-mount on server if device was attached
      if (scenarioCode) {
        try {
          await devicesAPI.mountDevice(scenarioCode, `/dev/${partition.name}`, actionObj.mountPoint);
          console.log(`[taskManager] Device auto-mounted on server at ${actionObj.mountPoint}`);
        } catch (error) {
          console.error('[taskManager] Failed to auto-mount device on server:', error);
        }
      }
    }

    const device = {
      name: actionObj.deviceName,
      type: actionObj.deviceType,
      size: actionObj.size || '500G',
      partitions: [partition]
    };

    window.attachedDevices.push(device);

    // If device is auto-mounted and has VFS integration, update the virtual file system
    console.log('[taskManager] Auto-mount check:', {
      deviceType: actionObj.deviceType,
      mounted: partition.mounted,
      mountPoint: partition.mountPoint,
      hasUpdateVFSWithDevice: !!window.updateVFSWithDevice,
      contentKeys: Object.keys(partition.content || {})
    });

    if (partition.mounted && window.updateVFSWithDevice) {
      console.log('[taskManager] Calling auto-mount with:', partition.mountPoint, partition.content);
      window.updateVFSWithDevice(partition.mountPoint, partition.content);
      console.log('[taskManager] Auto-mount completed');
    }

    // Emit event for UI layer to show notification
    // Include taskId so it can be tracked properly
    eventBus.emit(Events.TASK_COMPLETED, {
      taskTitle: actionObj.message,
      taskIndex: state.taskIndex,
      taskId: taskId,
      isNotification: true
    });

  } else if (actionObj.action === 'show_message') {
    // Emit event for UI layer to show notification
    // Include taskId so it can be tracked properly
    eventBus.emit(Events.TASK_COMPLETED, {
      taskTitle: actionObj.message,
      taskIndex: state.taskIndex,
      taskId: taskId,
      isNotification: true
    });
  }
}

/**
 * Listen for mesh clicks from the rendering layer
 * When a mesh is clicked, check if it matches current task requirements
 */
eventBus.on(Events.MESH_CLICKED, async (data) => {
  const task = currentTask();

  if (!task) {
    console.log(`${LOG_PREFIX} Mesh clicked but no active task`);
    return;
  }

  // Check if this mesh interaction completes the current task
  if (task.checkType === 'interaction' && task.interactionTarget) {
    if (isMeshMatching(data.mesh, task.interactionTarget)) {
      // Prevent duplicate processing if task is already being processed
      if (task.id && state.processingTaskIds.has(task.id)) {
        console.log(`${LOG_PREFIX} Task ${task.id} is already being processed, ignoring duplicate click`);
        return;
      }

      // Mark task as being processed
      if (task.id) {
        state.processingTaskIds.add(task.id);
      }

      console.log(`${LOG_PREFIX} Task complete: Clicked ${data.meshName} (target: ${task.interactionTarget})`);

      // Handle custom interaction if defined
      if (task.onInteract) {
        handleCustomInteraction(task.onInteract, task.id);
      }

      // Submit interaction task to backend
      if (task.id) {
        try {
          const answer = 'interaction:' + task.interactionTarget;
          console.log(`${LOG_PREFIX} Submitting task ${task.id} with answer: ${answer}`);
          const result = await tasksAPI.submitTask(task.id, answer);
          console.log(`${LOG_PREFIX} Task submission result:`, result);

          if (result.correct) {
            // Sync points with server's authoritative total score (includes badge points)
            // Security: Always use server-provided newTotalScore, never calculate client-side
            if (result.newTotalScore !== undefined) {
              console.log(`${LOG_PREFIX} Updating points to ${result.newTotalScore} (from server)`);
              PointsBadge.setPoints(result.newTotalScore);
              // Also update navigation display
              updateNavScore(result.newTotalScore);
            } else {
              console.warn(`${LOG_PREFIX} No newTotalScore in result, cannot update points securely`);
            }

            // Show badges if unlocked (with points if awarded)
            if (result.badgesUnlocked && result.badgesUnlocked.length > 0) {
              const pointsAwarded = result.pointsAwarded || 0;
              state.lastBadgePointsAwarded = pointsAwarded; // Store for scenario completion event

              // Identify skill badges (Hint-Free Expert, Speed Runner)
              const skillBadges = ['Hint-Free Expert', 'Speed Runner'];
              const unlockedSkillBadges = result.badgesUnlocked.filter(badge =>
                skillBadges.includes(badge)
              );

              // Get scenario badge (if any) - it's the one that's not a skill badge
              const scenarioBadge = result.badgesUnlocked.find(badge =>
                !skillBadges.includes(badge)
              );

              result.badgesUnlocked.forEach(badge => {
                // Add badge (points already included in newTotalScore from server)
                PointsBadge.addBadge(badge);
              });

              // Show individual toasts for skill badges
              if (unlockedSkillBadges.length > 0) {
                // Each skill badge is worth 30 points (Speed Runner, Hint-Free Expert)
                const skillBadgePoints = 30;

                unlockedSkillBadges.forEach(skillBadge => {
                  // Show toast for skill badge
                  TaskHud.toast('Badge Unlocked', skillBadge, 'badge', skillBadge, skillBadgePoints);
                });
              }

              // Show notification with points if any were awarded
              if (pointsAwarded > 0) {
                console.log(`${LOG_PREFIX} Badges awarded ${pointsAwarded} points`);
              }
            }

            // Mark task as completed
            if (task.id) {
              completedTaskIds.add(task.id);
              // Remove from processing set
              state.processingTaskIds.delete(task.id);
            }

            // Advance to next task
            advanceTask();

            // Notify UI layer of completion
            notifyComplete(task.title, task.id);
          } else {
            console.warn(`${LOG_PREFIX} Task submission marked as incorrect`);
            // Remove from processing set
            if (task.id) {
              state.processingTaskIds.delete(task.id);
            }
            // Still advance task for now (might want to handle this differently)
            advanceTask();
            notifyComplete(task.title, task.id);
          }
        } catch (error) {
          console.error(`${LOG_PREFIX} Error submitting interaction task:`, error);
          console.error(`${LOG_PREFIX} Error details:`, error.message, error.stack);
          // Remove from processing set on error
          if (task.id) {
            state.processingTaskIds.delete(task.id);
          }
          // Fallback for development
          advanceTask();
          notifyComplete(task.title, task.id);
        }
      } else {
        console.warn(`${LOG_PREFIX} Task has no ID, cannot submit to backend:`, task);
        // Remove from processing set
        if (task.id) {
          state.processingTaskIds.delete(task.id);
        }
        // Fallback if no task ID
        advanceTask();
        notifyComplete(task.title, task.id);
      }
    }
  }
});

console.log(`${LOG_PREFIX} Module loaded`);
