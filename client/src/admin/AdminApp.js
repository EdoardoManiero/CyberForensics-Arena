/**
 * AdminApp.js
 * Main logic for the Admin Dashboard.
 * 
 * Admin-only page - requires authentication and admin role.
 */

import { API_BASE, authAPI, adminAPI } from '../api.js';

class AdminApp {
    constructor() {
        this.user = null;
        this.currentTab = 'logs';
        
        // Pagination state
        this.logsPage = 1;
        this.usersPage = 1;
        this.logsPagination = null;
        this.usersPagination = null;
        
        // Filter state
        this.logsFilters = {};
        this.usersFilters = {};
        
        // Cache for filter options
        this.eventTypes = [];
        this.scenarioCodes = [];
        
        this.init();
    }

    async init() {
        // Check authentication and admin role before loading
        const isAuthorized = await this.checkAuth();
        if (!isAuthorized) {
            return;
        }
        
        // Setup event listeners
        this.setupEventListeners();
        
        // Load initial data
        await this.loadFilterOptions();
        await this.loadStats();
        await this.loadLogs();
        await this.loadUsers();
    }
    
    /**
     * Check if user is authenticated and has admin role
     */
    async checkAuth() {
        try {
            const user = await authAPI.getMe();
            this.user = user;
            
            if (!user) {
                this.showAccessDenied('Please log in to access the Admin Dashboard.');
                return false;
            }
            
            if (user.role !== 'admin') {
                this.showAccessDenied('Admin access required. Only administrators can access the Admin Dashboard.');
                return false;
            }
            
            console.log('[AdminApp] Admin access granted for:', user.email);
            return true;
        } catch (error) {
            console.error('[AdminApp] Auth check failed:', error);
            this.showAccessDenied('Authentication failed. Please log in again.');
            return false;
        }
    }
    
    /**
     * Show access denied message
     */
    showAccessDenied(message) {
        const app = document.getElementById('app');
        if (app) {
            app.innerHTML = `
                <div class="access-denied">
                    <div class="access-denied__content">
                        <i class="fas fa-lock"></i>
                        <h1>Access Denied</h1>
                        <p>${message}</p>
                        <a href="./" class="btn btn-primary">
                            <i class="fas fa-home"></i> Return to Game
                        </a>
                    </div>
                </div>
            `;
        }
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Tab switching
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.switchTab(btn.dataset.tab);
            });
        });
        
        // Refresh button
        document.getElementById('refreshBtn')?.addEventListener('click', () => {
            this.refreshAll();
        });
        
        // Logs filters
        document.getElementById('applyFilters')?.addEventListener('click', () => {
            this.applyLogsFilters();
        });
        document.getElementById('clearFilters')?.addEventListener('click', () => {
            this.clearLogsFilters();
        });
        
        // Logs pagination
        document.getElementById('logsPrevBtn')?.addEventListener('click', () => {
            if (this.logsPage > 1) {
                this.logsPage--;
                this.loadLogs();
            }
        });
        document.getElementById('logsNextBtn')?.addEventListener('click', () => {
            if (this.logsPagination && this.logsPage < this.logsPagination.totalPages) {
                this.logsPage++;
                this.loadLogs();
            }
        });
        
        // Users filters
        document.getElementById('applyUserFilters')?.addEventListener('click', () => {
            this.applyUsersFilters();
        });
        
        // Users pagination
        document.getElementById('usersPrevBtn')?.addEventListener('click', () => {
            if (this.usersPage > 1) {
                this.usersPage--;
                this.loadUsers();
            }
        });
        document.getElementById('usersNextBtn')?.addEventListener('click', () => {
            if (this.usersPagination && this.usersPage < this.usersPagination.totalPages) {
                this.usersPage++;
                this.loadUsers();
            }
        });
        
        // Export logs button
        document.getElementById('exportLogsBtn')?.addEventListener('click', () => {
            this.exportLogsToCSV();
        });
        
        // User stats modal close
        document.getElementById('closeUserStatsModal')?.addEventListener('click', () => {
            this.closeUserStatsModal();
        });
        document.getElementById('userStatsModalBackdrop')?.addEventListener('click', () => {
            this.closeUserStatsModal();
        });
    }

    /**
     * Switch active tab
     */
    switchTab(tabId) {
        this.currentTab = tabId;
        
        // Update tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.tab === tabId);
        });
        
        // Update tab panels
        document.querySelectorAll('.tab-panel').forEach(panel => {
            panel.classList.toggle('active', panel.id === `${tabId}Panel`);
        });
    }

    /**
     * Refresh all data
     */
    async refreshAll() {
        const btn = document.getElementById('refreshBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Refreshing...';
        }
        
        try {
            await Promise.all([
                this.loadStats(),
                this.loadLogs(),
                this.loadUsers()
            ]);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-sync"></i> Refresh';
            }
        }
    }

    /**
     * Load filter options (event types and scenario codes)
     */
    async loadFilterOptions() {
        try {
            const [eventTypesRes, scenarioCodesRes] = await Promise.all([
                adminAPI.getEventTypes(),
                adminAPI.getScenarioCodes()
            ]);
            
            this.eventTypes = eventTypesRes.eventTypes || [];
            this.scenarioCodes = scenarioCodesRes.scenarioCodes || [];
            
            // Populate event type filter
            const eventTypeSelect = document.getElementById('eventTypeFilter');
            if (eventTypeSelect) {
                this.eventTypes.forEach(type => {
                    const option = document.createElement('option');
                    option.value = type;
                    option.textContent = this.formatEventType(type);
                    eventTypeSelect.appendChild(option);
                });
            }
            
            // Populate scenario filter
            const scenarioSelect = document.getElementById('scenarioFilter');
            if (scenarioSelect) {
                this.scenarioCodes.forEach(code => {
                    const option = document.createElement('option');
                    option.value = code;
                    option.textContent = code;
                    scenarioSelect.appendChild(option);
                });
            }
        } catch (error) {
            console.error('[AdminApp] Failed to load filter options:', error);
        }
    }

    /**
     * Load stats
     */
    async loadStats() {
        try {
            const stats = await adminAPI.getStats();
            this.renderStats(stats);
        } catch (error) {
            console.error('[AdminApp] Failed to load stats:', error);
        }
    }

    /**
     * Render stats cards
     */
    renderStats(stats) {
        const grid = document.getElementById('statsGrid');
        if (!grid) return;
        
        grid.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon users"><i class="fas fa-users"></i></div>
                <div class="stat-content">
                    <span class="stat-value">${stats.users?.total || 0}</span>
                    <span class="stat-label">Total Users</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon active"><i class="fas fa-user-clock"></i></div>
                <div class="stat-content">
                    <span class="stat-value">${stats.users?.activeToday || 0}</span>
                    <span class="stat-label">Active Today</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon events"><i class="fas fa-stream"></i></div>
                <div class="stat-content">
                    <span class="stat-value">${stats.events?.total?.toLocaleString() || 0}</span>
                    <span class="stat-label">Total Events</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon tasks"><i class="fas fa-check-circle"></i></div>
                <div class="stat-content">
                    <span class="stat-value">${stats.tasks?.completions || 0}</span>
                    <span class="stat-label">Task Completions</span>
                </div>
            </div>
            <div class="stat-card">
                <div class="stat-icon commands"><i class="fas fa-terminal"></i></div>
                <div class="stat-content">
                    <span class="stat-value">${stats.commands?.total?.toLocaleString() || 0}</span>
                    <span class="stat-label">Commands Run</span>
                </div>
            </div>
        `;
        
        // Render activity charts
        this.renderActivityCharts(stats);
    }

    /**
     * Render activity charts
     */
    renderActivityCharts(stats) {
        // Events by type chart
        const chartContainer = document.getElementById('eventsByTypeChart');
        if (chartContainer && stats.events?.byType) {
            const maxCount = Math.max(...stats.events.byType.map(e => e.count), 1);
            
            chartContainer.innerHTML = stats.events.byType.slice(0, 8).map(item => `
                <div class="chart-bar">
                    <span class="chart-bar-label">${this.formatEventType(item.event_type)}</span>
                    <div class="chart-bar-track">
                        <div class="chart-bar-fill" style="width: ${(item.count / maxCount) * 100}%">
                            <span class="chart-bar-value">${item.count.toLocaleString()}</span>
                        </div>
                    </div>
                </div>
            `).join('');
        }
        
        // Recent activity list
        const activityList = document.getElementById('recentActivityList');
        if (activityList && stats.recentActivity) {
            if (stats.recentActivity.length === 0) {
                activityList.innerHTML = '<div class="empty-state"><p>No recent activity</p></div>';
            } else {
                activityList.innerHTML = stats.recentActivity.map(day => `
                    <div class="activity-item">
                        <span class="activity-item-date">${this.formatDate(day.date)}</span>
                        <div class="activity-item-stats">
                            <span class="activity-stat events">
                                <i class="fas fa-stream"></i> ${day.events.toLocaleString()} events
                            </span>
                            <span class="activity-stat users">
                                <i class="fas fa-users"></i> ${day.users} users
                            </span>
                        </div>
                    </div>
                `).join('');
            }
        }
    }

    /**
     * Apply logs filters
     */
    applyLogsFilters() {
        this.logsFilters = {
            eventType: document.getElementById('eventTypeFilter')?.value || '',
            scenarioCode: document.getElementById('scenarioFilter')?.value || '',
            participantId: document.getElementById('participantFilter')?.value || '',
            userId: document.getElementById('userIdFilter')?.value || ''
        };
        this.logsPage = 1;
        this.loadLogs();
    }

    /**
     * Clear logs filters
     */
    clearLogsFilters() {
        document.getElementById('eventTypeFilter').value = '';
        document.getElementById('scenarioFilter').value = '';
        document.getElementById('participantFilter').value = '';
        document.getElementById('userIdFilter').value = '';
        this.logsFilters = {};
        this.logsPage = 1;
        this.loadLogs();
    }
    
    /**
     * Export logs to CSV
     */
    exportLogsToCSV() {
        const url = adminAPI.getLogsExportUrl(this.logsFilters);
        // Open in new tab for download
        window.open(url, '_blank');
    }

    /**
     * Load event logs
     */
    async loadLogs() {
        const tbody = document.getElementById('logsTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading logs...</td></tr>';
        }
        
        try {
            const params = {
                page: this.logsPage,
                limit: 25,
                ...this.logsFilters
            };
            
            const result = await adminAPI.getLogs(params);
            this.logsPagination = result.pagination;
            this.renderLogs(result.logs);
            this.updateLogsPagination();
        } catch (error) {
            console.error('[AdminApp] Failed to load logs:', error);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="7" class="loading-row">Failed to load logs</td></tr>';
            }
        }
    }

    /**
     * Render logs table
     */
    renderLogs(logs) {
        const tbody = document.getElementById('logsTableBody');
        if (!tbody) return;
        
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="loading-row">No logs found</td></tr>';
            return;
        }
        
        tbody.innerHTML = logs.map(log => `
            <tr>
                <td>${log.id}</td>
                <td>${this.formatDateTime(log.created_at)}</td>
                <td><span class="badge badge-event">${this.formatEventType(log.event_type)}</span></td>
                <td><code>${log.participant_id || '-'}</code></td>
                <td>${log.user_display_name || (log.user_id ? `User #${log.user_id}` : '-')}</td>
                <td>${log.scenario_code ? `<span class="badge badge-scenario">${log.scenario_code}</span>` : '-'}</td>
                <td class="event-data" title="${this.escapeHtml(JSON.stringify(log.event_data))}">${JSON.stringify(log.event_data)}</td>
            </tr>
        `).join('');
    }

    /**
     * Update logs pagination UI
     */
    updateLogsPagination() {
        const info = document.getElementById('logsPaginationInfo');
        const prevBtn = document.getElementById('logsPrevBtn');
        const nextBtn = document.getElementById('logsNextBtn');
        
        if (this.logsPagination) {
            if (info) {
                info.textContent = `Page ${this.logsPagination.page} of ${this.logsPagination.totalPages} (${this.logsPagination.total} total)`;
            }
            if (prevBtn) {
                prevBtn.disabled = this.logsPagination.page <= 1;
            }
            if (nextBtn) {
                nextBtn.disabled = this.logsPagination.page >= this.logsPagination.totalPages;
            }
        }
    }

    /**
     * Apply users filters
     */
    applyUsersFilters() {
        this.usersFilters = {
            role: document.getElementById('roleFilter')?.value || ''
        };
        this.usersPage = 1;
        this.loadUsers();
    }

    /**
     * Load users
     */
    async loadUsers() {
        const tbody = document.getElementById('usersTableBody');
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="9" class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading users...</td></tr>';
        }
        
        try {
            const params = {
                page: this.usersPage,
                limit: 25,
                ...this.usersFilters
            };
            
            const result = await adminAPI.getUsers(params);
            this.usersPagination = result.pagination;
            this.renderUsers(result.users);
            this.updateUsersPagination();
        } catch (error) {
            console.error('[AdminApp] Failed to load users:', error);
            if (tbody) {
                tbody.innerHTML = '<tr><td colspan="9" class="loading-row">Failed to load users</td></tr>';
            }
        }
    }

    /**
     * Render users table
     */
    renderUsers(users) {
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="10" class="loading-row">No users found</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.id}</td>
                <td>${this.escapeHtml(user.display_name)}</td>
                <td>${this.escapeHtml(user.email)}</td>
                <td><span class="badge badge-${user.role}">${user.role}</span></td>
                <td>${user.tasks_completed}</td>
                <td>${user.total_score}</td>
                <td>${user.event_count}</td>
                <td>${user.last_activity ? this.formatDateTime(user.last_activity) : '-'}</td>
                <td>${this.formatDateTime(user.created_at)}</td>
                <td>
                    <button class="btn btn-action view-user-stats" data-user-id="${user.id}" data-user-name="${this.escapeHtml(user.display_name)}">
                        <i class="fas fa-chart-bar"></i> Stats
                    </button>
                    <button class="btn btn-action filter-user-logs" data-user-id="${user.id}">
                        <i class="fas fa-list"></i> Logs
                    </button>
                </td>
            </tr>
        `).join('');
        
        // Add event listeners for action buttons
        tbody.querySelectorAll('.view-user-stats').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.userId;
                const userName = btn.dataset.userName;
                this.showUserStats(userId, userName);
            });
        });
        
        tbody.querySelectorAll('.filter-user-logs').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.userId;
                // Filter logs by this user
                document.getElementById('userIdFilter').value = userId;
                this.applyLogsFilters();
                this.switchTab('logs');
            });
        });
    }
    
    /**
     * Show user stats modal
     */
    async showUserStats(userId, userName) {
        const modal = document.getElementById('userStatsModal');
        const modalBody = document.getElementById('userStatsBody');
        const modalName = document.getElementById('userStatsName');
        
        if (!modal || !modalBody) return;
        
        // Show modal with loading state
        modal.classList.add('active');
        modalName.textContent = `${userName}'s Stats`;
        modalBody.innerHTML = '<div class="loading-row"><i class="fas fa-spinner fa-spin"></i> Loading user stats...</div>';
        
        try {
            const data = await adminAPI.getUserStats(userId);
            this.renderUserStatsModal(data);
        } catch (error) {
            console.error('[AdminApp] Failed to load user stats:', error);
            modalBody.innerHTML = '<div class="loading-row">Failed to load user stats</div>';
        }
    }
    
    /**
     * Render user stats in modal
     */
    renderUserStatsModal(data) {
        const modalBody = document.getElementById('userStatsBody');
        if (!modalBody) return;
        
        const { user, stats, recentActivity } = data;
        
        modalBody.innerHTML = `
            <!-- Stats Grid -->
            <div class="user-stats-grid">
                <div class="user-stat-card">
                    <span class="stat-value">${stats.tasks.completed}</span>
                    <span class="stat-label">Tasks Completed</span>
                </div>
                <div class="user-stat-card">
                    <span class="stat-value">${stats.tasks.totalScore}</span>
                    <span class="stat-label">Total Score</span>
                </div>
                <div class="user-stat-card">
                    <span class="stat-value">${stats.events.total}</span>
                    <span class="stat-label">Total Events</span>
                </div>
                <div class="user-stat-card">
                    <span class="stat-value">${stats.commands.total}</span>
                    <span class="stat-label">Commands Run</span>
                </div>
                <div class="user-stat-card">
                    <span class="stat-value">${stats.commands.failed}</span>
                    <span class="stat-label">Failed Commands</span>
                </div>
                <div class="user-stat-card">
                    <span class="stat-value">${stats.hints.used}</span>
                    <span class="stat-label">Hints Used</span>
                </div>
            </div>
            
            <!-- User Info -->
            <div class="user-info-section">
                <h4><i class="fas fa-user"></i> User Information</h4>
                <div class="info-row">
                    <span class="info-label">Email</span>
                    <span class="info-value">${this.escapeHtml(user.email)}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Role</span>
                    <span class="info-value"><span class="badge badge-${user.role}">${user.role}</span></span>
                </div>
                <div class="info-row">
                    <span class="info-label">Tutorial Completed</span>
                    <span class="info-value">${user.tutorialCompleted ? '<i class="fas fa-check" style="color: #22c55e;"></i> Yes' : '<i class="fas fa-times" style="color: #ef4444;"></i> No'}</span>
                </div>
                <div class="info-row">
                    <span class="info-label">Account Created</span>
                    <span class="info-value">${this.formatDateTime(user.createdAt)}</span>
                </div>
            </div>
            
            <!-- Scenarios -->
            ${stats.scenarios.length > 0 ? `
            <div class="user-info-section">
                <h4><i class="fas fa-gamepad"></i> Scenarios Played (${stats.scenarios.length})</h4>
                <div class="scenarios-list">
                    ${stats.scenarios.map(s => `<span class="scenario-tag">${s}</span>`).join('')}
                </div>
            </div>
            ` : ''}
            
            <!-- Badges -->
            ${stats.badges.length > 0 ? `
            <div class="user-info-section">
                <h4><i class="fas fa-medal"></i> Badges Earned (${stats.badges.length})</h4>
                <div class="badges-list">
                    ${stats.badges.map(b => `
                        <span class="badge-item-small">
                            <i class="fas fa-trophy"></i> ${b.name} (+${b.badge_points})
                        </span>
                    `).join('')}
                </div>
            </div>
            ` : ''}
            
            <!-- Events by Type -->
            ${stats.events.byType.length > 0 ? `
            <div class="user-info-section">
                <h4><i class="fas fa-chart-pie"></i> Events by Type</h4>
                ${stats.events.byType.slice(0, 5).map(e => `
                    <div class="info-row">
                        <span class="info-label">${this.formatEventType(e.event_type)}</span>
                        <span class="info-value">${e.count}</span>
                    </div>
                `).join('')}
            </div>
            ` : ''}
            
            <!-- Recent Activity -->
            ${recentActivity.length > 0 ? `
            <div class="user-info-section">
                <h4><i class="fas fa-history"></i> Recent Activity</h4>
                <div class="recent-activity-list">
                    ${recentActivity.map(event => `
                        <div class="recent-event">
                            <span class="recent-event-time">${this.formatDateTime(event.created_at)}</span>
                            <span class="recent-event-type">${this.formatEventType(event.event_type)}</span>
                            ${event.scenario_code ? `<span class="scenario-tag">${event.scenario_code}</span>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
            ` : ''}
        `;
    }
    
    /**
     * Close user stats modal
     */
    closeUserStatsModal() {
        const modal = document.getElementById('userStatsModal');
        if (modal) {
            modal.classList.remove('active');
        }
    }

    /**
     * Update users pagination UI
     */
    updateUsersPagination() {
        const info = document.getElementById('usersPaginationInfo');
        const prevBtn = document.getElementById('usersPrevBtn');
        const nextBtn = document.getElementById('usersNextBtn');
        
        if (this.usersPagination) {
            if (info) {
                info.textContent = `Page ${this.usersPagination.page} of ${this.usersPagination.totalPages} (${this.usersPagination.total} total)`;
            }
            if (prevBtn) {
                prevBtn.disabled = this.usersPagination.page <= 1;
            }
            if (nextBtn) {
                nextBtn.disabled = this.usersPagination.page >= this.usersPagination.totalPages;
            }
        }
    }

    /**
     * Format event type for display
     */
    formatEventType(type) {
        if (!type) return '-';
        return type.split('_').map(word => 
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');
    }

    /**
     * Format date for display
     */
    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric'
        });
    }

    /**
     * Format datetime for display
     */
    formatDateTime(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleString('en-US', {
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /**
     * Escape HTML to prevent XSS
     */
    escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// Initialize
new AdminApp();

