/**
 * interaction.js - User Interaction Management (RENDERING LAYER)
 * 
 * Handles mouse hover effects, clicking, keyboard input, and mesh interactions.
 * Emits events for logic and UI layers to handle.
 * 
 * ARCHITECTURAL NOTE:
 * - This is a RENDERING LAYER component
 * - ONLY imports from other rendering layer (scene.js) and event bus
 * - Does NOT import from Logic (taskManager) or UI (console, taskHud) layers
 * - Communicates via events: MESH_CLICKED, CONSOLE_TOGGLE, MESH_HOVERED, MESH_HOVER_END
 */

import * as BABYLON from '@babylonjs/core';
import { highlightLayer, permanentHighlightedMeshes, setCurrentHoveredMesh, clearCurrentHoveredMesh, safeRespawn } from './scene.js';
import { eventBus, Events } from './eventBus.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const HINT_ELEMENT_ID = 'interactionHint';
const CROSSHAIR_ELEMENT_ID = 'crosshair';
const CANVAS_ELEMENT_ID = 'renderCanvas';
const CONSOLE_CONTAINER_ID = 'consoleContainer';
const XTERM_TEXTAREA_CLASS = 'xterm-helper-textarea';
const TUTORIAL_OVERLAY_ID = 'tutorial-overlay';

const HIGHLIGHT_COLOR = {
  HOVER: new BABYLON.Color3(0, 0.8, 0),
  DEFAULT: new BABYLON.Color3(0, 0, 0)
};

const KEY_CODES = {
  E: 'e',
  C: 'c',
  ESCAPE: 'Escape',
  W: 'w', A: 'a', S: 's', D: 'd',
  ARROW_UP: 'ArrowUp',
  ARROW_DOWN: 'ArrowDown',
  ARROW_LEFT: 'ArrowLeft',
  ARROW_RIGHT: 'ArrowRight'
};

// ============================================================================
// STATE
// ============================================================================

let highlightedMesh = null;
let activeHighlightMeshes = [];
let modalCloseCooldown = 0; // Timestamp to prevent console opening immediately after modal close
let sceneRef = null;  // Will be set by setupInteractions to access currentTask
let altKeyHeld = false;  // Track Alt key state manually
const interactionHint = document.getElementById(HINT_ELEMENT_ID);

// ============================================================================
// MESH CHECKING FUNCTIONS
// ============================================================================

/**
 * Checks if a mesh is the PC/Monitor
 * @param {BABYLON.Mesh} mesh - Mesh to check
 * @returns {boolean} True if mesh is a PC
 */
function isPCMesh(mesh) {
  if (!mesh) return false;
  const name = (mesh.name || '').toLowerCase();
  const id = (mesh.id || '').toLowerCase();
  const tag = mesh.metadata?.tag ? String(mesh.metadata.tag).toLowerCase() : '';

  return mesh.isPickable && (
    mesh.metadata?.isPC === true ||
    tag.includes('pc') || tag.includes('computer') || tag.includes('laptop') ||
    mesh.name === 'PC_Monitor' ||
    /monitor|laptop|display|schermo|pc|linux/.test(name) ||
    /monitor|laptop|pc/.test(id)
  );
}

/**
 * Checks if two meshes match by name or ID
 * @param {BABYLON.Mesh} mesh - Mesh to check
 * @param {string} targetName - Target name to match
 * @returns {boolean} True if mesh matches target
 */
export function isMeshMatching(mesh, targetName) {
  if (!mesh || !targetName) return false;

  const meshName = mesh.name || '';
  const meshId = mesh.id || '';
  const parentName = mesh.parent?.name || '';

  // Exact match
  if (meshName === targetName || meshId === targetName) return true;
  if (parentName === targetName) return true;
  // Starts with target (handles suffixes like _primitive0, _0)
  if (meshName.startsWith(targetName + '_') ||
    meshName.startsWith(targetName + '-') ||
    meshId.startsWith(targetName + '_') ||
    meshId.startsWith(targetName + '-')) {
    return true;
  }

  // Contains target
  if (meshName.includes(targetName) || meshId.includes(targetName)) {
    return true;
  }

  // Metadata tag match
  if (mesh.metadata?.tag === targetName) return true;

  return false;
}

/**
 * Checks if a mesh is interactable in the current context
 * @param {BABYLON.Mesh} mesh - Mesh to check
 * @returns {boolean} True if mesh is interactable
 */
function isInteractableMesh(mesh) {
  if (!mesh || !mesh.isPickable) return false;

  // Always allow PC interaction
  if (isPCMesh(mesh)) return true;
  if (mesh.name.includes('primitive')) return false;

  // Check if mesh is in permanent highlights
  if (permanentHighlightedMeshes?.some(permMesh =>
    permMesh === mesh ||
    permMesh === mesh.parent ||
    mesh.name.startsWith(permMesh.name?.split('_')[0] || '')
  )) {
    return true;
  }

  // Check current task requirements via scene reference (attached by main.js)
  const task = sceneRef?._currentTask?.();
  if (task?.checkType === 'interaction' && task.interactionTarget) {
    return isMeshMatching(mesh, task.interactionTarget);
  }

  return false;
}

// ============================================================================
// CUSTOM INTERACTIONS
// ============================================================================

/**
 * Handles custom interactions from task definitions via event bus
 * NOTE: Custom interaction handling delegated to taskManager via MESH_CLICKED event
 * The action object is passed in the event data for taskManager to process
 * 
 * This keeps the rendering layer focused only on input detection,
 * not on the business logic of what happens when interaction occurs.
 */

// ============================================================================
// STATE CHECKING HELPERS
// ============================================================================

/**
 * Checks if tutorial overlay is blocking input
 */
function isTutorialGateOpen() {
  const overlay = document.getElementById(TUTORIAL_OVERLAY_ID);
  return overlay?.classList.contains('mode-gate') ?? false;
}

/**
 * Checks if console is open
 */
function isConsoleOpen() {
  const container = document.getElementById(CONSOLE_CONTAINER_ID);
  return container?.classList.contains('console-open') ?? false;
}

/**
 * Checks if user is typing in xterm
 */
function isTypingInXterm() {
  const element = document.activeElement;
  return element?.classList?.contains(XTERM_TEXTAREA_CLASS) ?? false;
}

/**
 * Checks if login page is active
 */
function isLoginPageActive() {
  const loginPage = document.getElementById('loginPage');
  return loginPage?.classList.contains('active') ?? false;
}

// ============================================================================
// HIGHLIGHT MANAGEMENT
// ============================================================================

function findPcGroupRoot(mesh) {
  let current = mesh?.parent || null;
  while (current) {
    const name = (current.name || '').toLowerCase();
    const id = (current.id || '').toLowerCase();
    const tag = current.metadata?.tag ? String(current.metadata.tag).toLowerCase() : '';
    if (current.metadata?.isPC === true || tag.includes('pc') || /linuxcomputer|pc|workstation|laptop/.test(name) || /linuxcomputer|pc|workstation|laptop/.test(id)) {
      return current;
    }
    current = current.parent || null;
  }
  return null;
}

function getHighlightTargets(mesh) {
  if (!mesh) return [];
  if (isPCMesh(mesh)) {
    const groupRoot = findPcGroupRoot(mesh) || mesh;
    const targets = new Set();
    if (groupRoot.getTotalVertices?.() > 0) targets.add(groupRoot);
    const childMeshes = groupRoot.getChildMeshes?.(false) || [];
    childMeshes.forEach(child => {
      if (child.getTotalVertices?.() > 0) targets.add(child);
    });
    if (!targets.size && mesh.getTotalVertices?.() > 0) targets.add(mesh);
    return Array.from(targets);
  }
  return [mesh];
}

/**
 * Updates hover highlight based on center screen pick
 */
function updateHighlightFromPointer() {
  try {
    const engine = scene.getEngine();
    const centerX = engine.getRenderWidth() / 2;
    const centerY = engine.getRenderHeight() / 2;
    const pick = scene.pick(centerX, centerY, isInteractableMesh);
    const pickedMesh = pick?.hit ? pick.pickedMesh : null;

    const crosshair = document.getElementById(CROSSHAIR_ELEMENT_ID);

    if (pickedMesh) {
      if (interactionHint) interactionHint.style.display = 'block';

      if (activeHighlightMeshes.length) {
        activeHighlightMeshes.forEach(mesh => highlightLayer.removeMesh(mesh));
        activeHighlightMeshes = [];
      }

      const highlightTargets = getHighlightTargets(pickedMesh);
      highlightTargets.forEach(mesh => {
        if (!mesh) return;
        highlightLayer.addMesh(mesh, HIGHLIGHT_COLOR.HOVER);
        activeHighlightMeshes.push(mesh);
      });

      highlightedMesh = pickedMesh;
      setCurrentHoveredMesh(activeHighlightMeshes[0] || pickedMesh);
      crosshair?.classList.add('targeting');

    } else {
      if (interactionHint) interactionHint.style.display = 'none';

      if (activeHighlightMeshes.length) {
        activeHighlightMeshes.forEach(mesh => highlightLayer.removeMesh(mesh));
        activeHighlightMeshes = [];
      }

      highlightedMesh = null;
      clearCurrentHoveredMesh();
      crosshair?.classList.remove('targeting');
    }

  } catch (error) {
    console.error('Hover update error:', error);
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Sets up all interaction handlers
 * @param {BABYLON.Scene} scene - Babylon.js scene
 * @param {BABYLON.Camera} camera - Active camera
 */
export function setupInteractions(scene, camera) {
  // Listen for clicks on modal close buttons to set cooldown
  document.addEventListener('click', (e) => {
    const target = e.target;
    // Check if click is on a modal close button
    if (target.closest('.auth-modal__close') ||
      target.closest('#authModalClose') ||
      target.closest('.scenario-intro-close') ||
      target.closest('.points-badge-close') ||
      target.closest('#profileModalClose') ||
      target.closest('#leaderboardModalClose')) {
      // Set cooldown for 500ms after modal close button click
      modalCloseCooldown = Date.now() + 500;
    }
  }, true);
  // Make scene accessible to local functions
  window.scene = scene;
  sceneRef = scene;  // Store scene reference for isInteractableMesh to access currentTask

  // ========== POINTER MOVEMENT & HOVER ==========
  scene.onPointerObservable.add((pointerInfo) => {
    if (isTutorialGateOpen() || isLoginPageActive()) return;

    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERMOVE) {
      updateHighlightFromPointer();
    }

    if (pointerInfo.type === BABYLON.PointerEventTypes.POINTERDOWN) {
      // Tutorial canvas click (no mesh hit) - for "Click to Move Camera" step
      if (!highlightedMesh) {
        if (window.tutorial?.idx === 1 && !window.tutorial._done) {
          console.log('Tutorial step: clicked canvas');
          eventBus.emit(Events.TUTORIAL_CANVAS_CLICKED);
        }
        return;
      }

      // Tutorial click handling
      if (window.tutorial?.idx === 3 && !window.tutorial._done) {
        console.log('Tutorial step: clicked interactable');
        eventBus.emit(Events.TUTORIAL_INTERACTABLE_CLICKED);
        return;
      }

      // PC interaction - emit CONSOLE_TOGGLE event instead of calling function
      if (isPCMesh(highlightedMesh)) {
        console.log('PC mesh clicked - requesting console open');
        eventBus.emit(Events.CONSOLE_TOGGLE, { open: true });
        eventBus.emit(Events.TUTORIAL_CONSOLE_OPENED);
        return;
      }

      // Task interaction - emit MESH_CLICKED event for logic layer to process
      // The logic layer (taskManager) will handle task checking and advancement
      console.log(`Mesh clicked: ${highlightedMesh?.name}`);
      eventBus.emit(Events.MESH_CLICKED, {
        mesh: highlightedMesh,
        meshName: highlightedMesh?.name,
        meshId: highlightedMesh?.id,
        position: highlightedMesh?.position
      });
    }
  });

  // ========== KEYBOARD HANDLERS ==========

  // E to interact with PC - emit event instead of calling toggleConsoleVisibility
  function handleEKey(event) {
    if (isTutorialGateOpen() || isLoginPageActive()) return;

    // Ignore if user is typing in an input field or textarea
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    if ((event.key || '').toLowerCase() !== KEY_CODES.E) return;
    if (isConsoleOpen() && isTypingInXterm()) return;

    try {
      const engine = scene.getEngine();
      const x = engine.getRenderWidth() / 2;
      const y = engine.getRenderHeight() / 2;
      const pick = scene.pick(x, y, isPCMesh);

      if (pick?.hit) {
        event.preventDefault();
        console.log('E key pressed on PC mesh - requesting console open');
        eventBus.emit(Events.CONSOLE_TOGGLE, { open: true });
        eventBus.emit(Events.TUTORIAL_INTERACTED);
        eventBus.emit(Events.TUTORIAL_CONSOLE_OPENED);
      }
    } catch (error) {
      console.warn('E key handler error:', error);
    }
  }

  // C to toggle console, ESC to close - emit events instead of calling toggleConsoleVisibility
  function handleConsoleLKeys(event) {
    if (isTutorialGateOpen() || isLoginPageActive()) return;

    // Ignore if user is typing in an input field or textarea (e.g. login form)
    // This fixes the bug where typing 'c' in login form opens console
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    const key = (event.key || '').toLowerCase();

    // Terminal typing - only trap ESC
    if (isConsoleOpen() && isTypingInXterm()) {
      if (key === KEY_CODES.ESCAPE) {
        event.preventDefault();
        console.log('ESC key in terminal - requesting console close');
        eventBus.emit(Events.CONSOLE_TOGGLE, { open: false });
        document.getElementById(CANVAS_ELEMENT_ID)?.focus();
      }
      return;
    }

    // Check if any modal is open - block console toggle if it is
    const authModal = document.getElementById('authModal');
    const scenarioIntroOverlay = document.querySelector('.scenario-intro-overlay');
    const profileModal = document.getElementById('profileModal');
    const leaderboardModal = document.getElementById('leaderboardModal');

    // Check if modal is active
    const isModalActive = (authModal && authModal.classList.contains('active')) ||
      scenarioIntroOverlay ||
      (profileModal && profileModal.classList.contains('active')) ||
      (leaderboardModal && leaderboardModal.classList.contains('active'));

    // Also check if the event target is inside any modal (catches clicks on close buttons)
    const eventTarget = event.target;
    const isInsideModal = eventTarget && (
      authModal?.contains(eventTarget) ||
      scenarioIntroOverlay?.contains(eventTarget) ||
      profileModal?.contains(eventTarget) ||
      leaderboardModal?.contains(eventTarget)
    );

    // Check if we're in cooldown period after modal close (prevents console opening immediately after clicking X)
    const now = Date.now();
    const inCooldown = now < modalCloseCooldown;

    if (isModalActive || isInsideModal || inCooldown) {
      // Don't handle console keys when modals are open, when clicking inside modals, or during cooldown
      return;
    }

    // C toggles console open - but block during tutorial steps 0-3 (before step 4 "Open Console")
    if (key === KEY_CODES.C) {
      // Block C key during tutorial steps 0-3
      if (window.tutorial && window.tutorial.idx < 4 && !window.tutorial._done) {
        event.preventDefault();
        console.log('C key blocked during tutorial steps 0-3');
        return;
      }

      event.preventDefault();
      console.log('C key pressed - requesting console toggle');
      // Don't specify 'open' - let console handle toggle logic
      eventBus.emit(Events.CONSOLE_TOGGLE, {});
      eventBus.emit(Events.TUTORIAL_CONSOLE_OPENED);
      return;
    }

    // ESC closes console or signals tutorial
    if (key === KEY_CODES.ESCAPE) {
      eventBus.emit(Events.TUTORIAL_ESC_PRESSED);

      if (isConsoleOpen()) {
        event.preventDefault();
        console.log('ESC key - requesting console close');
        eventBus.emit(Events.CONSOLE_TOGGLE, { open: false });
        document.getElementById(CANVAS_ELEMENT_ID)?.focus();
      }
    }
  }

  // Track Alt key manually (Firefox doesn't report altKey reliably)
  function trackAltKey(event) {
    const code = event.code || '';
    if (code === 'AltLeft' || code === 'AltRight') {
      if (event.type === 'keydown') {
        altKeyHeld = true;
      } else if (event.type === 'keyup') {
        altKeyHeld = false;
      }
    }
  }

  // Alt+R: Safe respawn
  function handleSafeRespawn(event) {
    trackAltKey(event);  // Update Alt key state

    // Ignore if user is typing in an input field or textarea (e.g. console)
    if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
      return;
    }

    // Ignore if login page is active
    if (isLoginPageActive()) return;

    // Ignore if console is open (double check via DOM class)
    const consoleContainer = document.getElementById(CONSOLE_CONTAINER_ID);
    if (consoleContainer && consoleContainer.classList.contains('console-open')) {
      return;
    }

    const key = (event.key || '').toLowerCase();
    const code = event.code || '';

    // Check both key and code for better compatibility
    const isRKey = key === 'r' || code === 'KeyR';

    // Use manually tracked Alt state instead of event.altKey
    // Also check event.altKey directly as a backup
    if ((altKeyHeld || event.altKey) && isRKey) {
      event.preventDefault();
      event.stopPropagation();
      const activeCamera = scene.activeCamera || scene.cameras[0];
      if (activeCamera) {
        safeRespawn(scene, activeCamera);
      }
      return;
    }
  }

  // Movement signal for tutorial
  let movementSignaled = false;
  function handleMovement(event) {
    if (movementSignaled || isLoginPageActive()) return;

    const key = (event.key || '').toUpperCase();
    if ([KEY_CODES.W, KEY_CODES.A, KEY_CODES.S, KEY_CODES.D,
    KEY_CODES.ARROW_UP, KEY_CODES.ARROW_DOWN,
    KEY_CODES.ARROW_LEFT, KEY_CODES.ARROW_RIGHT].includes(key)) {
      eventBus.emit(Events.TUTORIAL_MOVED);
      movementSignaled = true;
    }
  }

  // Register keyboard handlers
  scene.onKeyboardObservable.add((kb) => {
    if (kb.type === BABYLON.KeyboardEventTypes.KEYDOWN) {
      handleSafeRespawn(kb.event);  // Check Alt+R FIRST with highest priority
      handleEKey(kb.event);
      handleMovement(kb.event);
    } else if (kb.type === BABYLON.KeyboardEventTypes.KEYUP) {
      trackAltKey(kb.event);  // Track Alt key release
    }
  });

  // Keyboard handlers with capture phase
  document.addEventListener('keydown', (event) => {
    handleSafeRespawn(event);  // Alt+R FIRST with highest priority
    handleEKey(event);
    handleConsoleLKeys(event);
    handleMovement(event);
  }, true);

  document.addEventListener('keyup', (event) => {
    trackAltKey(event);  // Track Alt key release
  }, true);

  // ========== CAMERA SETUP ==========
  try {
    const activeCamera = scene.activeCamera || camera;
    if (activeCamera) {
      activeCamera.keysUp = [87, 38]; // W, ArrowUp
      activeCamera.keysDown = [83, 40]; // S, ArrowDown
      activeCamera.keysLeft = [65, 37]; // A, ArrowLeft
      activeCamera.keysRight = [68, 39]; // D, ArrowRight
      activeCamera.attachControl(document.getElementById(CANVAS_ELEMENT_ID), true);
    }
  } catch (error) {
    console.warn('Camera setup error:', error);
  }

  // ========== INITIAL HINT ==========
  setTimeout(() => {
    try {
      const x = scene.getEngine().getRenderWidth() / 2;
      const y = scene.getEngine().getRenderHeight() / 2;
      const pick = scene.pick(x, y, isPCMesh);

      if (pick?.hit) {
        if (interactionHint) interactionHint.style.display = 'block';
        highlightedMesh = pick.pickedMesh;
      }
    } catch (error) {
      console.warn('Initial hint setup error:', error);
    }
  }, 600);

  // ========== SCENARIO INTRO BLOCKING ==========
  eventBus.on(Events.SCENARIO_INTRO_SHOWN, () => {
    isScenarioIntroShowing = true;
    console.log('Scenario intro shown - blocking pointer/camera controls');
  });

  eventBus.on(Events.SCENARIO_INTRO_HIDDEN, () => {
    isScenarioIntroShowing = false;
    console.log('Scenario intro hidden - enabling pointer/camera controls');
  });
}
