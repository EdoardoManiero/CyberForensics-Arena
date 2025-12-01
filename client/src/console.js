// Forensic Shell - Terminal emulator for the 3D forensic investigation environment
/** 
 * console.js 
 * Console module for the Forensic Shell application. This module provides an interactive terminal interface that allows users to interact with the virtual forensic environment through various commands and actions. 
 * It includes features such as command execution, tab completion, history management, and more.
 * The console also integrates with other modules like Task Manager and Event Bus to provide a seamless experience within the overall application architecture.
 *
 * Dependencies:
 * - xterm.js: A lightweight, highly configurable JavaScript library for web-based terminals.
 * - xterm-addon-fit: An addon for xterm.js that automatically adjusts the size of the terminal based on its container's dimensions.
 *
 * Usage
 * **/

import 'xterm/css/xterm.css';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import {
  currentTask, advanceTask, getAvailableScenarios, notifyComplete,
  switchScenario, switchScenarioWithIntro, getProgress, getCurrentScenario,
  storeBadgePointsAwarded
} from './taskManager.js';
import { eventBus, Events } from './eventBus.js';
import { consoleAPI, tasksAPI, devicesAPI } from './api.js';
import { PointsBadge } from './pointsBadge.js';
import { updateNavScore } from './navigation.js';
import { TaskHud } from './taskHud.js';
// import { TerminalUI } from './ui/TerminalUI.js'; // Removed invalid import
import { miniGameManager } from './miniGames/MiniGameManager.js';
import { DecryptionGame } from './miniGames/DecryptionGame.js';
import { SignalTracingGame } from './miniGames/SignalTracingGame.js';
import './miniGames/miniGames.css'; // Import styles for minigames

// Configuration constants
const CONFIG = {
  STORAGE_KEY: 'forensic_shell_history',
  HISTORY_LIMIT: 200,
  TERMINAL_CONFIG: {
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    cursorBlink: true,
    allowTransparency: true,
    convertEol: true,
    theme: { background: "#0a0a0a" }
  },
  COLORS: {
    USER: '\x1b[32m',
    PATH: '\x1b[34m',
    RESET: '\x1b[0m'
  },
  ENV: {
    USER: 'forensic',
    HOME: '/home/user',
    PATH: '/bin:/usr/bin'
  }
};

// Track terminal state: buffer, history, cursor position, etc.
const TerminalState = {
  term: null,
  fitAddon: null,
  buffer: '',
  cursorPos: 0,  // Track cursor position in buffer
  history: [],
  historyIdx: 0,
  cwd: '/home/user',
  env: { ...CONFIG.ENV }
};

// Virtual File System - utility functions for path resolution and autocomplete
// Note: The actual VFS structure is managed server-side. This local VFS is only used for:
// - Path resolution utilities (for autocomplete and redirection)
// - Mounted device content (via mountDeviceContent)
// - Files created via redirection (> and >>)
const VFSManager = {
  root: null,

  initialize() {
    // Initialize with empty root - structure is populated by mountDeviceContent
    // and files created via redirection. Server manages the real VFS.
    this.root = { type: 'dir', children: {} };
  },

  makeFile(content) {
    return { type: 'file', content };
  },

  resolvePath(path, base) {
    if (path.startsWith('/')) return this.normalizePath(path);
    const parts = base.split('/').filter(Boolean);
    const segments = path.split('/');
    for (const seg of segments) {
      if (seg === '..') parts.pop();
      else if (seg && seg !== '.') parts.push(seg);
    }
    return '/' + parts.join('/');
  },

  normalizePath(p) {
    const parts = p.split('/').filter(Boolean);
    const stack = [];
    for (const seg of parts) {
      if (seg === '..') stack.pop();
      else if (seg !== '.') stack.push(seg);
    }
    return '/' + stack.join('/');
  },

  getNode(path) {
    const p = this.normalizePath(path);
    if (p === '/') return this.root;
    const parts = p.split('/').filter(Boolean);
    let node = this.root;
    for (const part of parts) {
      if (!node.children || !node.children[part]) return null;
      node = node.children[part];
    }
    return node;
  },

  ensureDirAndLeaf(path) {
    const p = this.normalizePath(path);
    const parts = p.split('/').filter(Boolean);
    if (parts.length === 0) return null;
    let node = this.root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children[parts[i]]) return null;
      node = node.children[parts[i]];
      if (node.type !== 'dir') return null;
    }
    return { dirNode: node, leaf: parts[parts.length - 1] };
  },

  // Cache for last directory listing (to avoid double API calls during autocomplete)
  _lastDirCache: { path: null, entries: new Set(), scenarioCode: null },

  async listCandidates(partial, base, scenarioCode) {
    // First check local VFS (for mounted devices and files created via redirection)
    const slash = partial.lastIndexOf('/');
    let dirPath = base;
    let prefix = partial;
    if (slash >= 0) {
      dirPath = this.resolvePath(partial.slice(0, slash + 1), base);
      prefix = partial.slice(slash + 1);
    }

    const localNode = this.getNode(dirPath);
    let localChoices = [];
    if (localNode && localNode.type === 'dir' && localNode.children) {
      localChoices = Object.keys(localNode.children).filter(name => name.startsWith(prefix));
    }

    // Query server for directory listing if we have a scenario
    if (scenarioCode) {
      try {
        // Use 'ls' command to get directory contents from server
        const target = dirPath === base ? '.' : dirPath;
        const result = await consoleAPI.execute(scenarioCode, `ls "${target}"`);

        if (result.output && !result.error) {
          const serverEntries = result.output.split('\n').filter(Boolean);
          const serverChoices = serverEntries.filter(name => name.startsWith(prefix));

          // Cache the directory listing for getNodeType to use
          this._lastDirCache = {
            path: dirPath,
            entries: new Set(serverEntries),
            scenarioCode
          };

          // Merge local and server choices, removing duplicates
          const allChoices = [...new Set([...localChoices, ...serverChoices])];
          return allChoices;
        }
      } catch (error) {
        console.warn('[Autocomplete] Failed to query server for directory listing:', error);
      }
    }

    // Fallback to local choices only
    return localChoices;
  },

  async getNodeType(path, scenarioCode) {
    // Check local VFS first
    const localNode = this.getNode(path);
    if (localNode) {
      return localNode.type;
    }

    // Check cache from recent listCandidates call (avoids second API request)
    // If the path's parent directory was just listed, we know if this entry exists
    const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
    const basename = path.split('/').pop();
    if (this._lastDirCache.path === parentPath && 
        this._lastDirCache.scenarioCode === scenarioCode &&
        this._lastDirCache.entries.has(basename)) {
      // Entry exists in cached directory listing - assume it's a directory
      // (files would typically have extensions, and this is for autocomplete trailing slash)
      return 'dir';
    }

    // Query server if we have a scenario (fallback if cache miss)
    if (scenarioCode) {
      try {
        const result = await consoleAPI.execute(scenarioCode, `ls "${path}"`);
        if (result.error) {
          return null; // Path doesn't exist
        }
        if (result.output) {
          const entries = result.output.split('\n').filter(Boolean);
          // If ls returns a single entry that matches the basename, it's a file
          // Otherwise it's a directory (or empty directory)
          if (entries.length === 1 && entries[0] === basename) {
            return 'file';
          }
          // Multiple entries or empty string means it's a directory
          return 'dir';
        }
      } catch (error) {
        // Ignore errors, return null
        console.warn('[VFSManager] Error checking node type:', error);
      }
    }

    return null;
  },

  /**
   * Automatically mounts device content to a specific path
   * Used by task manager to mount remote devices
   */
  mountDeviceContent(mountPath, content) {
    console.log('[VFSManager] Mounting device at:', mountPath, 'with content keys:', Object.keys(content || {}));

    const pathParts = mountPath.split('/').filter(Boolean);
    let current = this.root;

    // Create directory structure
    for (const part of pathParts) {
      if (!current.children) current.children = {};
      if (!current.children[part]) {
        current.children[part] = { type: 'dir', children: {} };
        console.log('[VFSManager] Created directory:', part);
      }
      current = current.children[part];
    }

    console.log('[VFSManager] Directory structure created. Current node:', current);

    // Add device content as files
    if (content && current.children) {
      for (const [name, data] of Object.entries(content)) {
        current.children[name] = this.makeFile(data);
        console.log('[VFSManager] Added file:', name);
      }
    }

    console.log('[VFSManager] Mount complete. Directory contents:', Object.keys(current.children || {}));
  }
};

// Registry for all available shell commands
const CommandRegistry = new Map();
const CustomCommandsRegistry = new Set(); // Track custom commands for cleanup

function registerCommand(name, handler) {
  CommandRegistry.set(name, handler);
}

function getCommand(name) {
  return CommandRegistry.get(name);
}

function getAllCommands() {
  return Array.from(CommandRegistry.keys());
}

/**
 * Registers custom commands from scenario definition
 * @param {Array} customCommands - Array of command definitions from scenario
 */
function registerCustomCommands(customCommands) {
  if (!Array.isArray(customCommands)) {
    console.warn('[Console] Invalid customCommands format');
    return;
  }

  customCommands.forEach(cmd => {
    if (!cmd.name) {
      console.warn('[Console] Custom command missing name property');
      return;
    }

    const cmdName = cmd.name;
    const output = cmd.output || '';
    const description = cmd.description || cmd.name;

    const type = cmd.type || 'text';

    if (type === 'minigame') {
      registerCommand(cmdName, (args) => {
        return new Promise((resolve, reject) => {
          let gameInstance;
          if (cmd.gameType === 'decryption') {
            gameInstance = new DecryptionGame();
          } else if (cmd.gameType === 'signal-tracing') {
            gameInstance = new SignalTracingGame();
          } else {
            resolve(`Error: Unknown game type ${cmd.gameType}`);
            return;
          }

          try {
            // Timeout to prevent hanging (60s)
            const timeoutId = setTimeout(() => {
              reject(new Error('Command timed out (60s).'));
            }, 60000);

            miniGameManager.startGame(gameInstance, (success) => {
              clearTimeout(timeoutId);
              if (success) {
                resolve(output || 'Access Granted.');
              } else {
                reject(new Error('Access Denied. Sequence failed.'));
              }
            });
          } catch (error) {
            reject(new Error(`Failed to start minigame: ${error.message}`));
          }
        });
      });
    } else {
      registerCommand(cmdName, (args) => {
        // Support for simple templating: {arg0}, {arg1}, etc.
        let result = output;
        args.forEach((arg, idx) => {
          result = result.replace(new RegExp(`\\{arg${idx}\\}`, 'g'), arg);
        });
        return result;
      });
    }

    CustomCommandsRegistry.add(cmdName);
    console.log(`[Console] Registered custom command: ${cmdName}`);
  });
}

/**
 * Unregisters all custom commands from the previous scenario
 */
function unregisterCustomCommands() {
  CustomCommandsRegistry.forEach(cmdName => {
    CommandRegistry.delete(cmdName);
    console.log(`[Console] Unregistered custom command: ${cmdName}`);
  });
  CustomCommandsRegistry.clear();
}

// Parses command input and handles redirection (>, >>)
const Parser = {
  parse(line) {
    if (!line) return { cmd: '', args: [] };

    const tokens = [];
    let cur = '';
    let inQ = false;

    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQ = !inQ;
      } else if (ch === ' ' && !inQ) {
        if (cur) tokens.push(cur);
        cur = '';
      } else {
        cur += ch;
      }
    }
    if (cur) tokens.push(cur);

    let redir = null;
    let cmdArgs = tokens;

    for (let i = 0; i < tokens.length; i++) {
      if (tokens[i] === '>') {
        redir = { append: false, path: tokens[i + 1] || '' };
        cmdArgs = tokens.slice(0, i);
        break;
      }
      if (tokens[i] === '>>') {
        redir = { append: true, path: tokens[i + 1] || '' };
        cmdArgs = tokens.slice(0, i);
        break;
      }
    }

    const cmd = cmdArgs[0] || '';
    const args = cmdArgs.slice(1);

    return { cmd, args, redir };
  }
};

// Terminal UI utilities - display prompts, write output, etc.
const TerminalUI = {
  getPrompt() {
    const { USER, RESET, PATH } = CONFIG.COLORS;
    return `${USER}forensic${RESET}:${PATH}${TerminalState.cwd}${RESET}$ `;
  },

  getPromptVisualLength() {
    // Visual length of prompt: "forensic:/home/user$ " = typically 21 characters
    const cwd = TerminalState.cwd || '/home/user';
    return 8 + 1 + cwd.length + 2; // "forensic" + ":" + cwd + "$ "
  },

  write(text) {
    TerminalState.term.write(text);
  },

  writeLine(text = '') {
    TerminalState.term.writeln(text);
  },

  clear() {
    TerminalState.term.clear();
  },

  prompt() {
    this.write(this.getPrompt());
  }
};

// Manages command history - persistence, navigation (arrow keys)
const HistoryManager = {
  save(cmd) {
    if (!cmd) return;
    const { history } = TerminalState;
    if (history.length === 0 || history[history.length - 1] !== cmd) {
      history.push(cmd);
      TerminalState.history = history.slice(-CONFIG.HISTORY_LIMIT);
      this.persistToStorage();
    }
    TerminalState.historyIdx = history.length;
  },

  loadFromStorage() {
    try {
      const saved = JSON.parse(sessionStorage.getItem(CONFIG.STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) {
        TerminalState.history = saved.slice(-CONFIG.HISTORY_LIMIT);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  },

  persistToStorage() {
    try {
      sessionStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(TerminalState.history));
    } catch (err) {
      console.error('Failed to save history:', err);
    }
  },

  up() {
    if (!TerminalState.history.length) return;
    TerminalState.historyIdx = Math.max(0, TerminalState.historyIdx - 1);
    this.replaceBuffer(TerminalState.history[TerminalState.historyIdx] || '');
  },

  down() {
    if (!TerminalState.history.length) return;
    TerminalState.historyIdx = Math.min(TerminalState.history.length, TerminalState.historyIdx + 1);
    this.replaceBuffer(TerminalState.history[TerminalState.historyIdx] || '');
  },

  replaceBuffer(text) {
    while (TerminalState.buffer.length > 0) {
      TerminalUI.write('\b \b');
      TerminalState.buffer = TerminalState.buffer.slice(0, -1);
    }
    TerminalState.buffer = text;
    TerminalState.cursorPos = text.length;
    TerminalUI.write(text);
  }
};

// Tab autocomplete - completes commands and file paths
const Autocomplete = {
  async execute() {
    // Only use text UP TO cursor position
    const textUpToCursor = TerminalState.buffer.slice(0, TerminalState.cursorPos);
    const pieces = textUpToCursor.trim().split(/\s+/);
    const isFirst = pieces.length <= 1;
    const current = pieces[pieces.length - 1] || '';

    let choices = [];
    let prefix = current; // For filtering matches

    if (isFirst) {
      // Command autocomplete - synchronous
      choices = getAllCommands();
    } else {
      // Path autocomplete - async, queries server
      const slash = current.lastIndexOf('/');
      prefix = slash >= 0 ? current.slice(slash + 1) : current;

      // Get current scenario for server query
      const currentScenario = getCurrentScenario();
      const scenarioCode = currentScenario?.id;

      choices = await VFSManager.listCandidates(current || '', TerminalState.cwd, scenarioCode);
    }

    const matches = choices.filter(c => c.startsWith(prefix));

    if (matches.length === 1) {
      await this.fillMatch(matches[0], current, isFirst, pieces);
    } else if (matches.length > 1) {
      TerminalUI.write('\r\n');
      matches.forEach(m => TerminalUI.writeLine(m));
      TerminalUI.prompt();
      TerminalUI.write(TerminalState.buffer);
      TerminalState.cursorPos = TerminalState.buffer.length;
    }
  },

  async fillMatch(match, current, isFirst, pieces) {
    // For commands, slice normally. For paths, only slice the basename prefix
    let fill;
    if (isFirst) {
      fill = match.slice(current.length);
    } else {
      // Extract just the typed prefix (after the last / in current)
      const slash = current.lastIndexOf('/');
      const typedPrefix = slash >= 0 ? current.slice(slash + 1) : current;
      fill = match.slice(typedPrefix.length);
    }
    const wasAtEnd = TerminalState.cursorPos === TerminalState.buffer.length;

    // Insert fill at cursor position
    TerminalState.buffer = TerminalState.buffer.slice(0, TerminalState.cursorPos) +
      fill +
      TerminalState.buffer.slice(TerminalState.cursorPos);
    TerminalState.cursorPos += fill.length;

    if (wasAtEnd) {
      TerminalUI.write(fill);
    } else {
      InputHandler.redrawBuffer();
    }

    if (!isFirst) {
      // Check if the completed path is a directory (query server if needed)
      const full = VFSManager.resolvePath(pieces[pieces.length - 1] + fill, TerminalState.cwd);
      const currentScenario = getCurrentScenario();
      const scenarioCode = currentScenario?.id;
      const nodeType = await VFSManager.getNodeType(full, scenarioCode);

      if (nodeType === 'dir' && !TerminalState.buffer.endsWith('/')) {
        const slash = '/';
        TerminalState.buffer = TerminalState.buffer.slice(0, TerminalState.cursorPos) +
          slash +
          TerminalState.buffer.slice(TerminalState.cursorPos);
        TerminalState.cursorPos++;

        if (TerminalState.cursorPos === TerminalState.buffer.length) {
          TerminalUI.write(slash);
        } else {
          InputHandler.redrawBuffer();
        }
      }
    }
  }
};

// Handles keyboard input - navigation, editing, special keys
const InputHandler = {
  onTermKey({ key, domEvent }) {
    const ev = domEvent;
    const canvas = document.getElementById('renderCanvas');

    // ESC: close console
    if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      toggleConsoleVisibility(false);
      this.focusCanvasWithLock(canvas);
      return;
    }

    ev.stopPropagation();

    // Ctrl+L: clear
    if (ev.ctrlKey && ev.key.toLowerCase() === 'l') {
      ev.preventDefault();
      TerminalUI.clear();
      setTimeout(() => TerminalState.term.focus(), 0);
      return;
    }

    // Ctrl+C: copy to clipboard
    if (ev.ctrlKey && ev.key.toLowerCase() === 'c') {
      ev.preventDefault();
      if (TerminalState.buffer.length > 0) {
        navigator.clipboard.writeText(TerminalState.buffer).catch(err =>
          console.error('Copy failed:', err)
        );
      }
      return;
    }

    // Ctrl+X: cut to clipboard
    if (ev.ctrlKey && ev.key.toLowerCase() === 'x') {
      ev.preventDefault();
      if (TerminalState.buffer.length > 0) {
        navigator.clipboard.writeText(TerminalState.buffer).catch(err =>
          console.error('Cut failed:', err)
        );
        this.clearBuffer();
        this.redrawBuffer();
      }
      return;
    }

    // Ctrl+V: paste from clipboard
    if (ev.ctrlKey && ev.key.toLowerCase() === 'v') {
      ev.preventDefault();
      navigator.clipboard.readText().then(text => {
        TerminalState.buffer = TerminalState.buffer.slice(0, TerminalState.cursorPos) +
          text +
          TerminalState.buffer.slice(TerminalState.cursorPos);
        TerminalState.cursorPos += text.length;
        this.redrawBuffer();
      }).catch(err => console.error('Paste failed:', err));
      return;
    }

    // Arrow Up: history (only when cursor is at end)
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (TerminalState.cursorPos === TerminalState.buffer.length) {
        HistoryManager.up();
      }
      setTimeout(() => TerminalState.term.focus(), 0);
      return;
    }

    // Arrow Down: history (only when cursor is at end)
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      if (TerminalState.cursorPos === TerminalState.buffer.length) {
        HistoryManager.down();
      }
      setTimeout(() => TerminalState.term.focus(), 0);
      return;
    }

    // Arrow Left: move cursor left
    if (ev.key === 'ArrowLeft') {
      ev.preventDefault();
      if (TerminalState.cursorPos > 0) {
        TerminalState.cursorPos--;
        TerminalUI.write('\b');
      }
      return;
    }

    // Arrow Right: move cursor right
    if (ev.key === 'ArrowRight') {
      ev.preventDefault();
      if (TerminalState.cursorPos < TerminalState.buffer.length) {
        TerminalUI.write(TerminalState.buffer[TerminalState.cursorPos]);
        TerminalState.cursorPos++;
      }
      return;
    }

    // Home: move cursor to start
    if (ev.key === 'Home') {
      ev.preventDefault();
      while (TerminalState.cursorPos > 0) {
        TerminalUI.write('\b');
        TerminalState.cursorPos--;
      }
      return;
    }

    // End: move cursor to end
    if (ev.key === 'End') {
      ev.preventDefault();
      while (TerminalState.cursorPos < TerminalState.buffer.length) {
        TerminalUI.write(TerminalState.buffer[TerminalState.cursorPos]);
        TerminalState.cursorPos++;
      }
      return;
    }

    // Tab: autocomplete
    if (ev.key === 'Tab') {
      ev.preventDefault();
      Autocomplete.execute().catch(err => {
        console.error('[Autocomplete] Error:', err);
      });
      setTimeout(() => TerminalState.term.focus(), 0);
      return;
    }

    // Enter: execute
    if (ev.key === 'Enter') {
      ev.preventDefault();
      TerminalState.term.write('\r\n');
      const line = TerminalState.buffer.trim();
      TerminalState.buffer = '';
      TerminalState.cursorPos = 0;

      // Execute async - prompt is shown inside CommandExecutor after completion
      CommandExecutor.execute(line).catch(err => {
        console.error('[Console] Command execution error:', err);
        TerminalUI.writeLine(`Error: ${err.message || 'Command execution failed'}`);
        TerminalUI.prompt();
        setTimeout(() => TerminalState.term.focus(), 0);
      });

      return;
    }

    // Backspace
    if (ev.key === 'Backspace') {
      ev.preventDefault();
      if (TerminalState.cursorPos > 0) {
        const wasAtEnd = TerminalState.cursorPos === TerminalState.buffer.length;
        TerminalState.buffer = TerminalState.buffer.slice(0, TerminalState.cursorPos - 1) +
          TerminalState.buffer.slice(TerminalState.cursorPos);
        TerminalState.cursorPos--;

        // If at end, just do simple backspace. If in middle, redraw.
        if (wasAtEnd) {
          TerminalUI.write('\b \b');
        } else {
          this.redrawBuffer();
        }
      }
      return;
    }

    // Delete: remove character at cursor
    if (ev.key === 'Delete') {
      ev.preventDefault();
      if (TerminalState.cursorPos < TerminalState.buffer.length) {
        const wasAtEnd = TerminalState.cursorPos === TerminalState.buffer.length - 1;
        TerminalState.buffer = TerminalState.buffer.slice(0, TerminalState.cursorPos) +
          TerminalState.buffer.slice(TerminalState.cursorPos + 1);

        // If deleting last char, simple delete. If in middle, redraw.
        if (wasAtEnd) {
          TerminalUI.write(' \b');
        } else {
          this.redrawBuffer();
        }
      }
      return;
    }

    // Printable characters
    const printable = !ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.key.length === 1;
    if (printable) {
      ev.preventDefault();
      const wasAtEnd = TerminalState.cursorPos === TerminalState.buffer.length;
      TerminalState.buffer = TerminalState.buffer.slice(0, TerminalState.cursorPos) +
        ev.key +
        TerminalState.buffer.slice(TerminalState.cursorPos);
      TerminalState.cursorPos++;

      // If at end, just write the character. If in middle, redraw entire line.
      if (wasAtEnd) {
        TerminalUI.write(ev.key);
      } else {
        this.redrawBuffer();
      }
    }
  },

  clearBuffer() {
    while (TerminalState.cursorPos > 0) {
      TerminalUI.write('\b \b');
      TerminalState.cursorPos--;
    }
    while (TerminalState.buffer.length > 0) {
      TerminalUI.write(' \b');
      TerminalState.buffer = TerminalState.buffer.slice(0, -1);
    }
  },

  redrawBuffer() {
    const bufLen = TerminalState.buffer.length;
    const curPos = TerminalState.cursorPos;

    // Use absolute cursor positioning: go to start of line, redraw everything
    TerminalUI.write('\r');
    TerminalUI.write(TerminalUI.getPrompt());
    TerminalUI.write(TerminalState.buffer);

    // Clear to end of line (handles shorter buffers)
    TerminalUI.write('\x1b[K');

    // Position cursor correctly (move back from end of buffer to cursor position)
    const charsToMoveBack = bufLen - curPos;
    for (let i = 0; i < charsToMoveBack; i++) {
      TerminalUI.write('\b');
    }
  },

  focusCanvasWithLock(canvas) {
    if (!canvas) return;
    setTimeout(() => {
      canvas.focus();
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock)
        canvas.requestPointerLock();
    }, 0);
  }
};

// Executes commands - calls backend API or local handlers for non-VFS commands
const CommandExecutor = {
  async execute(line) {
    const { cmd, args, redir } = Parser.parse(line);
    if (!cmd) return;

    eventBus.emit(Events.TUTORIAL_COMMAND_TYPED, { command: cmd });

    HistoryManager.save(line);

    // Get current scenario code
    const currentScenario = getCurrentScenario();
    const scenarioCode = currentScenario?.id;

    // Commands that need backend VFS access (including forensic commands)
    const vfsCommands = ['ls', 'cd', 'pwd', 'cat', 'grep', 'mkdir', 'touch', 'rm', 'sha256sum', 'dd', 'cp'];

    // Check if this is a VFS command and we have a scenario
    if (vfsCommands.includes(cmd) && scenarioCode) {
      try {
        // Execute on backend
        const result = await consoleAPI.execute(scenarioCode, line);

        // Update local cwd to match backend
        if (result.promptPath) {
          TerminalState.cwd = result.promptPath;
        }

        // Display output or error
        if (result.error) {
          TerminalUI.writeLine(result.error);
        } else if (result.output !== undefined) {
          if (redir) {
            // Handle redirection (still local for now, could be moved to backend)
            this.handleRedirection(result.output, redir);
          } else {
            TerminalUI.writeLine(result.output);
          }
        }

        // Check task completion after command ONLY if successful
        if (!result.error) {
          await TaskManager.checkCompletion(cmd, args);
        }

        // Show prompt after command completes
        TerminalUI.prompt();
        setTimeout(() => TerminalState.term.focus(), 0);
        return;
      } catch (error) {
        // Backend execution failed - show error and return
        console.error('[Console] Backend execution failed:', error);
        TerminalUI.writeLine(`Error: ${error.message || 'Command execution failed'}`);
        TerminalUI.prompt();
        setTimeout(() => TerminalState.term.focus(), 0);
        return;
      }
    }

    // Local commands (help, echo, clear, etc.)
    const handler = getCommand(cmd);
    if (!handler) {
      TerminalUI.writeLine(`Unknown command: ${cmd}`);
      // Show prompt after error
      TerminalUI.prompt();
      setTimeout(() => TerminalState.term.focus(), 0);
      return;
    }

    try {
      let out = handler(args);
      // Handle both sync and async handlers
      if (out instanceof Promise) {
        out = await out;
      }
      if (typeof out === 'string') {
        this.handleRedirection(out, redir);
      }
      // Check task completion for local commands too
      await TaskManager.checkCompletion(cmd, args);
    } catch (err) {
      TerminalUI.writeLine(`Errore: ${err.message || err}`);
    }

    // Show prompt after command completes
    TerminalUI.prompt();
    setTimeout(() => TerminalState.term.focus(), 0);
  },

  handleRedirection(output, redir) {
    if (redir) {
      const abs = VFSManager.resolvePath(redir.path, TerminalState.cwd);
      const slot = VFSManager.ensureDirAndLeaf(abs);
      if (!slot) {
        TerminalUI.writeLine('Error: destination directory does not exist.');
      } else {
        const { dirNode, leaf } = slot;
        const prev = dirNode.children[leaf]?.type === 'file'
          ? dirNode.children[leaf].content
          : '';
        const content = redir.append ? (prev + output + '\n') : (output + '\n');
        dirNode.children[leaf] = VFSManager.makeFile(content);
      }
    } else {
      TerminalUI.writeLine(output);
    }
  }
};

// Task completion detector - checks if commands match task requirements
const TaskManager = {
  normalizePath(path) {
    return path.replace(/\/$/, '');
  },

  async checkCompletion(cmd, args) {
    const task = currentTask?.();
    if (!task) return;

    if (task.checkCommand && task.checkCommand === cmd) {
      if (task.checkArgs?.length > 0) {
        // Check for exact match first
        if (this.arraysMatch(args, task.checkArgs)) {
          await this.notifyCompletion(task);
          return;
        }

        // Check if command has no args but expected args are a single path
        // and that path matches current working directory
        if (args.length === 0 && task.checkArgs.length === 1) {
          const expectedPath = task.checkArgs[0];
          const normalizedCwd = this.normalizePath(TerminalState.cwd);
          const normalizedExpected = this.normalizePath(expectedPath);

          if (normalizedCwd === normalizedExpected) {
            await this.notifyCompletion(task);
            return;
          }
        }

        // Check if arguments match after resolving relative paths
        if (args.length === task.checkArgs.length) {
          const resolvedArgs = args.map((arg, i) => {
            // Treat last argument as potential path if it contains '/' or looks like a file
            if (i === args.length - 1 && (arg.includes('/') || arg.includes('.'))) {
              return this.normalizePath(VFSManager.resolvePath(arg, TerminalState.cwd));
            }
            return arg;
          });

          const normalizedExpected = task.checkArgs.map(arg => this.normalizePath(arg));

          if (this.arraysMatch(resolvedArgs, normalizedExpected)) {
            await this.notifyCompletion(task);
            return;
          }
        }
      } else {
        // No args expected
        await this.notifyCompletion(task);
      }
    }
  },

  async notifyCompletion(task) {
    const prevTitle = task.title;
    let shouldAdvance = false;

    // Submit task to backend if task has an ID
    if (task.id) {
      try {
        // Build answer from task checkCommand and checkArgs
        let answer = task.checkCommand;
        if (task.checkArgs && task.checkArgs.length > 0) {
          // Quote arguments that contain spaces so server can parse them correctly
          const quotedArgs = task.checkArgs.map(arg => 
            arg.includes(' ') ? `"${arg}"` : arg
          );
          answer += ' ' + quotedArgs.join(' ');
        }

        console.log('[Console] Submitting task', task.id, 'with answer:', answer);
        const result = await tasksAPI.submitTask(task.id, answer);
        console.log('[Console] Task submission result:', result);

        if (result.correct) {
          shouldAdvance = true;

          // Sync points with server's authoritative total score (includes badge points)
          // Security: Always use server-provided newTotalScore, never calculate client-side
          if (result.newTotalScore !== undefined) {
            console.log('[Console] Updating points to', result.newTotalScore, '(from server)');
            PointsBadge.setPoints(result.newTotalScore);
            // Also update navigation display
            updateNavScore(result.newTotalScore);
          } else {
            console.warn('[Console] No newTotalScore in result, cannot update points securely');
          }

          // Show badges if unlocked (with points if awarded)
          if (result.badgesUnlocked && result.badgesUnlocked.length > 0) {
            const pointsAwarded = result.pointsAwarded || 0;
            storeBadgePointsAwarded(pointsAwarded); // Store for scenario completion event

            // Identify skill badges (Hint-Free Expert, Speed Runner)
            const skillBadges = ['Hint-Free Expert', 'Speed Runner'];
            const unlockedSkillBadges = result.badgesUnlocked.filter(badge =>
              skillBadges.includes(badge)
            );

            // Get scenario badge (if any) - it's the one that's not a skill badge
            const scenarioBadge = result.badgesUnlocked.find(badge =>
              !skillBadges.includes(badge)
            );

            result.badgesUnlocked.forEach(badge => {
              // Add badge (points already included in newTotalScore from server)
              PointsBadge.addBadge(badge);
            });

            // Show individual toasts for skill badges
            if (unlockedSkillBadges.length > 0) {
              // Each skill badge is worth 30 points (Speed Runner, Hint-Free Expert)
              const skillBadgePoints = 30;

              unlockedSkillBadges.forEach(skillBadge => {
                // Show toast for skill badge
                TaskHud.toast('Badge Unlocked', skillBadge, 'badge', skillBadge, skillBadgePoints);
              });
            }

            // Show notification with points if any were awarded
            if (pointsAwarded > 0) {
              console.log('[Console] Badges awarded', pointsAwarded, 'points');
            }
          }

          // Mark task as completed in task manager
          if (task.id && window.markTaskCompleted) {
            window.markTaskCompleted(task.id);
          }
        } else {
          console.warn('[Console] Task submission marked as incorrect');
          TerminalUI.writeLine('Server validation failed. Please check your command.');
        }
      } catch (error) {
        console.error('[Console] Error submitting task to backend:', error);
        console.error('[Console] Error details:', error.message, error.stack);
        // Do NOT advance if backend submission fails
        TerminalUI.writeLine('Error submitting task to server. Please try again.');
      }
    } else {
      // Local task (no ID), always advance if check passed locally
      shouldAdvance = true;
    }

    if (shouldAdvance) {
      if (advanceTask) advanceTask();
      // Note: updateTaskHUD() removed - taskHud now listens to PROGRESS_UPDATED event from taskManager

      // Task completion is already shown via toast notification - no need for console clutter
      if (notifyComplete) notifyComplete(prevTitle, task.id);
    }
  },

  arraysMatch(a, b) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => {
      // Normalize trailing slashes when comparing paths
      const aVal = val.trim().replace(/\/$/, '');
      const bVal = b[i].trim().replace(/\/$/, '');
      return aVal === bVal;
    });
  }
};

// Shell commands: ls, cd, cat, grep, mount, scenario, etc.
function registerBuiltinCommands() {
  // help
  registerCommand('help', () => {
    return [
      'Available commands:',
      '  ls [path]       - list directory',
      '  cd <path>       - change directory',
      '  pwd             - show current directory',
      '  cat <file>      - read file',
      '  grep <pattern> <file> - search pattern in file',
      '  echo <text>     - print text',
      '  mkdir <dir>     - create directory',
      '  touch <file>    - create empty file',
      '  rm <file/dir>   - remove file or directory',
      '  clear           - clear screen',
      '  env             - show environment variables',
      '  tcpdump [opts]  - analyze packet capture (simulated)',
      '  volatility [opts] - analyze memory dump (simulated)',
      '  scenario [id]   - change scenario',
      '  progress        - show current progress'
    ].join('\n');
  });

  // echo
  registerCommand('echo', (args) => args.join(' '));

  // clear
  registerCommand('clear', () => {
    TerminalUI.clear();
    return '';
  });

  // env
  registerCommand('env', () => {
    return Object.entries(TerminalState.env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
  });

  // tcpdump
  registerCommand('tcpdump', () => {
    return [
      'Reading from capture file...',
      '10:23:45.123456 IP 192.168.1.100.54321 > 10.0.0.1.80: Flags [S], seq 123456',
      '10:23:45.234567 IP 10.0.0.1.80 > 192.168.1.100.54321: Flags [S.], seq 789012',
      '10:23:45.345678 IP 192.168.1.100.54321 > 10.0.0.1.80: Flags [.], ack 1',
      '--- Captured 3 packets ---'
    ].join('\n');
  });

  // volatility
  registerCommand('volatility', () => {
    return [
      'Volatility Framework 2.6',
      'PID   PPID  Name',
      '---   ----  ----',
      '4     0     System',
      '500   4     smss.exe',
      '600   500   csrss.exe',
      '700   500   winlogon.exe',
      '800   700   services.exe',
      '--- Found 5 processes ---'
    ].join('\n');
  });

  // scenario
  registerCommand('scenario', async (args) => {
    if (!args[0]) {
      const scenarios = getAvailableScenarios?.() || [];
      if (scenarios.length === 0) {
        return 'No scenarios available.';
      }
      return [
        'Available scenarios:',
        ...scenarios.map(s => `  ${s.id}: ${s.title} (${s.taskCount} tasks)`)
      ].join('\n');
    }

    const scenarioId = args[0];
    const success = await switchScenarioWithIntro(scenarioId);
    if (success) {
      // Note: HUD update handled by taskManager emitting PROGRESS_UPDATED event
      return `Switched to scenario: ${scenarioId}`;
    } else {
      return `Failed to switch to scenario: ${scenarioId}`;
    }
  });

  // progress
  registerCommand('progress', () => {
    const prog = getProgress?.();
    return [
      `Scenario: ${prog?.scenarioTitle || 'None'}`,
      `Progress: ${prog?.current || 0}/${prog?.total || 0} tasks (${prog?.percentage || 0}%)`
    ].join('\n');
  });

  // lsblk
  registerCommand('lsblk', async () => {
    // Get current scenario
    const currentScenario = getCurrentScenario();
    const scenarioCode = currentScenario?.id;

    let devices = window.attachedDevices || [];

    // Query server for devices if we have a scenario
    if (scenarioCode) {
      try {
        const result = await devicesAPI.getDevices(scenarioCode);
        if (result.devices) {
          // Convert server format to local cache format and update cache
          devices = result.devices.map(device => ({
            name: device.name,
            type: device.type,
            size: device.size,
            partitions: [{
              name: device.partitionName,
              size: device.size,
              mounted: device.mounted,
              mountPoint: device.mountPoint || '',
              content: device.content || {}
            }]
          }));
          window.attachedDevices = devices;
        }
      } catch (error) {
        console.warn('[Console] Failed to get devices from server, using local cache:', error);
      }
    }

    let output = 'NAME   SIZE TYPE MOUNTPOINT\nsda    256G disk /\n';

    if (devices.length > 0) {
      devices.forEach(dev => {
        // Show the device itself
        output += `${dev.name}   ${dev.size} disk\n`;
        // Show partitions if they exist
        if (dev.partitions && dev.partitions.length > 0) {
          dev.partitions.forEach(part => {
            const partMounted = part.mounted ? part.mountPoint : '';
            // Format: `      sdc1 499G part /mnt/memdump` or `      sdc1 499G part`
            output += `      ${part.name} ${part.size} part ${partMounted}\n`;
          });
        }
      });
    }

    return output.trim();
  });

  // mount
  registerCommand('mount', async (args) => {
    if (args.length < 2) {
      return 'Usage: mount [-o ro] <device> <mountpoint>\nExample: mount /dev/sdb1 /mnt/evidence\n         mount -o ro /forensic/evidence.img /mnt/evidence';
    }

    // Parse mount options (-o ro for read-only)
    let device, mountPoint;
    let readOnly = false;
    
    if (args[0] === '-o' && args[1] === 'ro') {
      // mount -o ro <device> <mountpoint>
      if (args.length < 4) {
        return 'Usage: mount -o ro <device> <mountpoint>';
      }
      readOnly = true;
      device = args[2];
      mountPoint = args[3];
    } else {
      // mount <device> <mountpoint>
      device = args[0];
      mountPoint = args[1];
    }

    // Get current scenario
    const currentScenario = getCurrentScenario();
    const scenarioCode = currentScenario?.id;

    if (!scenarioCode) {
      return 'mount: No active scenario';
    }

    // Mount on server
    // Note: We let errors bubble up so CommandExecutor can catch them
    // and prevent task completion if mount fails
    const result = await devicesAPI.mountDevice(scenarioCode, device, mountPoint);

    // Check if this is a forensic image or regular device
    const isForensicImage = device.startsWith('/forensic/') && device.endsWith('.img');
    
    // Update local cache
    const devices = window.attachedDevices || [];
    
    if (!isForensicImage) {
      const deviceName = device.replace('/dev/', '').replace(/1$/, '');
      for (const dev of devices) {
        if (dev.name === deviceName && dev.partitions) {
          const part = dev.partitions.find(p => `/dev/${p.name}` === device);
          if (part) {
            part.mounted = true;
            part.mountPoint = mountPoint;
            break;
          }
        }
      }
    }

    // Also update local VFS cache for immediate access
    const pathParts = mountPoint.split('/').filter(Boolean);
    let current = VFSManager.root;
    for (const part of pathParts) {
      if (!current.children) current.children = {};
      if (!current.children[part]) {
        current.children[part] = { type: 'dir', children: {} };
      }
      current = current.children[part];
    }

    // Get device content from server result or local cache
    const devicesResult = await devicesAPI.getDevices(scenarioCode);
    // For forensic images, get the most recently attached device's content
    const serverDevice = isForensicImage 
      ? devicesResult.devices?.[devicesResult.devices.length - 1]
      : devicesResult.devices?.find(d => d.name === device.replace('/dev/', '').replace(/1$/, ''));
      
    if (serverDevice && serverDevice.content && current.children) {
      for (const [name, data] of Object.entries(serverDevice.content)) {
        current.children[name] = VFSManager.makeFile(data);
      }
    }

    const mountMsg = readOnly 
      ? `Mounted ${device} on ${mountPoint} (read-only)` 
      : `Mounted ${device} on ${mountPoint}`;
    return result.message || mountMsg;
  });

  // umount
  registerCommand('umount', async (args) => {
    if (args.length < 1) {
      return 'Usage: umount <mountpoint>\nExample: umount /mnt/evidence';
    }

    const mountPoint = args[0];

    // Get current scenario
    const currentScenario = getCurrentScenario();
    const scenarioCode = currentScenario?.id;

    if (!scenarioCode) {
      return 'umount: No active scenario';
    }

    // Unmount on server
    // Note: We let errors bubble up so CommandExecutor can catch them
    const result = await devicesAPI.unmountDevice(scenarioCode, mountPoint);

    // Update local cache
    const devices = window.attachedDevices || [];
    for (const dev of devices) {
      if (dev.partitions) {
        for (const part of dev.partitions) {
          if (part.mountPoint === mountPoint) {
            part.mounted = false;
            part.mountPoint = '';
            break;
          }
        }
      }
    }

    return result.message || `Unmounted ${mountPoint}`;
  });

  // tutorial
  registerCommand('tutorial', () => {
    if (window.tutorial?.restart) {
      window.tutorial.restart();
      return 'Restarting tutorial...';
    }
    return 'Tutorial manager not available.';
  });
}

// Console visibility - toggling between console and 3D view
function isConsoleOpen() {
  const consoleContainer = document.getElementById('consoleContainer');
  return consoleContainer && consoleContainer.classList.contains('console-open');
}

function isTypingInXterm() {
  return document.activeElement?.classList.contains('xterm-helper-textarea');
}

export function toggleConsoleVisibility(force) {
  const consoleContainer = document.getElementById('consoleContainer');
  const canvas = document.getElementById('renderCanvas');
  const wantOpen = (typeof force === 'boolean') ? force : !isConsoleOpen();

  if (wantOpen) {
    consoleContainer.classList.add('console-open');
    document.exitPointerLock();
    TerminalManager.open();
    if (window.tutorial?.signalConsoleOpen) window.tutorial.signalConsoleOpen();
  } else {
    consoleContainer.classList.remove('console-open');
    if (canvas) {
      canvas.focus();
      if (document.pointerLockElement !== canvas && canvas.requestPointerLock)
        canvas.requestPointerLock();
    }
  }
}

// Manages terminal instance lifecycle - initialization, focus, resize
const TerminalManager = {
  open() {
    if (!TerminalState.term) {
      TerminalState.term = new Terminal(CONFIG.TERMINAL_CONFIG);
      TerminalState.fitAddon = new FitAddon();
      TerminalState.term.loadAddon(TerminalState.fitAddon);
      TerminalState.term.open(document.getElementById('terminal'));
      TerminalState.fitAddon.fit();

      TerminalUI.writeLine("Forensic Shell v0.3  type 'help' for commands.");
      TerminalUI.prompt();

      TerminalState.term.onKey((ev) => InputHandler.onTermKey(ev));
      addEventListener('resize', () => TerminalState.fitAddon?.fit());
    } else {
      TerminalState.fitAddon.fit();
    }
    TerminalState.buffer = '';
    TerminalState.cursorPos = 0;
    setTimeout(() => TerminalState.term.focus(), 0);
  }
};

// Public API - initialization entry point
export function initConsole() {
  try {
    VFSManager.initialize();
    HistoryManager.loadFromStorage();
    registerBuiltinCommands();

    // Expose VFS mount function to window for task manager to auto-mount devices
    window.updateVFSWithDevice = (mountPath, content) => {
      VFSManager.mountDeviceContent(mountPath, content);
    };

    // Ensure console starts hidden (use class-based control)
    const consoleContainer = document.getElementById('consoleContainer');
    if (consoleContainer) {
      consoleContainer.classList.remove('console-open');
    }

    const closeBtn = document.getElementById('closeConsoleBtn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => toggleConsoleVisibility(false));
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && isConsoleOpen() && !isTypingInXterm()) {
        e.preventDefault();
        toggleConsoleVisibility(false);
      }
    });

    // Listen to console toggle events from rendering layer (interaction.js)
    eventBus.on(Events.CONSOLE_TOGGLE, (data) => {
      const shouldOpen = data?.open !== undefined ? data.open : !isConsoleOpen();
      console.log(`[Console] Toggle event received - open: ${shouldOpen}`);
      toggleConsoleVisibility(shouldOpen);
    });

    // Listen to scenario changes to register custom commands
    eventBus.on(Events.SCENARIO_CHANGED, (data) => {
      console.log(`[Console] Scenario changed: ${data?.scenarioId}`);

      // Clean up custom commands from previous scenario
      unregisterCustomCommands();

      // Register new custom commands from the new scenario
      if (data?.scenario?.customCommands) {
        registerCustomCommands(data.scenario.customCommands);
      }
    });

  } catch (err) {
    console.error('Failed to initialize console:', err);
  }
}

// NOTE: HUD updates are now handled via event bus
// showTaskHUD() and hideTaskHUD() are removed - HUD listens to PROGRESS_UPDATED events

console.log('Console loaded (task system managed by taskManager.js)');
