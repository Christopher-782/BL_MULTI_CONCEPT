// ==================== OPTIMIZED BANKING APPLICATION ====================
// Performance Improvements:
// 1. Intelligent API caching with TTL
// 2. Parallel data loading with prioritization
// 3. Optimistic UI updates for transactions
// 4. Silent auto-refresh after data changes
// 5. Lightweight polling (5s with change detection)
// 6. Debounced search inputs
// 7. Cached pending count for badges
// ================================================================

// Application State
const state = {
  currentUser: null,
  role: null,
  currentView: "dashboard",
  customers: [],
  transactions: [],
  loans: [],
  staff: [],
  notifications: [],
  isLoading: false,
  lastTransactionCount: 0,
  pollingInterval: null,
  pendingCount: 0, // Cached pending count
  dataHash: "", // Track data changes
  lastPollTimestamp: 0,
};

// ==================== INTELLIGENT API CACHE ====================
const apiCache = new Map();
const CACHE_TTL = {
  customers: 30000, // 30 seconds
  transactions: 15000, // 15 seconds (more dynamic)
  loans: 30000,
  staff: 60000, // 1 minute (rarely changes)
  "transactions-light": 5000,
};

const cachedApi = {
  async get(endpoint, options = {}) {
    const cacheKey = `${endpoint}${JSON.stringify(options.params || {})}`;
    const cached = apiCache.get(cacheKey);
    const ttl = CACHE_TTL[endpoint.replace("/", "")] || 10000;

    if (cached && Date.now() - cached.timestamp < ttl) {
      return { data: cached.data, fromCache: true };
    }

    const response = await api.get(endpoint, options);
    apiCache.set(cacheKey, { data: response.data, timestamp: Date.now() });
    return { data: response.data, fromCache: false };
  },

  invalidate(endpointPattern) {
    for (const [key] of apiCache) {
      if (key.includes(endpointPattern)) apiCache.delete(key);
    }
  },

  clear() {
    apiCache.clear();
  },
};

// ==================== OPTIMIZED REAL-TIME POLLING ====================
function startTransactionPolling() {
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
  }

  if (!state.currentUser || state.role !== "admin") {
    return;
  }

  // Lightweight polling every 5 seconds with hash comparison
  state.pollingInterval = setInterval(async () => {
    try {
      const response = await api.get("/transactions?limit=1&sort=-date");
      const latestTxn = response.data[0];

      if (!latestTxn) return;

      const lastKnownDate = state.transactions[0]?.date;
      const hasNewData =
        new Date(latestTxn.date) > new Date(lastKnownDate || 0);

      if (!hasNewData) return;

      await refreshDataSilent();

      const freshPendingCount = state.transactions.filter(
        (t) => t.status === "pending",
      ).length;

      const oldPendingCount = state.pendingCount;

      if (freshPendingCount > oldPendingCount) {
        const newCount = freshPendingCount - oldPendingCount;
        state.pendingCount = freshPendingCount;

        showNotification(
          `🔔 ${newCount} new transaction${newCount > 1 ? "s" : ""} pending approval`,
          "warning",
        );

        const badge = document.getElementById("notifBadge");
        if (badge && freshPendingCount > 0) {
          badge.classList.remove("hidden");
        }

        if (state.currentView === "transactions") {
          renderSidebar();
          navigate("transactions");
        } else {
          renderSidebar();
        }

        state.notifications.unshift({
          id: Date.now(),
          message: `${newCount} new transaction${newCount > 1 ? "s" : ""} pending approval`,
          time: "Just now",
          unread: true,
        });
        updateNotificationList();
      }

      state.lastTransactionCount = state.transactions.length;
    } catch (error) {
      console.warn("Polling error:", error.message);
    }
  }, 5000);
}

function stopTransactionPolling() {
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }
}

function initRealTimeUpdates() {
  if (state.role === "admin") {
    startTransactionPolling();
  }
}

// Axios Configuration
const api = axios.create({
  baseURL: "https://bl-multi-concept.onrender.com/",
  timeout: 60000,
  headers: {
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error),
);

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.code === "ECONNABORTED" && !originalRequest._retry) {
      originalRequest._retry = true;
      showNotification("Server is waking up... Please wait", "info");
      await new Promise((resolve) => setTimeout(resolve, 5000));
      return api(originalRequest);
    }

    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("cachedUser");
      state.currentUser = null;
      document.getElementById("app")?.classList.add("hidden");
      document.getElementById("loginScreen")?.classList.remove("hidden");
      showNotification("Session expired. Please login again.", "error");
    }
    return Promise.reject(error);
  },
);

// Menu Configuration
const menus = {
  admin: [
    { id: "dashboard", icon: "fa-chart-line", label: "Dashboard" },
    { id: "customers", icon: "fa-users", label: "All Customers" },
    {
      id: "dormant-customers",
      icon: "fa-user-clock",
      label: "Dormant Customers",
    },
    {
      id: "transactions",
      icon: "fa-exchange-alt",
      label: "Transactions",
      badge: "pending",
    },
    {
      id: "loans",
      icon: "fa-hand-holding-usd",
      label: "Loans & Overdrafts",
      badge: "pending",
    },
    { id: "staff", icon: "fa-user-shield", label: "Staff Management" },
    { id: "revenue", icon: "fa-chart-line", label: "Revenue Reports" },
    { id: "reports", icon: "fa-file-alt", label: "Reports" },
    { id: "customer-reports", icon: "fa-chart-pie", label: "Customer Reports" },
    { id: "settings", icon: "fa-cog", label: "Settings" },
    {
      id: "staff-reconciliation",
      icon: "fa-file-invoice-dollar",
      label: "Staff Reconciliation",
    },
    {
      id: "repayments",
      icon: "fa-calendar-check",
      label: "Repayment Management",
    },
  ],
  staff: [
    { id: "dashboard", icon: "fa-chart-line", label: "Dashboard" },
    { id: "customers", icon: "fa-users", label: "All Customers" },
    { id: "new-customer", icon: "fa-user-plus", label: "Register Customer" },
    { id: "quick-transaction", icon: "fa-bolt", label: "Quick Transaction" },
    { id: "transactions", icon: "fa-exchange-alt", label: "New Transaction" },
    {
      id: "loan-request",
      icon: "fa-hand-holding-usd",
      label: "Request Loan/Overdraft",
    },
    { id: "my-loans", icon: "fa-history", label: "My Loan Requests" },
    { id: "history", icon: "fa-list-alt", label: "My History" },
  ],
};

// ==================== MOBILE MENU FUNCTIONALITY ====================
function initMobileMenu() {
  const sidebar = document.querySelector(".sidebar");
  const menuToggle = document.getElementById("mobileMenuToggle");
  const overlay = document.getElementById("sidebarOverlay");
  const body = document.body;

  function updateMobileMenuVisibility() {
    const isMobile = window.innerWidth <= 820;

    if (menuToggle) {
      menuToggle.style.display = isMobile ? "flex" : "none";
      if (isMobile) {
        menuToggle.style.cssText = `
          display: flex; position: fixed; top: 12px; left: 12px;
          z-index: 1001; background: rgba(30, 41, 59, 0.95);
          backdrop-filter: blur(8px); border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 10px; padding: 10px; align-items: center;
          justify-content: center; pointer-events: auto;
        `;
      }
    }

    if (overlay) {
      if (!isMobile || !sidebar?.classList.contains("open")) {
        overlay.classList.add("hidden");
      }
    }

    if (sidebar) {
      if (!isMobile) {
        sidebar.classList.remove("open");
        sidebar.style.transform = "translateX(0)";
        sidebar.style.position = "relative";
        sidebar.style.zIndex = "";
        body.style.overflow = "";
        body.classList.remove("sidebar-open");
      } else {
        sidebar.style.cssText = `
          position: fixed; width: 280px; max-width: 85%;
          z-index: 1002; pointer-events: auto;
          transform: ${sidebar.classList.contains("open") ? "translateX(0)" : "translateX(-100%)"};
        `;
      }
    }
  }

  updateMobileMenuVisibility();

  if (menuToggle && sidebar && overlay) {
    const newToggle = menuToggle.cloneNode(true);
    if (menuToggle.parentNode) {
      menuToggle.parentNode.replaceChild(newToggle, menuToggle);
    }

    newToggle.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const isOpen = sidebar.classList.toggle("open");
      if (isOpen) {
        sidebar.style.transform = "translateX(0)";
        sidebar.style.zIndex = "1002";
        sidebar.style.pointerEvents = "auto";
        overlay.classList.remove("hidden");
        overlay.style.zIndex = "999";
        body.style.overflow = "hidden";
        body.classList.add("sidebar-open");
        sidebar.querySelectorAll(".sidebar-item").forEach((item) => {
          item.style.pointerEvents = "auto";
          item.style.cursor = "pointer";
          item.style.position = "relative";
          item.style.zIndex = "1003";
        });
      } else {
        sidebar.style.transform = "translateX(-100%)";
        overlay.classList.add("hidden");
        body.style.overflow = "";
        body.classList.remove("sidebar-open");
      }
    };

    overlay.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      sidebar.classList.remove("open");
      sidebar.style.transform = "translateX(-100%)";
      overlay.classList.add("hidden");
      body.style.overflow = "";
      body.classList.remove("sidebar-open");
    };
  }

  window.removeEventListener("resize", handleResize);
  window.addEventListener("resize", handleResize);
}

function handleResize() {
  const sidebar = document.querySelector(".sidebar");
  const menuToggle = document.getElementById("mobileMenuToggle");
  const overlay = document.getElementById("sidebarOverlay");
  const isMobile = window.innerWidth <= 820;

  if (!isMobile) {
    if (menuToggle) menuToggle.style.display = "none";
    if (overlay) overlay.classList.add("hidden");
    if (sidebar) {
      sidebar.classList.remove("open");
      sidebar.style.transform = "translateX(0)";
      sidebar.style.position = "relative";
      sidebar.style.zIndex = "";
    }
    document.body.style.overflow = "";
    document.body.classList.remove("sidebar-open");
  } else {
    if (menuToggle) {
      menuToggle.style.display = "flex";
      menuToggle.style.position = "fixed";
      menuToggle.style.top = "12px";
      menuToggle.style.left = "12px";
    }
    if (sidebar) {
      sidebar.style.position = "fixed";
      sidebar.style.zIndex = "1002";
      if (!sidebar.classList.contains("open")) {
        sidebar.style.transform = "translateX(-100%)";
      }
    }
  }
}

function closeMobileMenu() {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const body = document.body;

  if (window.innerWidth <= 820) {
    if (sidebar) {
      sidebar.classList.remove("open");
      sidebar.style.transform = "translateX(-100%)";
    }
    if (overlay) overlay.classList.add("hidden");
    body.style.overflow = "";
    body.classList.remove("sidebar-open");
  }
}

// ==================== UTILITY FUNCTIONS ====================
function formatDate(dateString) {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    const options = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    };
    return date.toLocaleString("en-GB", options).replace(",", "");
  } catch (error) {
    return dateString;
  }
}

function formatSimpleDate(dateString) {
  if (!dateString) return "N/A";
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return date.toLocaleDateString("en-GB");
  } catch (error) {
    return dateString;
  }
}

function getStatusStyle(status) {
  const styles = {
    approved: "bg-green-500/20 text-green-400",
    pending: "bg-yellow-500/20 text-yellow-400 animate-pulse",
    rejected: "bg-red-500/20 text-red-400",
    active: "bg-green-500/20 text-green-400",
    completed: "bg-blue-500/20 text-blue-400",
    processing: "bg-blue-500/20 text-blue-400 animate-pulse",
  };
  return styles[status] || "bg-gray-500/20 text-gray-400";
}

function showNotification(message, type = "info") {
  const colors = {
    success: "bg-green-500",
    error: "bg-red-500",
    info: "bg-blue-500",
    warning: "bg-yellow-500",
  };

  const isMobile = window.innerWidth <= 820;
  const notif = document.createElement("div");
  notif.className = `fixed ${isMobile ? "top-14 left-4 right-4" : "top-4 right-4"} ${colors[type]} text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-2xl z-50 notification flex items-center gap-2 sm:gap-3 animate-slideIn text-sm sm:text-base`;
  notif.innerHTML = `
    <i class="fas fa-${type === "success" ? "check-circle" : type === "error" ? "exclamation-circle" : "info-circle"}"></i>
    <span class="flex-1">${message}</span>
  `;

  document.body.appendChild(notif);
  setTimeout(() => {
    notif.style.opacity = "0";
    notif.style.transform = isMobile ? "translateY(-100%)" : "translateX(100%)";
    setTimeout(() => notif.remove(), 300);
  }, 3000);
}

// ==================== DEBOUNCE UTILITY ====================
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ==================== OPTIMIZED INITIALIZATION ====================
function selectRole(role) {
  state.role = role;
  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.classList.remove("border-blue-500", "bg-blue-500/10");
    btn.classList.add("border-gray-600");
  });
  document.getElementById(role + "Btn").classList.remove("border-gray-600");
  document
    .getElementById(role + "Btn")
    .classList.add("border-blue-500", "bg-blue-500/10");
  document.getElementById("emailInput").value = role + "@vaultflow.com";
}

async function login() {
  const email = document.getElementById("emailInput").value;
  const password = document.getElementById("passwordInput").value;

  const loginBtn = document.querySelector('button[onclick="login()"]');
  const originalText = loginBtn.innerHTML;
  loginBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin mr-2"></i>Connecting...';
  loginBtn.disabled = true;

  try {
    const response = await api.post("/login", {
      email,
      password,
      role: state.role,
    });

    state.currentUser = response.data;

    if (response.data.token) {
      localStorage.setItem("token", response.data.token);
      localStorage.setItem("cachedUser", JSON.stringify(response.data));
    }

    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    await initializeApp();
    initRealTimeUpdates();
  } catch (error) {
    console.error("Login error:", error);
    if (error.code === "ECONNABORTED") {
      showNotification(
        "Server is starting up. Please try again in 30 seconds.",
        "warning",
      );
    } else {
      showNotification(error.response?.data?.error || "Login failed", "error");
    }
  } finally {
    loginBtn.innerHTML = originalText;
    loginBtn.disabled = false;
  }
}

async function initializeApp() {
  updateUserInfo();
  await loadAllData();
  renderSidebar();
  navigate("dashboard");
  startClock();
  initMobileMenu();
  initRealTimeUpdates();
}

// ==================== OPTIMIZED DATA LOADING ====================
async function loadAllData(forceRefresh = false) {
  if (state.isLoading && !forceRefresh) return;
  state.isLoading = true;

  try {
    // Phase 1: Load critical data in parallel with caching
    const [customersRes, transactionsRes] = await Promise.all([
      cachedApi.get("/customers"),
      cachedApi.get("/transactions"),
    ]);

    state.customers = customersRes.data;
    state.transactions = transactionsRes.data;
    state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    state.pendingCount = state.transactions.filter(
      (t) => t.status === "pending",
    ).length;

    // Phase 2: Update UI immediately with critical data
    if (
      state.currentView === "dashboard" ||
      state.currentView === "transactions"
    ) {
      renderSidebar();
      if (!customersRes.fromCache || !transactionsRes.fromCache) {
        navigate(state.currentView);
      }
    }

    // Phase 3: Load non-critical data in background
    Promise.all([
      loadLoansData(),
      state.role === "admin" ? loadStaffData() : Promise.resolve(),
    ]).then(() => {
      if (
        state.currentView !== "dashboard" &&
        state.currentView !== "transactions"
      ) {
        navigate(state.currentView);
      }
    });

    checkPendingNotifications();
  } catch (error) {
    console.error("Failed to load critical data:", error);
    showNotification("Failed to load data from server", "error");
  } finally {
    state.isLoading = false;
  }
}

async function loadLoansData() {
  try {
    const loansRes = await cachedApi.get("/loans");
    state.loans = loansRes.data;
    return loansRes;
  } catch (loansError) {
    console.warn("Could not load loans data:", loansError);
    state.loans = state.loans || [];
    return null;
  }
}

async function loadStaffData() {
  try {
    const staffRes = await cachedApi.get("/staff");
    state.staff = staffRes.data;
    return staffRes;
  } catch (staffError) {
    console.warn("Could not load staff data:", staffError);
    state.staff = state.staff || [];
    return null;
  }
}

// ==================== SILENT AUTO-REFRESH ====================
async function refreshDataSilent() {
  try {
    const [customersRes, transactionsRes, loansRes] = await Promise.all([
      api.get("/customers").catch(() => ({ data: state.customers })),
      api.get("/transactions").catch(() => ({ data: state.transactions })),
      api.get("/loans").catch(() => ({ data: state.loans })),
    ]);

    const oldPendingCount = state.pendingCount;

    state.customers = customersRes.data;
    state.transactions = transactionsRes.data;
    state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
    state.loans = loansRes.data || state.loans;
    state.pendingCount = state.transactions.filter(
      (t) => t.status === "pending",
    ).length;

    // Update cache
    cachedApi.invalidate("customers");
    cachedApi.invalidate("transactions");
    cachedApi.invalidate("loans");

    // Update sidebar badges silently
    renderSidebar();

    // If pending count changed and admin is on transactions, refresh view
    if (state.role === "admin" && state.pendingCount !== oldPendingCount) {
      if (
        state.currentView === "transactions" ||
        state.currentView === "dashboard"
      ) {
        navigate(state.currentView);
      }
    }

    return true;
  } catch (error) {
    console.warn("Silent refresh failed:", error);
    return false;
  }
}

async function refreshData() {
  const icon = document.getElementById("refreshIcon");
  icon?.classList.add("fa-spin");
  await loadAllData(true); // Force refresh
  navigate(state.currentView);
  icon?.classList.remove("fa-spin");
  showNotification("Data refreshed", "success");
}

function updateUserInfo() {
  if (!state.currentUser) return;
  document.getElementById("userRoleDisplay").textContent =
    state.currentUser.role === "admin" ? "Admin Portal" : "Staff Portal";
  document.getElementById("userName").textContent = state.currentUser.name;
  document.getElementById("userEmail").textContent = state.currentUser.email;
  document.getElementById("userAvatar").textContent = state.currentUser.name[0];
}

function renderSidebar() {
  const menuContainer = document.getElementById("sidebarMenu");
  menuContainer.innerHTML = "";

  menus[state.role].forEach((item) => {
    const btn = document.createElement("button");
    btn.className = `sidebar-item w-full flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 rounded-lg text-left mb-1 transition-colors ${state.currentView === item.id ? "active text-blue-400 bg-blue-500/10" : "text-gray-400 hover:text-white hover:bg-gray-800/50"}`;

    btn.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();
      navigate(item.id);
      return false;
    };

    btn.style.pointerEvents = "auto";
    btn.style.cursor = "pointer";
    btn.style.position = "relative";
    btn.style.zIndex = "1003";

    let badge = "";
    if (item.badge === "pending") {
      const pendingCount =
        state.pendingCount ||
        state.transactions.filter((t) => t.status === "pending").length;
      if (pendingCount > 0) {
        badge = `<span class="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">${pendingCount}</span>`;
      }
    }

    btn.innerHTML = `
      <i class="fas ${item.icon} w-5 text-base sm:text-lg pointer-events-none"></i>
      <span class="flex-1 text-sm sm:text-base pointer-events-none">${item.label}</span>
      ${badge}
    `;
    menuContainer.appendChild(btn);
  });
}

// ==================== NAVIGATION ====================
function navigate(view) {
  state.currentView = view;
  renderSidebar();
  closeMobileMenu();

  const titles = {
    dashboard: "Dashboard Overview",
    customers: "Customer Management",
    "dormant-customers": "Dormant Customers",
    transactions:
      state.role === "admin" ? "Transaction Approvals" : "New Transaction",
    "quick-transaction": "Quick Transaction",
    loans: "Loan & Overdraft Management",
    "loan-request": "Request Loan/Overdraft",
    "my-loans": "My Loan Requests",
    revenue: "Revenue Reports",
    staff: "Staff Management",
    reports: "System Reports",
    "customer-reports": "Customer Reports",
    settings: "System Settings",
    "new-customer": "Register New Customer",
    history: "My Transaction History",
  };

  document.getElementById("pageTitle").textContent = titles[view] || view;

  const contentArea = document.getElementById("contentArea");
  contentArea.innerHTML = "";

  switch (view) {
    case "dashboard":
      renderDashboard(contentArea);
      break;
    case "customers":
      renderCustomers(contentArea);
      break;
    case "dormant-customers":
      renderDormantCustomers(contentArea);
      break;
    case "transactions":
      state.role === "admin"
        ? renderAdminTransactions(contentArea)
        : renderNewTransaction(contentArea);
      break;
    case "quick-transaction":
      renderQuickTransaction(contentArea);
      break;
    case "loans":
      renderAdminLoans(contentArea);
      break;
    case "loan-request":
      renderNewLoanRequest(contentArea);
      break;
    case "my-loans":
      renderMyLoans(contentArea);
      break;
    case "revenue":
      renderRevenueReports(contentArea);
      break;
    case "new-customer":
      renderNewCustomer(contentArea);
      break;
    case "staff":
      renderStaffManagement(contentArea);
      break;
    case "history":
      renderHistory(contentArea);
      break;
    case "customer-reports":
      renderCustomerReports(contentArea);
      break;
    case "staff-reconciliation":
      renderStaffReconciliation(contentArea);
      break;
    case "repayments":
      renderRepaymentManagement(contentArea);
      break;
    default:
      renderDashboard(contentArea);
  }
}

// ==================== OPTIMIZED TRANSACTION PROCESSING ====================
async function processTransaction(
  txnId,
  action,
  refreshView = true,
  staffId = null,
) {
  const transaction = state.transactions.find((t) => t.id === txnId);

  if (!transaction) {
    showNotification("Transaction not found", "error");
    return;
  }

  // OPTIMISTIC UPDATE: Update UI immediately before API call
  const originalStatus = transaction.status;
  transaction.status = action === "approved" ? "processing" : "rejected";

  // Update sidebar badge immediately
  renderSidebar();

  // If on transactions page, update the specific card immediately
  const txnElement = document.getElementById(`txn-${txnId}`);
  if (txnElement) {
    const statusBadge = txnElement.querySelector(".status-badge");
    if (statusBadge) {
      statusBadge.className = `status-badge px-2 py-1 rounded text-xs ${getStatusStyle(transaction.status)}`;
      statusBadge.textContent = transaction.status;
    }
  }

  try {
    const endpoint = action === "approved" ? "/approve" : "/reject";

    let updateData = {
      status: action,
      approvedBy: state.currentUser.name,
      approvedAt: new Date(),
    };

    if (action === "rejected") {
      updateData.rejectedBy = state.currentUser.name;
      updateData.rejectedAt = new Date();
      updateData.isRejection = true;
    }

    // Handle deposit with loan repayment
    if (
      action === "approved" &&
      transaction.type === "deposit" &&
      transaction.loanDeduction > 0
    ) {
      const { loanId, amount, fullyPaid, outstandingAfter } =
        transaction.loanRepaymentInfo;
      updateData.loanRepayment = {
        loanId,
        amount,
        recordedAt: new Date(),
        fullyPaid,
        outstandingAfter,
      };
    }

    // Show processing indicator
    showNotification(
      action === "approved"
        ? "Approving transaction..."
        : "Rejecting transaction...",
      "info",
    );

    await api.patch(`/transactions/${txnId}${endpoint}`, updateData);

    // CONFIRMED: Update to final state
    transaction.status = action;
    transaction.approvedBy = state.currentUser.name;
    transaction.approvedAt = new Date();

    // Update pending count
    state.pendingCount = state.transactions.filter(
      (t) => t.status === "pending",
    ).length;

    // Invalidate cache
    cachedApi.invalidate("transactions");

    // Show success notification
    if (
      action === "approved" &&
      transaction.type === "deposit" &&
      transaction.loanDeduction > 0
    ) {
      const { amount, fullyPaid, outstandingAfter } =
        transaction.loanRepaymentInfo;
      let notifMessage = `Approved! ₦${amount.toLocaleString()} deducted for loan repayment.`;
      if (fullyPaid) notifMessage += ` Loan FULLY PAID!`;
      else notifMessage += ` ₦${outstandingAfter.toLocaleString()} remaining.`;
      showNotification(notifMessage, "success");
    } else {
      showNotification(`✅ Transaction ${action}!`, "success");
    }

    // AUTO-REFRESH: Trigger background data refresh
    setTimeout(() => {
      refreshDataSilent();
    }, 500);

    closeStaffPendingModal();
    closeTransactionModal();

    // Refresh view if needed
    if (refreshView) {
      setTimeout(() => navigate(state.currentView), 300);
    }
  } catch (error) {
    // ROLLBACK: Revert optimistic update on failure
    transaction.status = originalStatus;
    renderSidebar();

    if (txnElement) {
      const statusBadge = txnElement.querySelector(".status-badge");
      if (statusBadge) {
        statusBadge.className = `status-badge px-2 py-1 rounded text-xs ${getStatusStyle(originalStatus)}`;
        statusBadge.textContent = originalStatus;
      }
    }

    console.error("Transaction processing failed:", error);
    showNotification(
      error.response?.data?.message || "Failed to process transaction",
      "error",
    );
  }
}

// ==================== LOGOUT FUNCTION ====================
function logout() {
  stopTransactionPolling();
  localStorage.removeItem("token");
  localStorage.removeItem("cachedUser");
  state.currentUser = null;
  state.role = null;
  state.customers = [];
  state.transactions = [];
  state.loans = [];
  state.staff = [];
  state.notifications = [];
  state.currentView = "dashboard";
  state.lastTransactionCount = 0;
  state.pendingCount = 0;
  cachedApi.clear();
  document.getElementById("app").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("passwordInput").value = "";
  document.getElementById("emailInput").value = "";
  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.classList.remove("border-blue-500", "bg-blue-500/10");
    btn.classList.add("border-gray-600");
  });
  selectRole("admin");
  showNotification("Logged out successfully", "info");
}

// ==================== NOTIFICATIONS ====================
function toggleNotifications() {
  document
    .getElementById("notificationPanel")
    .classList.toggle("translate-x-full");
}

function checkPendingNotifications() {
  const pendingTxnCount =
    state.pendingCount ||
    state.transactions.filter((t) => t.status === "pending").length;
  const pendingLoanCount =
    state.loans?.filter((l) => l.status === "pending").length || 0;
  const totalPending = pendingTxnCount + pendingLoanCount;

  const badge = document.getElementById("notifBadge");

  if (totalPending > 0 && state.role === "admin") {
    badge.classList.remove("hidden");

    if (pendingTxnCount > 0) {
      state.notifications.push({
        id: Date.now(),
        message: `${pendingTxnCount} transaction${pendingTxnCount > 1 ? "s" : ""} pending approval`,
        time: "Just now",
        unread: true,
      });
    }

    if (pendingLoanCount > 0) {
      state.notifications.push({
        id: Date.now() + 1,
        message: `${pendingLoanCount} loan/overdraft request${pendingLoanCount > 1 ? "s" : ""} pending approval`,
        time: "Just now",
        unread: true,
      });
    }

    updateNotificationList();
  }
}

function updateNotificationList() {
  const list = document.getElementById("notificationList");
  if (state.notifications.length === 0) {
    list.innerHTML =
      '<div class="p-4 text-center text-gray-500 text-sm">No notifications</div>';
    return;
  }
  list.innerHTML = state.notifications
    .map(
      (n) =>
        `<div class="p-4 hover:bg-gray-800/50 transition-colors ${n.unread ? "border-l-2 border-blue-500" : ""}"><p class="text-sm mb-1">${n.message}</p><p class="text-xs text-gray-500">${n.time}</p></div>`,
    )
    .join("");
}

function clearNotifications() {
  state.notifications = [];
  document.getElementById("notifBadge").classList.add("hidden");
  updateNotificationList();
}

function startClock() {
  setInterval(() => {
    document.getElementById("liveTime").textContent =
      new Date().toLocaleTimeString("en-GB");
  }, 1000);
}

// ==================== AUTH CHECK ====================
async function checkAuth() {
  const token = localStorage.getItem("token");
  const cachedUser = localStorage.getItem("cachedUser");

  if (!token) return;

  if (cachedUser) {
    try {
      const user = JSON.parse(cachedUser);
      state.currentUser = user;
      state.role = user.role;
      document.getElementById("loginScreen").classList.add("hidden");
      document.getElementById("app").classList.remove("hidden");
      updateUserInfo();
      renderSidebar();
      startClock();
      initMobileMenu();
    } catch (e) {
      console.error("Failed to parse cached user", e);
    }
  }

  try {
    const response = await api.get("/verify");
    const user = response.data.user || response.data;
    state.currentUser = user;
    state.role = user.role;
    localStorage.setItem("cachedUser", JSON.stringify(user));
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");
    await initializeApp();
  } catch (error) {
    console.error("Auth verification failed:", error);

    if (error.response?.status === 401) {
      localStorage.removeItem("token");
      localStorage.removeItem("cachedUser");
      state.currentUser = null;
      state.role = null;
      document.getElementById("loginScreen").classList.remove("hidden");
      document.getElementById("app").classList.add("hidden");
      showNotification("Session expired. Please login again.", "error");
    } else {
      showNotification(
        "Server connection issue. Using cached session. Will retry...",
        "warning",
      );
      if (state.currentUser) {
        try {
          await loadAllData();
          navigate("dashboard");
          initRealTimeUpdates();
        } catch (loadError) {
          console.warn(
            "Could not load fresh data, using cached state",
            loadError,
          );
        }
      }
    }
  }
}

// ==================== GLOBAL EXPORTS ====================
window.selectRole = selectRole;
window.login = login;
window.logout = logout;
window.navigate = navigate;
window.refreshData = refreshData;
window.showNotification = showNotification;
window.formatDate = formatDate;
window.formatSimpleDate = formatSimpleDate;
window.getStatusStyle = getStatusStyle;
window.debounce = debounce;
window.cachedApi = cachedApi;
window.refreshDataSilent = refreshDataSilent;

// Initialize
window.onload = () => {
  selectRole("admin");
  checkAuth();
};

document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const cachedUser = localStorage.getItem("cachedUser");
  if (token && cachedUser) {
    try {
      const user = JSON.parse(cachedUser);
      state.currentUser = user;
      state.role = user.role;
      const loginScreen = document.getElementById("loginScreen");
      const app = document.getElementById("app");
      if (loginScreen && app) {
        loginScreen.classList.add("hidden");
        app.classList.remove("hidden");
      }
    } catch (e) {
      console.error("Early auth restore failed", e);
    }
  }
});
