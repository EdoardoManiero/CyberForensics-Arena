/**
 * Leaderboard routes
 * * GET /api/leaderboard - Get leaderboard (users ordered by total score)
 * 
 * See: theory/leaderboard-caching.md for detailed explanation of caching strategy
 */

import express from 'express';
import { getDb } from '../db/db.js';

const router = express.Router();

// ============================================================================
// LEADERBOARD CACHE
// ============================================================================
// Cache leaderboard results to reduce database load
// With 60 users refreshing, this reduces queries from 60/min to ~6/min

const cache = {
  data: null,
  timestamp: 0
};

const CACHE_TTL = 10000; // 10 seconds - scores don't change that frequently

/**
 * Get leaderboard
 * GET /api/leaderboard
 * Returns users ordered by total score (task_completions.score_awarded + badge_points_awarded.points_awarded)
 */
router.get('/', async (req, res) => {
  try {
    const now = Date.now();

    // Return cached data if still valid
    if (cache.data && (now - cache.timestamp) < CACHE_TTL) {
      return res.json(cache.data);
    }

    // Cache miss - query database
    const db = getDb();

    // Get users with their total scores (tasks + badges)
    // Use subqueries to avoid double counting with JOINs
    const leaderboard = await db.all(`
      SELECT 
        u.id,
        u.display_name AS displayName,
        COALESCE((
          SELECT SUM(score_awarded) FROM task_completions WHERE user_id = u.id
        ), 0) + COALESCE((
          SELECT SUM(points_awarded) FROM badge_points_awarded WHERE user_id = u.id
        ), 0) AS totalScore,
        COALESCE((
          SELECT COUNT(*) FROM task_completions WHERE user_id = u.id
        ), 0) AS tasksCompleted
      FROM users u
      ORDER BY totalScore DESC, tasksCompleted DESC, u.display_name ASC
      LIMIT 100
    `);

    // Update cache
    cache.data = leaderboard;
    cache.timestamp = now;

    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * Invalidate leaderboard cache
 * Call this function when scores change (optional optimization)
 */
export function invalidateLeaderboardCache() {
  cache.data = null;
  cache.timestamp = 0;
}

export { router as leaderboardRoutes };