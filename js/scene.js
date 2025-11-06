/**
 * scene.js - 3D Scene Setup and Management (RENDERING LAYER)
 * 
 * Initializes the Babylon.js scene, loads 3D models, manages lighting,
 * collision detection, and scene highlights.
 * 
 * ARCHITECTURAL NOTE:
 * - This is a RENDERING LAYER component
 * - Does NOT import from Logic (taskManager) or UI (console, taskHud) layers
 * - Listens to SCENARIO_CHANGED event to update highlights
 */

import * as BABYLON from '@babylonjs/core';
import { eventBus, Events } from './eventBus.js';

// ============================================================================
// CONSTANTS
// ============================================================================

const SCENE_CONFIG = {
  MODEL_PATH: './models/',
  DEFAULT_MODEL: 'secret_lab.glb',
  AMBIENT_INTENSITY: 0.9,
  CAMERA_START_POS: new BABYLON.Vector3(0, 1.6, 1.5),
  CAMERA_TARGET_POS: new BABYLON.Vector3(0, 1.2, -1.5),
  CAMERA_SPEED: 0.2,
  CAMERA_SENSITIVITY: 6000,
  GRAVITY: new BABYLON.Vector3(0, -0.05, 0),
  ELLIPSOID: new BABYLON.Vector3(0.3, 0.9, 0.3),
  HIGHLIGHT_CONFIG: {
    blurHorizontalSize: 1.0,
    blurVerticalSize: 1.0,
    blurTextureSizeRatio: 0.25
  }
};

const HIGHLIGHT_COLOR = {
  PULSE_BASE: 0.6,
  PULSE_RANGE: 0.3,
  PULSE_SPEED: 0.015
};

// ============================================================================
// STATE
// ============================================================================

let currentScenarioData = null;  // Stores scenario data from SCENARIO_CHANGED events

// ============================================================================
// EXPORTS
// ============================================================================

export let allInteractableMeshes = [];
export let permanentHighlightedMeshes = [];
export let highlightLayer = null;
export let currentHoveredMesh = null;

export function setCurrentHoveredMesh(mesh) {
  currentHoveredMesh = mesh;
}

export function clearCurrentHoveredMesh() {
  currentHoveredMesh = null;
}

// ============================================================================
// SCENE UPDATES
// ============================================================================

/**
 * Updates scenario highlights when scenario changes
 * Called when SCENARIO_CHANGED event is received from logic layer
 */
export function updateScenarioHighlights() {
  // Don't interrupt tutorial highlights
  if (window._tutorialHighlightPause) {
    return;
  }

  const scenario = currentScenarioData;
  if (!highlightLayer) return;

  highlightLayer.removeAllMeshes();
  permanentHighlightedMeshes.length = 0;

  if (!scenario?.interactableObjects) {
    console.log('No scenario or interactable objects defined');
    return;
  }

  const targetNames = scenario.interactableObjects;
  console.log(`Highlighting objects for: ${scenario.title}`);

  if (!allInteractableMeshes?.length) {
    console.warn('No interactable meshes found');
    return;
  }

  allInteractableMeshes.forEach(mesh => {
    const meshName = mesh.name || mesh.id;
    const parentName = mesh.parent?.name || null;

    const isMatched = targetNames.some(targetName => {
      if (meshName === targetName) return true;
      if (meshName.startsWith(targetName + '_') || 
          meshName.startsWith(targetName + '-')) return true;
      if (meshName.includes(targetName)) return true;
      if (parentName === targetName) return true;
      return false;
    });

    if (isMatched) {
      permanentHighlightedMeshes.push(mesh);
      console.log(`Highlighted: ${meshName}`);
    }
  });
}

// ============================================================================
// SCENE CREATION
// ============================================================================

/**
 * Creates and initializes the 3D scene
 * @param {BABYLON.Engine} engine - Babylon engine
 * @param {HTMLCanvasElement} canvas - Render canvas
 * @returns {Promise<BABYLON.Scene>} Created scene
 */
export async function createScene(engine, canvas) {
  console.log('Creating scene...');

  // Create scene
  const scene = new BABYLON.Scene(engine);
  scene.clearColor = new BABYLON.Color3(0.99, 0.99, 1.0);
  scene.collisionsEnabled = true;
  scene.gravity = SCENE_CONFIG.GRAVITY;

  // Create camera
  const camera = createCamera(scene, canvas);

  // Create lighting
  createLighting(scene);

  // Load 3D model
  const meshes = await loadModel(scene);

  // Initialize highlight layer
  highlightLayer = new BABYLON.HighlightLayer('interactableHL', scene, 
    SCENE_CONFIG.HIGHLIGHT_CONFIG);
  highlightLayer.outerGlow = true;
  highlightLayer.innerGlow = true;

  // Setup meshes
  setupMeshes(meshes, scene);

  // Setup animation loop
  setupAnimationLoop(scene);

  // Setup camera spawn position
  setupCameraSpawn(scene, camera);

  // Setup debugging utilities
  setupDebugUtilities(scene);

  // Attach rendering layer references to scene for use by modules like TutorialManager
  // This allows controlled access to rendering layer internals without direct imports
  scene._renderingLayer = {
    allInteractableMeshes,
    permanentHighlightedMeshes,
    highlightLayer,
    setCurrentHoveredMesh,
    clearCurrentHoveredMesh,
    updateScenarioHighlights,
    camera,
    canvas
  };

  console.log('Scene created successfully');
  return scene;
}

// ============================================================================
// SCENE COMPONENT SETUP
// ============================================================================

/**
 * Creates and configures the camera
 */
function createCamera(scene, canvas) {
  const camera = new BABYLON.UniversalCamera(
    'UniversalCamera',
    SCENE_CONFIG.CAMERA_START_POS,
    scene
  );

  camera.setTarget(SCENE_CONFIG.CAMERA_TARGET_POS);
  camera.attachControl(canvas, true);
  camera.ellipsoid = SCENE_CONFIG.ELLIPSOID;
  camera.checkCollisions = true;
  camera.applyGravity = true;
  camera.speed = SCENE_CONFIG.CAMERA_SPEED;
  camera.angularSensibility = SCENE_CONFIG.CAMERA_SENSITIVITY;
  camera.keysUp.push(87); // W
  camera.keysDown.push(83); // S
  camera.keysLeft.push(65); // A
  camera.keysRight.push(68); // D
  camera.minZ = 0.05;

  // Pointer lock on click - but respect pointer lock disable flag
  canvas.addEventListener('click', () => {
    if (!window._disablePointerLock) {
      canvas.requestPointerLock?.({ unadjustedMovement: true });
      canvas.focus();
    }
  });

  console.log('Camera created');
  return camera;
}

/**
 * Creates and configures lighting
 */
function createLighting(scene) {
  const ambient = new BABYLON.HemisphericLight(
    'hemi',
    new BABYLON.Vector3(0, 1, 0),
    scene
  );
  ambient.intensity = SCENE_CONFIG.AMBIENT_INTENSITY;

  console.log('Lighting created');
}

/**
 * Loads 3D model from file
 */
async function loadModel(scene) {
  try {
    console.log(`Loading model: ${SCENE_CONFIG.DEFAULT_MODEL}...`);

    const { meshes } = await BABYLON.SceneLoader.ImportMeshAsync(
      '',
      SCENE_CONFIG.MODEL_PATH,
      SCENE_CONFIG.DEFAULT_MODEL,
      scene
    );

    await scene.whenReadyAsync();
    console.log(`Loaded ${meshes.length} meshes`);

    return meshes;

  } catch (error) {
    console.error('Model loading failed:', error);
    throw error;
  }
}

/**
 * Sets up mesh properties and collision
 */
function setupMeshes(meshes, scene) {
  console.log('Setting up meshes...');

  allInteractableMeshes = [];

  for (const mesh of meshes) {
    // Collision setup
    mesh.checkCollisions = true;
    const hasCollisionMetadata = mesh.metadata?.gltf?.extras?.hasCollision;
    if (typeof hasCollisionMetadata === 'boolean') {
      mesh.checkCollisions = hasCollisionMetadata;
    }

    // Picking setup
    if (mesh.getTotalVertices?.() > 0) {
      mesh.isPickable = true;
    }

    mesh.computeWorldMatrix(true);
    mesh.refreshBoundingInfo(true);

    // Add to interactable list
    if (mesh.isPickable && mesh.getTotalVertices?.() > 0 && !mesh.name.startsWith('__')) {
      allInteractableMeshes.push(mesh);
    }
  }

  console.log(`Setup complete: ${allInteractableMeshes.length} interactable meshes`);
}

/**
 * Sets up the animation loop for pulsing highlights
 */
function setupAnimationLoop(scene) {
  let pulseTime = 0;

  scene.registerBeforeRender(() => {
    if (!permanentHighlightedMeshes?.length) return;

    pulseTime += HIGHLIGHT_COLOR.PULSE_SPEED;
    const pulseIntensity = HIGHLIGHT_COLOR.PULSE_BASE + 
      Math.sin(pulseTime) * HIGHLIGHT_COLOR.PULSE_RANGE;

    permanentHighlightedMeshes.forEach(mesh => {
      // Skip currently hovered mesh (has direct hover effect)
      if (mesh === currentHoveredMesh) return;

      highlightLayer.removeMesh(mesh);
      const color = new BABYLON.Color3(
        0.4 * pulseIntensity,
        0.6 * pulseIntensity,
        pulseIntensity
      );
      highlightLayer.addMesh(mesh, color);
    });
  });

  console.log('Animation loop setup');
}

/**
 * Sets up camera spawn position
 */
function setupCameraSpawn(scene, camera) {
  const spawn =
    scene.getTransformNodeByName('Spawn') ||
    scene.getTransformNodeByName('PlayerSpawn') ||
    scene.getMeshByName('Spawn') ||
    scene.getMeshByName('PlayerSpawn');

  if (spawn) {
    camera.position.copyFrom(spawn.getAbsolutePosition().add(new BABYLON.Vector3(0, 0.6, 0)));
    console.log('Camera spawned at designated point');
    return;
  }

  // Fallback: place above scene
  const { min, max, center } = getSceneBounds(scene);
  const rayStart = new BABYLON.Vector3(center.x, max.y + 20, center.z);
  const ray = new BABYLON.Ray(rayStart, new BABYLON.Vector3(0, -1, 0), (max.y - min.y) + 100);
  const hit = scene.pickWithRay(ray, m => m.isEnabled() && m.getTotalVertices?.() > 0);

  if (hit?.pickedPoint) {
    camera.position.copyFrom(hit.pickedPoint.add(new BABYLON.Vector3(0, 1.75, 0)));
  } else {
    camera.position = new BABYLON.Vector3(center.x, max.y + 2, center.z);
  }

  console.log('Camera spawn setup complete');
}

// ============================================================================
// DEBUG UTILITIES
// ============================================================================

/**
 * Sets up debugging utilities
 */
function setupDebugUtilities(scene) {
  window.respawn = () => safeRespawn(scene, scene.activeCamera);

  // List interactable objects
  window.listInteractableObjects = () => listInteractableObjectsDebug(scene);

  console.log('Debug utilities installed');
  console.log('Tips: Press Alt+Shift+R to respawn, call window.listInteractableObjects() for debug info');
}

/**
 * Respawns the camera at a safe position
 */
export function safeRespawn(scene, camera) {
  const spawn =
    scene.getTransformNodeByName('Spawn') ||
    scene.getTransformNodeByName('PlayerSpawn') ||
    scene.getMeshByName('Spawn') ||
    scene.getMeshByName('PlayerSpawn');

  if (spawn) {
    camera.position.copyFrom(spawn.getAbsolutePosition().add(new BABYLON.Vector3(0, 0.6, 0)));
    console.log('Respawned at designated spawn point');
    return;
  }

  const { min, max, center } = getSceneBounds(scene);
  const rayStart = new BABYLON.Vector3(center.x, max.y + 20, center.z);
  const ray = new BABYLON.Ray(rayStart, new BABYLON.Vector3(0, -1, 0), (max.y - min.y) + 100);
  const hit = scene.pickWithRay(ray, m => m.isEnabled() && m.getTotalVertices?.() > 0);

  const targetPos = hit?.pickedPoint || rayStart;
  camera.position.copyFrom(targetPos.add(new BABYLON.Vector3(0, 1.75, 0)));
  console.log('Respawned at fallback position');
}

/**
 * Lists all interactable objects (debug utility)
 */
function listInteractableObjectsDebug(scene) {
  console.log('\n=== INTERACTABLE OBJECTS ===');

  const allMeshes = scene.meshes.filter(m =>
    m.isPickable && m.getTotalVertices?.() > 0 && !m.name.startsWith('__')
  );

  console.log(`Total meshes: ${allMeshes.length}`);
  allMeshes.forEach((mesh, i) => {
    const icon = mesh.metadata?.interactable === true ? '   ' : '   ';
    console.log(`${icon} ${i + 1}. "${mesh.name}" (id: ${mesh.id})`);
  });

  if (permanentHighlightedMeshes?.length) {
    console.log('\nCurrently highlighted:');
    permanentHighlightedMeshes.forEach(m => console.log(`  - ${m.name}`));
  }

  const scenario = currentScenarioData;
  if (scenario?.interactableObjects) {
    console.log('\nScenario objects:');
    scenario.interactableObjects.forEach(name => console.log(`  - ${name}`));
  }

  console.log('===========================\n');
}

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Gets the bounding box of all scene meshes
 */
function getSceneBounds(scene) {
  let min = new BABYLON.Vector3(+Infinity, +Infinity, +Infinity);
  let max = new BABYLON.Vector3(-Infinity, -Infinity, -Infinity);

  for (const mesh of scene.meshes) {
    if (!mesh.isVisible || !mesh.getBoundingInfo) continue;
    const bb = mesh.getBoundingInfo().boundingBox;
    min = BABYLON.Vector3.Minimize(min, bb.minimumWorld);
    max = BABYLON.Vector3.Maximize(max, bb.maximumWorld);
  }

  const center = min.add(max).scale(0.5);
  return { min, max, center };
}

// ============================================================================
// EVENT LISTENERS - Rendering Layer listens to Logic Layer state changes
// ============================================================================

/**
 * Listen for scenario changes from the Logic Layer
 * When a new scenario is loaded, update local scenario data
 */
eventBus.on(Events.SCENARIO_CHANGED, (data) => {
  // Event data has structure: { scenarioId, scenario }
  // We need to extract the actual scenario object
  currentScenarioData = data.scenario || data;
  console.log(`[Scene] Scenario changed: ${currentScenarioData.title}`);
  updateScenarioHighlights();
});

console.log('Scene module loaded');
