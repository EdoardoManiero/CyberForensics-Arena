/**
 * Navigation Component
 * 
 * Displays user authentication state, navigation menu, and user actions.
 * Updates based on session state.
 */

import { getCurrentUser, isAuthenticated, logout, onSessionChange, isAdmin } from './session.js';
import { show as showLoginPage } from './loginPage.js';
import { showLeaderboard } from './leaderboard.js';
import { showProfile } from './profile.js';
import { PointsBadge } from './pointsBadge.js';
import { leaderboardAPI } from './api.js';
import { getParticipantId } from './participantId.js';

// ============================================================================
// STATE
// ============================================================================

let navElement = null;
let currentTotalScore = 0;

// ============================================================================
// UI CREATION
// ============================================================================

/**
 * Create navigation bar
 */
function createNavigation() {
  if (navElement) return navElement;

  const nav = document.createElement('nav');
  nav.id = 'mainNavigation';
  nav.className = 'main-nav';
  nav.innerHTML = `
    <div class="main-nav__container">
      <div class="main-nav__brand">
        <i class="fas fa-shield-alt"></i>
        <span>CyberForensics Arena</span>
      </div>
      
      <div class="nav-participant-id" title="Your anonymous participant ID - click to copy for evaluation forms">
        <i class="fas fa-id-badge"></i>
        <span id="participantIdDisplay">${getParticipantId()}</span>
        <button class="nav-participant-id__copy" id="copyParticipantId" title="Copy to clipboard">
          <i class="fas fa-copy"></i>
        </button>
      </div>
      
      <div class="main-nav__menu" id="navMenu">
        <!-- Menu items will be populated based on auth state -->
      </div>
      
      <div class="main-nav__user" id="navUser">
        <!-- User info will be populated based on auth state -->
      </div>
    </div>
  `;

  document.body.insertBefore(nav, document.body.firstChild);

  // Ensure navbar is visible immediately
  nav.style.display = 'block';
  nav.style.visibility = 'visible';

  navElement = nav;

  // Setup participant ID copy button
  setupParticipantIdCopy();

  // Subscribe to session changes
  onSessionChange(updateNavigation);

  return nav;
}

/**
 * Setup participant ID copy functionality
 */
function setupParticipantIdCopy() {
  const copyBtn = document.getElementById('copyParticipantId');
  const displaySpan = document.getElementById('participantIdDisplay');
  
  if (copyBtn && displaySpan) {
    copyBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      
      const participantId = getParticipantId();
      
      try {
        await navigator.clipboard.writeText(participantId);
        
        // Visual feedback
        const originalText = displaySpan.textContent;
        displaySpan.textContent = 'Copied!';
        displaySpan.style.color = '#22c55e';
        copyBtn.style.color = '#22c55e';
        
        setTimeout(() => {
          displaySpan.textContent = originalText;
          displaySpan.style.color = '';
          copyBtn.style.color = '';
        }, 1500);
        
        console.log('[Navigation] Participant ID copied to clipboard:', participantId);
      } catch (err) {
        console.error('[Navigation] Failed to copy participant ID:', err);
        // Fallback: select the text
        const range = document.createRange();
        range.selectNodeContents(displaySpan);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
      }
    });
  }
}

/**
 * Update navigation based on authentication state
 */
function updateNavigation(state) {
  if (!navElement) createNavigation();

  const menu = document.getElementById('navMenu');
  const userSection = document.getElementById('navUser');

  if (!menu || !userSection) return;

  console.log('[Navigation] Updating navigation state:', state);

  if (state.isAuthenticated && state.user) {
    // Check if user is admin
    const userIsAdmin = state.user.role === 'admin';
    
    // Build menu items - admin-only items shown only to admins
    let menuHtml = `
      <button class="nav-btn" id="navLeaderboard" title="View Leaderboard">
        <i class="fas fa-trophy"></i>
        <span>Leaderboard</span>
      </button>
      <button class="nav-btn" id="navProfile" title="View Profile">
        <i class="fas fa-user"></i>
        <span>Profile</span>
      </button>
    `;
    
    // Admin-only menu items
    if (userIsAdmin) {
      menuHtml += `
        <button class="nav-btn nav-btn--admin" id="navEditor" title="Open Scenario Editor">
          <i class="fas fa-edit"></i>
          <span>Editor</span>
        </button>
        <button class="nav-btn nav-btn--admin" id="navAdminDashboard" title="Admin Dashboard">
          <i class="fas fa-chart-line"></i>
          <span>Dashboard</span>
        </button>
      `;
    }
    
    menu.innerHTML = menuHtml;

    // Build user section with role badge for admins
    const roleBadge = userIsAdmin 
      ? '<span class="nav-user__role nav-user__role--admin"><i class="fas fa-shield-alt"></i> Admin</span>'
      : '';
    
    userSection.innerHTML = `
      <div class="nav-user__info">
        <span class="nav-user__name">${escapeHtml(state.user.displayName)}</span>
        <span class="nav-user__email">${escapeHtml(state.user.email)}</span>
        ${roleBadge}
      </div>
      <button class="nav-btn nav-btn--logout" id="navLogout" title="Logout">
        <i class="fas fa-sign-out-alt"></i>
        <span>Logout</span>
      </button>
    `;

    // Setup event listeners
    document.getElementById('navLeaderboard')?.addEventListener('click', () => showLeaderboard());
    document.getElementById('navProfile')?.addEventListener('click', () => showProfile());
    document.getElementById('navLogout')?.addEventListener('click', handleLogout);
    
    // Admin-only event listeners
    if (userIsAdmin) {
      document.getElementById('navEditor')?.addEventListener('click', () => {
        window.location.href = 'editor.html';
      });
      document.getElementById('navAdminDashboard')?.addEventListener('click', () => {
        window.location.href = 'admin.html';
      });
    }
  } else {
    // Not authenticated
    menu.innerHTML = '';
    userSection.innerHTML = `
      <button class="nav-btn nav-btn--primary" id="navLogin" title="Login or Register">
        <i class="fas fa-sign-in-alt"></i>
        <span>Login</span>
      </button>
    `;

    document.getElementById('navLogin')?.addEventListener('click', () => showLoginPage('login'));
  }
}

/**
 * Handle logout
 */
async function handleLogout() {
  if (confirm('Are you sure you want to logout?')) {
    await logout();
    // Navigation will update automatically via session change listener
  }
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Initialize navigation
 */
export function initNavigation() {
  createNavigation();

  // Register callback to update nav when PointsBadge points change
  PointsBadge.onPointsChange((newPoints) => {
    updateNavScore(newPoints);
  });
}

/**
 * Get navigation element
 */
export function getNavigation() {
  return navElement || createNavigation();
}

/**
 * Update the total score display in navigation
 * @param {number} score - Total score to display
 */
export function updateNavScore(score) {
  if (!Number.isFinite(score) || score < 0) {
    console.warn('[Navigation] Invalid score:', score);
    return;
  }

  currentTotalScore = score;

  const scoreElement = document.getElementById('navTotalScore');
  if (scoreElement) {
    scoreElement.textContent = score.toLocaleString();
  }
}

/**
 * Sync total score from server and update both PointsBadge and navigation
 */
export async function syncTotalScore() {
  try {
    const user = getCurrentUser();
    if (!user) {
      console.log('[Navigation] No user logged in, skipping score sync');
      return;
    }

    // Fetch leaderboard to get current user's total score
    const leaderboard = await leaderboardAPI.getLeaderboard();
    const userStats = leaderboard.find(u => u.id === user.id);

    if (userStats && userStats.totalScore !== undefined) {
      const totalScore = userStats.totalScore;

      // Sync PointsBadge
      PointsBadge.setPoints(totalScore);

      // Update navigation display
      updateNavScore(totalScore);

      console.log(`[Navigation] Synced total score: ${totalScore}`);
    } else {
      console.warn('[Navigation] User stats not found in leaderboard');
    }
  } catch (error) {
    console.error('[Navigation] Failed to sync total score:', error);
  }
}