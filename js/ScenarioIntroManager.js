/**
 * ScenarioIntroManager.js - Scenario Introduction System
 * 
 * Displays a modal overlay with scenario introduction and briefing
 * when a player selects a new scenario.
 * 
 * LAYER: UI Layer
 * Coordinates with Task Manager to show scenario details before gameplay
 */

import { TaskHud } from './taskHud.js';
import { eventBus, Events } from './eventBus.js';
export class ScenarioIntroManager {
  static VERSION = '1.0-initial';

  constructor(scene = null) {
    this._isShowing = false;
    this.scene = scene;
  }

  /**
   * Shows scenario introduction modal
   * @param {Object} scenarioData - The scenario data object
   * @returns {Promise<void>} Resolves when user closes the modal
   */
  showIntro(scenarioData) {
    window._disablePointerLock = true;
    
    const canvas = this.scene?._renderingLayer?.canvas || document.getElementById('renderCanvas');
    // Get fresh camera reference from scene, not cached
    const camera = this.scene?.activeCamera;
    
    if (!canvas) {
      console.warn('[ScenarioIntro] Canvas not found, cannot setup pointer lock exit');
    }
    if (!camera) {
      console.warn('[ScenarioIntro] Camera not found, cannot detach controls');
    }
    
    // Detach camera controls FIRST
    if (camera && canvas) {
      try {
        camera.detachControl(canvas);
        // Reset camera's internal pointer lock state
        if (camera._needPointerLock !== undefined) {
          camera._needPointerLock = false;
        }
        console.log('[ScenarioIntro] Camera controls detached');
      } catch (e) {
        console.warn('[ScenarioIntro] Failed to detach camera:', e);
      }
    }
    
    // Force exit pointer lock immediately and aggressively
    try {
      document.exitPointerLock?.();
    } catch (e) {
      console.warn('[ScenarioIntro] Initial exitPointerLock failed:', e);
    }
    
    let lockAttempts = 0;
    const exitLock = () => {
      if (lockAttempts++ < 100) {  // Increased attempts from 50 to 100
        try {
          document.exitPointerLock?.();
        } catch (e) {
          // Silent fail, we're retrying anyway
        }
        setTimeout(exitLock, 5);  // Reduced interval from 10ms to 5ms
      }
    };
    exitLock();
    
    // Disable pointer events on canvas
    if (canvas) {
      canvas.style.pointerEvents = 'none';
      canvas.style.cursor = 'auto';
      
      // Block all mouse events on canvas during modal
      const blockEvent = (e) => {
        e.stopPropagation();
        e.preventDefault();
      };
      canvas.addEventListener('mousedown', blockEvent, true);
      canvas.addEventListener('mouseup', blockEvent, true);
      canvas.addEventListener('mousemove', blockEvent, true);
      canvas.addEventListener('click', blockEvent, true);
      
      // Store handlers so we can remove them later
      canvas._modalBlockHandlers = {
        mousedown: blockEvent,
        mouseup: blockEvent,
        mousemove: blockEvent,
        click: blockEvent
      };
    }
    
    TaskHud.hide();
    eventBus.emit(Events.CONSOLE_TOGGLE,{open : false});
    
    return new Promise((resolve) => {
      if (!scenarioData || !scenarioData.introduction) {
        console.warn('[ScenarioIntro] No introduction text provided');
        resolve();
        return;
      }

      if (this._isShowing) {
        console.warn('[ScenarioIntro] Intro already showing');
        resolve();
        return;
      }

      this._isShowing = true;

      // Create overlay
      const overlay = this._createOverlay();
      
      // Create card with scenario info
      const card = this._createCard(scenarioData);
      
      // Create close handler
      const onClose = () => {
        this._closeIntro(overlay);
        this._isShowing = false;
        TaskHud.show();
        
        // Remove event blocking from canvas
        if (canvas && canvas._modalBlockHandlers) {
          const handlers = canvas._modalBlockHandlers;
          canvas.removeEventListener('mousedown', handlers.mousedown, true);
          canvas.removeEventListener('mouseup', handlers.mouseup, true);
          canvas.removeEventListener('mousemove', handlers.mousemove, true);
          canvas.removeEventListener('click', handlers.click, true);
          canvas._modalBlockHandlers = null;
        }
        
        if (canvas) canvas.style.pointerEvents = 'auto';
        window._disablePointerLock = false;
        
        // Re-attach camera controls - get fresh reference from scene
        const currentCamera = this.scene?.activeCamera;
        if (currentCamera && canvas) {
          try {
            currentCamera.attachControl(canvas, true);
            console.log('[ScenarioIntro] Camera controls re-attached');
          } catch (e) {
            console.warn('[ScenarioIntro] Failed to re-attach camera:', e);
          }
        }
        
        resolve();
      };

      // Add close button handler
      const closeBtn = card.querySelector('.scenario-intro-close');
      closeBtn.onclick = onClose;

      // Close on overlay click (outside card)
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
          onClose();
        }
      });

      // Add to DOM
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      // Focus card for accessibility
      card.focus();

      console.log(`[ScenarioIntro] Showing introduction for: ${scenarioData.title}`);
    });
  }

  _createOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'scenario-intro-overlay';
    overlay.style.cssText = `
      position: fixed;
      inset: 0;
      z-index: 99999;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
      pointer-events: auto;
    `;
    
    // Prevent events on overlay background only (not on children like buttons)
    const stopBackgroundEvent = (e) => {
      if (e.target === overlay) {
        e.stopPropagation();
        e.preventDefault();
      }
    };
    overlay.addEventListener('mousedown', stopBackgroundEvent, true);
    overlay.addEventListener('mouseup', stopBackgroundEvent, true);
    overlay.addEventListener('contextmenu', stopBackgroundEvent, true);
    
    return overlay;
  }

  _createCard(scenarioData) {
    const card = document.createElement('div');
    card.className = 'scenario-intro-card';
    card.tabIndex = 0;
    card.style.cssText = `
      background: linear-gradient(135deg, rgba(30, 30, 40, 0.95), rgba(50, 50, 70, 0.95));
      border: 2px solid rgba(0, 200, 255, 0.3);
      border-radius: 12px;
      padding: 40px;
      max-width: 600px;
      width: 90%;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 8px 32px rgba(0, 200, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.1);
      color: #e0e0e0;
      font-family: 'Courier New', monospace;
      animation: slideIn 0.3s ease-out;
    `;

    // Title
    const titleEl = document.createElement('h1');
    titleEl.style.cssText = `
      margin: 0 0 20px 0;
      font-size: 28px;
      color: #00c8ff;
      text-shadow: 0 0 10px rgba(0, 200, 255, 0.5);
      font-weight: bold;
    `;
    titleEl.innerHTML = scenarioData.title;

    // Description (if available)
    const descEl = document.createElement('div');
    descEl.style.cssText = `
      font-size: 12px;
      color: #888;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 1px;
    `;
    descEl.innerHTML = scenarioData.description || '';

    // Divider
    const divider = document.createElement('div');
    divider.style.cssText = `
      height: 1px;
      background: linear-gradient(90deg, transparent, rgba(0, 200, 255, 0.3), transparent);
      margin-bottom: 20px;
    `;

    // Introduction text
    const introEl = document.createElement('p');
    introEl.style.cssText = `
      font-size: 16px;
      line-height: 1.6;
      margin: 20px 0;
      color: #d0d0d0;
    `;
    introEl.innerHTML = scenarioData.introduction;

    // Task count if available
    let taskCountEl = null;
    if (scenarioData.tasks && scenarioData.tasks.length > 0) {
      taskCountEl = document.createElement('div');
      taskCountEl.style.cssText = `
        margin-top: 20px;
        padding: 12px;
        background: rgba(0, 200, 255, 0.1);
        border-left: 3px solid rgba(0, 200, 255, 0.5);
        font-size: 14px;
        color: #a0d8ff;
      `;
      taskCountEl.innerHTML = `<strong>Tasks:</strong> ${scenarioData.tasks.length} steps to complete`;
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'scenario-intro-close';
    closeBtn.innerHTML = 'Start Investigation';
    closeBtn.style.cssText = `
      margin-top: 30px;
      width: 100%;
      padding: 12px 24px;
      background: linear-gradient(135deg, rgba(0, 200, 255, 0.8), rgba(0, 150, 200, 0.8));
      border: 1px solid rgba(0, 200, 255, 0.5);
      color: #fff;
      font-size: 16px;
      font-weight: bold;
      border-radius: 6px;
      cursor: pointer;
      font-family: 'Courier New', monospace;
      text-transform: uppercase;
      letter-spacing: 1px;
      transition: all 0.3s ease;
      box-shadow: 0 0 15px rgba(0, 200, 255, 0.3);
    `;
    
    closeBtn.onmouseover = () => {
      closeBtn.style.background = 'linear-gradient(135deg, rgba(0, 220, 255, 1), rgba(0, 170, 220, 1))';
      closeBtn.style.boxShadow = '0 0 25px rgba(0, 200, 255, 0.6)';
    };
    
    closeBtn.onmouseout = () => {
      closeBtn.style.background = 'linear-gradient(135deg, rgba(0, 200, 255, 0.8), rgba(0, 150, 200, 0.8))';
      closeBtn.style.boxShadow = '0 0 15px rgba(0, 200, 255, 0.3)';
    };

    // Assemble card
    card.appendChild(titleEl);
    if (descEl.innerHTML) card.appendChild(descEl);
    card.appendChild(divider);
    card.appendChild(introEl);
    if (taskCountEl) card.appendChild(taskCountEl);
    card.appendChild(closeBtn);

    return card;
  }

  _closeIntro(overlay) {
    overlay.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => {
      overlay.remove();
    }, 300);
  }
}

// ============================================================================
// ANIMATIONS
// ============================================================================

// Add CSS animations to document if not already present
if (!document.getElementById('scenario-intro-animations')) {
  const style = document.createElement('style');
  style.id = 'scenario-intro-animations';
  style.textContent = `
    @keyframes slideIn {
      from {
        opacity: 0;
        transform: scale(0.95) translateY(20px);
      }
      to {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
    }

    @keyframes slideOut {
      from {
        opacity: 1;
        transform: scale(1) translateY(0);
      }
      to {
        opacity: 0;
        transform: scale(0.95) translateY(20px);
      }
    }

    .scenario-intro-card:focus {
      outline: 2px solid rgba(0, 200, 255, 0.6);
      outline-offset: 4px;
    }
  `;
  document.head.appendChild(style);
}