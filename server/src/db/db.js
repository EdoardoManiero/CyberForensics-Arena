/**
 * Database module - SQLite connection and initialization
 *
 * Uses `sqlite` + `sqlite3` for async SQLite operations.
 * All queries should use parameterized statements to prevent SQL injection.
 */

import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import { initSchema } from './schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Database path
const DB_DIR = join(__dirname, '../../data');
const DB_PATH = join(DB_DIR, 'cfa.db');

let db = null;

/**
 * Initialize database connection and schema
 * Must be awaited once at server startup.
 */
export async function initDatabase() {
  try {
    // Ensure data directory exists
    if (!existsSync(DB_DIR)) {
      mkdirSync(DB_DIR, { recursive: true });
      console.log(` Created database directory: ${DB_DIR}`);
    }

    // Open database (async)
    db = await open({
      filename: DB_PATH,
      driver: sqlite3.Database,
    });

    // Set PRAGMAs for concurrent access
    // See: theory/sqlite-concurrency-pragmas.md for detailed explanation
    await db.exec('PRAGMA journal_mode = WAL;');           // Concurrent reads/writes
    await db.exec('PRAGMA busy_timeout = 30000;');         // Wait 30s for locks instead of failing
    await db.exec('PRAGMA synchronous = NORMAL;');         // Faster writes, still safe with WAL
    await db.exec('PRAGMA cache_size = 10000;');           // ~40MB cache for faster reads
    await db.exec('PRAGMA temp_store = MEMORY;');          // Temp tables in RAM

    console.log(`Database opened: ${DB_PATH}`);
   console.log('Configured for concurrent access (WAL + busy_timeout)');

    // Initialize schema (schema.js should export an async initSchema)
    await initSchema(db);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    throw error;
  }
}

/**
 * Get database instance
 * @returns {import('sqlite').Database} SQLite database instance
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

/**
 * Close database connection
 */
export async function closeDatabase() {
  if (db) {
    await db.close();
    db = null;
   console.log('Database connection closed');
  }
}
