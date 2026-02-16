- [Overview](#overview)
- [Key Features](#key-features)
- [Getting Started](#getting-started)
- [System Requirements](#system-requirements)
- [Controls and Interface](#controls-and-interface)
- [Architecture](#architecture)
- [Backend Architecture](#backend-architecture)
- [API Documentation](#api-documentation)
- [Database Schema](#database-schema)
- [Teachers' Guide: Adding Scenarios](#teachers-guide-adding-scenarios)
- [Admin Dashboard](#admin-dashboard)
- [Technologies](#technologies)
- [Contributions and Feedback](#contributions-and-feedback)
- [Contact and Support](#contact-and-support)
- [License](#license)

---

## Overview

**CyberForensics Arena** is an educational prototype that simulates a forensic investigation office. Users can:

- Move in **first-person perspective** within a realistic 3D environment
- Interact with **investigative objects** and IT infrastructure
- Complete **progressive investigative tasks** using a simulated Linux console
- Learn **digital forensics fundamentals** in an engaging way

**Designed for:**
- Cybersecurity and digital forensics students
- Educational institutions and university courses
- Professionals who want to learn interactively

---

## Key Features

###      1. Navigable 3D Environment

A fully 3D forensic office with:
- Workstation with computer
- General laboratory features
- Carts for evidence and artifacts
- IT infrastructure (servers, routers, network devices)
- Dynamic lighting and realistic atmosphere

###      2. Simulated Linux Console

An interactive console that offers:
- Support for essential Linux commands: `ls`, `cd`, `cat`, `grep`,  `help`, `clear`, `pwd`, `echo`, `mkdir`, `touch`, `rm`, `env`, `lsblk`,`mount`,`tcpdump`, `volatility`, `scenario`, `progress`
- Navigable command history (up/down arrows)
- Tab autocomplete
- Copy/paste (select text, Ctrl+V to paste)
- Simulated file system with realistic hierarchical structure

###      3. Progressive Task System

Three **independent investigative scenarios** with progressive tasks:

**1. File System Forensic** (17 tasks)
- Connect external hard drive
- List devices with `lsblk`
- Mount the partition
- Explore the file system
- Read suspicious log files
- Use `grep` to extract critical information

**2. Network Forensic** (14 tasks)
- Connect to remote server via SSH
- List system logs
- Read authentication logs
- Search for failed login attempts
- Analyze traffic capture with tcpdump

**3. Memory Forensic** (15 tasks)
- Connect hard drive with memory dump
- Verify connected devices
- Mount the partition with dump
- List memory files
- Analyze suspicious processes
- Use Volatility for advanced analysis

###      4. Gamification Elements

- **Linear Progression**: Sequential tasks with immediate feedback
- **Toast Notifications**: Visual notifications for completed actions and feedback
- **Coherent Narration**: A realistic investigative story
- **Incentivized Exploration**: 3D environment that invites discovery
- **Clear Instructions**: Visible objectives in the HUD in real time
- **Interactive Tutorial**: Initial guide for new users
- **Leaderboard**: Compete with other users based on total score
- **Badges**: Earn achievements for completing scenarios and special challenges

###        5. Task Management System

- Collapsible HUD showing current task
- Progress bar for completion
- Toast notifications for real-time feedback
- Scenario management via JSON file

###      6. Mini-Games

Interactive hacking sequences that add engagement:

**Memory Dump Analyzer (Decryption Game)**
- Search for hex signatures in simulated memory dumps
- Find PE headers and malware signatures
- Time-limited challenge with hints

**Signal Tracing Game**
- Trace network signals through a visual grid
- Navigate obstacles to reach the target
- Tests pattern recognition and planning skills


###      7. Leaderboard System

- Real-time leaderboard showing top performers
- Combined scoring from task completions and badge points
- Cached for performance (10-second TTL)
- Displays display name, total score, and tasks completed

###      8. Event Tracking & Analytics

Comprehensive tracking system for educational research:
- Anonymous participant IDs for privacy
- Tracks scenario starts/completions, commands executed, hints used
- Mini-game performance metrics
- Exportable data for research analysis

---

## Getting Started

###      Option 1: Live Demo (Recommended)

Simply visit: [https://edoardomaniero.github.io/CyberForensics-Arena/](https://edoardomaniero.github.io/CyberForensics-Arena/)

###         Option 2: Local Installation

#### Prerequisites

- Node.js 16+ and npm
- Git

#### Server Installation

```bash
# Clone the repository
git clone https://github.com/EdoardoManiero/CyberForensics-Arena.git
cd CyberForensics-Arena/server

# Install dependencies
npm install

# Start the backend server
npm start
# Server runs on http://localhost:3000
```

#### Client Installation

Open a new terminal window:

```bash
cd CyberForensics-Arena/client

# Install dependencies
npm install

# Start the development server
npm run dev
# Access http://localhost:5173
```

#### Production Build

To build the client for production:

```bash
cd client
npm run build
```

---

## System Requirements

###      Browser

- Chrome/Chromium
- Firefox
- Safari
- Edge

###      Hardware

- **GPU**: Graphics card with WebGL 2.0 support
- **RAM**: Minimum 4GB (recommended 8GB)
- **Processor**: Modern dual-core

###      Connection

- Minimum bandwidth: 5 Mbps (for loading 3D resources)

###        Input

- QWERTY keyboard
- Mouse or trackpad

---

## Controls and Interface

###        Navigation

| Key | Function |
|-----|----------|
| **W** | Forward |
| **A** | Left |
| **S** | Backward |
| **D** | Right |
| **Mouse** | Look around |

###      Interaction

| Key | Function |
|-----|----------|
| **E** | Interact with object (when nearby) |
| **C** | Open/Close console |
| **ESC** | Close console |
| **Tab** | Console autocomplete |
| **Alt+Shift+R** | Safe Respawn |

###      Console

| Key | Function |
|-----|----------|
| **   /   ** | Navigate command history |
| **Ctrl+V** | Paste text |
| **Ctrl+C** | Copy text |
| **Ctrl+L** | Clear Console |

---

## Architecture

###      Project Structure

```
CyberForensics-Arena/
├── client/                   # Frontend Application (Vite + Babylon.js)
│   ├── index.html            # HTML entry point
│   ├── admin.html            # Admin dashboard entry
│   ├── editor.html           # Scenario editor entry
│   ├── package.json          # Client dependencies
│   ├── vite.config.js        # Vite configuration
│   ├── public/               # Static assets (3D models, scenarios)
│   └── src/                  # Application source code
│       ├── main.js           # Entry point
│       ├── scene.js          # 3D environment setup
│       ├── interaction.js    # User interaction handling
│       ├── console.js        # Simulated Linux console
│       ├── taskManager.js    # Task management logic
│       ├── taskHud.js        # Task HUD UI
│       ├── eventBus.js       # Pub/Sub communication
│       ├── leaderboard.js    # Leaderboard UI
│       ├── profile.js        # User profile
│       ├── pointsBadge.js    # Points/badge display
│       ├── api.js            # API client
│       ├── miniGames/        # Mini-game modules
│       │   ├── MiniGameManager.js
│       │   ├── DecryptionGame.js
│       │   └── SignalTracingGame.js
│       ├── admin/            # Admin dashboard
│       │   ├── AdminApp.js
│       │   └── admin.css
│       └── editor/           # Scenario editor
│           ├── EditorApp.js
│           └── editor.css
│
├── server/                   # Backend Application (Node.js + Express)
│   ├── package.json          # Server dependencies
│   ├── jest.config.js        # Test configuration
│   ├── src/
│   │   ├── index.js          # Server entry point
│   │   ├── config/           # Configuration (Passport.js)
│   │   ├── middleware/       # Auth, rate limiting, participant ID
│   │   ├── routes/           # API endpoints
│   │   │   ├── auth.js       # Authentication
│   │   │   ├── tasks.js      # Task management
│   │   │   ├── scenarios.js  # Scenario data
│   │   │   ├── console.js    # Console commands
│   │   │   ├── devices.js    # Device management
│   │   │   ├── leaderboard.js # Leaderboard
│   │   │   ├── admin.js      # Admin endpoints
│   │   │   └── tracking.js   # Event tracking
│   │   ├── services/         # Business logic services
│   │   │   └── eventLog.js   # Event logging service
│   │   ├── db/               # Database connection & schema
│   │   └── vfs/              # Virtual File System logic
│   └── data/                 # SQLite database & scenarios.json
│
└── README.md                 # This file
```

###      Application Flow

```
main.js (bootstrap)
       
scene.js (3D setup)
       
interaction.js (event listeners)
       
taskManager.js (task flow)
              console.js (command execution)
              taskHud.js (UI update)
              eventBus.js (communication)
              miniGameManager.js (mini-games)
```

###      Event Bus System

The application uses a **centralized Pub/Sub pattern** for module communication, eliminating circular dependencies.

**How It Works:**
- **Publish**: A module emits an event (e.g., `TASK_COMPLETED`)
- **Subscribe**: Other modules register to listen for the event
- **Callback**: The listener receives data and reacts accordingly

---

## Backend Architecture

The backend is built with **Node.js** and **Express**, using **SQLite** for persistence. It provides a secure environment for task validation and state management.

###      Security & Validation
- **Server-Side Validation**: All task answers are validated on the server. The client never receives the correct answers, preventing cheating by inspecting network traffic.
- **Session Management**: Uses `express-session` with `Passport.js` for secure user authentication.
- **Input Sanitization**: All inputs are treated as untrusted.
- **Role-Based Access**: Admin endpoints protected by `requireAdmin` middleware.
- **Rate Limiting**: Prevents abuse of API endpoints.

###      Virtual File System (VFS)
The backend maintains a persistent **Virtual File System** for each user/scenario.
- **State Persistence**: The VFS state (created files, directories) is saved in the database (`user_vfs_state` table).
- **Isolation**: Each user has their own isolated file system instance.
- **Dynamic Mounting**: Devices and evidence are dynamically "mounted" into the VFS when the user interacts with 3D objects.

###      Caching Strategy
- **Leaderboard Cache**: 10-second TTL to reduce database load (see `theory/leaderboard-caching.md`)
- **Scenarios Cache**: Scenario definitions cached in memory to avoid repeated file I/O

---

## API Documentation

The API is RESTful and uses JSON for data exchange. All protected routes require a valid session cookie.

###      Authentication (`/api/auth`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/register` | Register a new user |
| `POST` | `/login` | Login with email/password |
| `POST` | `/logout` | Destroy session |
| `GET` | `/me` | Get current user profile |

###      Tasks & Scenarios (`/api/tasks`, `/api/scenarios`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/scenarios` | Get all scenarios and public task metadata |
| `POST` | `/api/tasks/:id/submit` | Submit an answer for a task. Returns score and feedback. |
| `GET` | `/api/tasks/:id/hint` | Get a hint for a task (deducts points). |
| `GET` | `/api/tasks/completions` | Get user's completion history. |

###      Console (`/api/console`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/execute` | Execute a shell command in the user's VFS context. |

###      Devices (`/api/devices`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/attach` | Attach a device for a user/scenario |
| `GET` | `/` | List attached devices for current user/scenario |
| `POST` | `/mount` | Mount a device to a mount point |
| `POST` | `/unmount` | Unmount a device |

###      Leaderboard (`/api/leaderboard`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Get leaderboard (users ordered by total score) |

###      Tracking (`/api/tracking`)
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/scenario-start` | Log scenario start event |
| `POST` | `/scenario-end` | Log scenario completion event |
| `POST` | `/mini-game` | Log mini-game events (start/complete/fail) |
| `POST` | `/command` | Log command execution |

###      Admin (`/api/admin`) - Requires Admin Role
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/logs` | Paginated event logs with filters |
| `GET` | `/logs/export` | Export logs as CSV |
| `GET` | `/stats` | Aggregated statistics |
| `GET` | `/users` | List all users with their stats |
| `GET` | `/users/:userId/stats` | Detailed stats for a specific user |
| `GET` | `/event-types` | Get distinct event types for filtering |
| `GET` | `/scenario-codes` | Get distinct scenario codes for filtering |

---

## Database Schema

The project uses **SQLite** with the following relational schema:

### `users`
Stores user account information.
- `id`: PK
- `email`: Unique
- `password_hash`: Bcrypt hash
- `display_name`: User's display name
- `role`: 'user' or 'admin'
- `tutorial_completed`: Boolean flag
- `created_at`: Timestamp

### `scenarios` & `tasks`
Stores static definitions (synced from `scenarios.json`).
- `scenarios`: `id`, `code`, `title`, `description`
- `tasks`: `id`, `scenario_id`, `code`, `title`, `description`, `max_score`, `solution_type`, `solution_value`

### `task_completions`
Tracks user progress.
- `user_id`: FK -> users
- `task_id`: FK -> tasks
- `score_awarded`: Points earned
- `time_ms`: Time taken to complete
- `completed_at`: Timestamp

### `user_vfs_state`
Persists the simulated file system.
- `user_id`: FK -> users
- `scenario_code`: The active scenario
- `vfs_data`: JSON blob representing the file tree
- `cwd`: Current working directory

### `user_devices`
Tracks attached devices per user/scenario.
- `user_id`: FK -> users
- `scenario_code`: The active scenario
- `device_name`: Name of the device (e.g., 'sdb')
- `device_type`: Type ('disk' or 'remote')
- `size`: Device size
- `partition_name`: Partition name (e.g., 'sdb1')
- `mounted`: Boolean flag
- `mount_point`: Current mount point if mounted
- `device_data`: JSON blob with device content

### `badges` & `user_badges`
Gamification system.
- `badges`: `id`, `code`, `name`, `description`, `badge_points`
- `user_badges`: `user_id`, `badge_id`, `awarded_at`

### `badge_points_awarded`
Audit trail for points awarded from badges.
- `user_id`: FK -> users
- `badge_id`: FK -> badges
- `points_awarded`: Points given
- `awarded_at`: Timestamp

### `user_stats`
Tracks user statistics like hints used.
- `user_id`: FK -> users
- `hints_used_count`: Total hints used
- `scenario_hints_used`: JSON blob per scenario

### `user_unlocked_hints`
Tracks which hints users have unlocked (persistent).
- `user_id`: FK -> users
- `task_id`: Task identifier
- `unlocked_at`: Timestamp

### `event_log`
Comprehensive event tracking for analytics.
- `id`: PK
- `participant_id`: Anonymous participant identifier
- `user_id`: FK -> users (optional)
- `event_type`: Type of event (e.g., 'scenario_start', 'command_execute')
- `scenario_code`: Related scenario
- `task_id`: Related task
- `event_data`: JSON blob with event details
- `created_at`: Timestamp

---

## Teachers' Guide: Adding Scenarios

One of the main features of this project is **ease of extension**: teachers can add new scenarios, tasks, and digital forensics topics without modifying the application code. Everything is managed through the `scenarios.json` configuration file.

###      Structure of scenarios.json

The file `server/data/scenarios.json` contains the definition of all scenarios and tasks. Each scenario is a JSON object with the following structure:

```json
{
  "scenario_id": {
    "id": "scenario_id",
    "title": "Scenario Title",
    "description": "Brief description visible in the scenario list",
    "introduction": "Narrative text that introduces the scenario",
    "interactableObjects": ["Object_Name_1", "Object_Name_2"],
    "tasks": [
      {
        "id": "task_001",
        "title": "Task Title",
        "details": "Detailed description of the objective",
        "checkType": "interaction",
        "interactionTarget": "Object_Name",
        "onInteract": {
          "action": "attach_device",
          "deviceName": "device_name",
          "deviceType": "disk|remote",
          "mountPoint": "/mounting/path",
          "message": "Feedback message for the user",
          "mountContent": {
            "file1.txt": "File 1 content",
            "file2.log": "File 2 content"
          }
        }
      },
      {
        "id": "task_002",
        "title": "Execute a command",
        "details": "Description of the command to execute",
        "checkCommand": "ls",
        "checkArgs": ["/path"]
      }
    ]
  }
}
```

###      Available Task Types

**Note:** You can use both standard commands (like `ls`, `cat`, `grep`) and **custom commands** defined in the scenario's `customCommands`.

#### 1       Interaction Task

Completed when the user **clicks on a specific 3D object**.

```json
{
  "id": "task_001",
  "title": "Connect the device",
  "details": "Click on the server to connect",
  "checkType": "interaction",
  "interactionTarget": "Server",
  "onInteract": {
    "action": "attach_device",
    "deviceName": "remote_server",
    "deviceType": "remote",
    "mountPoint": "/var/log",
    "message": "    Connected to remote server",
    "mountContent": {
      "auth.log": "Oct 15 03:45:10 server sshd[1234]: Accepted password",
      "system.log": "System online and functioning"
    }
  }
}
```

#### 2       Command Task

Completed when the user **executes a specific command** in the console.

```json
{
  "id": "task_002",
  "title": "List files",
  "details": "Use 'ls /var/log' to see log files",
  "checkCommand": "ls",
  "checkArgs": ["/var/log"]
}
```

#### 3       Mini-Game Task

Completed when the user **successfully completes a mini-game**.

```json
{
  "id": "task_003",
  "title": "Analyze memory dump",
  "details": "Complete the memory analysis challenge",
  "checkType": "minigame",
  "minigameType": "decryption"
}
```

###      How to Find Interactive Objects

1. **Open the browser** and go to http://localhost:5173
2. **Press F12** to open the developer console
3. **Execute the command:**
   ```javascript
   window.listInteractableObjects()
   ```
4. **You'll see the complete list** of all interactive objects available in your 3D model

###         Adding a New Scenario

#### Step 1      : Define the Scenario in JSON

Open `server/data/scenarios.json` and add a new scenario entry.

#### Step 2      : Verify That Objects Exist

Use the debug function to verify that the objects you're using in the JSON exist in the 3D model:

```javascript
window.listInteractableObjects()
```

#### Step 3      : Test Your Scenario

1. **Restart the server** (if running locally) to reload the JSON.
2. **Reload the page**.
3. **Select your scenario** from the selection menu.

###     Adding Custom Commands

**Example of customCommands:**

```json
{
  "malware_analysis": {
    "id": "malware_analysis",
    "title": "Malware Analysis",
    "customCommands": [
      {
        "name": "scan-malware",
        "description": "Quick malware scan",
        "output": "[*] Starting scan...\n[!] Detected: trojan.exe (RISK: CRITICAL)"
      }
    ],
    "tasks": [...]
  }
}
```

---

## Admin Dashboard

The Admin Dashboard provides administrators with tools to monitor user activity, view statistics, and export data for research purposes.

### Accessing the Dashboard

1. Login with an admin account (accounts are created in `server/src/db/schema.js`)
2. Navigate to `/admin.html`

### Features

**Event Logs**
- View all tracked events with filtering by:
  - Event type (scenario_start, command_execute, hint_request, etc.)
  - Scenario code
  - Participant ID
  - User ID
  - Date range
- Pagination support
- Export to CSV for analysis

**Statistics Overview**
- Total users and admins
- Active users (last 24 hours)
- Total events logged
- Events by type breakdown
- Task completions
- Commands executed
- Hints requested
- 7-day activity trend

**User Management**
- List all users with their stats
- View individual user details:
  - Tasks completed and scores
  - Commands executed (success/failed)
  - Hints used
  - Badges earned
  - Recent activity



## Technologies

###         Frontend

- **HTML5** - Semantic structure
- **CSS3** - Flexbox layout, Grid, animations
- **JavaScript (ES6+)** - Application logic

###      3D Rendering

- **Babylon.js 8.33** - WebGL 3D Engine
  - 3D models in glTF/GLB format
  - Dynamic lighting
  - Camera and physics management

###      Simulated Console

- **xterm.js 5.3** - Terminal emulator
  - Fit addon for window adaptation
  - Support for ANSI escape sequences

###      Build and Deploy

- **Vite 7.1** - Ultra-fast build tool
- **npm** - Package manager
- **GitHub Pages** - Hosting

###      Backend

- **Node.js 16+** - Runtime
- **Express.js** - Web framework
- **SQLite** - Database (via `sqlite3` and `sqlite` packages)
- **Passport.js** - Authentication
- **bcrypt** - Password hashing



###      Versioning

- **Git** - Version control

---

## Contributions and Feedback

We greatly appreciate community feedback!

###      Report Bugs

Open an [Issue on GitHub](https://github.com/EdoardoManiero/CyberForensics-Arena/issues) with:
- Problem description
- Steps to reproduce
- Browser and version used
- Screenshots/logs if available

###      Suggestions and Feature Requests

Share your ideas by opening a [Discussion](https://github.com/EdoardoManiero/CyberForensics-Arena/discussions)

###      How to Contribute

1. Fork the repository
2. Create a branch (`git checkout -b feature/NewFeature`)
3. Commit your changes (`git commit -m 'Add: new feature'`)
4. Push to the branch (`git push origin feature/NewFeature`)
5. Open a Pull Request

---

## Contact and Support

| | |
|---|---|
| **Author** | Edoardo Maniero |
| **Email** | [edoardomaniero@gmail.com](mailto:edoardomaniero@gmail.com) |
| **GitHub** | [@EdoardoManiero](https://github.com/EdoardoManiero) |
| **Repository** | [CyberForensics-Arena](https://github.com/EdoardoManiero/CyberForensics-Arena) |

---

## License

This project is distributed under the **ISC** license.

See LICENSE file for full details.

###      3D Model Attribution

The 3D forensic environment (`secret_lab.glb`) is based on **"Flynn's Secret Lab - Tron Legacy"** by [an3xt](https://sketchfab.com/an3xt), available on [Sketchfab](https://sketchfab.com/3d-models/flynns-secret-lab-tron-legacy-0429196769e040bd84e84040daccc40a).

**Original Model License**: [Creative Commons Attribution 4.0 International (CC BY 4.0)](https://creativecommons.org/licenses/by/4.0/)

**Modifications**: The original model has been adapted and modified using **Blender** to fit the forensic laboratory educational context.

**Attribution Requirements**: The original work must be credited when used or distributed.

---

## Recommended Educational Resources

###      Digital Forensics

- NIST Guidelines on Mobile Device Forensics
- SANS Cyber Aces Forensic Challenges
- Digital Forensics Research Lab (DFRL)

###      Cybersecurity

- TryHackMe Modules
- HackTheBox Challenges
- OverTheWire Wargames

###      3D Web Development

- Babylon.js Documentation
- WebGL Best Practices
- ThreeJS vs Babylon.js comparison

---

**       Made with Love for Digital Forensics Education**

*Last updated: February 2026*
