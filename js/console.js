// Forensic Shell - Terminal emulator for the 3D forensic investigation environment
import 'xterm/css/xterm.css';
import { Terminal } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { 
  currentTask, advanceTask, getAvailableScenarios, notifyComplete, 
  switchScenario, switchScenarioWithIntro, getProgress 
} from './taskManager.js';
import { eventBus, Events } from './eventBus.js';

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

// Virtual File System - manages the simulated forensic file structure
const VFSManager = {
  root: null,

  initialize() {
    this.root = {
      type: 'dir',
      children: {
        home: {
          type: 'dir',
          children: {
            user: {
              type: 'dir',
              children: {
                'README.txt': this.makeFile('Welcome to the Forensic Shell. \nExplore the file system and complete the tasks.')
              }
            }
          }
        },
        evidence: {
          type: 'dir',
          children: {
            'log.txt': this.makeFile('2024-01-15 10:23:45 - Login attempt from 192.168.1.100\n2024-01-15 10:24:01 - Failed password for admin\n2024-01-15 10:25:12 - Successful login for admin\npassword: hunter2'),
            '.hidden': this.makeFile('This is a hidden file with sensitive data.'),
            'report.pdf': this.makeFile('[Binary file - PDF document]')
          }
        },
        captures: {
          type: 'dir',
          children: {
            'traffic.pcap': this.makeFile('[Binary packet capture file]')
          }
        },
        memory: {
          type: 'dir',
          children: {
            'dump.raw': this.makeFile('[Binary memory dump]')
          }
        },
        tmp: { type: 'dir', children: {} }
      }
    };
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

  listCandidates(partial, base) {
    const slash = partial.lastIndexOf('/');
    let dirPath = base;
    let prefix = partial;
    if (slash >= 0) {
      dirPath = this.resolvePath(partial.slice(0, slash + 1), base);
      prefix = partial.slice(slash + 1);
    }
    const node = this.getNode(dirPath);
    if (!node || node.type !== 'dir') return [];
    return Object.keys(node.children).filter(name => name.startsWith(prefix));
  }
};

// Registry for all available shell commands
const CommandRegistry = new Map();

function registerCommand(name, handler) {
  CommandRegistry.set(name, handler);
}

function getCommand(name) {
  return CommandRegistry.get(name);
}

function getAllCommands() {
  return Array.from(CommandRegistry.keys());
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
      const saved = JSON.parse(localStorage.getItem(CONFIG.STORAGE_KEY) || '[]');
      if (Array.isArray(saved)) {
        TerminalState.history = saved.slice(-CONFIG.HISTORY_LIMIT);
      }
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  },

  persistToStorage() {
    try {
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(TerminalState.history));
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
  execute() {
    const pieces = TerminalState.buffer.trim().split(/\s+/);
    const isFirst = pieces.length <= 1;
    const current = pieces[pieces.length - 1] || '';

    let choices = [];
    if (isFirst) {
      choices = getAllCommands();
    } else {
      choices = VFSManager.listCandidates(current || '', TerminalState.cwd);
    }

    const matches = choices.filter(c => c.startsWith(current));

    if (matches.length === 1) {
      this.fillMatch(matches[0], current, isFirst, pieces);
    } else if (matches.length > 1) {
      TerminalUI.write('\r\n');
      matches.forEach(m => TerminalUI.writeLine(m));
      TerminalUI.prompt();
      TerminalUI.write(TerminalState.buffer);
      TerminalState.cursorPos = TerminalState.buffer.length;
    }
  },

  fillMatch(match, current, isFirst, pieces) {
    const fill = match.slice(current.length);
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
      const full = VFSManager.resolvePath(pieces[pieces.length - 1] + fill, TerminalState.cwd);
      const node = VFSManager.getNode(full);
      if (node && node.type === 'dir' && !TerminalState.buffer.endsWith('/')) {
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

    // Arrow Up: history
    if (ev.key === 'ArrowUp') {
      ev.preventDefault();
      HistoryManager.up();
      setTimeout(() => TerminalState.term.focus(), 0);
      return;
    }

    // Arrow Down: history
    if (ev.key === 'ArrowDown') {
      ev.preventDefault();
      HistoryManager.down();
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
      Autocomplete.execute();
      setTimeout(() => TerminalState.term.focus(), 0);
      return;
    }

    // Enter: execute
    if (ev.key === 'Enter') {
      ev.preventDefault();
      TerminalState.term.write('\r\n');
      const line = TerminalState.buffer.trim();
      CommandExecutor.execute(line);
      TerminalState.buffer = '';
      TerminalState.cursorPos = 0;
      TerminalUI.prompt();
      setTimeout(() => TerminalState.term.focus(), 0);
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
    // Move cursor to start
    for (let i = 0; i < TerminalState.cursorPos; i++) {
      TerminalUI.write('\b');
    }
    // Clear rest of line
    for (let i = 0; i < TerminalState.buffer.length; i++) {
      TerminalUI.write(' ');
    }
    // Move cursor back to start
    for (let i = 0; i < TerminalState.buffer.length; i++) {
      TerminalUI.write('\b');
    }
    // Redraw buffer
    TerminalUI.write(TerminalState.buffer);
    // Move cursor to correct position
    for (let i = TerminalState.cursorPos; i < TerminalState.buffer.length; i++) {
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

// Executes commands - calls handlers, manages output redirection
const CommandExecutor = {
  execute(line) {
    const { cmd, args, redir } = Parser.parse(line);
    if (!cmd) return;

    if (window.tutorial?.signalTyped) window.tutorial.signalTyped(cmd);

    HistoryManager.save(line);
    TaskManager.checkCompletion(cmd, args);

    const handler = getCommand(cmd);
    if (!handler) {
      TerminalUI.writeLine(`Unknown command: ${cmd}`);
      return;
    }

    try {
      let out = handler(args);
      if (typeof out === 'string') {
        this.handleRedirection(out, redir);
      }
    } catch (err) {
      TerminalUI.writeLine(`Errore: ${err.message || err}`);
    }
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
  checkCompletion(cmd, args) {
    const task = currentTask?.();
    if (!task) return;

    if (task.checkCommand && task.checkCommand === cmd) {
      if (task.checkArgs?.length > 0 && !this.arraysMatch(args, task.checkArgs)) {
        return;
      }

      this.notifyCompletion(task);
    }
  },

  notifyCompletion(task) {
    const prevTitle = task.title;
    if (advanceTask) advanceTask();
    // Note: updateTaskHUD() removed - taskHud now listens to PROGRESS_UPDATED event from taskManager
    
    TerminalUI.writeLine(`\nTask completed: ${prevTitle}`);
    const next = currentTask?.();
    
    if (next) {
      TerminalUI.writeLine(`Next: ${next.title}  ${next.details}\n`);
    } else {
      TerminalUI.writeLine('All tasks completed. \n');
    }

    if (notifyComplete) notifyComplete(prevTitle);
  },

  arraysMatch(a, b) {
    if (a.length !== b.length) return false;
    return a.every((val, i) => val.trim() === b[i].trim());
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

  // ls
  registerCommand('ls', (args) => {
    const target = args[0] || '.';
    const showAll = args.includes('-la') || args.includes('-a');
    const abs = VFSManager.resolvePath(target, TerminalState.cwd);
    const node = VFSManager.getNode(abs);

    if (!node) return `ls: ${target}: No such file or directory`;
    if (node.type === 'file') return abs.split('/').pop();

    const entries = Object.keys(node.children).filter(name => {
      if (showAll) return true;
      return !name.startsWith('.');
    });

    return entries.length > 0 ? entries.join('\n') : '';
  });

  // cd
  registerCommand('cd', (args) => {
    if (!args[0]) {
      TerminalState.cwd = TerminalState.env.HOME || '/home/user';
      return '';
    }
    const target = VFSManager.resolvePath(args[0], TerminalState.cwd);
    const node = VFSManager.getNode(target);
    if (!node) return `cd: ${args[0]}: No such directory`;
    if (node.type !== 'dir') return `cd: ${args[0]}: Not a directory`;
    TerminalState.cwd = target;
    return '';
  });

  // pwd
  registerCommand('pwd', () => TerminalState.cwd);

  // cat
  registerCommand('cat', (args) => {
    if (!args[0]) return 'cat: missing operand';
    const abs = VFSManager.resolvePath(args[0], TerminalState.cwd);
    const node = VFSManager.getNode(abs);
    if (!node) return `cat: ${args[0]}: No such file`;
    if (node.type !== 'file') return `cat: ${args[0]}: Is a directory`;
    return node.content;
  });

  // grep
  registerCommand('grep', (args) => {
    if (args.length < 2) return 'grep: missing pattern or file';
    const pattern = args[0];
    const file = args[1];
    const abs = VFSManager.resolvePath(file, TerminalState.cwd);
    const node = VFSManager.getNode(abs);
    if (!node || node.type !== 'file') return `grep: ${file}: No such file`;
    
    const lines = node.content.split('\n');
    const matches = lines.filter(line => line.includes(pattern));
    return matches.length > 0 ? matches.join('\n') : '';
  });

  // echo
  registerCommand('echo', (args) => args.join(' '));

  // mkdir
  registerCommand('mkdir', (args) => {
    if (!args[0]) return 'mkdir: missing operand';
    const abs = VFSManager.resolvePath(args[0], TerminalState.cwd);
    const slot = VFSManager.ensureDirAndLeaf(abs);
    if (!slot) return 'mkdir: cannot create directory';
    const { dirNode, leaf } = slot;
    if (dirNode.children[leaf]) return `mkdir: ${args[0]}: File exists`;
    dirNode.children[leaf] = { type: 'dir', children: {} };
    return '';
  });

  // touch
  registerCommand('touch', (args) => {
    if (!args[0]) return 'touch: missing operand';
    const abs = VFSManager.resolvePath(args[0], TerminalState.cwd);
    const slot = VFSManager.ensureDirAndLeaf(abs);
    if (!slot) return 'touch: cannot create file';
    const { dirNode, leaf } = slot;
    if (!dirNode.children[leaf]) dirNode.children[leaf] = VFSManager.makeFile('');
    return '';
  });

  // rm
  registerCommand('rm', (args) => {
    if (!args[0]) return 'rm: missing operand';
    const abs = VFSManager.resolvePath(args[0], TerminalState.cwd);
    const slot = VFSManager.ensureDirAndLeaf(abs);
    if (!slot) return `rm: ${args[0]}: No such file or directory`;
    const { dirNode, leaf } = slot;
    if (!dirNode.children[leaf]) return `rm: ${args[0]}: No such file or directory`;
    delete dirNode.children[leaf];
    return '';
  });

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
  registerCommand('lsblk', () => {
    const devices = window.attachedDevices || [];
    if (devices.length === 0) {
      return 'NAME   SIZE TYPE MOUNTPOINT\nsda    256G disk /';
    }

    let output = 'NAME   SIZE TYPE MOUNTPOINT\nsda    256G disk /\n';
    devices.forEach(dev => {
      const mounted = dev.mounted ? dev.mountPoint : '';
      output += `${dev.name}   ${dev.size} disk ${mounted}\n`;
      if (dev.partitions) {
        dev.partitions.forEach(part => {
          const partMounted = part.mounted ? part.mountPoint : '';
          output += `+-${part.name} ${part.size} part ${partMounted}\n`;
        });
      }
    });
    return output;
  });

  // mount
  registerCommand('mount', (args) => {
    if (args.length < 2) {
      return 'Usage: mount <device> <mountpoint>\nExample: mount /dev/sdb1 /mnt/evidence';
    }

    const device = args[0];
    const mountPoint = args[1];
    const devices = window.attachedDevices || [];
    let deviceFound = null;

    for (const dev of devices) {
      if (dev.partitions) {
        const part = dev.partitions.find(p => `/dev/${p.name}` === device);
        if (part) {
          deviceFound = part;
          break;
        }
      }
    }

    if (!deviceFound) {
      return `mount: ${device}: No such device\nUsa 'lsblk' per vedere i dispositivi disponibili`;
    }

    if (deviceFound.mounted) {
      return `mount: ${device}: already mounted on ${deviceFound.mountPoint}`;
    }

    // Create mount point in VFS
    const pathParts = mountPoint.split('/').filter(Boolean);
    let current = VFSManager.root;

    for (const part of pathParts) {
      if (!current.children) current.children = {};
      if (!current.children[part]) {
        current.children[part] = { type: 'dir', children: {} };
      }
      current = current.children[part];
    }

    // Add device content
    if (deviceFound.content && current.children) {
      for (const [name, data] of Object.entries(deviceFound.content)) {
        current.children[name] = VFSManager.makeFile(data);
      }
    }

    deviceFound.mounted = true;
    deviceFound.mountPoint = mountPoint;

    return ` Mounted ${device} on ${mountPoint}`;
  });

  // umount
  registerCommand('umount', (args) => {
    if (args.length < 1) {
      return 'Usage: umount <mountpoint>\nExample: umount /mnt/evidence';
    }

    const mountPoint = args[0];
    const devices = window.attachedDevices || [];
    let found = false;

    for (const dev of devices) {
      if (dev.partitions) {
        for (const part of dev.partitions) {
          if (part.mountPoint === mountPoint) {
            part.mounted = false;
            part.mountPoint = '';
            found = true;
            break;
          }
        }
      }
    }

    if (!found) {
      return `umount: ${mountPoint}: not mounted`;
    }

    return ` Unmounted ${mountPoint}`;
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

  } catch (err) {
    console.error('Failed to initialize console:', err);
  }
}

// NOTE: HUD updates are now handled via event bus
// showTaskHUD() and hideTaskHUD() are removed - HUD listens to PROGRESS_UPDATED events

console.log('Console loaded (task system managed by taskManager.js)');
