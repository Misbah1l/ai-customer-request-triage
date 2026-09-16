const API_BASE = (typeof window !== "undefined" && window.API_BASE) || "";
const AUTH_STORAGE_KEY = "triage_access_token";

let currentUser = null;

function getAuthHeaders() {
    const token = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!token) {
        return {};
    }
    return {
        Authorization: `Bearer ${token}`,
    };
}

async function authFetch(path, options = {}) {
    const headers = {
        "Content-Type": "application/json",
        ...getAuthHeaders(),
        ...(options.headers || {}),
    };

    const response = await fetch(`${API_BASE}${path}`, {
        ...options,
        headers,
    });

    if (response.status === 401) {
        logout();
        throw new Error("Session expired. Please sign in again.");
    }

    return response;
}

function showAuthError(message) {
    const el = document.getElementById("auth-error");
    el.textContent = message;
    el.classList.remove("hidden");
}

function hideAuthError() {
    const el = document.getElementById("auth-error");
    el.classList.add("hidden");
    el.textContent = "";
}

function showSection(id) {
    document.querySelectorAll("main > section").forEach((section) => {
        section.classList.add("hidden");
    });
    const target = document.getElementById(id);
    if (target) {
        target.classList.remove("hidden");
    }
}

function showDashboard() {
    document.getElementById("auth-section").classList.add("hidden");
    document.getElementById("dashboard-section").classList.remove("hidden");
    loadStats();
    loadHistory();
    loadReviewQueue();
}

function showAuth() {
    document.getElementById("auth-section").classList.remove("hidden");
    document.getElementById("dashboard-section").classList.add("hidden");
}

async function loadUser() {
    const token = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!token) {
        showAuth();
        return;
    }

    try {
        const response = await authFetch("/auth/me");
        if (!response.ok) {
            throw new Error("Failed to load user");
        }
        currentUser = await response.json();
        document.getElementById("user-name").textContent = currentUser.name;
        document.getElementById("user-org").textContent = currentUser.organization_id
            ? `Workspace #${currentUser.organization_id}`
            : "";
        
        // Set role badge
        const roleBadge = document.getElementById("user-role");
        if (roleBadge && currentUser.role) {
            roleBadge.textContent = currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
            roleBadge.className = "role-badge " + currentUser.role;
        }
        
        showDashboard();
        startReviewPolling();
    } catch (err) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        currentUser = null;
        showAuth();
    }
}

function logout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    currentUser = null;
    stopReviewPolling();
    showAuth();
    hideAuthError();
}

// Simple auth mode toggle - can be called inline or from JS
function toggleAuthMode(mode) {
    hideAuthError();
    const loginForm = document.getElementById("login-form");
    const registerForm = document.getElementById("register-form");
    const authHeading = document.getElementById("auth-heading");
    
    if (mode === "register") {
        loginForm.classList.add("hidden");
        registerForm.classList.remove("hidden");
        if (authHeading) authHeading.textContent = "Create Account";
    } else {
        registerForm.classList.add("hidden");
        loginForm.classList.remove("hidden");
        if (authHeading) authHeading.textContent = "Sign In";
    }
}

// Expose globally for inline HTML event handlers
window.toggleAuthMode = toggleAuthMode;

// Handle auth form submission using standard form data
async function handleLoginSubmit(event) {
    event.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    
    if (!email || !password) {
        showAuthError("Please enter both email and password.");
        return;
    }
    
    await login(email, password);
}

async function handleRegisterSubmit(event) {
    event.preventDefault();
    const name = document.getElementById("register-name").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    
    if (!name || !email || !password) {
        showAuthError("Please fill in all fields.");
        return;
    }
    if (password.length < 8) {
        showAuthError("Password must be at least 8 characters.");
        return;
    }
    
    await register(name, email, password);
}

// Expose globally for inline HTML event handlers
window.handleLoginSubmit = handleLoginSubmit;
window.handleRegisterSubmit = handleRegisterSubmit;

async function login(email, password) {
    hideAuthError();
    try {
        const response = await fetch(`${API_BASE}/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email, password }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || "Login failed. Please check your credentials.");
        }

        const data = await response.json();
        localStorage.setItem(AUTH_STORAGE_KEY, data.access_token);
        await loadUser();
    } catch (err) {
        showAuthError(err.message || "An unexpected error occurred during login.");
    }
}

async function register(name, email, password) {
    hideAuthError();
    try {
        const response = await fetch(`${API_BASE}/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, email, password }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || "Registration failed. Please try again.");
        }

        const data = await response.json();
        localStorage.setItem(AUTH_STORAGE_KEY, data.access_token);
        await loadUser();
    } catch (err) {
        showAuthError(err.message || "An unexpected error occurred during registration.");
    }
}

const inputEl = document.getElementById("request-input");
const analyzeBtn = document.getElementById("analyze-btn");
const clearBtn = document.getElementById("clear-btn");
const loadingEl = document.getElementById("loading");
const errorEl = document.getElementById("error-message");
const resultSection = document.getElementById("result-section");

const resultCategory = document.getElementById("result-category");
const resultConfidence = document.getElementById("result-confidence");
const resultSummary = document.getElementById("result-summary");
const resultRisk = document.getElementById("result-risk");
const resultRoute = document.getElementById("result-route");
const resultStatus = document.getElementById("result-status");
const humanReviewIndicator = document.getElementById("human-review-indicator");
const resultBadge = document.getElementById("result-badge");

const statTotal = document.getElementById("stat-total");
const statHumanReview = document.getElementById("stat-human-review");
const statHighRisk = document.getElementById("stat-high-risk");
const statRouted = document.getElementById("stat-routed");

const refreshHistoryBtn = document.getElementById("refresh-history");
const exportCsvBtn = document.getElementById("export-csv");
const historyLoading = document.getElementById("history-loading");
const historyError = document.getElementById("history-error");
const historyEmpty = document.getElementById("history-empty");
const historyEmptyAll = document.getElementById("history-empty-all");
const historyTable = document.getElementById("history-table");
const historyBody = document.getElementById("history-body");
const historyBulkToolbar = document.getElementById("history-bulk-toolbar");
const historyBulkCount = document.getElementById("history-bulk-count");
const historySelectAll = document.getElementById("history-select-all");
const historyBulkAssign = document.getElementById("history-bulk-assign");
const historyBulkResolve = document.getElementById("history-bulk-resolve");
const historyBulkCancel = document.getElementById("history-bulk-cancel");
const filterCategory = document.getElementById("filter-category");
const filterRisk = document.getElementById("filter-risk");
const filterStatus = document.getElementById("filter-status");
const searchInput = document.getElementById("search-input");
const filterStartDate = document.getElementById("filter-start-date");
const filterEndDate = document.getElementById("filter-end-date");
const exportSummaryBtn = document.getElementById("export-summary");
const drawerBackdrop = document.getElementById("drawer-backdrop");
const drawerCategory = document.getElementById("drawer-category");
const drawerConfidence = document.getElementById("drawer-confidence");
const drawerSummary = document.getElementById("drawer-summary");
const drawerRisk = document.getElementById("drawer-risk");
const drawerRoute = document.getElementById("drawer-route");
const drawerStatus = document.getElementById("drawer-status");
const drawerAssigned = document.getElementById("drawer-assigned");
const drawerInput = document.getElementById("drawer-input");
const drawerReason = document.getElementById("drawer-reason");
const drawerError = document.getElementById("drawer-error");
const drawerAssignedRow = document.getElementById("drawer-assigned-row");
const drawerReasonRow = document.getElementById("drawer-reason-row");
const drawerErrorRow = document.getElementById("drawer-error-row");
const drawerCloseBtn = document.getElementById("drawer-close");
const drawerCloseBtn2 = document.getElementById("drawer-close-btn");

const refreshReviewBtn = document.getElementById("refresh-review");
const reviewLoading = document.getElementById("review-loading");
const reviewError = document.getElementById("review-error");
const reviewEmpty = document.getElementById("review-empty");
const reviewTable = document.getElementById("review-table");
const reviewBody = document.getElementById("review-body");
const reviewBulkToolbar = document.getElementById("review-bulk-toolbar");
const reviewBulkCount = document.getElementById("review-bulk-count");
const reviewSelectAll = document.getElementById("review-select-all");
const reviewBulkAssign = document.getElementById("review-bulk-assign");
const reviewBulkResolve = document.getElementById("review-bulk-resolve");
const reviewBulkCancel = document.getElementById("review-bulk-cancel");

const drawerAssignBtn = document.getElementById("drawer-assign-btn");
const drawerStatusBtn = document.getElementById("drawer-status-btn");
const drawerResolveBtn = document.getElementById("drawer-resolve-btn");

const drawerCommentsList = document.getElementById("drawer-comments-list");
const drawerCommentsLoading = document.getElementById("drawer-comments-loading");
const drawerCommentsError = document.getElementById("drawer-comments-error");
const drawerCommentForm = document.getElementById("drawer-comment-form");
const drawerCommentInput = document.getElementById("drawer-comment-input");

let currentReviewId = null;
let currentReviewAssignedTo = null;

let allHistoryRequests = [];
let searchDebounceTimer = null;

let categoryChart = null;
let riskChart = null;

// Bulk selection state
let selectedReviewIds = new Set();
let selectedHistoryIds = new Set();

// Polling state
let knownReviewTicketIds = new Set();
let reviewPollingInterval = null;
const POLLING_INTERVAL_MS = 10000; // 10 seconds

function showError(element, message) {
    element.textContent = message;
    element.classList.remove("hidden");
}

function hideError(element) {
    element.classList.add("hidden");
    element.textContent = "";
}

function setLoading(element, isLoading) {
    element.classList.toggle("hidden", !isLoading);
}

function setBadge(element, variant, text) {
    element.textContent = text;
    element.setAttribute("data-variant", variant);
    element.classList.remove("hidden");
}

// Toast notification system
function showToast(message, type = "info") {
    const container = getOrCreateToastContainer();
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.setAttribute("role", "alert");
    toast.setAttribute("aria-live", "polite");
    
    const icons = {
        info: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>',
        warning: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        success: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    };
    
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${message}</span>
        <button class="toast-close" aria-label="Dismiss">&times;</button>
    `;
    
    toast.querySelector(".toast-close").addEventListener("click", () => {
        toast.classList.add("toast-hiding");
        setTimeout(() => toast.remove(), 300);
    });
    
    container.appendChild(toast);
    
    // Auto-remove after 8 seconds
    setTimeout(() => {
        if (toast.parentNode) {
            toast.classList.add("toast-hiding");
            setTimeout(() => toast.remove(), 300);
        }
    }, 8000);
}

function getOrCreateToastContainer() {
    let container = document.getElementById("toast-container");
    if (!container) {
        container = document.createElement("div");
        container.id = "toast-container";
        container.className = "toast-container";
        document.body.appendChild(container);
    }
    return container;
}

function playNotificationSound() {
    // Create a subtle click sound using Web Audio API
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.15);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.15);
    } catch (e) {
        // Silently fail if audio is not available
        console.debug("Notification sound failed:", e);
    }
}

// Background polling for new high-risk review tickets
async function pollReviewQueue() {
    try {
        const response = await authFetch("/requests/review");
        if (!response.ok) {
            return;
        }
        
        const data = await response.json();
        const currentTickets = data.results || [];
        const currentIds = new Set(currentTickets.map(t => t.id));
        
        // Check for new tickets
        const newTickets = currentTickets.filter(t => !knownReviewTicketIds.has(t.id));
        
        if (newTickets.length > 0) {
            // Update known IDs
            knownReviewTicketIds = currentIds;
            
            // Play notification sound
            playNotificationSound();
            
            // Show toast for each new ticket
            for (const ticket of newTickets) {
                const riskLabel = ticket.risk === "high" ? "HIGH RISK" : ticket.risk?.toUpperCase() || "REVIEW";
                showToast(`New ${riskLabel} ticket #${ticket.id} requires review`, ticket.risk === "high" ? "warning" : "info");
            }
            
            // Refresh the review queue UI
            loadReviewQueue();
            loadStats();
            updateAnalyticsCharts();
        } else if (currentIds.size !== knownReviewTicketIds.size) {
            // Tickets were removed (resolved/assigned), update known IDs and refresh
            knownReviewTicketIds = currentIds;
            loadReviewQueue();
            loadStats();
            updateAnalyticsCharts();
        }
    } catch (err) {
        console.debug("Polling error:", err);
    }
}

function startReviewPolling() {
    if (reviewPollingInterval) {
        clearInterval(reviewPollingInterval);
    }
    
    // Initialize known IDs on first run
    authFetch("/requests/review")
        .then(response => response.json())
        .then(data => {
            knownReviewTicketIds = new Set((data.results || []).map(t => t.id));
        })
        .catch(() => {
            knownReviewTicketIds = new Set();
        });
    
    // Start polling
    reviewPollingInterval = setInterval(pollReviewQueue, POLLING_INTERVAL_MS);
}

function stopReviewPolling() {
    if (reviewPollingInterval) {
        clearInterval(reviewPollingInterval);
        reviewPollingInterval = null;
    }
    knownReviewTicketIds.clear();
}

async function loadStats() {
    try {
        const response = await authFetch("/stats");
        if (!response.ok) {
            throw new Error("Failed to load dashboard statistics.");
        }
        const data = await response.json();
        statTotal.textContent = data.total;
        statHumanReview.textContent = data.human_review;
        statHighRisk.textContent = data.high_risk;
        statRouted.textContent = data.routed;
    } catch (err) {
        statTotal.textContent = "-";
        statHumanReview.textContent = "-";
        statHighRisk.textContent = "-";
        statRouted.textContent = "-";
    }
}

function computeAnalyticsMetrics() {
    const categories = ["billing", "technical", "sales", "other"];
    const risks = ["low", "medium", "high"];

    const categoryCounts = {};
    categories.forEach(cat => categoryCounts[cat] = 0);

    const riskCounts = {};
    risks.forEach(risk => riskCounts[risk] = 0);

    allHistoryRequests.forEach(req => {
        if (req.category && categoryCounts.hasOwnProperty(req.category)) {
            categoryCounts[req.category]++;
        } else if (req.category) {
            categoryCounts["other"]++;
        }

        if (req.risk && riskCounts.hasOwnProperty(req.risk)) {
            riskCounts[req.risk]++;
        }
    });

    return { categoryCounts, riskCounts };
}

function updateAnalyticsCharts() {
    const { categoryCounts, riskCounts } = computeAnalyticsMetrics();

    const categoryLabels = ["Billing", "Technical", "Sales", "Other"];
    const categoryData = [
        categoryCounts.billing || 0,
        categoryCounts.technical || 0,
        categoryCounts.sales || 0,
        categoryCounts.other || 0
    ];

    const riskLabels = ["Low", "Medium", "High"];
    const riskData = [
        riskCounts.low || 0,
        riskCounts.medium || 0,
        riskCounts.high || 0
    ];

    const categoryCtx = document.getElementById("category-chart");
    const riskCtx = document.getElementById("risk-chart");

    if (!categoryCtx || !riskCtx) return;

    if (categoryChart) {
        categoryChart.destroy();
    }
    if (riskChart) {
        riskChart.destroy();
    }

    categoryChart = new Chart(categoryCtx, {
        type: "doughnut",
        data: {
            labels: categoryLabels,
            datasets: [{
                data: categoryData,
                backgroundColor: [
                    "#3b82f6",
                    "#8b5cf6",
                    "#f59e0b",
                    "#9ca3af"
                ],
                borderWidth: 2,
                borderColor: "#ffffff"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: {
                        padding: 16,
                        font: { size: 12 }
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const value = context.raw;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${context.label}: ${value} (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    riskChart = new Chart(riskCtx, {
        type: "bar",
        data: {
            labels: riskLabels,
            datasets: [{
                label: "Number of Requests",
                data: riskData,
                backgroundColor: [
                    "#10b981",
                    "#f59e0b",
                    "#ef4444"
                ],
                borderWidth: 1,
                borderColor: [
                    "#059669",
                    "#d97706",
                    "#dc2626"
                ],
                borderRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            indexAxis: "y",
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return `${context.label}: ${context.raw} requests`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        precision: 0
                    },
                    grid: {
                        display: true,
                        color: "rgba(0,0,0,0.05)"
                    }
                },
                y: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function renderResult(data) {
    const ai = data.ai_output;

    resultCategory.textContent = ai ? ai.category : "N/A";
    resultConfidence.textContent = ai ? `${(ai.confidence * 100).toFixed(1)}%` : "N/A";
    resultSummary.textContent = ai ? ai.summary : "N/A";
    resultRisk.textContent = ai ? ai.risk : "N/A";
    resultRoute.textContent = data.route_to;
    resultStatus.textContent = data.status;

    if (ai && ai.needs_human) {
        humanReviewIndicator.classList.remove("hidden");
    } else {
        humanReviewIndicator.classList.add("hidden");
    }

    setBadge(resultBadge, data.status, data.status.replace(/_/g, " "));

    resultSection.classList.remove("hidden");
    resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    loadStats();
    loadHistory();
    loadReviewQueue();
    updateAnalyticsCharts();
}

async function analyzeRequest() {
    hideError(errorEl);
    resultSection.classList.add("hidden");

    const text = inputEl.value.trim();
    if (!text) {
        showError(errorEl, "Please enter a customer request before analyzing.");
        inputEl.focus();
        return;
    }

    setLoading(loadingEl, true);
    analyzeBtn.disabled = true;

    try {
        const response = await authFetch("/requests", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Request failed with status ${response.status}`);
        }

        const data = await response.json();
        renderResult(data);
    } catch (err) {
        showError(errorEl, err.message || "An unexpected error occurred while processing the request.");
    } finally {
        setLoading(loadingEl, false);
        analyzeBtn.disabled = false;
    }
}

async function loadHistory() {
    hideError(historyError);
    historyDetail.classList.add("hidden");
    setLoading(historyLoading, true);

    const searchTerm = searchInput.value.trim();

    try {
        const params = new URLSearchParams({ limit: "50" });
        if (searchTerm) {
            params.set("search", searchTerm);
        }

        const response = await authFetch(`/requests?${params.toString()}`);
        if (!response.ok) {
            throw new Error(`Unable to load request history. Please try again later.`);
        }

        const data = await response.json();
        allHistoryRequests = data.results || [];
        applyFilters();
        updateAnalyticsCharts();
    } catch (err) {
        showError(historyError, err.message || "Failed to load request history. The service may be unavailable.");
        historyTable.classList.add("hidden");
        historyEmpty.classList.add("hidden");
        historyEmptyAll.classList.add("hidden");
    } finally {
        setLoading(historyLoading, false);
    }
}

function applyFilters() {
    const categoryFilter = filterCategory.value.toLowerCase();
    const riskFilter = filterRisk.value.toLowerCase();
    const statusFilter = filterStatus.value;
    const startDate = filterStartDate.value ? new Date(filterStartDate.value) : null;
    const endDate = filterEndDate.value ? new Date(filterEndDate.value + "T23:59:59") : null;

    const filtered = allHistoryRequests.filter((req) => {
        const matchesCategory = !categoryFilter || (req.category && req.category.toLowerCase() === categoryFilter);
        const matchesRisk = !riskFilter || (req.risk && req.risk.toLowerCase() === riskFilter);
        const matchesStatus = !statusFilter || (req.status && req.status.toLowerCase() === statusFilter);
        
        // Date filtering
        let matchesDate = true;
        if (startDate || endDate) {
            const reqDate = new Date(req.timestamp);
            if (startDate && reqDate < startDate) matchesDate = false;
            if (endDate && reqDate > endDate) matchesDate = false;
        }
        
        return matchesCategory && matchesRisk && matchesStatus && matchesDate;
    });

    renderHistory(filtered);
}

function exportHistoryToCsv() {
    const categoryFilter = filterCategory.value.toLowerCase();
    const riskFilter = filterRisk.value.toLowerCase();
    const statusFilter = filterStatus.value;
    const searchTerm = searchInput.value.trim();
    const startDate = filterStartDate.value ? new Date(filterStartDate.value) : null;
    const endDate = filterEndDate.value ? new Date(filterEndDate.value + "T23:59:59") : null;

    const filtered = allHistoryRequests.filter((req) => {
        const matchesCategory = !categoryFilter || (req.category && req.category.toLowerCase() === categoryFilter);
        const matchesRisk = !riskFilter || (req.risk && req.risk.toLowerCase() === riskFilter);
        const matchesStatus = !statusFilter || (req.status && req.status.toLowerCase() === statusFilter);
        const matchesSearch = !searchTerm || (req.input_text && req.input_text.toLowerCase().includes(searchTerm.toLowerCase()));
        
        // Date filtering
        let matchesDate = true;
        if (startDate || endDate) {
            const reqDate = new Date(req.timestamp);
            if (startDate && reqDate < startDate) matchesDate = false;
            if (endDate && reqDate > endDate) matchesDate = false;
        }
        
        return matchesCategory && matchesRisk && matchesStatus && matchesSearch && matchesDate;
    });

    if (filtered.length === 0) {
        showError(historyError, "No data to export. Please adjust your filters.");
        return;
    }

    const headers = ["ID", "Message", "Category", "Risk", "Route", "Status", "Created At"];
    
    const escapeCsv = (value) => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };

    const rows = filtered.map(req => [
        escapeCsv(req.id),
        escapeCsv(req.input_text),
        escapeCsv(req.category ? req.category.charAt(0).toUpperCase() + req.category.slice(1) : "N/A"),
        escapeCsv(req.risk ? req.risk.charAt(0).toUpperCase() + req.risk.slice(1) : "N/A"),
        escapeCsv(req.route_to),
        escapeCsv(req.status.replace(/_/g, " ")),
        escapeCsv(req.timestamp)
    ]);

    const csvContent = [
        headers.join(","),
        ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `request-history-${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function exportSummaryReport() {
    const startDate = filterStartDate.value ? new Date(filterStartDate.value) : null;
    const endDate = filterEndDate.value ? new Date(filterEndDate.value + "T23:59:59") : null;

    let filtered = allHistoryRequests;
    
    // Apply date filtering
    if (startDate || endDate) {
        filtered = filtered.filter(req => {
            const reqDate = new Date(req.timestamp);
            if (startDate && reqDate < startDate) return false;
            if (endDate && reqDate > endDate) return false;
            return true;
        });
    }

    if (filtered.length === 0) {
        showError(historyError, "No data to export. Please adjust your filters.");
        return;
    }

    // Calculate aggregated stats
    const total = filtered.length;
    const highRiskCount = filtered.filter(r => r.risk === "high").length;
    const highRiskRatio = total > 0 ? ((highRiskCount / total) * 100).toFixed(2) : "0.00";
    
    // Status breakdown
    const statusCounts = {};
    filtered.forEach(req => {
        statusCounts[req.status] = (statusCounts[req.status] || 0) + 1;
    });
    
    const resolvedCount = statusCounts["resolved"] || 0;
    const humanReviewCount = statusCounts["human_review"] || 0;
    const routedCount = statusCounts["routed"] || 0;
    const errorCount = statusCounts["error"] || 0;
    
    // Category breakdown
    const categoryCounts = {};
    filtered.forEach(req => {
        const cat = req.category || "other";
        categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    });

    // Build CSV content
    const escapeCsv = (value) => {
        if (value === null || value === undefined) return "";
        const str = String(value);
        if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
            return '"' + str.replace(/"/g, '""') + '"';
        }
        return str;
    };

    const rows = [];
    
    // Summary section
    rows.push([escapeCsv("SUMMARY REPORT")]);
    rows.push([escapeCsv("")]);
    rows.push([escapeCsv("Generated"), escapeCsv(new Date().toISOString())]);
    rows.push([escapeCsv("Date Range"), escapeCsv(
        (filterStartDate.value ? filterStartDate.value : "All time") + " to " + 
        (filterEndDate.value ? filterEndDate.value : "Present")
    )]);
    rows.push([escapeCsv("")]);
    
    // Overall stats
    rows.push([escapeCsv("OVERALL STATISTICS")]);
    rows.push([escapeCsv("Metric"), escapeCsv("Value")]);
    rows.push([escapeCsv("Total Processed"), escapeCsv(total)]);
    rows.push([escapeCsv("High Risk Count"), escapeCsv(highRiskCount)]);
    rows.push([escapeCsv("High Risk Ratio (%)"), escapeCsv(highRiskRatio)]);
    rows.push([escapeCsv("")]);
    
    // Status breakdown
    rows.push([escapeCsv("STATUS BREAKDOWN")]);
    rows.push([escapeCsv("Status"), escapeCsv("Count"), escapeCsv("Percentage")]);
    Object.entries(statusCounts).forEach(([status, count]) => {
        const pct = total > 0 ? ((count / total) * 100).toFixed(2) : "0.00";
        rows.push([escapeCsv(status.replace(/_/g, " ")), escapeCsv(count), escapeCsv(pct + "%")]);
    });
    rows.push([escapeCsv("")]);
    
    // Category breakdown
    rows.push([escapeCsv("CATEGORY BREAKDOWN")]);
    rows.push([escapeCsv("Category"), escapeCsv("Count"), escapeCsv("Percentage")]);
    Object.entries(categoryCounts).forEach(([cat, count]) => {
        const pct = total > 0 ? ((count / total) * 100).toFixed(2) : "0.00";
        rows.push([escapeCsv(cat.charAt(0).toUpperCase() + cat.slice(1)), escapeCsv(count), escapeCsv(pct + "%")]);
    });
    rows.push([escapeCsv("")]);
    
    // Risk breakdown
    const riskCounts = {};
    filtered.forEach(req => {
        riskCounts[req.risk || "low"] = (riskCounts[req.risk || "low"] || 0) + 1;
    });
    rows.push([escapeCsv("RISK BREAKDOWN")]);
    rows.push([escapeCsv("Risk Level"), escapeCsv("Count"), escapeCsv("Percentage")]);
    Object.entries(riskCounts).forEach(([risk, count]) => {
        const pct = total > 0 ? ((count / total) * 100).toFixed(2) : "0.00";
        rows.push([escapeCsv(risk.charAt(0).toUpperCase() + risk.slice(1)), escapeCsv(count), escapeCsv(pct + "%")]);
    });

    const csvContent = rows.map(row => row.join(",")).join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    const dateRange = (filterStartDate.value ? filterStartDate.value : "all") + "_" + (filterEndDate.value ? filterEndDate.value : "present");
    link.setAttribute("download", `summary-report-${dateRange}.csv`);
    link.setAttribute("href", url);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Bulk Selection Functions
function handleReviewCheckboxChange(requestId, checked) {
    if (checked) {
        selectedReviewIds.add(requestId);
    } else {
        selectedReviewIds.delete(requestId);
    }
    updateReviewBulkToolbar();
    updateReviewSelectAllState();
}

function handleHistoryCheckboxChange(requestId, checked) {
    if (checked) {
        selectedHistoryIds.add(requestId);
    } else {
        selectedHistoryIds.delete(requestId);
    }
    updateHistoryBulkToolbar();
    updateHistorySelectAllState();
}

function updateReviewSelectAllState() {
    if (!reviewSelectAll) return;
    const visibleRows = reviewBody.querySelectorAll("tr[data-request-id]");
    const selectedCount = Array.from(visibleRows).filter(tr => selectedReviewIds.has(parseInt(tr.dataset.requestId))).length;
    reviewSelectAll.checked = visibleRows.length > 0 && selectedCount === visibleRows.length;
    reviewSelectAll.indeterminate = selectedCount > 0 && selectedCount < visibleRows.length;
}

function updateHistorySelectAllState() {
    if (!historySelectAll) return;
    const visibleRows = historyBody.querySelectorAll("tr[data-request-id]");
    const selectedCount = Array.from(visibleRows).filter(tr => selectedHistoryIds.has(parseInt(tr.dataset.requestId))).length;
    historySelectAll.checked = visibleRows.length > 0 && selectedCount === visibleRows.length;
    historySelectAll.indeterminate = selectedCount > 0 && selectedCount < visibleRows.length;
}

function updateReviewBulkToolbar() {
    if (!reviewBulkToolbar || !reviewBulkCount) return;
    const count = selectedReviewIds.size;
    if (count > 0) {
        reviewBulkCount.textContent = `${count} selected`;
        reviewBulkToolbar.classList.remove("hidden");
    } else {
        reviewBulkToolbar.classList.add("hidden");
    }
}

function updateHistoryBulkToolbar() {
    if (!historyBulkToolbar || !historyBulkCount) return;
    const count = selectedHistoryIds.size;
    if (count > 0) {
        historyBulkCount.textContent = `${count} selected`;
        historyBulkToolbar.classList.remove("hidden");
    } else {
        historyBulkToolbar.classList.add("hidden");
    }
}

function hideReviewBulkToolbar() {
    selectedReviewIds.clear();
    if (reviewBulkToolbar) reviewBulkToolbar.classList.add("hidden");
    if (reviewSelectAll) {
        reviewSelectAll.checked = false;
        reviewSelectAll.indeterminate = false;
    }
}

function hideHistoryBulkToolbar() {
    selectedHistoryIds.clear();
    if (historyBulkToolbar) historyBulkToolbar.classList.add("hidden");
    if (historySelectAll) {
        historySelectAll.checked = false;
        historySelectAll.indeterminate = false;
    }
}

function handleReviewSelectAllChange() {
    if (!reviewSelectAll) return;
    const visibleRows = reviewBody.querySelectorAll("tr[data-request-id]");
    if (reviewSelectAll.checked) {
        visibleRows.forEach(tr => {
            const id = parseInt(tr.dataset.requestId);
            selectedReviewIds.add(id);
            tr.classList.add("selected");
            tr.querySelector('input[type="checkbox"]').checked = true;
        });
    } else {
        visibleRows.forEach(tr => {
            const id = parseInt(tr.dataset.requestId);
            selectedReviewIds.delete(id);
            tr.classList.remove("selected");
            tr.querySelector('input[type="checkbox"]').checked = false;
        });
    }
    updateReviewBulkToolbar();
}

function handleHistorySelectAllChange() {
    if (!historySelectAll) return;
    const visibleRows = historyBody.querySelectorAll("tr[data-request-id]");
    if (historySelectAll.checked) {
        visibleRows.forEach(tr => {
            const id = parseInt(tr.dataset.requestId);
            selectedHistoryIds.add(id);
            tr.classList.add("selected");
            tr.querySelector('input[type="checkbox"]').checked = true;
        });
    } else {
        visibleRows.forEach(tr => {
            const id = parseInt(tr.dataset.requestId);
            selectedHistoryIds.delete(id);
            tr.classList.remove("selected");
            tr.querySelector('input[type="checkbox"]').checked = false;
        });
    }
    updateHistoryBulkToolbar();
}

// Bulk API Calls
async function bulkUpdateStatus(requestIds, status, assignedTo = null) {
    try {
        const response = await authFetch("/requests/batch/status", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ request_ids: requestIds, status, assigned_to: assignedTo }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || "Batch update failed");
        }

        return await response.json();
    } catch (err) {
        throw err;
    }
}

// Bulk Action Handlers
async function handleReviewBulkAssign() {
    if (!isAdmin()) {
        showError(reviewError, "Admin privileges required for bulk actions");
        return;
    }
    const ids = Array.from(selectedReviewIds);
    if (ids.length === 0) return;

    try {
        const meResponse = await authFetch("/auth/me");
        if (!meResponse.ok) throw new Error("Failed to get current user");
        const me = await meResponse.json();

        await bulkUpdateStatus(ids, "assigned", me.id);
        selectedReviewIds.clear();
        loadReviewQueue();
        loadHistory();
        updateAnalyticsCharts();
    } catch (err) {
        showError(reviewError, err.message || "Failed to bulk assign");
    }
}

async function handleReviewBulkResolve() {
    if (!isAdmin()) {
        showError(reviewError, "Admin privileges required for bulk actions");
        return;
    }
    const ids = Array.from(selectedReviewIds);
    if (ids.length === 0) return;

    try {
        await bulkUpdateStatus(ids, "resolved", null);
        selectedReviewIds.clear();
        loadReviewQueue();
        loadHistory();
        updateAnalyticsCharts();
    } catch (err) {
        showError(reviewError, err.message || "Failed to bulk resolve");
    }
}

async function handleHistoryBulkAssign() {
    if (!isAdmin()) {
        showError(historyError, "Admin privileges required for bulk actions");
        return;
    }
    const ids = Array.from(selectedHistoryIds);
    if (ids.length === 0) return;

    try {
        const meResponse = await authFetch("/auth/me");
        if (!meResponse.ok) throw new Error("Failed to get current user");
        const me = await meResponse.json();

        await bulkUpdateStatus(ids, "assigned", me.id);
        selectedHistoryIds.clear();
        loadHistory();
        updateAnalyticsCharts();
    } catch (err) {
        showError(historyError, err.message || "Failed to bulk assign");
    }
}

async function handleHistoryBulkResolve() {
    if (!isAdmin()) {
        showError(historyError, "Admin privileges required for bulk actions");
        return;
    }
    const ids = Array.from(selectedHistoryIds);
    if (ids.length === 0) return;

    try {
        await bulkUpdateStatus(ids, "resolved", null);
        selectedHistoryIds.clear();
        loadHistory();
        updateAnalyticsCharts();
    } catch (err) {
        showError(historyError, err.message || "Failed to bulk resolve");
    }
}

function isAdmin() {
    return currentUser && currentUser.role === "admin";
}

function renderHistory(requests) {
    historyBody.innerHTML = "";

    if (allHistoryRequests.length === 0) {
        historyTable.classList.add("hidden");
        historyEmpty.classList.add("hidden");
        historyEmptyAll.classList.remove("hidden");
        hideHistoryBulkToolbar();
        return;
    }

    if (requests.length === 0) {
        historyTable.classList.add("hidden");
        historyEmpty.classList.remove("hidden");
        historyEmptyAll.classList.add("hidden");
        hideHistoryBulkToolbar();
        return;
    }

    historyEmpty.classList.add("hidden");
    historyEmptyAll.classList.add("hidden");
    historyTable.classList.remove("hidden");

    for (const req of requests) {
        const tr = document.createElement("tr");
        tr.dataset.requestId = req.id;
        if (selectedHistoryIds.has(req.id)) {
            tr.classList.add("selected");
        }

        const tdCheckbox = document.createElement("td");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = req.id;
        checkbox.addEventListener("change", (e) => {
            handleHistoryCheckboxChange(req.id, e.target.checked);
            e.stopPropagation();
        });
        tdCheckbox.appendChild(checkbox);

        const tdId = document.createElement("td");
        tdId.textContent = req.id;

        const tdMessage = document.createElement("td");
        tdMessage.className = "message-preview";
        tdMessage.textContent = req.input_text;
        tdMessage.title = req.input_text;

        const tdCategory = document.createElement("td");
        tdCategory.textContent = req.category ? req.category.charAt(0).toUpperCase() + req.category.slice(1) : "N/A";

        const tdRisk = document.createElement("td");
        const riskBadge = document.createElement("span");
        riskBadge.className = "badge";
        riskBadge.setAttribute("data-risk", req.risk || "low");
        riskBadge.textContent = (req.risk || "low").charAt(0).toUpperCase() + (req.risk || "low").slice(1);
        tdRisk.appendChild(riskBadge);

        const tdRoute = document.createElement("td");
        tdRoute.textContent = req.route_to;

        const tdStatus = document.createElement("td");
        const badgeCell = document.createElement("div");
        badgeCell.className = "badge-cell";
        
        const statusBadge = document.createElement("span");
        statusBadge.className = "badge";
        statusBadge.setAttribute("data-status", req.status);
        statusBadge.textContent = req.status.replace(/_/g, " ");
        badgeCell.appendChild(statusBadge);
        
        const priorityBadge = document.createElement("span");
        priorityBadge.className = "priority-badge";
        if (req.risk === "high") {
            priorityBadge.classList.add("p1");
            priorityBadge.textContent = "P1 Emergency";
        } else if (req.risk === "medium") {
            priorityBadge.classList.add("p2");
            priorityBadge.textContent = "P2 High";
        } else {
            priorityBadge.classList.add("p3");
            priorityBadge.textContent = "P3 Standard";
        }
        badgeCell.appendChild(priorityBadge);
        tdStatus.appendChild(badgeCell);

        const tdTimestamp = document.createElement("td");
        tdTimestamp.textContent = req.timestamp;

        const tdAction = document.createElement("td");
        const viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.className = "secondary";
        viewBtn.textContent = "View";
        viewBtn.setAttribute("aria-label", `View details for request ${req.id}`);
        viewBtn.addEventListener("click", () => loadDetail(req.id));
        tdAction.appendChild(viewBtn);

        tr.appendChild(tdCheckbox);
        tr.appendChild(tdId);
        tr.appendChild(tdMessage);
        tr.appendChild(tdCategory);
        tr.appendChild(tdRisk);
        tr.appendChild(tdRoute);
        tr.appendChild(tdStatus);
        tr.appendChild(tdTimestamp);
        tr.appendChild(tdAction);

        historyBody.appendChild(tr);
    }

    updateHistorySelectAllState();
}

async function loadDetail(requestId) {
    hideError(historyError);
    setLoading(historyLoading, true);

    try {
        const response = await authFetch(`/requests/${requestId}`);
        if (!response.ok) {
            throw new Error(`Request #${requestId} was not found. It may have been removed.`);
        }

        const data = await response.json();

        const isReviewLifecycle =
            data.status === "human_review" ||
            data.status === "assigned" ||
            data.status === "in_review" ||
            data.route_to === "human_review";

        if (isReviewLifecycle) {
            setLoading(historyLoading, false);
            loadReviewDetail(requestId);
            return;
        }

        openDrawer(data, false);
    } catch (err) {
        showError(historyError, err.message || "Failed to load request details. Please try again.");
    } finally {
        setLoading(historyLoading, false);
    }
}

function openDrawer(data, isReview) {
    // Populate drawer fields
    drawerCategory.textContent = data.category || "N/A";
    drawerConfidence.textContent = data.confidence ? `${(data.confidence * 100).toFixed(1)}%` : "N/A";
    drawerSummary.textContent = data.summary || "N/A";
    
    const riskBadge = document.createElement("span");
    riskBadge.className = "badge";
    riskBadge.setAttribute("data-risk", data.risk || "low");
    riskBadge.textContent = (data.risk || "low").charAt(0).toUpperCase() + (data.risk || "low").slice(1);
    drawerRisk.innerHTML = "";
    drawerRisk.appendChild(riskBadge);
    
    drawerRoute.textContent = data.route_to;
    
    const statusBadge = document.createElement("span");
    statusBadge.className = "badge";
    statusBadge.setAttribute("data-status", data.status);
    statusBadge.textContent = data.status.replace(/_/g, " ");
    drawerStatus.innerHTML = "";
    drawerStatus.appendChild(statusBadge);
    
    drawerInput.textContent = data.input_text || "N/A";

    // Show/hide review-specific fields
    if (isReview) {
        drawerAssignedRow.classList.remove("hidden");
        drawerAssigned.textContent = data.assigned_to ? `User #${data.assigned_to}` : "Unassigned";
        
        drawerReasonRow.classList.remove("hidden");
        let reason = [];
        if (data.needs_human) reason.push("AI flagged for human review");
        if (data.risk === "high") reason.push("High risk");
        if (data.confidence && data.confidence < 0.80) reason.push("Low confidence");
        if (data.error_reason) reason.push(data.error_reason);
        drawerReason.textContent = reason.length > 0 ? reason.join("; ") : "None";
        
        drawerErrorRow.classList.add("hidden");
        
        // Update assign button text based on assignment
        if (data.assigned_to) {
            drawerAssignBtn.textContent = "Unassign";
        } else {
            drawerAssignBtn.textContent = "Assign to Me";
        }
    } else {
        drawerAssignedRow.classList.add("hidden");
        drawerReasonRow.classList.add("hidden");
        
        if (data.error_reason) {
            drawerErrorRow.classList.remove("hidden");
            drawerError.textContent = data.error_reason;
        } else {
            drawerErrorRow.classList.add("hidden");
        }
    }

    // Open drawer with animation
    drawer.classList.add("open");
    drawerBackdrop.classList.add("open");
    document.body.style.overflow = "hidden"; // Prevent background scroll
}

function closeDrawer() {
    drawer.classList.remove("open");
    drawerBackdrop.classList.remove("open");
    document.body.style.overflow = "";
    currentReviewId = null;
}

async function loadReviewQueue() {
    hideError(reviewError);
    reviewDetail.classList.add("hidden");
    setLoading(reviewLoading, true);

    try {
        const response = await authFetch("/requests/review");
        if (!response.ok) {
            throw new Error("Unable to load review queue. Please try again later.");
        }

        const data = await response.json();
        renderReviewQueue(data.results || []);
    } catch (err) {
        showError(reviewError, err.message || "Failed to load review queue. The service may be unavailable.");
        reviewTable.classList.add("hidden");
        reviewEmpty.classList.add("hidden");
    } finally {
        setLoading(reviewLoading, false);
    }
}

function renderReviewQueue(requests) {
    reviewBody.innerHTML = "";

    if (requests.length === 0) {
        reviewTable.classList.add("hidden");
        reviewEmpty.classList.remove("hidden");
        hideReviewBulkToolbar();
        return;
    }

    reviewEmpty.classList.add("hidden");
    reviewTable.classList.remove("hidden");

    for (const req of requests) {
        const tr = document.createElement("tr");
        tr.dataset.requestId = req.id;
        if (selectedReviewIds.has(req.id)) {
            tr.classList.add("selected");
        }

        const tdCheckbox = document.createElement("td");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = req.id;
        checkbox.addEventListener("change", (e) => {
            handleReviewCheckboxChange(req.id, e.target.checked);
            e.stopPropagation();
        });
        tdCheckbox.appendChild(checkbox);

        const tdId = document.createElement("td");
        tdId.textContent = req.id;

        const tdMessage = document.createElement("td");
        tdMessage.className = "message-preview";
        tdMessage.textContent = req.input_text;
        tdMessage.title = req.input_text;

        const tdCategory = document.createElement("td");
        tdCategory.textContent = req.category ? req.category.charAt(0).toUpperCase() + req.category.slice(1) : "N/A";

        const tdConfidence = document.createElement("td");
        tdConfidence.textContent = req.confidence ? `${(req.confidence * 100).toFixed(1)}%` : "N/A";

        const tdRisk = document.createElement("td");
        const riskBadge = document.createElement("span");
        riskBadge.className = "badge";
        riskBadge.setAttribute("data-risk", req.risk || "low");
        riskBadge.textContent = (req.risk || "low").charAt(0).toUpperCase() + (req.risk || "low").slice(1);
        tdRisk.appendChild(riskBadge);

        const tdStatus = document.createElement("td");
        const badgeCell = document.createElement("div");
        badgeCell.className = "badge-cell";
        
        const statusBadge = document.createElement("span");
        statusBadge.className = "badge";
        statusBadge.setAttribute("data-status", req.status);
        statusBadge.textContent = req.status.replace(/_/g, " ");
        badgeCell.appendChild(statusBadge);
        
        const priorityBadge = document.createElement("span");
        priorityBadge.className = "priority-badge";
        if (req.risk === "high") {
            priorityBadge.classList.add("p1");
            priorityBadge.textContent = "P1 Emergency";
        } else if (req.risk === "medium") {
            priorityBadge.classList.add("p2");
            priorityBadge.textContent = "P2 High";
        } else {
            priorityBadge.classList.add("p3");
            priorityBadge.textContent = "P3 Standard";
        }
        badgeCell.appendChild(priorityBadge);
        tdStatus.appendChild(badgeCell);

        const tdAssigned = document.createElement("td");
        tdAssigned.textContent = req.assigned_to ? `User #${req.assigned_to}` : "Unassigned";

        const tdTimestamp = document.createElement("td");
        tdTimestamp.textContent = req.timestamp;

        const tdAction = document.createElement("td");
        const viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.className = "secondary";
        viewBtn.textContent = "Review";
        viewBtn.setAttribute("aria-label", `Review ticket ${req.id}`);
        viewBtn.addEventListener("click", () => loadReviewDetail(req.id));
        tdAction.appendChild(viewBtn);

        tr.appendChild(tdCheckbox);
        tr.appendChild(tdId);
        tr.appendChild(tdMessage);
        tr.appendChild(tdCategory);
        tr.appendChild(tdConfidence);
        tr.appendChild(tdRisk);
        tr.appendChild(tdStatus);
        tr.appendChild(tdAssigned);
        tr.appendChild(tdTimestamp);
        tr.appendChild(tdAction);

        reviewBody.appendChild(tr);
    }

    updateReviewSelectAllState();
}

async function loadReviewDetail(requestId) {
    hideError(reviewError);
    setLoading(reviewLoading, true);
    currentReviewId = requestId;

    try {
        const response = await authFetch(`/requests/${requestId}`);
        if (!response.ok) {
            throw new Error(`Ticket #${requestId} was not found.`);
        }

        const data = await response.json();

        openDrawer(data, true);

        loadComments(requestId);
    } catch (err) {
        showError(reviewError, err.message || "Failed to load ticket details.");
    } finally {
        setLoading(reviewLoading, false);
    }
}

async function loadComments(requestId) {
    hideError(drawerCommentsError);
    setLoading(drawerCommentsLoading, true);

    try {
        const response = await authFetch(`/requests/${requestId}/comments`);
        if (!response.ok) {
            throw new Error("Unable to load comments.");
        }

        const data = await response.json();
        renderComments(data.results || []);
    } catch (err) {
        showError(drawerCommentsError, err.message || "Failed to load comments.");
        drawerCommentsList.innerHTML = "";
    } finally {
        setLoading(drawerCommentsLoading, false);
    }
}

function renderComments(comments) {
    drawerCommentsList.innerHTML = "";

    if (comments.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No comments yet.";
        empty.className = "empty-state";
        drawerCommentsList.appendChild(empty);
        return;
    }

    for (const comment of comments) {
        const item = document.createElement("div");
        item.className = "comment-item";

        const header = document.createElement("div");
        header.className = "comment-header";

        const author = document.createElement("span");
        author.className = "comment-author";
        author.textContent = comment.user_name || `User #${comment.user_id}`;

        const time = document.createElement("span");
        time.className = "comment-time";
        time.textContent = comment.created_at;

        header.appendChild(author);
        header.appendChild(time);

        const content = document.createElement("div");
        content.className = "comment-content";
        content.textContent = comment.content;

        item.appendChild(header);
        item.appendChild(content);
        drawerCommentsList.appendChild(item);
    }
}

async function postComment(event) {
    event.preventDefault();
    if (!currentReviewId) return;

    const content = drawerCommentInput.value.trim();
    if (!content) {
        showError(drawerCommentsError, "Comment cannot be empty.");
        return;
    }

    try {
        const response = await authFetch(`/requests/${currentReviewId}/comments`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || "Failed to post comment.");
        }

        drawerCommentInput.value = "";
        hideError(drawerCommentsError);
        loadComments(currentReviewId);
    } catch (err) {
        showError(drawerCommentsError, err.message || "Failed to post comment.");
    }
}

drawerCommentForm.addEventListener("submit", postComment);

async function updateReviewStatus(newStatus) {
    if (!currentReviewId) return;

    try {
        const payload = { status: newStatus };
        if (drawerAssignBtn.textContent === "Unassign") {
            payload.assigned_to = null;
        } else if (drawerAssignBtn.textContent === "Assign to Me") {
            const meResponse = await authFetch("/auth/me");
            if (meResponse.ok) {
                const me = await meResponse.json();
                payload.assigned_to = me.id;
            }
        }

        const response = await authFetch(`/requests/${currentReviewId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `Failed to update status to ${newStatus}`);
        }

        const data = await response.json();
        
        const statusBadge = document.createElement("span");
        statusBadge.className = "badge";
        statusBadge.setAttribute("data-status", data.status);
        statusBadge.textContent = data.status.replace(/_/g, " ");
        drawerStatus.innerHTML = "";
        drawerStatus.appendChild(statusBadge);
        
        drawerAssigned.textContent = data.assigned_to ? `User #${data.assigned_to}` : "Unassigned";

        if (data.assigned_to) {
            drawerAssignBtn.textContent = "Unassign";
        } else {
            drawerAssignBtn.textContent = "Assign to Me";
        }

        loadReviewQueue();
    } catch (err) {
        showError(reviewError, err.message || "Failed to update ticket status.");
    }
}

reviewAssignBtn.addEventListener("click", () => {
    if (reviewAssignBtn.textContent === "Assign to Me") {
        updateReviewStatus("assigned");
    } else {
        updateReviewStatus("human_review");
    }
});

reviewStatusBtn.addEventListener("click", () => {
    updateReviewStatus("in_review");
});

reviewResolveBtn.addEventListener("click", () => {
    updateReviewStatus("resolved");
});

drawerCloseBtn.addEventListener("click", closeDrawer);
drawerCloseBtn2.addEventListener("click", closeDrawer);
drawerBackdrop.addEventListener("click", closeDrawer);

drawerAssignBtn.addEventListener("click", () => {
    if (drawerAssignBtn.textContent === "Assign to Me") {
        updateReviewStatus("assigned");
    } else {
        updateReviewStatus("human_review");
    }
});

drawerStatusBtn.addEventListener("click", () => {
    updateReviewStatus("in_review");
});

drawerResolveBtn.addEventListener("click", () => {
    updateReviewStatus("resolved");
});

refreshReviewBtn.addEventListener("click", loadReviewQueue);

// Initialize all event listeners after DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    try {
    // Auth form submit handlers
    document.getElementById("login-form").addEventListener("submit", handleLoginSubmit);
    document.getElementById("register-form").addEventListener("submit", handleRegisterSubmit);

    // Auth mode toggle handlers
    document.getElementById("show-register").addEventListener("click", (e) => {
        e.preventDefault();
        toggleAuthMode("register");
    });
    document.getElementById("show-login").addEventListener("click", (e) => {
        e.preventDefault();
        toggleAuthMode("login");
    });

    document.getElementById("logout-btn").addEventListener("click", logout);

    analyzeBtn.addEventListener("click", analyzeRequest);

    clearBtn.addEventListener("click", () => {
        inputEl.value = "";
        hideError(errorEl);
        resultSection.classList.add("hidden");
        inputEl.focus();
    });

    refreshHistoryBtn.addEventListener("click", loadHistory);

    exportCsvBtn.addEventListener("click", exportHistoryToCsv);

    exportSummaryBtn.addEventListener("click", exportSummaryReport);

    // Review Queue Bulk Actions
    reviewSelectAll.addEventListener("change", handleReviewSelectAllChange);
    reviewBulkAssign.addEventListener("click", handleReviewBulkAssign);
    reviewBulkResolve.addEventListener("click", handleReviewBulkResolve);
    reviewBulkCancel.addEventListener("click", () => {
        hideReviewBulkToolbar();
    });

    // History Bulk Actions
    historySelectAll.addEventListener("change", handleHistorySelectAllChange);
    historyBulkAssign.addEventListener("click", handleHistoryBulkAssign);
    historyBulkResolve.addEventListener("click", handleHistoryBulkResolve);
    historyBulkCancel.addEventListener("click", () => {
        hideHistoryBulkToolbar();
    });

    searchInput.addEventListener("input", () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
            loadHistory();
        }, 300);
    });

    filterCategory.addEventListener("change", applyFilters);
    filterRisk.addEventListener("change", applyFilters);
    filterStatus.addEventListener("change", applyFilters);
    filterStartDate.addEventListener("change", applyFilters);
    filterEndDate.addEventListener("change", applyFilters);

    inputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            analyzeRequest();
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeDrawer();
        }
    });

    loadUser();
});
} catch (err) {
    console.error("App initialization failed:", err);
}
