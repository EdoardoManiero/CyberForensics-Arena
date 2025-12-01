/**
 * Reset Users Script
 * 
 * Options:
 * 1. Delete all users (and cascade delete related data)
 * 2. Reset user progress (keep users, clear completions/badges/VFS/devices)
 * 3. Delete specific user by email
 * 
 * Usage:
 *   node server/src/scripts/resetUsers.js [option] [email]
 * 
 * Examples:
 *   node server/src/scripts/resetUsers.js all          # Delete all users
 *   node server/src/scripts/resetUsers.js progress     # Reset all user progress
 *   node server/src/scripts/resetUsers.js user test@example.com  # Delete specific user
 */

import { initDatabase, getDb, closeDatabase } from '../db/db.js';

async function deleteAllUsers() {
  const db = getDb();

console.log(' Deleting all users and related data...');

  // Delete in order to respect foreign keys
  // Must delete child records before parent records
  // Order: badge_points_awarded -> user_badges -> task_completions -> user_unlocked_hints -> user_devices -> user_vfs_state -> user_stats -> users
  const badgePointsResult = await db.run('DELETE FROM badge_points_awarded');
  const badgesResult = await db.run('DELETE FROM user_badges');
  const completionsResult = await db.run('DELETE FROM task_completions');
  const hintsResult = await db.run('DELETE FROM user_unlocked_hints');
  const devicesResult = await db.run('DELETE FROM user_devices');
  const vfsResult = await db.run('DELETE FROM user_vfs_state');
  const statsResult = await db.run('DELETE FROM user_stats');
  const usersResult = await db.run('DELETE FROM users');

  console.log(`Deleted ${badgePointsResult.changes} badge point award(s)`);
  console.log(`Deleted ${badgesResult.changes} user badge(s)`);
  console.log(`Deleted ${completionsResult.changes} task completion(s)`);
  console.log(`Deleted ${hintsResult.changes} unlocked hint(s)`);
  console.log(`Deleted ${devicesResult.changes} device(s)`);
  console.log(`Deleted ${vfsResult.changes} VFS state(s)`);
  console.log(`Deleted ${statsResult.changes} user stat(s)`);
  console.log(`Deleted ${usersResult.changes} user(s)`);
  console.log('All users and related data deleted');
}

async function resetUserProgress() {
  const db = getDb();

 console.log('Resetting all user progress (keeping users)...');

  // Clear progress data but keep users
  // Delete in order to respect foreign keys
  const badgePointsResult = await db.run('DELETE FROM badge_points_awarded');
  const badgesResult = await db.run('DELETE FROM user_badges');
  const completionsResult = await db.run('DELETE FROM task_completions');
  const hintsResult = await db.run('DELETE FROM user_unlocked_hints');
  const devicesResult = await db.run('DELETE FROM user_devices');
  const vfsResult = await db.run('DELETE FROM user_vfs_state');
  const statsResult = await db.run('DELETE FROM user_stats');

  // Reset tutorial completion status
  const tutorialResult = await db.run('UPDATE users SET tutorial_completed = 0');

  console.log(`Deleted ${badgePointsResult.changes} badge point award(s)`);
  console.log(`Deleted ${badgesResult.changes} user badge(s)`);
  console.log(`Deleted ${completionsResult.changes} task completion(s)`);
  console.log(`Deleted ${hintsResult.changes} unlocked hint(s)`);
  console.log(`Deleted ${devicesResult.changes} device(s)`);
  console.log(`Deleted ${vfsResult.changes} VFS state(s)`);
  console.log(`Deleted ${statsResult.changes} user stat(s)`);
  console.log(`Reset tutorial status for ${tutorialResult.changes} user(s)`);
  console.log('All user progress reset');
}

async function deleteUserByEmail(email) {
  const db = getDb();

  console.log(`Deleting user: ${email}...`);

  // Get user ID first
  const user = await db.get('SELECT id FROM users WHERE email = ?', email);

  if (!user) {
    console.log(`User not found: ${email}`);
    return;
  }

  const userId = user.id;

  // Check what data exists before deletion
  const devicesCount = await db.get('SELECT COUNT(*) as count FROM user_devices WHERE user_id = ?', userId);
  const vfsCount = await db.get('SELECT COUNT(*) as count FROM user_vfs_state WHERE user_id = ?', userId);
  const badgePointsCount = await db.get('SELECT COUNT(*) as count FROM badge_points_awarded WHERE user_id = ?', userId);
  const badgesCount = await db.get('SELECT COUNT(*) as count FROM user_badges WHERE user_id = ?', userId);
  const completionsCount = await db.get('SELECT COUNT(*) as count FROM task_completions WHERE user_id = ?', userId);
  const hintsCount = await db.get('SELECT COUNT(*) as count FROM user_unlocked_hints WHERE user_id = ?', userId);

  console.log(`Found ${devicesCount.count} device(s), ${vfsCount.count} VFS state(s), ${badgePointsCount.count} badge point award(s), ${badgesCount.count} badge(s), ${completionsCount.count} completion(s), ${hintsCount.count} hint(s)`);

  // Delete user's data (in correct order to respect foreign keys)
  // Must delete child records before parent records
  const badgePointsResult = await db.run('DELETE FROM badge_points_awarded WHERE user_id = ?', userId);
  const badgesResult = await db.run('DELETE FROM user_badges WHERE user_id = ?', userId);
  const completionsResult = await db.run('DELETE FROM task_completions WHERE user_id = ?', userId);
  const hintsResult = await db.run('DELETE FROM user_unlocked_hints WHERE user_id = ?', userId);
  const devicesResult = await db.run('DELETE FROM user_devices WHERE user_id = ?', userId);
  const vfsResult = await db.run('DELETE FROM user_vfs_state WHERE user_id = ?', userId);
  const statsResult = await db.run('DELETE FROM user_stats WHERE user_id = ?', userId);
  const userResult = await db.run('DELETE FROM users WHERE id = ?', userId);

  console.log(`Deleted ${devicesResult.changes} device(s), ${vfsResult.changes} VFS state(s), ${badgePointsResult.changes} badge point award(s), ${badgesResult.changes} badge(s), ${completionsResult.changes} completion(s), ${hintsResult.changes} hint(s), ${statsResult.changes} stat(s)`);
  console.log(`User deleted: ${email} (ID: ${userId})`);

  // Verify deletion
  const remainingDevices = await db.get('SELECT COUNT(*) as count FROM user_devices WHERE user_id = ?', userId);
  const remainingVFS = await db.get('SELECT COUNT(*) as count FROM user_vfs_state WHERE user_id = ?', userId);
  const remainingBadgePoints = await db.get('SELECT COUNT(*) as count FROM badge_points_awarded WHERE user_id = ?', userId);
  const remainingHints = await db.get('SELECT COUNT(*) as count FROM user_unlocked_hints WHERE user_id = ?', userId);
  if (remainingDevices.count > 0 || remainingVFS.count > 0 || remainingBadgePoints.count > 0 || remainingHints.count > 0) {
    console.warn(`        Warning: Some data may still exist (${remainingDevices.count} devices, ${remainingVFS.count} VFS states, ${remainingBadgePoints.count} badge points, ${remainingHints.count} hints)`);
  }
}

async function listUsers() {
  const db = getDb();

  const users = await db.all('SELECT id, email, display_name, tutorial_completed, created_at FROM users ORDER BY created_at DESC');

  if (users.length === 0) {
   console.log('No users found');
    return;
  }

  console.log(`\n     Found ${users.length} user(s):\n`);
  users.forEach(user => {
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Name: ${user.display_name}`);
    console.log(`Tutorial: ${user.tutorial_completed ? 'Completed' : 'Not completed'}`);
    console.log(`Created: ${user.created_at}`);
    console.log('');
  });
}

async function inspectUser(email) {
  const db = getDb();

  console.log(` Inspecting user: ${email}...\n`);

  const user = await db.get('SELECT id, email, display_name, created_at FROM users WHERE email = ?', email);

  if (!user) {
    console.log(`User not found: ${email}`);
    return;
  }

  const userId = user.id;

  console.log(`User ID: ${userId}`);
  console.log(`Email: ${user.email}`);
  console.log(`Display Name: ${user.display_name}`);
  console.log(`Created: ${user.created_at}\n`);

  // Check devices
  const devices = await db.all('SELECT * FROM user_devices WHERE user_id = ?', userId);
  console.log(`Devices (${devices.length}):`);
  devices.forEach(dev => {
    console.log(`- ${dev.device_name} (${dev.device_type}, ${dev.size})`);
    console.log(`Scenario: ${dev.scenario_code}`);
    console.log(`Partition: ${dev.partition_name}`);
    console.log(`Mounted: ${dev.mounted === 1 ? `Yes (${dev.mount_point})` : 'No'}`);
  });

  // Check VFS states
  const vfsStates = await db.all('SELECT scenario_code, cwd, updated_at FROM user_vfs_state WHERE user_id = ?', userId);
  console.log(`\nVFS States (${vfsStates.length}):`);
  for (const state of vfsStates) {
    console.log(`- Scenario: ${state.scenario_code}`);
    console.log(`CWD: ${state.cwd}`);
    console.log(`Updated: ${state.updated_at}`);

    // Get VFS data size
    const vfsData = await db.get('SELECT vfs_data FROM user_vfs_state WHERE user_id = ? AND scenario_code = ?', userId, state.scenario_code);
    if (vfsData) {
      try {
        const vfs = JSON.parse(vfsData.vfs_data);
        const fileCount = countFilesInVFS(vfs);
        console.log(`Files/Dirs: ${fileCount.files} files, ${fileCount.dirs} directories`);
      } catch (e) {
        console.log(`Error parsing VFS data`);
      }
    }
  }

  // Check completions
  const completions = await db.all(`
    SELECT tc.*, t.code, t.title 
    FROM task_completions tc 
    JOIN tasks t ON tc.task_id = t.id 
    WHERE tc.user_id = ?
  `, userId);
  console.log(`\nTask Completions (${completions.length}):`);
  completions.forEach(comp => {
    console.log(`- ${comp.code}: ${comp.title} (${comp.score_awarded} points)`);
  });

  // Check badges
  const badges = await db.all(`
    SELECT b.code, b.name 
    FROM user_badges ub 
    JOIN badges b ON ub.badge_id = b.id 
    WHERE ub.user_id = ?
  `, userId);
  console.log(`\nBadges (${badges.length}):`);
  badges.forEach(badge => {
    console.log(`- ${badge.code}: ${badge.name}`);
  });

  // Check unlocked hints
  const hints = await db.all(`
    SELECT task_id, unlocked_at 
    FROM user_unlocked_hints 
    WHERE user_id = ?
  `, userId);
  console.log(`\nUnlocked Hints (${hints.length}):`);
  hints.forEach(hint => {
    console.log(`- Task: ${hint.task_id} (unlocked: ${hint.unlocked_at})`);
  });
}

function countFilesInVFS(node, counts = { files: 0, dirs: 0 }) {
  if (!node) return counts;

  if (node.type === 'file') {
    counts.files++;
  } else if (node.type === 'dir') {
    counts.dirs++;
    if (node.children) {
      for (const child of Object.values(node.children)) {
        countFilesInVFS(child, counts);
      }
    }
  }

  return counts;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    // Initialize database
    await initDatabase();

    switch (command) {
      case 'all':
        await deleteAllUsers();
        break;

      case 'progress':
        await resetUserProgress();
        break;

      case 'user':
        const email = args[1];
        if (!email) {
          console.error('    Error: Email required for "user" command');
          console.log('Usage: node resetUsers.js user <email>');
          process.exit(1);
        }
        await deleteUserByEmail(email);
        break;

      case 'list':
        await listUsers();
        break;

      case 'inspect':
        const emailToInspect = args[1];
        if (!emailToInspect) {
          console.error('    Error: Email required for "inspect" command');
          console.log('Usage: node resetUsers.js inspect <email>');
          process.exit(1);
        }
        await inspectUser(emailToInspect);
        break;

      default:
       console.log('Reset Users Script');
        console.log('\nUsage: node server/src/scripts/resetUsers.js [command]');
        console.log('\nCommands:');
       console.log('all              - Delete all users and all related data');
       console.log('progress          - Reset all user progress (keep users)');
       console.log('user <email>      - Delete specific user by email');
       console.log('list              - List all users');
       console.log('inspect <email>   - Inspect user data (devices, VFS, completions)');
        console.log('\nExamples:');
       console.log('node server/src/scripts/resetUsers.js all');
       console.log('node server/src/scripts/resetUsers.js progress');
       console.log('node server/src/scripts/resetUsers.js user test@example.com');
       console.log('node server/src/scripts/resetUsers.js list');
       console.log('node server/src/scripts/resetUsers.js inspect test@example.com');
        break;
    }

    // Close database
    await closeDatabase();

  } catch (error) {
    console.error('    Error:', error);
    process.exit(1);
  }
}

main();

