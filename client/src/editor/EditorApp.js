/**
 * EditorApp.js
 * Main logic for the Scenario Editor Dashboard.
 */

import { API_BASE } from '../api.js';

class EditorApp {
    constructor() {
        this.scenarios = {};
        this.currentScenarioId = null;

        this.init();
    }

    async init() {
        await this.loadScenarios();
        this.renderScenarioList();
        this.setupEventListeners();
    }

    async loadScenarios() {
        try {
            const response = await fetch(`${API_BASE}/scenarios`);
            this.scenarios = await response.json();
        } catch (error) {
            console.error('Failed to load scenarios:', error);
            alert('Failed to load scenarios. Is the server running?');
        }
    }

    renderScenarioList() {
        const list = document.getElementById('scenarioList');
        list.innerHTML = '';

        Object.values(this.scenarios).forEach(scenario => {
            const li = document.createElement('li');
            li.className = `scenario-item ${scenario.id === this.currentScenarioId ? 'active' : ''}`;
            li.textContent = scenario.title;
            li.onclick = () => this.selectScenario(scenario.id);
            list.appendChild(li);
        });
    }

    selectScenario(id) {
        this.currentScenarioId = id;
        this.renderScenarioList(); // Update active class
        this.renderForm();
    }

    renderForm() {
        const scenario = this.scenarios[this.currentScenarioId];
        if (!scenario) return;

        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('editorForm').classList.remove('hidden');

        document.getElementById('scenarioId').value = scenario.id;
        document.getElementById('scenarioTitle').value = scenario.title;
        document.getElementById('scenarioDesc').value = scenario.description;
        document.getElementById('scenarioIntro').value = scenario.introduction;

        // New Fields
        document.getElementById('scenarioBadge').value = scenario.badge || '';
        document.getElementById('scenarioObjects').value = (scenario.interactableObjects || []).join(', ');
        document.getElementById('scenarioCommands').value = JSON.stringify(scenario.customCommands || [], null, 2);

        this.renderTasks(scenario.tasks);
    }

    renderTasks(tasks) {
        const list = document.getElementById('taskList');
        list.innerHTML = '';

        tasks.forEach((task, index) => {
            const div = document.createElement('div');
            div.className = 'task-item';
            div.innerHTML = `
                <div class="task-header">
                    <strong>Task ${index + 1}</strong>
                    <button class="btn btn-small btn-danger" onclick="window.editorApp.deleteTask(${index})"><i class="fa-solid fa-trash"></i></button>
                </div>
                <div class="form-group">
                    <label>ID</label>
                    <input type="text" value="${task.id}" onchange="window.editorApp.updateTask(${index}, 'id', this.value)">
                </div>
                <div class="form-group">
                    <label>Title</label>
                    <input type="text" value="${task.title}" onchange="window.editorApp.updateTask(${index}, 'title', this.value)">
                </div>
                <div class="form-group">
                    <label>Details</label>
                    <input type="text" value="${task.details}" onchange="window.editorApp.updateTask(${index}, 'details', this.value)">
                </div>
                <div class="form-group">
                    <label>Points</label>
                    <input type="number" value="${task.points || 0}" onchange="window.editorApp.updateTask(${index}, 'points', this.value)">
                </div>
                <div class="form-group">
                    <label>Hint</label>
                    <textarea class="form-control" rows="2" onchange="window.editorApp.updateTask(${index}, 'hint', this.value)">${task.hint || ''}</textarea>
                </div>
                <div class="form-group">
                    <label>Hint Cost</label>
                    <input type="number" value="${task.hintCost || 0}" onchange="window.editorApp.updateTask(${index}, 'hintCost', this.value)">
                </div>
                
                <!-- Check Type Selector -->
                <div class="form-group">
                    <label>Check Type</label>
                    <select onchange="window.editorApp.updateTask(${index}, 'checkType', this.value)">
                        <option value="command" ${(!task.checkType || task.checkType === 'command') ? 'selected' : ''}>Command</option>
                        <option value="interaction" ${task.checkType === 'interaction' ? 'selected' : ''}>Interaction</option>
                    </select>
                </div>

                <!-- Command Fields -->
                <div class="form-group" style="${task.checkType === 'interaction' ? 'display:none' : ''}">
                    <label>Check Command</label>
                    <input type="text" value="${task.checkCommand || ''}" onchange="window.editorApp.updateTask(${index}, 'checkCommand', this.value)">
                </div>
                <div class="form-group" style="${task.checkType === 'interaction' ? 'display:none' : ''}">
                    <label>Check Args (comma separated)</label>
                    <input type="text" value="${(task.checkArgs || []).join(', ')}" onchange="window.editorApp.updateTask(${index}, 'checkArgs', this.value)">
                </div>

                <!-- Interaction Fields -->
                <div class="form-group" style="${(!task.checkType || task.checkType === 'command') ? 'display:none' : ''}">
                    <label>Interaction Target (Object ID)</label>
                    <input type="text" value="${task.interactionTarget || ''}" onchange="window.editorApp.updateTask(${index}, 'interactionTarget', this.value)">
                </div>
                <div class="form-group" style="${(!task.checkType || task.checkType === 'command') ? 'display:none' : ''}">
                    <label>On Interact Logic (JSON)</label>
                    <textarea class="code-editor" rows="4" onchange="window.editorApp.updateTask(${index}, 'onInteract', this.value)">${task.onInteract ? JSON.stringify(task.onInteract, null, 2) : ''}</textarea>
                </div>
            `;
            list.appendChild(div);
        });
    }

    updateTask(index, field, value) {
        if (this.currentScenarioId && this.scenarios[this.currentScenarioId]) {
            let val = value;
            if (field === 'points' || field === 'hintCost') {
                val = parseInt(value) || 0;
            } else if (field === 'checkArgs') {
                val = value.split(',').map(s => s.trim()).filter(s => s);
            } else if (field === 'onInteract') {
                try {
                    val = value ? JSON.parse(value) : null;
                } catch (e) {
                    console.error('Invalid JSON for onInteract');
                    // Don't update if invalid JSON to avoid data loss, or maybe alert user
                    return;
                }
            }

            this.scenarios[this.currentScenarioId].tasks[index][field] = val;

            // Re-render if checkType changes to toggle fields
            if (field === 'checkType') {
                this.renderTasks(this.scenarios[this.currentScenarioId].tasks);
            }
        }
    }

    deleteTask(index) {
        if (confirm('Are you sure you want to delete this task?')) {
            this.scenarios[this.currentScenarioId].tasks.splice(index, 1);
            this.renderForm();
        }
    }

    addTask() {
        if (!this.currentScenarioId) return;

        const newTask = {
            id: `task_${Date.now()}`,
            title: 'New Task',
            details: 'Task details here',
            points: 10,
            hint: '',
            hintCost: 2,
            checkType: 'command',
            checkCommand: '',
            checkArgs: []
        };

        this.scenarios[this.currentScenarioId].tasks.push(newTask);
        this.renderForm();
    }

    addScenario() {
        const id = prompt('Enter new scenario ID (e.g., custom_scenario):');
        if (!id) return;

        if (this.scenarios[id]) {
            alert('ID already exists!');
            return;
        }

        this.scenarios[id] = {
            id: id,
            title: 'New Scenario',
            description: 'Description',
            introduction: 'Intro',
            badge: 'New Badge',
            interactableObjects: [],
            customCommands: [],
            tasks: []
        };

        this.selectScenario(id);
    }

    async saveAll() {
        // Update current scenario from form fields
        if (this.currentScenarioId) {
            const s = this.scenarios[this.currentScenarioId];
            s.title = document.getElementById('scenarioTitle').value;
            s.description = document.getElementById('scenarioDesc').value;
            s.introduction = document.getElementById('scenarioIntro').value;
            s.badge = document.getElementById('scenarioBadge').value;

            // Parse Objects
            const objectsStr = document.getElementById('scenarioObjects').value;
            s.interactableObjects = objectsStr.split(',').map(s => s.trim()).filter(s => s);

            // Parse Commands
            try {
                const commandsStr = document.getElementById('scenarioCommands').value;
                s.customCommands = commandsStr ? JSON.parse(commandsStr) : [];
            } catch (e) {
                alert('Invalid JSON in Custom Commands!');
                return;
            }
        }

        try {
            const response = await fetch(`${API_BASE}/scenarios`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ scenarios: this.scenarios })
            });

            const result = await response.json();
            if (result.success) {
                alert('Saved successfully!');
            } else {
                alert('Error saving: ' + result.error);
            }
        } catch (error) {
            console.error('Save error:', error);
            alert('Failed to save.');
        }
    }

    setupEventListeners() {
        document.getElementById('saveBtn').addEventListener('click', () => this.saveAll());
        document.getElementById('addScenarioBtn').addEventListener('click', () => this.addScenario());
        document.getElementById('addTaskBtn').addEventListener('click', () => this.addTask());

        // Expose app to window for inline event handlers
        window.editorApp = this;
    }
}

// Initialize
new EditorApp();
