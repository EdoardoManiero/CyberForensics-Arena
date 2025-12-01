/**
 * Database schema initialization
 *
 * Creates all tables if they don't exist.
 * Safe to run multiple times (uses IF NOT EXISTS).
 */

/**
 * Initialize database schema
 * @param {import('sqlite').Database} db - SQLite database instance
 */
export async function initSchema(db) {
  // (opzionale ma consigliato)
  await db.exec('PRAGMA foreign_keys = ON;');

  // Users table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      tutorial_completed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Add tutorial_completed column to existing users table if it doesn't exist
  // SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we check first
  try {
    const tableInfo = await db.all("PRAGMA table_info(users)");
    const hasColumn = tableInfo.some(col => col.name === 'tutorial_completed');

    if (!hasColumn) {
      await db.exec(`
        ALTER TABLE users ADD COLUMN tutorial_completed INTEGER NOT NULL DEFAULT 0
      `);
      console.log('Added tutorial_completed column to users table');
    } else {
      console.log('tutorial_completed column already exists');
    }
  } catch (error) {
    console.warn('Error checking/adding tutorial_completed column:', error.message);
  }

  // Scenarios table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS scenarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      description TEXT
    )
  `);

  // Tasks table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scenario_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      max_score INTEGER NOT NULL DEFAULT 0,
      solution_type TEXT NOT NULL,
      solution_value TEXT NOT NULL,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id),
      UNIQUE(scenario_id, code)
    )
  `);

  // Task completions table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS task_completions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      task_id INTEGER NOT NULL,
      score_awarded INTEGER NOT NULL,
      time_ms INTEGER,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (task_id) REFERENCES tasks(id),
      UNIQUE(user_id, task_id)
    )
  `);

  // Create index on user_id for fast points queries
  try {
    await db.exec(`
      CREATE INDEX IF NOT EXISTS idx_task_completions_user_id 
      ON task_completions(user_id)
    `);
    console.log('Created index on task_completions.user_id');
  } catch (error) {
    // Index might already exist, that's okay
  console.log('Index on task_completions.user_id already exists or error:', error.message);
  }

  // Badges table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS badges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      badge_points INTEGER NOT NULL DEFAULT 0
    )
  `);

  // Add badge_points column to existing badges table if it doesn't exist
  try {
    const tableInfo = await db.all("PRAGMA table_info(badges)");
    const hasColumn = tableInfo.some(col => col.name === 'badge_points');

    if (!hasColumn) {
      await db.exec(`
        ALTER TABLE badges ADD COLUMN badge_points INTEGER NOT NULL DEFAULT 0
      `);
      console.log('Added badge_points column to badges table');
    } else {
      console.log('badge_points column already exists');
    }
  } catch (error) {
    console.warn('Error checking/adding badge_points column:', error.message);
  }

  // User badges table
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_badges (
      user_id INTEGER NOT NULL,
      badge_id INTEGER NOT NULL,
      awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (badge_id) REFERENCES badges(id),
      PRIMARY KEY (user_id, badge_id)
    )
  `);

  // User VFS state table (per user, per scenario)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_vfs_state (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      scenario_code TEXT NOT NULL,
      cwd TEXT NOT NULL DEFAULT '/home/user',
      vfs_data TEXT NOT NULL DEFAULT '{}',
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, scenario_code)
    )
  `);

  // User devices table (per user, per scenario)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      scenario_code TEXT NOT NULL,
      device_name TEXT NOT NULL,
      device_type TEXT NOT NULL,
      size TEXT NOT NULL,
      partition_name TEXT NOT NULL,
      mounted INTEGER NOT NULL DEFAULT 0,
      mount_point TEXT,
      device_data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, scenario_code, device_name)
    )
  `);

  // User stats table (for tracking hints, etc.)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_stats (
      user_id INTEGER PRIMARY KEY,
      hints_used_count INTEGER NOT NULL DEFAULT 0,
      scenario_hints_used TEXT NOT NULL DEFAULT '{}',
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Badge points awarded table (audit trail for points from badges)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS badge_points_awarded (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      badge_id INTEGER NOT NULL,
      points_awarded INTEGER NOT NULL,
      awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (badge_id) REFERENCES badges(id)
    )
  `);

  // User unlocked hints table (persistent hints)
  await db.exec(`
    CREATE TABLE IF NOT EXISTS user_unlocked_hints (
      user_id INTEGER NOT NULL,
      task_id TEXT NOT NULL,
      unlocked_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      PRIMARY KEY (user_id, task_id)
    )
  `);

  // Initialize badges with points
  await initializeBadges(db);

 console.log('Database schema initialized');
}

/**
 * Initialize badges in database with their point values
 * @param {import('sqlite').Database} db - SQLite database instance
 */
async function initializeBadges(db) {
  // Scenario badges (20 points each)
  const scenarioBadges = [
    { code: 'File System Forensic Expert', name: 'File System Forensic Expert', description: 'Completed File System Forensic scenario', points: 20 },
    { code: 'Network Forensic Expert', name: 'Network Forensic Expert', description: 'Completed Network Forensic scenario', points: 20 },
    { code: 'Memory Forensic Expert', name: 'Memory Forensic Expert', description: 'Completed Memory Forensic scenario', points: 20 }
  ];

  // Skill badges (30 points each)
  const skillBadges = [
    { code: 'Speed Runner', name: 'Speed Runner', description: 'Complete a scenario in under 5 minutes', points: 30 },
    { code: 'Hint-Free Expert', name: 'Hint-Free Expert', description: 'Complete a scenario without using any hints', points: 30 }
  ];

  const allBadges = [...scenarioBadges, ...skillBadges];

  for (const badge of allBadges) {
    const existing = await db.get('SELECT id, badge_points FROM badges WHERE code = ?', badge.code);

    if (existing) {
      // Update points if badge exists but points are different
      if (existing.badge_points !== badge.points) {
        await db.run('UPDATE badges SET badge_points = ? WHERE code = ?', badge.points, badge.code);
        console.log(`Updated badge "${badge.code}" points to ${badge.points}`);
      }
    } else {
      // Insert new badge
      await db.run(`
        INSERT INTO badges (code, name, description, badge_points)
        VALUES (?, ?, ?, ?)
      `, badge.code, badge.name, badge.description, badge.points);
      console.log(`Created badge "${badge.code}" with ${badge.points} points`);
    }
  }
}
