/**
 * Console routes
 * * POST /api/console/execute - Execute console command
 * * All command execution happens server-side. Client only displays output.
 */

import express from 'express';
import { getDb } from '../db/db.js';
import { authenticate } from '../middleware/auth.js';
import { getVFS, updateVFS, resolvePath, normalizePath, getNode } from '../vfs/vfs.js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCENARIOS_PATH = join(__dirname, '../../data/scenarios.json');

// Load scenarios for custom commands
let scenariosData = null;
try {
  scenariosData = JSON.parse(readFileSync(SCENARIOS_PATH, 'utf-8'));
} catch (error) {
  console.error('Error loading scenarios:', error);
}

/**
 * Execute console command
 * POST /api/console/execute
 * Body: { scenarioCode, command }
 */
router.post('/execute', authenticate, async (req, res) => {
  try {
    const { scenarioCode, command } = req.body;
    const userId = req.user.id || req.user.userId;

    if (!scenarioCode || !command) {
      return res.status(400).json({ error: 'scenarioCode and command are required' });
    }

    // Get or initialize VFS
    const { vfs, cwd } = await getVFS(userId, scenarioCode);

    // Parse command
    const { cmd, args } = parseCommand(command);

    // Execute command
    const result = executeCommand(cmd, args, vfs, cwd, scenarioCode);

    // Update VFS if cwd changed
    if (result.newCwd && result.newCwd !== cwd) {
      await updateVFS(userId, scenarioCode, { cwd: result.newCwd });
    }

    // Update VFS structure if modified
    if (result.vfsModified) {
      await updateVFS(userId, scenarioCode, { vfs });
    }

    res.json({
      output: result.output || '',
      error: result.error || null,
      promptPath: result.newCwd || cwd
    });
  } catch (error) {
    console.error('Console execution error:', error);
    res.status(500).json({ error: 'Command execution failed' });
  }
});

/**
 * Parse command line into command and arguments
 */
function parseCommand(line) {
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

  const cmd = tokens[0] || '';
  const args = tokens.slice(1);

  return { cmd, args };
}

/**
 * Execute command against VFS
 */
function executeCommand(cmd, args, vfs, cwd, scenarioCode) {
  let output = '';
  let error = null;
  let newCwd = cwd;
  let vfsModified = false;

  switch (cmd) {
    case 'pwd':
      output = cwd;
      break;

    case 'ls':
      {
        const target = args[0] || '.';
        const showAll = args.includes('-la') || args.includes('-a');
        const abs = target === '.' ? cwd : resolvePath(target, cwd);
        const node = getNode(vfs, abs);

        if (!node) {
          error = `ls: ${target}: No such file or directory`;
        } else if (node.type === 'file') {
          output = abs.split('/').pop();
        } else {
          const entries = Object.keys(node.children || {}).filter(name => {
            if (showAll) return true;
            return !name.startsWith('.');
          });
          output = entries.length > 0 ? entries.join('\n') : '';
        }
      }
      break;

    case 'cd':
      {
        if (!args[0]) {
          newCwd = '/home/user';
        } else {
          const target = resolvePath(args[0], cwd);
          const node = getNode(vfs, target);
          if (!node) {
            error = `cd: ${args[0]}: No such directory`;
          } else if (node.type !== 'dir') {
            error = `cd: ${args[0]}: Not a directory`;
          } else {
            newCwd = target;
          }
        }
      }
      break;

    case 'cat':
      {
        if (!args[0]) {
          error = 'cat: missing operand';
        } else {
          const abs = resolvePath(args[0], cwd);
          const node = getNode(vfs, abs);
          if (!node) {
            error = `cat: ${args[0]}: No such file`;
          } else if (node.type === 'file') {
            output = node.content || '';
          } else {
            error = `cat: ${args[0]}: Is a directory`;
          }
        }
      }
      break;

    case 'grep':
      {
        if (args.length < 2) {
          error = 'grep: missing pattern or file';
        } else {
          const pattern = args[0];
          const file = args[1];
          const abs = resolvePath(file, cwd);
          const node = getNode(vfs, abs);
          if (!node || node.type !== 'file') {
            error = `grep: ${file}: No such file`;
          } else {
            const lines = (node.content || '').split('\n');
            const matches = lines.filter(line => line.includes(pattern));
            output = matches.length > 0 ? matches.join('\n') : '';
          }
        }
      }
      break;

    case 'echo':
      output = args.join(' ');
      break;

    case 'clear':
      // No-op on server (client handles it)
      output = '';
      break;

    case 'mkdir':
      {
        if (!args[0]) {
          error = 'mkdir: missing operand';
        } else {
          const abs = resolvePath(args[0], cwd);
          const pathParts = abs.split('/').filter(Boolean);
          if (pathParts.length === 0) {
            error = 'mkdir: cannot create root directory';
          } else {
            let current = vfs;
            // Navigate to parent directory
            for (let i = 0; i < pathParts.length - 1; i++) {
              if (!current.children || !current.children[pathParts[i]]) {
                error = `mkdir: ${args[0]}: No such file or directory`;
                break;
              }
              current = current.children[pathParts[i]];
              if (current.type !== 'dir') {
                error = `mkdir: ${args[0]}: Not a directory`;
                break;
              }
            }
            if (!error) {
              const dirName = pathParts[pathParts.length - 1];
              if (!current.children) current.children = {};
              if (current.children[dirName]) {
                error = `mkdir: ${args[0]}: File exists`;
              } else {
                current.children[dirName] = { type: 'dir', children: {} };
                vfsModified = true;
              }
            }
          }
        }
      }
      break;

    case 'touch':
      {
        if (!args[0]) {
          error = 'touch: missing operand';
        } else {
          const abs = resolvePath(args[0], cwd);
          const pathParts = abs.split('/').filter(Boolean);
          if (pathParts.length === 0) {
            error = 'touch: cannot create root';
          } else {
            let current = vfs;
            // Navigate to parent directory
            for (let i = 0; i < pathParts.length - 1; i++) {
              if (!current.children || !current.children[pathParts[i]]) {
                error = `touch: ${args[0]}: No such file or directory`;
                break;
              }
              current = current.children[pathParts[i]];
              if (current.type !== 'dir') {
                error = `touch: ${args[0]}: Not a directory`;
                break;
              }
            }
            if (!error) {
              const fileName = pathParts[pathParts.length - 1];
              if (!current.children) current.children = {};
              if (!current.children[fileName]) {
                current.children[fileName] = { type: 'file', content: '' };
                vfsModified = true;
              }
              // touch updates timestamp even if file exists (we just do nothing)
            }
          }
        }
      }
      break;

    case 'rm':
      {
        if (!args[0]) {
          error = 'rm: missing operand';
        } else {
          const abs = resolvePath(args[0], cwd);
          const pathParts = abs.split('/').filter(Boolean);
          if (pathParts.length === 0) {
            error = 'rm: cannot remove root';
          } else {
            let current = vfs;
            // Navigate to parent directory
            for (let i = 0; i < pathParts.length - 1; i++) {
              if (!current.children || !current.children[pathParts[i]]) {
                error = `rm: ${args[0]}: No such file or directory`;
                break;
              }
              current = current.children[pathParts[i]];
            }
            if (!error) {
              const name = pathParts[pathParts.length - 1];
              if (!current.children || !current.children[name]) {
                error = `rm: ${args[0]}: No such file or directory`;
              } else {
                delete current.children[name];
                vfsModified = true;
              }
            }
          }
        }
      }
      break;

    case 'help':
      output = [
        'Available commands:',
        '  ls [path]       - list directory',
        '  cd <path>        - change directory',
        '  pwd              - show current directory',
        '  cat <file>       - read file',
        '  grep <pattern> <file> - search pattern in file',
        '  echo <text>      - print text',
        '  mkdir <dir>      - create directory',
        '  touch <file>     - create empty file',
        '  rm <file/dir>    - remove file or directory',
        '  clear            - clear screen',
        '  help             - show this help'
      ].join('\n');
      break;

    default:
      // Check for custom commands from scenario
      if (scenariosData && scenariosData[scenarioCode] && scenariosData[scenarioCode].customCommands) {
        const customCmd = scenariosData[scenarioCode].customCommands.find(c => c.name === cmd);
        if (customCmd) {
          // Handle commands that require specific arguments
          if (customCmd.requiresArgs && customCmd.validArgs) {
            // Join args to match against validArgs keys
            const argsKey = args.join(' ');
            
            if (args.length === 0) {
              // No args provided - show usage/help output
              output = customCmd.output || `Usage: ${cmd} <args>`;
            } else if (customCmd.validArgs[argsKey]) {
              // Exact match found in validArgs
              output = customCmd.validArgs[argsKey];
            } else {
              // Args provided but not valid - show error with usage
              error = `${cmd}: invalid arguments\n${customCmd.output || ''}`;
            }
            break;
          }
          
          // Support simple templating: {arg0}, {arg1}, etc.
          let result = customCmd.output || '';
          args.forEach((arg, idx) => {
            result = result.replace(new RegExp(`\\{arg${idx}\\}`, 'g'), arg);
          });
          output = result;
          break;
        }
      }
      error = `Unknown command: ${cmd}`;
  }

  return { output, error, newCwd, vfsModified };
}

export { router as consoleRoutes };