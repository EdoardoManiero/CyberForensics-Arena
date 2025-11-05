# Office 3D Forensic Demo

An immersive interactive 3D environment for teaching **Digital Forensics** through gamification. An innovative educational prototype that combines a virtual workspace, a simulated Linux console, and a series of progressive investigative tasks.

**🌐 Live Demo:** [https://edoardomaniero.github.io/office3D-forensic-demo/](https://edoardomaniero.github.io/office3D-forensic-demo/)

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Getting Started](#getting-started)
- [System Requirements](#system-requirements)
- [Controls and Interface](#controls-and-interface)
- [Architecture](#architecture)
- [Teachers' Guide: Adding Scenarios](#teachers-guide-adding-scenarios)
- [Technologies](#technologies)
- [Contributions and Feedback](#contributions-and-feedback)
- [Contact and Support](#contact-and-support)
- [License](#license)

---

## Overview

**Office 3D Forensic Demo** is an educational prototype that simulates a forensic investigation office. Users can:

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

### 🏢 1. Navigable 3D Environment

A fully 3D forensic office with:
- Workstation with computer
- General laboratory features
- Carts for evidence and artifacts
- IT infrastructure (servers, routers, network devices)
- Dynamic lighting and realistic atmosphere

### 💻 2. Simulated Linux Console

An interactive console that offers:
- Support for essential Linux commands: `ls`, `cd`, `cat`, `grep`,  `help`, `clear`, `pwd`, `echo`, `mkdir`, `touch`, `rm`, `env`, `lsblk`,`mount`,`tcpdump`, `volatility`, `scenario`, `progress`
- Navigable command history (up/down arrows)
- Tab autocomplete
- Copy/paste (select text, Ctrl+V to paste)
- Simulated file system with realistic hierarchical structure

### 📋 3. Progressive Task System

Three **independent investigative scenarios** with progressive tasks:

**1. File System Forensic** (6 tasks)
- Connect external hard drive
- List devices with `lsblk`
- Mount the partition
- Explore the file system
- Read suspicious log files
- Use `grep` to extract critical information

**2. Network Forensic** (5 tasks)
- Connect to remote server via SSH
- List system logs
- Read authentication logs
- Search for failed login attempts
- Analyze traffic capture with tcpdump

**3. Memory Forensic** (6 tasks)
- Connect hard drive with memory dump
- Verify connected devices
- Mount the partition with dump
- List memory files
- Analyze suspicious processes
- Use Volatility for advanced analysis

### 🎮 4. Gamification Elements

- **Linear Progression**: Sequential tasks with immediate feedback
- **Toast Notifications**: Visual notifications for completed actions and feedback
- **Coherent Narration**: A realistic investigative story
- **Incentivized Exploration**: 3D environment that invites discovery
- **Clear Instructions**: Visible objectives in the HUD in real time
- **Interactive Tutorial**: Initial guide for new users

### ⚙️ 5. Task Management System

- Collapsible HUD showing current task
- Progress bar for completion
- Toast notifications for real-time feedback
- Scenario management via JSON file

---

## Getting Started

### 🚀 Option 1: Live Demo (Recommended)

Simply visit: [https://edoardomaniero.github.io/office3D-forensic-demo/](https://edoardomaniero.github.io/office3D-forensic-demo/)

### 🛠️ Option 2: Local Installation

#### Prerequisites

- Node.js 16+ and npm
- Git

#### Installation

```bash
# Clone the repository
git clone https://github.com/EdoardoManiero/office3D-forensic-demo.git
cd office3D-forensic-demo

# Install dependencies
npm install

# Start the development server
npm run dev
# Access http://localhost:5173
```

#### Production Build

```bash
npm run build
```

---

## System Requirements

### 🌐 Browser

- Chrome/Chromium
- Firefox
- Safari
- Edge

### 💾 Hardware

- **GPU**: Graphics card with WebGL 2.0 support
- **RAM**: Minimum 4GB (recommended 8GB)
- **Processor**: Modern dual-core

### 📶 Connection

- Minimum bandwidth: 5 Mbps (for loading 3D resources)

### ⌨️ Input

- QWERTY keyboard
- Mouse or trackpad

---

## Controls and Interface

### ⌨️ Navigation

| Key | Function |
|-----|----------|
| **W** | Forward |
| **A** | Left |
| **S** | Backward |
| **D** | Right |
| **Mouse** | Look around |

### 🎯 Interaction

| Key | Function |
|-----|----------|
| **E** | Interact with object (when nearby) |
| **C** | Open/Close console |
| **ESC** | Close console |
| **Tab** | Console autocomplete |
| **Alt+Shift+R** | Safe Respawn |

### 💬 Console

| Key | Function |
|-----|----------|
| **↑/↓** | Navigate command history |
| **Ctrl+V** | Paste text |
| **Ctrl+C** | Copy text |
| **Ctrl+L** | Clear Console |

---

## Architecture

### 📁 Project Structure

```
office3D-forensic-demo/
├── index.html                    # HTML entry point
├── style.css                     # Global styles
├── package.json                  # Dependencies and build config
├── vite.config.js                # Vite configuration
│
├── js/                           # Application logic
│   ├── main.js                   # Entry point and coordination
│   ├── scene.js                  # 3D environment and camera setup
│   ├── interaction.js            # User interaction handling
│   ├── console.js                # Simulated Linux console
│   ├── eventBus.js               # Event communication system
│   ├── taskManager.js            # Investigative task management
│   ├── taskHud.js                # Task HUD UI
│   ├── TutorialManager.js        # Tutorial and initial guide
│   └── ScenarioIntroManager.js   # Scenario introduction
│
├── public/                       # Static assets
│   ├── models/
│   │   └── secret_lab.glb        # Forensic laboratory (3D model)
│   └── scenarios.json            # Task/scenario definitions
│
├── dist/                         # Production build output
└── README.md                     # This file
```

### 🔄 Application Flow

```
main.js (bootstrap)
    ↓
scene.js (3D setup)
    ↓
interaction.js (event listeners)
    ↓
taskManager.js (task flow)
    ├── console.js (command execution)
    ├── taskHud.js (UI update)
    └── eventBus.js (communication)
```

### 📡 Event Bus System

The application uses a **centralized Pub/Sub pattern** for module communication, eliminating circular dependencies.

**How It Works:**
- **Publish**: A module emits an event (e.g., `TASK_COMPLETED`)
- **Subscribe**: Other modules register to listen for the event
- **Callback**: The listener receives data and reacts accordingly

**Key Event Examples:**
```
Rendering Layer ↔ Logic Layer:
  - MESH_CLICKED: User clicks on a 3D object
  - CONSOLE_COMMAND_EXECUTED: Command executed in console

Logic Layer ↔ UI Layer:
  - TASK_COMPLETED: Task completed
  - PROGRESS_UPDATED: Progress updated

Logic Layer ↔ Rendering Layer:
  - SCENARIO_HIGHLIGHTS_UPDATED: Highlights new interactive objects
```

**Benefits:**
- Completely decoupled modules
- No circular imports between files
- Easy to add new listeners without modifying existing code
- Event history for debugging

---

## Teachers' Guide: Adding Scenarios

One of the main features of this project is **ease of extension**: teachers can add new scenarios, tasks, and digital forensics topics without modifying the application code. Everything is managed through the `scenarios.json` configuration file.

### 📋 Structure of scenarios.json

The file `public/scenarios.json` contains the definition of all scenarios and tasks. Each scenario is a JSON object with the following structure:

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

### 🔧 Available Task Types

**Note:** You can use both standard commands (like `ls`, `cat`, `grep`) and **custom commands** defined in the scenario's `customCommands`.

#### 1️⃣ Interaction Task

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
    "message": "✓ Connected to remote server",
    "mountContent": {
      "auth.log": "Oct 15 03:45:10 server sshd[1234]: Accepted password",
      "system.log": "System online and functioning"
    }
  }
}
```

**Available properties for `onInteract`:**
- `action` (string): Type of action ("attach_device" to mount devices)
- `deviceName` (string): Name of the device to mount
- `deviceType` (string): "disk" or "remote"
- `mountPoint` (string): Path in the virtual file system where files are mounted
- `message` (string): Feedback message shown to the user
- `mountContent` (object): Files to add to the virtual file system with their contents

#### 2️⃣ Command Task

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

**Available properties:**
- `checkCommand` (string): The command the user must execute
- `checkArgs` (array): The arguments the command must receive

### 📍 How to Find Interactive Objects

1. **Open the browser** and go to http://localhost:5173
2. **Press F12** to open the developer console
3. **Execute the command:**
   ```javascript
   window.listInteractableObjects()
   ```
4. **You'll see the complete list** of all interactive objects available in your 3D model

**Example output:**
```
=== INTERACTABLE OBJECTS ===
- Server (mesh)
- Laptop (mesh)
- HD1-01_HD-1_0 (mesh)
- HD2-01_HD-2_0 (mesh)
```

These names can be used in the `interactableObjects` and `interactionTarget` fields of the scenario JSON.

### 🛠️ Adding a New Scenario

#### Step 1️⃣: Define the Scenario in JSON

Open `public/scenarios.json` and add a new scenario entry:

```json
{
  "malware_analysis": {
    "id": "malware_analysis",
    "title": "Malware Analysis",
    "description": "Analyze and extract signatures from a malware sample",
    "introduction": "A malware sample has been isolated. Use forensic tools to analyze it.",
    "interactableObjects": ["SampleBox"],
    "tasks": [
      {
        "id": "mal_task_1",
        "title": "Extract the sample",
        "details": "Click on the sample box to extract the malware",
        "checkType": "interaction",
        "interactionTarget": "SampleBox",
        "onInteract": {
          "action": "attach_device",
          "deviceName": "malware_sample",
          "deviceType": "disk",
          "mountPoint": "/mnt/samples",
          "message": "✓ Malware sample extracted and mounted",
          "mountContent": {
            "sample.exe": "Binary content (simulated)",
            "iocs.txt": "MD5: a1b2c3d4e5f6g7h8\nSHA256: abc123def456"
          }
        }
      },
      {
        "id": "mal_task_2",
        "title": "Display indicators",
        "details": "Use 'cat /mnt/samples/iocs.txt' to see IoC",
        "checkCommand": "cat",
        "checkArgs": ["/mnt/samples/iocs.txt"]
      }
    ]
  }
}
```


#### Step 2️⃣: Verify That Objects Exist

Use the debug function to verify that the objects you're using in the JSON exist in the 3D model:

```javascript
window.listInteractableObjects()
```

If the object doesn't appear in the list, you can:
- **Modify the 3D model** (see section below)
- **Use a different object** from the list

#### Step 3️⃣: Test Your Scenario

1. **Reload the page** so the new JSON is loaded
2. **Select your scenario** from the selection menu
3. **Follow the tasks** and verify that:
   - Feedback messages are correct
   - Files are mounted in the right path
   - Commands are verified correctly

### 🎨 Modifying the 3D Model

If you want to add new interactive objects to the 3D environment, you can modify the model using **Blender**.

#### Procedure:

1. **Download the original model:**
   - Located in `public/models/secret_lab.glb`
   - Open with Blender (version 3.0+)

2. **Add or modify objects:**
   - Create new meshes for your scenarios
   - Assign meaningful names to objects (e.g., "EvidenceBox", "ServerRack")
   - Position the objects in the environment

3. **Export in GLB format:**
   - File → Export → glTF 2.0 (.glb/.gltf)
   - Save as `public/models/secret_lab.glb`

4. **Verify the new objects:**
   ```javascript
   window.listInteractableObjects()
   ```

5. **Use the new names in your task JSON:**
   ```json
   "interactableObjects": ["NewObject"],
   "interactionTarget": "NewObject"
   ```

### ✨ Adding Custom Commands

**Example of customCommands:**

```json
{
  "malware_analysis": {
    "id": "malware_analysis",
    "title": "Malware Analysis",
    "description": "Analyze and extract signatures from a malware sample",
    "customCommands": [
      {
        "name": "scan-malware",
        "description": "Quick malware scan",
        "output": "[*] Starting scan...\n[!] Detected: trojan.exe (RISK: CRITICAL)\n[+] Scan completed"
      },
      {
        "name": "extract-hash",
        "description": "Extract sample hash",
        "output": "MD5: a1b2c3d4e5f6g7h8\nSHA256: abc123def456ghi789jkl"
      }
    ],
    "tasks": [...]
  }
}
```

**Available properties for each command:**
- `name` (string, **required**): Command name (e.g., `scan-malware`)
- `description` (string): Brief command description
- `output` (string): Command output when executed

**How to use custom commands in a scenario:**

1. Add the `customCommands` property to the scenario
2. Each command will be available in the console when the scenario is active
3. When you switch scenarios, old commands are automatically removed

**Example usage in a task:**
```json
{
  "id": "mal_task_3",
  "title": "Scan the sample",
  "details": "Use the 'scan-malware' command to detect threats",
  "checkCommand": "scan-malware",
  "checkArgs": []
}
```

### 🐛 Debugging and Troubleshooting

#### ❌ My task doesn't complete

1. **Verify the object name:**
   ```javascript
   window.listInteractableObjects()
   ```
2. **Check the browser console (F12)** for errors
3. **Verify JSON syntax:**
   - Use an online JSON validator
   - Check commas and parentheses

#### ❌ The command is not recognized

1. **Verify the `checkCommand`** in the JSON
2. **Verify the `checkArgs`** - they must match exactly

#### ❌ Mounted files are not visible

1. **Check the `mountPoint`** in the JSON
2. **Execute `ls /mounting/path`** in the console
3. **Verify that files are in `mountContent`**

---

## Technologies

### 🖥️ Frontend

- **HTML5** - Semantic structure
- **CSS3** - Flexbox layout, Grid, animations
- **JavaScript (ES6+)** - Application logic

### 🎮 3D Rendering

- **Babylon.js 8.33** - WebGL 3D Engine
  - 3D models in glTF/GLB format
  - Dynamic lighting
  - Camera and physics management

### 💻 Simulated Console

- **xterm.js 5.3** - Terminal emulator
  - Fit addon for window adaptation
  - Support for ANSI escape sequences

### 🔨 Build and Deploy

- **Vite 7.1** - Ultra-fast build tool
- **npm** - Package manager
- **GitHub Pages** - Hosting

### 📦 Versioning

- **Git** - Version control
- **Node.js 16+** - Runtime

---

## Contributions and Feedback

We greatly appreciate community feedback!

### 🐛 Report Bugs

Open an [Issue on GitHub](https://github.com/EdoardoManiero/office3D-forensic-demo/issues) with:
- Problem description
- Steps to reproduce
- Browser and version used
- Screenshots/logs if available

### 💡 Suggestions and Feature Requests

Share your ideas by opening a [Discussion](https://github.com/EdoardoManiero/office3D-forensic-demo/discussions)

### 🤝 How to Contribute

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
| **Repository** | [office3D-forensic-demo](https://github.com/EdoardoManiero/office3D-forensic-demo) |

---

## License

This project is distributed under the **ISC** license.

See LICENSE file for full details.

---

## Recommended Educational Resources

### 🔍 Digital Forensics

- NIST Guidelines on Mobile Device Forensics
- SANS Cyber Aces Forensic Challenges
- Digital Forensics Research Lab (DFRL)

### 🔐 Cybersecurity

- TryHackMe Modules
- HackTheBox Challenges
- OverTheWire Wargames

### 🎨 3D Web Development

- Babylon.js Documentation
- WebGL Best Practices
- ThreeJS vs Babylon.js comparison

---

**❤️ Made with Love for Digital Forensics Education**

*Last updated: 2025*