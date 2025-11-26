/**
 * API client module
 * 
 * Handles all communication with the backend API.
 * Provides functions for authentication, console, tasks, etc.
 */

const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const PROD_API = 'https://cyberforeniscs-arena-server.onrender.com';
export const API_BASE = import.meta.env.VITE_API_URL || (isLocalhost ? '/api' : `${PROD_API}/api`);

/**
 * Make authenticated API request
 * 
 * @param {string} endpoint - The endpoint to request
 * @param {Object} options - The options for the request
 * 
 */
async function apiRequest(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
  const config = {
    ...options,
    credentials: 'include', // Include cookies
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    }
  };

  if (options.body && typeof options.body === 'object') {
    config.body = JSON.stringify(options.body);
  }

  try {
    const response = await fetch(url, config);
    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || `HTTP ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error(`API request failed: ${endpoint}`, error);
    throw error;
  }
}

/**
 * Auth API handles authentication related endpoints
 * @type {Object} - The API object
 */
export const authAPI = {
  /*
   * Register a new user
   * @param {string} email - The email of the user
   * @param {string} password - The password of the user
   * @param {string} displayName - The display name of the user
   * @returns {Object} - The API object (the user data)
   * 
   */
  async register(email, password, displayName) {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: { email, password, displayName }
    });
  },



  /*
   * Login a user
   * @param {*} email 
   * @param {*} password 
   * @returns {Object} - The API object (the user data)
   */
  async login(email, password) {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: { email, password }
    });
  },

  /*
   * Logout a user
   * @returns {Object} - The API object (the user data)
   */
  async logout() {
    return apiRequest('/auth/logout', {
      method: 'POST'
    });
  },

  /*
   * Get the current user
   * @returns {Object} - The API object (the user data)
   */
  async getMe() {
    return apiRequest('/auth/me', {
      method: 'GET'
    });
  },

  async completeTutorial() {
    return apiRequest('/auth/tutorial/complete', {
      method: 'POST'
    });
  },

  async getTutorialStatus() {
    return apiRequest('/auth/tutorial/status', {
      method: 'GET'
    });
  },

  async getBadges() {
    return apiRequest('/auth/badges', {
      method: 'GET'
    });
  }
};

/**
 * Console API
 * Executes a command in the console
 * @param {string} scenarioCode - The code of the scenario
 * @param {string} command - The command to execute
 * @returns {Object} - The API object (the output of the command execution)
 * 
 */
export const consoleAPI = {
  async execute(scenarioCode, command) {
    return apiRequest('/console/execute', {
      method: 'POST',
      body: { scenarioCode, command }
    });
  }
};

/**
 * Tasks API
 * Handles tasks related endpoints
 * @param {string} taskId - The id of the task
 * @param {string} answer - The answer to the task
 * @param {number} timeMs - The time in milliseconds to complete the task
 * @returns {Object} - The API object
 * 
 */
export const tasksAPI = {
  async submitTask(taskId, answer, timeMs) {
    return apiRequest(`/tasks/${taskId}/submit`, {
      method: 'POST',
      body: { answer, timeMs }
    });
  },

  async getCompletions() {
    return apiRequest('/tasks/completions', {
      method: 'GET'
    });
  },

  async getHint(taskId) {
    return apiRequest(`/tasks/${taskId}/hint`, {
      method: 'GET'
    });
  }
};

/**
 * Leaderboard API
 * Handles leaderboard related endpoints
 * @returns {Object} - The API object (the leaderboard data)
 * 
 */
export const leaderboardAPI = {
  async getLeaderboard() {
    return apiRequest('/leaderboard', {
      method: 'GET'
    });
  }
};

/**
 * Scenarios API
 * Handles scenarios related endpoints
 * @returns {Object} - The API object (the scenarios data)
 * 
 */
export const scenariosAPI = {
  async getScenarios() {
    return apiRequest('/scenarios', {
      method: 'GET'
    });
  }
};

/**
 * Devices API
 * Handles devices related endpoints
 * @param {string} scenarioCode - The code of the scenario
 * @param {string} deviceName - The name of the device
 * @param {string} deviceType - The type of the device
 * @param {number} size - The size of the device
 * @param {string} mountContent - The content to mount on the device
 * @returns {Object} - The API object
 * 
 */
export const devicesAPI = {
  async attachDevice(scenarioCode, deviceName, deviceType, size, mountContent) {
    return apiRequest('/devices/attach', {
      method: 'POST',
      body: { scenarioCode, deviceName, deviceType, size, mountContent }
    });
  },

  async getDevices(scenarioCode) {
    return apiRequest(`/devices?scenarioCode=${encodeURIComponent(scenarioCode)}`, {
      method: 'GET'
    });
  },

  async mountDevice(scenarioCode, device, mountPoint) {
    return apiRequest('/devices/mount', {
      method: 'POST',
      body: { scenarioCode, device, mountPoint }
    });
  },

  async unmountDevice(scenarioCode, mountPoint) {
    return apiRequest('/devices/unmount', {
      method: 'POST',
      body: { scenarioCode, mountPoint }
    });
  }
};

