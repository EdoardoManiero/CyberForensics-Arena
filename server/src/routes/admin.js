/**
 * Admin Routes
 * 
 * Protected endpoints for admin users only.
 * Provides access to event logs, user statistics, and system data.
 * 
 * GET /api/admin/logs - Paginated event logs with filters
 * GET /api/admin/stats - Aggregated statistics
 * GET /api/admin/users - List all users with their stats
 */

import express from 'express';
import { getDb } from '../db/db.js';
import { requireAdmin } from '../middleware/auth.js';

const router = express.Router();

// Apply admin middleware to all routes
router.use(requireAdmin);

/**
 * Get paginated event logs
 * GET /api/admin/logs
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 50, max: 100)
 *   - eventType (optional filter)
 *   - scenarioCode (optional filter)
 *   - participantId (optional filter)
 *   - userId (optional filter)
 *   - startDate (optional filter, ISO string)
 *   - endDate (optional filter, ISO string)
 */
router.get('/logs', async (req, res) => {
  try {
    const db = getDb();
    
    // Parse query params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    
    // Build WHERE clause
    const conditions = [];
    const params = [];
    
    if (req.query.eventType) {
      conditions.push('event_type = ?');
      params.push(req.query.eventType);
    }
    
    if (req.query.scenarioCode) {
      conditions.push('scenario_code = ?');
      params.push(req.query.scenarioCode);
    }
    
    if (req.query.participantId) {
      conditions.push('participant_id = ?');
      params.push(req.query.participantId);
    }
    
    if (req.query.userId) {
      conditions.push('user_id = ?');
      params.push(parseInt(req.query.userId));
    }
    
    if (req.query.startDate) {
      conditions.push('created_at >= ?');
      params.push(req.query.startDate);
    }
    
    if (req.query.endDate) {
      conditions.push('created_at <= ?');
      params.push(req.query.endDate);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countResult = await db.get(
      `SELECT COUNT(*) as total FROM event_log ${whereClause}`,
      params
    );
    const total = countResult.total;
    
    // Get logs with user display name
    const logs = await db.all(`
      SELECT 
        el.id,
        el.participant_id,
        el.user_id,
        u.display_name as user_display_name,
        el.event_type,
        el.scenario_code,
        el.task_id,
        el.event_data,
        el.created_at
      FROM event_log el
      LEFT JOIN users u ON el.user_id = u.id
      ${whereClause}
      ORDER BY el.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    // Parse event_data JSON
    const parsedLogs = logs.map(log => ({
      ...log,
      event_data: log.event_data ? JSON.parse(log.event_data) : {}
    }));
    
    res.json({
      logs: parsedLogs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin logs error:', error);
    res.status(500).json({ error: 'Failed to fetch logs' });
  }
});

/**
 * Get aggregated statistics
 * GET /api/admin/stats
 */
router.get('/stats', async (req, res) => {
  try {
    const db = getDb();
    
    // Total users (excluding admins)
    const usersCount = await db.get(
      "SELECT COUNT(*) as total FROM users WHERE role = 'user'"
    );
    
    // Total admins
    const adminsCount = await db.get(
      "SELECT COUNT(*) as total FROM users WHERE role = 'admin'"
    );
    
    // Total events
    const eventsCount = await db.get(
      'SELECT COUNT(*) as total FROM event_log'
    );
    
    // Events by type
    const eventsByType = await db.all(`
      SELECT event_type, COUNT(*) as count
      FROM event_log
      GROUP BY event_type
      ORDER BY count DESC
    `);
    
    // Task completions
    const completionsCount = await db.get(
      'SELECT COUNT(*) as total FROM task_completions'
    );
    
    // Unique scenarios started (from event_log)
    const scenariosStarted = await db.get(`
      SELECT COUNT(DISTINCT scenario_code) as total
      FROM event_log
      WHERE event_type = 'scenario_start' AND scenario_code IS NOT NULL
    `);
    
    // Active users (users with at least one event in last 24 hours)
    const activeUsers = await db.get(`
      SELECT COUNT(DISTINCT user_id) as total
      FROM event_log
      WHERE user_id IS NOT NULL
      AND created_at >= datetime('now', '-1 day')
    `);
    
    // Commands executed
    const commandsCount = await db.get(`
      SELECT COUNT(*) as total
      FROM event_log
      WHERE event_type = 'command_execute'
    `);
    
    // Hints requested
    const hintsCount = await db.get(`
      SELECT COUNT(*) as total
      FROM event_log
      WHERE event_type = 'hint_request'
    `);
    
    // Recent activity (last 7 days, grouped by day)
    const recentActivity = await db.all(`
      SELECT 
        date(created_at) as date,
        COUNT(*) as events,
        COUNT(DISTINCT user_id) as users
      FROM event_log
      WHERE created_at >= datetime('now', '-7 days')
      GROUP BY date(created_at)
      ORDER BY date DESC
    `);
    
    res.json({
      users: {
        total: usersCount.total,
        admins: adminsCount.total,
        activeToday: activeUsers.total
      },
      events: {
        total: eventsCount.total,
        byType: eventsByType
      },
      tasks: {
        completions: completionsCount.total
      },
      scenarios: {
        uniqueStarted: scenariosStarted.total
      },
      commands: {
        total: commandsCount.total
      },
      hints: {
        total: hintsCount.total
      },
      recentActivity
    });
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

/**
 * Get all users with their statistics
 * GET /api/admin/users
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 50, max: 100)
 *   - role (optional filter: 'user' or 'admin')
 */
router.get('/users', async (req, res) => {
  try {
    const db = getDb();
    
    // Parse query params
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    const offset = (page - 1) * limit;
    
    // Build WHERE clause
    const conditions = [];
    const params = [];
    
    if (req.query.role) {
      conditions.push('u.role = ?');
      params.push(req.query.role);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get total count
    const countResult = await db.get(
      `SELECT COUNT(*) as total FROM users u ${whereClause}`,
      params
    );
    const total = countResult.total;
    
    // Get users with their stats
    const users = await db.all(`
      SELECT 
        u.id,
        u.email,
        u.display_name,
        u.role,
        u.tutorial_completed,
        u.created_at,
        COALESCE(tc.tasks_completed, 0) as tasks_completed,
        COALESCE(tc.total_score, 0) as total_score,
        COALESCE(el.event_count, 0) as event_count,
        el.last_activity
      FROM users u
      LEFT JOIN (
        SELECT 
          user_id,
          COUNT(*) as tasks_completed,
          SUM(score_awarded) as total_score
        FROM task_completions
        GROUP BY user_id
      ) tc ON u.id = tc.user_id
      LEFT JOIN (
        SELECT 
          user_id,
          COUNT(*) as event_count,
          MAX(created_at) as last_activity
        FROM event_log
        WHERE user_id IS NOT NULL
        GROUP BY user_id
      ) el ON u.id = el.user_id
      ${whereClause}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, limit, offset]);
    
    res.json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Admin users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

/**
 * Get detailed stats for a specific user
 * GET /api/admin/users/:userId/stats
 */
router.get('/users/:userId/stats', async (req, res) => {
  try {
    const db = getDb();
    const userId = parseInt(req.params.userId);
    
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    
    // Get user basic info
    const user = await db.get(`
      SELECT id, email, display_name, role, tutorial_completed, created_at
      FROM users WHERE id = ?
    `, userId);
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get task completions
    const taskStats = await db.get(`
      SELECT 
        COUNT(*) as tasks_completed,
        COALESCE(SUM(score_awarded), 0) as total_score,
        MIN(completed_at) as first_completion,
        MAX(completed_at) as last_completion
      FROM task_completions
      WHERE user_id = ?
    `, userId);
    
    // Get events count by type
    const eventsByType = await db.all(`
      SELECT event_type, COUNT(*) as count
      FROM event_log
      WHERE user_id = ?
      GROUP BY event_type
      ORDER BY count DESC
    `, userId);
    
    // Get total events
    const totalEvents = await db.get(`
      SELECT COUNT(*) as total FROM event_log WHERE user_id = ?
    `, userId);
    
    // Get commands executed
    const commandsStats = await db.get(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN json_extract(event_data, '$.hasError') = 1 THEN 1 ELSE 0 END) as failed
      FROM event_log
      WHERE user_id = ? AND event_type = 'command_execute'
    `, userId);
    
    // Get hints used
    const hintsUsed = await db.get(`
      SELECT COUNT(*) as total FROM event_log
      WHERE user_id = ? AND event_type = 'hint_request'
    `, userId);
    
    // Get scenarios played
    const scenariosPlayed = await db.all(`
      SELECT DISTINCT scenario_code
      FROM event_log
      WHERE user_id = ? AND scenario_code IS NOT NULL
      ORDER BY scenario_code
    `, userId);
    
    // Get badges earned
    const badges = await db.all(`
      SELECT b.code, b.name, b.badge_points, ub.awarded_at
      FROM user_badges ub
      JOIN badges b ON ub.badge_id = b.id
      WHERE ub.user_id = ?
      ORDER BY ub.awarded_at DESC
    `, userId);
    
    // Get recent activity (last 10 events)
    const recentActivity = await db.all(`
      SELECT event_type, scenario_code, event_data, created_at
      FROM event_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT 10
    `, userId);
    
    res.json({
      user: {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role,
        tutorialCompleted: user.tutorial_completed === 1,
        createdAt: user.created_at
      },
      stats: {
        tasks: {
          completed: taskStats.tasks_completed || 0,
          totalScore: taskStats.total_score || 0,
          firstCompletion: taskStats.first_completion,
          lastCompletion: taskStats.last_completion
        },
        events: {
          total: totalEvents.total || 0,
          byType: eventsByType
        },
        commands: {
          total: commandsStats?.total || 0,
          failed: commandsStats?.failed || 0
        },
        hints: {
          used: hintsUsed?.total || 0
        },
        scenarios: scenariosPlayed.map(s => s.scenario_code),
        badges: badges
      },
      recentActivity: recentActivity.map(a => ({
        ...a,
        event_data: a.event_data ? JSON.parse(a.event_data) : {}
      }))
    });
  } catch (error) {
    console.error('Admin user stats error:', error);
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

/**
 * Export logs as CSV
 * GET /api/admin/logs/export
 * Query params same as /logs plus format=csv
 */
router.get('/logs/export', async (req, res) => {
  try {
    const db = getDb();
    
    // Build WHERE clause (same as /logs)
    const conditions = [];
    const params = [];
    
    if (req.query.eventType) {
      conditions.push('event_type = ?');
      params.push(req.query.eventType);
    }
    
    if (req.query.scenarioCode) {
      conditions.push('scenario_code = ?');
      params.push(req.query.scenarioCode);
    }
    
    if (req.query.participantId) {
      conditions.push('participant_id = ?');
      params.push(req.query.participantId);
    }
    
    if (req.query.userId) {
      conditions.push('el.user_id = ?');
      params.push(parseInt(req.query.userId));
    }
    
    if (req.query.startDate) {
      conditions.push('el.created_at >= ?');
      params.push(req.query.startDate);
    }
    
    if (req.query.endDate) {
      conditions.push('el.created_at <= ?');
      params.push(req.query.endDate);
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    
    // Get all logs (no pagination for export)
    const logs = await db.all(`
      SELECT 
        el.id,
        el.participant_id,
        el.user_id,
        u.display_name as user_display_name,
        u.email as user_email,
        el.event_type,
        el.scenario_code,
        el.task_id,
        el.event_data,
        el.created_at
      FROM event_log el
      LEFT JOIN users u ON el.user_id = u.id
      ${whereClause}
      ORDER BY el.created_at DESC
    `, params);
    
    // Generate CSV
    const headers = ['ID', 'Timestamp', 'Event Type', 'Participant ID', 'User ID', 'User Name', 'User Email', 'Scenario', 'Task ID', 'Event Data'];
    
    const csvRows = [headers.join(',')];
    
    for (const log of logs) {
      const row = [
        log.id,
        log.created_at,
        log.event_type,
        log.participant_id || '',
        log.user_id || '',
        `"${(log.user_display_name || '').replace(/"/g, '""')}"`,
        `"${(log.user_email || '').replace(/"/g, '""')}"`,
        log.scenario_code || '',
        log.task_id || '',
        `"${(log.event_data || '{}').replace(/"/g, '""')}"`
      ];
      csvRows.push(row.join(','));
    }
    
    const csv = csvRows.join('\n');
    
    // Set headers for file download
    const filename = `event_logs_${new Date().toISOString().split('T')[0]}.csv`;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (error) {
    console.error('Admin logs export error:', error);
    res.status(500).json({ error: 'Failed to export logs' });
  }
});

/**
 * Get distinct event types (for filter dropdown)
 * GET /api/admin/event-types
 */
router.get('/event-types', async (req, res) => {
  try {
    const db = getDb();
    
    const eventTypes = await db.all(`
      SELECT DISTINCT event_type
      FROM event_log
      ORDER BY event_type
    `);
    
    res.json({
      eventTypes: eventTypes.map(e => e.event_type)
    });
  } catch (error) {
    console.error('Admin event types error:', error);
    res.status(500).json({ error: 'Failed to fetch event types' });
  }
});

/**
 * Get distinct scenario codes (for filter dropdown)
 * GET /api/admin/scenario-codes
 */
router.get('/scenario-codes', async (req, res) => {
  try {
    const db = getDb();
    
    const scenarioCodes = await db.all(`
      SELECT DISTINCT scenario_code
      FROM event_log
      WHERE scenario_code IS NOT NULL
      ORDER BY scenario_code
    `);
    
    res.json({
      scenarioCodes: scenarioCodes.map(s => s.scenario_code)
    });
  } catch (error) {
    console.error('Admin scenario codes error:', error);
    res.status(500).json({ error: 'Failed to fetch scenario codes' });
  }
});

export { router as adminRoutes };

