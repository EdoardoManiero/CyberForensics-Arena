/**
 * Passport.js configuration
 * 
 * Uses Local Strategy for email/password authentication with sessions.
 */

import passport from 'passport';
import { Strategy as LocalStrategy } from 'passport-local';
import bcrypt from 'bcrypt';
import { getDb } from '../db/db.js';

/**
 * Local Strategy for username/password login
 * Used for /api/auth/login
 * 
 * Security: Uses generic error messages to prevent user enumeration
 */
passport.use(new LocalStrategy(
  {
    usernameField: 'email',
    passwordField: 'password',
    session: true // We're using sessions
  },
  async (email, password, done) => {
    try {
      const db = getDb();
      
      // Find user
      const user = await db.get(
        'SELECT id, email, password_hash, display_name, role, tutorial_completed FROM users WHERE email = ?',
        email
      );
      
      // Generic error message for both "user not found" and "invalid password"
      // This prevents user enumeration attacks
      if (!user) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      
      // Verify password
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return done(null, false, { message: 'Invalid email or password' });
      }
      
      // Return user (without password_hash)
      return done(null, {
        id: user.id,
        email: user.email,
        displayName: user.display_name,
        role: user.role || 'user',
        tutorialCompleted: user.tutorial_completed === 1
      });
    } catch (error) {
      return done(error);
    }
  }
));

/**
 * Serialize user to session
 * Store only user.id in the session
 */
passport.serializeUser((user, done) => {
  done(null, user.id);
});

/**
 * Deserialize user from session
 * Load full user from database by id
 */
passport.deserializeUser(async (id, done) => {
  try {
    const db = getDb();
    
    const user = await db.get(
      'SELECT id, email, display_name, role, tutorial_completed, created_at FROM users WHERE id = ?',
      id
    );
    
    if (!user) {
      return done(null, false);
    }
    
    // Return user object
    return done(null, {
      userId: user.id,
      id: user.id,
      email: user.email,
      displayName: user.display_name,
      role: user.role || 'user',
      tutorialCompleted: user.tutorial_completed === 1,
      createdAt: user.created_at
    });
  } catch (error) {
    return done(error, false);
  }
});

export default passport;

