/**
 * Task routes
 * * POST /api/tasks/:taskId/submit - Submit task answer
 * * All validation and scoring happens server-side. Never accepts scores from client.
 */

import express from 'express';
import { getDb } from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCENARIOS_PATH = join(__dirname, '../../data/scenarios.json');

// Load scenarios data
let scenariosData = null;
// Create a task lookup map for O(1) access instead of O(n) search
let taskLookupMap = null;

function loadScenariosData() {
  try {
    scenariosData = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf-8'));

    // Build task lookup map: taskId -> { task, scenarioCode }
    taskLookupMap = new Map();
    for (const [code, scenario] of Object.entries(scenariosData)) {
      if (scenario.tasks) {
        for (const task of scenario.tasks) {
          if (task.id) {
            taskLookupMap.set(task.id, { task, scenarioCode: code });
          }
        }
      }
    }

    console.log(`Loaded ${taskLookupMap.size} tasks into lookup map`);
  } catch (error) {
    console.error('Error loading scenarios:', error);
  }
}

// Load on module initialization
loadScenariosData();

/**
 * Submit task answer
 * POST /api/tasks/:taskId/submit
 * Body: { answer, timeMs? }
 */
router.post('/:taskId/submit', authenticate, async (req, res) => {
  try {
    const { taskId } = req.params;
    const { answer, timeMs } = req.body;
    const userId = req.user.id || req.user.userId;

    if (!answer) {
      return res.status(400).json({ error: 'Answer is required' });
    }

    // Find task in scenarios data
    let task = null;
    let scenarioCode = null;

    if (scenariosData) {
      for (const [code, scenario] of Object.entries(scenariosData)) {
        if (scenario.tasks) {
          const found = scenario.tasks.find(t => t.id === taskId);
          if (found) {
            task = found;
            scenarioCode = code;
            break;
          }
        }
      }
    }

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    // Check if already completed
    const db = getDb();

    // Get scenario and task from DB (or create if not exists)
    let scenarioRow = await db.get('SELECT id FROM scenarios WHERE code = ?', scenarioCode);
    if (!scenarioRow) {
      const scenario = scenariosData[scenarioCode];
      await db.run(`
        INSERT INTO scenarios (code, title, description)
        VALUES (?, ?, ?)
      `, scenarioCode, scenario.title || scenarioCode, scenario.description || '');
      scenarioRow = await db.get('SELECT id FROM scenarios WHERE code = ?', scenarioCode);
    }

    let taskRow = await db.get('SELECT id FROM tasks WHERE code = ? AND scenario_id = ?', taskId, scenarioRow.id);
    if (!taskRow) {
      // Create task in DB (without solution - we'll validate from scenarios.json)
      await db.run(`
        INSERT INTO tasks (scenario_id, code, title, description, max_score, solution_type, solution_value)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        scenarioRow.id,
        taskId,
        task.title || taskId,
        task.details || '',
        task.points || 0,
        'string', // Default type
        '' // We don't store solution in DB, validate from scenarios.json
      );
      taskRow = await db.get('SELECT id FROM tasks WHERE code = ? AND scenario_id = ?', taskId, scenarioRow.id);
    }

    // Check if already completed
    const existing = await db.get(`
      SELECT score_awarded FROM task_completions 
      WHERE user_id = ? AND task_id = ?
    `, userId, taskRow.id);

    if (existing) {
      // Already completed - return existing score
      const taskScoreResult = await db.get(`
        SELECT COALESCE(SUM(score_awarded), 0) AS total 
        FROM task_completions WHERE user_id = ?
      `, userId);
      const badgePointsResult = await db.get(`
        SELECT COALESCE(SUM(points_awarded), 0) AS total 
        FROM badge_points_awarded WHERE user_id = ?
      `, userId);
      const totalScore = taskScoreResult.total + badgePointsResult.total;

      return res.json({
        success: true,
        correct: true,
        alreadyCompleted: true,
        scoreAwarded: existing.score_awarded,
        newTotalScore: totalScore,
        badgesUnlocked: [],
        pointsAwarded: 0
      });
    }

    // Validate answer server-side
    const validation = validateAnswer(task, answer);

    // Calculate score (server-side only, never trust client)
    const scoreAwarded = validation.correct ? (task.points || 0) : 0;

    // Record completion
    if (validation.correct) {
      await db.run(`
        INSERT INTO task_completions (user_id, task_id, score_awarded, time_ms)
        VALUES (?, ?, ?, ?)
      `, userId, taskRow.id, scoreAwarded, timeMs || null);
    }

    // Get task completion score total
    const taskScoreResult = await db.get(`
      SELECT COALESCE(SUM(score_awarded), 0) AS total 
      FROM task_completions WHERE user_id = ?
    `, userId);
    const taskScoreTotal = taskScoreResult.total;

    // Get badge points total
    const badgePointsResult = await db.get(`
      SELECT COALESCE(SUM(points_awarded), 0) AS total 
      FROM badge_points_awarded WHERE user_id = ?
    `, userId);
    const badgePointsTotal = badgePointsResult.total;

    // Calculate new total score (tasks + badges)
    const newTotalScore = taskScoreTotal + badgePointsTotal;

    // Check for badge awards (if scenario completed)
    const badgesUnlocked = [];
    let pointsAwardedFromBadges = 0;

    if (validation.correct) {
      // Check if all tasks in scenario are completed
      const scenario = scenariosData[scenarioCode];
      const allTasks = scenario.tasks || [];
      const completedCountResult = await db.get(`
        SELECT COUNT(DISTINCT tc.task_id) AS count
        FROM task_completions tc
        JOIN tasks t ON tc.task_id = t.id
        WHERE tc.user_id = ? AND t.scenario_id = ?
      `, userId, scenarioRow.id);
      const completedCount = completedCountResult.count;

      if (completedCount === allTasks.length) {
        // Scenario completed - check for scenario badge and skill badges
        const scenarioBadgeResult = await awardScenarioBadge(db, userId, scenario, scenarioCode);
        if (scenarioBadgeResult) {
          badgesUnlocked.push(scenarioBadgeResult.badgeCode);
          pointsAwardedFromBadges += scenarioBadgeResult.points;
        }

        // Check for skill badges
        const skillBadgesResult = await checkAndAwardSkillBadges(db, userId, scenarioCode, scenarioRow.id);
        for (const skillBadge of skillBadgesResult) {
          badgesUnlocked.push(skillBadge.badgeCode);
          pointsAwardedFromBadges += skillBadge.points;
        }
      }
    }

    // Recalculate total score if badges were awarded
    if (pointsAwardedFromBadges > 0) {
      const updatedBadgePointsResult = await db.get(`
        SELECT COALESCE(SUM(points_awarded), 0) AS total 
        FROM badge_points_awarded WHERE user_id = ?
      `, userId);
      const updatedTaskScoreResult = await db.get(`
        SELECT COALESCE(SUM(score_awarded), 0) AS total 
        FROM task_completions WHERE user_id = ?
      `, userId);
      const finalTotalScore = updatedTaskScoreResult.total + updatedBadgePointsResult.total;

      res.json({
        success: true,
        correct: validation.correct,
        scoreAwarded,
        newTotalScore: finalTotalScore,
        badgesUnlocked,
        pointsAwarded: pointsAwardedFromBadges
      });
    } else {
      res.json({
        success: true,
        correct: validation.correct,
        scoreAwarded,
        newTotalScore: newTotalScore,
        badgesUnlocked,
        pointsAwarded: 0
      });
    }
  } catch (error) {
    console.error('Task submission error:', error);
    res.status(500).json({ error: 'Task submission failed' });
  }
});

/**
 * Award scenario badge and points
 * @param {import('sqlite').Database} db - Database instance
 * @param {number} userId - User ID
 * @param {Object} scenario - Scenario data
 * @param {string} scenarioCode - Scenario code
 * @returns {Object|null} Badge award result or null if already awarded
 */
async function awardScenarioBadge(db, userId, scenario, scenarioCode) {
  if (!scenario.badge) {
    return null;
  }

  // Get or create badge
  let badgeRow = await db.get('SELECT id, badge_points FROM badges WHERE code = ?', scenario.badge);
  if (!badgeRow) {
    await db.run(`
      INSERT INTO badges (code, name, description, badge_points)
      VALUES (?, ?, ?, ?)
    `, scenario.badge, scenario.badge, `Completed ${scenario.title}`, 20);
    badgeRow = await db.get('SELECT id, badge_points FROM badges WHERE code = ?', scenario.badge);
  }

  // Check if user already has badge
  const hasBadge = await db.get(`
    SELECT 1 FROM user_badges 
    WHERE user_id = ? AND badge_id = ?
  `, userId, badgeRow.id);

  if (hasBadge) {
    return null; // Already awarded
  }

  // Award badge
  await db.run(`
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (?, ?)
  `, userId, badgeRow.id);

  // Award points
  const points = badgeRow.badge_points || 20;
  await db.run(`
    INSERT INTO badge_points_awarded (user_id, badge_id, points_awarded)
    VALUES (?, ?, ?)
  `, userId, badgeRow.id, points);

  return {
    badgeCode: scenario.badge,
    points: points
  };
}

/**
 * Check and award skill badges for a completed scenario
 * @param {import('sqlite').Database} db - Database instance
 * @param {number} userId - User ID
 * @param {string} scenarioCode - Scenario code
 * @param {number} scenarioId - Scenario database ID
 * @returns {Array} Array of awarded skill badges
 */
async function checkAndAwardSkillBadges(db, userId, scenarioCode, scenarioId) {
  const awardedBadges = [];

  // Check Speed Runner badge (complete scenario in under 30 minutes)
  const speedRunnerResult = await checkSpeedRunnerBadge(db, userId, scenarioId);
  if (speedRunnerResult) {
    awardedBadges.push(speedRunnerResult);
  }

  // Check Hint-Free Expert badge (complete scenario with 0 hints)
  const hintFreeResult = await checkHintFreeExpertBadge(db, userId, scenarioCode);
  if (hintFreeResult) {
    awardedBadges.push(hintFreeResult);
  }

  return awardedBadges;
}

/**
 * Check if user qualifies for Speed Runner badge
 * @param {import('sqlite').Database} db - Database instance
 * @param {number} userId - User ID
 * @param {number} scenarioId - Scenario database ID
 * @returns {Object|null} Badge award result or null
 */
async function checkSpeedRunnerBadge(db, userId, scenarioId) {
  const SPEED_RUNNER_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

  // Get all task completion times for this scenario
  const completions = await db.all(`
    SELECT time_ms
    FROM task_completions tc
    JOIN tasks t ON tc.task_id = t.id
    WHERE tc.user_id = ? AND t.scenario_id = ? AND tc.time_ms IS NOT NULL
    ORDER BY tc.completed_at ASC
  `, userId, scenarioId);

  if (completions.length === 0) {
    return null;
  }

  // Calculate total time (sum of all task times)
  const totalTime = completions.reduce((sum, c) => sum + (c.time_ms || 0), 0);

  if (totalTime > SPEED_RUNNER_THRESHOLD_MS) {
    return null; // Too slow
  }

  // Check if user already has this badge
  const badgeRow = await db.get('SELECT id, badge_points FROM badges WHERE code = ?', 'Speed Runner');
  if (!badgeRow) {
    return null; // Badge not defined
  }

  const hasBadge = await db.get(`
    SELECT 1 FROM user_badges 
    WHERE user_id = ? AND badge_id = ?
  `, userId, badgeRow.id);

  if (hasBadge) {
    return null; // Already awarded
  }

  // Award badge and points
  await db.run(`
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (?, ?)
  `, userId, badgeRow.id);

  const points = badgeRow.badge_points || 30;
  await db.run(`
    INSERT INTO badge_points_awarded (user_id, badge_id, points_awarded)
    VALUES (?, ?, ?)
  `, userId, badgeRow.id, points);

  return {
    badgeCode: 'Speed Runner',
    points: points
  };
}

/**
 * Check if user qualifies for Hint-Free Expert badge
 * @param {import('sqlite').Database} db - Database instance
 * @param {number} userId - User ID
 * @param {string} scenarioCode - Scenario code
 * @returns {Object|null} Badge award result or null
 */
async function checkHintFreeExpertBadge(db, userId, scenarioCode) {
  // Get user stats
  let userStats = await db.get('SELECT scenario_hints_used FROM user_stats WHERE user_id = ?', userId);

  if (!userStats) {
    // No stats means no hints used - create stats record
    await db.run(`
      INSERT INTO user_stats (user_id, hints_used_count, scenario_hints_used)
      VALUES (?, 0, '{}')
    `, userId);
    userStats = { scenario_hints_used: '{}' };
  }

  // Parse scenario hints used
  let scenarioHints = {};
  try {
    scenarioHints = JSON.parse(userStats.scenario_hints_used || '{}');
  } catch (e) {
    scenarioHints = {};
  }

  // Check if hints were used for this scenario
  const hintsUsed = scenarioHints[scenarioCode] || 0;
  if (hintsUsed > 0) {
    return null; // Hints were used
  }

  // Check if user already has this badge
  const badgeRow = await db.get('SELECT id, badge_points FROM badges WHERE code = ?', 'Hint-Free Expert');
  if (!badgeRow) {
    return null; // Badge not defined
  }

  const hasBadge = await db.get(`
    SELECT 1 FROM user_badges 
    WHERE user_id = ? AND badge_id = ?
  `, userId, badgeRow.id);

  if (hasBadge) {
    return null; // Already awarded
  }

  // Award badge and points
  await db.run(`
    INSERT INTO user_badges (user_id, badge_id)
    VALUES (?, ?)
  `, userId, badgeRow.id);

  const points = badgeRow.badge_points || 30;
  await db.run(`
    INSERT INTO badge_points_awarded (user_id, badge_id, points_awarded)
    VALUES (?, ?, ?)
  `, userId, badgeRow.id, points);

  return {
    badgeCode: 'Hint-Free Expert',
    points: points
  };
}

/**
 * Track hint usage for a user and scenario
 * @param {import('sqlite').Database} db - Database instance
 * @param {number} userId - User ID
 * @param {string} scenarioCode - Scenario code
 */
async function trackHintUsage(db, userId, scenarioCode) {
  // Get or create user stats
  let userStats = await db.get('SELECT hints_used_count, scenario_hints_used FROM user_stats WHERE user_id = ?', userId);

  if (!userStats) {
    // Create new stats record
    await db.run(`
      INSERT INTO user_stats (user_id, hints_used_count, scenario_hints_used)
      VALUES (?, 1, ?)
    `, userId, JSON.stringify({ [scenarioCode]: 1 }));
    return;
  }

  // Parse and update scenario hints
  let scenarioHints = {};
  try {
    scenarioHints = JSON.parse(userStats.scenario_hints_used || '{}');
  } catch (e) {
    scenarioHints = {};
  }

  // Increment hint count for this scenario
  scenarioHints[scenarioCode] = (scenarioHints[scenarioCode] || 0) + 1;

  // Update database
  await db.run(`
    UPDATE user_stats 
    SET hints_used_count = hints_used_count + 1,
        scenario_hints_used = ?
    WHERE user_id = ?
  `, JSON.stringify(scenarioHints), userId);
}

/**
 * Parse command line arguments respecting quotes
 * @param {string} input - Command string to parse
 * @returns {Array<string>} Array of command and arguments
 */
function parseCommandArgs(input) {
  const args = [];
  let current = '';
  let inQuote = false;
  let quoteChar = '';

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if ((char === '"' || char === "'") && (!inQuote || quoteChar === char)) {
      if (inQuote && quoteChar === char) {
        // Closing quote
        inQuote = false;
        quoteChar = '';
      } else if (!inQuote) {
        // Opening quote
        inQuote = true;
        quoteChar = char;
      } else {
        current += char;
      }
    } else if (char === ' ' && !inQuote) {
      if (current) {
        args.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }

  if (current) {
    args.push(current);
  }

  return args;
}

/**
 * Validate answer against task requirements
 * This is where all validation logic lives - never exposed to client
 */
function validateAnswer(task, answer) {
  // Handle interaction-based tasks
  if (task.checkType === 'interaction' && task.interactionTarget) {
    // Answer format: "interaction:targetName"
    if (answer.startsWith('interaction:')) {
      const target = answer.substring('interaction:'.length);
      if (target === task.interactionTarget) {
        return { correct: true };
      }
    }
    return { correct: false };
  }

  // Handle console command tasks (checkType is null but checkCommand is set)
  if (task.checkCommand) {
    // Parse the answer into command and args
    const parsedArgs = parseCommandArgs(answer);
    if (parsedArgs.length === 0) {
      return { correct: false };
    }

    const cmd = parsedArgs[0];
    const args = parsedArgs.slice(1);

    // Check command matches
    if (cmd !== task.checkCommand) {
      return { correct: false };
    }

    // Check args if specified
    if (task.checkArgs && task.checkArgs.length > 0) {
      // Normalize paths for comparison (remove trailing slashes)
      const normalizedArgs = args.map(arg => arg.replace(/\/$/, ''));
      const normalizedExpected = task.checkArgs.map(arg => arg.replace(/\/$/, ''));

      if (normalizedArgs.length !== normalizedExpected.length) {
        return { correct: false };
      }

      // Check each arg matches
      for (let i = 0; i < normalizedArgs.length; i++) {
        if (normalizedArgs[i] !== normalizedExpected[i]) {
          return { correct: false };
        }
      }
    } else if (args.length > 0) {
      // Task expects no args but answer has args
      return { correct: false };
    }

    return { correct: true };
  }

  // Unknown task type
  return { correct: false };
}

/**
 * Get user's completed tasks and scenarios
 * GET /api/tasks/completions
 */
router.get('/completions', authenticate, async (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id || req.user.userId;

    // Get all completed tasks with scenario info
    const completions = await db.all(`
      SELECT 
        t.code AS task_code,
        s.code AS scenario_code,
        tc.score_awarded,
        tc.completed_at
      FROM task_completions tc
      JOIN tasks t ON tc.task_id = t.id
      JOIN scenarios s ON t.scenario_id = s.id
      WHERE tc.user_id = ?
      ORDER BY tc.completed_at ASC
    `, userId);

    // Group by scenario to determine completed scenarios
    const scenarioTaskCounts = {};
    const completedTasks = [];

    for (const completion of completions) {
      completedTasks.push({
        taskCode: completion.task_code,
        scenarioCode: completion.scenario_code,
        scoreAwarded: completion.score_awarded,
        completedAt: completion.completed_at
      });

      if (!scenarioTaskCounts[completion.scenario_code]) {
        scenarioTaskCounts[completion.scenario_code] = 0;
      }
      scenarioTaskCounts[completion.scenario_code]++;
    }

    // Determine which scenarios are fully completed
    const completedScenarios = [];
    if (scenariosData) {
      for (const [scenarioCode, scenario] of Object.entries(scenariosData)) {
        const taskCount = scenario.tasks?.length || 0;
        const completedCount = scenarioTaskCounts[scenarioCode] || 0;
        if (taskCount > 0 && completedCount === taskCount) {
          completedScenarios.push(scenarioCode);
        }
      }
    }

    res.json({
      completedTasks,
      completedScenarios,
      taskCounts: scenarioTaskCounts
    });
  } catch (error) {
    console.error('Get completions error:', error);
    res.status(500).json({ error: 'Failed to get completions' });
  }
});

/**
 * Get hint for a specific task
 * GET /api/tasks/:taskId/hint
 * Requires authentication and verifies user has enough points
 * Note: Points are deducted client-side after hint is fetched
 */
router.get('/:taskId/hint', authenticate, async (req, res) => {
  const startTime = Date.now();
  try {
    const { taskId } = req.params;
    const userId = req.user.userId;

    if (!scenariosData || !taskLookupMap) {
      return res.status(500).json({ error: 'Scenarios data not loaded' });
    }

    // Fast O(1) lookup instead of O(n) search
    const taskInfo = taskLookupMap.get(taskId);
    if (!taskInfo) {
      return res.status(404).json({ error: 'Task not found' });
    }

    const { task } = taskInfo;

    // Check if task has a hint
    if (!task.hint) {
      return res.status(404).json({ error: 'No hint available for this task' });
    }

    const hintCost = task.hintCost || 0;
    const db = getDb();

    // Only check points if hint costs something
    // For free hints, skip the database query
    if (hintCost > 0) {
      // Get user's current points from database (tasks + badges)
      const queryStart = Date.now();
      const taskScoreResult = await db.get(`
        SELECT COALESCE(SUM(score_awarded), 0) AS total 
        FROM task_completions WHERE user_id = ?
      `, userId);
      const badgePointsResult = await db.get(`
        SELECT COALESCE(SUM(points_awarded), 0) AS total 
        FROM badge_points_awarded WHERE user_id = ?
      `, userId);
      const queryTime = Date.now() - queryStart;

      if (queryTime > 100) {
        console.warn(`[Hint] Slow points query: ${queryTime}ms for user ${userId}`);
      }

      const currentPoints = taskScoreResult.total + badgePointsResult.total;

      // Check if user has enough points
      if (currentPoints < hintCost) {
        return res.status(400).json({
          error: 'Insufficient points',
          required: hintCost,
          current: currentPoints
        });
      }
    }

    // Track hint usage server-side
    await trackHintUsage(db, userId, taskInfo.scenarioCode);

    // Return the hint
    // Note: Client will deduct points after receiving the hint
    // This ensures the user only pays if they successfully receive the hint
    const totalTime = Date.now() - startTime;
    if (totalTime > 500) {
      console.warn(`[Hint] Slow hint request: ${totalTime}ms for task ${taskId}`);
    }

    res.json({
      hint: task.hint,
      hintCost: hintCost
    });
  } catch (error) {
    console.error('Get hint error:', error);
    res.status(500).json({ error: 'Failed to get hint' });
  }
});

export { router as taskRoutes, loadScenariosData };