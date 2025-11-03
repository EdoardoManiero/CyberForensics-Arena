/**
 * eventBus.js - Application Event Bus
 * 
 * Central event pub/sub system that enables loose coupling between layers.
 * Events flow: Rendering     Logic     UI
 * 
 * This allows layers to communicate without direct imports or circular dependencies.
 */

// Event bus class - implements pub/sub pattern for decoupled communication
class EventBus {
  constructor() {
    this.listeners = new Map();
    this.eventHistory = [];
    this.maxHistorySize = 100;
  }

  /**
   * Subscribe to an event
   * @param {string} eventName - Name of the event
   * @param {Function} handler - Callback function
   * @returns {Function} Unsubscribe function
   */
  on(eventName, handler) {
    if (!this.listeners.has(eventName)) {
      this.listeners.set(eventName, []);
    }
    
    const handlers = this.listeners.get(eventName);
    handlers.push(handler);

    // Return unsubscribe function
    return () => {
      const idx = handlers.indexOf(handler);
      if (idx > -1) {
        handlers.splice(idx, 1);
      }
    };
  }

  /**
   * Subscribe to an event once
   * @param {string} eventName - Name of the event
   * @param {Function} handler - Callback function
   * @returns {Function} Unsubscribe function
   */
  once(eventName, handler) {
    const wrappedHandler = (...args) => {
      handler(...args);
      unsubscribe();
    };
    
    const unsubscribe = this.on(eventName, wrappedHandler);
    return unsubscribe;
  }

  /**
   * Emit an event
   * @param {string} eventName - Name of the event
   * @param {*} data - Event data
   */
  emit(eventName, data = null) {
    // Store in history
    this.eventHistory.push({ name: eventName, data, timestamp: Date.now() });
    if (this.eventHistory.length > this.maxHistorySize) {
      this.eventHistory.shift();
    }

    if (!this.listeners.has(eventName)) return;

    const handlers = this.listeners.get(eventName);
    for (const handler of handlers) {
      try {
        handler(data);
      } catch (error) {
        console.error(`Error in event handler for "${eventName}":`, error);
      }
    }
  }

  /**
   * Get event history for debugging
   * @returns {Array} Recent events
   */
  getHistory() {
    return [...this.eventHistory];
  }

  /**
   * Clear all listeners
   */
  clear() {
    this.listeners.clear();
  }
}

export const eventBus = new EventBus();

// Core events - connect rendering, logic, and UI layers
export const Events = {
  // ===== RENDERING LAYER     LOGIC LAYER =====
  
  /** User clicked on a mesh in the 3D scene */
  MESH_CLICKED: 'mesh:clicked',
  
  /** User hovered over a mesh */
  MESH_HOVERED: 'mesh:hovered',
  
  /** User stopped hovering */
  MESH_HOVER_END: 'mesh:hoverEnd',
  
  /** Console was toggled open/closed */
  CONSOLE_TOGGLE: 'console:toggle',
  
  /** User typed a command in the console */
  CONSOLE_COMMAND_EXECUTED: 'console:commandExecuted',
  
  // ===== LOGIC LAYER     UI LAYER =====
  
  /** Task was completed */
  TASK_COMPLETED: 'task:completed',
  
  /** Advanced to next task */
  TASK_ADVANCED: 'task:advanced',
  
  /** Scenario changed */
  SCENARIO_CHANGED: 'scenario:changed',
  
  /** Scenario completed */
  SCENARIO_COMPLETED: 'scenario:completed',
  
  /** Progress updated */
  PROGRESS_UPDATED: 'progress:updated',
  
  /** Tutorial step changed */
  TUTORIAL_STEP_CHANGED: 'tutorial:stepChanged',
  
  /** Tutorial completed */
  TUTORIAL_COMPLETED: 'tutorial:completed',
  
  // ===== LOGIC LAYER     RENDERING LAYER =====
  
  /** Highlights should be updated for current scenario */
  SCENARIO_HIGHLIGHTS_UPDATED: 'scenario:highlightsUpdated',
  
  // ===== UI LAYER     RENDERING LAYER =====
  
  /** Console visibility changed (for input handling) */
  UI_CONSOLE_VISIBLE_CHANGED: 'ui:consoleVisibilityChanged'
};

// Debug utility to log all events for troubleshooting
export function enableEventBusDebug(verbose = false) {
  const originalEmit = eventBus.emit.bind(eventBus);
  
  eventBus.emit = function(eventName, data) {
    if (verbose) {
      console.log(`[EventBus] ${eventName}`, data);
    }
    originalEmit(eventName, data);
  };
}

// Default export for convenience
export default eventBus;