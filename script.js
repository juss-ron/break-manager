// Configuration
const API_URL = 'https://break-manager-api.onrender.com';

// State
let currentUser = null;
let currentTeam = null;
let timerInterval = null;
let timerMode = 'personal'; // 'personal' or 'hackathon'

// DOM Elements
const elements = {
    // Auth Forms
    loginForm: document.getElementById('login-form'),
    signupForm: document.getElementById('signup-form'),

    // Auth Inputs
    loginEmail: document.getElementById('login-email'),
    loginPassword: document.getElementById('login-password'),
    signupName: document.getElementById('signup-name'),
    signupEmail: document.getElementById('signup-email'),
    signupPassword: document.getElementById('signup-password'),

    // Team Onboarding Elements (New)
    showCreateTeamBtn: document.getElementById('show-create-team-modal-btn'),
    showJoinTeamBtn: document.getElementById('show-join-team-modal-btn'),

    // Create Team Modal
    createTeamModal: document.getElementById('create-team-modal'),
    newTeamNameInput: document.getElementById('new-team-name'),
    cancelCreateTeamBtn: document.getElementById('cancel-create-team-btn'),
    confirmCreateTeamBtn: document.getElementById('confirm-create-team-btn'),

    // Join Team Modal
    joinTeamModal: document.getElementById('join-team-modal'),
    joinTeamCodeInput: document.getElementById('join-team-code'),
    cancelJoinTeamBtn: document.getElementById('cancel-join-team-btn'),
    confirmJoinTeamBtn: document.getElementById('confirm-join-team-btn'),

    // Displays
    userName: document.getElementById('user-name-display'),
    teamName: document.getElementById('team-name-display'),
    teamCode: document.getElementById('team-code-display'),
    timer: document.getElementById('timer'),
    timerStatus: document.getElementById('timer-status'),
    teamList: document.getElementById('team-list'),

    // Controls
    logoutBtn: document.getElementById('logout-btn'),
    dashboardLogoutBtn: document.getElementById('dashboard-logout-btn'),
    startBreakBtn: document.getElementById('start-break-btn'),
    endBreakBtn: document.getElementById('end-break-btn'),

    // Hackathon Controls
    toggleTimerBtn: document.getElementById('toggle-hackathon-timer-btn'),
    setHackathonBtn: document.getElementById('set-hackathon-btn'),
    startHackathonBtn: document.getElementById('start-hackathon-btn'),
    pauseHackathonBtn: document.getElementById('pause-hackathon-btn'),
    deleteTeamBtn: document.getElementById('delete-team-btn'),

    // Set Time Modal
    setTimeModal: document.getElementById('set-time-modal'),
    hoursInput: document.getElementById('hours-input'),
    minutesInput: document.getElementById('minutes-input'),
    cancelTimeBtn: document.getElementById('cancel-time-btn'),
    saveTimeBtn: document.getElementById('save-time-btn')
};

// API Helper
async function apiCall(endpoint, method = 'GET', body = null) {
    const headers = {
        'Content-Type': 'application/json'
    };

    const token = localStorage.getItem('token');
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    const config = {
        method,
        headers
    };

    if (body) {
        config.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_URL}${endpoint}`, config);
    if (response.status === 401 || response.status === 403) {
        // Token expired or invalid
        if (!endpoint.includes('login') && !endpoint.includes('register')) {
            logout();
            return null;
        }
    }

    const data = await response.json();
    if (!response.ok) {
        throw new Error(data.message || 'API Error');
    }
    return data;
}

// Initialization
function init() {
    checkSession();
    setupEventListeners();
}

async function checkSession() {
    const token = localStorage.getItem('token');
    const path = window.location.pathname;
    const page = path.split('/').pop();

    if (token) {
        try {
            // First Get Current User/Team Info
            // We can determine if user has team by trying to fetch current team
            // But we don't have a direct "get me" route, we decode token or assume session valid
            // Let's try to get /api/teams/current. If 404, user has no team.

            try {
                const teamData = await apiCall('/teams/current');
                currentTeam = teamData; // Team with included users
                currentUser = currentTeam.Users.find(u => u.id === parseJwt(token).id); // Hacky find from included users or need separate /me endpoint

                // If we got team, user is in team
                if (page === 'login.html' || page === 'register.html' || page === 'enterteam.html' || page === '') {
                    window.location.href = 'dashboard.html';
                    return;
                }

                if (page === 'dashboard.html' || page === currentTeam.name) {
                    // URL logic
                    const stateObj = { team: currentTeam.name };
                    const newUrl = '/' + encodeURIComponent(currentTeam.name);
                    try {
                        if (!window.location.pathname.endsWith(newUrl)) {
                            window.history.replaceState(stateObj, document.title, newUrl);
                        }
                    } catch (e) { console.log('History API restricted'); }

                    if (currentTeam.hackathonTimerIsRunning) {
                        startTimerInterval();
                    }
                    updateDashboard();
                }

            } catch (err) {
                // 404 means no team
                // We need to at least get the user name. 
                // Simple decoding of token for now since we don't have /api/users/me yet.
                const decoded = parseJwt(token);
                currentUser = { name: decoded.email.split('@')[0], ...decoded }; // Fallback

                if (page === 'login.html' || page === 'register.html' || page === '') {
                    window.location.href = 'enterteam.html';
                } else if (page === 'dashboard.html') {
                    window.location.href = 'enterteam.html';
                }

                if (page.includes('enterteam.html') && elements.userName) {
                    elements.userName.textContent = 'User ' + currentUser.email; // Simplified
                }
            }

        } catch (e) {
            console.error(e);
            logout();
        }
    } else {
        if (page === 'dashboard.html' || page === 'enterteam.html') {
            window.location.href = 'login.html';
        }
    }
}

function parseJwt(token) {
    try {
        var base64Url = token.split('.')[1];
        var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        var jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function (c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) { return {}; }
}

// Auth Functions
async function login(email, password) {
    try {
        const data = await apiCall('/auth/login', 'POST', { email, password });
        localStorage.setItem('token', data.token);
        // define user from response
        currentUser = data.user;

        // Redirect logic
        window.location.reload(); // checkSession will handle it
    } catch (error) {
        alert('Login failed: ' + error.message);
    }
}

async function signup(name, email, password) {
    try {
        const data = await apiCall('/auth/register', 'POST', { name, email, password });
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        window.location.reload();
    } catch (error) {
        alert('Signup failed: ' + error.message);
    }
}

function logout() {
    if (timerInterval) clearInterval(timerInterval);
    localStorage.removeItem('token');
    window.location.href = 'login.html';
}

// Dashboard & Timer Functions
async function updateDashboard() {
    // We should re-fetch team data to stay in sync
    try {
        const teamData = await apiCall('/teams/current');
        currentTeam = teamData;
        currentUser = currentTeam.Users.find(u => u.email === parseJwt(localStorage.getItem('token')).email) || currentUser;

        if (!elements.teamName) return;
        elements.teamName.textContent = currentTeam.name;
        elements.teamCode.textContent = `Code: ${currentTeam.code}`;

        updateTimerDisplay();
        renderTeamList();
    } catch (e) {
        console.error('Sync error', e);
    }
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ... (previous code)

function updateTimerDisplay() {
    if (!elements.timer) return;

    if (timerMode === 'personal') {
        document.getElementById('timer-title').textContent = 'Personal Rest Timer';
        elements.timer.textContent = formatTime(currentUser.breakTimeRemaining || 0);

        document.getElementById('personal-controls').classList.remove('hidden');
        document.getElementById('hackathon-controls').classList.add('hidden');

        // Personal Status Logic
        if (currentUser.breakTimeRemaining <= 0 && currentUser.status === 'break') {
            elements.timer.classList.add('limit-reached');
            elements.timerStatus.textContent = 'Rest Limit Reached';
            elements.timerStatus.style.color = 'var(--accent-red)';
        } else if (currentUser.status === 'break') {
            elements.startBreakBtn.disabled = true;
            elements.endBreakBtn.disabled = false;
            elements.timerStatus.textContent = 'On Break';
            elements.timer.classList.add('active');
            elements.timerStatus.style.color = 'var(--accent-orange)';
        } else {
            elements.timer.classList.remove('limit-reached');
            elements.timer.classList.remove('active');
            elements.startBreakBtn.disabled = false;
            elements.endBreakBtn.disabled = true;
            elements.timerStatus.textContent = 'Ready to Break';
            elements.timerStatus.style.color = 'var(--accent-green)';
        }

    } else {
        // Hackathon Mode
        document.getElementById('timer-title').textContent = 'Hackathon Remaining';

        const remaining = Math.max(0, currentTeam.hackathonTimerRemaining || 0);
        const isRunning = currentTeam.hackathonTimerIsRunning;

        // Visual update only, interval handles the ticking
        if (!timerInterval && isRunning) {
            elements.timer.textContent = formatTime(remaining);
        } else if (!isRunning) {
            elements.timer.textContent = formatTime(remaining);
        }

        // Hide Personal UI
        document.getElementById('personal-controls').classList.add('hidden');
        elements.timerStatus.textContent = isRunning ? 'Hackathon in Progress' : 'Hackathon Paused';
        elements.timerStatus.style.color = isRunning ? 'var(--accent-neon-blue)' : 'var(--text-secondary)';

        // Ensure timer is running if it should be
        if (isRunning && !timerInterval) {
            startTimerInterval();
        } else if (!isRunning && timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }

        // Show/Hide Hackathon Controls based on role
        const hackathonControls = document.getElementById('hackathon-controls');
        if (currentUser.role === 'admin' || currentUser.role === 'leader') {
            hackathonControls.classList.remove('hidden');

            if (isRunning) {
                elements.startHackathonBtn.disabled = true; // Start disabled
                elements.pauseHackathonBtn.disabled = false; // Pause enabled
                elements.deleteTeamBtn.disabled = true;
                elements.timer.classList.add('active');
            } else {
                elements.startHackathonBtn.disabled = false; // Start enabled
                elements.pauseHackathonBtn.disabled = true; // Pause disabled
                elements.deleteTeamBtn.disabled = false;
                elements.timer.classList.remove('active');
            }
        } else {
            hackathonControls.classList.add('hidden'); // Members see no controls
        }
    }

    // New: Manage Set Time button visibility in footer
    if (elements.setHackathonBtn) {
        if (currentUser.role === 'admin' || currentUser.role === 'leader') {
            elements.setHackathonBtn.style.display = 'block';
        } else {
            elements.setHackathonBtn.style.display = 'none';
        }
    }
}

// ... 

let localTargetTime = null;
const SYNC_INTERVAL = 15; // Sync every 15 seconds
const SYNC_THRESHOLD = 2; // Allow up to 2 seconds of drift before forcing a correction

function startTimerInterval() {
    if (timerInterval) clearInterval(timerInterval);

    // Calculate initial target time
    if (timerMode === 'hackathon' && currentTeam.hackathonTimerIsRunning) {
        // Calculate target time based on current remaining reported by server
        localTargetTime = Date.now() + (currentTeam.hackathonTimerRemaining * 1000);
    }

    timerInterval = setInterval(() => {
        if (timerMode === 'hackathon' && currentTeam.hackathonTimerIsRunning) {

            if (!localTargetTime) {
                localTargetTime = Date.now() + (currentTeam.hackathonTimerRemaining * 1000);
            }

            const now = Date.now();
            const secondsLeft = Math.max(0, Math.ceil((localTargetTime - now) / 1000));

            // Update the display
            if (elements.timer) elements.timer.textContent = formatTime(secondsLeft);
            currentTeam.hackathonTimerRemaining = secondsLeft; // Soft update data model

            // --- Synchronization Check ---
            // Only sync if the current second is a multiple of the SYNC_INTERVAL
            if (new Date().getSeconds() % SYNC_INTERVAL === 0) {
                // Record the time before the request
                const syncStartTime = Date.now();

                updateDashboard().then(() => {
                    // Time elapsed during the API call (latency)
                    const latencyMs = Date.now() - syncStartTime;

                    if (timerMode === 'hackathon' && currentTeam.hackathonTimerIsRunning) {

                        // 1. Get the authoritative time the server sent back:
                        const serverRemaining = currentTeam.hackathonTimerRemaining;

                        // 2. Calculate what the server's time *should* be right now, 
                        //    by deducting the time spent waiting for the API response.
                        const estimatedServerRemainingNow = serverRemaining - (latencyMs / 1000);

                        // 3. Calculate the local remaining time based on our local target:
                        const localRemaining = (localTargetTime - Date.now()) / 1000;

                        // 4. Calculate the drift (how much the local clock is ahead of the server's corrected time)
                        //    Positive drift means the local clock is running faster/ahead.
                        const drift = localRemaining - estimatedServerRemainingNow;

                        // If drift is too large (more than 2 seconds difference), forcefully re-align
                        if (Math.abs(drift) > SYNC_THRESHOLD) {
                            console.warn(`Timer drift detected! Local: ${Math.round(localRemaining)}s, Server: ${Math.round(serverRemaining)}s. Correcting.`);

                            // Better approach: simply reset the local target based on the server's absolute time
                            // fetched in updateDashboard, as the server's calculation in the backend is superior.
                            localTargetTime = Date.now() + (serverRemaining * 1000);
                        }
                        // Note: If the drift is small (within the threshold), we trust the local clock to run smoothly.
                    }
                });
            }

        } else if (timerMode === 'personal' && currentUser.status === 'break') {
            // Simple decrement for personal
            currentUser.breakTimeRemaining--;
            if (elements.timer) elements.timer.textContent = formatTime(Math.max(0, currentUser.breakTimeRemaining));
        }
    }, 1000);
}

function renderTeamList() {
    if (!elements.teamList || !currentTeam || !currentTeam.Users) return;
    elements.teamList.innerHTML = '';

    const teamMembers = currentTeam.Users;

    // Sort: Current user first, then others
    teamMembers.sort((a, b) => {
        if (a.id === currentUser.id) return -1;
        if (b.id === currentUser.id) return 1;
        return a.name.localeCompare(b.name);
    });

    teamMembers.forEach(member => {
        const card = document.createElement('div');
        card.className = 'team-card';

        let statusClass = 'coding';
        let statusText = 'Coding';

        if (member.status === 'break') {
            statusClass = 'break';
            statusText = 'On Break';
            if (member.breakTimeRemaining <= 0) {
                statusClass = 'limit';
                statusText = 'Limit Reached';
            }
        }

        // Improved comparison using ID
        const isMe = (member.id === currentUser.id) ? ' (You)' : '';

        card.innerHTML = `
            <span class="member-name">${member.name}${isMe}</span>
            <div class="status-indicator ${statusClass}">
                <div class="dot"></div>
                <span>${statusText}</span>
            </div>
        `;

        elements.teamList.appendChild(card);
    });
}

// Team Functions
async function createTeam() {
    const teamName = elements.newTeamNameInput.value;
    if (!teamName) {
        alert('Please enter a team name');
        return;
    }

    try {
        const data = await apiCall('/teams', 'POST', { name: teamName });
        currentTeam = data.team;
        window.location.href = 'dashboard.html';
    } catch (error) {
        alert('Create team failed: ' + error.message);
    }
}

async function joinTeam() {
    const code = elements.joinTeamCodeInput.value;
    if (!code) {
        alert('Please enter a team code');
        return;
    }

    try {
        const data = await apiCall('/teams/join', 'POST', { code });
        window.location.href = 'dashboard.html';
    } catch (error) {
        alert('Join team failed: ' + error.message);
    }
}

async function startBreak() {
    try {
        await apiCall('/timer/breaks/start', 'POST');
        updateDashboard();
    } catch (e) {
        alert(e.message);
    }
}

async function endBreak() {
    try {
        await apiCall('/timer/breaks/end', 'POST');
        if (timerInterval) clearInterval(timerInterval);
        updateDashboard();
    } catch (e) {
        alert(e.message);
    }
}

// ... (Dashboard functions remain same)

function setupEventListeners() {
    if (elements.loginForm) {
        elements.loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const password = elements.loginPassword ? elements.loginPassword.value : prompt("Enter Password:");
            login(elements.loginEmail.value, password);
        });
    }

    if (elements.signupForm) {
        elements.signupForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const password = elements.signupPassword ? elements.signupPassword.value : prompt("Create Password:");
            signup(elements.signupName.value, elements.signupEmail.value, password);
        });
    }

    // Team Onboarding Listeners
    if (elements.showCreateTeamBtn) {
        elements.showCreateTeamBtn.addEventListener('click', () => {
            elements.createTeamModal.classList.add('active');
        });
    }

    if (elements.cancelCreateTeamBtn) {
        elements.cancelCreateTeamBtn.addEventListener('click', () => {
            elements.createTeamModal.classList.remove('active');
        });
    }

    if (elements.confirmCreateTeamBtn) {
        elements.confirmCreateTeamBtn.addEventListener('click', createTeam);
    }

    if (elements.showJoinTeamBtn) {
        elements.showJoinTeamBtn.addEventListener('click', () => {
            elements.joinTeamModal.classList.add('active');
        });
    }

    if (elements.cancelJoinTeamBtn) {
        elements.cancelJoinTeamBtn.addEventListener('click', () => {
            elements.joinTeamModal.classList.remove('active');
        });
    }

    if (elements.confirmJoinTeamBtn) {
        elements.confirmJoinTeamBtn.addEventListener('click', joinTeam);
    }

    if (elements.logoutBtn) {
        elements.logoutBtn.addEventListener('click', logout);
    }

    if (elements.dashboardLogoutBtn) {
        elements.dashboardLogoutBtn.addEventListener('click', logout);
    }

    if (elements.startBreakBtn) {
        elements.startBreakBtn.addEventListener('click', startBreak);
    }

    if (elements.endBreakBtn) {
        elements.endBreakBtn.addEventListener('click', endBreak);
    }

    // Dashboard Timer Toggles
    if (elements.toggleTimerBtn) {
        console.log('Attaching listener to toggleTimerBtn');
        elements.toggleTimerBtn.addEventListener('click', () => {
            console.log('Toggle Timer Clicked. Current Mode:', timerMode);
            try {
                if (timerMode === 'personal') {
                    timerMode = 'hackathon';
                    elements.toggleTimerBtn.textContent = 'View Personal Timer';
                } else {
                    timerMode = 'personal';
                    elements.toggleTimerBtn.textContent = 'View Hackathon Timer';
                }
                updateDashboard();
            } catch (e) {
                console.error('Error in toggle timer:', e);
                alert('Error: ' + e.message);
            }
        });
    } else {
        console.error('toggleTimerBtn element NOT found');
    }

    // Modal Event Listeners (Set Time)
    if (elements.setHackathonBtn) {
        console.log('Attaching listener to setHackathonBtn');
        elements.setHackathonBtn.addEventListener('click', () => {
            console.log('Set Time Clicked');
            try {
                if (elements.setTimeModal) {
                    elements.setTimeModal.classList.add('active');
                } else {
                    console.error('Set Time Modal element not found');
                }
            } catch (e) {
                console.error('Error opening modal:', e);
            }
        });
    } else {
        console.error('setHackathonBtn element NOT found');
    }

    if (elements.cancelTimeBtn) {
        elements.cancelTimeBtn.addEventListener('click', () => {
            elements.setTimeModal.classList.remove('active');
        });
    }

    if (elements.saveTimeBtn) {
        elements.saveTimeBtn.addEventListener('click', async () => {
            const h = parseInt(elements.hoursInput.value) || 0;
            const m = parseInt(elements.minutesInput.value) || 0;

            if (h === 0 && m === 0) {
                alert('Please enter a valid duration.');
                return;
            }
            const totalSeconds = (h * 3600) + (m * 60);

            try {
                await apiCall('/timer/set', 'POST', { duration: totalSeconds });
                elements.setTimeModal.classList.remove('active');
                updateDashboard();
            } catch (e) {
                alert(e.message);
            }

            elements.hoursInput.value = '';
            elements.minutesInput.value = '';
        });
    }

    // Hackathon Controls
    if (elements.startHackathonBtn) {
        elements.startHackathonBtn.addEventListener('click', () => toggleHackathonTimer(true));
    }

    if (elements.pauseHackathonBtn) {
        elements.pauseHackathonBtn.addEventListener('click', () => toggleHackathonTimer(false));
    }

    if (elements.deleteTeamBtn) {
        elements.deleteTeamBtn.addEventListener('click', deleteTeam);
    }
}

async function toggleHackathonTimer(start) {
    try {
        await apiCall('/timer/status', 'POST', { isRunning: start });

        // --- FIX: Immediately reset timer state after server confirms start/pause ---
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null; // Clear the old interval handle
        }
        localTargetTime = null; // Clear old target time, force recalculation in updateDashboard -> startTimerInterval
        // --------------------------------------------------------------------------

        updateDashboard();
    } catch (e) {
        alert(e.message);
    }
}

async function deleteTeam() {
    if (!currentTeam) return;

    if (confirm('Are you sure you want to delete this team? This action cannot be undone.')) {
        try {
            await apiCall(`/teams/${currentTeam.id}`, 'DELETE');
            logout();
        } catch (e) {
            alert(e.message);
        }
    }
}

// Start
init();
