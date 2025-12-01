/**
 * Scenarios routes
 * 
 * GET /api/scenarios - Get all scenarios and tasks (public metadata only)
 * 
 * NOTE: Never returns solution_value or internal scoring logic.
 * 
 * See: theory/scenarios-caching-blocking-io.md for caching strategy explanation
 */

import express from 'express';
import { readFileSync, existsSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { loadScenariosData } from './tasks.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to scenarios JSON (server-side, not public)
// From server/src/routes/scenarios.js -> go up to server/ -> data/scenarios.json
const SCENARIOS_PATH = join(__dirname, '../../data/scenarios.json');

// ============================================================================
// SCENARIOS CACHE
// ============================================================================
// Cache processed scenarios to avoid:
// 1. Blocking disk I/O on every request (readFileSync blocks event loop)
// 2. Redundant JSON parsing and filtering on identical data
// 
// Cache is invalidated when scenarios are saved via POST

let publicScenariosCache = null;

/**
 * Process raw scenarios data into public format (filters out hints/solutions)
 * @param {Object} scenariosData - Raw scenarios from JSON file
 * @returns {Object} Public scenarios keyed by ID
 */
function processScenarios(scenariosData) {
  const publicScenarios = Object.keys(scenariosData)
    .filter(key => !key.startsWith('_'))
    .map(key => {
      const scenario = scenariosData[key];

      // Build scenario object with all needed fields
      const publicScenario = {
        id: key,
        title: scenario.title || key,
        description: scenario.description || '',
        introduction: scenario.introduction || '',
        badge: scenario.badge || null,
        interactableObjects: scenario.interactableObjects || [],
        customCommands: scenario.customCommands || [],
        tasks: (scenario.tasks || []).map(task => {
          // Build task object with all needed fields
          // NOTE: We exclude hints - they should be fetched separately when user requests them
          const publicTask = {
            id: task.id,
            title: task.title || '',
            details: task.details || '',
            points: task.points || 0,
            checkType: task.checkType || null,
            interactionTarget: task.interactionTarget || null,
            onInteract: task.onInteract || null,
            hintCost: task.hintCost || 0,
            hasHint: !!(task.hint && task.hint.trim() !== ''),
            checkCommand: task.checkCommand || null,
            checkArgs: task.checkArgs || null,
          };
          return publicTask;
        })
      };

      return publicScenario;
    });

  // Return as object keyed by scenario ID
  const result = {};
  publicScenarios.forEach(scenario => {
    result[scenario.id] = scenario;
  });

  return result;
}

/**
 * Get all scenarios and tasks (full data excluding solutions and hints)
 * GET /api/scenarios
 * 
 * Returns full scenario data needed by client (onInteract, mountContent, customCommands, etc.)
 * but excludes solution-related fields and hints (hints are fetched separately via /api/tasks/:taskId/hint)
 */
router.get('/', (req, res) => {
  try {
    // Return cached data if available
    if (publicScenariosCache) {
      return res.json(publicScenariosCache);
    }

    // Cache miss - load and process scenarios
    console.log('[Scenarios] Cache MISS - loading from disk:', SCENARIOS_PATH);

    // Check if file exists
    if (!existsSync(SCENARIOS_PATH)) {
      throw new Error(`Scenarios file not found at: ${SCENARIOS_PATH}`);
    }

    const scenariosData = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf-8'));

    // Process and cache the result
    publicScenariosCache = processScenarios(scenariosData);

    res.json(publicScenariosCache);
  } catch (error) {
    console.error('Error loading scenarios:', error);
    console.error('Error details:', {
      message: error.message,
      code: error.code,
      path: SCENARIOS_PATH,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Failed to load scenarios',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Save scenarios
 * POST /api/scenarios
 * Body: { scenarios: { ... } }
 */
router.post('/', express.json(), (req, res) => {
  try {
    const { scenarios } = req.body;

    if (!scenarios || typeof scenarios !== 'object') {
      return res.status(400).json({ error: 'Invalid scenarios data' });
    }

    // Write to file
    writeFileSync(SCENARIOS_PATH, JSON.stringify(scenarios, null, 2), 'utf-8');
    console.log('Scenarios saved to:', SCENARIOS_PATH);

    // INVALIDATE CACHE - critical for consistency
    publicScenariosCache = null;
    console.log('[Scenarios] Cache invalidated after save');

    // Trigger hot-reload of task data in tasks.js
    loadScenariosData();
    console.log('Triggered hot-reload of task data');

    res.json({ success: true, message: 'Scenarios saved successfully' });

  } catch (error) {
    console.error('Error saving scenarios:', error);
    res.status(500).json({ error: 'Failed to save scenarios' });
  }
});

/**
 * Manually invalidate scenarios cache
 * Useful if file is edited externally
 */
export function invalidateScenariosCache() {
  publicScenariosCache = null;
  console.log('[Scenarios] Cache manually invalidated');
}

export { router as scenarioRoutes };
