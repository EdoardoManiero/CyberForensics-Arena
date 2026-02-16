/**
 * Participant ID Module
 * 
 * Generates and manages anonymous participant IDs for evaluation tracking.
 * IDs are stored in localStorage and persist across sessions.
 * Format: CFA-XXXXXX (6 uppercase alphanumeric characters)
 */

const STORAGE_KEY = 'cfa_participant_id';

/**
 * Generate a new participant ID in CFA-XXXXXX format
 * @returns {string} Generated participant ID
 */
function generateId() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let suffix = '';
  for (let i = 0; i < 6; i++) {
    suffix += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CFA-${suffix}`;
}

/**
 * Get the participant ID, generating one if it doesn't exist
 * @returns {string} The participant ID
 */
export function getParticipantId() {
  let id = localStorage.getItem(STORAGE_KEY);
  if (!id) {
    id = generateId();
    localStorage.setItem(STORAGE_KEY, id);
    console.log('[ParticipantId] Generated new participant ID:', id);
  }
  return id;
}

/**
 * Check if a participant ID exists
 * @returns {boolean} True if participant ID exists
 */
export function hasParticipantId() {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

/**
 * Clear the participant ID (for testing/debugging)
 * WARNING: This will generate a new ID on next getParticipantId() call
 */
export function clearParticipantId() {
  localStorage.removeItem(STORAGE_KEY);
  console.log('[ParticipantId] Cleared participant ID');
}







