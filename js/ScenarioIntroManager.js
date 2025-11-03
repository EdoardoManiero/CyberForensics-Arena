/**
 * ScenarioIntroManager.js - Scenario Introduction System
 * 
 * Displays a modal overlay with scenario introduction and briefing
 * when a player selects a new scenario.
 * 
 * LAYER: UI Layer
 * Coordinates with Task Manager to show scenario details before gameplay
 */

export class ScenarioIntroManager {
  static VERSION = '1.0-initial';

  constructor() {
    this._isShowing = false;
  }

  /**
   * Shows scenario introduction modal
   * @param {Object} scenarioData - The scenario data object
   * @returns {Promise<void>} Resolves when user closes the modal
   */
  showIntro(scenarioData) {
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
      z-index: 9997;
      background: rgba(0, 0, 0, 0.6);
      display: flex;
      align-items: center;
      justify-content: center;
      backdrop-filter: blur(4px);
    `;
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