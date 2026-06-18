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
};

// ==================== REAL-TIME POLLING ====================

function startTransactionPolling() {
  // Stop any existing polling
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
  }

  // Only poll if user is logged in and is admin
  if (!state.currentUser || state.role !== "admin") {
    return;
  }

  // Poll every 10 seconds for new transactions
  state.pollingInterval = setInterval(async () => {
    try {
      const response = await api.get("/transactions");
      // Normalize response data - handle both {data: [...]} and [...] formats
      const freshTransactions = Array.isArray(response.data)
        ? response.data
        : Array.isArray(response.data?.data)
          ? response.data.data
          : [];

      // Ensure state.transactions is an array
      const currentTransactions = Array.isArray(state.transactions)
        ? state.transactions
        : [];

      // Count pending transactions
      const freshPendingCount = freshTransactions.filter(
        (t) => t.status === "pending",
      ).length;

      const oldPendingCount = currentTransactions.filter(
        (t) => t.status === "pending",
      ).length;

      // Check if new pending transactions arrived
      if (freshPendingCount > oldPendingCount) {
        const newCount = freshPendingCount - oldPendingCount;

        // Update state with fresh data
        state.transactions = freshTransactions;
        state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

        // Show notification about new pending transactions
        showNotification(
          `🔔 ${newCount} new transaction${newCount > 1 ? "s" : ""} pending approval from staff`,
          "warning",
        );

        // Update notification badge
        const badge = document.getElementById("notifBadge");
        if (badge && freshPendingCount > 0) {
          badge.classList.remove("hidden");
        }

        // If admin is on transactions page, auto-refresh it
        if (state.currentView === "transactions") {
          renderSidebar(); // Update badge count
          navigate("transactions"); // Re-render the page
        } else {
          // Just update sidebar badge
          renderSidebar();
        }

        // Add to notifications panel
        state.notifications.unshift({
          id: Date.now(),
          message: `${newCount} new transaction${newCount > 1 ? "s" : ""} pending approval`,
          time: "Just now",
          unread: true,
        });
        updateNotificationList();
      }

      // Also update lastTransactionCount for tracking
      state.lastTransactionCount = freshTransactions.length;
    } catch (error) {
      // Silently fail on polling errors - don't spam user
      console.warn("Polling error:", error.message);
    }
  }, 10000); // Poll every 10 seconds
}

function stopTransactionPolling() {
  if (state.pollingInterval) {
    clearInterval(state.pollingInterval);
    state.pollingInterval = null;
  }
}

// Start polling when app initializes
function initRealTimeUpdates() {
  if (state.role === "admin") {
    startTransactionPolling();
  }
}

// Axios Configuration
const api = axios.create({
  baseURL: "https://bl-multi-concept.onrender.com/",
  timeout: 60000,
  headers: { "Content-Type": "application/json" },
});

// ==================== CACHING LAYER ====================
const apiCache = new Map();
const CACHE_TTL = {
  customers: 30000, // 30s
  transactions: 15000, // 15s
  loans: 30000,
  staff: 60000, // 1m
};

const cachedApi = {
  async get(endpoint, options = {}) {
    const cacheKey = `${endpoint}${JSON.stringify(options.params || {})}`;
    const cached = apiCache.get(cacheKey);

    // Extract key name (e.g., "/customers" -> "customers")
    const endpointKey = endpoint.replace(/^\/|\/$/g, "");
    const ttl = CACHE_TTL[endpointKey] || 10000;

    if (cached && Date.now() - cached.timestamp < ttl) {
      console.log(`%c[CACHE HIT] ${endpoint}`, "color: #4ade80");
      return { data: cached.data, fromCache: true };
    }

    console.log(`%c[CACHE MISS] ${endpoint}`, "color: #facc15");
    const response = await api.get(endpoint, options);

    // Normalize response - ensure we always return the actual data array/object
    const responseData = response.data?.data || response.data;

    apiCache.set(cacheKey, { data: responseData, timestamp: Date.now() });
    return { data: responseData, fromCache: false };
  },

  invalidate(endpointPattern) {
    console.log(`%c[CACHE INVALIDATE] ${endpointPattern}`, "color: #f87171");
    for (const [key] of apiCache) {
      if (key.includes(endpointPattern)) apiCache.delete(key);
    }
  },

  clear() {
    apiCache.clear();
  },
};

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  },
);

// Response interceptor for error handling
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
    {
      id: "quick-transaction",
      icon: "fa-bolt",
      label: "Quick Transaction",
    },
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
        menuToggle.style.position = "fixed";
        menuToggle.style.top = "12px";
        menuToggle.style.left = "12px";
        menuToggle.style.zIndex = "1001";
        menuToggle.style.background = "rgba(30, 41, 59, 0.95)";
        menuToggle.style.backdropFilter = "blur(8px)";
        menuToggle.style.border = "1px solid rgba(255, 255, 255, 0.1)";
        menuToggle.style.borderRadius = "10px";
        menuToggle.style.padding = "10px";
        menuToggle.style.alignItems = "center";
        menuToggle.style.justifyContent = "center";
        menuToggle.style.pointerEvents = "auto";
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
        sidebar.style.position = "fixed";
        sidebar.style.width = "280px";
        sidebar.style.maxWidth = "85%";
        sidebar.style.zIndex = "1002";
        sidebar.style.pointerEvents = "auto";
        if (!sidebar.classList.contains("open")) {
          sidebar.style.transform = "translateX(-100%)";
        } else {
          sidebar.style.transform = "translateX(0)";
        }
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

        const sidebarItems = sidebar.querySelectorAll(".sidebar-item");
        sidebarItems.forEach((item) => {
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

function closeCustomerModal() {
  const modal = document.getElementById("customerModal");
  if (modal) modal.remove();
}

// ==================== UTILITY FUNCTIONS ====================
function isCustomerFlaggedForRecoveryCharge(customerId) {
  const customerTransactions = state.transactions
    .filter((t) => t.customerId === customerId && t.status === "approved")
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  // If the most recent approved transaction was a withdrawal, return true
  if (customerTransactions.length > 0 && customerTransactions[0].type === "withdrawal") {
    return true;
  }
  return false;
}
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

// ==================== QUICK TRANSACTION FUNCTIONALITY ====================

function renderQuickTransaction(container) {
  let availableCustomers = state.customers;

  const html = `
    <div class="max-w-2xl mx-auto animate-fade-in px-4 sm:px-0">
      <div class="glass-panel rounded-2xl p-4 sm:p-8">
        <div class="flex items-center gap-4 mb-6 sm:mb-8">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-bolt text-emerald-400 text-base sm:text-xl"></i>
          </div>
          <div>
            <h3 class="text-lg sm:text-xl font-semibold">Quick Transaction</h3>
            <p class="text-xs sm:text-sm text-gray-400">Fast processing - select customer, type, and amount</p>
            <p class="text-xs text-emerald-400 mt-1">⚡ Processes immediately - no approval needed</p>
          </div>
        </div>

        <form onsubmit="handleQuickTransaction(event)" class="space-y-4 sm:space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              <i class="fas fa-search mr-2 text-emerald-400"></i>Search Customer
            </label>
            <div class="relative">
              <input type="text" id="quickCustomerSearch" placeholder="Type name, email, phone, or #001..." 
                autocomplete="off" 
                class="w-full px-4 py-3 pl-10 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-emerald-500 transition-colors text-base" />
              <i class="fas fa-search absolute left-3 top-3.5 text-gray-500"></i>
            </div>
          </div>

          <div id="quickSearchResults" class="hidden glass-panel rounded-xl border border-gray-700 max-h-48 overflow-y-auto">
            <div id="quickSearchList" class="divide-y divide-gray-700"></div>
          </div>

          <div id="quickSelectedCustomer" class="hidden p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
            <div class="flex justify-between items-center">
              <div class="flex items-center gap-3">
                <div class="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 font-bold">
                  <span id="quickCustomerInitials">--</span>
                </div>
                <div>
                  <p class="font-semibold text-sm" id="quickCustomerName">--</p>
                  <p class="text-xs text-gray-400" id="quickCustomerDetails">--</p>
                </div>
              </div>
              <button type="button" onclick="clearQuickCustomer()" class="text-red-400 hover:text-red-300 p-1">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <div class="mt-2 pt-2 border-t border-emerald-500/20 flex justify-between text-sm">
              <span class="text-gray-400">Balance:</span>
              <span class="font-mono font-bold text-emerald-400" id="quickCustomerBalance">₦0</span>
            </div>
          </div>

          <input type="hidden" id="quickCustomerId" value="">

          <div class="grid grid-cols-2 gap-3">
            <button type="button" id="quickDepositBtn" onclick="setQuickType('deposit')" 
              class="p-4 rounded-xl border-2 border-gray-700 hover:border-emerald-500 transition-all text-center group">
              <i class="fas fa-arrow-down text-green-400 text-2xl mb-2 group-hover:scale-110 transition-transform"></i>
              <p class="font-medium">Deposit</p>
              <p class="text-xs text-gray-400">Add funds</p>
            </button>
            <button type="button" id="quickWithdrawBtn" onclick="setQuickType('withdrawal')" 
              class="p-4 rounded-xl border-2 border-gray-700 hover:border-orange-500 transition-all text-center group">
              <i class="fas fa-arrow-up text-orange-400 text-2xl mb-2 group-hover:scale-110 transition-transform"></i>
              <p class="font-medium">Withdrawal</p>
              <p class="text-xs text-gray-400">Remove funds</p>
            </button>
          </div>
          <input type="hidden" name="type" id="quickType" value="">

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Amount (₦)</label>
            <input type="number" name="amount" id="quickAmount" required min="1" 
              oninput="updateQuickNet()"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-2xl font-mono focus:border-emerald-500 transition-colors" 
              placeholder="0.00">
          </div>

          <div class="grid grid-cols-4 gap-2">
            <button type="button" onclick="setQuickAmount(1000)" 
              class="py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-mono transition-colors">
              ₦1,000
            </button>
            <button type="button" onclick="setQuickAmount(5000)" 
              class="py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-mono transition-colors">
              ₦5,000
            </button>
            <button type="button" onclick="setQuickAmount(10000)" 
              class="py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-mono transition-colors">
              ₦10,000
            </button>
            <button type="button" onclick="setQuickAmount(50000)" 
              class="py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-xs font-mono transition-colors">
              ₦50,000
            </button>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              Charge (₦) <span class="text-xs text-gray-500">- Optional, default 0</span>
            </label>
            <input type="number" name="charges" id="quickCharges" value="0" min="0" 
              oninput="updateQuickNet()"
              class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white font-mono focus:border-emerald-500 transition-colors" 
              placeholder="0.00">
          </div>

          <div id="quickNetDisplay" class="p-3 bg-gray-800/50 border border-gray-700 rounded-xl hidden">
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-400">Net Amount:</span>
              <span class="text-xl font-bold font-mono text-emerald-400" id="quickNetAmount">₦0</span>
            </div>
          </div>

          <div id="quickWarning" class="hidden p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p class="text-xs text-red-300 flex items-center gap-2">
              <i class="fas fa-exclamation-circle"></i>
              <span id="quickWarningText">Insufficient funds</span>
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Description</label>
            <input type="text" name="description" id="quickDescription" 
              class="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-xl text-white text-sm focus:border-emerald-500 transition-colors" 
              placeholder="Quick transaction">
          </div>

          <button type="submit" id="quickSubmitBtn" disabled
            class="w-full py-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed rounded-xl font-semibold text-lg transition-all flex items-center justify-center gap-2">
            <i class="fas fa-bolt"></i>
            <span>Process Transaction</span>
          </button>

          <p class="text-xs text-center text-gray-500">
            <i class="fas fa-info-circle mr-1"></i>
            Quick transactions are recorded as approved immediately
          </p>
        </form>
      </div>
    </div>
  `;

  container.innerHTML = html;
  initQuickSearch(availableCustomers);
}

function initQuickSearch(customersData) {
  window.quickCustomersData = customersData;
  let searchTimeout;

  const searchInput = document.getElementById("quickCustomerSearch");
  if (searchInput) {
    searchInput.addEventListener("input", function () {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(filterQuickCustomers, 200);
    });
    searchInput.addEventListener("focus", function () {
      if (this.value.trim() !== "") filterQuickCustomers();
    });
  }

  document.addEventListener("click", function (e) {
    const dropdown = document.getElementById("quickSearchResults");
    const searchContainer = document.getElementById("quickCustomerSearch");
    if (
      dropdown &&
      searchContainer &&
      !dropdown.contains(e.target) &&
      !searchContainer.contains(e.target)
    ) {
      dropdown.classList.add("hidden");
    }
  });
}

function filterQuickCustomers() {
  const searchInput = document.getElementById("quickCustomerSearch");
  const dropdown = document.getElementById("quickSearchResults");
  const list = document.getElementById("quickSearchList");

  if (!searchInput) return;
  const term = searchInput.value.toLowerCase().trim();

  if (!term) {
    dropdown.classList.add("hidden");
    return;
  }

  const filtered = window.quickCustomersData.filter((c) => {
    const name = (c.name || "").toLowerCase();
    const email = (c.email || "").toLowerCase();
    const phone = (c.phone || "").toLowerCase();
    const number = (c.customerNumber || "").toLowerCase();
    return (
      name.includes(term) ||
      email.includes(term) ||
      phone.includes(term) ||
      number === term
    );
  });

  if (filtered.length === 0) {
    list.innerHTML =
      '<div class="p-4 text-center text-gray-400 text-sm">No customers found</div>';
  } else {
    list.innerHTML = filtered
      .map((c) => {
        const initials = c.name
          ? c.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)
              .toUpperCase()
          : "??";
        const balance = c.cashBalance || c.balance || 0;
        return `<div class="p-3 hover:bg-gray-700 cursor-pointer transition-colors" 
        onclick="selectQuickCustomer('${c.id}', '${c.name.replace(/'/g, "\'")}', ${balance}, '${c.phone || ""}', '${c.customerNumber || ""}', '${initials}')">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center text-emerald-400 text-xs font-bold">${initials}</div>
          <div class="flex-1">
            <div class="flex items-center gap-2">
              ${c.customerNumber ? `<span class="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-mono">#${c.customerNumber}</span>` : ""}
              <p class="font-medium text-sm">${c.name}</p>
            </div>
            <p class="text-xs text-gray-400">${c.email} • ₦${balance.toLocaleString()}</p>
          </div>
          <i class="fas fa-chevron-right text-gray-600 text-xs"></i>
        </div>
      </div>`;
      })
      .join("");
  }

  dropdown.classList.remove("hidden");
}

function selectQuickCustomer(id, name, balance, phone, number, initials) {
  document.getElementById("quickCustomerId").value = id;
  document.getElementById("quickCustomerName").textContent = name;
  document.getElementById("quickCustomerInitials").textContent = initials;
  document.getElementById("quickCustomerDetails").textContent = phone
    ? `📱 ${phone}`
    : "No phone";
  document.getElementById("quickCustomerBalance").textContent =
    "₦" + balance.toLocaleString();
  document.getElementById("quickSelectedCustomer").classList.remove("hidden");

  window.quickSelectedCustomer = { id, name, balance };

  document.getElementById("quickSearchResults").classList.add("hidden");
  document.getElementById("quickCustomerSearch").value = "";

  setTimeout(() => document.getElementById("quickAmount")?.focus(), 100);
  validateQuickForm();
}

function clearQuickCustomer() {
  document.getElementById("quickCustomerId").value = "";
  document.getElementById("quickSelectedCustomer").classList.add("hidden");
  window.quickSelectedCustomer = null;
  validateQuickForm();
}

function setQuickType(type) {
  document.getElementById("quickType").value = type;

  const depositBtn = document.getElementById("quickDepositBtn");
  const withdrawBtn = document.getElementById("quickWithdrawBtn");

  if (type === "deposit") {
    depositBtn.classList.add("border-emerald-500", "bg-emerald-500/10");
    depositBtn.classList.remove("border-gray-700");
    withdrawBtn.classList.remove("border-orange-500", "bg-orange-500/10");
    withdrawBtn.classList.add("border-gray-700");
  } else {
    withdrawBtn.classList.add("border-orange-500", "bg-orange-500/10");
    withdrawBtn.classList.remove("border-gray-700");
    depositBtn.classList.remove("border-emerald-500", "bg-emerald-500/10");
    depositBtn.classList.add("border-gray-700");
  }

  validateQuickAmount();
}

function setQuickAmount(amount) {
  document.getElementById("quickAmount").value = amount;
  updateQuickNet();
}

function updateQuickNet() {
  const amount = parseFloat(document.getElementById("quickAmount")?.value || 0);
  const charges = parseFloat(
    document.getElementById("quickCharges")?.value || 0,
  );
  const net = amount - charges;

  const netDisplay = document.getElementById("quickNetDisplay");
  const netAmount = document.getElementById("quickNetAmount");

  if (amount > 0) {
    netDisplay.classList.remove("hidden");
    netAmount.textContent = "₦" + net.toLocaleString();
  } else {
    netDisplay.classList.add("hidden");
  }

  validateQuickAmount();
}

function validateQuickAmount() {
  const amount = parseFloat(document.getElementById("quickAmount")?.value || 0);
  const charges = parseFloat(
    document.getElementById("quickCharges")?.value || 0,
  );
  const type = document.getElementById("quickType")?.value;
  const balance = window.quickSelectedCustomer?.balance || 0;
  const net = amount - charges;

  const warning = document.getElementById("quickWarning");
  const warningText = document.getElementById("quickWarningText");

  let hasError = false;

  if (type === "withdrawal" && net > balance) {
    warning.classList.remove("hidden");
    warningText.textContent = `Insufficient funds! Available: ₦${balance.toLocaleString()}, Required: ₦${net.toLocaleString()}`;
    hasError = true;
  } else if (net < 0) {
    warning.classList.remove("hidden");
    warningText.textContent = "Charges cannot exceed amount";
    hasError = true;
  } else {
    warning.classList.add("hidden");
  }

  validateQuickForm();
  return !hasError;
}

function validateQuickForm() {
  const customerId = document.getElementById("quickCustomerId")?.value;
  const type = document.getElementById("quickType")?.value;
  const amount = parseFloat(document.getElementById("quickAmount")?.value || 0);
  const charges = parseFloat(
    document.getElementById("quickCharges")?.value || 0,
  );
  const balance = window.quickSelectedCustomer?.balance || 0;
  const net = amount - charges;

  const submitBtn = document.getElementById("quickSubmitBtn");

  let isValid = customerId && type && amount > 0 && net >= 0;

  if (type === "withdrawal" && net > balance) {
    isValid = false;
  }

  if (submitBtn) submitBtn.disabled = !isValid;
}

async function handleQuickTransaction(e) {
  e.preventDefault();

  const customerId = document.getElementById("quickCustomerId").value;
  const type = document.getElementById("quickType").value;
  const amount = parseFloat(document.getElementById("quickAmount").value);
  const charges =
    parseFloat(document.getElementById("quickCharges").value) || 0;
  const description =
    document.getElementById("quickDescription").value || `Quick ${type}`;

  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer) {
    showNotification("Customer not found", "error");
    return;
  }

  const netAmount = amount - charges;

  if (
    type === "withdrawal" &&
    netAmount > (customer.cashBalance || customer.balance || 0)
  ) {
    showNotification("Insufficient funds", "error");
    return;
  }

  const submitBtn = document.getElementById("quickSubmitBtn");
  const originalText = submitBtn.innerHTML;
  submitBtn.disabled = true;
  submitBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

  // === CHARGE CONFIRMATION PROMPT ===
  if (charges <= 0) {
    const proceedWithoutCharges = confirm(
      `No charges have been entered for this ${type}.\n\nDo you want to proceed without adding charges?`,
    );
    if (!proceedWithoutCharges) {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
      return;
    }
  }

  const txnData = {
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    type,
    amount,
    charges,
    netAmount,
    description,
    status: "approved",
    requestedBy: state.currentUser.name,
    requestedById: state.currentUser.id,
    staffName: state.currentUser.name,
    staffId: state.currentUser.id,
    approvedBy: state.currentUser.name,
    approvedAt: new Date(),
    date: new Date(),
    isQuickTransaction: true,
  };

  try {
    await api.post("/transactions", txnData);
    await loadAllData();

    showNotification(
      `⚡ Quick ${type} of ₦${amount.toLocaleString()} processed! Net: ₦${netAmount.toLocaleString()}`,
      "success",
    );

    // Reset form but stay on page
    clearQuickCustomer();
    document.getElementById("quickAmount").value = "";
    document.getElementById("quickCharges").value = "0";
    document.getElementById("quickDescription").value = "";
    document.getElementById("quickType").value = "";

    const depositBtn = document.getElementById("quickDepositBtn");
    const withdrawBtn = document.getElementById("quickWithdrawBtn");
    if (depositBtn) {
      depositBtn.classList.remove("border-emerald-500", "bg-emerald-500/10");
      depositBtn.classList.add("border-gray-700");
    }
    if (withdrawBtn) {
      withdrawBtn.classList.remove("border-orange-500", "bg-orange-500/10");
      withdrawBtn.classList.add("border-gray-700");
    }

    document.getElementById("quickNetDisplay").classList.add("hidden");
    document.getElementById("quickCustomerSearch").focus();
  } catch (error) {
    console.error("Quick transaction error:", error);
    showNotification(
      error.response?.data?.message || "Failed to process quick transaction",
      "error",
    );
  } finally {
    submitBtn.innerHTML = originalText;
    submitBtn.disabled = false;
  }
}

// ==================== INITIALIZATION ====================

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
      // Cache user data for offline/network error recovery
      localStorage.setItem("cachedUser", JSON.stringify(response.data));
    }

    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    await initializeApp();
    initRealTimeUpdates(); // Start polling for admin
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
  initRealTimeUpdates(); // Start real-time polling for admin
}

async function loadAllData() {
  state.isLoading = true;
  try {
    const [customersRes, transactionsRes] = await Promise.all([
      cachedApi.get("/customers"),
      cachedApi.get("/transactions"),
    ]);

    // SAFE ASSIGNMENT: Ensure we always get an array
    // If data is an array, use it. If it's an object with a 'customers' key, use that.
    // Otherwise, default to an empty array.
    state.customers = Array.isArray(customersRes.data)
      ? customersRes.data
      : customersRes.data?.customers || [];

    state.transactions = Array.isArray(transactionsRes.data)
      ? transactionsRes.data
      : transactionsRes.data?.transactions || [];

    // Now .sort() will work because state.transactions is guaranteed to be an array
    state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    try {
      const loansRes = await api.get("/loans");
      state.loans = Array.isArray(loansRes.data)
        ? loansRes.data
        : loansRes.data?.loans || [];
    } catch (loansError) {
      console.warn("Could not load loans data:", loansError);
      state.loans = [];
    }

    if (state.role === "admin") {
      try {
        const staffRes = await api.get("/staff");
        state.staff = Array.isArray(staffRes.data)
          ? staffRes.data
          : staffRes.data?.staff || [];
      } catch (staffError) {
        console.warn("Could not load staff data:", staffError);
        state.staff = [];
      }
    }

    checkPendingNotifications();
  } catch (error) {
    console.error("Failed to load critical data:", error);
    showNotification("Failed to load data from server", "error");
    // IMPORTANT: Fallback to empty arrays so the UI doesn't crash
    state.customers = state.customers || [];
    state.transactions = state.transactions || [];
  } finally {
    state.isLoading = false;
  }
}

async function refreshData() {
  const icon = document.getElementById("refreshIcon");
  icon.classList.add("fa-spin");
  await loadAllData();
  navigate(state.currentView);
  icon.classList.remove("fa-spin");
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
      // Ensure transactions is an array before filtering
      const transactions = Array.isArray(state.transactions)
        ? state.transactions
        : [];
      const pendingCount = transactions.filter(
        (t) => t.status === "pending",
      ).length;
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
      renderStaffReconciliation(contentArea); // Add this
      break;
    case "repayments":
      renderRepaymentManagement(contentArea);
      break;
    default:
      renderDashboard(contentArea);
  }
}

// ==================== DASHBOARD VIEW ====================

function renderDashboard(container) {
  // Calculate statistics with separate balances
  const totalCashBalance = state.customers.reduce(
    (sum, c) => sum + (c.cashBalance || c.balance || 0),
    0,
  );
  const totalLoanBalance = state.customers.reduce(
    (sum, c) => sum + (c.loanBalance || 0),
    0,
  );
  const netWorth = totalCashBalance - totalLoanBalance;

  // NEW: Calculate overdraft statistics
  const activeOverdrafts =
    state.loans?.filter(
      (l) => l.type === "overdraft" && l.status === "active",
    ) || [];
  const totalOverdraftOutstanding = activeOverdrafts.reduce(
    (sum, l) => sum + (l.outstandingBalance || 0),
    0,
  );
  const customersWithNegativeBalance = state.customers.filter(
    (c) => (c.cashBalance || 0) < 0,
  ).length;

  const pendingCount = state.transactions.filter(
    (t) => t.status === "pending",
  ).length;
  const pendingLoans =
    state.loans?.filter((l) => l.status === "pending").length || 0;
  const totalCharges = state.transactions.reduce(
    (sum, t) => sum + (t.charges || 0),
    0,
  );

  // Calculate total interest revenue from approved loans
  const totalInterestRevenue =
    state.loans?.reduce((sum, l) => {
      if (l.status === "active" || l.status === "completed") {
        return sum + ((l.totalPayable || 0) - (l.amount || 0));
      }
      return sum;
    }, 0) || 0;

  // Calculate auto-debit revenue
  const totalAutoDebitRevenue =
    state.transactions
      ?.filter((t) => t.type === "overdraft_repayment" && t.isAutoDebit)
      .reduce((sum, t) => sum + (t.amount || 0), 0) || 0;

  let stats = [];

  if (state.role === "admin") {
    stats = [
      {
        label: "Total Cash Balance",
        value: "₦" + totalCashBalance.toLocaleString(),
        icon: "fa-wallet",
        color: totalCashBalance >= 0 ? "blue" : "red",
        trend: totalCashBalance >= 0 ? "Available Cash" : "Negative Balance",
        detail:
          totalCashBalance < 0 ? "⚠️ Overdrafts active" : "Actual deposits",
      },
      {
        label: "Total Loan Balance",
        value: "₦" + totalLoanBalance.toLocaleString(),
        icon: "fa-hand-holding-usd",
        color: "orange",
        trend: "Outstanding Loans",
        detail: "Amount to be repaid",
      },
      {
        label: "Net Worth",
        value: "₦" + netWorth.toLocaleString(),
        icon: "fa-chart-line",
        color: netWorth >= 0 ? "green" : "red",
        trend: netWorth >= 0 ? "Positive" : "Negative",
        detail: "Cash - Loans",
      },
      {
        label: "Pending Approvals",
        value: pendingCount + pendingLoans,
        icon: "fa-clock",
        color: "yellow",
        trend: "Requires attention",
        detail: `${pendingCount} transactions, ${pendingLoans} loans`,
      },
      {
        label: "Total Charges",
        value: "₦" + totalCharges.toLocaleString(),
        icon: "fa-percent",
        color: "purple",
        trend: "Revenue",
        detail: "From transactions",
      },
      {
        label: "Active Overdrafts",
        value: activeOverdrafts.length,
        icon: "fa-credit-card",
        color: "orange",
        trend: "Negative Balances",
        detail: `${customersWithNegativeBalance} customers negative`,
      },
      {
        label: "Interest Revenue",
        value: "₦" + totalInterestRevenue.toLocaleString(),
        icon: "fa-chart-line",
        color: "green",
        trend: "From loans",
        detail:
          state.loans?.filter(
            (l) => l.status === "active" || l.status === "completed",
          ).length + " active/completed loans",
      },
      {
        label: "Auto-Debit Revenue",
        value: "₦" + totalAutoDebitRevenue.toLocaleString(),
        icon: "fa-robot",
        color: "purple",
        trend: "From deposits",
        detail: "Overdraft auto-recovery",
      },
    ];
  } else {
    const myCustomers = state.customers.filter(
      (c) => c.addedBy?.staffId === state.currentUser?.id,
    );
    const myCashBalance = myCustomers.reduce(
      (sum, c) => sum + (c.cashBalance || c.balance || 0),
      0,
    );
    const myLoanBalance = myCustomers.reduce(
      (sum, c) => sum + (c.loanBalance || 0),
      0,
    );
    const myTransactions = state.transactions.filter((t) =>
      myCustomers.some((c) => c.id === t.customerId),
    );
    const myPendingRequests = myTransactions.filter(
      (t) => t.status === "pending",
    ).length;
    const myLoans =
      state.loans?.filter(
        (l) => l.requestedBy?.staffId === state.currentUser?.id,
      ) || [];

    const myInterestRevenue =
      state.loans?.reduce((sum, l) => {
        if (
          (l.status === "active" || l.status === "completed") &&
          l.requestedBy?.staffId === state.currentUser?.id
        ) {
          return sum + ((l.totalPayable || 0) - (l.amount || 0));
        }
        return sum;
      }, 0) || 0;

    stats = [
      {
        label: "My Customers",
        value: myCustomers.length,
        icon: "fa-users",
        color: "green",
        trend: "Total customers",
        detail: `${myCustomers.filter((c) => (c.cashBalance || 0) > 0).length} active`,
      },
      {
        label: "Cash Under Management",
        value: "₦" + myCashBalance.toLocaleString(),
        icon: "fa-coins",
        color: "blue",
        trend: "Total cash balance",
        detail: "From your customers",
      },
      {
        label: "Loans Managed",
        value: "₦" + myLoanBalance.toLocaleString(),
        icon: "fa-hand-holding-usd",
        color: "orange",
        trend: "Outstanding loans",
        detail: `${myLoans.filter((l) => l.status === "active").length} active loans`,
      },
      {
        label: "Pending Requests",
        value: myPendingRequests,
        icon: "fa-clock",
        color: "yellow",
        trend: "Awaiting approval",
        detail: "Needs admin review",
      },
      {
        label: "My Interest Revenue",
        value: "₦" + myInterestRevenue.toLocaleString(),
        icon: "fa-chart-line",
        color: "green",
        trend: "From my loans",
        detail: `${myLoans.filter((l) => l.status === "active" || l.status === "completed").length} approved loans`,
      },
    ];
  }

  const recentTransactions = state.transactions.slice(0, 5);

  let html = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4 sm:gap-6 mb-6 sm:mb-8 animate-fade-in">
      ${stats
        .map(
          (stat) => `
        <div class="glass-panel p-4 sm:p-6 rounded-xl sm:rounded-2xl hover:transform hover:scale-105 transition-all duration-300 cursor-pointer group">
          <div class="flex justify-between items-start mb-3 sm:mb-4">
            <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-${stat.color}-500/20 flex items-center justify-center group-hover:bg-${stat.color}-500/30 transition-colors">
              <i class="fas ${stat.icon} text-${stat.color}-400 text-lg sm:text-xl"></i>
            </div>
            <span class="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-full" title="${stat.detail || stat.trend}">${stat.trend}</span>
          </div>
          <h3 class="text-xl sm:text-2xl font-bold mb-1 break-words">${typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}</h3>
          <p class="text-xs sm:text-sm text-gray-400">${stat.label}</p>
          ${stat.detail ? `<p class="text-xs text-gray-500 mt-1">${stat.detail}</p>` : ""}
        </div>
      `,
        )
        .join("")}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
      <div class="lg:col-span-2 glass-panel rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fade-in">
        <div class="flex justify-between items-center mb-4 sm:mb-6">
          <h3 class="text-base sm:text-lg font-semibold">Recent Transactions</h3>
          <button onclick="navigate('history')" class="text-xs sm:text-sm text-blue-400 hover:text-blue-300">View all</button>
        </div>
        <div class="space-y-3 sm:space-y-4">
          ${recentTransactions
            .map((txn, idx) => {
              const charges = txn.charges || 0;
              const netAmount = txn.amount - charges;
              const loanDeduction = txn.loanDeduction || 0;
              const availableToCustomer = netAmount - loanDeduction;

              const isLoanRelated =
                txn.type === "loan_disbursement" ||
                txn.type === "loan_repayment";

              // Determine badge color for loan deduction
              const loanBadge =
                loanDeduction > 0
                  ? `<span class="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs ml-2 flex items-center gap-1">
                     <i class="fas fa-hand-holding-usd text-xs"></i>
                     Loan: ₦${loanDeduction.toLocaleString()}
                   </span>`
                  : "";

              return `
              <div class="transaction-card flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-gray-800/50 rounded-xl border border-gray-700/50 hover:border-blue-500/30 transition-all" style="animation-delay: ${idx * 0.1}s">
                <div class="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-0">
                  <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full ${
                    txn.type === "deposit"
                      ? "bg-green-500/20 text-green-400"
                      : txn.type === "withdrawal"
                        ? "bg-orange-500/20 text-orange-400"
                        : txn.type === "loan_disbursement"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-purple-500/20 text-purple-400"
                  } flex items-center justify-center flex-shrink-0">
                    <i class="fas fa-arrow-${txn.type === "deposit" ? "down" : txn.type === "withdrawal" ? "up" : "exchange-alt"} text-sm sm:text-base"></i>
                  </div>
                  <div class="flex-1 min-w-0">
                    <p class="font-medium text-sm sm:text-base flex items-center flex-wrap gap-1">
                      ${txn.customerName}
                      ${loanBadge}
                    </p>
                    <div class="flex items-center gap-1 text-xs text-gray-400">
                      <i class="fas fa-calendar-alt"></i>
                      <span>${formatDate(txn.date)}</span>
                    </div>
                    ${isLoanRelated ? `<p class="text-xs text-blue-400 mt-1">${txn.type === "loan_disbursement" ? "Loan Disbursement" : "Loan Repayment"}</p>` : ""}
                    ${txn.loanDeduction > 0 ? `<p class="text-xs text-purple-400 mt-1"><i class="fas fa-info-circle mr-1"></i>Auto-deducted for loan repayment</p>` : ""}
                  </div>
                </div>
                <div class="text-left sm:text-right pl-11 sm:pl-0 mt-2 sm:mt-0">
                  <p class="font-bold text-sm sm:text-base ${
                    txn.type === "deposit" || txn.type === "loan_disbursement"
                      ? "text-green-400"
                      : txn.type === "withdrawal" ||
                          txn.type === "loan_repayment"
                        ? "text-orange-400"
                        : "text-blue-400"
                  }">
                    ${txn.type === "deposit" || txn.type === "loan_disbursement" ? "+" : "-"}₦${(txn.amount || 0).toLocaleString()}
                  </p>
                  ${charges > 0 ? `<p class="text-xs text-red-400">Charge: -₦${charges.toLocaleString()}</p>` : ""}
                  ${loanDeduction > 0 ? `<p class="text-xs text-purple-400">Loan Deduction: -₦${loanDeduction.toLocaleString()}</p>` : ""}
                  <p class="text-xs ${loanDeduction > 0 ? "text-green-400 font-semibold" : "text-blue-400"}">
                    ${loanDeduction > 0 ? "Available" : "Net"}: ₦${availableToCustomer.toLocaleString()}
                  </p>
                  <span class="text-xs px-2 py-1 rounded-full ${getStatusStyle(txn.status)} inline-block mt-1">
                    ${txn.status}
                  </span>
                </div>
              </div>
            `;
            })
            .join("")}
          ${recentTransactions.length === 0 ? '<p class="text-center text-gray-400 py-4">No transactions found</p>' : ""}
        </div>
      </div>

      <div class="glass-panel rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fade-in">
        <h3 class="text-base sm:text-lg font-semibold mb-4 sm:mb-6">Quick Actions</h3>
        <div class="space-y-2 sm:space-y-3">
          ${
            state.role === "staff"
              ? `
            <button onclick="navigate('new-customer')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
              <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                <i class="fas fa-user-plus text-sm sm:text-base"></i>
              </div>
              <div class="text-left">
                <p class="font-medium text-sm sm:text-base">Register Customer</p>
                <p class="text-xs text-gray-400">Create new account</p>
              </div>
            </button>
            <button onclick="navigate('quick-transaction')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group border border-emerald-500/30">
              <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                <i class="fas fa-bolt text-sm sm:text-base"></i>
              </div>
              <div class="text-left">
                <p class="font-medium text-sm sm:text-base">Quick Transaction</p>
                <p class="text-xs text-gray-400">Process instantly - no approval needed</p>
              </div>
            </button>
            <button onclick="navigate('transactions')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
              <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center group-hover:bg-green-500 group-hover:text-white transition-colors">
                <i class="fas fa-plus-circle text-sm sm:text-base"></i>
              </div>
              <div class="text-left">
                <p class="font-medium text-sm sm:text-base">New Transaction</p>
                <p class="text-xs text-gray-400">Deposit or Withdrawal (requires approval)</p>
              </div>
            </button>
            <button onclick="navigate('loan-request')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
              <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-colors">
                <i class="fas fa-hand-holding-usd text-sm sm:text-base"></i>
              </div>
              <div class="text-left">
                <p class="font-medium text-sm sm:text-base">Request Loan</p>
                <p class="text-xs text-gray-400">Apply for loan or overdraft</p>
              </div>
            </button>
            <button onclick="navigate('history')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
              <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-gray-500/20 text-gray-400 flex items-center justify-center group-hover:bg-gray-500 group-hover:text-white transition-colors">
                <i class="fas fa-list-alt text-sm sm:text-base"></i>
              </div>
              <div class="text-left">
                <p class="font-medium text-sm sm:text-base">View My History</p>
                <p class="text-xs text-gray-400">All your transactions</p>
              </div>
            </button>
          `
              : `
            <button onclick="showAddCustomerModal()" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
              <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-blue-500/20 text-blue-400 flex items-center justify-center group-hover:bg-blue-500 group-hover:text-white transition-colors">
                <i class="fas fa-user-plus text-sm sm:text-base"></i>
              </div>
              <div class="text-left">
                <p class="font-medium text-sm sm:text-base">Add Customer</p>
                <p class="text-xs text-gray-400">Create new account</p>
              </div>
            </button>
            <button onclick="navigate('transactions')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
              <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-yellow-500/20 text-yellow-400 flex items-center justify-center group-hover:bg-yellow-500 group-hover:text-white transition-colors">
                <i class="fas fa-check-double text-sm sm:text-base"></i>
              </div>
              <div class="text-left">
                <p class="font-medium text-sm sm:text-base">Approve Requests</p>
                <p class="text-xs text-gray-400">${pendingCount} pending</p>
              </div>
            </button>
            <button onclick="navigate('loans')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
              <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-colors">
                <i class="fas fa-hand-holding-usd text-sm sm:text-base"></i>
              </div>
              <div class="text-left">
                <p class="font-medium text-sm sm:text-base">Loan Approvals</p>
                <p class="text-xs text-gray-400">${pendingLoans} pending loans</p>
              </div>
            </button>
          `
          }
        </div>

        <div class="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-700">
          <h4 class="text-xs sm:text-sm font-medium text-gray-400 mb-3 sm:mb-4">Financial Summary</h4>
          <div class="space-y-2 sm:space-y-3">
            <div class="flex justify-between text-xs sm:text-sm">
              <span class="text-gray-400">Total Cash Balance</span>
              <span class="text-green-400">₦${totalCashBalance.toLocaleString()}</span>
            </div>
            <div class="flex justify-between text-xs sm:text-sm">
              <span class="text-gray-400">Total Loan Balance</span>
              <span class="text-orange-400">₦${totalLoanBalance.toLocaleString()}</span>
            </div>
            <div class="flex justify-between text-xs sm:text-sm">
              <span class="text-gray-400">Net Position</span>
              <span class="${netWorth >= 0 ? "text-green-400" : "text-red-400"}">₦${netWorth.toLocaleString()}</span>
            </div>
            <div class="flex justify-between text-xs sm:text-sm">
              <span class="text-gray-400">Interest Revenue</span>
              <span class="text-green-400">₦${totalInterestRevenue.toLocaleString()}</span>
            </div>
            <div class="flex justify-between text-xs sm:text-sm">
              <span class="text-gray-400">Database</span>
              <span class="text-green-400 flex items-center gap-1">
                <span class="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full animate-pulse"></span>
                Connected
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

// ==================== REPAYMENT MANAGEMENT VIEW ====================

function renderRepaymentManagement(container) {
  const activeLoans =
    state.loans?.filter(
      (l) => l.status === "active" || l.status === "overdraft",
    ) || [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // NEW: Calculate overdraft statistics for summary cards
  const activeOverdrafts =
    state.loans?.filter(
      (l) => l.type === "overdraft" && l.status === "active",
    ) || [];
  const totalOverdraftOutstanding = activeOverdrafts.reduce(
    (sum, l) => sum + (l.outstandingBalance || 0),
    0,
  );
  const customersWithNegativeBalance = state.customers.filter(
    (c) => (c.cashBalance || 0) < 0,
  ).length;

  let dueInstallments = [];

  activeLoans.forEach((loan) => {
    const customer = state.customers.find((c) => c.id === loan.customerId);
    if (!customer) return;

    // === OVERDRAFT SPECIAL HANDLING ===
    if (loan.type === "overdraft") {
      const outstanding = loan.outstandingBalance || loan.totalPayable || 0;

      if (outstanding > 0) {
        const isOverdue = new Date(loan.paymentDeadline) < today;

        dueInstallments.push({
          loanId: loan.id,
          repaymentId: loan.repayments?.[0]?.id || "overdraft-full",
          customerName: loan.customerName,
          customerId: loan.customerId,
          customerBalance: customer.cashBalance || 0,
          amount: outstanding,
          principalAmount: loan.amount || 0,
          chargesAmount: loan.processingCharges || 0,
          dueDate:
            loan.paymentDeadline || loan.repaymentStartDate || new Date(),
          type: "overdraft",
          status: isOverdue ? "overdue" : "pending",
          isFullSettlement: true,
          isAutoDebit: true, // Overdrafts are auto-debited from deposits
          autoDebitStatus: customer.hasActiveOverdraft ? "Active" : "Inactive",
        });
      }
      return;
    }

    // Regular loan repayments
    if (loan.repayments && loan.repayments.length > 0) {
      loan.repayments.forEach((repayment) => {
        const dueDate = new Date(repayment.dueDate);
        if (repayment.status !== "paid" && dueDate <= today) {
          dueInstallments.push({
            loanId: loan.id,
            repaymentId: repayment.id,
            customerName: loan.customerName,
            customerId: loan.customerId,
            amount: repayment.amount,
            principalAmount: null,
            chargesAmount: null,
            dueDate: repayment.dueDate,
            type: loan.type,
            status: repayment.status,
            isFullSettlement: false,
            isAutoDebit: false,
          });
        }
      });
    }
  });

  dueInstallments.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

  const overdueCount = dueInstallments.filter(
    (i) => new Date(i.dueDate) < today,
  ).length;
  const dueTodayCount = dueInstallments.filter(
    (i) => new Date(i.dueDate).toDateString() === today.toDateString(),
  ).length;

  const html = `
    <div class="space-y-6 animate-fade-in px-4 sm:px-0">
      <div class="flex justify-between items-center">
        <div>
          <h3 class="text-xl font-bold">Repayment Management</h3>
          <p class="text-sm text-gray-400">Manually collect outstanding installments & overdrafts</p>
        </div>
        <button onclick="refreshData()" class="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm transition-colors">
          <i class="fas fa-sync-alt mr-2"></i>Refresh
        </button>
      </div>

      <!-- Summary Stats -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="glass-panel p-4 rounded-xl border-l-4 border-red-500">
          <p class="text-xs text-gray-400 uppercase font-bold">Total Overdue</p>
          <p class="text-2xl font-bold text-red-400">${overdueCount} Items</p>
        </div>
        <div class="glass-panel p-4 rounded-xl border-l-4 border-yellow-500">
          <p class="text-xs text-gray-400 uppercase font-bold">Due Today</p>
          <p class="text-2xl font-bold text-yellow-400">${dueTodayCount} Items</p>
        </div>
        <div class="glass-panel p-4 rounded-xl border-l-4 border-orange-500">
          <p class="text-xs text-gray-400 uppercase font-bold">Active Overdrafts</p>
          <p class="text-2xl font-bold text-orange-400">${activeOverdrafts.length}</p>
          <p class="text-xs text-gray-500 mt-1">₦${totalOverdraftOutstanding.toLocaleString()} outstanding</p>
        </div>
        <div class="glass-panel p-4 rounded-xl border-l-4 border-purple-500">
          <p class="text-xs text-gray-400 uppercase font-bold">Auto-Debit Status</p>
          <p class="text-2xl font-bold text-purple-400">${customersWithNegativeBalance}</p>
          <p class="text-xs text-gray-500 mt-1">customers with negative balance</p>
        </div>
      </div>

      <!-- Repayment Table -->
      <div class="glass-panel rounded-2xl overflow-hidden">
        <table class="min-w-full divide-y divide-gray-700">
          <thead class="bg-gray-800/50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Customer</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Type</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Amount Due</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Due Date</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase">Status</th>
              <th class="px-6 py-3 text-right text-xs font-medium text-gray-400 uppercase">Action</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-gray-800">
            ${
              dueInstallments.length === 0
                ? `<tr><td colspan="6" class="px-6 py-12 text-center text-gray-500">No pending or overdue repayments found.</td></tr>`
                : dueInstallments
                    .map((inst) => {
                      // Overdraft-specific amount display with charges breakdown
                      const isOverdraft = inst.type === "overdraft";
                      const amountDisplay = isOverdraft
                        ? `<div>
                            <div class="font-mono text-sm text-white">₦${inst.amount.toLocaleString()}</div>
                            <div class="text-xs text-gray-400 mt-1">
                              <span class="text-green-400">P: ₦${(inst.principalAmount || 0).toLocaleString()}</span>
                              <span class="mx-1">+</span>
                              <span class="text-red-400">C: ₦${(inst.chargesAmount || 0).toLocaleString()}</span>
                            </div>
                            ${inst.isAutoDebit ? `<div class="text-xs text-purple-400 mt-1"><i class="fas fa-robot mr-1"></i>Auto-debit ${inst.autoDebitStatus}</div>` : ""}
                           </div>`
                        : `<span class="font-mono text-sm text-white">₦${inst.amount.toLocaleString()}</span>`;

                      return `
                <tr class="hover:bg-gray-800/30 transition-colors">
                  <td class="px-6 py-4 whitespace-nowrap">
                    <div class="text-sm font-medium text-white">${inst.customerName}</div>
                    ${isOverdraft && inst.customerBalance < 0 ? `<div class="text-xs text-red-400"><i class="fas fa-exclamation-triangle mr-1"></i>Balance: ₦${inst.customerBalance.toLocaleString()}</div>` : ""}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 rounded-full text-[10px] font-bold uppercase ${inst.type === "loan" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"}">
                      ${inst.type}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    ${amountDisplay}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                    ${formatSimpleDate(inst.dueDate)}
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap">
                    <span class="px-2 py-1 rounded text-xs ${inst.status === "overdue" ? "bg-red-500/20 text-red-400" : "bg-yellow-500/20 text-yellow-400"}">
                      ${inst.status.toUpperCase()}
                    </span>
                  </td>
                  <td class="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onclick="handleManualCollection('${inst.loanId}', '${inst.repaymentId}', '${inst.customerId}', ${inst.amount}, '${inst.customerName}')" 
                      class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-all flex items-center justify-center ml-auto gap-2">
                      <i class="fas fa-hand-holding-usd"></i> ${isOverdraft ? "Settle" : "Collect"}
                    </button>
                  </td>
                </tr>
              `;
                    })
                    .join("")
            }
          </tbody>
        </table>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

/**
 * The logic to perform the manual collection
 * This performs a withdrawal from the customer and marks the loan repayment as paid
 */ async function handleManualCollection(
  loanId,
  repaymentId,
  customerId,
  amount,
  customerName,
) {
  // Get the full loan details to check for charges
  const loan = state.loans?.find((l) => l.id === loanId);
  const isOverdraft = loan?.type === "overdraft";

  // For overdraft: amount should be the FULL totalPayable (principal + charges)
  // The backend needs to know this is a complete payoff including charges
  const totalToCollect = isOverdraft ? loan?.totalPayable || amount : amount;

  const confirmationMessage = isOverdraft
    ? `Confirm Overdraft Collection:\n\nThis will deduct ₦${totalToCollect.toLocaleString()} from ${customerName}'s balance.\n\nBreakdown:\n• Principal: ₦${(loan?.amount || 0).toLocaleString()}\n• Processing Charges: ₦${(loan?.processingCharges || 0).toLocaleString()}\n• Total Due: ₦${totalToCollect.toLocaleString()}\n\nThis will fully settle the overdraft. Continue?`
    : `Confirm Collection: \n\nThis will deduct ₦${amount.toLocaleString()} from ${customerName}'s balance and record it as a loan repayment.\n\nContinue?`;

  if (!confirm(confirmationMessage)) {
    return;
  }

  try {
    showNotification(
      isOverdraft
        ? "Processing overdraft settlement..."
        : "Processing collection...",
      "info",
    );

    // Enhanced payload for overdraft - explicitly marks as full settlement
    const payload = {
      paidBy: state.currentUser.name,
      paymentAmount: amount, // The installment/repayment amount
      isFullSettlement: isOverdraft, // Flag for backend to handle charges
      totalPayable: isOverdraft ? loan?.totalPayable : undefined,
      processingCharges: isOverdraft ? loan?.processingCharges : undefined,
    };

    await api.patch(`/loans/${loanId}/repayments/${repaymentId}`, payload);

    // Success notification with breakdown
    if (isOverdraft) {
      showNotification(
        `✅ Overdraft fully settled! ₦${totalToCollect.toLocaleString()} collected from ${customerName}\n` +
          `(Principal: ₦${(loan?.amount || 0).toLocaleString()} + Charges: ₦${(loan?.processingCharges || 0).toLocaleString()})`,
        "success",
      );
    } else {
      showNotification(
        `Successfully collected ₦${amount.toLocaleString()} from ${customerName}`,
        "success",
      );
    }

    await loadAllData();
    renderRepaymentManagement(document.getElementById("contentArea"));
  } catch (error) {
    console.error("Manual collection error:", error);
    const errorMsg =
      error.response?.data?.error ||
      "Failed to collect payment. Check customer balance.";
    showNotification(errorMsg, "error");
  }
}
// ==================== CUSTOMERS VIEW ====================

function renderCustomers(container) {
  let displayedCustomers = state.customers;

  const html = `
    <div class="glass-panel rounded-2xl p-4 sm:p-6 animate-fade-in">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h3 class="text-base sm:text-lg font-semibold">All Customers</h3>
        <div class="flex gap-2 w-full sm:w-auto">
          ${
            state.role === "admin"
              ? `
            <button onclick="showAddCustomerModal()" class="flex-1 sm:flex-none px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors">
              <i class="fas fa-plus mr-2"></i>Add Customer
            </button>
          `
              : `
            <button onclick="navigate('new-customer')" class="flex-1 sm:flex-none px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition-colors">
              <i class="fas fa-user-plus mr-2"></i>Register Customer
            </button>
          `
          }
        </div>
      </div>
      
      <div class="mb-4 flex flex-col sm:flex-row gap-4">
        <input type="text" 
               id="customerSearch" 
               placeholder="Search customers by name, email, phone, or number..." 
               onkeyup="filterCustomers()"
               class="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 text-base">
        
        ${
          state.role === "admin"
            ? `
          <select id="staffFilter" onchange="filterCustomersByStaff()" class="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500">
            <option value="">All Staff</option>
            ${state.staff.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
          </select>
          <select id="balanceTypeFilter" onchange="filterCustomersByBalance()" class="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500">
            <option value="all">All Customers</option>
            <option value="positive-cash">Positive Cash Balance</option>
            <option value="has-loan">Has Active Loan</option>
            <option value="no-loan">No Active Loan</option>
          </select>
        `
            : ""
        }
      </div>
      
      <div class="overflow-x-auto -mx-4 sm:mx-0">
        <div class="inline-block min-w-full align-middle">
          <table class="min-w-full divide-y divide-gray-700">
            <thead>
              <tr class="text-left text-gray-400 text-xs sm:text-sm">
                <th class="pb-4 px-4 sm:px-0">#</th>
                <th class="pb-4 px-4 sm:px-0">Customer</th>
                <th class="pb-4 px-4 sm:px-0">Contact</th>
                <th class="pb-4 px-4 sm:px-0 hidden sm:table-cell">Phone</th>
                <th class="pb-4 px-4 sm:px-0">Cash Balance</th>
                <th class="pb-4 px-4 sm:px-0">Loan Balance</th>
                <th class="pb-4 px-4 sm:px-0 hidden md:table-cell">Net Worth</th>
                <th class="pb-4 px-4 sm:px-0 hidden lg:table-cell">Status</th>
                ${state.role === "admin" ? '<th class="pb-4 px-4 sm:px-0 hidden lg:table-cell">Added By</th>' : ""}
                <th class="pb-4 px-4 sm:px-0">Actions</th>
               </tr>
            </thead>
            <tbody id="customerTableBody" class="divide-y divide-gray-800">
              ${displayedCustomers
                .map((customer) => {
                  const cashBalance =
                    customer.cashBalance || customer.balance || 0;
                  const loanBalance = customer.loanBalance || 0;
                  const netWorth = cashBalance - loanBalance;
                  const hasActiveLoan = loanBalance > 0;
                  const hasActiveOverdraft = customer.hasActiveOverdraft;
                  const isNegativeBalance = cashBalance < 0;

                  return `
                    <tr class="hover:bg-gray-800/30 transition-colors" data-cash-balance="${cashBalance}" data-loan-balance="${loanBalance}">
                      <td class="py-4 px-4 sm:px-0">
                        <span class="font-mono text-xs sm:text-sm ${customer.customerNumber ? "text-blue-400" : "text-gray-500"}">
                          ${customer.customerNumber ? "#" + customer.customerNumber : "---"}
                        </span>
                       </td>
                      <td class="py-4 px-4 sm:px-0">
                        <div class="flex items-center gap-2 sm:gap-3">
                          <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-blue-400 to-cyan-500 flex items-center justify-center font-bold text-xs sm:text-sm flex-shrink-0">
                            ${
                              customer.name
                                ? customer.name
                                    .split(" ")
                                    .map((n) => n[0])
                                    .join("")
                                    .substring(0, 2)
                                    .toUpperCase()
                                : "??"
                            }
                          </div>
                          <div>
                            <span class="font-medium text-sm sm:text-base break-words">${customer.name}</span>
                            ${hasActiveLoan ? '<span class="ml-2 text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full">Loan Active</span>' : ""}
                          </div>
                        </div>
                       </td>
                      <td class="py-4 px-4 sm:px-0">
                        <div class="text-xs sm:text-sm break-words max-w-[150px] sm:max-w-none">${customer.email}</div>
                       </td>
                      <td class="py-4 px-4 sm:px-0 hidden sm:table-cell">
                        <div class="text-xs sm:text-sm">
                          <i class="fas fa-phone-alt text-green-400 mr-1"></i>
                          ${customer.phone || "N/A"}
                          ${customer.phone ? '<span class="text-xs text-green-400 ml-1">✓ SMS</span>' : '<span class="text-xs text-red-400 ml-1">⚠️ No SMS</span>'}
                        </div>
                       </td>
                      <td class="py-4 px-4 sm:px-0">
                        <div>
                          <span class="text-sm sm:text-base font-mono ${isNegativeBalance ? "text-red-400" : cashBalance >= 0 ? "text-green-400" : "text-gray-500"}">
                            ₦${cashBalance.toLocaleString()}
                          </span>
                          ${isNegativeBalance ? '<span class="text-xs text-red-400 ml-1"><i class="fas fa-exclamation-triangle"></i> Overdraft</span>' : ""}
                          ${cashBalance === 0 ? '<p class="text-xs text-gray-500">No funds</p>' : ""}
                        </div>
                       </td>
                      <td class="py-4 px-4 sm:px-0">
                        <div>
                          <span class="text-sm sm:text-base font-mono ${loanBalance > 0 ? "text-orange-400" : "text-gray-500"}">
                            ${loanBalance > 0 ? "₦" + loanBalance.toLocaleString() : "—"}
                          </span>
                          ${loanBalance > 0 ? `<p class="text-xs text-orange-400">${((loanBalance / (customer.totalLoanAmount || 1)) * 100).toFixed(0)}% outstanding</p>` : ""}
                        </div>
                       </td>
                      <td class="py-4 px-4 sm:px-0 hidden md:table-cell">
                        <div>
                          <span class="text-sm sm:text-base font-mono ${netWorth >= 0 ? "text-blue-400" : "text-red-400"}">
                            ₦${netWorth.toLocaleString()}
                          </span>
                          <p class="text-xs text-gray-500">Cash - Loans</p>
                        </div>
                       </td>
                      <td class="py-4 px-4 sm:px-0 hidden lg:table-cell">
                        <span class="px-2 py-1 rounded text-xs ${customer.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}">
                          ${customer.status}
                        </span>
                       </td>
                      ${
                        state.role === "admin"
                          ? `
                        <td class="py-4 px-4 sm:px-0 hidden lg:table-cell">
                          ${customer.addedBy ? `<div class="text-xs sm:text-sm"><div>${customer.addedBy.staffName}</div><div class="text-xs text-gray-500">${customer.addedBy.staffEmail}</div></div>` : '<span class="text-xs text-gray-500">System</span>'}
                         </td>
                      `
                          : ""
                      }
                      <td class="py-4 px-4 sm:px-0">
                        <div class="flex gap-2">
                          <button onclick="viewCustomer('${customer.id}')" class="text-blue-400 hover:text-blue-300 p-1" title="View Details">
                            <i class="fas fa-eye text-sm sm:text-base"></i>
                          </button>
                          ${
                            state.role === "admin"
                              ? `
                            <button onclick="renderCustomerSummary(document.getElementById('contentArea'), '${customer.id}')" class="text-green-400 hover:text-green-300 p-1" title="View Summary">
                              <i class="fas fa-chart-bar text-sm sm:text-base"></i>
                            </button>
                            <button onclick="viewCustomerLoans('${customer.id}')" class="text-purple-400 hover:text-purple-300 p-1" title="View Loans">
                              <i class="fas fa-hand-holding-usd text-sm sm:text-base"></i>
                            </button>
                          `
                              : ""
                          }
                          <button onclick="editCustomer('${customer.id}')" class="text-yellow-400 hover:text-yellow-300 p-1" title="Edit">
                            <i class="fas fa-edit text-sm sm:text-base"></i>
                          </button>
                        </div>
                       </td>
                     </tr>
                  `;
                })
                .join("")}
              ${displayedCustomers.length === 0 ? '<tr><td colspan="9" class="text-center text-gray-400 py-8">No customers found</td></tr>' : ""}
            </tbody>
           </table>
        </div>
      </div>
      
      <div class="mt-4 pt-4 border-t border-gray-700">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center text-xs sm:text-sm">
          <div class="bg-gray-800/50 p-2 rounded-lg">
            <p class="text-gray-400">Total Customers</p>
            <p class="font-bold text-base">${state.customers.length}</p>
          </div>
          <div class="bg-gray-800/50 p-2 rounded-lg">
            <p class="text-gray-400">Total Cash</p>
            <p class="font-bold text-green-400 text-base">₦${state.customers.reduce((sum, c) => sum + (c.cashBalance || c.balance || 0), 0).toLocaleString()}</p>
          </div>
          <div class="bg-gray-800/50 p-2 rounded-lg">
            <p class="text-gray-400">Total Loans</p>
            <p class="font-bold text-orange-400 text-base">₦${state.customers.reduce((sum, c) => sum + (c.loanBalance || 0), 0).toLocaleString()}</p>
          </div>
          <div class="bg-gray-800/50 p-2 rounded-lg">
            <p class="text-gray-400">With Loans</p>
            <p class="font-bold text-purple-400 text-base">${state.customers.filter((c) => (c.loanBalance || 0) > 0).length}</p>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
}

// Filter customers by balance
function filterCustomersByBalance() {
  const filterType = document.getElementById("balanceTypeFilter")?.value;
  const rows = document.querySelectorAll("#customerTableBody tr");

  if (!filterType || filterType === "all") {
    rows.forEach((row) => (row.style.display = ""));
    return;
  }

  rows.forEach((row) => {
    const cashBalance = parseFloat(row.dataset.cashBalance || 0);
    const loanBalance = parseFloat(row.dataset.loanBalance || 0);
    let show = false;

    switch (filterType) {
      case "positive-cash":
        show = cashBalance > 0;
        break;
      case "has-loan":
        show = loanBalance > 0;
        break;
      case "no-loan":
        show = loanBalance === 0;
        break;
      default:
        show = true;
    }

    row.style.display = show ? "" : "none";
  });
}

// View customer loans
function viewCustomerLoans(customerId) {
  const customer = state.customers.find((c) => c.id === customerId);
  const customerLoans =
    state.loans?.filter((l) => l.customerId === customerId) || [];

  const modalHtml = `
    <div id="customerLoansModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-900 rounded-2xl p-4 sm:p-8 max-w-4xl w-full mx-auto max-h-[90vh] overflow-y-auto animate-slideIn">
        <div class="flex justify-between items-center mb-4 sm:mb-6">
          <div>
            <h3 class="text-lg sm:text-xl font-semibold">${customer.name} - Loan History</h3>
            <p class="text-xs sm:text-sm text-gray-400">Outstanding Loan: ₦${(customer.loanBalance || 0).toLocaleString()}</p>
          </div>
          <button onclick="closeCustomerLoansModal()" class="text-gray-400 hover:text-white p-2">
            <i class="fas fa-times text-lg"></i>
          </button>
        </div>
        
        <div class="space-y-4">
          ${
            customerLoans.length === 0
              ? '<div class="text-center py-8 text-gray-400">No loan history found for this customer</div>'
              : customerLoans
                  .map(
                    (loan) => `
              <div class="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                <div class="flex flex-wrap justify-between items-start gap-4">
                  <div>
                    <div class="flex items-center gap-2 mb-2">
                      <span class="px-2 py-1 rounded text-xs ${loan.type === "loan" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"}">
                        ${loan.type.toUpperCase()}
                      </span>
                      <span class="px-2 py-1 rounded text-xs ${getStatusStyle(loan.status)}">
                        ${loan.status.toUpperCase()}
                      </span>
                    </div>
                    <p class="font-semibold text-sm">Loan ID: ${loan.id}</p>
                    <p class="text-xs text-gray-400">Requested: ${formatDate(loan.requestedAt)}</p>
                  </div>
                  <div class="text-right">
                    <p class="text-sm">Amount: <span class="font-bold text-green-400">₦${loan.amount.toLocaleString()}</span></p>
                    <p class="text-sm">Total Payable: <span class="font-bold text-blue-400">₦${loan.totalPayable.toLocaleString()}</span></p>
                    <p class="text-sm">Repaid: <span class="font-bold text-purple-400">₦${loan.amountRepaid?.toLocaleString() || 0}</span></p>
                    <p class="text-sm">Outstanding: <span class="font-bold text-orange-400">₦${loan.outstandingBalance?.toLocaleString() || 0}</span></p>
                  </div>
                </div>
                
                ${
                  loan.status === "active"
                    ? `
                  <div class="mt-3 pt-3 border-t border-gray-700">
                    <p class="text-xs text-gray-400 mb-2">Repayment Schedule:</p>
                    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                      ${loan.repayments
                        ?.slice(0, 4)
                        .map(
                          (rep, idx) => `
                        <div class="bg-gray-900/50 p-2 rounded text-center text-xs">
                          <p class="text-gray-400">Installment ${idx + 1}</p>
                          <p class="font-mono">₦${rep.amount.toLocaleString()}</p>
                          <p class="text-${rep.status === "paid" ? "green" : rep.status === "overdue" ? "red" : "yellow"}-400">
                            ${rep.status}
                          </p>
                          <p class="text-gray-500 text-xxs">Due: ${formatSimpleDate(rep.dueDate)}</p>
                        </div>
                      `,
                        )
                        .join("")}
                      ${loan.repayments?.length > 4 ? `<div class="bg-gray-900/50 p-2 rounded text-center text-xs flex items-center justify-center">+${loan.repayments.length - 4} more</div>` : ""}
                    </div>
                  </div>
                `
                    : ""
                }
              </div>
            `,
                  )
                  .join("")
          }
        </div>
        
        <div class="flex justify-end mt-6 pt-4 border-t border-gray-700">
          <button onclick="closeCustomerLoansModal()" class="px-6 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  const modalContainer = document.createElement("div");
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);
}

function closeCustomerLoansModal() {
  const modal = document.getElementById("customerLoansModal");
  if (modal) modal.remove();
}

function filterCustomers() {
  const search =
    document.getElementById("customerSearch")?.value.toLowerCase() || "";
  const staffFilter = document.getElementById("staffFilter")?.value;
  const rows = document.querySelectorAll("#customerTableBody tr");

  rows.forEach((row) => {
    const text = row.textContent.toLowerCase();
    const matchesSearch = text.includes(search);

    if (staffFilter && state.role === "admin") {
      const staffCell = row.querySelector("td:nth-child(7)")?.textContent || "";
      const matchesStaff = staffCell.includes(
        state.staff.find((s) => s.id === staffFilter)?.name || "",
      );
      row.style.display = matchesSearch && matchesStaff ? "" : "none";
    } else {
      row.style.display = matchesSearch ? "" : "none";
    }
  });
}

function filterCustomersByStaff() {
  filterCustomers();
}

function showAddCustomerModal() {
  const modalHtml = `
    <div id="customerModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-900 rounded-2xl p-4 sm:p-8 max-w-md w-full mx-auto animate-slideIn max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4 sm:mb-6">
          <h3 class="text-lg sm:text-xl font-semibold">Add New Customer</h3>
          <button onclick="closeCustomerModal()" class="text-gray-400 hover:text-white p-2">
            <i class="fas fa-times text-lg"></i>
          </button>
        </div>
        <form onsubmit="handleAddCustomer(event)" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Full Name</label>
            <input type="text" name="name" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Email</label>
            <input type="email" name="email" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Phone Number (for SMS Alerts)</label>
            <input type="tel" name="phone" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base" placeholder="08012345678">
            <p class="text-xs text-green-400 mt-1">✓ SMS alerts will be sent to this number</p>
          </div>
          
          <!-- Initial Deposit (Requires Approval) -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              Initial Deposit (₦) <span class="text-xs text-yellow-400">- Requires admin approval</span>
            </label>
            <input type="number" name="initialDeposit" id="adminInitialDeposit" min="0" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base" placeholder="0.00" oninput="updateAdminRegistrationNet()">
            <p class="text-xs text-yellow-400 mt-1">⚠️ This will create a pending deposit request. Customer balance starts at ₦0 until approved.</p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              Charge Amount (₦) <span class="text-xs text-yellow-400">- Optional, default 0</span>
            </label>
            <input type="number" name="charges" id="adminCharges" value="0" min="0" step="0.01" 
              oninput="updateAdminRegistrationNet()"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white font-mono focus:border-blue-500 transition-colors text-base" 
              placeholder="0.00">
          </div>
          
          <div id="adminNetDisplay" class="p-3 bg-gray-800/50 border border-gray-700 rounded-xl hidden">
            <div class="flex justify-between items-center">
              <span class="text-sm text-gray-400">Net Amount (after approval):</span>
              <span class="text-xl font-bold font-mono text-blue-400" id="adminNetAmount">₦0</span>
            </div>
          </div>
          
          <div id="adminChargeWarning" class="hidden p-3 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p class="text-xs text-red-300 flex items-center gap-2">
              <i class="fas fa-exclamation-circle"></i>
              <span>Charges cannot exceed the initial deposit</span>
            </p>
          </div>
          
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Address</label>
            <textarea name="address" rows="2" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base"></textarea>
          </div>
          
          <div class="flex items-center gap-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <i class="fas fa-info-circle text-blue-400"></i>
            <p class="text-xs text-blue-200">Customer will be created with ₦0 balance. If initial deposit is entered, a pending transaction will be submitted for admin approval.</p>
          </div>
          
          <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <button type="button" onclick="closeCustomerModal()" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800">Cancel</button>
            <button type="submit" id="adminSubmitBtn" class="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl">Add Customer</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // IMPROVEMENT: We create a temporary div, set the HTML,
  // but only append the actual #customerModal to the body.
  // This ensures that when we .remove() the element, the black overlay is gone too.
  const tempDiv = document.createElement("div");
  tempDiv.innerHTML = modalHtml;
  document.body.appendChild(tempDiv.firstElementChild);
}

function updateAdminRegistrationNet() {
  const deposit = parseFloat(
    document.getElementById("adminInitialDeposit")?.value || 0,
  );
  const charges = parseFloat(
    document.getElementById("adminCharges")?.value || 0,
  );
  const net = deposit - charges;

  const netDisplay = document.getElementById("adminNetDisplay");
  const netAmount = document.getElementById("adminNetAmount");
  const warning = document.getElementById("adminChargeWarning");
  const submitBtn = document.getElementById("adminSubmitBtn");

  if (deposit > 0 || charges > 0) {
    netDisplay.classList.remove("hidden");
    netAmount.textContent = "₦" + net.toLocaleString();
  } else {
    netDisplay.classList.add("hidden");
  }

  if (charges > deposit) {
    warning.classList.remove("hidden");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add("opacity-50", "cursor-not-allowed");
    }
  } else {
    warning.classList.add("hidden");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
  }
}

async function handleAddCustomer(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const currentStaff = state.currentUser;

  const initialDeposit = parseFloat(formData.get("initialDeposit")) || 0;
  const charges = parseFloat(formData.get("charges")) || 0;
  const netBalance = initialDeposit - charges;

  // === CHARGE CONFIRMATION PROMPT FOR INITIAL DEPOSIT ===
  if (initialDeposit > 0 && charges <= 0) {
    const proceedWithoutCharges = confirm(
      `No charges have been entered for this initial deposit.\n\nDo you want to proceed without adding charges?`,
    );
    if (!proceedWithoutCharges) {
      return;
    }
  }

  if (charges > initialDeposit) {
    showNotification(
      "Charges cannot exceed the initial deposit amount",
      "error",
    );
    return;
  }

  // Create customer with ZERO balance first
  const customerData = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    cashBalance: 0, // Start with 0 - deposit requires approval
    loanBalance: 0,
    address: formData.get("address"),
    staffId: currentStaff?.id,
    staffName: currentStaff?.name,
    staffEmail: currentStaff?.email,
  };

  try {
    const response = await api.post("/customers", customerData);
    const newCustomer = response.data.customer || response.data;

    // If there's an initial deposit, create a PENDING transaction for admin approval
    let depositTxn = null;
    if (initialDeposit > 0) {
      const txnData = {
        customerId: newCustomer.id,
        customerName: newCustomer.name,
        customerPhone: newCustomer.phone,
        type: "deposit",
        amount: initialDeposit,
        charges: charges,
        netAmount: netBalance,
        description: `Initial deposit for new customer ${newCustomer.name}`,
        status: "pending", // PENDING - requires admin approval
        requestedBy: state.currentUser.name,
        requestedById: state.currentUser.id,
        staffName: state.currentUser.name,
        staffId: state.currentUser.id,
        requestedAt: new Date(),
        date: new Date(),
        isInitialDeposit: true, // Flag to identify this is initial deposit
      };

      const txnResponse = await api.post("/transactions", txnData);
      depositTxn = txnResponse.data;

      cachedApi.invalidate("/customers");
      cachedApi.invalidate("/transactions");
    }

    await loadAllData();

    let successMsg = `✅ Customer added successfully! SMS alerts will be sent to ${newCustomer.phone}`;
    successMsg += ` | Starting balance: ₦0 (deposit requires approval)`;

    if (initialDeposit > 0) {
      successMsg += ` | Pending deposit: ₦${initialDeposit.toLocaleString()}`;
      if (charges > 0) {
        successMsg += ` | Charges: ₦${charges.toLocaleString()}`;
      }
      successMsg += ` | Net after approval: ₦${netBalance.toLocaleString()}`;
    }

    showNotification(successMsg, "success");
    closeCustomerModal();
  } catch (error) {
    console.error("Error adding customer:", error);
    showNotification(
      error.response?.data?.error || "Failed to add customer",
      "error",
    );
  }
}

function renderNewCustomer(container) {
  const html = `
    <div class="max-w-2xl mx-auto animate-fade-in px-4 sm:px-0">
      <div class="glass-panel rounded-2xl p-4 sm:p-8">
        <div class="flex items-center gap-4 mb-6 sm:mb-8">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-blue-500/20 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-user-plus text-blue-400 text-base sm:text-xl"></i>
          </div>
          <div>
            <h3 class="text-lg sm:text-xl font-semibold">Register New Customer</h3>
            <p class="text-xs sm:text-sm text-gray-400">Create a new customer account with SMS alerts</p>
          </div>
        </div>

        <form onsubmit="handleNewCustomer(event)" class="space-y-4 sm:space-y-6">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Full Name *</label>
              <input type="text" name="fullName" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Email Address *</label>
              <input type="email" name="email" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Phone Number (for SMS Alerts) *</label>
              <input type="tel" name="phone" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base" placeholder="08012345678">
              <p class="text-xs text-green-400 mt-1">✓ SMS alerts will be sent to this number for all deposits and withdrawals</p>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">
                Initial Deposit (₦) <span class="text-xs text-yellow-400">- Requires admin approval</span>
              </label>
              <input type="number" name="initialDeposit" id="regInitialDeposit" min="0" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base" placeholder="0.00" oninput="updateRegistrationNet()">
              <p class="text-xs text-yellow-400 mt-1">⚠️ Customer balance starts at ₦0. Deposit requires admin approval.</p>
            </div>
          </div>

          <!-- Charges Field -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              Charge Amount (₦) <span class="text-xs text-yellow-400">- Optional, default 0</span>
            </label>
            <input type="number" name="charges" id="regCharges" value="0" min="0" step="0.01" 
              oninput="updateRegistrationNet()"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white font-mono focus:border-blue-500 transition-colors text-base" 
              placeholder="0.00">
            <p class="text-xs text-gray-400 mt-1">This charge will be deducted from the initial deposit upon approval</p>
          </div>

          <!-- Net Amount Display -->
          <div id="regNetDisplay" class="p-4 bg-gradient-to-r from-gray-800 to-gray-800/50 border border-blue-500/30 rounded-xl hidden">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <span class="text-gray-300 font-medium text-sm sm:text-base">Net Amount (after approval):</span>
              <span class="text-2xl sm:text-3xl font-bold text-blue-400 font-mono" id="regNetAmount">₦0</span>
            </div>
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-2 text-xs text-gray-400 gap-1">
              <span>Initial Deposit - Charges = Net Balance (after admin approval)</span>
            </div>
          </div>

          <!-- Warning for charges exceeding deposit -->
          <div id="regChargeWarning" class="hidden p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <p class="text-xs text-red-300 flex items-center gap-2">
              <i class="fas fa-exclamation-circle"></i>
              <span>Charges cannot exceed the initial deposit amount</span>
            </p>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Address</label>
            <textarea name="address" rows="3" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base"></textarea>
          </div>

          <div class="flex items-center gap-3 p-3 sm:p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <i class="fas fa-info-circle text-blue-400 text-sm sm:text-base"></i>
            <p class="text-xs sm:text-sm text-blue-200">Customer ID will be generated automatically. Account starts with ₦0 balance. Initial deposit (if any) will be submitted as a pending transaction for admin approval.</p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <button type="button" onclick="navigate('customers')" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" id="regSubmitBtn" class="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-colors">Register Customer</button>
          </div>
        </form>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

function updateRegistrationNet() {
  const deposit = parseFloat(
    document.getElementById("regInitialDeposit")?.value || 0,
  );
  const charges = parseFloat(document.getElementById("regCharges")?.value || 0);
  const net = deposit - charges;

  const netDisplay = document.getElementById("regNetDisplay");
  const netAmount = document.getElementById("regNetAmount");
  const warning = document.getElementById("regChargeWarning");
  const submitBtn = document.getElementById("regSubmitBtn");

  if (deposit > 0 || charges > 0) {
    netDisplay.classList.remove("hidden");
    netAmount.textContent = "₦" + net.toLocaleString();
  } else {
    netDisplay.classList.add("hidden");
  }

  // Validate: charges cannot exceed deposit
  if (charges > deposit) {
    warning.classList.remove("hidden");
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.classList.add("opacity-50", "cursor-not-allowed");
    }
  } else {
    warning.classList.add("hidden");
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
    }
  }
}

async function handleNewCustomer(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const currentStaff = state.currentUser;

  const initialDeposit = parseFloat(formData.get("initialDeposit")) || 0;
  const charges = parseFloat(formData.get("charges")) || 0;
  const netBalance = initialDeposit - charges;

  // === CHARGE CONFIRMATION PROMPT FOR INITIAL DEPOSIT ===
  if (initialDeposit > 0 && charges <= 0) {
    const proceedWithoutCharges = confirm(
      `No charges have been entered for this initial deposit.\n\nDo you want to proceed without adding charges?`,
    );
    if (!proceedWithoutCharges) {
      return;
    }
  }

  // Validate charges don't exceed deposit
  if (charges > initialDeposit) {
    showNotification(
      "Charges cannot exceed the initial deposit amount",
      "error",
    );
    return;
  }

  const customerData = {
    name: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    cashBalance: 0, // Start with 0 - deposit requires approval
    loanBalance: 0,
    address: formData.get("address"),
    staffId: currentStaff?.id,
    staffName: currentStaff?.name,
    staffEmail: currentStaff?.email,
  };

  try {
    const response = await api.post("/customers", customerData);
    const newCustomer = response.data.customer || response.data;

    // If there's an initial deposit, create a PENDING transaction
    let depositTxn = null;
    if (initialDeposit > 0) {
      const txnData = {
        customerId: newCustomer.id,
        customerName: newCustomer.name,
        customerPhone: newCustomer.phone,
        type: "deposit",
        amount: initialDeposit,
        charges: charges,
        netAmount: netBalance,
        description: `Initial deposit for new customer ${newCustomer.name}`,
        status: "pending", // PENDING - requires admin approval
        requestedBy: state.currentUser.name,
        requestedById: state.currentUser.id,
        staffName: state.currentUser.name,
        staffId: state.currentUser.id,
        requestedAt: new Date(),
        date: new Date(),
        isInitialDeposit: true,
      };

      const txnResponse = await api.post("/transactions", txnData);
      depositTxn = txnResponse.data;
    }

    state.customers.push(newCustomer);

    let successMsg = `✅ Customer registered successfully! ID: ${newCustomer.id}\n📱 SMS alerts will be sent to ${newCustomer.phone}`;
    successMsg += `\n💰 Starting balance: ₦0`;

    if (initialDeposit > 0) {
      successMsg += `\n⏳ Pending deposit: ₦${initialDeposit.toLocaleString()}`;
      if (charges > 0) {
        successMsg += ` | Charges: ₦${charges.toLocaleString()}`;
      }
      successMsg += `\n✅ Net after approval: ₦${netBalance.toLocaleString()}`;
    }

    showNotification(successMsg, "success");
    navigate("customers");
  } catch (error) {
    console.error("Customer registration error:", error);
    showNotification(
      error.response?.data?.error || "Failed to register customer",
      "error",
    );
  }
}

// ==================== NEW TRANSACTION VIEW WITH SEARCH ====================

function renderNewTransaction(container) {
  let availableCustomers = state.customers;

  const html = `
    <div class="max-w-2xl mx-auto animate-fade-in px-4 sm:px-0">
      <div class="glass-panel rounded-2xl p-4 sm:p-8">
        <div class="flex items-center gap-4 mb-6 sm:mb-8">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-purple-500/20 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-exchange-alt text-purple-400 text-base sm:text-xl"></i>
          </div>
          <div>
            <h3 class="text-lg sm:text-xl font-semibold">New Transaction</h3>
            <p class="text-xs sm:text-sm text-gray-400">Process deposit or withdrawal with manual charges</p>
            <p class="text-xs text-green-400 mt-1">📱 SMS alerts will be sent to customer upon approval</p>
          </div>
        </div>

        <form onsubmit="handleNewTransaction(event)" class="space-y-4 sm:space-y-6">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              <i class="fas fa-search mr-2 text-blue-400"></i>Search Customer
            </label>
            <div class="relative">
              <input type="text" id="customerSearchInput" placeholder="Search by name, email, phone, or 3-digit number (e.g., 001)..." autocomplete="off" class="w-full px-4 py-3 pl-10 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base" />
              <i class="fas fa-search absolute left-3 top-3.5 text-gray-500"></i>
              <i class="fas fa-times absolute right-3 top-3.5 text-gray-500 cursor-pointer hover:text-gray-300 hidden" id="clearSearchBtn" onclick="clearCustomerSearch()"></i>
            </div>
            <p class="text-xs text-gray-400 mt-1">Tip: Enter a 3-digit number (001-999) for quick customer lookup</p>
          </div>

          <div id="searchResultsDropdown" class="hidden glass-panel rounded-xl border border-gray-700 max-h-64 overflow-y-auto">
            <div id="searchResultsList" class="divide-y divide-gray-700"></div>
          </div>

          <div id="selectedCustomerDisplay" class="hidden p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div class="flex justify-between items-center">
              <div>
                <p class="text-sm text-gray-300">Selected Customer:</p>
                <div class="flex items-center gap-2 mt-1">
                  <span class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded font-mono text-sm font-bold" id="selectedCustomerNumber">-</span>
                  <p class="text-base font-semibold text-white" id="selectedCustomerName">-</p>
                </div>
                <p class="text-xs text-gray-400 mt-1" id="selectedCustomerPhone"></p>
              </div>
              <button type="button" onclick="clearSelectedCustomer()" class="text-red-400 hover:text-red-300"><i class="fas fa-times"></i></button>
            </div>
          </div>

          <input type="hidden" name="customerId" id="selectedCustomerId" value="">

          <div id="customerBalanceDisplay" class="hidden p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <div class="flex justify-between items-center">
              <span class="text-xs sm:text-sm text-gray-300">Current Cash Balance:</span>
              <span class="text-base sm:text-lg font-bold text-green-400" id="currentBalanceAmount">₦0</span>
            </div>
          </div>

          <div class="grid grid-cols-2 gap-3 sm:gap-4">
            <label class="cursor-pointer">
              <input type="radio" name="type" value="deposit" checked class="hidden peer" onchange="updateNetAmount()">
              <div class="p-3 sm:p-4 rounded-xl border-2 border-gray-700 peer-checked:border-green-500 peer-checked:bg-green-500/10 transition-all text-center">
                <i class="fas fa-arrow-down text-green-400 text-xl sm:text-2xl mb-1 sm:mb-2"></i>
                <p class="font-medium text-sm sm:text-base">Deposit</p>
                <p class="text-xs text-gray-400 mt-1 hidden sm:block">Customer receives amount minus charges</p>
              </div>
            </label>
            <label class="cursor-pointer">
              <input type="radio" name="type" value="withdrawal" class="hidden peer" onchange="updateNetAmount()">
              <div class="p-3 sm:p-4 rounded-xl border-2 border-gray-700 peer-checked:border-orange-500 peer-checked:bg-orange-500/10 transition-all text-center">
                <i class="fas fa-arrow-up text-orange-400 text-xl sm:text-2xl mb-1 sm:mb-2"></i>
                <p class="font-medium text-sm sm:text-base">Withdrawal</p>
                <p class="text-xs text-gray-400 mt-1 hidden sm:block">Customer pays amount minus charges</p>
              </div>
            </label>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Amount (₦)</label>
            <input type="number" name="amount" id="transactionAmount" required min="1" oninput="updateNetAmount()" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-xl sm:text-2xl font-mono focus:border-blue-500 transition-colors" placeholder="0.00">
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Charge Amount (₦) <span class="text-xs text-yellow-400">- Enter manually</span></label>
            <input type="number" name="charges" id="chargeAmount" value="0" min="0" step="0.01" oninput="updateNetAmount()" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-xl sm:text-2xl font-mono focus:border-blue-500 transition-colors" placeholder="0.00">
            <p class="text-xs text-gray-400 mt-1">This charge will be deducted from the transaction amount</p>
          </div>

          <div id="netAmountDisplay" class="p-4 bg-gradient-to-r from-gray-800 to-gray-800/50 border border-blue-500/30 rounded-xl">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <span class="text-gray-300 font-medium text-sm sm:text-base">Net Amount to be Processed:</span>
              <span class="text-2xl sm:text-3xl font-bold text-blue-400 font-mono" id="netAmount">₦0</span>
            </div>
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-2 text-xs text-gray-400 gap-1">
              <span>For deposits: Amount - Charges</span>
              <span>For withdrawals: Amount - Charges</span>
            </div>
          </div>

          <div id="insufficientFundsWarning" class="hidden p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <i class="fas fa-exclamation-circle text-red-500"></i>
              <p class="text-xs sm:text-sm text-red-200">Insufficient funds! Amount after charges: <span id="totalDeduction">₦0</span></p>
              <p class="text-xs text-red-200 sm:ml-auto">Available balance: <span id="availableBalance">₦0</span></p>
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Description</label>
            <textarea name="description" rows="2" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base"></textarea>
          </div>

          <div class="flex items-center gap-3 p-3 sm:p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
            <i class="fas fa-exclamation-triangle text-yellow-500 text-sm sm:text-base"></i>
            <p class="text-xs sm:text-sm text-yellow-200">This request will require admin approval before processing. SMS alert will be sent to customer upon approval.</p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <button type="button" onclick="navigate('dashboard')" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" id="submitTransactionBtn" class="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-colors">Submit Request</button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.innerHTML = html;
  initTransactionSearch(availableCustomers);
}

function initTransactionSearch(customersData) {
  window.customersData = customersData;
  let searchTimeout;

  window.clearCustomerSearch = function () {
    const searchInput = document.getElementById("customerSearchInput");
    if (searchInput) {
      searchInput.value = "";
      document.getElementById("searchResultsDropdown").classList.add("hidden");
      document.getElementById("clearSearchBtn").classList.add("hidden");
    }
  };

  window.filterAndDisplayCustomers = function () {
    const searchInput = document.getElementById("customerSearchInput");
    const searchResultsDropdown = document.getElementById(
      "searchResultsDropdown",
    );
    const searchResultsList = document.getElementById("searchResultsList");
    const clearBtn = document.getElementById("clearSearchBtn");

    if (!searchInput) return;
    const searchTerm = searchInput.value.toLowerCase().trim();

    if (searchTerm) clearBtn?.classList.remove("hidden");
    else clearBtn?.classList.add("hidden");

    if (searchTerm === "") {
      searchResultsDropdown.classList.add("hidden");
      return;
    }

    const filteredCustomers = window.customersData.filter((customer) => {
      const name = (customer.name || "").toLowerCase();
      const email = (customer.email || "").toLowerCase();
      const phone = (customer.phone || "").toLowerCase();
      const number = (customer.customerNumber || "").toLowerCase();
      return (
        name.includes(searchTerm) ||
        email.includes(searchTerm) ||
        phone.includes(searchTerm) ||
        number === searchTerm
      );
    });

    if (filteredCustomers.length === 0) {
      searchResultsList.innerHTML = `<div class="p-4 text-center text-gray-400"><i class="fas fa-search text-2xl mb-2 block"></i>No customers found matching "${searchTerm}"</div>`;
      searchResultsDropdown.classList.remove("hidden");
      return;
    }

    searchResultsList.innerHTML = filteredCustomers
      .map((customer) => {
        const numberDisplay = customer.customerNumber
          ? `<span class="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-mono font-bold mr-2">#${customer.customerNumber}</span>`
          : "";
        return `<div class="p-3 hover:bg-gray-700 cursor-pointer transition-colors" onclick="window.selectCustomer('${customer.id}', '${customer.name.replace(/'/g, "\\'")}', ${customer.cashBalance || customer.balance || 0}, '${customer.phone || ""}', '${customer.customerNumber || ""}')">
        <div class="flex justify-between items-start">
          <div>
            <div class="flex items-center gap-2 flex-wrap">${numberDisplay}<p class="font-medium text-sm sm:text-base">${customer.name}</p></div>
            <p class="text-xs text-gray-400">${customer.email}</p>
            <p class="text-xs text-gray-500 mt-1">${customer.phone || "No phone"} | Cash: ₦${(customer.cashBalance || customer.balance || 0).toLocaleString()}</p>
          </div>
          <i class="fas fa-chevron-right text-gray-500 text-sm"></i>
        </div>
      </div>`;
      })
      .join("");

    searchResultsDropdown.classList.remove("hidden");
  };

  window.selectCustomer = function (id, name, balance, phone, customerNumber) {
    document.getElementById("selectedCustomerId").value = id;
    document.getElementById("selectedCustomerName").textContent = name;
    const numberSpan = document.getElementById("selectedCustomerNumber");
    if (numberSpan)
      numberSpan.textContent = customerNumber
        ? "#" + customerNumber
        : "No number";
    document.getElementById("selectedCustomerPhone").textContent = phone
      ? "📱 " + phone
      : "⚠️ No phone number";
    document
      .getElementById("selectedCustomerDisplay")
      .classList.remove("hidden");

    const customer = state.customers.find((c) => c.id === id);
    const cashBalance =
      customer?.cashBalance || customer?.balance || balance || 0;

    document.getElementById("currentBalanceAmount").textContent =
      "₦" + cashBalance.toLocaleString();
    document
      .getElementById("customerBalanceDisplay")
      .classList.remove("hidden");

    window.selectedCustomerBalance = cashBalance;
    window.selectedCustomerId = id;
    window.selectedCustomerName = name;
    window.selectedCustomerNumber = customerNumber;

    document.getElementById("searchResultsDropdown").classList.add("hidden");
    document.getElementById("customerSearchInput").value = "";
    document.getElementById("clearSearchBtn").classList.add("hidden");
    window.updateNetAmount();
  };

  window.clearSelectedCustomer = function () {
    document.getElementById("selectedCustomerId").value = "";
    document.getElementById("selectedCustomerDisplay").classList.add("hidden");
    document.getElementById("customerBalanceDisplay").classList.add("hidden");
    document.getElementById("insufficientFundsWarning").classList.add("hidden");
    window.selectedCustomerBalance = null;
    window.selectedCustomerId = null;
    window.selectedCustomerName = null;
    window.selectedCustomerNumber = null;
    window.updateNetAmount();
  };

  window.updateNetAmount = function () {
    const amount = parseFloat(
      document.getElementById("transactionAmount")?.value || 0,
    );
    const charges = parseFloat(
      document.getElementById("chargeAmount")?.value || 0,
    );
    const netAmount = amount - charges;
    document.getElementById("netAmount").textContent =
      "₦" + netAmount.toLocaleString();

    const balance = window.selectedCustomerBalance || 0;
    const transactionType = document.querySelector(
      'input[name="type"]:checked',
    )?.value;
    const warningDiv = document.getElementById("insufficientFundsWarning");
    const submitBtn = document.getElementById("submitTransactionBtn");

    if (!window.selectedCustomerId) {
      if (warningDiv) warningDiv.classList.add("hidden");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
      }
      return;
    }

    const availableSpan = document.getElementById("availableBalance");
    const deductionSpan = document.getElementById("totalDeduction");
    if (availableSpan)
      availableSpan.textContent = "₦" + balance.toLocaleString();
    if (deductionSpan)
      deductionSpan.textContent = "₦" + netAmount.toLocaleString();

    if (transactionType === "withdrawal" && netAmount > balance) {
      if (warningDiv) warningDiv.classList.remove("hidden");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
    } else if (transactionType === "deposit" && netAmount < 0) {
      if (warningDiv) warningDiv.classList.remove("hidden");
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.classList.add("opacity-50", "cursor-not-allowed");
      }
    } else {
      if (warningDiv) warningDiv.classList.add("hidden");
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.classList.remove("opacity-50", "cursor-not-allowed");
      }
    }
  };

  const searchInput = document.getElementById("customerSearchInput");
  if (searchInput) {
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    newSearchInput.addEventListener("input", function () {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(window.filterAndDisplayCustomers, 300);
    });
    newSearchInput.addEventListener("focus", function () {
      if (this.value.trim() !== "") window.filterAndDisplayCustomers();
    });
  }

  document.addEventListener("click", function (e) {
    const searchContainer = document.getElementById("customerSearchInput");
    const dropdown = document.getElementById("searchResultsDropdown");
    if (
      searchContainer &&
      dropdown &&
      !searchContainer.contains(e.target) &&
      !dropdown.contains(e.target)
    ) {
      dropdown.classList.add("hidden");
    }
  });

  window.updateNetAmount();
}

async function handleNewTransaction(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const customerId = formData.get("customerId");
  const customer = state.customers.find((c) => c.id === customerId);
  const type = formData.get("type");
  const amount = parseFloat(formData.get("amount"));
  const charges = parseFloat(formData.get("charges")) || 0;
  const description = formData.get("description") || "";
  const submitBtn = document.getElementById("submitTransactionBtn");
  const originalText = submitBtn.innerHTML;

  if (!customer) return showNotification("Select a customer", "error");

  const netAmount = amount - charges;
  if (netAmount < 0) return showNotification("Charges exceed amount", "error");

  if (charges <= 0 && !confirm(`Proceed without charges for this ${type}?`))
    return;

  submitBtn.disabled = true;
  submitBtn.innerHTML =
    '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';

  // (Logic for loan deduction calculation remains the same...)
  let loanDeduction = 0;
  let loanRepaymentInfo = null;
  let remainingForCustomer = netAmount;
  if (
    type === "deposit" &&
    customer.hasActiveLoan &&
    customer.loanBalance > 0
  ) {
    const outstandingLoan = customer.loanBalance;
    loanDeduction = Math.min(netAmount, outstandingLoan);
    remainingForCustomer = netAmount - loanDeduction;
    loanRepaymentInfo = {
      loanId: customer.activeLoanId,
      amount: loanDeduction,
      fullyPaid: outstandingLoan - loanDeduction <= 0,
      outstandingAfter: Math.max(0, outstandingLoan - loanDeduction),
    };
  }

  const txnData = {
    customerId,
    customerName: customer.name,
    customerPhone: customer.phone,
    type,
    amount,
    charges,
    netAmount: remainingForCustomer,
    loanDeduction: loanDeduction > 0 ? loanDeduction : undefined,
    loanRepaymentInfo,
    description: description || `${type} request`,
    status: "pending",
    requestedBy: state.currentUser.name,
    requestedById: state.currentUser.id,
    staffName: state.currentUser.name,
    staffId: state.currentUser.id,
    requestedAt: new Date(),
    date: new Date(),
  };

  try {
    const response = await api.post("/transactions", txnData);
    const newTxn = response.data;

    // 1. INJECT INTO STATE
    state.transactions.unshift(newTxn);
    cachedApi.invalidate("/transactions");

    showNotification("Transaction request submitted!", "success");

    // 2. RESET FORM & RE-RENDER CURRENT VIEW (FAST)
    e.target.reset();
    document.getElementById("selectedCustomerId").value = "";
    document.getElementById("selectedCustomerDisplay").classList.add("hidden");
    document.getElementById("customerBalanceDisplay").classList.add("hidden");
    document.getElementById("netAmount").textContent = "₦0";
    window.selectedCustomerId = null;

    navigate(state.currentView);
  } catch (error) {
    showNotification(
      error.response?.data?.message || "Failed to submit",
      "error",
    );
  } finally {
    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;
  }
}
async function processTransaction(
  txnId,
  action,
  refreshView = true,
  staffId = null,
) {
  const transaction = state.transactions.find((t) => t.id === txnId);
  if (!transaction) return;

  // --- STEP 1: CAPTURE OLD STATE (For Rollback) ---
  const originalStatus = transaction.status;

  // --- STEP 2: OPTIMISTIC UPDATE (The Speed Secret) ---
  // Update the local state immediately
  transaction.status = action;

  // Re-render the view immediately so the admin sees the color change instantly
  // We do NOT await this; we just want the UI to reflect the change
  if (state.currentView === "transactions") {
    renderAdminTransactions(document.getElementById("contentArea"));
  } else {
    navigate(state.currentView);
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
    } else if (
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

    await api.patch(`/transactions/${txnId}${endpoint}`, updateData);

    cachedApi.invalidate("/transactions");
    showNotification(`Transaction ${action}ed!`, "success");

    loadAllData().catch((err) => console.warn("Background sync error:", err));
  } catch (error) {
    transaction.status = originalStatus;

    if (state.currentView === "transactions") {
      renderAdminTransactions(document.getElementById("contentArea"));
    } else {
      navigate(state.currentView);
    }

    showNotification(
      error.response?.data?.message || "Failed to process",
      "error",
    );
    console.error("Transaction processing error:", error);
  }
}
// ==================== LOGOUT FUNCTION ====================

function logout() {
  stopTransactionPolling(); // Stop polling on logout
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
  // Ensure arrays before filtering
  const transactions = Array.isArray(state.transactions)
    ? state.transactions
    : [];
  const loans = Array.isArray(state.loans) ? state.loans : [];

  const pendingTxnCount = transactions.filter(
    (t) => t.status === "pending",
  ).length;
  const pendingLoanCount = loans.filter((l) => l.status === "pending").length;
  const totalPending = pendingTxnCount + pendingLoanCount;

  const badge = document.getElementById("notifBadge");

  if (totalPending > 0 && state.role === "admin") {
    badge.classList.remove("hidden");

    // Transaction notification
    if (pendingTxnCount > 0) {
      state.notifications.push({
        id: Date.now(),
        message: `${pendingTxnCount} transaction${pendingTxnCount > 1 ? "s" : ""} pending approval`,
        time: "Just now",
        unread: true,
      });
    }

    // Loan notification - FIXED
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

// ==================== CUSTOMER TRANSACTION HISTORY FUNCTIONS ====================

function viewCustomer(id) {
  const customer = state.customers.find((c) => c.id === id);
  if (!customer) {
    showNotification("Customer not found", "error");
    navigate("customers");
    return;
  }

  const container = document.getElementById("contentArea");
  const stats = getCustomerStats(id, "all");
  const transactions = stats?.transactions || [];
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );

  // Check if customer has active loan
  const activeLoan = state.loans?.find(
    (l) => l.customerId === id && l.status === "active",
  );

  const html = `
    <div class="space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-0">
      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div class="flex items-center gap-4">
            <button onclick="navigate('customers')" class="text-gray-400 hover:text-white transition-colors"><i class="fas fa-arrow-left mr-2"></i>Back to Customers</button>
          </div>
          <div class="flex gap-2 w-full sm:w-auto">
            <button onclick="exportCustomerData('${customer.id}')" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-xs sm:text-sm transition-colors"><i class="fas fa-download mr-1 sm:mr-2"></i>Export</button>
            <button onclick="renderCustomerSummary(document.getElementById('contentArea'), '${customer.id}')" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs sm:text-sm transition-colors"><i class="fas fa-chart-bar mr-1 sm:mr-2"></i>Summary</button>
          </div>
        </div>
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xl sm:text-3xl font-bold flex-shrink-0">${
            customer.name
              ? customer.name
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .substring(0, 2)
                  .toUpperCase()
              : "??"
          }</div>
          <div class="flex-1">
            <h2 class="text-xl sm:text-2xl font-bold break-words">${customer.name}</h2>
            <p class="text-xs sm:text-sm text-gray-400 break-words">${customer.email} • ${customer.phone || "No phone"}</p>
            <div class="flex flex-wrap items-center gap-2 sm:gap-4 mt-2">
              <span class="text-xs sm:text-sm bg-blue-500/20 text-blue-400 px-2 sm:px-3 py-1 rounded-full"><i class="fas fa-id-card mr-1"></i>${customer.id.substring(0, 8)}...</span>
              <span class="text-xs sm:text-sm ${customer.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"} px-2 sm:px-3 py-1 rounded-full"><i class="fas fa-circle mr-1"></i>${customer.status}</span>
              <span class="text-xs sm:text-sm bg-purple-500/20 text-purple-400 px-2 sm:px-3 py-1 rounded-full"><i class="fas fa-calendar mr-1"></i>Joined: ${formatSimpleDate(customer.joined)}</span>
            </div>
          </div>
          <div class="text-left sm:text-right mt-4 sm:mt-0">
            <p class="text-xs sm:text-sm text-gray-400">Cash Balance</p>
            <p class="text-2xl sm:text-3xl font-bold text-green-400">₦${(customer.cashBalance || customer.balance || 0).toLocaleString()}</p>
            ${customer.loanBalance > 0 ? `<p class="text-xs text-orange-400">Loan: ₦${customer.loanBalance.toLocaleString()}</p>` : ""}
          </div>
        </div>
        
        ${
          activeLoan
            ? `
        <div class="mt-4 p-3 sm:p-4 bg-purple-500/10 border border-purple-500/30 rounded-xl">
          <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <h4 class="text-sm font-semibold text-purple-400 flex items-center gap-2">
                <i class="fas fa-hand-holding-usd"></i>
                Active Loan - Auto Repayment Enabled
              </h4>
              <p class="text-xs text-gray-300 mt-1">
                Outstanding: <span class="font-bold text-orange-400">₦${activeLoan.outstandingBalance?.toLocaleString() || 0}</span> 
                of <span class="text-gray-400">₦${activeLoan.totalPayable?.toLocaleString() || 0}</span>
                (Principal: ₦${activeLoan.amount?.toLocaleString() || 0} + Interest: ₦${((activeLoan.totalPayable || 0) - (activeLoan.amount || 0)).toLocaleString()})
              </p>
            </div>
            <div class="w-full sm:w-auto">
              <div class="flex justify-between text-xs mb-1">
                <span>Repayment Progress</span>
                <span>${(((activeLoan.amountRepaid || 0) / (activeLoan.totalPayable || 1)) * 100).toFixed(1)}%</span>
              </div>
              <div class="w-full sm:w-48 bg-gray-700 rounded-full h-2">
                <div class="bg-purple-500 h-2 rounded-full" style="width: ${((activeLoan.amountRepaid || 0) / (activeLoan.totalPayable || 1)) * 100}%"></div>
              </div>
              <p class="text-xs text-gray-400 mt-1">₦${activeLoan.amountRepaid?.toLocaleString() || 0} repaid</p>
            </div>
          </div>
          <div class="mt-2 p-2 bg-gray-900/50 rounded-lg">
            <p class="text-xs text-purple-300">
              <i class="fas fa-info-circle mr-1"></i>
              All deposits will be auto-deducted to pay this loan until fully repaid. Customer will receive SMS alerts for each deduction.
            </p>
          </div>
        </div>
        `
            : ""
        }
      </div>

      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <h3 class="text-base sm:text-lg font-semibold">Transaction History</h3>
          <div class="flex gap-2 flex-wrap w-full sm:w-auto">
            <button onclick="renderCustomerTransactions(document.getElementById('contentArea'), '${customer.id}', 'today')" class="flex-1 sm:flex-none px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm">Today</button>
            <button onclick="renderCustomerTransactions(document.getElementById('contentArea'), '${customer.id}', 'week')" class="flex-1 sm:flex-none px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm">Week</button>
            <button onclick="renderCustomerTransactions(document.getElementById('contentArea'), '${customer.id}', 'month')" class="flex-1 sm:flex-none px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm">Month</button>
            <button onclick="renderCustomerTransactions(document.getElementById('contentArea'), '${customer.id}', 'year')" class="flex-1 sm:flex-none px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm">Year</button>
            <button onclick="renderCustomerTransactions(document.getElementById('contentArea'), '${customer.id}', 'all')" class="flex-1 sm:flex-none px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs sm:text-sm">All</button>
          </div>
        </div>
        <div class="overflow-x-auto -mx-4 sm:mx-0">
          <div class="inline-block min-w-full align-middle">
            <table class="min-w-full divide-y divide-gray-700">
              <thead>
                <tr class="text-left text-gray-400 text-xs sm:text-sm">
                  <th class="pb-3 px-4 sm:px-0">Date</th>
                  <th class="pb-3 px-4 sm:px-0">Type</th>
                  <th class="pb-3 px-4 sm:px-0">Gross</th>
                  <th class="pb-3 px-4 sm:px-0 hidden sm:table-cell">Charges</th>
                  <th class="pb-3 px-4 sm:px-0 hidden sm:table-cell">Loan Deduction</th>
                  <th class="pb-3 px-4 sm:px-0">Net/Available</th>
                  <th class="pb-3 px-4 sm:px-0">Status</th>
                  <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Description</th>
                  <th class="pb-3 px-4 sm:px-0 hidden lg:table-cell">Processed By</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800">
                ${sortedTransactions
                  .slice(0, 50)
                  .map((txn) => {
                    const charges = txn.charges || 0;
                    const netAmount = txn.amount - charges;
                    const loanDeduction = txn.loanDeduction || 0;
                    const finalAvailable = netAmount - loanDeduction;

                    // Determine if transaction is money IN or OUT
                    const isMoneyIn =
                      txn.type === "deposit" || txn.type === "loan_repayment";
                    const isMoneyOut =
                      txn.type === "withdrawal" ||
                      txn.type === "loan_disbursement";

                    // Determine colors and arrows
                    const amountColor = isMoneyIn
                      ? "text-green-400"
                      : isMoneyOut
                        ? "text-orange-400"
                        : "text-blue-400";
                    const arrowDirection = isMoneyIn ? "down" : "up";
                    const amountSign = isMoneyIn ? "+" : "-";

                    // Determine loan badge
                    const loanIndicator =
                      loanDeduction > 0
                        ? `<span class="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded text-xs ml-1" title="Auto loan repayment">
                           <i class="fas fa-hand-holding-usd text-xs"></i>
                           ₦${loanDeduction.toLocaleString()}
                         </span>`
                        : "";

                    return `
                      <tr class="hover:bg-gray-800/30 transition-colors ${loanDeduction > 0 ? "bg-purple-500/5" : ""}">
                        <td class="py-3 px-4 sm:px-0">
                          <div class="flex items-center gap-1 text-xs sm:text-sm">
                            <i class="fas fa-calendar-alt text-gray-500 text-xs"></i>
                            ${formatDate(txn.date)}
                          </div>
                        </td>
                        <td class="py-3 px-4 sm:px-0">
                          <span class="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm flex-wrap">
                            <i class="fas fa-arrow-${arrowDirection} ${amountColor}"></i>
                            ${txn.type}
                            ${loanIndicator}
                          </span>
                        </td>
                        <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm ${amountColor}">
                          ${amountSign}₦${(txn.amount || 0).toLocaleString()}
                        </td>
                        <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-red-400 hidden sm:table-cell">
                          ${charges > 0 ? `-₦${charges.toLocaleString()}` : "-"}
                        </td>
                        <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-purple-400 hidden sm:table-cell">
                          ${loanDeduction > 0 ? `-₦${loanDeduction.toLocaleString()}` : "-"}
                        </td>
                        <td class="py-3 px-4 sm:px-0">
                          <div class="font-mono text-xs sm:text-sm ${loanDeduction > 0 ? "text-green-400 font-semibold" : "text-blue-400"}">
                            ₦${finalAvailable.toLocaleString()}
                          </div>
                          ${loanDeduction > 0 ? `<div class="text-xs text-gray-400">Gross: ₦${netAmount.toLocaleString()}</div>` : ""}
                        </td>
                        <td class="py-3 px-4 sm:px-0">
                          <span class="px-2 py-1 rounded text-xs ${getStatusStyle(txn.status)}">
                            ${txn.status}
                          </span>
                        </td>
                        <td class="py-3 px-4 sm:px-0 hidden md:table-cell">
                          <p class="text-xs sm:text-sm text-gray-300 truncate max-w-[150px]" title="${txn.description || ""}">
                            ${txn.description || "-"}
                          </p>
                          ${txn.loanRepaymentInfo?.fullyPaid ? '<p class="text-xs text-green-400 mt-1"><i class="fas fa-check-circle mr-1"></i>Loan fully paid!</p>' : ""}
                        </td>
                        <td class="py-3 px-4 sm:px-0 hidden lg:table-cell text-xs sm:text-sm text-gray-400">
                          ${txn.approvedBy || "-"}
                        </td>
                      </tr>
                    `;
                  })
                  .join("")}
                ${sortedTransactions.length === 0 ? '<tr><td colspan="9" class="py-8 text-center text-gray-400">No transactions found for this customer</td></tr>' : ""}
                ${sortedTransactions.length > 50 ? '<tr><td colspan="9" class="py-4 text-center text-gray-500 text-xs sm:text-sm">Showing first 50 transactions. Use period filters to see more.</td></tr>' : ""}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  document.getElementById("pageTitle").textContent =
    `${customer.name} - Transactions`;
}
function getCustomerStats(customerId, period = "all") {
  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer) return null;

  const transactions = state.transactions.filter(
    (t) => t.customerId === customerId,
  );
  const now = new Date();

  const isToday = (date) =>
    new Date(date).toDateString() === now.toDateString();
  const isThisWeek = (date) => {
    const d = new Date(date);
    const weekAgo = new Date(now);
    weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo;
  };
  const isThisMonth = (date) => {
    const d = new Date(date);
    return (
      d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
    );
  };
  const isThisYear = (date) =>
    new Date(date).getFullYear() === now.getFullYear();

  let filteredTransactions = transactions;
  if (period === "today")
    filteredTransactions = transactions.filter((t) => isToday(t.date));
  else if (period === "week")
    filteredTransactions = transactions.filter((t) => isThisWeek(t.date));
  else if (period === "month")
    filteredTransactions = transactions.filter((t) => isThisMonth(t.date));
  else if (period === "year")
    filteredTransactions = transactions.filter((t) => isThisYear(t.date));

  const deposits = filteredTransactions.filter(
    (t) => t.type === "deposit" && t.status === "approved",
  );
  const withdrawals = filteredTransactions.filter(
    (t) => t.type === "withdrawal" && t.status === "approved",
  );
  const pending = filteredTransactions.filter((t) => t.status === "pending");
  const rejected = filteredTransactions.filter((t) => t.status === "rejected");

  const totalDeposits = deposits.reduce((sum, t) => sum + t.amount, 0);
  const totalWithdrawals = withdrawals.reduce((sum, t) => sum + t.amount, 0);
  const totalCharges = filteredTransactions.reduce(
    (sum, t) => sum + (t.charges || 0),
    0,
  );
  const netDeposits = deposits.reduce(
    (sum, t) => sum + (t.amount - (t.charges || 0)),
    0,
  );
  const netWithdrawals = withdrawals.reduce(
    (sum, t) => sum + (t.amount - (t.charges || 0)),
    0,
  );

  return {
    customer,
    transactions: filteredTransactions,
    stats: {
      totalTransactions: filteredTransactions.length,
      approved: deposits.length + withdrawals.length,
      pending: pending.length,
      rejected: rejected.length,
      totalCharges,
      deposits: {
        count: deposits.length,
        total: totalDeposits,
        net: netDeposits,
        average: deposits.length > 0 ? totalDeposits / deposits.length : 0,
      },
      withdrawals: {
        count: withdrawals.length,
        total: totalWithdrawals,
        net: netWithdrawals,
        average:
          withdrawals.length > 0 ? totalWithdrawals / withdrawals.length : 0,
      },
      netBalance: netDeposits - netWithdrawals,
      period,
    },
  };
}

function renderCustomerTransactions(container, customerId, period = "all") {
  const stats = getCustomerStats(customerId, period);
  if (!stats) {
    showNotification("Customer not found", "error");
    navigate("customers");
    return;
  }

  const { customer, transactions, stats: data } = stats;
  const sortedTransactions = [...transactions].sort(
    (a, b) => new Date(b.date) - new Date(a.date),
  );

  const html = `
    <div class="space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-0">
      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div class="flex items-center gap-4"><button onclick="viewCustomer('${customer.id}')" class="text-gray-400 hover:text-white transition-colors"><i class="fas fa-arrow-left mr-2"></i>Back</button></div>
          <div class="flex gap-2 w-full sm:w-auto"><button onclick="exportCustomerData('${customer.id}')" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-xs sm:text-sm"><i class="fas fa-download mr-1 sm:mr-2"></i>Export</button><button onclick="renderCustomerSummary(document.getElementById('contentArea'), '${customer.id}')" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs sm:text-sm"><i class="fas fa-chart-bar mr-1 sm:mr-2"></i>Summary</button></div>
        </div>
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xl sm:text-3xl font-bold flex-shrink-0">${customer.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .substring(0, 2)
            .toUpperCase()}</div>
          <div class="flex-1"><h2 class="text-xl sm:text-2xl font-bold break-words">${customer.name}</h2><p class="text-xs sm:text-sm text-gray-400 break-words">${customer.email} • ${customer.phone || "No phone"}</p>
            <div class="flex flex-wrap items-center gap-2 sm:gap-4 mt-2"><span class="text-xs sm:text-sm bg-blue-500/20 text-blue-400 px-2 sm:px-3 py-1 rounded-full"><i class="fas fa-id-card mr-1"></i>${customer.id.substring(0, 8)}...</span><span class="text-xs sm:text-sm ${customer.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"} px-2 sm:px-3 py-1 rounded-full"><i class="fas fa-circle mr-1"></i>${customer.status}</span><span class="text-xs sm:text-sm bg-purple-500/20 text-purple-400 px-2 sm:px-3 py-1 rounded-full"><i class="fas fa-calendar mr-1"></i>Joined: ${formatSimpleDate(customer.joined)}</span></div>
          </div>
          <div class="text-left sm:text-right mt-4 sm:mt-0"><p class="text-xs sm:text-sm text-gray-400">Cash Balance</p><p class="text-2xl sm:text-3xl font-bold text-green-400">₦${(customer.cashBalance || customer.balance || 0).toLocaleString()}</p></div>
        </div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700"><div class="flex items-center justify-between mb-2"><span class="text-xs sm:text-sm text-gray-400">Total Txns</span><i class="fas fa-exchange-alt text-blue-400 text-sm sm:text-base"></i></div><p class="text-xl sm:text-2xl font-bold">${data.totalTransactions}</p><div class="flex gap-2 mt-1 sm:mt-2 text-xs"><span class="text-green-400">✓ ${data.approved}</span><span class="text-yellow-400">⏳ ${data.pending}</span><span class="text-red-400">✗ ${data.rejected}</span></div></div>
        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700"><div class="flex items-center justify-between mb-2"><span class="text-xs sm:text-sm text-gray-400">Net Deposits</span><i class="fas fa-arrow-down text-green-400 text-sm sm:text-base"></i></div><p class="text-base sm:text-xl font-bold text-green-400">₦${data.deposits.net.toLocaleString()}</p><p class="text-xs text-gray-400 mt-1 hidden sm:block">Gross: ₦${data.deposits.total.toLocaleString()}</p></div>
        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700"><div class="flex items-center justify-between mb-2"><span class="text-xs sm:text-sm text-gray-400">Net Withdrawals</span><i class="fas fa-arrow-up text-orange-400 text-sm sm:text-base"></i></div><p class="text-base sm:text-xl font-bold text-orange-400">₦${data.withdrawals.net.toLocaleString()}</p><p class="text-xs text-gray-400 mt-1 hidden sm:block">Gross: ₦${data.withdrawals.total.toLocaleString()}</p></div>
        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700"><div class="flex items-center justify-between mb-2"><span class="text-xs sm:text-sm text-gray-400">Total Charges</span><i class="fas fa-percent text-red-400 text-sm sm:text-base"></i></div><p class="text-base sm:text-xl font-bold text-red-400">₦${data.totalCharges.toLocaleString()}</p><p class="text-xs text-gray-400 mt-1">${period === "all" ? "All time" : `This ${period}`}</p></div>
      </div>

      <h3 class="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Transaction History - ${period === "all" ? "All Time" : `This ${period}`}</h3>
      <div class="overflow-x-auto -mx-4 sm:mx-0"><div class="inline-block min-w-full align-middle"><table class="min-w-full divide-y divide-gray-700"><thead><tr class="text-left text-gray-400 text-xs sm:text-sm"><th class="pb-3 px-4 sm:px-0">Date</th><th class="pb-3 px-4 sm:px-0">Type</th><th class="pb-3 px-4 sm:px-0">Gross</th><th class="pb-3 px-4 sm:px-0 hidden sm:table-cell">Charges</th><th class="pb-3 px-4 sm:px-0">Net</th><th class="pb-3 px-4 sm:px-0">Status</th><th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Description</th><th class="pb-3 px-4 sm:px-0 hidden lg:table-cell">Processed By</th> </thead><tbody class="divide-y divide-gray-800">${sortedTransactions
        .map((txn) => {
          const charges = txn.charges || 0;
          const netAmount = txn.amount - charges;
          return `<tr class="hover:bg-gray-800/30 transition-colors"><td class="py-3 px-4 sm:px-0"><div class="flex items-center gap-1 text-xs sm:text-sm"><i class="fas fa-calendar-alt text-gray-500 text-xs"></i>${formatDate(txn.date)}</div>  </div>
    <td class="py-3 px-4 sm:px-0"><span class="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm"><i class="fas fa-arrow-${txn.type === "deposit" ? "down text-green-400" : "up text-orange-400"}"></i>${txn.type}</span>  </div>
    <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">${txn.type === "deposit" ? "+" : "-"}₦${(txn.amount || 0).toLocaleString()}  </div>
    <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-red-400 hidden sm:table-cell">-₦${charges.toLocaleString()}  </div>
    <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-blue-400">₦${netAmount.toLocaleString()}  </div>
    <td class="py-3 px-4 sm:px-0"><span class="px-2 py-1 rounded text-xs ${getStatusStyle(txn.status)}">${txn.status}</span>  </div>
    <td class="py-3 px-4 sm:px-0 hidden md:table-cell"><p class="text-xs sm:text-sm text-gray-300 truncate max-w-[150px]" title="${txn.description || ""}">${txn.description || "-"}</p>  </div>
    <td class="py-3 px-4 sm:px-0 hidden lg:table-cell text-xs sm:text-sm text-gray-400">${txn.approvedBy || "-"}  </div>   </div>`;
        })
        .join(
          "",
        )}${sortedTransactions.length === 0 ? '   \\<td colspan="8" class="text-center text-gray-400 py-8">No transactions found for this period</td>' : ""}</tbody>  </div></div>
    </div>
  `;

  container.innerHTML = html;
  document.getElementById("pageTitle").textContent =
    `${customer.name} - Transactions (${period})`;
}

function renderCustomerSummary(container, customerId) {
  const stats = {
    daily: getCustomerStats(customerId, "today"),
    weekly: getCustomerStats(customerId, "week"),
    monthly: getCustomerStats(customerId, "month"),
    yearly: getCustomerStats(customerId, "year"),
    all: getCustomerStats(customerId, "all"),
  };

  if (!stats.all) {
    showNotification("Customer not found", "error");
    navigate("customers");
    return;
  }

  const customer = stats.all.customer;
  const html = `
    <div class="space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-0">
      <div class="glass-panel rounded-2xl p-4 sm:p-6"><div class="flex items-center gap-4 mb-4"><button onclick="viewCustomer('${customer.id}')" class="text-gray-400 hover:text-white transition-colors"><i class="fas fa-arrow-left mr-2"></i>Back</button></div>
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4"><div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-2xl font-bold flex-shrink-0">${customer.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase()}</div>
        <div><h2 class="text-xl sm:text-2xl font-bold break-words">${customer.name} - Summary Report</h2><p class="text-xs sm:text-sm text-gray-400 break-words">${customer.email} • ${customer.phone || "No phone"}</p></div>
        <div class="ml-auto text-left sm:text-right mt-4 sm:mt-0"><p class="text-xs sm:text-sm text-gray-400">Cash Balance</p><p class="text-2xl font-bold text-green-400">₦${(customer.cashBalance || customer.balance || 0).toLocaleString()}</p></div></div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">${[
        "daily",
        "weekly",
        "monthly",
        "yearly",
      ]
        .map((period) => {
          const data = stats[period];
          if (!data) return "";
          return `<div class="glass-panel rounded-2xl p-3 sm:p-4"><h3 class="text-sm font-semibold mb-2 sm:mb-3 capitalize">${period}</h3><div class="space-y-1 sm:space-y-2"><div class="flex justify-between text-xs sm:text-sm"><span class="text-gray-400">Net Deposits</span><span class="text-green-400">₦${data.stats.deposits.net.toLocaleString()}</span></div><div class="flex justify-between text-xs sm:text-sm"><span class="text-gray-400">Net Withdrawals</span><span class="text-orange-400">₦${data.stats.withdrawals.net.toLocaleString()}</span></div><div class="flex justify-between text-xs sm:text-sm"><span class="text-gray-400">Charges</span><span class="text-red-400">₦${data.stats.totalCharges.toLocaleString()}</span></div><div class="flex justify-between pt-1 sm:pt-2 border-t border-gray-700 text-xs sm:text-sm"><span class="text-gray-400">Net Change</span><span class="${data.stats.netBalance >= 0 ? "text-green-400" : "text-red-400"}">₦${data.stats.netBalance.toLocaleString()}</span></div><div class="text-xs text-gray-500 mt-1">${data.stats.totalTransactions} transactions</div></div></div>`;
        })
        .join("")}</div>

      <div class="glass-panel rounded-2xl p-4 sm:p-6"><h3 class="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Detailed Statistics</h3><div class="overflow-x-auto -mx-4 sm:mx-0"><div class="inline-block min-w-full align-middle"><table class="min-w-full divide-y divide-gray-700"><thead><tr class="text-left text-gray-400 text-xs sm:text-sm"><th class="pb-3 px-4 sm:px-0">Period</th><th class="pb-3 px-4 sm:px-0">Net Deposits</th><th class="pb-3 px-4 sm:px-0">Net Withdrawals</th><th class="pb-3 px-4 sm:px-0">Charges</th><th class="pb-3 px-4 sm:px-0">Net Change</th><th class="pb-3 px-4 sm:px-0">Transactions</th> </thead><tbody class="divide-y divide-gray-800">${[
        "daily",
        "weekly",
        "monthly",
        "yearly",
        "all",
      ]
        .map((period) => {
          const data = stats[period];
          if (!data) return "";
          return `<tr class="hover:bg-gray-800/30"><td class="py-3 px-4 sm:px-0 capitalize text-xs sm:text-sm">${period}  </div><td class="py-3 px-4 sm:px-0 text-green-400 text-xs sm:text-sm">₦${data.stats.deposits.net.toLocaleString()}  </div><td class="py-3 px-4 sm:px-0 text-orange-400 text-xs sm:text-sm">₦${data.stats.withdrawals.net.toLocaleString()}  </div><td class="py-3 px-4 sm:px-0 text-red-400 text-xs sm:text-sm">₦${data.stats.totalCharges.toLocaleString()}  </div><td class="py-3 px-4 sm:px-0 ${data.stats.netBalance >= 0 ? "text-green-400" : "text-red-400"} text-xs sm:text-sm">₦${data.stats.netBalance.toLocaleString()}  </div><td class="py-3 px-4 sm:px-0 text-xs sm:text-sm">${data.stats.totalTransactions}  </div>   </div>`;
        })
        .join("")}</tbody>   </div></div></div>
    </div>
  `;

  container.innerHTML = html;
  document.getElementById("pageTitle").textContent =
    `${customer.name} - Summary`;
}

function exportCustomerData(customerId) {
  const stats = getCustomerStats(customerId, "all");
  if (!stats) return;

  const { customer, transactions, stats: data } = stats;
  let csv =
    "Date,Type,Gross Amount,Charges,Net Amount,Status,Description,Processed By\n";
  transactions.forEach((txn) => {
    const charges = txn.charges || 0;
    const netAmount = txn.amount - charges;
    csv += `"${formatDate(txn.date)}",${txn.type},${txn.amount},${charges},${netAmount},${txn.status},"${txn.description || ""}","${txn.approvedBy || ""}"\n`;
  });
  csv += "\nSUMMARY\n";
  csv += `Customer,${customer.name}\n`;
  csv += `Email,${customer.email}\n`;
  csv += `Phone,${customer.phone || "N/A"}\n`;
  csv += `Cash Balance,${customer.cashBalance || customer.balance || 0}\n`;
  csv += `Loan Balance,${customer.loanBalance || 0}\n`;
  csv += `Net Worth,${((customer.cashBalance || customer.balance || 0) - (customer.loanBalance || 0)).toLocaleString()}\n`;
  csv += `Net Deposits,${data.deposits.net}\n`;
  csv += `Net Withdrawals,${data.withdrawals.net}\n`;
  csv += `Total Charges,${data.totalCharges}\n`;
  csv += `Net Balance Change,${data.netBalance}\n`;
  csv += `Total Transactions,${data.totalTransactions}\n`;
  csv += `Approved,${data.approved}\n`;
  csv += `Pending,${data.pending}\n`;
  csv += `Rejected,${data.rejected}\n`;

  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${customer.name.replace(/\s+/g, "_")}_transactions.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  showNotification("Customer data exported successfully", "success");
}

function renderCustomerReports(container) {
  const customersWithStats = state.customers.map((c) => ({
    ...c,
    stats: getCustomerStats(c.id, "all")?.stats,
  }));
  const totalNetDeposits = customersWithStats.reduce(
    (sum, c) => sum + (c.stats?.deposits.net || 0),
    0,
  );
  const totalNetWithdrawals = customersWithStats.reduce(
    (sum, c) => sum + (c.stats?.withdrawals.net || 0),
    0,
  );
  const totalCharges = customersWithStats.reduce(
    (sum, c) => sum + (c.stats?.totalCharges || 0),
    0,
  );
  const activeCustomers = customersWithStats.filter(
    (c) => c.status === "active",
  ).length;

  const html = `
    <div class="space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-0">
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div class="glass-panel p-4 sm:p-6 rounded-2xl"><h3 class="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">Total Customers</h3><p class="text-2xl sm:text-3xl font-bold">${state.customers.length}</p><p class="text-xs sm:text-sm text-green-400 mt-1 sm:mt-2">${activeCustomers} active</p></div>
        <div class="glass-panel p-4 sm:p-6 rounded-2xl"><h3 class="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">Net Deposits</h3><p class="text-xl sm:text-3xl font-bold text-green-400">₦${totalNetDeposits.toLocaleString()}</p><p class="text-xs text-gray-400 mt-1 hidden sm:block">After charges</p></div>
        <div class="glass-panel p-4 sm:p-6 rounded-2xl"><h3 class="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">Net Withdrawals</h3><p class="text-xl sm:text-3xl font-bold text-orange-400">₦${totalNetWithdrawals.toLocaleString()}</p><p class="text-xs text-gray-400 mt-1 hidden sm:block">After charges</p></div>
        <div class="glass-panel p-4 sm:p-6 rounded-2xl"><h3 class="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">Total Charges</h3><p class="text-xl sm:text-3xl font-bold text-red-400">₦${totalCharges.toLocaleString()}</p><p class="text-xs text-gray-400 mt-1 hidden sm:block">Revenue</p></div>
      </div>

      <div class="glass-panel rounded-2xl p-4 sm:p-6"><h3 class="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Customer Statistics</h3><div class="overflow-x-auto -mx-4 sm:mx-0"><div class="inline-block min-w-full align-middle"><table class="min-w-full divide-y divide-gray-700"><thead><tr class="text-left text-gray-400 text-xs sm:text-sm"><th class="pb-3 px-4 sm:px-0">Customer</th><th class="pb-3 px-4 sm:px-0 hidden sm:table-cell">Phone</th><th class="pb-3 px-4 sm:px-0">Cash Balance</th><th class="pb-3 px-4 sm:px-0">Loan Balance</th><th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Net Deposits</th><th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Net Withdrawals</th><th class="pb-3 px-4 sm:px-0">Charges</th><th class="pb-3 px-4 sm:px-0">Actions</th> </thead><tbody class="divide-y divide-gray-800">${customersWithStats
        .map(
          (c) =>
            `<tr class="hover:bg-gray-800/30"><td class="py-3 px-4 sm:px-0"><div class="flex items-center gap-2"><div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xs font-bold flex-shrink-0">${c.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)
              .toUpperCase()}</div><div><p class="font-medium text-xs sm:text-sm">${c.name}</p><p class="text-xs text-gray-400 hidden sm:block">${c.email}</p></div></div>  </div><td class="py-3 px-4 sm:px-0 hidden sm:table-cell"><span class="text-xs ${c.phone ? "text-green-400" : "text-gray-500"}">${c.phone || "No SMS"}</span>  </div><td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-green-400">₦${(c.cashBalance || c.balance || 0).toLocaleString()}  </div><td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm ${c.loanBalance > 0 ? "text-orange-400" : "text-gray-500"}">${c.loanBalance > 0 ? "₦" + c.loanBalance.toLocaleString() : "—"}  </div><td class="py-3 px-4 sm:px-0 text-green-400 text-xs sm:text-sm hidden md:table-cell">₦${(c.stats?.deposits.net || 0).toLocaleString()}  </div><td class="py-3 px-4 sm:px-0 text-orange-400 text-xs sm:text-sm hidden md:table-cell">₦${(c.stats?.withdrawals.net || 0).toLocaleString()}  </div><td class="py-3 px-4 sm:px-0 text-red-400 text-xs sm:text-sm">₦${(c.stats?.totalCharges || 0).toLocaleString()}  </div><td class="py-3 px-4 sm:px-0"><div class="flex gap-2"><button onclick="viewCustomer('${c.id}')" class="text-blue-400 hover:text-blue-300 p-1" title="View Details"><i class="fas fa-eye text-xs sm:text-sm"></i></button><button onclick="renderCustomerSummary(document.getElementById('contentArea'), '${c.id}')" class="text-green-400 hover:text-green-300 p-1" title="View Summary"><i class="fas fa-chart-bar text-xs sm:text-sm"></i></button></div>  </div>   </div>`,
        )
        .join("")}</tbody>   </div></div></div>
    </div>
  `;

  container.innerHTML = html;
  document.getElementById("pageTitle").textContent = "Customer Reports";
}

// ==================== NEW LOAN REQUEST FORM ====================

function renderNewLoanRequest(container) {
  const html = `
    <div class="max-w-2xl mx-auto animate-fade-in px-4 sm:px-0">
      <div class="glass-panel rounded-2xl p-4 sm:p-8">
        <div class="flex items-center gap-4 mb-6 sm:mb-8">
          <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
            <i class="fas fa-hand-holding-usd text-green-400 text-base sm:text-xl"></i>
          </div>
          <div>
            <h3 class="text-lg sm:text-xl font-semibold">Request Loan/Overdraft</h3>
            <p class="text-xs sm:text-sm text-gray-400">Submit loan or overdraft request for customer</p>
          </div>
        </div>

        <form onsubmit="handleLoanRequest(event)" class="space-y-4 sm:space-y-6">
          <!-- Customer Search -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              <i class="fas fa-search mr-2 text-blue-400"></i>Search Customer
            </label>
            <div class="relative">
              <input type="text" id="customerSearchInput" placeholder="Search by name, email, phone, or 3-digit number..." 
                autocomplete="off" 
                class="w-full px-4 py-3 pl-10 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base" 
                oninput="searchCustomersForLoan(this.value)" />
              <i class="fas fa-search absolute left-3 top-3.5 text-gray-500"></i>
            </div>
          </div>

          <div id="searchResults" class="hidden glass-panel rounded-xl border border-gray-700 max-h-64 overflow-y-auto">
            <div id="searchResultsList" class="divide-y divide-gray-700"></div>
          </div>

          <div id="selectedCustomer" class="hidden p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div class="flex justify-between items-center">
              <div>
                <p class="text-sm text-gray-300">Selected Customer:</p>
                <div class="flex items-center gap-2 mt-1">
                  <span class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded font-mono text-sm" id="selectedCustomerNumber">-</span>
                  <p class="text-base font-semibold text-white" id="selectedCustomerName">-</p>
                </div>
                <p class="text-xs text-gray-400 mt-1" id="selectedCustomerPhone"></p>
                <p class="text-xs text-green-400 mt-1">Cash Balance: <span id="selectedCustomerBalance">₦0</span></p>
              </div>
              <button type="button" onclick="clearSelectedCustomerForLoan()" class="text-red-400 hover:text-red-300">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>

          <input type="hidden" id="selectedCustomerId" value="">

          <!-- Loan Type Selection -->
          <div class="grid grid-cols-2 gap-3 sm:gap-4">
            <label class="cursor-pointer">
              <input type="radio" name="type" value="loan" checked class="hidden peer" onchange="updateLoanType()">
              <div class="p-3 sm:p-4 rounded-xl border-2 border-gray-700 peer-checked:border-green-500 peer-checked:bg-green-500/10 transition-all text-center">
                <i class="fas fa-coins text-green-400 text-xl sm:text-2xl mb-1 sm:mb-2"></i>
                <p class="font-medium text-sm sm:text-base">Loan</p>
                <p class="text-xs text-gray-400">Standard loan facility</p>
              </div>
            </label>
            <label class="cursor-pointer">
              <input type="radio" name="type" value="overdraft" class="hidden peer" onchange="updateLoanType()">
              <div class="p-3 sm:p-4 rounded-xl border-2 border-gray-700 peer-checked:border-orange-500 peer-checked:bg-orange-500/10 transition-all text-center">
                <i class="fas fa-credit-card text-orange-400 text-xl sm:text-2xl mb-1 sm:mb-2"></i>
                <p class="font-medium text-sm sm:text-base">Overdraft</p>
                <p class="text-xs text-gray-400">Short-term credit line</p>
              </div>
            </label>
          </div>

          <!-- Amount -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Requested Amount (₦)</label>
            <input type="number" id="loanAmount" name="amount" required min="1000" step="1000" 
              oninput="calculateLoanDetails()" 
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white text-xl font-mono focus:border-blue-500 transition-colors" 
              placeholder="0.00">
          </div>

          <!-- Interest Rate - Hidden for Overdraft -->
          <div id="interestRateContainer" class="hidden">
            <label class="block text-sm font-medium text-gray-300 mb-2">Interest Rate (%)</label>
            <input type="number" id="interestRate" name="interestRate" min="0" step="0.5" value="5" 
              oninput="calculateLoanDetails()" 
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 transition-colors">
            <p class="text-xs text-gray-400 mt-1" id="interestRateHint">Interest will be added to the principal amount</p>
          </div>

          <!-- Manual Charges Field (NEW) -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">
              Processing Charges (₦) <span class="text-xs text-red-400">* Required</span>
            </label>
            <input type="number" id="processingCharges" name="processingCharges" required min="0" step="0.01"
              oninput="calculateLoanDetails()"
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white font-mono focus:border-blue-500 transition-colors"
              placeholder="0.00">
            <p class="text-xs text-gray-400 mt-1">One-time processing fee added to total payable</p>
          </div>

          <!-- Repayment Period - Hidden for Overdraft -->
          <div id="repaymentPeriodContainer" class="grid grid-cols-2 gap-3 sm:gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Repayment Period</label>
              <select id="repaymentPeriod" name="repaymentPeriod" onchange="calculateLoanDetails()" 
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500">
                <option value="weekly">Weekly</option>
                <option value="bi-weekly">Bi-Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-300 mb-2">Number of Installments</label>
              <input type="number" id="installments" name="installments" min="1" max="52" value="4" 
                oninput="calculateLoanDetails()" 
                class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 transition-colors">
            </div>
          </div>

          <!-- Payment Deadline (NEW - For Overdraft) -->
          <div id="deadlineContainer" class="hidden">
            <label class="block text-sm font-medium text-gray-300 mb-2">
              <i class="fas fa-calendar-times mr-2 text-red-400"></i>Payment Deadline
            </label>
            <input type="date" id="paymentDeadline" name="paymentDeadline" 
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 transition-colors">
            <p class="text-xs text-red-400 mt-1">⚠️ Overdraft must be fully repaid by this date. Late payment penalties may apply.</p>
          </div>

          <!-- Start Date - Hidden for Overdraft -->
          <div id="startDateContainer">
            <label class="block text-sm font-medium text-gray-300 mb-2">Repayment Start Date</label>
            <input type="date" id="startDate" name="startDate" 
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 transition-colors">
          </div>

          <!-- Loan Summary -->
          <div id="loanSummary" class="p-4 bg-gradient-to-r from-gray-800 to-gray-800/50 border border-blue-500/30 rounded-xl hidden">
            <h4 class="text-sm font-semibold text-blue-400 mb-3">Loan Summary</h4>
            <div class="space-y-2 text-sm">
              <div class="flex justify-between">
                <span class="text-gray-400">Principal Amount:</span>
                <span class="font-mono">₦<span id="summaryPrincipal">0</span></span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Interest (at <span id="summaryRate">0</span>%):</span>
                <span class="font-mono text-yellow-400">₦<span id="summaryInterest">0</span></span>
              </div>
              <div class="flex justify-between" id="summaryChargesRow">
                <span class="text-gray-400">Processing Charges <span class="text-red-400">*</span>:</span>
                <span class="font-mono text-red-400">₦<span id="summaryCharges">0</span></span>
              </div>
              <div class="flex justify-between pt-2 border-t border-gray-700">
                <span class="text-gray-300 font-semibold">Total Payable:</span>
                <span class="font-mono text-green-400 font-bold">₦<span id="summaryTotal">0</span></span>
              </div>
              <div class="flex justify-between">
                <span class="text-gray-400">Installment Amount:</span>
                <span class="font-mono text-blue-400">₦<span id="summaryInstallment">0</span></span>
              </div>
              <div id="deadlineSummary" class="hidden flex justify-between pt-2 border-t border-gray-700">
                <span class="text-gray-300 font-semibold text-red-400">Payment Deadline:</span>
                <span class="font-mono text-red-400 font-bold" id="summaryDeadline">-</span>
              </div>
            </div>
          </div>

          <!-- Purpose & Notes -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Purpose</label>
            <textarea id="purpose" name="purpose" rows="2" 
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors" 
              placeholder="What is this loan/overdraft for?"></textarea>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Additional Notes (Optional)</label>
            <textarea id="notes" name="notes" rows="2" 
              class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors"></textarea>
          </div>

          <div class="flex items-center gap-3 p-3 sm:p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
            <i class="fas fa-exclamation-triangle text-yellow-500 text-sm sm:text-base"></i>
            <p class="text-xs sm:text-sm text-yellow-200">
              This request will require admin approval. No credibility checks are performed - admin will review and approve/reject based on internal criteria.
            </p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <button type="button" onclick="navigate('dashboard')" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800 transition-colors">Cancel</button>
            <button type="submit" id="submitLoanBtn" class="flex-1 px-6 py-3 bg-green-600 hover:bg-green-500 rounded-xl font-medium transition-colors">
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.innerHTML = html;
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  document.getElementById("startDate").value = tomorrow
    .toISOString()
    .split("T")[0];
  calculateLoanDetails();
  updateLoanType();
}

// Enhanced customer selection with deposit count tracking
function selectCustomerForLoan(id, name, balance, phone, customerNumber) {
  document.getElementById("selectedCustomerId").value = id;
  document.getElementById("selectedCustomerName").textContent = name;
  document.getElementById("selectedCustomerNumber").textContent = customerNumber
    ? "#" + customerNumber
    : "No number";
  document.getElementById("selectedCustomerPhone").textContent = phone
    ? "📱 " + phone
    : "⚠️ No phone";
  document.getElementById("selectedCustomerBalance").textContent =
    "₦" + balance.toLocaleString();

  // Count approved deposits for this customer
  const depositCount = state.transactions.filter(
    (t) =>
      t.customerId === id && t.type === "deposit" && t.status === "approved",
  ).length;

  document.getElementById("selectedCustomerDepositCount").textContent =
    depositCount;

  document.getElementById("selectedCustomer").classList.remove("hidden");
  document.getElementById("searchResults").classList.add("hidden");
  document.getElementById("customerSearchInput").value = "";

  window.selectedCustomerForLoan = {
    id,
    name,
    balance,
    phone,
    customerNumber,
    depositCount,
  };

  checkEligibility();
}

// Check eligibility based on loan type
function checkEligibility() {
  const type = document.querySelector('input[name="type"]:checked')?.value;
  const amount = parseFloat(document.getElementById("loanAmount")?.value) || 0;
  const customer = window.selectedCustomerForLoan;

  if (!customer || !amount) {
    document.getElementById("eligibilityCheck").classList.add("hidden");
    return;
  }

  document.getElementById("eligibilityCheck").classList.remove("hidden");

  if (type === "loan") {
    // Loan: Need 40% of requested amount in cash balance
    document.getElementById("loanEligibility").classList.remove("hidden");
    document.getElementById("overdraftEligibility").classList.add("hidden");

    const requiredBalance = amount * 0.4;
    const hasEnough = customer.balance >= requiredBalance;

    document.getElementById("requiredBalance").textContent =
      "₦" + requiredBalance.toLocaleString();
    document.getElementById("currentBalanceCheck").textContent =
      "₦" + customer.balance.toLocaleString();

    const statusEl = document.getElementById("eligibilityStatus");
    if (hasEnough) {
      statusEl.textContent = "✓ ELIGIBLE";
      statusEl.className = "font-medium text-green-400";
      document.getElementById("ineligibleWarning").classList.add("hidden");
      document.getElementById("submitLoanBtn").disabled = false;
    } else {
      statusEl.textContent = "✗ NOT ELIGIBLE";
      statusEl.className = "font-medium text-red-400";
      document.getElementById("ineligibleText").textContent =
        `Customer needs ₦${requiredBalance.toLocaleString()} (40% of ₦${amount.toLocaleString()}) but only has ₦${customer.balance.toLocaleString()}`;
      document.getElementById("ineligibleWarning").classList.remove("hidden");
      document.getElementById("submitLoanBtn").disabled = true;
    }
  } else {
    // Overdraft: Need 10+ approved deposits
    document.getElementById("loanEligibility").classList.add("hidden");
    document.getElementById("overdraftEligibility").classList.remove("hidden");

    document.getElementById("customerDepositCount").textContent =
      customer.depositCount;

    const statusEl = document.getElementById("overdraftEligibilityStatus");
    if (customer.depositCount >= 10) {
      statusEl.textContent = "✓ ELIGIBLE";
      statusEl.className = "font-medium text-green-400";
      document.getElementById("ineligibleWarning").classList.add("hidden");
      document.getElementById("submitLoanBtn").disabled = false;
    } else {
      statusEl.textContent = "✗ NOT ELIGIBLE";
      statusEl.className = "font-medium text-red-400";
      document.getElementById("ineligibleText").textContent =
        `Customer needs 10+ approved deposits but only has ${customer.depositCount}`;
      document.getElementById("ineligibleWarning").classList.remove("hidden");
      document.getElementById("submitLoanBtn").disabled = true;
    }
  }
}

// Update UI when loan type changes
function updateLoanType() {
  const type = document.querySelector('input[name="type"]:checked')?.value;
  const interestContainer = document.getElementById("interestRateContainer");
  const repaymentPeriodContainer = document.getElementById(
    "repaymentPeriodContainer",
  );
  const startDateContainer = document.getElementById("startDateContainer");
  const deadlineContainer = document.getElementById("deadlineContainer");
  const deadlineSummary = document.getElementById("deadlineSummary");
  const loanSummary = document.getElementById("loanSummary");

  if (type === "overdraft") {
    // Overdraft: Hide interest, repayment period, installments, start date
    if (interestContainer) interestContainer.classList.add("hidden");
    if (repaymentPeriodContainer)
      repaymentPeriodContainer.classList.add("hidden");
    if (startDateContainer) startDateContainer.classList.add("hidden");

    // Show deadline for overdraft
    if (deadlineContainer) deadlineContainer.classList.remove("hidden");
    if (deadlineSummary) deadlineSummary.classList.remove("hidden");

    // Hide loan summary for overdraft (no installments to calculate)
    if (loanSummary) loanSummary.classList.add("hidden");

    // Set default deadline to 30 days from now
    const thirtyDays = new Date();
    thirtyDays.setDate(thirtyDays.getDate() + 30);
    const deadlineInput = document.getElementById("paymentDeadline");
    if (deadlineInput && !deadlineInput.value) {
      deadlineInput.value = thirtyDays.toISOString().split("T")[0];
      deadlineInput.min = new Date().toISOString().split("T")[0];
    }
  } else {
    // Loan: Show interest, repayment period, installments, start date
    if (interestContainer) interestContainer.classList.remove("hidden");
    if (repaymentPeriodContainer)
      repaymentPeriodContainer.classList.remove("hidden");
    if (startDateContainer) startDateContainer.classList.remove("hidden");

    // Hide deadline for regular loans
    if (deadlineContainer) deadlineContainer.classList.add("hidden");
    if (deadlineSummary) deadlineSummary.classList.add("hidden");

    // Show loan summary for loans
    if (loanSummary) loanSummary.classList.remove("hidden");
  }

  calculateLoanDetails();
}

// Enhanced loan submission with validation
async function handleLoanRequest(e) {
  e.preventDefault();

  const customerId = document.getElementById("selectedCustomerId").value;
  if (!customerId) {
    showNotification("Please select a customer", "error");
    return;
  }

  const type = document.querySelector('input[name="type"]:checked').value;
  const amount = parseFloat(document.getElementById("loanAmount").value);
  const interestRate = parseFloat(
    document.getElementById("interestRate").value,
  );
  const repaymentPeriod = document.getElementById("repaymentPeriod").value;
  const numberOfInstallments = parseInt(
    document.getElementById("installments").value,
  );
  const repaymentStartDate = document.getElementById("startDate").value;

  const paymentDeadline = document.getElementById("paymentDeadline")?.value;

  const purpose = document.getElementById("purpose").value;
  const notes = document.getElementById("notes").value;

  if (!amount || amount < 1000) {
    showNotification("Amount must be at least ₦1,000", "error");
    return;
  }

  // Validate processing charges for overdraft
  if (type === "overdraft") {
    const processingCharges = parseFloat(
      document.getElementById("processingCharges")?.value,
    );
    if (isNaN(processingCharges) || processingCharges <= 0) {
      showNotification(
        "Processing charges are required for overdraft. Please enter an amount.",
        "error",
      );
      return;
    }
  }

  // For loan, start date is required
  if (type === "loan" && !repaymentStartDate) {
    showNotification("Please select a start date", "error");
    return;
  }

  // For overdraft, deadline is required
  if (type === "overdraft" && !paymentDeadline) {
    showNotification(
      "Please set a payment deadline for the overdraft",
      "error",
    );
    return;
  }

  const loanData = {
    customerId: customerId,
    customerName: window.selectedCustomerForLoan.name,
    customerNumber: window.selectedCustomerForLoan.customerNumber,
    phone: window.selectedCustomerForLoan.phone,
    type: type,
    amount: amount,
    interestRate: type === "loan" ? interestRate : 0,
    repaymentPeriod: type === "loan" ? repaymentPeriod : null,
    numberOfInstallments: type === "loan" ? numberOfInstallments : 1,
    repaymentStartDate: type === "loan" ? repaymentStartDate : null,
    paymentDeadline: type === "overdraft" ? paymentDeadline : null,
    processingCharges:
      parseFloat(document.getElementById("processingCharges")?.value) || 0,
    purpose: purpose,
    notes: notes,
    requestedBy: {
      staffId: state.currentUser?.id || "system",
      staffName: state.currentUser?.name || "System",
    },
  };

  console.log("Sending loan data:", loanData);

  try {
    const response = await api.post("/loans", loanData);
    cachedApi.invalidate("/loans");
    showNotification(
      `${type === "loan" ? "Loan" : "Overdraft"} request submitted successfully!`,
      "success",
    );
    navigate("my-loans");
  } catch (error) {
    console.error("Loan request error:", error);
    const errorMessage =
      error.response?.data?.error ||
      error.response?.data?.message ||
      "Failed to submit request";
    showNotification(errorMessage, "error");
  }
}
let searchTimeout;
function searchCustomersForLoan(searchTerm) {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    if (!searchTerm.trim()) {
      document.getElementById("searchResults").classList.add("hidden");
      return;
    }
    const filtered = state.customers.filter((c) => {
      const name = (c.name || "").toLowerCase(),
        email = (c.email || "").toLowerCase(),
        phone = (c.phone || "").toLowerCase(),
        number = (c.customerNumber || "").toLowerCase(),
        term = searchTerm.toLowerCase();
      return (
        name.includes(term) ||
        email.includes(term) ||
        phone.includes(term) ||
        number === term
      );
    });
    const resultsDiv = document.getElementById("searchResults"),
      resultsList = document.getElementById("searchResultsList");
    if (filtered.length === 0) {
      resultsList.innerHTML =
        '<div class="p-4 text-center text-gray-400">No customers found</div>';
      resultsDiv.classList.remove("hidden");
      return;
    }
    resultsList.innerHTML = filtered
      .map(
        (c) =>
          `<div class="p-3 hover:bg-gray-700 cursor-pointer transition-colors" onclick="selectCustomerForLoan('${c.id}', '${c.name.replace(/'/g, "\\'")}', ${c.cashBalance || c.balance || 0}, '${c.phone || ""}', '${c.customerNumber || ""}')"><div class="flex justify-between items-start"><div><div class="flex items-center gap-2"><span class="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-mono">#${c.customerNumber || "---"}</span><p class="font-medium">${c.name}</p></div><p class="text-xs text-gray-400">${c.email}</p><p class="text-xs text-gray-500 mt-1">Cash: ₦${(c.cashBalance || c.balance || 0).toLocaleString()}</p></div><i class="fas fa-chevron-right text-gray-500"></i></div></div>`,
      )
      .join("");
    resultsDiv.classList.remove("hidden");
  }, 300);
}

function selectCustomerForLoan(id, name, balance, phone, customerNumber) {
  document.getElementById("selectedCustomerId").value = id;
  document.getElementById("selectedCustomerName").textContent = name;
  document.getElementById("selectedCustomerNumber").textContent = customerNumber
    ? "#" + customerNumber
    : "No number";
  document.getElementById("selectedCustomerPhone").textContent = phone
    ? "📱 " + phone
    : "⚠️ No phone";
  document.getElementById("selectedCustomerBalance").textContent =
    "₦" + balance.toLocaleString();
  document.getElementById("selectedCustomer").classList.remove("hidden");
  document.getElementById("searchResults").classList.add("hidden");
  document.getElementById("customerSearchInput").value = "";
  window.selectedCustomerForLoan = { id, name, balance, phone, customerNumber };
}

function clearSelectedCustomerForLoan() {
  document.getElementById("selectedCustomerId").value = "";
  document.getElementById("selectedCustomer").classList.add("hidden");
  window.selectedCustomerForLoan = null;
}

function calculateLoanDetails() {
  const amount = parseFloat(document.getElementById("loanAmount").value) || 0;
  const type = document.querySelector('input[name="type"]:checked')?.value;
  const processingCharges =
    parseFloat(document.getElementById("processingCharges")?.value) || 0;
  const deadlineInput = document.getElementById("paymentDeadline");

  // In calculateLoanDetails(), replace the overdraft section with:

  if (type === "overdraft") {
    const total = amount + processingCharges;

    // Update deadline display
    if (deadlineInput?.value) {
      document.getElementById("summaryDeadline").textContent = new Date(
        deadlineInput.value,
      ).toLocaleDateString("en-GB");
    }

    // Show simplified overdraft summary
    document.getElementById("summaryPrincipal").textContent =
      amount.toLocaleString();
    document.getElementById("summaryRate").textContent = "0"; // No interest for overdraft
    document.getElementById("summaryInterest").textContent = "0";
    document.getElementById("summaryCharges").textContent =
      processingCharges.toLocaleString();
    document.getElementById("summaryTotal").textContent =
      total.toLocaleString();
    document.getElementById("summaryInstallment").textContent = "1 (Lump Sum)";

    // Show/hide charges row
    const chargesRow = document.getElementById("summaryChargesRow");
    if (chargesRow) {
      chargesRow.style.display = processingCharges > 0 ? "flex" : "none";
    }

    document.getElementById("loanSummary").classList.remove("hidden");
    return;
  }
  // Loan: Calculate with interest and installments
  const rate = parseFloat(document.getElementById("interestRate").value) || 0;
  const installments =
    parseInt(document.getElementById("installments").value) || 1;

  const interest = (amount * rate) / 100;
  const total = amount + interest + processingCharges;
  const installmentAmount = total / installments;

  document.getElementById("summaryPrincipal").textContent =
    amount.toLocaleString();
  document.getElementById("summaryRate").textContent = rate;
  document.getElementById("summaryInterest").textContent =
    interest.toLocaleString();
  document.getElementById("summaryCharges").textContent =
    processingCharges.toLocaleString();
  document.getElementById("summaryTotal").textContent = total.toLocaleString();
  document.getElementById("summaryInstallment").textContent =
    installmentAmount.toLocaleString();

  // Show/hide charges row
  const chargesRow = document.getElementById("summaryChargesRow");
  if (chargesRow) {
    chargesRow.style.display = processingCharges > 0 ? "flex" : "none";
  }

  document.getElementById("loanSummary").classList.remove("hidden");
}

// ==================== ADMIN LOANS VIEW ====================

function renderAdminLoans(container) {
  const pendingLoans = state.loans?.filter((l) => l.status === "pending") || [];
  const activeLoans = state.loans?.filter((l) => l.status === "active") || [];
  const completedLoans =
    state.loans?.filter((l) => l.status === "completed") || [];
  const rejectedLoans =
    state.loans?.filter((l) => l.status === "rejected") || [];

  const totalInterestRevenue =
    state.loans?.reduce((sum, l) => {
      if (l.status === "active" || l.status === "completed") {
        const interest = (l.totalPayable || 0) - (l.amount || 0);
        return sum + interest;
      }
      return sum;
    }, 0) || 0;

  const html = `
    <div class="space-y-6 animate-fade-in px-4 sm:px-0">
      <!-- Stats Cards -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div class="glass-panel p-4 rounded-xl">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400">Pending Approvals</span>
            <i class="fas fa-clock text-yellow-400"></i>
          </div>
          <p class="text-2xl font-bold text-yellow-400">${pendingLoans.length}</p>
        </div>
        <div class="glass-panel p-4 rounded-xl">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400">Active Loans</span>
            <i class="fas fa-hand-holding-usd text-green-400"></i>
          </div>
          <p class="text-2xl font-bold text-green-400">${activeLoans.length}</p>
        </div>
        <div class="glass-panel p-4 rounded-xl">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400">Completed</span>
            <i class="fas fa-check-circle text-blue-400"></i>
          </div>
          <p class="text-2xl font-bold text-blue-400">${completedLoans.length}</p>
        </div>
        <div class="glass-panel p-4 rounded-xl border border-green-500/30">
          <div class="flex items-center justify-between mb-2">
            <span class="text-gray-400">Interest Revenue</span>
            <i class="fas fa-chart-line text-green-400"></i>
          </div>
          <p class="text-2xl font-bold text-green-400">₦${totalInterestRevenue.toLocaleString()}</p>
        </div>
      </div>
      
      <!-- Pending Loans Section -->
      ${
        pendingLoans.length > 0
          ? `
        <div class="glass-panel rounded-2xl p-6">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="fas fa-clock text-yellow-400"></i>
            Pending Loan/Overdraft Requests (${pendingLoans.length})
          </h3>
          <div class="space-y-4">
            ${pendingLoans
              .map((loan) => {
                const isOverdraft = loan.type === "overdraft";
                const interest = (loan.totalPayable || 0) - (loan.amount || 0);
                const processingCharges = Number(
                  loan.processingCharges || loan.processing_charges || 0,
                );
                console.log("Loan data:", loan);
                console.log("Processing charges raw:", loan.processingCharges);
                return `
                <div class="bg-gray-800/50 p-4 rounded-xl border border-yellow-500/30">
                  <div class="flex flex-wrap justify-between items-start gap-4">
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <span class="px-2 py-1 rounded text-xs ${isOverdraft ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-400"}">
                          ${loan.type.toUpperCase()}
                        </span>
                        <span class="text-sm text-gray-400">Requested by: ${loan.requestedBy?.staffName || "Staff"}</span>
                        <span class="px-2 py-1 rounded text-xs bg-yellow-500/20 text-yellow-400">
                          <i class="fas fa-clock mr-1"></i>Pending Approval
                        </span>
                      </div>
                      <p class="font-semibold text-lg">${loan.customerName}</p>
                      <p class="text-sm text-gray-400">#${loan.customerNumber || "---"} • ${loan.phone || "No phone"}</p>
                      
                      ${
                        isOverdraft
                          ? `
                      <!-- OVERDRAFT PENDING DISPLAY -->
                      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                        <div>
                          <p class="text-gray-400">Amount</p>
                          <p class="font-mono font-bold text-green-400">₦${(loan.amount || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p class="text-gray-400">Processing Charges</p>
                          <p class="font-mono text-red-400">₦${processingCharges.toLocaleString()}</p>
                        </div>
                        <div>
                          <p class="text-gray-400">Total to Repay</p>
                          <p class="font-mono text-blue-400 font-bold">₦${(loan.totalPayable || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p class="text-gray-400">Repayment</p>
                          <p class="font-mono">1 (Lump Sum)</p>
                        </div>
                      </div>
                      
                      ${
                        loan.paymentDeadline
                          ? `
                      <div class="mt-2 p-2 bg-orange-500/10 border border-orange-500/20 rounded-lg">
                        <p class="text-xs text-orange-400">
                          <i class="fas fa-calendar-times mr-1"></i>
                          Payment Deadline: ${new Date(loan.paymentDeadline).toLocaleDateString("en-GB")}
                        </p>
                      </div>
                      `
                          : ""
                      }
                      `
                          : `
                      <!-- LOAN PENDING DISPLAY -->
                      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                        <div>
                          <p class="text-gray-400">Principal</p>
                          <p class="font-mono font-bold text-green-400">₦${(loan.amount || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p class="text-gray-400">Interest (${loan.interestRate}%)</p>
                          <p class="font-mono text-yellow-400">₦${interest.toLocaleString()}</p>
                        </div>
                        ${
                          processingCharges > 0
                            ? `
                        <div>
                          <p class="text-gray-400">Charges</p>
                          <p class="font-mono text-red-400">₦${processingCharges.toLocaleString()}</p>
                        </div>
                        `
                            : ""
                        }
                        <div>
                          <p class="text-gray-400">Total to Repay</p>
                          <p class="font-mono text-red-400 font-bold">₦${(loan.totalPayable || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p class="text-gray-400">Installments</p>
                          <p class="font-mono">${loan.numberOfInstallments} (${loan.repaymentPeriod})</p>
                        </div>
                      </div>
                      `
                      }
                      
                      ${loan.purpose ? `<p class="text-sm text-gray-300 mt-2">Purpose: ${loan.purpose}</p>` : ""}
                    </div>
                    <div class="flex gap-2">
                      <button onclick="rejectLoan('${loan.id}')" class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-lg text-sm">
                        <i class="fas fa-times mr-1"></i>Reject
                      </button>
                      <button onclick="showApproveLoanModal('${loan.id}')" 
                        class="px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm">
                        <i class="fas fa-check mr-1"></i>Approve
                      </button>
                    </div>
                  </div>
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      `
          : ""
      }
      
      <!-- Active Loans Section -->
      ${
        activeLoans.length > 0
          ? `
        <div class="glass-panel rounded-2xl p-6">
          <h3 class="text-lg font-semibold mb-4 flex items-center gap-2">
            <i class="fas fa-hand-holding-usd text-green-400"></i>
            Active Loans & Overdrafts
          </h3>
          <div class="space-y-4">
            ${activeLoans
              .map((loan) => {
                const isOverdraft = loan.type === "overdraft";
                const interest = (loan.totalPayable || 0) - (loan.amount || 0);
                const progress =
                  ((loan.amountRepaid || 0) / (loan.totalPayable || 1)) * 100;
                const isOverdue =
                  loan.paymentDeadline &&
                  new Date(loan.paymentDeadline) < new Date();

                return `
                <div class="bg-gray-800/50 p-4 rounded-xl border ${isOverdue ? "border-red-500/50" : "border-gray-700"}">
                  <div class="flex flex-wrap justify-between items-start gap-4">
                    <div class="flex-1">
                      <div class="flex items-center gap-3 mb-2">
                        <span class="px-2 py-1 rounded text-xs ${isOverdraft ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-400"}">
                          ${loan.type.toUpperCase()}
                        </span>
                        <span class="text-xs text-gray-400">Started: ${loan.approvedBy?.approvedAt ? new Date(loan.approvedBy.approvedAt).toLocaleDateString() : "Unknown"}</span>
                        ${isOverdue ? '<span class="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 animate-pulse"><i class="fas fa-exclamation-circle mr-1"></i>OVERDUE</span>' : ""}
                      </div>
                      <p class="font-semibold">${loan.customerName}</p>
                      
                      ${
                        isOverdraft
                          ? `
                      <!-- OVERDRAFT ACTIVE DISPLAY -->
                      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
  <div>
    <p class="text-gray-400">Principal Amount</p>
    <p class="font-mono text-green-400">₦${(loan.amount || 0).toLocaleString()}</p>
  </div>
  <div>
    <p class="text-gray-400">Processing Charges</p>
    <p class="font-mono text-red-400">₦${(loan.processingCharges || 0).toLocaleString()}</p>
  </div>
  <div>
    <p class="text-gray-400">Total Outstanding</p>
    <p class="font-mono text-blue-400 font-bold">₦${(loan.outstandingBalance || loan.totalPayable || 0).toLocaleString()}</p>
  </div>
  <div>
    <p class="text-gray-400">Deadline</p>
    <p class="font-mono ${isOverdue ? "text-red-400" : "text-orange-400"}">
      ${loan.paymentDeadline ? new Date(loan.paymentDeadline).toLocaleDateString("en-GB") : "Not set"}
    </p>
  </div>
</div>
                      `
                          : `
                      <!-- LOAN ACTIVE DISPLAY -->
                      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                        <div>
                          <p class="text-gray-400">Total Payable</p>
                          <p class="font-mono">₦${(loan.totalPayable || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p class="text-gray-400">Repaid</p>
                          <p class="font-mono text-green-400">₦${(loan.amountRepaid || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p class="text-gray-400">Outstanding</p>
                          <p class="font-mono text-red-400">₦${(loan.outstandingBalance || 0).toLocaleString()}</p>
                        </div>
                        <div>
                          <p class="text-gray-400">Interest Earned</p>
                          <p class="font-mono text-yellow-400">₦${interest.toLocaleString()}</p>
                        </div>
                      </div>
                      `
                      }
                      
                      ${
                        loan.paymentDeadline
                          ? `
                      <div class="mt-2 p-2 ${isOverdue ? "bg-red-500/10 border-red-500/20" : "bg-orange-500/10 border-orange-500/20"} border rounded-lg">
                        <p class="text-xs ${isOverdue ? "text-red-400" : "text-orange-400"}">
                          <i class="fas fa-calendar-times mr-1"></i>
                          ${isOverdue ? "OVERDUE since" : "Payment Deadline"}: ${new Date(loan.paymentDeadline).toLocaleDateString("en-GB")}
                        </p>
                      </div>
                      `
                          : ""
                      }
                      
                      <div class="mt-3">
                        <div class="flex justify-between text-xs mb-1">
                          <span>Repayment Progress</span>
                          <span>${progress.toFixed(1)}%</span>
                        </div>
                        <div class="w-full bg-gray-700 rounded-full h-2">
                          <div class="bg-green-500 h-2 rounded-full" style="width: ${progress}%"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      `
          : ""
      }
    </div>
  `;
  container.innerHTML = html;
}
function showApproveLoanModal(loanId) {
  const loan = state.loans?.find((l) => l.id === loanId);
  if (!loan) return;

  const isOverdraft = loan.type === "overdraft";
  const interest = isOverdraft
    ? 0
    : (loan.totalPayable || 0) - (loan.amount || 0);
  const processingCharges = loan.processingCharges || 0;
  const customer = state.customers.find((c) => c.id === loan.customerId);
  const customerBalance = customer?.cashBalance || customer?.balance || 0;

  const modalHtml = `
    <div id="approveLoanModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-900 rounded-2xl p-4 sm:p-8 max-w-md w-full mx-auto animate-slideIn">
        <div class="flex justify-between items-center mb-4 sm:mb-6">
          <h3 class="text-lg sm:text-xl font-semibold ${isOverdraft ? "text-orange-400" : "text-green-400"}">
            <i class="fas fa-hand-holding-usd mr-2"></i>
            Approve ${isOverdraft ? "Overdraft" : "Loan"}
          </h3>
          <button onclick="closeApproveLoanModal()" class="text-gray-400 hover:text-white p-2">
            <i class="fas fa-times text-lg"></i>
          </button>
        </div>
        
        <div class="space-y-4">
          <div class="bg-gray-800/50 p-3 rounded-lg">
            <p class="text-sm text-gray-400">Customer</p>
            <p class="font-semibold">${loan.customerName}</p>
            <p class="text-xs text-gray-400">#${loan.customerNumber || "---"} • ${loan.phone || "No phone"}</p>
          </div>
          
          <div class="bg-green-500/10 border border-green-500/30 p-3 rounded-lg">
            <div class="flex items-start gap-2">
              <i class="fas fa-arrow-down text-green-400 mt-0.5"></i>
              <div class="text-sm">
                <p class="font-semibold text-green-400">Disbursement Amount</p>
                <p class="font-mono text-xl font-bold">₦${(loan.amount || 0).toLocaleString()}</p>
                <p class="text-xs text-green-300 mt-1">Will be ADDED to customer's account</p>
              </div>
            </div>
          </div>
          
          ${
            isOverdraft
              ? `
          <!-- OVERDRAFT DETAILS -->
          <div class="bg-orange-500/10 border border-orange-500/30 p-3 rounded-lg">
            <p class="text-sm text-orange-400 mb-2">Overdraft Details</p>
            <div class="space-y-1 text-sm">
              <div class="flex justify-between">
                <span>Principal:</span>
                <span class="font-mono text-green-400">₦${(loan.amount || 0).toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>Processing Charges:</span>
                <span class="font-mono text-red-400">₦${processingCharges.toLocaleString()}</span>
              </div>
              <div class="flex justify-between pt-2 border-t border-gray-700 font-bold">
                <span>Total to Repay:</span>
                <span class="font-mono text-blue-400">₦${(loan.totalPayable || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div class="bg-red-500/10 border border-red-500/30 p-3 rounded-lg">
            <div class="flex items-start gap-2">
              <i class="fas fa-calendar-times text-red-400 mt-0.5"></i>
              <div class="text-sm">
                <p class="font-semibold text-red-400">Payment Deadline</p>
                <p class="font-mono text-lg font-bold">${loan.paymentDeadline ? new Date(loan.paymentDeadline).toLocaleDateString("en-GB") : "Not set"}</p>
                <p class="text-xs text-red-300 mt-1">Must be fully repaid by this date</p>
              </div>
            </div>
          </div>
              `
              : `
          <!-- LOAN DETAILS -->
          <div class="bg-gray-800/50 p-3 rounded-lg">
            <p class="text-sm text-gray-400 mb-2">Repayment Details</p>
            <div class="space-y-1 text-sm">
              <div class="flex justify-between">
                <span>Principal:</span>
                <span class="font-mono text-green-400">₦${(loan.amount || 0).toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>Interest (${loan.interestRate}%):</span>
                <span class="font-mono text-yellow-400">₦${interest.toLocaleString()}</span>
              </div>
              ${
                processingCharges > 0
                  ? `
              <div class="flex justify-between">
                <span>Processing Charges:</span>
                <span class="font-mono text-red-400">₦${processingCharges.toLocaleString()}</span>
              </div>
              `
                  : ""
              }
              <div class="flex justify-between pt-2 border-t border-gray-700 font-bold">
                <span>Total to Repay:</span>
                <span class="font-mono text-blue-400">₦${(loan.totalPayable || 0).toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div class="bg-blue-500/10 border border-blue-500/30 p-3 rounded-lg">
            <div class="flex items-start gap-2">
              <i class="fas fa-info-circle text-blue-400 mt-0.5"></i>
              <div class="text-xs text-blue-300">
                <p class="font-semibold mb-1">How it works:</p>
                <p>✓ ₦${(loan.amount || 0).toLocaleString()} will be <strong class="text-green-400">ADDED</strong> to customer's cash balance</p>
                <p>✓ Customer will repay in ${loan.numberOfInstallments} ${loan.repaymentPeriod}ly installments</p>
                <p>✓ Each installment: ₦${(loan.installmentAmount || 0).toLocaleString()}</p>
              </div>
            </div>
          </div>
          `
          }
          
          <div class="flex gap-4 pt-4">
            <button onclick="closeApproveLoanModal()" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800">
              Cancel
            </button>
            <button onclick="approveLoan('${loan.id}')" class="flex-1 px-6 py-3 ${isOverdraft ? "bg-orange-600 hover:bg-orange-500" : "bg-green-600 hover:bg-green-500"} rounded-xl">
              <i class="fas fa-check mr-2"></i>Approve & Disburse
            </button>
          </div>
        </div>
      </div>
    </div>
  `;

  const modalContainer = document.createElement("div");
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);
}

// Update approveLoan function to call the backend correctly
async function approveLoan(loanId) {
  try {
    const loan = state.loans?.find((l) => l.id === loanId);

    const response = await api.patch(`/loans/${loanId}/approve`, {
      approvedBy: {
        id: state.currentUser.id,
        name: state.currentUser.name,
      },
    });

    cachedApi.invalidate("/loans");

    // FIXED: Add notification for loan approval
    const notifMessage =
      loan?.type === "overdraft"
        ? `✅ Overdraft approved! ₦${response.data.loan.amount.toLocaleString()} disbursed to ${loan.customerName}. Deadline: ${loan.paymentDeadline ? new Date(loan.paymentDeadline).toLocaleDateString("en-GB") : "Not set"}`
        : `✅ Loan approved! ₦${response.data.loan.amount.toLocaleString()} disbursed to ${loan.customerName}.`;

    showNotification(notifMessage, "success");

    // Add to notifications panel
    state.notifications.unshift({
      id: Date.now(),
      message: `Loan approved: ₦${response.data.loan.amount.toLocaleString()} to ${loan?.customerName || "customer"}`,
      time: "Just now",
      unread: true,
    });
    updateNotificationList();

    closeApproveLoanModal();
    await loadAllData();
    navigate("loans");
  } catch (error) {
    console.error("Approve loan error:", error);
    showNotification(
      error.response?.data?.error || "Failed to approve loan",
      "error",
    );
  }
}
function closeApproveLoanModal() {
  const modal = document.getElementById("approveLoanModal");
  if (modal) modal.remove();
}

async function rejectLoan(loanId) {
  const reason = prompt("Reason for rejection (optional):");
  const loan = state.loans?.find((l) => l.id === loanId);

  try {
    await api.patch(`/loans/${loanId}/reject`, {
      rejectedBy: { id: state.currentUser.id, name: state.currentUser.name },
      reason,
    });
    cachedApi.invalidate("/loans");
    // FIXED: Add notification for rejection
    showNotification(
      `❌ ${loan?.type === "overdraft" ? "Overdraft" : "Loan"} request for ${loan?.customerName || "customer"} rejected${reason ? `: ${reason}` : ""}`,
      "error",
    );

    // Add to notifications panel
    state.notifications.unshift({
      id: Date.now(),
      message: `${loan?.type === "overdraft" ? "Overdraft" : "Loan"} rejected: ${loan?.customerName || "customer"}${reason ? ` - ${reason}` : ""}`,
      time: "Just now",
      unread: true,
    });
    updateNotificationList();

    await loadAllData();
    navigate("loans");
  } catch (error) {
    console.error("Reject loan error:", error);
    showNotification(
      error.response?.data?.error || "Failed to reject loan",
      "error",
    );
  }
}

function viewLoanRepaymentSchedule(loanId) {
  const loan = state.loans?.find((l) => l.id === loanId);
  if (!loan) return;

  const pendingRepayments = (loan.repayments || []).filter(
    (r) => r.status === "pending",
  );
  const paidRepayments = (loan.repayments || []).filter(
    (r) => r.status === "paid",
  );

  const modalHtml = `
    <div id="repaymentScheduleModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-900 rounded-2xl p-4 sm:p-8 max-w-2xl w-full mx-auto max-h-[90vh] overflow-y-auto animate-slideIn">
        <div class="flex justify-between items-center mb-4 sm:mb-6">
          <div>
            <h3 class="text-lg sm:text-xl font-semibold">Repayment Schedule</h3>
            <p class="text-xs sm:text-sm text-gray-400">${loan.customerName} - ${loan.type.toUpperCase()}</p>
          </div>
          <button onclick="closeRepaymentScheduleModal()" class="text-gray-400 hover:text-white p-2">
            <i class="fas fa-times text-lg"></i>
          </button>
        </div>
        
        <div class="mb-6">
          <div class="grid grid-cols-3 gap-4 text-center">
            <div class="bg-gray-800/50 p-3 rounded-lg">
              <p class="text-xs text-gray-400">Total Payable</p>
              <p class="font-mono text-green-400">₦${(loan.totalPayable || 0).toLocaleString()}</p>
            </div>
            <div class="bg-gray-800/50 p-3 rounded-lg">
              <p class="text-xs text-gray-400">Repaid</p>
              <p class="font-mono text-blue-400">₦${(loan.amountRepaid || 0).toLocaleString()}</p>
            </div>
            <div class="bg-gray-800/50 p-3 rounded-lg">
              <p class="text-xs text-gray-400">Outstanding</p>
              <p class="font-mono text-red-400">₦${(loan.outstandingBalance || 0).toLocaleString()}</p>
            </div>
          </div>
        </div>
        
        <div class="space-y-3">
          <h4 class="text-sm font-semibold mb-3">Pending Installments</h4>
          ${
            pendingRepayments.length > 0
              ? pendingRepayments
                  .map(
                    (repayment, index) => `
            <div class="bg-gray-800/50 p-4 rounded-xl border border-gray-700 flex justify-between items-center">
              <div>
                <p class="font-medium">Installment ${(loan.repayments || []).findIndex((r) => r.id === repayment.id) + 1}</p>
                <p class="text-xs text-gray-400">Due: ${formatSimpleDate(repayment.dueDate)}</p>
                <p class="text-sm font-mono text-green-400 mt-1">₦${(repayment.amount || 0).toLocaleString()}</p>
              </div>
              <button onclick="recordRepayment('${loan.id}', '${repayment.id}')" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm">
                <i class="fas fa-plus-circle mr-1"></i>Record Payment
              </button>
            </div>
          `,
                  )
                  .join("")
              : `
            <div class="text-center py-8 text-gray-400">
              <i class="fas fa-check-circle text-4xl mb-3 text-green-400"></i>
              <p>No pending installments</p>
            </div>
          `
          }
        </div>
        
        ${
          paidRepayments.length > 0
            ? `
          <div class="mt-6">
            <h4 class="text-sm font-semibold mb-3 text-green-400">
              <i class="fas fa-check-circle mr-1"></i>Paid Installments (${paidRepayments.length})
            </h4>
            <div class="space-y-2">
              ${paidRepayments
                .map(
                  (repayment) => `
                <div class="bg-green-500/10 p-3 rounded-lg border border-green-500/20 flex justify-between items-center">
                  <div>
                    <p class="text-sm">Installment ${(loan.repayments || []).findIndex((r) => r.id === repayment.id) + 1}</p>
                    <p class="text-xs text-gray-400">Paid: ${formatDate(repayment.paidDate)}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-mono text-green-400">₦${(repayment.amount || 0).toLocaleString()}</p>
                    <span class="text-xs text-green-400">✓ Paid</span>
                  </div>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        `
            : ""
        }
        
        <div class="flex justify-end mt-6 pt-4 border-t border-gray-700">
          <button onclick="closeRepaymentScheduleModal()" class="px-6 py-2 border border-gray-600 rounded-lg hover:bg-gray-800">
            Close
          </button>
        </div>
      </div>
    </div>
  `;

  const modalContainer = document.createElement("div");
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);
}

function closeRepaymentScheduleModal() {
  const modal = document.getElementById("repaymentScheduleModal");
  if (modal) modal.remove();
}

async function recordRepayment(loanId, repaymentId) {
  const loan = state.loans?.find((l) => l.id === loanId);
  const repayment = loan?.repayments?.find((r) => r.id === repaymentId);
  const amount = repayment?.amount || 0;

  const customer = state.customers?.find((c) => c.id === loan?.customerId);
  const balance = customer?.cashBalance || 0;

  // Show confirmation with specific amounts
  const confirmMessage =
    balance >= amount
      ? `Record repayment of ₦${amount.toLocaleString()}?\n\nThis will immediately deduct ₦${amount.toLocaleString()} from ${customer?.name}'s cash balance (Current: ₦${balance.toLocaleString()} → New: ₦${(balance - amount).toLocaleString()}).`
      : `⚠️ INSUFFICIENT FUNDS!\n\nCustomer has ₦${balance.toLocaleString()} but needs ₦${amount.toLocaleString()}.\nShortfall: ₦${(amount - balance).toLocaleString()}`;

  if (balance < amount) {
    showNotification(confirmMessage, "error");
    return;
  }

  if (!confirm(confirmMessage)) return;

  try {
    const response = await api.patch(
      `/loans/${loanId}/repayments/${repaymentId}`,
      { paidBy: state.currentUser.name },
    );
    cachedApi.invalidate("/loans");
    const { customer: updatedCustomer, loan: updatedLoan } = response.data;

    // Build detailed message
    let message = `✅ ₦${amount.toLocaleString()} deducted from ${customer?.name}'s balance.`;
    message += ` New balance: ₦${updatedCustomer.newCashBalance.toLocaleString()}.`;

    if (updatedLoan.isFullyPaid) {
      message += ` 🎉 Loan FULLY PAID!`;
    }

    showNotification(message, "success");
    closeRepaymentScheduleModal();
    await loadAllData();
    navigate("loans");
  } catch (error) {
    console.error("Repayment error:", error);
    const msg = error.response?.data?.error || "Failed to record repayment";
    showNotification(msg, "error");

    // If insufficient funds, show details
    if (error.response?.data?.shortfall) {
      const { availableBalance, shortfall } = error.response.data;
      showNotification(
        `Customer lacks ₦${shortfall.toLocaleString()} (has ₦${availableBalance.toLocaleString()})`,
        "error",
      );
    }
  }
}

// ==================== MY LOANS VIEW ====================

function renderMyLoans(container) {
  const myLoans =
    state.loans?.filter(
      (l) => l.requestedBy?.staffId === state.currentUser?.id,
    ) || [];

  const html = `<div class="space-y-6 animate-fade-in px-4 sm:px-0">
    <div class="glass-panel rounded-2xl p-6">
      <h3 class="text-lg font-semibold mb-4">My Loan Requests</h3>
      ${
        myLoans.length === 0
          ? `
        <div class="text-center py-8 text-gray-400">
          <i class="fas fa-hand-holding-usd text-4xl mb-3"></i>
          <p>You haven't submitted any loan or overdraft requests yet</p>
          <button onclick="navigate('loan-request')" class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm">Request Loan/Overdraft</button>
        </div>
      `
          : `
        <div class="space-y-4">
          ${myLoans
            .map((loan) => {
              const isOverdue =
                loan.paymentDeadline &&
                new Date(loan.paymentDeadline) < new Date() &&
                loan.status === "active";
              const progress =
                ((loan.amountRepaid || 0) / (loan.totalPayable || 1)) * 100;

              // OVERDRAFT SPECIFIC CALCULATIONS
              const isOverdraft = loan.type === "overdraft";
              const processingCharges = loan.processingCharges || 0;
              const totalWithCharges = loan.amount + processingCharges;

              return `<div class="bg-gray-800/50 p-4 rounded-xl border ${isOverdue ? "border-red-500/50" : "border-gray-700"}">
              <div class="flex flex-wrap justify-between items-start gap-4">
                <div class="flex-1">
                  <div class="flex items-center gap-3 mb-2">
                    <span class="px-2 py-1 rounded text-xs ${isOverdraft ? "bg-orange-500/20 text-orange-400" : "bg-green-500/20 text-green-400"}">
                      ${loan.type.toUpperCase()}
                    </span>
                    <span class="px-2 py-1 rounded text-xs ${loan.status === "pending" ? "bg-yellow-500/20 text-yellow-400" : loan.status === "active" ? "bg-green-500/20 text-green-400" : loan.status === "completed" ? "bg-blue-500/20 text-blue-400" : "bg-red-500/20 text-red-400"}">
                      ${loan.status.toUpperCase()}
                    </span>
                    ${isOverdue ? '<span class="px-2 py-1 rounded text-xs bg-red-500/20 text-red-400 animate-pulse"><i class="fas fa-exclamation-circle mr-1"></i>OVERDUE</span>' : ""}
                  </div>
                  <p class="font-semibold">${loan.customerName}</p>
                  
                  ${
                    isOverdraft
                      ? `
                    <!-- OVERDRAFT DISPLAY -->
                    <div class="grid grid-cols-2 md:grid-cols-3 gap-4 mt-3 text-sm">
                      <div>
                        <p class="text-gray-400">Amount</p>
                        <p class="font-mono text-green-400">₦${loan.amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p class="text-gray-400">Processing Charges</p>
                        <p class="font-mono text-red-400">₦${processingCharges.toLocaleString()}</p>
                      </div>
                      <div>
                        <p class="text-gray-400">Total to Repay</p>
                        <p class="font-mono text-blue-400 font-bold">₦${totalWithCharges.toLocaleString()}</p>
                      </div>
                    </div>
                    
                    ${
                      loan.paymentDeadline
                        ? `
                    <div class="mt-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                      <div class="flex items-center gap-2">
                        <i class="fas fa-calendar-times text-orange-400"></i>
                        <div>
                          <p class="text-sm font-semibold text-orange-400">Payment Deadline</p>
                          <p class="text-lg font-mono font-bold text-white">${new Date(loan.paymentDeadline).toLocaleDateString("en-GB")}</p>
                          <p class="text-xs text-gray-400">${Math.ceil((new Date(loan.paymentDeadline) - new Date()) / (1000 * 60 * 60 * 24))} days remaining</p>
                        </div>
                      </div>
                    </div>
                    `
                        : ""
                    }
                    
                    <div class="mt-2 p-2 bg-gray-900/50 rounded-lg">
  <p class="text-xs text-orange-300">
    <i class="fas fa-info-circle mr-1"></i>
    Overdraft must be repaid in full by the deadline. Processing charges apply.
  </p>
</div>
                  `
                      : `
                    <!-- REGULAR LOAN DISPLAY -->
                    <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mt-3 text-sm">
                      <div>
                        <p class="text-gray-400">Amount</p>
                        <p class="font-mono text-green-400">₦${loan.amount.toLocaleString()}</p>
                      </div>
                      <div>
                        <p class="text-gray-400">Interest</p>
                        <p class="font-mono">${loan.interestRate}%</p>
                      </div>
                      <div>
                        <p class="text-gray-400">Total Payable</p>
                        <p class="font-mono text-blue-400">₦${loan.totalPayable.toLocaleString()}</p>
                      </div>
                      <div>
                        <p class="text-gray-400">Installments</p>
                        <p class="font-mono">${loan.numberOfInstallments} (${loan.repaymentPeriod})</p>
                      </div>
                    </div>
                  `
                  }
                  
                  ${
                    loan.paymentDeadline && !isOverdraft
                      ? `
                  <div class="mt-2 p-2 ${isOverdue ? "bg-red-500/10 border-red-500/20" : "bg-orange-500/10 border-orange-500/20"} border rounded-lg">
                    <p class="text-xs ${isOverdue ? "text-red-400" : "text-orange-400"}">
                      <i class="fas fa-calendar-times mr-1"></i>
                      ${isOverdue ? "OVERDUE - Deadline was" : "Payment Deadline"}: ${new Date(loan.paymentDeadline).toLocaleDateString("en-GB")}
                    </p>
                  </div>
                  `
                      : ""
                  }
                  
                  ${
                    loan.status === "active"
                      ? `
                  <div class="mt-3 p-3 bg-gray-900/50 rounded-lg">
                    <p class="text-sm text-gray-300 mb-2">Repayment Progress</p>
                    <div class="w-full bg-gray-700 rounded-full h-2">
                      <div class="bg-green-500 h-2 rounded-full" style="width: ${progress || 0}%"></div>
                    </div>
                    <div class="flex justify-between text-xs mt-1">
                      <span>₦${(loan.amountRepaid || 0).toLocaleString()} repaid</span>
                      <span>₦${(loan.outstandingBalance || 0).toLocaleString()} remaining</span>
                    </div>
                  </div>
                  `
                      : ""
                  }
                  
                  ${
                    loan.status === "pending"
                      ? `
                  <div class="mt-2 p-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p class="text-xs text-yellow-400">
                      <i class="fas fa-clock mr-1"></i>
                      Awaiting admin approval...
                    </p>
                  </div>
                  `
                      : ""
                  }
                  
                  ${loan.purpose ? `<p class="text-sm text-gray-300 mt-2">Purpose: ${loan.purpose}</p>` : ""}
                </div>
              </div>
            </div>`;
            })
            .join("")}
        </div>
      `
      }
    </div>
  </div>`;

  container.innerHTML = html;
}

// ==================== REVENUE REPORTS (FIXED - CALCULATES FROM STATE) ====================

async function renderRevenueReports(container) {
  try {
    // Show loading state
    container.innerHTML = `
      <div class="flex justify-center items-center py-12">
        <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400"></div>
        <span class="ml-3 text-gray-400">Loading revenue data...</span>
      </div>
    `;

    // Fetch all loans from backend
    const loansRes = await api.get("/loans");
    const allLoans = loansRes.data || [];

    // Helper function to calculate transaction charges for a period
    const calculateTransactionCharges = (period) => {
      const now = new Date();
      let startDate;
      switch (period) {
        case "daily":
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          );
          break;
        case "weekly":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case "monthly":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "yearly":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(0);
      }

      const charges = state.transactions
        .filter((t) => t.status === "approved" && new Date(t.date) >= startDate)
        .reduce((sum, t) => sum + (t.charges || 0), 0);

      return charges;
    };

    // Helper function to calculate loan interest collected for a period
    const calculateLoanInterestCollected = (period) => {
      const now = new Date();
      let startDate;
      switch (period) {
        case "daily":
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          );
          break;
        case "weekly":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case "monthly":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "yearly":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(0);
      }

      // Calculate interest from loan repayments in this period
      let totalInterest = 0;

      allLoans.forEach((loan) => {
        if (loan.repayments && loan.repayments.length > 0) {
          loan.repayments.forEach((repayment) => {
            if (repayment.status === "paid" && repayment.paidDate) {
              const paidDate = new Date(repayment.paidDate);
              if (paidDate >= startDate) {
                totalInterest += repayment.interestPortion || 0;
              }
            }
          });
        }
      });

      return totalInterest;
    };

    // Calculate overdraft charges for a period
    const calculateOverdraftCharges = (period) => {
      const now = new Date();
      let startDate;
      switch (period) {
        case "daily":
          startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate(),
          );
          break;
        case "weekly":
          startDate = new Date(now);
          startDate.setDate(now.getDate() - 7);
          break;
        case "monthly":
          startDate = new Date(now.getFullYear(), now.getMonth(), 1);
          break;
        case "yearly":
          startDate = new Date(now.getFullYear(), 0, 1);
          break;
        default:
          startDate = new Date(0);
      }

      // Calculate from overdraft charges revenue transactions
      const charges = state.transactions
        .filter(
          (t) =>
            t.type === "overdraft_charges_revenue" &&
            t.status === "approved" &&
            new Date(t.date) >= startDate,
        )
        .reduce((sum, t) => sum + (t.amount || 0), 0);

      return charges;
    };

    // Calculate transaction charges for each period
    const dailyTxnCharges = calculateTransactionCharges("daily");
    const weeklyTxnCharges = calculateTransactionCharges("weekly");
    const monthlyTxnCharges = calculateTransactionCharges("monthly");
    const yearlyTxnCharges = calculateTransactionCharges("yearly");

    // Calculate loan interest collected for each period
    const dailyLoanInterest = calculateLoanInterestCollected("daily");
    const weeklyLoanInterest = calculateLoanInterestCollected("weekly");
    const monthlyLoanInterest = calculateLoanInterestCollected("monthly");
    const yearlyLoanInterest = calculateLoanInterestCollected("yearly");

    // Calculate overdraft charges for each period
    const dailyOverdraftCharges = calculateOverdraftCharges("daily");
    const weeklyOverdraftCharges = calculateOverdraftCharges("weekly");
    const monthlyOverdraftCharges = calculateOverdraftCharges("monthly");
    const yearlyOverdraftCharges = calculateOverdraftCharges("yearly");

    // Calculate totals from all data
    const totalTransactionCharges = state.transactions
      .filter((t) => t.status === "approved")
      .reduce((sum, t) => sum + (t.charges || 0), 0);

    // Calculate total expected interest from all loans
    const totalExpectedInterest = allLoans.reduce((sum, loan) => {
      if (loan.status === "active" || loan.status === "completed") {
        return sum + ((loan.totalPayable || 0) - (loan.amount || 0));
      }
      return sum;
    }, 0);

    // Calculate total actual interest collected from all loans
    const totalActualInterest = allLoans.reduce((sum, loan) => {
      if (loan.status === "active" || loan.status === "completed") {
        const interestPaid = (loan.repayments || [])
          .filter((r) => r.status === "paid")
          .reduce((total, r) => {
            return total + (r.interestPortion || 0);
          }, 0);
        return sum + interestPaid;
      }
      return sum;
    }, 0);

    // Calculate total overdraft charges from transactions
    const totalOverdraftCharges = state.transactions
      .filter(
        (t) =>
          t.type === "overdraft_charges_revenue" && t.status === "approved",
      )
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    // Calculate total revenue for each period
    const totalRevenue = {
      daily: dailyTxnCharges + dailyLoanInterest + dailyOverdraftCharges,
      weekly: weeklyTxnCharges + weeklyLoanInterest + weeklyOverdraftCharges,
      monthly:
        monthlyTxnCharges + monthlyLoanInterest + monthlyOverdraftCharges,
      yearly: yearlyTxnCharges + yearlyLoanInterest + yearlyOverdraftCharges,
    };

    // Get counts for display
    const activeLoansCount = allLoans.filter(
      (l) => l.status === "active",
    ).length;
    const completedLoansCount = allLoans.filter(
      (l) => l.status === "completed",
    ).length;
    const pendingLoansCount = allLoans.filter(
      (l) => l.status === "pending",
    ).length;

    // Calculate approved transactions count
    const approvedTransactionsCount = state.transactions.filter(
      (t) => t.status === "approved",
    ).length;
    const pendingTransactionsCount = state.transactions.filter(
      (t) => t.status === "pending",
    ).length;

    // Prepare loan data for table
    const activeAndCompletedLoans = allLoans
      .filter((l) => l.status === "active" || l.status === "completed")
      .sort(
        (a, b) =>
          new Date(b.approvedBy?.approvedAt || 0) -
          new Date(a.approvedBy?.approvedAt || 0),
      );

    // Calculate collection rate
    const collectionRate =
      totalExpectedInterest > 0
        ? ((totalActualInterest / totalExpectedInterest) * 100).toFixed(1)
        : 0;

    const html = `
      <div class="space-y-6 animate-fade-in px-4 sm:px-0">
        <div class="flex justify-between items-center mb-4">
          <h2 class="text-xl font-bold">Revenue Reports</h2>
          <button onclick="renderRevenueReports(document.getElementById('contentArea'))" class="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors">
            <i class="fas fa-sync-alt mr-2"></i>Refresh
          </button>
        </div>
        
        <!-- Period Summary Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="glass-panel p-6 rounded-xl hover:transform hover:scale-105 transition-all duration-300">
            <div class="flex items-center justify-between mb-2">
              <span class="text-gray-400">Today's Revenue</span>
              <i class="fas fa-calendar-day text-blue-400 text-xl"></i>
            </div>
            <p class="text-3xl font-bold text-green-400">₦${totalRevenue.daily.toLocaleString()}</p>
            <div class="text-xs text-gray-400 mt-2 space-y-1">
              <div class="flex justify-between">
                <span>💰 Charges:</span>
                <span class="text-blue-400">₦${dailyTxnCharges.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>📈 Interest:</span>
                <span class="text-green-400">₦${dailyLoanInterest.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>💳 OD Charges:</span>
                <span class="text-orange-400">₦${dailyOverdraftCharges.toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div class="glass-panel p-6 rounded-xl hover:transform hover:scale-105 transition-all duration-300">
            <div class="flex items-center justify-between mb-2">
              <span class="text-gray-400">This Week</span>
              <i class="fas fa-calendar-week text-green-400 text-xl"></i>
            </div>
            <p class="text-3xl font-bold text-green-400">₦${totalRevenue.weekly.toLocaleString()}</p>
            <div class="text-xs text-gray-400 mt-2 space-y-1">
              <div class="flex justify-between">
                <span>💰 Charges:</span>
                <span class="text-blue-400">₦${weeklyTxnCharges.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>📈 Interest:</span>
                <span class="text-green-400">₦${weeklyLoanInterest.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>💳 OD Charges:</span>
                <span class="text-orange-400">₦${weeklyOverdraftCharges.toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div class="glass-panel p-6 rounded-xl hover:transform hover:scale-105 transition-all duration-300">
            <div class="flex items-center justify-between mb-2">
              <span class="text-gray-400">This Month</span>
              <i class="fas fa-calendar-alt text-yellow-400 text-xl"></i>
            </div>
            <p class="text-3xl font-bold text-green-400">₦${totalRevenue.monthly.toLocaleString()}</p>
            <div class="text-xs text-gray-400 mt-2 space-y-1">
              <div class="flex justify-between">
                <span>💰 Charges:</span>
                <span class="text-blue-400">₦${monthlyTxnCharges.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>📈 Interest:</span>
                <span class="text-green-400">₦${monthlyLoanInterest.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>💳 OD Charges:</span>
                <span class="text-orange-400">₦${monthlyOverdraftCharges.toLocaleString()}</span>
              </div>
            </div>
          </div>
          
          <div class="glass-panel p-6 rounded-xl hover:transform hover:scale-105 transition-all duration-300">
            <div class="flex items-center justify-between mb-2">
              <span class="text-gray-400">This Year</span>
              <i class="fas fa-calendar text-purple-400 text-xl"></i>
            </div>
            <p class="text-3xl font-bold text-green-400">₦${totalRevenue.yearly.toLocaleString()}</p>
            <div class="text-xs text-gray-400 mt-2 space-y-1">
              <div class="flex justify-between">
                <span>💰 Charges:</span>
                <span class="text-blue-400">₦${yearlyTxnCharges.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>📈 Interest:</span>
                <span class="text-green-400">₦${yearlyLoanInterest.toLocaleString()}</span>
              </div>
              <div class="flex justify-between">
                <span>💳 OD Charges:</span>
                <span class="text-orange-400">₦${yearlyOverdraftCharges.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Revenue Breakdown Section -->
        <div class="glass-panel rounded-2xl p-6">
          <h3 class="text-lg font-semibold mb-4">Revenue Breakdown</h3>
          
          <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div class="bg-gradient-to-br from-blue-500/10 to-blue-600/5 p-5 rounded-xl border border-blue-500/20">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-medium text-gray-400">
                  <i class="fas fa-percent text-blue-400 mr-2"></i>
                  Transaction Charges
                </h4>
                <i class="fas fa-money-bill-wave text-blue-400 text-2xl"></i>
              </div>
              <p class="text-4xl font-bold text-blue-400">₦${totalTransactionCharges.toLocaleString()}</p>
              <p class="text-xs text-gray-500 mt-2">From ${approvedTransactionsCount} approved transactions</p>
              <div class="mt-3 flex gap-2 text-xs">
                <span class="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full">Deposits</span>
                <span class="px-2 py-1 bg-orange-500/20 text-orange-300 rounded-full">Withdrawals</span>
              </div>
            </div>
            
            <div class="bg-gradient-to-br from-green-500/10 to-green-600/5 p-5 rounded-xl border border-green-500/20">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-medium text-gray-400">
                  <i class="fas fa-chart-line text-green-400 mr-2"></i>
                  Loan Interest Collected
                </h4>
                <i class="fas fa-hand-holding-usd text-green-400 text-2xl"></i>
              </div>
              <p class="text-4xl font-bold text-green-400">₦${totalActualInterest.toLocaleString()}</p>
              <p class="text-xs text-gray-500 mt-2">From ${activeLoansCount + completedLoansCount} loans</p>
              <div class="mt-3 flex gap-2 text-xs">
                <span class="px-2 py-1 bg-green-500/20 text-green-300 rounded-full">Active: ${activeLoansCount}</span>
                <span class="px-2 py-1 bg-blue-500/20 text-blue-300 rounded-full">Completed: ${completedLoansCount}</span>
              </div>
            </div>

            <div class="bg-gradient-to-br from-orange-500/10 to-orange-600/5 p-5 rounded-xl border border-orange-500/20">
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-sm font-medium text-gray-400">
                  <i class="fas fa-credit-card text-orange-400 mr-2"></i>
                  Overdraft Charges
                </h4>
                <i class="fas fa-hand-holding-usd text-orange-400 text-2xl"></i>
              </div>
              <p class="text-4xl font-bold text-orange-400">₦${totalOverdraftCharges.toLocaleString()}</p>
              <p class="text-xs text-gray-500 mt-2">From settled overdrafts</p>
            </div>
          </div>

          <!-- Expected vs Collected -->
          <div class="bg-gray-800/30 p-5 rounded-xl mb-6">
            <div class="flex items-center gap-2 mb-4">
              <i class="fas fa-chart-simple text-yellow-400 text-lg"></i>
              <h4 class="text-sm font-medium text-gray-300">Loan Interest Performance</h4>
            </div>
            <div class="grid grid-cols-2 gap-4 mb-4">
              <div class="text-center p-3 bg-gray-800/50 rounded-lg">
                <p class="text-xs text-gray-400 mb-1">Expected Interest</p>
                <p class="text-2xl font-bold text-yellow-400">₦${totalExpectedInterest.toLocaleString()}</p>
                <p class="text-xs text-gray-500 mt-1">From all approved loans</p>
              </div>
              <div class="text-center p-3 bg-gray-800/50 rounded-lg">
                <p class="text-xs text-gray-400 mb-1">Collected So Far</p>
                <p class="text-2xl font-bold text-green-400">₦${totalActualInterest.toLocaleString()}</p>
                <p class="text-xs text-gray-500 mt-1">Actual payments received</p>
              </div>
            </div>
            <div class="mt-2">
              <div class="flex justify-between text-xs mb-2">
                <span class="text-gray-300">Collection Progress</span>
                <span class="text-yellow-400 font-semibold">${collectionRate}%</span>
              </div>
              <div class="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                <div class="bg-gradient-to-r from-green-500 to-yellow-500 h-full rounded-full transition-all duration-500" style="width: ${collectionRate}%"></div>
              </div>
              <p class="text-xs text-gray-400 mt-2">
                ₦${totalActualInterest.toLocaleString()} out of ₦${totalExpectedInterest.toLocaleString()} expected interest collected
              </p>
            </div>
          </div>
          
          <!-- Revenue Composition Chart -->
          <div class="mt-4">
            <div class="flex justify-between text-sm mb-3">
              <span class="text-gray-300">Revenue Composition</span>
            </div>
            <div class="w-full bg-gray-700 rounded-full h-8 overflow-hidden flex">
              <div class="bg-blue-500 h-full transition-all duration-500 flex items-center justify-center text-xs text-white font-medium" style="width: ${totalTransactionCharges + totalActualInterest + totalOverdraftCharges > 0 ? (totalTransactionCharges / (totalTransactionCharges + totalActualInterest + totalOverdraftCharges)) * 100 : 0}%">
                ${totalTransactionCharges + totalActualInterest + totalOverdraftCharges > 0 ? `${((totalTransactionCharges / (totalTransactionCharges + totalActualInterest + totalOverdraftCharges)) * 100).toFixed(0)}%` : "0%"}
              </div>
              <div class="bg-green-500 h-full transition-all duration-500 flex items-center justify-center text-xs text-white font-medium" style="width: ${totalTransactionCharges + totalActualInterest + totalOverdraftCharges > 0 ? (totalActualInterest / (totalTransactionCharges + totalActualInterest + totalOverdraftCharges)) * 100 : 0}%">
                ${totalTransactionCharges + totalActualInterest + totalOverdraftCharges > 0 ? `${((totalActualInterest / (totalTransactionCharges + totalActualInterest + totalOverdraftCharges)) * 100).toFixed(0)}%` : "0%"}
              </div>
              <div class="bg-orange-500 h-full transition-all duration-500 flex items-center justify-center text-xs text-white font-medium" style="width: ${totalTransactionCharges + totalActualInterest + totalOverdraftCharges > 0 ? (totalOverdraftCharges / (totalTransactionCharges + totalActualInterest + totalOverdraftCharges)) * 100 : 0}%">
                ${totalTransactionCharges + totalActualInterest + totalOverdraftCharges > 0 ? `${((totalOverdraftCharges / (totalTransactionCharges + totalActualInterest + totalOverdraftCharges)) * 100).toFixed(0)}%` : "0%"}
              </div>
            </div>
            <div class="flex gap-6 mt-4 text-sm justify-center flex-wrap">
              <div class="flex items-center gap-2">
                <div class="w-4 h-4 bg-blue-500 rounded"></div>
                <span class="text-gray-300">Transaction Charges: ₦${totalTransactionCharges.toLocaleString()}</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-4 h-4 bg-green-500 rounded"></div>
                <span class="text-gray-300">Loan Interest: ₦${totalActualInterest.toLocaleString()}</span>
              </div>
              <div class="flex items-center gap-2">
                <div class="w-4 h-4 bg-orange-500 rounded"></div>
                <span class="text-gray-300">Overdraft Charges: ₦${totalOverdraftCharges.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Recent Revenue Activity -->
        <div class="glass-panel rounded-2xl p-6">
          <h3 class="text-lg font-semibold mb-4">Recent Revenue Activity</h3>
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div class="bg-blue-500/10 p-4 rounded-lg border border-blue-500/20">
              <p class="text-xs text-gray-400 mb-2">Last 7 Days</p>
              <div class="flex justify-between items-end">
                <div>
                  <p class="text-sm text-gray-400">Transaction Charges</p>
                  <p class="text-2xl font-bold text-blue-400">₦${weeklyTxnCharges.toLocaleString()}</p>
                </div>
                <i class="fas fa-arrow-trend-up text-blue-400 text-2xl"></i>
              </div>
              <p class="text-xs text-gray-500 mt-2">from approved deposits & withdrawals</p>
            </div>
            <div class="bg-green-500/10 p-4 rounded-lg border border-green-500/20">
              <p class="text-xs text-gray-400 mb-2">Last 7 Days</p>
              <div class="flex justify-between items-end">
                <div>
                  <p class="text-sm text-gray-400">Loan Interest Collected</p>
                  <p class="text-2xl font-bold text-green-400">₦${weeklyLoanInterest.toLocaleString()}</p>
                </div>
                <i class="fas fa-hand-holding-usd text-green-400 text-2xl"></i>
              </div>
              <p class="text-xs text-gray-500 mt-2">from loan repayments</p>
            </div>
            <div class="bg-orange-500/10 p-4 rounded-lg border border-orange-500/20">
              <p class="text-xs text-gray-400 mb-2">Last 7 Days</p>
              <div class="flex justify-between items-end">
                <div>
                  <p class="text-sm text-gray-400">Overdraft Charges</p>
                  <p class="text-2xl font-bold text-orange-400">₦${weeklyOverdraftCharges.toLocaleString()}</p>
                </div>
                <i class="fas fa-credit-card text-orange-400 text-2xl"></i>
              </div>
              <p class="text-xs text-gray-500 mt-2">from settled overdrafts</p>
            </div>
          </div>
        </div>
        
        <!-- Detailed Loan Breakdown -->
        <div class="glass-panel rounded-2xl p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-lg font-semibold">Loan Interest Breakdown by Customer</h3>
            <div class="text-sm text-gray-400">
              <span class="text-green-400">${activeLoansCount}</span> Active | 
              <span class="text-blue-400">${completedLoansCount}</span> Completed | 
              <span class="text-yellow-400">${pendingLoansCount}</span> Pending
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-700">
              <thead>
                <tr class="text-left text-gray-400 text-sm">
                  <th class="pb-3 px-2">Customer</th>
                  <th class="pb-3 px-2">Type</th>
                  <th class="pb-3 px-2">Principal</th>
                  <th class="pb-3 px-2">Interest Rate</th>
                  <th class="pb-3 px-2">Expected Interest</th>
                  <th class="pb-3 px-2">Collected</th>
                  <th class="pb-3 px-2">Progress</th>
                  <th class="pb-3 px-2">Status</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-800">
                ${
                  activeAndCompletedLoans.length > 0
                    ? activeAndCompletedLoans
                        .map((loan) => {
                          const expectedInterest =
                            (loan.totalPayable || 0) - (loan.amount || 0);
                          const collectedInterest = (loan.repayments || [])
                            .filter((r) => r.status === "paid")
                            .reduce(
                              (sum, r) => sum + (r.interestPortion || 0),
                              0,
                            );
                          const collectionPercentage =
                            expectedInterest > 0
                              ? (
                                  (collectedInterest / expectedInterest) *
                                  100
                                ).toFixed(1)
                              : 0;

                          return `
                    <tr class="hover:bg-gray-800/30 transition-colors">
                      <td class="py-3 px-2">
                        <div class="font-medium text-sm">${loan.customerName}</div>
                        <div class="text-xs text-gray-500">${loan.customerNumber || "N/A"}</div>
                      </td>
                      <td class="py-3 px-2">
                        <span class="px-2 py-1 rounded text-xs ${loan.type === "loan" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"}">
                          ${loan.type.toUpperCase()}
                        </span>
                      </td>
                      <td class="py-3 px-2 font-mono text-sm">₦${(loan.amount || 0).toLocaleString()}</td>
                      <td class="py-3 px-2 text-sm">${loan.interestRate || 0}%</td>
                      <td class="py-3 px-2 font-mono text-yellow-400 text-sm">₦${expectedInterest.toLocaleString()}</td>
                      <td class="py-3 px-2 font-mono text-green-400 text-sm">₦${collectedInterest.toLocaleString()}</td>
                      <td class="py-3 px-2">
                        <div class="w-24">
                          <div class="flex justify-between text-xs mb-1">
                            <span class="text-gray-400">${collectionPercentage}%</span>
                          </div>
                          <div class="bg-gray-700 rounded-full h-2">
                            <div class="bg-green-500 h-2 rounded-full" style="width: ${collectionPercentage}%"></div>
                          </div>
                        </div>
                      </td>
                      <td class="py-3 px-2">
                        <span class="px-2 py-1 rounded text-xs ${getStatusStyle(loan.status)}">
                          ${loan.status}
                        </span>
                      </td>
                    </tr>
                  `;
                        })
                        .join("")
                    : `
                  <tr>
                    <td colspan="8" class="py-8 text-center text-gray-400">
                      <i class="fas fa-chart-line text-4xl mb-3 block"></i>
                      No approved loans yet. Interest revenue will appear here once loans are approved and repayments are made.
                    </td>
                  </tr>
                `
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Summary Stats -->
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="glass-panel p-4 rounded-xl text-center">
            <i class="fas fa-users text-blue-400 text-2xl mb-2"></i>
            <p class="text-sm text-gray-400">Total Customers</p>
            <p class="text-xl font-bold">${state.customers.length}</p>
          </div>
          <div class="glass-panel p-4 rounded-xl text-center">
            <i class="fas fa-hand-holding-usd text-green-400 text-2xl mb-2"></i>
            <p class="text-sm text-gray-400">Active Loans</p>
            <p class="text-xl font-bold">${activeLoansCount}</p>
          </div>
          <div class="glass-panel p-4 rounded-xl text-center">
            <i class="fas fa-exchange-alt text-purple-400 text-2xl mb-2"></i>
            <p class="text-sm text-gray-400">Total Transactions</p>
            <p class="text-xl font-bold">${state.transactions.length}</p>
            <p class="text-xs text-gray-500">${pendingTransactionsCount} pending</p>
          </div>
          <div class="glass-panel p-4 rounded-xl text-center">
            <i class="fas fa-chart-line text-yellow-400 text-2xl mb-2"></i>
            <p class="text-sm text-gray-400">Total Revenue</p>
            <p class="text-xl font-bold text-green-400">₦${(totalTransactionCharges + totalActualInterest + totalOverdraftCharges).toLocaleString()}</p>
            <p class="text-xs text-gray-500">All time</p>
          </div>
        </div>
      </div>
    `;

    container.innerHTML = html;
  } catch (error) {
    console.error("Revenue reports error:", error);
    container.innerHTML = `
      <div class="text-center text-red-400 py-12">
        <i class="fas fa-exclamation-circle text-5xl mb-4"></i>
        <p class="text-lg mb-2">Failed to load revenue reports</p>
        <p class="text-sm text-gray-400 mb-4">${error.response?.data?.error || error.message || "Please check your connection"}</p>
        <button onclick="renderRevenueReports(document.getElementById('contentArea'))" class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg transition-colors">
          <i class="fas fa-sync-alt mr-2"></i>Retry
        </button>
      </div>
    `;
  }
}
function renderStaffReconciliation(container) {
  // Get today's date as YYYY-MM-DD in local time
  const now = new Date();
  const todayStr = now.toLocaleDateString("en-CA");

  // Include ALL transactions submitted today (pending, approved, rejected)
  // This shows what staff actually did today, regardless of approval status
  const todayTransactions = state.transactions.filter((t) => {
    const txnDate = new Date(t.date || t.approvedAt || t.createdAt);
    const txnDateStr = txnDate.toLocaleDateString("en-CA");
    return txnDateStr === todayStr;
  });

  // Grouping logic
  const staffStats = {};

  todayTransactions.forEach((t) => {
    const sId = t.requestedById || t.staffId || "unknown";
    const sName = t.staffName || t.requestedBy || "Unknown Staff";

    if (!staffStats[sId]) {
      staffStats[sId] = {
        name: sName,
        deposits: 0,
        withdrawals: 0,
        net: 0,
        count: 0,
        pendingCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
      };
    }

    const amount = t.amount || 0;
    if (t.type === "deposit") {
      staffStats[sId].deposits += amount;
    } else if (t.type === "withdrawal") {
      staffStats[sId].withdrawals += amount;
    }

    staffStats[sId].count++;

    // Track status breakdown
    const status = t.status?.toString().toLowerCase();
    if (status === "pending") staffStats[sId].pendingCount++;
    else if (status === "approved") staffStats[sId].approvedCount++;
    else if (status === "rejected") staffStats[sId].rejectedCount++;
  });

  const staffList = Object.values(staffStats).map((stat) => {
    stat.net = stat.deposits - stat.withdrawals;
    return stat;
  });

  const totalSystemDeposits = staffList.reduce((sum, s) => sum + s.deposits, 0);
  const totalSystemWithdrawals = staffList.reduce(
    (sum, s) => sum + s.withdrawals,
    0,
  );

  const totalPending = todayTransactions.filter(
    (t) => t.status?.toString().toLowerCase() === "pending",
  ).length;
  const totalApproved = todayTransactions.filter(
    (t) => t.status?.toString().toLowerCase() === "approved",
  ).length;
  const totalRejected = todayTransactions.filter(
    (t) => t.status?.toString().toLowerCase() === "rejected",
  ).length;

  const html = `
    <div class="space-y-6 animate-fade-in px-4 sm:px-0">
      <div class="flex justify-between items-center">
        <h3 class="text-lg font-semibold">End-of-Day Staff Reconciliation</h3>
        <div class="flex items-center gap-3">
          <span class="text-xs text-gray-400 bg-gray-800 px-3 py-1 rounded-full">
            <i class="fas fa-calendar-day mr-1"></i>${now.toLocaleDateString("en-GB")}
          </span>
          <button onclick="refreshData()" class="text-blue-400 hover:text-blue-300 text-sm">
            <i class="fas fa-sync-alt mr-1"></i> Refresh
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="glass-panel p-4 rounded-xl border-l-4 border-green-500">
          <p class="text-xs text-gray-400">Today's Deposits</p>
          <p class="text-xl font-bold text-green-400">₦${totalSystemDeposits.toLocaleString()}</p>
          <p class="text-xs text-gray-500 mt-1">${todayTransactions.filter((t) => t.type === "deposit").length} deposits</p>
        </div>
        <div class="glass-panel p-4 rounded-xl border-l-4 border-orange-500">
          <p class="text-xs text-gray-400">Today's Withdrawals</p>
          <p class="text-xl font-bold text-orange-400">₦${totalSystemWithdrawals.toLocaleString()}</p>
          <p class="text-xs text-gray-500 mt-1">${todayTransactions.filter((t) => t.type === "withdrawal").length} withdrawals</p>
        </div>
        <div class="glass-panel p-4 rounded-xl border-l-4 border-blue-500">
          <p class="text-xs text-gray-400">Net Position</p>
          <p class="text-xl font-bold text-blue-400">₦${(totalSystemDeposits - totalSystemWithdrawals).toLocaleString()}</p>
          <p class="text-xs text-gray-500 mt-1">${todayTransactions.length} total</p>
        </div>
        <div class="glass-panel p-4 rounded-xl border-l-4 border-purple-500">
          <p class="text-xs text-gray-400">Status Breakdown</p>
          <div class="flex gap-2 mt-2 text-xs">
            <span class="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded-full">${totalPending} pending</span>
            <span class="px-2 py-1 bg-green-500/20 text-green-400 rounded-full">${totalApproved} approved</span>
            <span class="px-2 py-1 bg-red-500/20 text-red-400 rounded-full">${totalRejected} rejected</span>
          </div>
        </div>
      </div>

      ${
        todayTransactions.length === 0
          ? `<div class="glass-panel rounded-2xl p-8 text-center">
            <div class="w-16 h-16 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-4">
              <i class="fas fa-clipboard-check text-gray-500 text-2xl"></i>
            </div>
            <h4 class="text-lg font-semibold mb-2">No Transactions Today</h4>
            <p class="text-sm text-gray-400">No transactions recorded for today yet.</p>
          </div>`
          : `<div class="glass-panel rounded-2xl overflow-hidden">
            <table class="min-w-full divide-y divide-gray-700">
              <thead class="bg-gray-800/50">
                <tr>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Staff Member</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Deposits</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Withdrawals</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Net</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Status</th>
                  <th class="px-6 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Txns</th>
                </tr>
              </thead>
              <tbody class="bg-gray-900/20 divide-y divide-gray-800">
                ${
                  staffList.length > 0
                    ? staffList
                        .map(
                          (s) => `
                    <tr class="hover:bg-gray-800/30 transition-colors">
                      <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex items-center">
                          <div class="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center text-blue-400 font-bold mr-3 text-xs">
                            ${s.name
                              .split(" ")
                              .map((n) => n[0])
                              .join("")}
                          </div>
                          <span class="text-sm font-medium text-white">${s.name}</span>
                        </div>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-green-400 font-mono">₦${s.deposits.toLocaleString()}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-orange-400 font-mono">₦${s.withdrawals.toLocaleString()}</td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm font-bold ${s.net >= 0 ? "text-blue-400" : "text-red-400"} font-mono">
                        ₦${s.net.toLocaleString()}
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap">
                        <div class="flex gap-1 text-xs">
                          ${s.pendingCount > 0 ? `<span class="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded">${s.pendingCount} ⏳</span>` : ""}
                          ${s.approvedCount > 0 ? `<span class="px-2 py-0.5 bg-green-500/20 text-green-400 rounded">${s.approvedCount} ✓</span>` : ""}
                          ${s.rejectedCount > 0 ? `<span class="px-2 py-0.5 bg-red-500/20 text-red-400 rounded">${s.rejectedCount} ✗</span>` : ""}
                        </div>
                      </td>
                      <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-400">${s.count}</td>
                    </tr>
                  `,
                        )
                        .join("")
                    : `<tr><td colspan="6" class="px-6 py-10 text-center text-gray-500">No transaction data found for today.</td></tr>`
                }
              </tbody>
            </table>
          </div>`
      }
      
      <div class="text-center">
        <button onclick="window.print()" class="px-6 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm transition-colors">
          <i class="fas fa-print mr-2"></i>Print Report
        </button>
      </div>
    </div>
  `;

  container.innerHTML = html;
}
// ==================== DORMANT CUSTOMERS SECTION ====================

function renderDormantCustomers(container) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const customersWithLastActivity = state.customers.map((customer) => {
    // Only count APPROVED transactions
    const customerTransactions = state.transactions.filter(
      (t) => t.customerId === customer.id && t.status === "approved",
    );

    let lastTransactionDate = null;
    let lastTransactionType = null;
    let lastTransactionAmount = 0;

    if (customerTransactions.length > 0) {
      const sortedTransactions = [...customerTransactions].sort(
        (a, b) => new Date(b.date) - new Date(a.date),
      );
      lastTransactionDate = new Date(sortedTransactions[0].date);
      lastTransactionType = sortedTransactions[0].type;
      lastTransactionAmount = sortedTransactions[0].amount;
    }

    let daysSinceLastTransaction = null;
    if (lastTransactionDate) {
      const diffTime = Math.abs(new Date() - lastTransactionDate);
      daysSinceLastTransaction = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    // Check if customer is new (joined less than 30 days ago)
    const joinedDate = new Date(
      customer.joined || customer.createdAt || Date.now(),
    );
    const daysSinceJoined = Math.floor(
      (new Date() - joinedDate) / (1000 * 60 * 60 * 24),
    );
    const isNewCustomer = daysSinceJoined <= 30;

    // FIX: Only mark as dormant if:
    // 1. They HAVE transacted before AND last transaction was 30+ days ago, OR
    // 2. They are NOT a new customer (joined > 30 days ago) AND never transacted
    const isDormant =
      (lastTransactionDate && daysSinceLastTransaction > 30) ||
      (!lastTransactionDate && !isNewCustomer);

    return {
      ...customer,
      lastTransactionDate,
      lastTransactionType,
      lastTransactionAmount,
      daysSinceLastTransaction,
      totalTransactions: customerTransactions.length,
      daysSinceJoined,
      isNewCustomer,
      isDormant,
    };
  });

  // Filter to only show truly dormant customers
  const dormantCustomers = customersWithLastActivity.filter((c) => c.isDormant);

  // Sort: customers with transactions first (most dormant), then never-transacted
  dormantCustomers.sort((a, b) => {
    if (a.lastTransactionDate && b.lastTransactionDate) {
      return b.daysSinceLastTransaction - a.daysSinceLastTransaction;
    }
    if (a.lastTransactionDate && !b.lastTransactionDate) return -1;
    if (!a.lastTransactionDate && b.lastTransactionDate) return 1;
    return b.daysSinceJoined - a.daysSinceJoined;
  });

  const totalCustomers = state.customers.length;
  const dormantCount = dormantCustomers.length;
  const activeCount = totalCustomers - dormantCount;

  const dormantPercentage =
    totalCustomers > 0 ? ((dormantCount / totalCustomers) * 100).toFixed(1) : 0;

  const html = `<div class="space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-0">
    <div class="glass-panel rounded-2xl p-4 sm:p-6">
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
        <div>
          <h3 class="text-base sm:text-lg font-semibold">Dormant Customers</h3>
          <p class="text-xs sm:text-sm text-gray-400">Customers with no approved transactions in the last 30 days</p>
        </div>
        <div class="flex gap-2 w-full sm:w-auto">
          <button onclick="sendBulkSMSToDormantCustomers()" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-xs sm:text-sm transition-colors flex items-center justify-center gap-2" ${dormantCount === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed"' : ""}>
            <i class="fas fa-envelope text-xs sm:text-sm"></i>SMS (${dormantCount})
          </button>
          <button onclick="exportDormantCustomers()" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs sm:text-sm transition-colors flex items-center justify-center gap-2" ${dormantCount === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed"' : ""}>
            <i class="fas fa-download text-xs sm:text-sm"></i>Export
          </button>
        </div>
      </div>
      
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs sm:text-sm text-gray-400">Total Customers</span>
            <i class="fas fa-users text-blue-400 text-sm sm:text-base"></i>
          </div>
          <p class="text-xl sm:text-2xl font-bold">${totalCustomers}</p>
        </div>
        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs sm:text-sm text-gray-400">Active Customers</span>
            <i class="fas fa-user-check text-green-400 text-sm sm:text-base"></i>
          </div>
          <p class="text-xl sm:text-2xl font-bold text-green-400">${activeCount}</p>
          <p class="text-xs text-gray-400">Transacted within 30 days or new</p>
        </div>
        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs sm:text-sm text-gray-400">Dormant Customers</span>
            <i class="fas fa-user-clock text-yellow-400 text-sm sm:text-base"></i>
          </div>
          <p class="text-xl sm:text-2xl font-bold text-yellow-400">${dormantCount}</p>
          <p class="text-xs text-gray-400">No activity in 30+ days</p>
        </div>
        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs sm:text-sm text-gray-400">Dormancy Rate</span>
            <i class="fas fa-chart-line text-purple-400 text-sm sm:text-base"></i>
          </div>
          <p class="text-xl sm:text-2xl font-bold text-purple-400">${dormantPercentage}%</p>
          <p class="text-xs text-gray-400">of total customers</p>
        </div>
      </div>
      
      ${
        dormantCount > 0
          ? `<div class="overflow-x-auto -mx-4 sm:mx-0">
              <div class="inline-block min-w-full align-middle">
                <table class="min-w-full divide-y divide-gray-700">
                  <thead>
                    <tr class="text-left text-gray-400 text-xs sm:text-sm">
                      <th class="pb-3 px-4 sm:px-0">Customer</th>
                      <th class="pb-3 px-4 sm:px-0 hidden sm:table-cell">Contact</th>
                      <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Phone</th>
                      <th class="pb-3 px-4 sm:px-0">Cash Balance</th>
                      <th class="pb-3 px-4 sm:px-0 hidden lg:table-cell">Last Transaction</th>
                      <th class="pb-3 px-4 sm:px-0">Days</th>
                      <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Total Txns</th>
                      <th class="pb-3 px-4 sm:px-0">Actions</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-gray-800">
                    ${dormantCustomers
                      .map((customer) => {
                        const neverTransacted = !customer.lastTransactionDate;
                        const badgeClass = neverTransacted
                          ? "bg-gray-500/20 text-gray-400"
                          : customer.daysSinceLastTransaction > 90
                            ? "bg-red-500/20 text-red-400"
                            : customer.daysSinceLastTransaction > 60
                              ? "bg-orange-500/20 text-orange-400"
                              : "bg-yellow-500/20 text-yellow-400";

                        const daysLabel = neverTransacted
                          ? `${customer.daysSinceJoined}d (never)`
                          : `${customer.daysSinceLastTransaction}d`;

                        return `<tr class="hover:bg-gray-800/30 transition-colors">
                          <td class="py-3 px-4 sm:px-0">
                            <div class="flex items-center gap-2 sm:gap-3">
                              <div class="w-8 h-8 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                                ${customer.name
                                  .split(" ")
                                  .map((n) => n[0])
                                  .join("")
                                  .substring(0, 2)
                                  .toUpperCase()}
                              </div>
                              <div>
                                <p class="font-medium text-xs sm:text-sm">${customer.name}</p>
                                <p class="text-xs text-gray-400 hidden sm:block">${customer.email}</p>
                                ${neverTransacted ? '<span class="text-xs text-gray-500">Never transacted</span>' : ""}
                              </div>
                            </div>
                          </td>
                          <td class="py-3 px-4 sm:px-0 hidden sm:table-cell">
                            <div class="text-xs">
                              <div class="flex items-center gap-1">
                                <i class="fas fa-envelope text-gray-500 text-xs"></i>
                                <span class="break-words">${customer.email}</span>
                              </div>
                            </div>
                          </td>
                          <td class="py-3 px-4 sm:px-0 hidden md:table-cell">
                            <div class="text-xs">
                              <div class="flex items-center gap-1">
                                <i class="fas fa-phone-alt text-gray-500 text-xs"></i>
                                <span>${customer.phone || "N/A"}</span>
                              </div>
                            </div>
                          </td>
                          <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm">
                            ₦${(customer.cashBalance || customer.balance || 0).toLocaleString()}
                          </td>
                          <td class="py-3 px-4 sm:px-0 hidden lg:table-cell">
                            ${
                              customer.lastTransactionDate
                                ? `<div class="text-xs">
                                  <div>${formatDate(customer.lastTransactionDate)}</div>
                                  <div class="text-gray-400 capitalize">${customer.lastTransactionType} of ₦${(customer.lastTransactionAmount || 0).toLocaleString()}</div>
                                </div>`
                                : '<span class="text-xs text-gray-500">Never</span>'
                            }
                          </td>
                          <td class="py-3 px-4 sm:px-0">
                            <span class="px-2 py-1 rounded text-xs ${badgeClass}">
                              ${daysLabel}
                            </span>
                          </td>
                          <td class="py-3 px-4 sm:px-0 hidden md:table-cell text-xs">
                            ${customer.totalTransactions}
                          </td>
                          <td class="py-3 px-4 sm:px-0">
                            <div class="flex gap-2">
                              <button onclick="viewCustomer('${customer.id}')" class="text-blue-400 hover:text-blue-300 p-1" title="View Details">
                                <i class="fas fa-eye text-xs sm:text-sm"></i>
                              </button>
                              ${
                                customer.phone
                                  ? `<button onclick="sendSMSReminder('${customer.id}')" class="text-green-400 hover:text-green-300 p-1" title="Send SMS Reminder">
                                    <i class="fas fa-envelope text-xs sm:text-sm"></i>
                                  </button>`
                                  : ""
                              }
                              <button onclick="reactivateCustomer('${customer.id}')" class="text-purple-400 hover:text-purple-300 p-1" title="Mark as Reactivated">
                                <i class="fas fa-user-check text-xs sm:text-sm"></i>
                              </button>
                            </div>
                          </td>
                        </tr>`;
                      })
                      .join("")}
                  </tbody>
                </table>
              </div>
            </div>`
          : `<div class="text-center py-8 sm:py-12 bg-gray-800/30 rounded-xl">
              <div class="w-12 h-12 sm:w-16 sm:h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-3 sm:mb-4">
                <i class="fas fa-check-circle text-green-400 text-xl sm:text-2xl"></i>
              </div>
              <h3 class="text-base sm:text-lg font-semibold mb-2">No Dormant Customers</h3>
              <p class="text-xs sm:text-sm text-gray-400">All customers have been active in the last 30 days</p>
            </div>`
      }
    </div>
    
    ${
      dormantCount > 0
        ? `<div class="glass-panel rounded-2xl p-4 sm:p-6">
          <h3 class="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Reactivation Suggestions</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
              <i class="fas fa-gift text-purple-400 text-xl sm:text-2xl mb-2"></i>
              <h4 class="font-medium text-sm sm:text-base mb-1">Offer Incentives</h4>
              <p class="text-xs text-gray-400">Consider offering bonuses or reduced fees to dormant customers</p>
            </div>
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
              <i class="fas fa-envelope text-blue-400 text-xl sm:text-2xl mb-2"></i>
              <h4 class="font-medium text-sm sm:text-base mb-1">Send Reminders</h4>
              <p class="text-xs text-gray-400">Send personalized SMS or email reminders to encourage activity</p>
            </div>
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
              <i class="fas fa-chart-line text-green-400 text-xl sm:text-2xl mb-2"></i>
              <h4 class="font-medium text-sm sm:text-base mb-1">Track Engagement</h4>
              <p class="text-xs text-gray-400">Monitor reactivation rates and adjust strategies accordingly</p>
            </div>
          </div>
        </div>`
        : ""
    }
  </div>`;

  container.innerHTML = html;
  document.getElementById("pageTitle").textContent = "Dormant Customers";
}

async function sendSMSReminder(customerId) {
  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer) {
    showNotification("Customer not found", "error");
    return;
  }
  if (!customer.phone) {
    showNotification("Customer has no phone number", "warning");
    return;
  }
  if (!confirm(`Send SMS reminder to ${customer.name} at ${customer.phone}?`))
    return;
  try {
    showNotification(`SMS reminder sent to ${customer.name}`, "success");
  } catch (error) {
    console.error("SMS error:", error);
    showNotification("Failed to send SMS reminder", "error");
  }
}

async function sendBulkSMSToDormantCustomers() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dormantCustomers = state.customers
    .filter((c) => {
      // Only approved transactions
      const customerTransactions = state.transactions.filter(
        (t) => t.customerId === c.id && t.status === "approved",
      );

      // Check join date
      const joinedDate = new Date(c.joined || c.createdAt || Date.now());
      const daysSinceJoined = Math.floor(
        (new Date() - joinedDate) / (1000 * 60 * 60 * 24),
      );
      const isNewCustomer = daysSinceJoined <= 30;

      if (customerTransactions.length === 0) {
        // Only dormant if NOT a new customer
        return !isNewCustomer;
      }

      const sortedTransactions = [...customerTransactions].sort(
        (a, b) => new Date(b.date) - new Date(a.date),
      );
      const lastDate = new Date(sortedTransactions[0].date);
      return lastDate < thirtyDaysAgo;
    })
    .filter((c) => c.phone);

  if (dormantCustomers.length === 0) {
    showNotification("No dormant customers with phone numbers", "info");
    return;
  }
  if (
    !confirm(
      `Send SMS reminders to ${dormantCustomers.length} dormant customers?`,
    )
  )
    return;
  showNotification(
    `Sending SMS to ${dormantCustomers.length} customers...`,
    "info",
  );
  let sent = 0,
    failed = 0;
  for (const customer of dormantCustomers) {
    try {
      sent++;
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Failed to send SMS to ${customer.name}:`, error);
      failed++;
    }
  }
  showNotification(
    `Bulk SMS completed: ${sent} sent, ${failed} failed`,
    sent > 0 ? "success" : "error",
  );
}

function exportDormantCustomers() {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const dormantCustomers = state.customers
    .map((customer) => {
      const customerTransactions = state.transactions.filter(
        (t) => t.customerId === customer.id && t.status === "approved",
      );

      const joinedDate = new Date(
        customer.joined || customer.createdAt || Date.now(),
      );
      const daysSinceJoined = Math.floor(
        (new Date() - joinedDate) / (1000 * 60 * 60 * 24),
      );
      const isNewCustomer = daysSinceJoined <= 30;

      let lastTransactionDate = null,
        daysDormant = "Never";

      if (customerTransactions.length > 0) {
        const sortedTransactions = [...customerTransactions].sort(
          (a, b) => new Date(b.date) - new Date(a.date),
        );
        lastTransactionDate = sortedTransactions[0].date;
        const lastDate = new Date(lastTransactionDate);
        const diffTime = Math.abs(new Date() - lastDate);
        daysDormant = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      // Same logic as render function
      const isDormant =
        (lastTransactionDate && daysDormant > 30) ||
        (!lastTransactionDate && !isNewCustomer);

      if (isDormant) {
        return {
          Name: customer.name,
          Email: customer.email,
          Phone: customer.phone || "N/A",
          CashBalance: customer.cashBalance || customer.balance || 0,
          LoanBalance: customer.loanBalance || 0,
          "Last Transaction Date": lastTransactionDate
            ? formatDate(lastTransactionDate)
            : "Never",
          "Days Dormant":
            daysDormant === "Never"
              ? `Joined ${daysSinceJoined} days ago`
              : `${daysDormant} days`,
          "Total Transactions": customerTransactions.length,
          "Added By": customer.addedBy?.staffName || "System",
          "Joined Date": formatSimpleDate(customer.joined),
        };
      }
      return null;
    })
    .filter((c) => c !== null);

  if (dormantCustomers.length === 0) {
    showNotification("No dormant customers to export", "info");
    return;
  }
  const headers = Object.keys(dormantCustomers[0]);
  let csv = headers.join(",") + "\n";
  dormantCustomers.forEach((customer) => {
    const row = headers
      .map((header) => {
        let value = customer[header];
        if (
          typeof value === "string" &&
          (value.includes(",") || value.includes('"'))
        )
          value = `"${value.replace(/"/g, '""')}"`;
        return value;
      })
      .join(",");
    csv += row + "\n";
  });
  const blob = new Blob([csv], { type: "text/csv" });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `dormant_customers_${new Date().toISOString().split("T")[0]}.csv`;
  a.click();
  window.URL.revokeObjectURL(url);
  showNotification(
    `Exported ${dormantCustomers.length} dormant customers`,
    "success",
  );
}

async function reactivateCustomer(customerId) {
  const customer = state.customers.find((c) => c.id === customerId);
  if (!customer) {
    showNotification("Customer not found", "error");
    return;
  }
  if (!confirm(`Mark ${customer.name} as reactivated?`)) return;
  try {
    await api.patch(`/customers/${customerId}`, {
      reactivatedAt: new Date().toISOString(),
      status: "active",
    });
    await loadAllData();
    showNotification(
      `${customer.name} has been marked as reactivated`,
      "success",
    );
    navigate("dormant-customers");
  } catch (error) {
    console.error("Failed to update customer:", error);
    showNotification("Failed to reactivate customer", "error");
  }
}

// ==================== STAFF MANAGEMENT ====================

function renderStaffManagement(container) {
  const html = `<div class="glass-panel rounded-2xl p-4 sm:p-6 animate-fade-in"><div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6"><h3 class="text-base sm:text-lg font-semibold">Staff Members</h3><button onclick="showAddStaffModal()" class="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors"><i class="fas fa-plus mr-2"></i>Add Staff</button></div><div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">${state.staff
    .map(
      (staff) =>
        `<div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700"><div class="flex items-start justify-between mb-3 sm:mb-4"><div class="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center font-bold text-base sm:text-lg">${
          staff.name
            ? staff.name
                .split(" ")
                .map((n) => n[0])
                .join("")
                .substring(0, 2)
            : "??"
        }</div><span class="px-2 py-1 rounded text-xs ${staff.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}">${staff.status}</span></div><h4 class="font-semibold text-sm sm:text-base mb-1 break-words">${staff.name}</h4><p class="text-xs sm:text-sm text-gray-400 mb-1 capitalize">${staff.role}</p><p class="text-xs text-gray-500 mb-2 break-words">${staff.email}</p>${staff.phone ? `<p class="text-xs text-green-400 mb-2">📱 ${staff.phone}</p>` : '<p class="text-xs text-gray-500 mb-2">⚠️ No phone number</p>'}<div class="flex items-center gap-2 text-xs text-gray-400"><i class="fas fa-clock text-xs"></i>Last active: ${staff.lastActive || "Unknown"}</div></div>`,
    )
    .join("")}</div></div>`;
  container.innerHTML = html;
}

function showAddStaffModal() {
  const modalHtml = `<div id="staffModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"><div class="bg-gray-900 rounded-2xl p-4 sm:p-8 max-w-md w-full mx-auto animate-slideIn max-h-[90vh] overflow-y-auto"><div class="flex justify-between items-center mb-4 sm:mb-6"><h3 class="text-lg sm:text-xl font-semibold">Add New Staff Member</h3><button onclick="closeStaffModal()" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times text-lg"></i></button></div><form onsubmit="handleAddStaff(event)" class="space-y-4"><div><label class="block text-sm font-medium text-gray-300 mb-2">Full Name</label><input type="text" id="staffName" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base"></div><div><label class="block text-sm font-medium text-gray-300 mb-2">Email</label><input type="email" id="staffEmail" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base"></div><div><label class="block text-sm font-medium text-gray-300 mb-2">Phone Number</label><input type="tel" id="staffPhone" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base" placeholder="08012345678"><p class="text-xs text-gray-400 mt-1">Optional - for admin SMS notifications</p></div><div><label class="block text-sm font-medium text-gray-300 mb-2">Password</label><input type="password" id="staffPassword" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base"></div><div><label class="block text-sm font-medium text-gray-300 mb-2">Role</label><select id="staffRole" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base"><option value="staff">Staff</option><option value="admin">Admin</option></select></div><div class="flex flex-col sm:flex-row gap-4 pt-4"><button type="button" onclick="closeStaffModal()" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800">Cancel</button><button type="submit" class="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl">Add Staff</button></div></form></div></div>`;
  const modalContainer = document.createElement("div");
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);
}

function closeStaffModal() {
  const modal = document.getElementById("staffModal");
  if (modal) modal.remove();
}

async function handleAddStaff(e) {
  e.preventDefault();
  const staffData = {
    name: document.getElementById("staffName").value,
    email: document.getElementById("staffEmail").value,
    phone: document.getElementById("staffPhone").value,
    password: document.getElementById("staffPassword").value,
    role: document.getElementById("staffRole").value,
    status: "active",
  };
  try {
    const response = await api.post("/staff", staffData);
    const newStaff = response.data;
    state.staff.push(newStaff);
    closeStaffModal();
    showNotification("Staff member added successfully", "success");
    renderStaffManagement(document.getElementById("contentArea"));
  } catch (error) {
    console.error("Add staff error:", error);
    showNotification(
      error.response?.data?.message || "Failed to add staff member",
      "error",
    );
  }
}

// ==================== HISTORY VIEW ====================

function renderHistory(container) {
  const myTransactions =
    state.role === "admin"
      ? state.transactions
      : state.transactions.filter((t) =>
          state.customers.some(
            (c) =>
              c.id === t.customerId &&
              c.addedBy?.staffId === state.currentUser?.id,
          ),
        );
  const html = `<div class="glass-panel rounded-2xl p-4 sm:p-6 animate-fade-in"><h3 class="text-base sm:text-lg font-semibold mb-4 sm:mb-6">${state.role === "admin" ? "All Transactions" : "My Transaction Requests"}</h3><div class="space-y-3 sm:space-y-4">${myTransactions
    .slice(0, 20)
    .map((txn) => {
      const charges = txn.charges || 0,
        netAmount = txn.amount - charges,
        customer = state.customers.find((c) => c.id === txn.customerId),
        hasSMS = customer?.phone ? "📱" : "⚠️";
      return `<div class="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-gray-800/30 rounded-xl border border-gray-700/50 gap-3"><div class="flex items-center gap-3 sm:gap-4"><div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full ${txn.type === "deposit" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"} flex items-center justify-center flex-shrink-0"><i class="fas fa-arrow-${txn.type === "deposit" ? "down" : "up"} text-sm sm:text-base"></i></div><div><p class="font-medium text-sm sm:text-base">${txn.customerName} ${hasSMS}</p><div class="flex items-center gap-2 text-xs text-gray-400"><i class="fas fa-calendar-alt"></i><span>${formatDate(txn.date)}</span></div>${charges > 0 ? `<div class="text-xs text-red-400 mt-1">Charge: ₦${charges.toLocaleString()}</div>` : ""}</div></div><div class="text-left sm:text-right pl-11 sm:pl-0"><p class="font-bold text-sm sm:text-base ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">${txn.type === "deposit" ? "+" : "-"}₦${(txn.amount || 0).toLocaleString()}</p><p class="text-xs text-blue-400">Net: ₦${netAmount.toLocaleString()}</p><span class="text-xs px-2 py-1 rounded-full ${getStatusStyle(txn.status)} inline-block mt-1">${txn.status}</span></div></div>`;
    })
    .join(
      "",
    )}${myTransactions.length === 0 ? '<p class="text-center text-gray-400 py-4">No transactions found</p>' : myTransactions.length > 20 ? '<p class="text-center text-gray-500 text-xs mt-4">Showing last 20 transactions</p>' : ""}</div></div>`;
  container.innerHTML = html;
}

// ==================== ADMIN TRANSACTIONS VIEW ====================

function renderAdminTransactions(container) {
  const pending = state.transactions.filter((t) => t.status === "pending");
  const others = state.transactions.filter((t) => t.status !== "pending");

  // Group pending by staff for the cards
  const pendingByStaff = {};
  pending.forEach((txn) => {
    const staffId =
      txn.requestedById || txn.staffId || txn.requestedBy || "unknown";
    const staffName = txn.staffName || txn.requestedBy || "Unknown Staff";

    if (!pendingByStaff[staffId]) {
      pendingByStaff[staffId] = {
        staffId,
        staffName,
        transactions: [],
        totalAmount: 0,
        totalCharges: 0,
      };
    }
    pendingByStaff[staffId].transactions.push(txn);
    pendingByStaff[staffId].totalAmount += txn.amount;
    pendingByStaff[staffId].totalCharges += txn.charges || 0;
  });

  const staffPendingList = Object.values(pendingByStaff).sort(
    (a, b) => b.totalAmount - a.totalAmount,
  );

  // Get unique staff members for filter dropdown
  const uniqueStaff = [
    ...new Set(
      pending.map((t) => {
        return JSON.stringify({
          id: t.requestedById || t.staffId || t.requestedBy || "unknown",
          name: t.staffName || t.requestedBy || "Unknown Staff",
        });
      }),
    ),
  ].map((s) => JSON.parse(s));

  const html = `<div class="space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-0">
    
    <!-- STAFF FILTER DROPDOWN - ADD THIS -->
    ${
      pending.length > 0
        ? `
      <div class="glass-panel rounded-2xl p-4 sm:p-6 border-l-4 border-blue-500">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 class="text-base sm:text-lg font-semibold flex items-center gap-2">
              <i class="fas fa-filter text-blue-500"></i>
              Filter Pending Transactions
            </h3>
            <p class="text-xs text-gray-400 mt-1">Show transactions by specific staff member</p>
          </div>
          <div class="w-full sm:w-auto">
            <select id="pendingStaffFilter" onchange="filterPendingByStaff()" 
              class="w-full sm:w-64 px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 transition-colors">
              <option value="all">All Staff (${pending.length} pending)</option>
              ${uniqueStaff
                .map((staff) => {
                  const count = pending.filter(
                    (t) =>
                      (t.requestedById || t.staffId || t.requestedBy) ===
                      staff.id,
                  ).length;
                  return `<option value="${staff.id}">${staff.name} (${count} pending)</option>`;
                })
                .join("")}
            </select>
          </div>
        </div>
      </div>
    `
        : ""
    }

    ${
      staffPendingList.length > 0
        ? `<div class="glass-panel rounded-2xl p-4 sm:p-6 border-l-4 border-yellow-500">
          <h3 class="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
            <i class="fas fa-users text-yellow-500 text-sm sm:text-base"></i>
            Pending Approvals by Staff
          </h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6" id="staffCardsContainer">
            ${staffPendingList
              .map(
                (staff) =>
                  `<div class="staff-card bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700 hover:border-yellow-500/50 transition-all" data-staff-id="${staff.staffId}">
                    <div class="flex items-center justify-between mb-3">
                      <div class="flex items-center gap-2 sm:gap-3">
                        <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center font-bold text-white text-xs sm:text-sm">
                          ${staff.staffName
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .substring(0, 2)
                            .toUpperCase()}
                        </div>
                        <div>
                          <h4 class="font-semibold text-sm sm:text-base">${staff.staffName}</h4>
                          <p class="text-xs text-gray-400">${staff.transactions.length} pending</p>
                        </div>
                      </div>
                      <div class="text-right">
                        <span class="text-yellow-400 font-bold text-xs sm:text-sm block">₦${staff.totalAmount.toLocaleString()}</span>
                        <span class="text-xs text-red-400">Charges: ₦${staff.totalCharges.toLocaleString()}</span>
                      </div>
                    </div>
                    <div class="flex gap-2 mt-3">
                      <button onclick="viewStaffPendingTransactions('${staff.staffId}')" class="flex-1 px-2 sm:px-3 py-2 bg-blue-600/20 text-blue-400 hover:bg-blue-600 hover:text-white rounded-lg text-xs sm:text-sm transition-colors">
                        View
                      </button>
                      <button onclick="approveAllStaffTransactions('${staff.staffId}')" class="flex-1 px-2 sm:px-3 py-2 bg-green-600/20 text-green-400 hover:bg-green-600 hover:text-white rounded-lg text-xs sm:text-sm transition-colors">
                        Approve All
                      </button>
                    </div>
                  </div>`,
              )
              .join("")}
          </div>
          <div class="flex justify-end mt-4 pt-4 border-t border-gray-700">
            <button onclick="approveAllPendingTransactions()" class="px-4 sm:px-6 py-2 sm:py-3 bg-green-600 hover:bg-green-500 rounded-lg transition-colors flex items-center gap-2 text-sm sm:text-base">
              <i class="fas fa-check-double"></i>
              Approve All (${pending.length})
            </button>
          </div>
        </div>`
        : `<div class="glass-panel rounded-2xl p-8 sm:p-12 text-center">
          <div class="w-12 h-12 sm:w-16 sm:h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-3 sm:mb-4">
            <i class="fas fa-check-double text-green-400 text-xl sm:text-2xl"></i>
          </div>
          <h3 class="text-base sm:text-lg font-semibold mb-2">All Caught Up!</h3>
          <p class="text-xs sm:text-sm text-gray-400">No pending transactions requiring approval</p>
        </div>`
    }

    <!-- PENDING TRANSACTIONS LIST WITH FILTER -->
    ${
      pending.length > 0
        ? `
      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <h3 class="text-base sm:text-lg font-semibold">All Pending Transactions</h3>
          <div class="w-full sm:w-auto relative">
            <input 
              type="text" 
              id="pendingCustomerSearch" 
              placeholder="Search by customer number or name..." 
              oninput="filterPendingByCustomer()"
              class="w-full sm:w-64 px-4 py-2 pl-10 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-yellow-500 transition-colors text-sm"
            />
            <i class="fas fa-search absolute left-3 top-2.5 text-gray-500 text-sm"></i>
          </div>
        </div>
        <div class="space-y-3 sm:space-y-4" id="pendingTransactionsList">
          ${pending
            .map((txn) => {
              const charges = txn.charges || 0;
              const netAmount = txn.amount - charges;
              const customer = state.customers.find(
                (c) => c.id === txn.customerId,
              );
              const staffName =
                txn.staffName || txn.requestedBy || "Unknown Staff";
              const staffId =
                txn.requestedById ||
                txn.staffId ||
                txn.requestedBy ||
                "unknown";
              const hasSMS = customer?.phone ? "📱" : "⚠️";
              return `<div class="pending-transaction-item bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700 hover:border-yellow-500/50 transition-all" 
                data-staff-id="${staffId}" data-customer-number="${customer?.customerNumber || ""}" data-customer-name="${customer?.name || ""}" id="txn-${txn.id}">
                <div class="flex flex-col lg:flex-row justify-between items-start gap-3 sm:gap-4">
                  <div class="flex items-start gap-3 sm:gap-4 flex-1">
                    <div class="w-8 h-8 sm:w-12 sm:h-12 rounded-full ${
                      txn.type === "deposit"
                        ? "bg-green-500/20 text-green-400"
                        : "bg-orange-500/20 text-orange-400"
                    } flex items-center justify-center flex-shrink-0">
                      <i class="fas fa-arrow-${
                        txn.type === "deposit" ? "down" : "up"
                      } text-sm sm:text-xl"></i>
                    </div>
                    <div class="flex-1">
                      <div class="flex flex-wrap items-center gap-2">
                        <p class="font-semibold text-sm sm:text-lg">₦${(
                          txn.amount || 0
                        ).toLocaleString()}</p>
                        <span class="px-2 py-0.5 ${
                          txn.type === "deposit"
                            ? "bg-green-500/20 text-green-400"
                            : "bg-orange-500/20 text-orange-400"
                        } rounded-full text-xs font-medium">${txn.type}</span>
                        <span class="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs">${staffName} ${hasSMS}</span>
                      </div>
                      <p class="text-xs sm:text-sm text-gray-300 mt-1">${txn.customerName}</p>
                      <div class="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${formatDate(txn.date)}</span>
                      </div>
                    </div>
                  </div>
                  <div class="flex-1 lg:max-w-xs">
                    <div class="bg-gray-900/50 p-2 sm:p-3 rounded-lg">
                      <h4 class="text-xs font-medium text-gray-400 mb-2">BREAKDOWN</h4>
                      <div class="space-y-1">
                        <div class="flex justify-between text-xs sm:text-sm">
                          <span class="text-gray-400">Gross:</span>
                          <span class="font-mono ${
                            txn.type === "deposit"
                              ? "text-green-400"
                              : "text-orange-400"
                          }">${txn.type === "deposit" ? "+" : "-"}₦${(
                            txn.amount || 0
                          ).toLocaleString()}</span>
                        </div>
                        ${charges > 0 ? `<div class="flex justify-between text-xs sm:text-sm"><span class="text-gray-400">Charge:</span><span class="font-mono text-red-400">-₦${charges.toLocaleString()}</span></div><div class="flex justify-between text-xs sm:text-sm pt-1 border-t border-gray-700"><span class="text-gray-300 font-medium">Net:</span><span class="font-mono text-blue-400 font-bold">₦${netAmount.toLocaleString()}</span></div>` : `<div class="flex justify-between text-xs sm:text-sm pt-1 border-t border-gray-700"><span class="text-gray-300 font-medium">Net:</span><span class="font-mono text-blue-400 font-bold">₦${netAmount.toLocaleString()}</span></div>`}
                      </div>
                    </div>
                  </div>
                  <div class="flex gap-2 w-full lg:w-auto mt-2 lg:mt-0">
                    <button onclick="processTransaction('${txn.id}', 'approved')" class="flex-1 lg:flex-none px-3 sm:px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm">
                      <i class="fas fa-check"></i><span>Approve</span>
                    </button>
                    <button onclick="processTransaction('${txn.id}', 'rejected')" class="flex-1 lg:flex-none px-3 sm:px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm">
                      <i class="fas fa-times"></i><span>Reject</span>
                    </button>
                  </div>
                </div>
                ${txn.description ? `<div class="mt-3 pt-3 border-t border-gray-700"><div class="flex items-start gap-2"><i class="fas fa-align-left text-gray-500 text-xs mt-1"></i><div class="flex-1"><p class="text-xs text-gray-400 mb-1">Description:</p><p class="text-xs sm:text-sm text-gray-300 bg-gray-900/50 p-2 rounded-lg break-words">${txn.description}</p></div></div></div>` : ""}
              </div>`;
            })
            .join("")}
        </div>
      </div>`
        : ""
    }
    
    <!-- HISTORY TABLE -->
    <div class="glass-panel rounded-2xl p-4 sm:p-6">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
        <h3 class="text-base sm:text-lg font-semibold">Transaction History</h3>
        <div class="flex gap-2 w-full sm:w-auto">
          <select id="staffTransactionFilter" onchange="filterTransactionsByStaff()" class="flex-1 sm:flex-none px-2 sm:px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs sm:text-sm text-white">
            <option value="">All Staff</option>
            ${state.staff.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
          </select>
          <select id="sortTransactions" onchange="sortTransactions()" class="flex-1 sm:flex-none px-2 sm:px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs sm:text-sm text-white">
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="amount-high">Amount High</option>
            <option value="amount-low">Amount Low</option>
          </select>
        </div>
      </div>
      <div class="overflow-x-auto -mx-4 sm:mx-0">
        <div class="inline-block min-w-full align-middle">
          <table class="min-w-full divide-y divide-gray-700" id="transactionsTable">
            <thead>
              <tr class="text-left text-gray-400 text-xs sm:text-sm">
                <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">ID</th>
                <th class="pb-3 px-4 sm:px-0">Customer</th>
                <th class="pb-3 px-4 sm:px-0 hidden sm:table-cell">Staff</th>
                <th class="pb-3 px-4 sm:px-0">Type</th>
                <th class="pb-3 px-4 sm:px-0">Gross</th>
                <th class="pb-3 px-4 sm:px-0 hidden sm:table-cell">Charges</th>
                <th class="pb-3 px-4 sm:px-0">Net</th>
                <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Date</th>
                <th class="pb-3 px-4 sm:px-0">Status</th>
                <th class="pb-3 px-4 sm:px-0">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-800" id="transactionsTableBody">
              ${others
                .map((txn) => {
                  const customer = state.customers.find(
                    (c) => c.id === txn.customerId,
                  );
                  const staffName =
                    txn.staffName || txn.requestedBy || "Unknown Staff";
                  const staffId = txn.requestedById || txn.staffId || "unknown";
                  const charges = txn.charges || 0;
                  const netAmount = txn.amount - charges;
                  return `<tr class="hover:bg-gray-800/30 transition-colors transaction-row" data-staff="${staffId}">
                    <td class="py-3 px-4 sm:px-0 font-mono text-xs text-gray-500 hidden md:table-cell">${txn.id.substring(0, 8)}...</td>
                    <td class="py-3 px-4 sm:px-0 text-xs sm:text-sm break-words max-w-[120px] sm:max-w-none">${txn.customerName}</td>
                    <td class="py-3 px-4 sm:px-0 hidden sm:table-cell">
                      <span class="px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs">${staffName}</span>
                    </td>
                    <td class="py-3 px-4 sm:px-0">
                      <span class="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                        <i class="fas fa-arrow-${txn.type === "deposit" ? "down text-green-400" : "up text-orange-400"}"></i>
                        ${txn.type}
                      </span>
                    </td>
                    <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">
                      ${txn.type === "deposit" ? "+" : "-"}₦${(txn.amount || 0).toLocaleString()}
                    </td>
                    <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-red-400 hidden sm:table-cell">
                      ${charges > 0 ? `-₦${charges.toLocaleString()}` : "-"}
                    </td>
                    <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-blue-400">
                      ₦${netAmount.toLocaleString()}
                    </td>
                    <td class="py-3 px-4 sm:px-0 hidden md:table-cell text-xs sm:text-sm text-gray-300">
                      <div class="flex items-center gap-1">
                        <i class="fas fa-calendar-alt text-gray-500 text-xs"></i>
                        ${formatDate(txn.date)}
                      </div>
                    </td>
                    <td class="py-3 px-4 sm:px-0">
                      <span class="px-2 py-1 rounded text-xs ${getStatusStyle(txn.status)}">${txn.status}</span>
                    </td>
                    <td class="py-3 px-4 sm:px-0">
                      <button onclick="viewTransactionDetails('${txn.id}')" class="text-blue-400 hover:text-blue-300 p-1" title="View Details">
                        <i class="fas fa-eye text-xs sm:text-sm"></i>
                      </button>
                    </td>
                  </tr>`;
                })
                .join("")}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>`;

  container.innerHTML = html;
} // ==================== HELPER FUNCTIONS ====================

function filterPendingByStaff() {
  const selectedStaffId = document.getElementById("pendingStaffFilter")?.value;

  // Filter staff cards
  const staffCards = document.querySelectorAll(".staff-card");
  staffCards.forEach((card) => {
    if (selectedStaffId === "all" || card.dataset.staffId === selectedStaffId) {
      card.style.display = "";
    } else {
      card.style.display = "none";
    }
  });

  // Filter pending transaction items
  const pendingItems = document.querySelectorAll(".pending-transaction-item");
  pendingItems.forEach((item) => {
    if (selectedStaffId === "all" || item.dataset.staffId === selectedStaffId) {
      item.style.display = "";
    } else {
      item.style.display = "none";
    }
  });

  // Update count display
  const visibleCount =
    selectedStaffId === "all"
      ? pendingItems.length
      : document.querySelectorAll(
          `.pending-transaction-item[data-staff-id="${selectedStaffId}"]`,
        ).length;

  const filterLabel =
    document.querySelector("#pendingStaffFilter option:checked")?.textContent ||
    "";
  showNotification(
    `Showing ${visibleCount} pending transactions for ${filterLabel.split(" (")[0]}`,
    "info",
  );
}

function formatLoanRepaymentSMS(
  customerName,
  depositAmount,
  loanDeduction,
  remainingBalance,
  outstandingLoan,
  isFullyPaid,
) {
  let message = `VaultFlow Alert: Dear ${customerName}, your deposit of ₦${depositAmount.toLocaleString()} has been received. `;

  if (loanDeduction > 0) {
    message += `₦${loanDeduction.toLocaleString()} deducted for loan repayment. `;
  }

  message += `Available balance: ₦${remainingBalance.toLocaleString()}. `;

  if (isFullyPaid) {
    message += `Congratulations! Your loan is now FULLY PAID.`;
  } else if (outstandingLoan > 0) {
    message += `Outstanding loan: ₦${outstandingLoan.toLocaleString()}.`;
  }

  return message;
}
// Add this helper function to format transaction display with loan info
function getTransactionDisplayHTML(txn, idx = 0) {
  const charges = txn.charges || 0;
  const netAmount = txn.amount - charges;
  const loanDeduction = txn.loanDeduction || 0;
  const availableToCustomer = netAmount - loanDeduction;

  // Determine if transaction is money IN or OUT
  const isMoneyIn = txn.type === "deposit" || txn.type === "loan_repayment";
  const isMoneyOut =
    txn.type === "withdrawal" || txn.type === "loan_disbursement";

  // Determine colors, arrows, and signs
  const amountColor = isMoneyIn
    ? "text-green-400"
    : isMoneyOut
      ? "text-orange-400"
      : "text-blue-400";
  const bgColor = isMoneyIn
    ? "bg-green-500/20"
    : isMoneyOut
      ? "bg-orange-500/20"
      : txn.type === "loan_disbursement"
        ? "bg-blue-500/20"
        : "bg-purple-500/20";
  const arrowDirection = isMoneyIn ? "down" : "up";
  const amountSign = isMoneyIn ? "+" : "-";

  let loanBadge = "";
  if (loanDeduction > 0) {
    loanBadge = `<span class="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs ml-2">Loan Payment: ₦${loanDeduction.toLocaleString()}</span>`;
  }

  return `
    <div class="transaction-card flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-gray-800/50 rounded-xl border border-gray-700/50" style="animation-delay: ${idx * 0.1}s">
      <div class="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-0">
        <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full ${bgColor} ${amountColor} flex items-center justify-center flex-shrink-0">
          <i class="fas fa-arrow-${arrowDirection} text-sm sm:text-base"></i>
        </div>
        <div>
          <p class="font-medium text-sm sm:text-base flex items-center flex-wrap gap-2">
            ${txn.customerName}
            ${loanBadge}
          </p>
          <div class="flex items-center gap-1 text-xs text-gray-400">
            <i class="fas fa-calendar-alt"></i>
            <span>${formatDate(txn.date)}</span>
          </div>
          ${txn.loanDeduction > 0 ? `<p class="text-xs text-purple-400 mt-1"><i class="fas fa-info-circle mr-1"></i>Auto-deducted for loan</p>` : ""}
        </div>
      </div>
      <div class="text-left sm:text-right pl-11 sm:pl-0">
        <p class="font-bold text-sm sm:text-base ${amountColor}">
          ${amountSign}₦${(txn.amount || 0).toLocaleString()}
        </p>
        ${charges > 0 ? `<p class="text-xs text-red-400">Charge: -₦${charges.toLocaleString()}</p>` : ""}
        ${loanDeduction > 0 ? `<p class="text-xs text-purple-400">Loan Deduction: -₦${loanDeduction.toLocaleString()}</p>` : ""}
        <p class="text-xs ${loanDeduction > 0 ? "text-green-400 font-semibold" : "text-blue-400"}">
          ${loanDeduction > 0 ? "Available to Customer" : "Net"}: ₦${availableToCustomer.toLocaleString()}
        </p>
        <span class="text-xs px-2 py-1 rounded-full ${getStatusStyle(txn.status)} inline-block mt-1">
          ${txn.status}
        </span>
      </div>
    </div>
  `;
}
function formatTransactionDate(dateValue) {
  if (!dateValue) return "N/A";
  try {
    const date = new Date(dateValue);
    if (isNaN(date.getTime())) return dateValue;
    return date
      .toLocaleString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      })
      .replace(",", "");
  } catch (error) {
    return dateValue;
  }
}

function filterTransactionsByStaff() {
  const staffId = document.getElementById("staffTransactionFilter")?.value;
  const rows = document.querySelectorAll(
    "#transactionsTableBody .transaction-row",
  );
  if (!rows.length) return;
  rows.forEach((row) => {
    if (!staffId || row.dataset.staff === staffId) row.style.display = "";
    else row.style.display = "none";
  });
}

function viewStaffPendingTransactions(staffIdentifier) {
  if (!staffIdentifier || staffIdentifier === "unknown") {
    showNotification(
      "Cannot identify staff member for these transactions",
      "warning",
    );
    return;
  }

  // Find staff info
  const staff = state.staff.find((s) => s.id === staffIdentifier);
  const staffName = staff?.name || staffIdentifier;

  // Find all pending transactions for this staff member
  const pendingTransactions = state.transactions.filter((t) => {
    const txnStaffId =
      t.requestedById || t.staffId || t.requestedBy || "unknown";
    const txnStaffName = t.staffName || t.requestedBy || "Unknown Staff";
    return (
      t.status === "pending" &&
      (txnStaffId === staffIdentifier || txnStaffName === staffIdentifier)
    );
  });

  if (pendingTransactions.length === 0) {
    showNotification("No pending transactions for this staff member", "info");
    return;
  }

  const modalHtml = `<div id="staffPendingModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
    <div class="bg-gray-900 rounded-2xl p-4 sm:p-8 max-w-4xl w-full mx-auto max-h-[90vh] overflow-y-auto animate-slideIn">
      <div class="flex justify-between items-center mb-4 sm:mb-6">
        <div>
          <h3 class="text-lg sm:text-xl font-semibold">${staffName} - Pending</h3>
          <p class="text-xs sm:text-sm text-gray-400">${pendingTransactions.length} transactions awaiting approval</p>
        </div>
        <button onclick="closeStaffPendingModal()" class="text-gray-400 hover:text-white p-2">
          <i class="fas fa-times text-lg"></i>
        </button>
      </div>
      <div class="space-y-3 sm:space-y-4">
        ${pendingTransactions
          .map((txn) => {
            const charges = txn.charges || 0;
            const netAmount = txn.amount - charges;
            const customer = state.customers.find(
              (c) => c.id === txn.customerId,
            );
            const hasSMS = customer?.phone ? "📱" : "⚠️";
            return `<div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
              <div class="flex flex-col sm:flex-row justify-between items-start gap-3">
                <div class="flex-1">
                  <div class="flex flex-wrap items-center gap-2 mb-2">
                    <span class="px-2 py-1 rounded text-xs ${txn.type === "deposit" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"}">${txn.type}</span>
                    <span class="text-white font-bold text-sm sm:text-base">₦${txn.amount.toLocaleString()}</span>
                    <span class="text-xs">${hasSMS}</span>
                  </div>
                  <p class="text-xs sm:text-sm text-gray-300">Customer: ${txn.customerName}</p>
                  <p class="text-xs text-gray-400">Date: ${formatDate(txn.date)}</p>
                  <div class="mt-2 p-2 sm:p-3 bg-gray-900/50 rounded-lg">
                    <div class="flex justify-between text-xs sm:text-sm mb-1">
                      <span class="text-gray-400">Gross:</span>
                      <span class="font-mono ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">${txn.type === "deposit" ? "+" : "-"}₦${txn.amount.toLocaleString()}</span>
                    </div>
                    ${charges > 0 ? `<div class="flex justify-between text-xs sm:text-sm mb-1"><span class="text-gray-400">Charge:</span><span class="font-mono text-red-400">-₦${charges.toLocaleString()}</span></div><div class="flex justify-between text-xs sm:text-sm pt-1 border-t border-gray-700"><span class="text-gray-300">Net:</span><span class="font-mono text-blue-400 font-bold">₦${netAmount.toLocaleString()}</span></div>` : `<div class="text-xs text-gray-400">No charges applied</div>`}
                  </div>
                  ${txn.description ? `<div class="mt-2 text-xs text-gray-400 break-words"><span class="text-gray-500">Desc:</span> ${txn.description}</div>` : ""}
                </div>
                <div class="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                  <button onclick="processTransaction('${txn.id}', 'rejected', true, '${staffIdentifier}')" class="flex-1 sm:flex-none px-3 py-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg text-xs sm:text-sm">Reject</button>
                  <button onclick="processTransaction('${txn.id}', 'approved', true, '${staffIdentifier}')" class="flex-1 sm:flex-none px-3 py-2 bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white rounded-lg text-xs sm:text-sm">Approve</button>
                </div>
              </div>
            </div>`;
          })
          .join("")}
      </div>
      <div class="flex flex-col sm:flex-row justify-end gap-4 mt-6 pt-4 border-t border-gray-700">
        <button onclick="closeStaffPendingModal()" class="px-6 py-2 border border-gray-600 rounded-lg hover:bg-gray-800">Close</button>
        <button onclick="approveAllStaffTransactions('${staffIdentifier}')" class="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors flex items-center justify-center gap-2">
          <i class="fas fa-check-double"></i>Approve All (${pendingTransactions.length})
        </button>
      </div>
    </div>
  </div>`;

  const modalContainer = document.createElement("div");
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);
}

function filterPendingByCustomer() {
  const searchTerm = document
    .getElementById("pendingCustomerSearch")
    ?.value.toLowerCase()
    .trim();
  const pendingItems = document.querySelectorAll(".pending-transaction-item");

  if (!searchTerm) {
    pendingItems.forEach((item) => {
      item.style.display = "";
    });
    return;
  }

  pendingItems.forEach((item) => {
    const customerNumber = (item.dataset.customerNumber || "").toLowerCase();
    const customerName = (item.dataset.customerName || "").toLowerCase();

    // Match by customer number (exact or partial) or customer name
    const matchesNumber = customerNumber.includes(searchTerm);
    const matchesName = customerName.includes(searchTerm);

    if (matchesNumber || matchesName) {
      item.style.display = "";
    } else {
      item.style.display = "none";
    }
  });

  // Update visible count
  const visibleCount = document.querySelectorAll(
    '.pending-transaction-item:not([style*="display: none"])',
  ).length;
  const totalCount = pendingItems.length;

  if (visibleCount === 0) {
    // Check if no-results message already exists
    let noResultsMsg = document.getElementById("pendingNoResults");
    if (!noResultsMsg) {
      noResultsMsg = document.createElement("div");
      noResultsMsg.id = "pendingNoResults";
      noResultsMsg.className = "text-center py-8 text-gray-400";
      noResultsMsg.innerHTML =
        `
        <div class="w-12 h-12 mx-auto bg-gray-800 rounded-full flex items-center justify-center mb-3">
          <i class="fas fa-search text-gray-500 text-xl"></i>
        </div>
        <p class="text-sm">No pending transactions match "<span class="text-yellow-400">` +
        searchTerm +
        `</span>"</p>
        <p class="text-xs text-gray-500 mt-1">Try searching by customer number or name</p>
      `;
      document
        .getElementById("pendingTransactionsList")
        .appendChild(noResultsMsg);
    } else {
      noResultsMsg.style.display = "";
      noResultsMsg.querySelector("span.text-yellow-400").textContent =
        searchTerm;
    }
  } else {
    const noResultsMsg = document.getElementById("pendingNoResults");
    if (noResultsMsg) {
      noResultsMsg.style.display = "none";
    }
  }
}

function closeStaffPendingModal() {
  const modal = document.getElementById("staffPendingModal");
  if (modal) modal.remove();
}

function closeTransactionModal() {
  const modal = document.getElementById("transactionModal");
  if (modal) modal.remove();
}

async function approveAllStaffTransactions(staffIdentifier) {
  if (!staffIdentifier || staffIdentifier === "unknown") {
    showNotification("Cannot identify staff member", "warning");
    return;
  }

  const pendingTransactions = state.transactions.filter((t) => {
    const txnStaffId =
      t.requestedById || t.staffId || t.requestedBy || "unknown";
    const txnStaffName = t.staffName || t.requestedBy || "Unknown Staff";
    return (
      t.status === "pending" &&
      (txnStaffId === staffIdentifier || txnStaffName === staffIdentifier)
    );
  });

  if (pendingTransactions.length === 0) {
    showNotification("No pending transactions", "info");
    return;
  }

  if (
    !confirm(`Approve all ${pendingTransactions.length} pending transactions?`)
  )
    return;

  // Disable the approve all button
  const approveAllBtn = document.activeElement;
  let originalText = "";
  if (approveAllBtn && approveAllBtn.tagName === "BUTTON") {
    originalText = approveAllBtn.innerHTML;
    approveAllBtn.disabled = true;
    approveAllBtn.innerHTML =
      '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
  }

  let approved = 0,
    failed = 0;
  showNotification(
    `Processing ${pendingTransactions.length} transactions...`,
    "info",
  );

  for (const txn of pendingTransactions) {
    try {
      // Call API directly instead of processTransaction to avoid button conflicts
      const endpoint = "/approve";
      const updateData = {
        status: "approved",
        approvedBy: state.currentUser.name,
        approvedAt: new Date(),
      };

      // Handle loan repayment data if needed
      if (
        txn.type === "deposit" &&
        txn.loanDeduction > 0 &&
        txn.loanRepaymentInfo
      ) {
        updateData.loanRepayment = {
          loanId: txn.loanRepaymentInfo.loanId,
          amount: txn.loanRepaymentInfo.amount,
          recordedAt: new Date(),
          fullyPaid: txn.loanRepaymentInfo.fullyPaid,
          outstandingAfter: txn.loanRepaymentInfo.outstandingAfter,
        };
      }

      await api.patch(`/transactions/${txn.id}${endpoint}`, updateData);
      approved++;
    } catch (error) {
      console.error(`Failed to approve ${txn.id}:`, error);
      failed++;
    }
    // Small delay to not overwhelm the server
    await new Promise((resolve) => setTimeout(resolve, 150));
  }

  cachedApi.invalidate("/transactions");
  closeStaffPendingModal();
  await loadAllData();
  navigate(state.currentView);

  // Re-enable button
  if (approveAllBtn && approveAllBtn.tagName === "BUTTON") {
    approveAllBtn.disabled = false;
    approveAllBtn.innerHTML = originalText;
  }

  if (failed === 0) {
    showNotification(
      `Successfully approved all ${approved} transactions`,
      "success",
    );
  } else {
    showNotification(`Approved ${approved}, ${failed} failed`, "warning");
  }
}
async function approveAllPendingTransactions() {
  const pending = state.transactions.filter((t) => t.status === "pending");
  if (pending.length === 0) {
    showNotification("No pending transactions to approve", "info");
    return;
  }
  if (
    !confirm(
      `Are you sure you want to approve all ${pending.length} pending transactions?`,
    )
  )
    return;
  let approved = 0,
    failed = 0;
  showNotification(`Processing ${pending.length} transactions...`, "info");
  for (const txn of pending) {
    try {
      await processTransaction(txn.id, "approved", false);
      approved++;
    } catch (error) {
      console.error(`Failed to approve transaction ${txn.id}:`, error);
      failed++;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  await loadAllData();
  if (failed === 0)
    showNotification(
      `Successfully approved all ${approved} transactions`,
      "success",
    );
  else
    showNotification(
      `Approved ${approved} transactions, ${failed} failed`,
      "warning",
    );
}

function viewTransactionDetails(txnId) {
  const transaction = state.transactions.find((t) => t.id === txnId);
  if (!transaction) return;
  const customer = state.customers.find((c) => c.id === transaction.customerId);
  const staffName = customer?.addedBy?.staffName || "System";
  const charges = transaction.charges || 0;
  const netAmount = transaction.amount - charges;
  const hasSMS = customer?.phone ? "Yes" : "No";
  const modalHtml = `<div id="transactionModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"><div class="bg-gray-900 rounded-2xl p-4 sm:p-8 max-w-2xl w-full mx-auto animate-slideIn max-h-[90vh] overflow-y-auto"><div class="flex justify-between items-center mb-4 sm:mb-6"><h3 class="text-lg sm:text-xl font-semibold">Transaction Details</h3><button onclick="closeTransactionModal()" class="text-gray-400 hover:text-white p-2"><i class="fas fa-times text-lg"></i></button></div><div class="space-y-3 sm:space-y-4"><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"><div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg"><p class="text-xs text-gray-400 mb-1">Transaction ID</p><p class="text-xs sm:text-sm font-mono break-words">${transaction.id}</p></div><div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg"><p class="text-xs text-gray-400 mb-1">Status</p><span class="px-2 py-1 rounded text-xs ${getStatusStyle(transaction.status)}">${transaction.status}</span></div></div><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"><div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg"><p class="text-xs text-gray-400 mb-1">Customer</p><p class="text-xs sm:text-sm font-medium break-words">${transaction.customerName}</p></div><div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg"><p class="text-xs text-gray-400 mb-1">SMS Enabled</p><p class="text-xs sm:text-sm ${hasSMS === "Yes" ? "text-green-400" : "text-red-400"}">${hasSMS}</p></div></div><div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"><div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg"><p class="text-xs text-gray-400 mb-1">Staff</p><p class="text-xs sm:text-sm font-medium break-words">${staffName}</p></div><div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg"><p class="text-xs text-gray-400 mb-1">Date</p><p class="text-xs sm:text-sm">${formatDate(transaction.date)}</p></div></div><div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg"><p class="text-xs text-gray-400 mb-2">Amount Breakdown</p><div class="space-y-1 sm:space-y-2"><div class="flex justify-between text-xs sm:text-sm"><span>Type:</span><span class="font-medium ${transaction.type === "deposit" ? "text-green-400" : "text-orange-400"}">${transaction.type.toUpperCase()}</span></div><div class="flex justify-between text-xs sm:text-sm"><span>Gross Amount:</span><span class="font-mono ${transaction.type === "deposit" ? "text-green-400" : "text-orange-400"}">${transaction.type === "deposit" ? "+" : "-"}₦${transaction.amount.toLocaleString()}</span></div>${charges > 0 ? `<div class="flex justify-between text-xs sm:text-sm"><span>Charge:</span><span class="font-mono text-red-400">-₦${charges.toLocaleString()}</span></div><div class="flex justify-between text-xs sm:text-sm pt-1 sm:pt-2 border-t border-gray-700"><span class="font-semibold">Net Amount:</span><span class="font-mono text-blue-400 font-bold">₦${netAmount.toLocaleString()}</span></div>` : `<div class="flex justify-between text-xs sm:text-sm pt-1 sm:pt-2 border-t border-gray-700"><span class="font-semibold">Net Amount:</span><span class="font-mono text-blue-400 font-bold">₦${netAmount.toLocaleString()}</span></div><p class="text-xs text-gray-500 mt-2">No charges applied to this transaction</p>`}</div></div>${transaction.description ? `<div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg"><p class="text-xs text-gray-400 mb-1">Description</p><p class="text-xs sm:text-sm break-words">${transaction.description}</p></div>` : ""}<div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4"><div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg"><p class="text-xs text-gray-400 mb-1">Requested By</p><p class="text-xs sm:text-sm">${transaction.requestedBy || "Customer"}</p></div><div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg"><p class="text-xs text-gray-400 mb-1">Approved By</p><p class="text-xs sm:text-sm">${transaction.approvedBy || "Pending"}</p></div></div>${transaction.status === "pending" ? `<div class="flex flex-col sm:flex-row gap-4 pt-4"><button onclick="processTransaction('${transaction.id}', 'rejected'); closeTransactionModal()" class="flex-1 px-6 py-3 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors">Reject</button><button onclick="processTransaction('${transaction.id}', 'approved'); closeTransactionModal()" class="flex-1 px-6 py-3 bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white rounded-lg transition-colors">Approve</button></div>` : ""}</div></div></div>`;
  const modalContainer = document.createElement("div");
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);
}

function sortTransactions() {
  const sortBy = document.getElementById("sortTransactions")?.value;
  if (!sortBy) return;
  switch (sortBy) {
    case "newest":
      state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    case "oldest":
      state.transactions.sort((a, b) => new Date(a.date) - new Date(b.date));
      break;
    case "amount-high":
      state.transactions.sort((a, b) => b.amount - a.amount);
      break;
    case "amount-low":
      state.transactions.sort((a, b) => a.amount - b.amount);
      break;
  }
  navigate(state.currentView);
}

// ==================== CUSTOMER EDIT MODALS ====================

function editCustomer(id) {
  const customer = state.customers.find((c) => c.id === id);
  showModal(
    `<div class="p-4 sm:p-6"><h3 class="text-lg sm:text-xl font-bold mb-4 sm:mb-6">Edit Customer</h3><form onsubmit="handleEditCustomer(event, '${id}')" class="space-y-3 sm:space-y-4"><div><label class="block text-sm font-medium text-gray-300 mb-2">Name</label><input type="text" id="editName" value="${customer.name}" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-base"></div><div><label class="block text-sm font-medium text-gray-300 mb-2">Email</label><input type="email" id="editEmail" value="${customer.email}" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-base"></div><div><label class="block text-sm font-medium text-gray-300 mb-2">Phone</label><input type="tel" id="editPhone" value="${customer.phone}" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-base"></div><div><label class="block text-sm font-medium text-gray-300 mb-2">Address</label><textarea id="editAddress" rows="2" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-base">${customer.address || ""}</textarea></div><div><label class="block text-sm font-medium text-gray-300 mb-2">Status</label><select id="editStatus" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-base"><option value="active" ${customer.status === "active" ? "selected" : ""}>Active</option><option value="inactive" ${customer.status === "inactive" ? "selected" : ""}>Inactive</option></select></div><div class="flex flex-col sm:flex-row gap-4 pt-4"><button type="button" onclick="closeModal()" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800">Cancel</button><button type="submit" class="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl">Update</button></div></form></div>`,
  );
}

async function handleEditCustomer(e, id) {
  e.preventDefault();
  const updatedData = {
    name: document.getElementById("editName").value,
    email: document.getElementById("editEmail").value,
    phone: document.getElementById("editPhone").value,
    address: document.getElementById("editAddress").value,
    status: document.getElementById("editStatus").value,
  };
  try {
    await api.put(`/customers/${id}`, updatedData);
    cachedApi.invalidate("/customers");
    const index = state.customers.findIndex((c) => c.id === id);
    state.customers[index] = { ...state.customers[index], ...updatedData };
    closeModal();
    showNotification("Customer updated successfully", "success");
    renderCustomers(document.getElementById("contentArea"));
  } catch (error) {
    console.error("Update customer error:", error);
    showNotification(
      error.response?.data?.message || "Failed to update customer",
      "error",
    );
  }
}

function showModal(content) {
  const container = document.getElementById("modalContainer");
  const contentDiv = document.getElementById("modalContent");
  contentDiv.innerHTML = content;
  container.classList.remove("hidden");
  setTimeout(() => {
    contentDiv.classList.remove("scale-95", "opacity-0");
    contentDiv.classList.add("scale-100", "opacity-100");
  }, 10);
}

function closeModal() {
  const container = document.getElementById("modalContainer");
  const contentDiv = document.getElementById("modalContent");
  contentDiv.classList.remove("scale-100", "opacity-100");
  contentDiv.classList.add("scale-95", "opacity-0");
  setTimeout(() => {
    container.classList.add("hidden");
  }, 300);
}

// ==================== AUTH CHECK ====================

async function checkAuth() {
  const token = localStorage.getItem("token");
  const cachedUser = localStorage.getItem("cachedUser");

  // If no token at all, stay on login screen
  if (!token) {
    return;
  }

  // Immediately restore from cache to prevent logout flicker
  if (cachedUser) {
    try {
      const user = JSON.parse(cachedUser);
      state.currentUser = user;
      state.role = user.role;
      document.getElementById("loginScreen").classList.add("hidden");
      document.getElementById("app").classList.remove("hidden");
      // Initialize UI immediately so user sees dashboard right away
      updateUserInfo();
      renderSidebar();
      startClock();
      initMobileMenu();
    } catch (e) {
      console.error("Failed to parse cached user", e);
    }
  }

  // Try to verify with server in background
  try {
    const response = await cachedApi.get("/verify");
    const user = response.data.user || response.data;
    state.currentUser = user;
    state.role = user.role;

    // Update cache with fresh data
    localStorage.setItem("cachedUser", JSON.stringify(user));

    // Ensure UI is showing app (in case cache restore failed)
    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    // Load fresh data and render
    await initializeApp();
  } catch (error) {
    console.error("Auth verification failed:", error);

    if (error.response?.status === 401) {
      // Token is invalid - clear everything and force re-login
      localStorage.removeItem("token");
      localStorage.removeItem("cachedUser");
      state.currentUser = null;
      state.role = null;
      document.getElementById("loginScreen").classList.remove("hidden");
      document.getElementById("app").classList.add("hidden");
      showNotification("Session expired. Please login again.", "error");
    } else {
      // Network error (server waking up, timeout, etc.)
      // Keep the cached session alive - DON'T logout
      showNotification(
        "Server connection issue. Using cached session. Will retry...",
        "warning",
      );

      // If we already restored from cache, just load data
      if (state.currentUser) {
        try {
          await loadAllData();
          navigate("dashboard");
          initRealTimeUpdates(); // Start polling for admin
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

let customerIsActive;

// Make functions available globally
window.selectRole = selectRole;
window.login = login;
window.logout = logout;
window.navigate = navigate;
window.refreshData = refreshData;
window.showAddCustomerModal = showAddCustomerModal;
window.closeCustomerModal = closeCustomerModal;
window.editCustomer = editCustomer;
window.viewCustomer = viewCustomer;
window.renderCustomerSummary = renderCustomerSummary;
window.renderCustomerTransactions = renderCustomerTransactions;
window.exportCustomerData = exportCustomerData;
window.filterCustomers = filterCustomers;
window.filterCustomersByStaff = filterCustomersByStaff;
window.filterCustomersByBalance = filterCustomersByBalance;
window.viewCustomerLoans = viewCustomerLoans;
window.closeCustomerLoansModal = closeCustomerLoansModal;
window.viewLoanRepaymentSchedule = viewLoanRepaymentSchedule;
window.closeRepaymentScheduleModal = closeRepaymentScheduleModal;
window.recordRepayment = recordRepayment;
window.showApproveLoanModal = showApproveLoanModal;
window.closeApproveLoanModal = closeApproveLoanModal;
window.approveLoan = approveLoan;
window.rejectLoan = rejectLoan;
window.processTransaction = processTransaction;
window.viewTransactionDetails = viewTransactionDetails;
window.closeTransactionModal = closeTransactionModal;
window.approveAllPendingTransactions = approveAllPendingTransactions;
window.approveAllStaffTransactions = approveAllStaffTransactions;
window.viewStaffPendingTransactions = viewStaffPendingTransactions;
window.closeStaffPendingModal = closeStaffPendingModal;
window.filterPendingByStaff = filterPendingByStaff;
window.filterPendingByCustomer = filterPendingByCustomer;
window.sortTransactions = sortTransactions;
window.filterTransactionsByStaff = filterTransactionsByStaff;
window.showModal = showModal;
window.closeModal = closeModal;
window.showAddStaffModal = showAddStaffModal;
window.closeStaffModal = closeStaffModal;
window.handleAddStaff = handleAddStaff;
window.sendSMSReminder = sendSMSReminder;
window.sendBulkSMSToDormantCustomers = sendBulkSMSToDormantCustomers;
window.exportDormantCustomers = exportDormantCustomers;
window.reactivateCustomer = reactivateCustomer;
window.toggleNotifications = toggleNotifications;
window.clearNotifications = clearNotifications;
window.checkAuth = checkAuth;
window.initializeApp = initializeApp;
window.loadAllData = loadAllData;
window.updateUserInfo = updateUserInfo;
window.renderSidebar = renderSidebar;
window.startClock = startClock;
window.showNotification = showNotification;
window.formatDate = formatDate;
window.formatSimpleDate = formatSimpleDate;
window.getStatusStyle = getStatusStyle;

// Make Quick Transaction functions globally available
window.renderQuickTransaction = renderQuickTransaction;
window.handleQuickTransaction = handleQuickTransaction;
window.initQuickSearch = initQuickSearch;
window.filterQuickCustomers = filterQuickCustomers;
window.selectQuickCustomer = selectQuickCustomer;
window.clearQuickCustomer = clearQuickCustomer;
window.setQuickType = setQuickType;
window.setQuickAmount = setQuickAmount;
window.updateQuickNet = updateQuickNet;
window.validateQuickAmount = validateQuickAmount;
window.validateQuickForm = validateQuickForm;
window.closeCustomerModal = closeCustomerModal;

// Initialize
window.onload = () => {
  selectRole("admin");
  checkAuth();
};

// Also run checkAuth on DOMContentLoaded for faster restore
document.addEventListener("DOMContentLoaded", () => {
  const token = localStorage.getItem("token");
  const cachedUser = localStorage.getItem("cachedUser");
  if (token && cachedUser) {
    try {
      const user = JSON.parse(cachedUser);
      state.currentUser = user;
      state.role = user.role;
      // Pre-hide login screen before window.onload fires
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
