/**
 * main.js - Application Entry Point
 * 
 * Initializes the 3D scene, console, interactions, and task system.
 * Manages the overall application lifecycle and event handling.
 */

import * as BABYLON from '@babylonjs/core';
import '@babylonjs/loaders';
import { createScene, updateScenarioHighlights } from './scene.js';
import { setupInteractions } from './interaction.js';
import { initConsole, toggleConsoleVisibility } from './console.js';
import { TutorialManager } from './TutorialManager.js';
import { loadScenarios, initTaskSystem, currentTask, switchScenarioWithIntro } from './taskManager.js';
import { TaskHud } from './taskHud.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const CONFIG = {
  CANVAS_ID: 'renderCanvas',
  INITIAL_SCENARIO: 'file_system_forensic',
  ENGINE_OPTIONS: {
    preserveDrawingBuffer: true,
    stencil: true
  },
  POINTER_LOCK_OPTIONS: {
    unadjustedMovement: true
  }
};

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const appState = {
  engine: null,
  scene: null,
  canvas: null,
  tutorial: null,
  isInitialized: false
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initializes the application on DOM content loaded
 */
async function initializeApp() {
  try {
    console.log('Starting application initialization...');

    // Get canvas element
    const canvas = document.getElementById(CONFIG.CANVAS_ID);
    if (!canvas) {
      throw new Error(`Canvas element with id '${CONFIG.CANVAS_ID}' not found`);
    }
    appState.canvas = canvas;

    // Create Babylon engine
    appState.engine = new BABYLON.Engine(canvas, true, CONFIG.ENGINE_OPTIONS);
    console.log('Babylon Engine created');

    // Create 3D scene
    appState.scene = await createScene(appState.engine, canvas);
    console.log('Scene created');

    // Attach currentTask getter to scene so rendering layer can access it
    // This allows interaction.js to check task state without importing from taskManager
    appState.scene._currentTask = currentTask;

    // Setup interactions (mouse, keyboard, hover)
    setupInteractions(appState.scene, appState.scene.activeCamera);
    console.log('Interactions setup');

    // Initialize console system
    initConsole();
    console.log('Console initialized');

    // Setup pointer lock safety
    installPointerLockSafety(appState.scene, canvas);
    console.log('Pointer lock safety installed');

    // Load scenarios
    console.log('Loading scenarios...');
    const scenarios = await loadScenarios();
    if (!scenarios) {
      console.error('Failed to load scenarios! Task system may not work.');
    } else {
      console.log('Scenarios loaded');
    }

    // Initialize tutorial
    initializeTutorial();
    console.log('Tutorial initialized');

    // Setup render loop
    appState.engine.runRenderLoop(() => appState.scene.render());
    console.log('Render loop started');

    // Setup window resize handler
    setupResizeHandler();
    console.log('Resize handler setup');

    // Export globals for debugging
    window.BABYLON = BABYLON;
    window.app = appState;
    window.toggleConsoleVisibility = toggleConsoleVisibility;

    appState.isInitialized = true;
    console.log('Application initialized successfully');

  } catch (error) {
    console.error('Application initialization failed:', error);
    showFatalError(error.message);
  }
}

/**
 * Initializes the tutorial system
 */
function initializeTutorial() {
  appState.tutorial = new TutorialManager({
    scene: appState.scene,
    onDone: onTutorialComplete
  });

  window.tutorial = appState.tutorial;
}

/**
 * Callback when tutorial is completed
 */
async function onTutorialComplete() {
  try {
    console.log('Tutorial completed. Initializing task system...');

    appState.scene.activeCamera?.attachControl(appState.canvas, true);
    appState.canvas.focus();

    const success = initTaskSystem(CONFIG.INITIAL_SCENARIO);

    if (success) {
      console.log(`Started scenario: ${CONFIG.INITIAL_SCENARIO}`);
      updateScenarioHighlights();
      TaskHud.mount();
      TaskHud.show();

      // Show scenario introduction with modal
      await switchScenarioWithIntro(CONFIG.INITIAL_SCENARIO);
    } else {
      console.error('Failed to initialize task system');
    }

  } catch (error) {
    console.error('Error in tutorial completion:', error);
  }
}

/**
 * Sets up window resize handler
 */
function setupResizeHandler() {
  window.addEventListener('resize', () => {
    if (appState.engine) {
      appState.engine.resize();
    }
    if (window.fitAddon) {
      window.fitAddon.fit();
    }
  });
}

/**
 * Installs pointer lock safety handlers
 */
function installPointerLockSafety(scene, canvas) {
  if (window.__pointerLockSafetyInstalled) return;
  window.__pointerLockSafetyInstalled = true;

  try {
    scene.activeCamera?.attachControl(canvas, true);
  } catch (error) {
    console.warn('Initial camera attachment failed:', error);
  }

  canvas.addEventListener('click', () => {
    if (document.pointerLockElement !== canvas) {
      try {
        scene.activeCamera?.attachControl(canvas, true);
        canvas.focus();
        canvas.requestPointerLock?.({ unadjustedMovement: true });
      } catch (error) {
        console.warn('Pointer lock re-attachment failed:', error);
      }
    }
  }, true);

  document.addEventListener('pointerlockchange', () => {
    if (document.pointerLockElement === canvas) {
      canvas.focus();
    }
  }, true);

  document.addEventListener('pointerlockerror', (error) => {
    console.warn('Pointer lock error:', error);
  }, true);
}

/**
 * Displays a fatal error message to the user
 */
function showFatalError(message) {
  const errorDiv = document.createElement('div');
  errorDiv.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(200, 50, 50, 0.95);
    color: white;
    padding: 30px;
    border-radius: 8px;
    z-index: 10000;
    max-width: 500px;
    text-align: center;
    font-family: monospace;
  `;
  errorDiv.innerHTML = `
    <h2>Application Error</h2>
    <p>${message}</p>
    <p style="font-size: 0.9em; margin-top: 20px;">
      Check the browser console for more details.
    </p>
  `;
  document.body.appendChild(errorDiv);
}

window.addEventListener('DOMContentLoaded', initializeApp);

window.addEventListener('beforeunload', () => {
  if (appState.engine) {
    appState.engine.dispose();
  }
});
