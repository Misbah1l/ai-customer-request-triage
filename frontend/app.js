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
        showDashboard();
    } catch (err) {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        currentUser = null;
        showAuth();
    }
}

function logout() {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    currentUser = null;
    showAuth();
    hideAuthError();
}

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
const historyLoading = document.getElementById("history-loading");
const historyError = document.getElementById("history-error");
const historyEmpty = document.getElementById("history-empty");
const historyEmptyAll = document.getElementById("history-empty-all");
const historyTable = document.getElementById("history-table");
const historyBody = document.getElementById("history-body");
const filterCategory = document.getElementById("filter-category");
const filterRisk = document.getElementById("filter-risk");
const filterStatus = document.getElementById("filter-status");
const searchInput = document.getElementById("search-input");

const historyDetail = document.getElementById("history-detail");
const detailCategory = document.getElementById("detail-category");
const detailConfidence = document.getElementById("detail-confidence");
const detailSummary = document.getElementById("detail-summary");
const detailRisk = document.getElementById("detail-risk");
const detailRoute = document.getElementById("detail-route");
const detailStatus = document.getElementById("detail-status");
const detailInput = document.getElementById("detail-input");
const detailError = document.getElementById("detail-error");
const detailBadge = document.getElementById("detail-badge");
const closeDetailBtn = document.getElementById("close-detail");

const refreshReviewBtn = document.getElementById("refresh-review");
const reviewLoading = document.getElementById("review-loading");
const reviewError = document.getElementById("review-error");
const reviewEmpty = document.getElementById("review-empty");
const reviewTable = document.getElementById("review-table");
const reviewBody = document.getElementById("review-body");

const reviewDetail = document.getElementById("review-detail");
const reviewDetailCategory = document.getElementById("review-detail-category");
const reviewDetailConfidence = document.getElementById("review-detail-confidence");
const reviewDetailSummary = document.getElementById("review-detail-summary");
const reviewDetailRisk = document.getElementById("review-detail-risk");
const reviewDetailRoute = document.getElementById("review-detail-route");
const reviewDetailStatus = document.getElementById("review-detail-status");
const reviewDetailAssigned = document.getElementById("review-detail-assigned");
const reviewDetailInput = document.getElementById("review-detail-input");
const reviewDetailReason = document.getElementById("review-detail-reason");
const reviewDetailBadge = document.getElementById("review-detail-badge");
const reviewCloseBtn = document.getElementById("review-close-btn");
const reviewAssignBtn = document.getElementById("review-assign-btn");
const reviewStatusBtn = document.getElementById("review-status-btn");
const reviewResolveBtn = document.getElementById("review-resolve-btn");

const commentsList = document.getElementById("comments-list");
const commentsLoading = document.getElementById("comments-loading");
const commentsError = document.getElementById("comments-error");
const commentForm = document.getElementById("comment-form");
const commentInput = document.getElementById("comment-input");

let currentReviewId = null;
let currentReviewAssignedTo = null;

let allHistoryRequests = [];
let searchDebounceTimer = null;

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

    const filtered = allHistoryRequests.filter((req) => {
        const matchesCategory = !categoryFilter || (req.category && req.category.toLowerCase() === categoryFilter);
        const matchesRisk = !riskFilter || (req.risk && req.risk.toLowerCase() === riskFilter);
        const matchesStatus = !statusFilter || (req.status && req.status.toLowerCase() === statusFilter);
        return matchesCategory && matchesRisk && matchesStatus;
    });

    renderHistory(filtered);
}

function renderHistory(requests) {
    historyBody.innerHTML = "";

    if (allHistoryRequests.length === 0) {
        historyTable.classList.add("hidden");
        historyEmpty.classList.add("hidden");
        historyEmptyAll.classList.remove("hidden");
        return;
    }

    if (requests.length === 0) {
        historyTable.classList.add("hidden");
        historyEmpty.classList.remove("hidden");
        historyEmptyAll.classList.add("hidden");
        return;
    }

    historyEmpty.classList.add("hidden");
    historyEmptyAll.classList.add("hidden");
    historyTable.classList.remove("hidden");

    for (const req of requests) {
        const tr = document.createElement("tr");

        const tdId = document.createElement("td");
        tdId.textContent = req.id;

        const tdMessage = document.createElement("td");
        tdMessage.textContent = req.input_text;
        tdMessage.title = req.input_text;

        const tdCategory = document.createElement("td");
        tdCategory.textContent = req.category || "N/A";

        const tdRisk = document.createElement("td");
        tdRisk.textContent = req.risk || "N/A";

        const tdRoute = document.createElement("td");
        tdRoute.textContent = req.route_to;

        const tdStatus = document.createElement("td");
        tdStatus.textContent = req.status;

        const tdTimestamp = document.createElement("td");
        tdTimestamp.textContent = req.timestamp;

        const tdAction = document.createElement("td");
        const viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.textContent = "View";
        viewBtn.setAttribute("aria-label", `View details for request ${req.id}`);
        viewBtn.addEventListener("click", () => loadDetail(req.id));
        tdAction.appendChild(viewBtn);

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

        detailCategory.textContent = data.category || "N/A";
        detailConfidence.textContent = data.confidence ? `${(data.confidence * 100).toFixed(1)}%` : "N/A";
        detailSummary.textContent = data.summary || "N/A";
        detailRisk.textContent = data.risk || "N/A";
        detailRoute.textContent = data.route_to;
        detailStatus.textContent = data.status;
        detailInput.textContent = data.input_text || "N/A";
        detailError.textContent = data.error_reason || "None";

        setBadge(detailBadge, data.status, data.status.replace(/_/g, " "));

        historyDetail.classList.remove("hidden");
        historyDetail.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (err) {
        showError(historyError, err.message || "Failed to load request details. Please try again.");
    } finally {
        setLoading(historyLoading, false);
    }
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
        return;
    }

    reviewEmpty.classList.add("hidden");
    reviewTable.classList.remove("hidden");

    for (const req of requests) {
        const tr = document.createElement("tr");

        const tdId = document.createElement("td");
        tdId.textContent = req.id;

        const tdMessage = document.createElement("td");
        tdMessage.textContent = req.input_text;
        tdMessage.title = req.input_text;

        const tdCategory = document.createElement("td");
        tdCategory.textContent = req.category || "N/A";

        const tdConfidence = document.createElement("td");
        tdConfidence.textContent = req.confidence ? `${(req.confidence * 100).toFixed(1)}%` : "N/A";

        const tdRisk = document.createElement("td");
        tdRisk.textContent = req.risk || "N/A";

        const tdStatus = document.createElement("td");
        tdStatus.textContent = req.status;

        const tdAssigned = document.createElement("td");
        tdAssigned.textContent = req.assigned_to ? `User #${req.assigned_to}` : "Unassigned";

        const tdTimestamp = document.createElement("td");
        tdTimestamp.textContent = req.timestamp;

        const tdAction = document.createElement("td");
        const viewBtn = document.createElement("button");
        viewBtn.type = "button";
        viewBtn.textContent = "Review";
        viewBtn.setAttribute("aria-label", `Review ticket ${req.id}`);
        viewBtn.addEventListener("click", () => loadReviewDetail(req.id));
        tdAction.appendChild(viewBtn);

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

        reviewDetailCategory.textContent = data.category || "N/A";
        reviewDetailConfidence.textContent = data.confidence ? `${(data.confidence * 100).toFixed(1)}%` : "N/A";
        reviewDetailSummary.textContent = data.summary || "N/A";
        reviewDetailRisk.textContent = data.risk || "N/A";
        reviewDetailRoute.textContent = data.route_to;
        reviewDetailStatus.textContent = data.status;
        reviewDetailAssigned.textContent = data.assigned_to ? `User #${data.assigned_to}` : "Unassigned";
        reviewDetailInput.textContent = data.input_text || "N/A";

        let reason = [];
        if (data.needs_human) reason.push("AI flagged for human review");
        if (data.risk === "high") reason.push("High risk");
        if (data.confidence && data.confidence < 0.80) reason.push("Low confidence");
        if (data.error_reason) reason.push(data.error_reason);
        reviewDetailReason.textContent = reason.length > 0 ? reason.join("; ") : "None";

        currentReviewAssignedTo = data.assigned_to || null;

        setBadge(reviewDetailBadge, data.status, data.status.replace(/_/g, " "));

        reviewDetail.classList.remove("hidden");
        reviewDetail.scrollIntoView({ behavior: "smooth", block: "start" });

        loadComments(requestId);
    } catch (err) {
        showError(reviewError, err.message || "Failed to load ticket details.");
    } finally {
        setLoading(reviewLoading, false);
    }
}

async function loadComments(requestId) {
    hideError(commentsError);
    setLoading(commentsLoading, true);

    try {
        const response = await authFetch(`/requests/${requestId}/comments`);
        if (!response.ok) {
            throw new Error("Unable to load comments.");
        }

        const data = await response.json();
        renderComments(data.results || []);
    } catch (err) {
        showError(commentsError, err.message || "Failed to load comments.");
        commentsList.innerHTML = "";
    } finally {
        setLoading(commentsLoading, false);
    }
}

function renderComments(comments) {
    commentsList.innerHTML = "";

    if (comments.length === 0) {
        const empty = document.createElement("p");
        empty.textContent = "No comments yet.";
        empty.className = "empty-state";
        commentsList.appendChild(empty);
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
        commentsList.appendChild(item);
    }
}

async function postComment(event) {
    event.preventDefault();
    if (!currentReviewId) return;

    const content = commentInput.value.trim();
    if (!content) {
        showError(commentsError, "Comment cannot be empty.");
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

        commentInput.value = "";
        hideError(commentsError);
        loadComments(currentReviewId);
    } catch (err) {
        showError(commentsError, err.message || "Failed to post comment.");
    }
}

commentForm.addEventListener("submit", postComment);

async function updateReviewStatus(newStatus) {
    if (!currentReviewId) return;

    try {
        const payload = { status: newStatus };
        if (reviewAssignBtn.textContent === "Unassign") {
            payload.assigned_to = null;
        } else if (reviewAssignBtn.textContent === "Assign to Me") {
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
        reviewDetailStatus.textContent = data.status;
        reviewDetailAssigned.textContent = data.assigned_to ? `User #${data.assigned_to}` : "Unassigned";
        setBadge(reviewDetailBadge, data.status, data.status.replace(/_/g, " "));

        if (data.assigned_to) {
            reviewAssignBtn.textContent = "Unassign";
        } else {
            reviewAssignBtn.textContent = "Assign to Me";
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
    updateReviewStatus("triaged");
});

reviewResolveBtn.addEventListener("click", () => {
    updateReviewStatus("resolved");
});

reviewCloseBtn.addEventListener("click", () => {
    reviewDetail.classList.add("hidden");
    currentReviewId = null;
});

refreshReviewBtn.addEventListener("click", loadReviewQueue);

document.getElementById("login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    if (!email || !password) {
        showAuthError("Please enter both email and password.");
        return;
    }
    login(email, password);
});

document.getElementById("register-form").addEventListener("submit", (e) => {
    e.preventDefault();
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
    register(name, email, password);
});

document.getElementById("show-register").addEventListener("click", () => {
    hideAuthError();
    document.getElementById("login-form").classList.add("hidden");
    document.getElementById("register-form").classList.remove("hidden");
    document.getElementById("auth-heading").textContent = "Create Account";
});

document.getElementById("show-login").addEventListener("click", () => {
    hideAuthError();
    document.getElementById("register-form").classList.add("hidden");
    document.getElementById("login-form").classList.remove("hidden");
    document.getElementById("auth-heading").textContent = "Sign In";
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

searchInput.addEventListener("input", () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
        loadHistory();
    }, 300);
});

filterCategory.addEventListener("change", applyFilters);
filterRisk.addEventListener("change", applyFilters);
filterStatus.addEventListener("change", applyFilters);

closeDetailBtn.addEventListener("click", () => {
    historyDetail.classList.add("hidden");
});

inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        analyzeRequest();
    }
});

document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
        historyDetail.classList.add("hidden");
        reviewDetail.classList.add("hidden");
        currentReviewId = null;
    }
});

loadUser();
