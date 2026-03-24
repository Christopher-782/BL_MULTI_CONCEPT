// Application State
const state = {
  currentUser: null,
  role: null,
  currentView: "dashboard",
  customers: [],
  transactions: [],
  staff: [],
  notifications: [],
  isLoading: false,
};

// Axios Configuration
const api = axios.create({
  baseURL: "https://bl-multi-concept.onrender.com/",
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

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
  (error) => {
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
    { id: "staff", icon: "fa-user-shield", label: "Staff Management" },
    { id: "reports", icon: "fa-file-alt", label: "Reports" },
    { id: "customer-reports", icon: "fa-chart-pie", label: "Customer Reports" },
    { id: "settings", icon: "fa-cog", label: "Settings" },
  ],
  staff: [
    { id: "dashboard", icon: "fa-chart-line", label: "Dashboard" },
    { id: "customers", icon: "fa-users", label: "All Customers" },
    {
      id: "new-customer",
      icon: "fa-user-plus",
      label: "Register Customer",
    },
    {
      id: "transactions",
      icon: "fa-exchange-alt",
      label: "New Transaction",
    },
    { id: "history", icon: "fa-history", label: "My History" },
  ],
};

// ==================== MOBILE MENU FUNCTIONALITY ====================

function initMobileMenu() {
  const sidebar = document.querySelector(".sidebar");
  const menuToggle = document.getElementById("mobileMenuToggle");
  const overlay = document.getElementById("sidebarOverlay");

  if (window.innerWidth < 768) {
    if (menuToggle) menuToggle.style.display = "flex";
    if (overlay) overlay.style.display = "block";
  } else {
    if (menuToggle) menuToggle.style.display = "none";
    if (overlay) overlay.style.display = "none";
    if (sidebar) sidebar.classList.remove("open");
  }

  if (menuToggle && sidebar && overlay) {
    const newToggle = menuToggle.cloneNode(true);
    menuToggle.parentNode.replaceChild(newToggle, menuToggle);

    newToggle.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      sidebar.classList.toggle("open");
      overlay.classList.toggle("hidden");
      document.body.style.overflow = sidebar.classList.contains("open")
        ? "hidden"
        : "";
    });

    overlay.addEventListener("click", () => {
      sidebar.classList.remove("open");
      overlay.classList.add("hidden");
      document.body.style.overflow = "";
    });

    const menuItems = sidebar.querySelectorAll(".sidebar-item");
    menuItems.forEach((item) => {
      item.addEventListener("click", () => {
        if (window.innerWidth < 768) {
          sidebar.classList.remove("open");
          overlay.classList.add("hidden");
          document.body.style.overflow = "";
        }
      });
    });
  }
}

window.addEventListener("resize", () => {
  const sidebar = document.querySelector(".sidebar");
  const menuToggle = document.getElementById("mobileMenuToggle");
  const overlay = document.getElementById("sidebarOverlay");

  if (window.innerWidth >= 768) {
    if (menuToggle) menuToggle.style.display = "none";
    if (overlay) overlay.style.display = "none";
    if (sidebar) sidebar.classList.remove("open");
    document.body.style.overflow = "";
  } else {
    if (menuToggle) menuToggle.style.display = "flex";
    if (overlay) overlay.style.display = "block";
  }
});

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

  const isMobile = window.innerWidth < 768;
  const notif = document.createElement("div");
  notif.className = `fixed ${isMobile ? "top-16 left-4 right-4" : "top-4 right-4"} ${colors[type]} text-white px-4 sm:px-6 py-2 sm:py-3 rounded-xl shadow-2xl z-50 notification flex items-center gap-2 sm:gap-3 animate-slideIn text-sm sm:text-base`;
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

  try {
    const response = await api.post("/login", {
      email,
      password,
      role: state.role,
    });

    state.currentUser = response.data;

    document.getElementById("loginScreen").classList.add("hidden");
    document.getElementById("app").classList.remove("hidden");

    await initializeApp();
  } catch (error) {
    console.error("Login error:", error);
    showNotification(error.response?.data?.error || "Login failed", "error");
  }
}

async function initializeApp() {
  updateUserInfo();
  await loadAllData();
  renderSidebar();
  navigate("dashboard");
  startClock();
  setTimeout(() => initMobileMenu(), 100);
}

async function loadAllData() {
  state.isLoading = true;
  try {
    const [customersRes, transactionsRes] = await Promise.all([
      api.get("/customers"),
      api.get("/transactions"),
    ]);

    state.customers = customersRes.data;
    state.transactions = transactionsRes.data;

    state.transactions.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (state.role === "admin") {
      try {
        const staffRes = await api.get("/staff");
        state.staff = staffRes.data;
      } catch (staffError) {
        console.warn("Could not load staff data:", staffError);
        state.staff = [];
        showNotification("Staff data could not be loaded", "warning");
      }
    }

    checkPendingNotifications();
  } catch (error) {
    console.error("Failed to load critical data:", error);
    showNotification("Failed to load data from server", "error");
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
    btn.onclick = () => navigate(item.id);

    let badge = "";
    if (item.badge === "pending") {
      const pendingCount = state.transactions.filter(
        (t) => t.status === "pending",
      ).length;
      if (pendingCount > 0) {
        badge = `<span class="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">${pendingCount}</span>`;
      }
    }

    btn.innerHTML = `
      <i class="fas ${item.icon} w-5 text-base sm:text-lg"></i>
      <span class="flex-1 text-sm sm:text-base">${item.label}</span>
      ${badge}
    `;
    menuContainer.appendChild(btn);
  });
}

// ==================== DASHBOARD VIEW ====================

function renderDashboard(container) {
  const totalBalance = state.customers.reduce(
    (sum, c) => sum + (c.balance || 0),
    0,
  );
  const pendingCount = state.transactions.filter(
    (t) => t.status === "pending",
  ).length;
  const todayTransactions = state.transactions.filter((t) => {
    const txnDate = new Date(t.date);
    const today = new Date();
    return txnDate.toDateString() === today.toDateString();
  }).length;
  const totalCharges = state.transactions.reduce(
    (sum, t) => sum + (t.charges || 0),
    0,
  );

  let stats = [];

  if (state.role === "admin") {
    stats = [
      {
        label: "Total Balance",
        value: "₦" + totalBalance.toLocaleString(),
        icon: "fa-wallet",
        color: "blue",
        trend: "+12%",
      },
      {
        label: "Active Customers",
        value: state.customers.filter((c) => c.status === "active").length,
        icon: "fa-users",
        color: "green",
        trend: "+5",
      },
      {
        label: "Pending Approvals",
        value: pendingCount,
        icon: "fa-clock",
        color: "yellow",
        trend: "Requires attention",
      },
      {
        label: "Total Charges",
        value: "₦" + totalCharges.toLocaleString(),
        icon: "fa-percent",
        color: "purple",
        trend: "Revenue",
      },
    ];
  } else {
    stats = [
      {
        label: "Total Customers",
        value: state.customers.length,
        icon: "fa-users",
        color: "green",
        trend: "All customers",
      },
      {
        label: "Total Balance",
        value: "₦" + totalBalance.toLocaleString(),
        icon: "fa-wallet",
        color: "blue",
        trend: "System total",
      },
      {
        label: "My Transactions",
        value: state.transactions.filter((t) =>
          state.customers.some(
            (c) =>
              c.id === t.customerId &&
              c.addedBy?.staffId === state.currentUser?.id,
          ),
        ).length,
        icon: "fa-exchange-alt",
        color: "purple",
        trend: "This month",
      },
      {
        label: "Today's Activity",
        value: todayTransactions,
        icon: "fa-chart-line",
        color: "yellow",
        trend: "Active",
      },
    ];
  }

  const recentTransactions = state.transactions;

  let html = `
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-6 sm:mb-8 animate-fade-in">
      ${stats
        .map(
          (stat) => `
          <div class="glass-panel p-4 sm:p-6 rounded-xl sm:rounded-2xl hover:transform hover:scale-105 transition-all duration-300 cursor-pointer group">
            <div class="flex justify-between items-start mb-3 sm:mb-4">
              <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-${stat.color}-500/20 flex items-center justify-center group-hover:bg-${stat.color}-500/30 transition-colors">
                <i class="fas ${stat.icon} text-${stat.color}-400 text-lg sm:text-xl"></i>
              </div>
              <span class="text-xs text-gray-400 bg-gray-800 px-2 py-1 rounded-full">${stat.trend}</span>
            </div>
            <h3 class="text-xl sm:text-2xl font-bold mb-1 break-words">${typeof stat.value === "number" ? stat.value.toLocaleString() : stat.value}</h3>
            <p class="text-xs sm:text-sm text-gray-400">${stat.label}</p>
          </div>
        `,
        )
        .join("")}
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 sm:gap-8">
      <div class="lg:col-span-2 glass-panel rounded-xl sm:rounded-2xl p-4 sm:p-6 animate-fade-in">
        <div class="flex justify-between items-center mb-4 sm:mb-6">
          <h3 class="text-base sm:text-lg font-semibold">Recent Transactions</h3>
          <button onclick="navigate('transactions')" class="text-xs sm:text-sm text-blue-400 hover:text-blue-300">View all</button>
        </div>
        <div class="space-y-3 sm:space-y-4">
          ${recentTransactions
            .slice(0, 5)
            .map((txn, idx) => {
              const charges = txn.charges || 0;
              const netAmount =
                txn.type === "deposit"
                  ? txn.amount - charges
                  : txn.amount + charges;
              return `
                <div class="transaction-card flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-gray-800/50 rounded-xl border border-gray-700/50" style="animation-delay: ${idx * 0.1}s">
                  <div class="flex items-center gap-3 sm:gap-4 mb-2 sm:mb-0">
                    <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full ${txn.type === "deposit" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"} flex items-center justify-center flex-shrink-0">
                      <i class="fas fa-arrow-${txn.type === "deposit" ? "down" : "up"} text-sm sm:text-base"></i>
                    </div>
                    <div>
                      <p class="font-medium text-sm sm:text-base">${txn.customerName}</p>
                      <div class="flex items-center gap-1 text-xs text-gray-400">
                        <i class="fas fa-calendar-alt"></i>
                        <span>${formatDate(txn.date)}</span>
                      </div>
                    </div>
                  </div>
                  <div class="text-left sm:text-right pl-11 sm:pl-0">
                    <p class="font-bold text-sm sm:text-base ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">
                      ${txn.type === "deposit" ? "+" : "-"}₦${(txn.amount || 0).toLocaleString()}
                    </p>
                    ${charges > 0 ? `<p class="text-xs text-red-400">Charge: -₦${charges.toLocaleString()}</p>` : ""}
                    <p class="text-xs text-blue-400">Net: ₦${netAmount.toLocaleString()}</p>
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
                  <p class="font-medium text-sm sm:text-base">New Customer</p>
                  <p class="text-xs text-gray-400">Register account</p>
                </div>
              </button>
              <button onclick="navigate('transactions')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
                <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-green-500/20 text-green-400 flex items-center justify-center group-hover:bg-green-500 group-hover:text-white transition-colors">
                  <i class="fas fa-plus-circle text-sm sm:text-base"></i>
                </div>
                <div class="text-left">
                  <p class="font-medium text-sm sm:text-base">New Transaction</p>
                  <p class="text-xs text-gray-400">Deposit or Withdrawal</p>
                </div>
              </button>
              <button onclick="navigate('customers')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
                <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-colors">
                  <i class="fas fa-search text-sm sm:text-base"></i>
                </div>
                <div class="text-left">
                  <p class="font-medium text-sm sm:text-base">All Customers</p>
                  <p class="text-xs text-gray-400">View all customers</p>
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
              <button onclick="navigate('customers')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
                <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-colors">
                  <i class="fas fa-search text-sm sm:text-base"></i>
                </div>
                <div class="text-left">
                  <p class="font-medium text-sm sm:text-base">View Customers</p>
                  <p class="text-xs text-gray-400">Manage accounts</p>
                </div>
              </button>
              <button onclick="navigate('customer-reports')" class="w-full p-3 sm:p-4 bg-gray-800 hover:bg-gray-700 rounded-xl flex items-center gap-3 transition-colors group">
                <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-lg bg-purple-500/20 text-purple-400 flex items-center justify-center group-hover:bg-purple-500 group-hover:text-white transition-colors">
                  <i class="fas fa-chart-pie text-sm sm:text-base"></i>
                </div>
                <div class="text-left">
                  <p class="font-medium text-sm sm:text-base">Customer Reports</p>
                  <p class="text-xs text-gray-400">View statistics</p>
                </div>
              </button>
            `
          }
        </div>

        <div class="mt-4 sm:mt-6 pt-4 sm:pt-6 border-t border-gray-700">
          <h4 class="text-xs sm:text-sm font-medium text-gray-400 mb-3 sm:mb-4">System Status</h4>
          <div class="space-y-2 sm:space-y-3">
            <div class="flex justify-between text-xs sm:text-sm">
              <span class="text-gray-400">Database</span>
              <span class="text-green-400 flex items-center gap-1">
                <span class="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full animate-pulse"></span>
                Connected
              </span>
            </div>
            <div class="flex justify-between text-xs sm:text-sm">
              <span class="text-gray-400">Last Sync</span>
              <span class="text-gray-300">Just now</span>
            </div>
            <div class="flex justify-between text-xs sm:text-sm">
              <span class="text-gray-400">Security Level</span>
              <span class="text-blue-400">High</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

// ==================== CUSTOMERS VIEW (STAFF CAN SEE ALL) ====================

function renderCustomers(container) {
  // Staff can see ALL customers - no filtering
  let displayedCustomers = state.customers;

  const html = `
    <div class="glass-panel rounded-2xl p-4 sm:p-6 animate-fade-in">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h3 class="text-base sm:text-lg font-semibold">
          All Customers
        </h3>
        ${
          state.role === "admin"
            ? `
          <button onclick="showAddCustomerModal()" class="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors">
            <i class="fas fa-plus mr-2"></i>Add Customer
          </button>
        `
            : `
          <button onclick="navigate('new-customer')" class="w-full sm:w-auto px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm transition-colors">
            <i class="fas fa-user-plus mr-2"></i>Register Customer
          </button>
        `
        }
      </div>
      
      <div class="mb-4 flex flex-col sm:flex-row gap-4">
        <input type="text" 
               id="customerSearch" 
               placeholder="Search customers by name, email, or phone..." 
               onkeyup="filterCustomers()"
               class="flex-1 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:border-blue-500 text-base">
        
        ${
          state.role === "admin"
            ? `
          <select id="staffFilter" onchange="filterCustomersByStaff()" class="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:border-blue-500">
            <option value="">All Staff</option>
            ${state.staff.map((s) => `<option value="${s.id}">${s.name}</option>`).join("")}
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
                <th class="pb-4 px-4 sm:px-0">Customer</th>
                <th class="pb-4 px-4 sm:px-0">Contact</th>
                <th class="pb-4 px-4 sm:px-0 hidden sm:table-cell">Phone</th>
                <th class="pb-4 px-4 sm:px-0">Balance</th>
                <th class="pb-4 px-4 sm:px-0 hidden sm:table-cell">Status</th>
                <th class="pb-4 px-4 sm:px-0 hidden lg:table-cell">Added By</th>
                <th class="pb-4 px-4 sm:px-0">Actions</th>
                ..
            </thead>
            <tbody id="customerTableBody" class="divide-y divide-gray-800">
              ${displayedCustomers
                .map(
                  (customer) => `
                  <tr class="hover:bg-gray-800/30 transition-colors">
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
                        <span class="font-medium text-sm sm:text-base break-words">${customer.name}</span>
                      </div>
                      ..
                    <td class="py-4 px-4 sm:px-0">
                      <div class="text-xs sm:text-sm break-words max-w-[150px] sm:max-w-none">
                        ${customer.email}
                      </div>
                      ..
                    <td class="py-4 px-4 sm:px-0 hidden sm:table-cell">
                      <div class="text-xs sm:text-sm">
                        <i class="fas fa-phone-alt text-green-400 mr-1"></i>
                        ${customer.phone || "N/A"}
                      </div>
                      ..
                    <td class="py-4 px-4 sm:px-0">
                      <span class="text-sm sm:text-base font-mono">₦${customer.balance?.toFixed(2) || "0.00"}</span>
                      ..
                    <td class="py-4 px-4 sm:px-0 hidden sm:table-cell">
                      <span class="px-2 py-1 rounded text-xs ${customer.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}">
                        ${customer.status}
                      </span>
                      ..
                    ${
                      state.role === "admin"
                        ? `
                      <td class="py-4 px-4 sm:px-0 hidden lg:table-cell">
                        ${
                          customer.addedBy
                            ? `<div class="text-xs sm:text-sm">
                              <div>${customer.addedBy.staffName}</div>
                              <div class="text-xs text-gray-500">${customer.addedBy.staffEmail}</div>
                            </div>`
                            : '<span class="text-xs text-gray-500">System</span>'
                        }
                        ..
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
                        `
                            : ""
                        }
                        <button onclick="editCustomer('${customer.id}')" class="text-yellow-400 hover:text-yellow-300 p-1" title="Edit">
                          <i class="fas fa-edit text-sm sm:text-base"></i>
                        </button>
                      </div>
                      ..
                    ..
                `,
                )
                .join("")}
                ${displayedCustomers.length === 0 ? '<tr><td colspan="7" class="text-center text-gray-400 py-8">No customers found</td></tr>' : ""}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
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
      const staffCell = row.querySelector("td:nth-child(6)")?.textContent || "";
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
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Address</label>
            <textarea name="address" rows="2" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base"></textarea>
          </div>
          <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <button type="button" onclick="closeCustomerModal()" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit" class="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl">
              Add Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  const modalContainer = document.createElement("div");
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);
}

function closeCustomerModal() {
  const modal = document.getElementById("customerModal");
  if (modal) {
    modal.remove();
  }
}

async function handleAddCustomer(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const currentStaff = state.currentUser;

  const customerData = {
    name: formData.get("name"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    address: formData.get("address"),
    balance: 0,
    staffId: currentStaff?.id,
    staffName: currentStaff?.name,
    staffEmail: currentStaff?.email,
  };

  try {
    const response = await api.post("/customers", customerData);
    const newCustomer = response.data.customer || response.data;

    await loadAllData();
    showNotification(
      `✅ Customer added successfully! SMS alerts will be sent to ${newCustomer.phone}`,
      "success",
    );
    closeCustomerModal();
  } catch (error) {
    console.error("Error adding customer:", error);
    showNotification(
      error.response?.data?.error || "Failed to add customer",
      "error",
    );
  }
}

// New Customer Form (for staff)
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
              <label class="block text-sm font-medium text-gray-300 mb-2">Initial Deposit (₦)</label>
              <input type="number" name="initialDeposit" min="0" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base" placeholder="0.00">
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Address</label>
            <textarea name="address" rows="3" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base"></textarea>
          </div>

          <div class="flex items-center gap-3 p-3 sm:p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <i class="fas fa-info-circle text-blue-400 text-sm sm:text-base"></i>
            <p class="text-xs sm:text-sm text-blue-200">Customer ID will be generated automatically. SMS alerts will be sent for all deposits and withdrawals.</p>
          </div>

          <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <button type="button" onclick="navigate('customers')" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" class="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-colors">
              Register Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

async function handleNewCustomer(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const currentStaff = state.currentUser;

  const customerData = {
    name: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    balance: parseFloat(formData.get("initialDeposit")) || 0,
    address: formData.get("address"),
    staffId: currentStaff?.id,
    staffName: currentStaff?.name,
    staffEmail: currentStaff?.email,
  };

  try {
    const response = await api.post("/customers", customerData);
    const newCustomer = response.data.customer || response.data;

    state.customers.push(newCustomer);
    showNotification(
      `✅ Customer registered successfully! ID: ${newCustomer.id}\n📱 SMS alerts will be sent to ${newCustomer.phone}`,
      "success",
    );
    navigate("customers");
  } catch (error) {
    console.error("Customer registration error:", error);
    const errorMessage =
      error.response?.data?.error || "Failed to register customer";
    showNotification(errorMessage, "error");
  }
}

// ==================== NEW TRANSACTION VIEW WITH WORKING SEARCH ====================

function renderNewTransaction(container) {
  // Get all customers for staff and admin
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
          <!-- Search Input - This replaces the dropdown selection -->
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Search for Customer</label>
            <div class="relative">
              <input 
                type="text" 
                id="customerSearchInput" 
                placeholder="Type to search by name, email, or phone..." 
                autocomplete="off"
                class="w-full px-4 py-3 pl-10 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:border-blue-500 transition-colors text-base"
              />
              <i class="fas fa-search absolute left-3 top-3.5 text-gray-500"></i>
              <i class="fas fa-times absolute right-3 top-3.5 text-gray-500 cursor-pointer hover:text-gray-300" onclick="clearCustomerSearch()"></i>
            </div>
            <p class="text-xs text-gray-400 mt-1">Start typing to search for customers</p>
          </div>

          <!-- Search Results Dropdown -->
          <div id="searchResultsDropdown" class="hidden glass-panel rounded-xl border border-gray-700 max-h-64 overflow-y-auto">
            <div id="searchResultsList" class="divide-y divide-gray-700">
              <!-- Search results will appear here -->
            </div>
          </div>

          <!-- Selected Customer Display -->
          <div id="selectedCustomerDisplay" class="hidden p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
            <div class="flex justify-between items-center">
              <div>
                <p class="text-sm text-gray-300">Selected Customer:</p>
                <p class="text-base font-semibold text-blue-400" id="selectedCustomerName">-</p>
                <p class="text-xs text-gray-400" id="selectedCustomerPhone"></p>
              </div>
              <button type="button" onclick="clearSelectedCustomer()" class="text-red-400 hover:text-red-300">
                <i class="fas fa-times"></i>
              </button>
            </div>
          </div>

          <input type="hidden" name="customerId" id="selectedCustomerId" value="">

          <div id="customerBalanceDisplay" class="hidden p-4 bg-green-500/10 border border-green-500/20 rounded-xl">
            <div class="flex justify-between items-center">
              <span class="text-xs sm:text-sm text-gray-300">Current Balance:</span>
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
                <p class="text-xs text-gray-400 mt-1 hidden sm:block">Customer pays amount plus charges</p>
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
            <p class="text-xs text-gray-400 mt-1">This charge will be deducted from deposits or added to withdrawals</p>
          </div>

          <div id="netAmountDisplay" class="p-4 bg-gradient-to-r from-gray-800 to-gray-800/50 border border-blue-500/30 rounded-xl">
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
              <span class="text-gray-300 font-medium text-sm sm:text-base">Net Amount to be Processed:</span>
              <span class="text-2xl sm:text-3xl font-bold text-blue-400 font-mono" id="netAmount">₦0</span>
            </div>
            <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center mt-2 text-xs text-gray-400 gap-1">
              <span>For deposits: Amount - Charges</span>
              <span>For withdrawals: Amount + Charges</span>
            </div>
          </div>

          <div id="insufficientFundsWarning" class="hidden p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <i class="fas fa-exclamation-circle text-red-500"></i>
              <p class="text-xs sm:text-sm text-red-200">Insufficient funds! Total deduction including charges: <span id="totalDeduction">₦0</span></p>
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
            <button type="button" onclick="navigate('dashboard')" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800 transition-colors">
              Cancel
            </button>
            <button type="submit" id="submitTransactionBtn" class="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-medium transition-colors">
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

  container.innerHTML = html;

  // Store customers data for search
  const customersData = availableCustomers;

  const script = document.createElement("script");
  script.textContent = `
    let searchTimeout;
    let customersData = ${JSON.stringify(customersData)};
    
    function filterAndDisplayCustomers() {
      const searchInput = document.getElementById('customerSearchInput');
      const searchResultsDropdown = document.getElementById('searchResultsDropdown');
      const searchResultsList = document.getElementById('searchResultsList');
      
      if (!searchInput) return;
      
      const searchTerm = searchInput.value.toLowerCase().trim();
      
      if (searchTerm === '') {
        searchResultsDropdown.classList.add('hidden');
        return;
      }
      
      // Filter customers
      const filteredCustomers = customersData.filter(customer => {
        const name = (customer.name || '').toLowerCase();
        const email = (customer.email || '').toLowerCase();
        const phone = (customer.phone || '').toLowerCase();
        
        return name.includes(searchTerm) || 
               email.includes(searchTerm) || 
               phone.includes(searchTerm);
      });
      
      if (filteredCustomers.length === 0) {
        searchResultsList.innerHTML = \`
          <div class="p-4 text-center text-gray-400">
            <i class="fas fa-search text-2xl mb-2 block"></i>
            No customers found matching "\${searchTerm}"
          </div>
        \`;
        searchResultsDropdown.classList.remove('hidden');
        return;
      }
      
      // Display results
      searchResultsList.innerHTML = filteredCustomers.map(customer => \`
        <div class="p-3 hover:bg-gray-700 cursor-pointer transition-colors" onclick="selectCustomer('\${customer.id}', '\${customer.name.replace(/'/g, "\\'")}', \${customer.balance || 0}, '\${customer.phone || ''}')">
          <div class="flex justify-between items-start">
            <div>
              <p class="font-medium text-sm sm:text-base">\${customer.name}</p>
              <p class="text-xs text-gray-400">\${customer.email}</p>
              <p class="text-xs text-gray-500 mt-1">\${customer.phone || 'No phone'} | Balance: ₦\${(customer.balance || 0).toLocaleString()}</p>
            </div>
            <i class="fas fa-chevron-right text-gray-500 text-sm"></i>
          </div>
        </div>
      \`).join('');
      
      searchResultsDropdown.classList.remove('hidden');
    }
    
    function selectCustomer(id, name, balance, phone) {
      // Set selected customer
      document.getElementById('selectedCustomerId').value = id;
      document.getElementById('selectedCustomerName').textContent = name;
      document.getElementById('selectedCustomerPhone').textContent = phone ? '📱 ' + phone : '⚠️ No phone number';
      document.getElementById('selectedCustomerDisplay').classList.remove('hidden');
      
      // Update balance display
      const balanceAmount = document.getElementById('currentBalanceAmount');
      if (balanceAmount) balanceAmount.textContent = '₦' + balance.toLocaleString();
      document.getElementById('customerBalanceDisplay').classList.remove('hidden');
      
      // Store balance for validation
      window.selectedCustomerBalance = balance;
      window.selectedCustomerId = id;
      window.selectedCustomerName = name;
      
      // Hide search results and clear search input
      document.getElementById('searchResultsDropdown').classList.add('hidden');
      document.getElementById('customerSearchInput').value = '';
      
      // Update net amount
      updateNetAmount();
    }
    
    function clearSelectedCustomer() {
      document.getElementById('selectedCustomerId').value = '';
      document.getElementById('selectedCustomerDisplay').classList.add('hidden');
      document.getElementById('customerBalanceDisplay').classList.add('hidden');
      document.getElementById('insufficientFundsWarning').classList.add('hidden');
      window.selectedCustomerBalance = null;
      window.selectedCustomerId = null;
      window.selectedCustomerName = null;
      updateNetAmount();
    }
    
    function updateNetAmount() {
      const amountInput = document.getElementById('transactionAmount');
      const chargeInput = document.getElementById('chargeAmount');
      const netSpan = document.getElementById('netAmount');
      const warningDiv = document.getElementById('insufficientFundsWarning');
      const totalDeductionSpan = document.getElementById('totalDeduction');
      const availableBalanceSpan = document.getElementById('availableBalance');
      const submitBtn = document.getElementById('submitTransactionBtn');
      const transactionType = document.querySelector('input[name="type"]:checked')?.value;
      
      const amount = parseFloat(amountInput ? amountInput.value : 0) || 0;
      const charges = parseFloat(chargeInput ? chargeInput.value : 0) || 0;
      
      let netAmount = amount;
      if (transactionType === 'deposit') {
        netAmount = amount - charges;
      } else if (transactionType === 'withdrawal') {
        netAmount = amount + charges;
      }
      
      if (netSpan) netSpan.textContent = '₦' + netAmount.toLocaleString();
      
      const balance = window.selectedCustomerBalance || 0;
      
      if (!window.selectedCustomerId || transactionType !== 'withdrawal') {
        if (warningDiv) warningDiv.classList.add('hidden');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
        return;
      }
      
      if (availableBalanceSpan) availableBalanceSpan.textContent = '₦' + balance.toLocaleString();
      
      if (transactionType === 'withdrawal') {
        const totalDeduction = amount + charges;
        if (totalDeductionSpan) totalDeductionSpan.textContent = '₦' + totalDeduction.toLocaleString();
        
        if (totalDeduction > balance) {
          if (warningDiv) warningDiv.classList.remove('hidden');
          if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
          }
        } else {
          if (warningDiv) warningDiv.classList.add('hidden');
          if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
          }
        }
      } else {
        if (warningDiv) warningDiv.classList.add('hidden');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.classList.remove('opacity-50', 'cursor-not-allowed');
        }
      }
    }
    
    // Add debounced search
    const searchInput = document.getElementById('customerSearchInput');
    if (searchInput) {
      const newSearchInput = searchInput.cloneNode(true);
      searchInput.parentNode.replaceChild(newSearchInput, searchInput);
      
      newSearchInput.addEventListener('input', function() {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(filterAndDisplayCustomers, 300);
      });
      
      newSearchInput.addEventListener('focus', function() {
        if (this.value.trim() !== '') {
          filterAndDisplayCustomers();
        }
      });
    }
    
    // Close dropdown when clicking outside
    document.addEventListener('click', function(e) {
      const searchContainer = document.getElementById('customerSearchInput');
      const dropdown = document.getElementById('searchResultsDropdown');
      if (searchContainer && dropdown && !searchContainer.contains(e.target) && !dropdown.contains(e.target)) {
        dropdown.classList.add('hidden');
      }
    });
  `;

  container.appendChild(script);
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

  const html = `
    <div class="space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-0">
      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <div class="flex items-center gap-4">
            <button onclick="navigate('customers')" class="text-gray-400 hover:text-white transition-colors">
              <i class="fas fa-arrow-left mr-2"></i>Back to Customers
            </button>
          </div>
          <div class="flex gap-2 w-full sm:w-auto">
            <button onclick="exportCustomerData('${customer.id}')" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-xs sm:text-sm transition-colors">
              <i class="fas fa-download mr-1 sm:mr-2"></i>Export
            </button>
            <button onclick="renderCustomerSummary(document.getElementById('contentArea'), '${customer.id}')" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs sm:text-sm transition-colors">
              <i class="fas fa-chart-bar mr-1 sm:mr-2"></i>Summary
            </button>
          </div>
        </div>
        
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xl sm:text-3xl font-bold flex-shrink-0">
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
          <div class="flex-1">
            <h2 class="text-xl sm:text-2xl font-bold break-words">${customer.name}</h2>
            <p class="text-xs sm:text-sm text-gray-400 break-words">${customer.email} • ${customer.phone || "No phone"}</p>
            <div class="flex flex-wrap items-center gap-2 sm:gap-4 mt-2">
              <span class="text-xs sm:text-sm bg-blue-500/20 text-blue-400 px-2 sm:px-3 py-1 rounded-full">
                <i class="fas fa-id-card mr-1"></i>${customer.id.substring(0, 8)}...
              </span>
              <span class="text-xs sm:text-sm ${customer.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"} px-2 sm:px-3 py-1 rounded-full">
                <i class="fas fa-circle mr-1"></i>${customer.status}
              </span>
              <span class="text-xs sm:text-sm bg-purple-500/20 text-purple-400 px-2 sm:px-3 py-1 rounded-full">
                <i class="fas fa-calendar mr-1"></i>Joined: ${formatSimpleDate(customer.joined)}
              </span>
            </div>
          </div>
          <div class="text-left sm:text-right mt-4 sm:mt-0">
            <p class="text-xs sm:text-sm text-gray-400">Current Balance</p>
            <p class="text-2xl sm:text-3xl font-bold text-green-400">₦${(customer.balance || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
          <h3 class="text-base sm:text-lg font-semibold">Transaction History</h3>
          <div class="flex gap-2 flex-wrap w-full sm:w-auto">
            <button onclick="renderCustomerTransactions(document.getElementById('contentArea'), '${customer.id}', 'today')" class="flex-1 sm:flex-none px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm transition-colors">
              Today
            </button>
            <button onclick="renderCustomerTransactions(document.getElementById('contentArea'), '${customer.id}', 'week')" class="flex-1 sm:flex-none px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm transition-colors">
              Week
            </button>
            <button onclick="renderCustomerTransactions(document.getElementById('contentArea'), '${customer.id}', 'month')" class="flex-1 sm:flex-none px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm transition-colors">
              Month
            </button>
            <button onclick="renderCustomerTransactions(document.getElementById('contentArea'), '${customer.id}', 'year')" class="flex-1 sm:flex-none px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-xs sm:text-sm transition-colors">
              Year
            </button>
            <button onclick="renderCustomerTransactions(document.getElementById('contentArea'), '${customer.id}', 'all')" class="flex-1 sm:flex-none px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs sm:text-sm transition-colors">
              All
            </button>
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
                  <th class="pb-3 px-4 sm:px-0">Net</th>
                  <th class="pb-3 px-4 sm:px-0">Status</th>
                  <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Description</th>
                  <th class="pb-3 px-4 sm:px-0 hidden lg:table-cell">Processed By</th>
                  ..
              </thead>
              <tbody class="divide-y divide-gray-800">
                ${sortedTransactions
                  .slice(0, 50)
                  .map((txn) => {
                    const charges = txn.charges || 0;
                    const netAmount =
                      txn.type === "deposit"
                        ? txn.amount - charges
                        : txn.amount + charges;

                    return `
                      <tr class="hover:bg-gray-800/30 transition-colors">
                        <td class="py-3 px-4 sm:px-0">
                          <div class="flex items-center gap-1 text-xs sm:text-sm">
                            <i class="fas fa-calendar-alt text-gray-500 text-xs"></i>
                            ${formatDate(txn.date)}
                          </div>
                         ..
                        <td class="py-3 px-4 sm:px-0">
                          <span class="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                            <i class="fas fa-arrow-${txn.type === "deposit" ? "down text-green-400" : "up text-orange-400"}"></i>
                            ${txn.type}
                          </span>
                         ..
                        <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">
                          ${txn.type === "deposit" ? "+" : "-"}₦${(txn.amount || 0).toLocaleString()}
                         ..
                        <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-red-400 hidden sm:table-cell">
                          -₦${charges.toLocaleString()}
                         ..
                        <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-blue-400">
                          ₦${netAmount.toLocaleString()}
                         ..
                        <td class="py-3 px-4 sm:px-0">
                          <span class="px-2 py-1 rounded text-xs ${getStatusStyle(txn.status)}">
                            ${txn.status}
                          </span>
                         ..
                        <td class="py-3 px-4 sm:px-0 hidden md:table-cell">
                          <p class="text-xs sm:text-sm text-gray-300 truncate max-w-[150px]" title="${txn.description || ""}">${txn.description || "-"}</p>
                         ..
                        <td class="py-3 px-4 sm:px-0 hidden lg:table-cell text-xs sm:text-sm text-gray-400">${txn.approvedBy || "-"}  ..
                       ..
                    `;
                  })
                  .join("")}
                ${
                  sortedTransactions.length === 0
                    ? `
                      <tr>
                        <td colspan="8" class="py-8 text-center text-gray-400">
                          No transactions found for this customer
                        </td>
                      </tr>
                    `
                    : ""
                }
                ${
                  sortedTransactions.length > 50
                    ? `
                      <tr>
                        <td colspan="8" class="py-4 text-center text-gray-500 text-xs sm:text-sm">
                          Showing first 50 transactions. Use period filters to see more.
                        </td>
                      </tr>
                    `
                    : ""
                }
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

  const isToday = (date) => {
    const d = new Date(date);
    return d.toDateString() === now.toDateString();
  };

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

  const isThisYear = (date) => {
    const d = new Date(date);
    return d.getFullYear() === now.getFullYear();
  };

  let filteredTransactions = transactions;
  if (period === "today") {
    filteredTransactions = transactions.filter((t) => isToday(t.date));
  } else if (period === "week") {
    filteredTransactions = transactions.filter((t) => isThisWeek(t.date));
  } else if (period === "month") {
    filteredTransactions = transactions.filter((t) => isThisMonth(t.date));
  } else if (period === "year") {
    filteredTransactions = transactions.filter((t) => isThisYear(t.date));
  }

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
    (sum, t) => sum + (t.amount + (t.charges || 0)),
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
      totalCharges: totalCharges,
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
      period: period,
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
          <div class="flex items-center gap-4">
            <button onclick="viewCustomer('${customer.id}')" class="text-gray-400 hover:text-white transition-colors">
              <i class="fas fa-arrow-left mr-2"></i>Back
            </button>
          </div>
          <div class="flex gap-2 w-full sm:w-auto">
            <button onclick="exportCustomerData('${customer.id}')" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-xs sm:text-sm transition-colors">
              <i class="fas fa-download mr-1 sm:mr-2"></i>Export
            </button>
            <button onclick="renderCustomerSummary(document.getElementById('contentArea'), '${customer.id}')" class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-purple-600 hover:bg-purple-500 rounded-lg text-xs sm:text-sm transition-colors">
              <i class="fas fa-chart-bar mr-1 sm:mr-2"></i>Summary
            </button>
          </div>
        </div>
        
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
          <div class="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xl sm:text-3xl font-bold flex-shrink-0">
            ${customer.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)
              .toUpperCase()}
          </div>
          <div class="flex-1">
            <h2 class="text-xl sm:text-2xl font-bold break-words">${customer.name}</h2>
            <p class="text-xs sm:text-sm text-gray-400 break-words">${customer.email} • ${customer.phone || "No phone"}</p>
            <div class="flex flex-wrap items-center gap-2 sm:gap-4 mt-2">
              <span class="text-xs sm:text-sm bg-blue-500/20 text-blue-400 px-2 sm:px-3 py-1 rounded-full">
                <i class="fas fa-id-card mr-1"></i>${customer.id.substring(0, 8)}...
              </span>
              <span class="text-xs sm:text-sm ${customer.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"} px-2 sm:px-3 py-1 rounded-full">
                <i class="fas fa-circle mr-1"></i>${customer.status}
              </span>
              <span class="text-xs sm:text-sm bg-purple-500/20 text-purple-400 px-2 sm:px-3 py-1 rounded-full">
                <i class="fas fa-calendar mr-1"></i>Joined: ${formatSimpleDate(customer.joined)}
              </span>
            </div>
          </div>
          <div class="text-left sm:text-right mt-4 sm:mt-0">
            <p class="text-xs sm:text-sm text-gray-400">Current Balance</p>
            <p class="text-2xl sm:text-3xl font-bold text-green-400">₦${(customer.balance || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4 sm:mb-6">
        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs sm:text-sm text-gray-400">Total Txns</span>
            <i class="fas fa-exchange-alt text-blue-400 text-sm sm:text-base"></i>
          </div>
          <p class="text-xl sm:text-2xl font-bold">${data.totalTransactions}</p>
          <div class="flex gap-2 mt-1 sm:mt-2 text-xs">
            <span class="text-green-400">✓ ${data.approved}</span>
            <span class="text-yellow-400">⏳ ${data.pending}</span>
            <span class="text-red-400">✗ ${data.rejected}</span>
          </div>
        </div>

        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs sm:text-sm text-gray-400">Net Deposits</span>
            <i class="fas fa-arrow-down text-green-400 text-sm sm:text-base"></i>
          </div>
          <p class="text-base sm:text-xl font-bold text-green-400">₦${data.deposits.net.toLocaleString()}</p>
          <p class="text-xs text-gray-400 mt-1 hidden sm:block">Gross: ₦${data.deposits.total.toLocaleString()}</p>
        </div>

        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs sm:text-sm text-gray-400">Net Withdrawals</span>
            <i class="fas fa-arrow-up text-orange-400 text-sm sm:text-base"></i>
          </div>
          <p class="text-base sm:text-xl font-bold text-orange-400">₦${data.withdrawals.net.toLocaleString()}</p>
          <p class="text-xs text-gray-400 mt-1 hidden sm:block">Gross: ₦${data.withdrawals.total.toLocaleString()}</p>
        </div>

        <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
          <div class="flex items-center justify-between mb-2">
            <span class="text-xs sm:text-sm text-gray-400">Total Charges</span>
            <i class="fas fa-percent text-red-400 text-sm sm:text-base"></i>
          </div>
          <p class="text-base sm:text-xl font-bold text-red-400">₦${data.totalCharges.toLocaleString()}</p>
          <p class="text-xs text-gray-400 mt-1">${period === "all" ? "All time" : `This ${period}`}</p>
        </div>
      </div>

      <h3 class="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Transaction History - ${period === "all" ? "All Time" : `This ${period}`}</h3>
      <div class="overflow-x-auto -mx-4 sm:mx-0">
        <div class="inline-block min-w-full align-middle">
          <table class="min-w-full divide-y divide-gray-700">
            <thead>
              <tr class="text-left text-gray-400 text-xs sm:text-sm">
                <th class="pb-3 px-4 sm:px-0">Date</th>
                <th class="pb-3 px-4 sm:px-0">Type</th>
                <th class="pb-3 px-4 sm:px-0">Gross</th>
                <th class="pb-3 px-4 sm:px-0 hidden sm:table-cell">Charges</th>
                <th class="pb-3 px-4 sm:px-0">Net</th>
                <th class="pb-3 px-4 sm:px-0">Status</th>
                <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Description</th>
                <th class="pb-3 px-4 sm:px-0 hidden lg:table-cell">Processed By</th>
                ..
            </thead>
            <tbody class="divide-y divide-gray-800">
              ${sortedTransactions
                .map((txn) => {
                  const charges = txn.charges || 0;
                  const netAmount =
                    txn.type === "deposit"
                      ? txn.amount - charges
                      : txn.amount + charges;

                  return `
                    <tr class="hover:bg-gray-800/30 transition-colors">
                      <td class="py-3 px-4 sm:px-0">
                        <div class="flex items-center gap-1 text-xs sm:text-sm">
                          <i class="fas fa-calendar-alt text-gray-500 text-xs"></i>
                          ${formatDate(txn.date)}
                        </div>
                        ..
                      <td class="py-3 px-4 sm:px-0">
                        <span class="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                          <i class="fas fa-arrow-${txn.type === "deposit" ? "down text-green-400" : "up text-orange-400"}"></i>
                          ${txn.type}
                        </span>
                        ..
                      <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">
                        ${txn.type === "deposit" ? "+" : "-"}₦${(txn.amount || 0).toLocaleString()}
                        ..
                      <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-red-400 hidden sm:table-cell">
                        -₦${charges.toLocaleString()}
                        ..
                      <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-blue-400">
                        ₦${netAmount.toLocaleString()}
                        ..
                      <td class="py-3 px-4 sm:px-0">
                        <span class="px-2 py-1 rounded text-xs ${getStatusStyle(txn.status)}">
                          ${txn.status}
                        </span>
                        ..
                      <td class="py-3 px-4 sm:px-0 hidden md:table-cell">
                        <p class="text-xs sm:text-sm text-gray-300 truncate max-w-[150px]" title="${txn.description || ""}">${txn.description || "-"}</p>
                        ..
                      <td class="py-3 px-4 sm:px-0 hidden lg:table-cell text-xs sm:text-sm text-gray-400">${txn.approvedBy || "-"}  ..
                     ..
                  `;
                })
                .join("")}
              ${sortedTransactions.length === 0 ? 'bon<td colspan="8" class="text-center text-gray-400 py-8">No transactions found for this period</td>' : ""}
            </tbody>
           ..
        </div>
      </div>
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
      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <div class="flex items-center gap-4 mb-4">
          <button onclick="viewCustomer('${customer.id}')" class="text-gray-400 hover:text-white transition-colors">
            <i class="fas fa-arrow-left mr-2"></i>Back
          </button>
        </div>
        <div class="flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div class="w-16 h-16 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-2xl font-bold flex-shrink-0">
            ${customer.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .substring(0, 2)
              .toUpperCase()}
          </div>
          <div>
            <h2 class="text-xl sm:text-2xl font-bold break-words">${customer.name} - Summary Report</h2>
            <p class="text-xs sm:text-sm text-gray-400 break-words">${customer.email} • ${customer.phone || "No phone"}</p>
          </div>
          <div class="ml-auto text-left sm:text-right mt-4 sm:mt-0">
            <p class="text-xs sm:text-sm text-gray-400">Current Balance</p>
            <p class="text-2xl font-bold text-green-400">₦${(customer.balance || 0).toLocaleString()}</p>
          </div>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        ${["daily", "weekly", "monthly", "yearly"]
          .map((period) => {
            const data = stats[period];
            if (!data) return "";

            return `
            <div class="glass-panel rounded-2xl p-3 sm:p-4">
              <h3 class="text-sm font-semibold mb-2 sm:mb-3 capitalize">${period}</h3>
              <div class="space-y-1 sm:space-y-2">
                <div class="flex justify-between text-xs sm:text-sm">
                  <span class="text-gray-400">Net Deposits</span>
                  <span class="text-green-400">₦${data.stats.deposits.net.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-xs sm:text-sm">
                  <span class="text-gray-400">Net Withdrawals</span>
                  <span class="text-orange-400">₦${data.stats.withdrawals.net.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-xs sm:text-sm">
                  <span class="text-gray-400">Charges</span>
                  <span class="text-red-400">₦${data.stats.totalCharges.toLocaleString()}</span>
                </div>
                <div class="flex justify-between pt-1 sm:pt-2 border-t border-gray-700 text-xs sm:text-sm">
                  <span class="text-gray-400">Net Change</span>
                  <span class="${data.stats.netBalance >= 0 ? "text-green-400" : "text-red-400"}">
                    ₦${data.stats.netBalance.toLocaleString()}
                  </span>
                </div>
                <div class="text-xs text-gray-500 mt-1">
                  ${data.stats.totalTransactions} transactions
                </div>
              </div>
            </div>
          `;
          })
          .join("")}
      </div>

      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <h3 class="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Detailed Statistics</h3>
        <div class="overflow-x-auto -mx-4 sm:mx-0">
          <div class="inline-block min-w-full align-middle">
            <table class="min-w-full divide-y divide-gray-700">
              <thead>
                <tr class="text-left text-gray-400 text-xs sm:text-sm">
                  <th class="pb-3 px-4 sm:px-0">Period</th>
                  <th class="pb-3 px-4 sm:px-0">Net Deposits</th>
                  <th class="pb-3 px-4 sm:px-0">Net Withdrawals</th>
                  <th class="pb-3 px-4 sm:px-0">Charges</th>
                  <th class="pb-3 px-4 sm:px-0">Net Change</th>
                  <th class="pb-3 px-4 sm:px-0">Transactions</th>
                  ..
              </thead>
              <tbody class="divide-y divide-gray-800">
                ${["daily", "weekly", "monthly", "yearly", "all"]
                  .map((period) => {
                    const data = stats[period];
                    if (!data) return "";

                    return `
                    <tr class="hover:bg-gray-800/30">
                      <td class="py-3 px-4 sm:px-0 capitalize text-xs sm:text-sm">${period} ..
                      <td class="py-3 px-4 sm:px-0 text-green-400 text-xs sm:text-sm">₦${data.stats.deposits.net.toLocaleString()} ..
                      <td class="py-3 px-4 sm:px-0 text-orange-400 text-xs sm:text-sm">₦${data.stats.withdrawals.net.toLocaleString()} ..
                      <td class="py-3 px-4 sm:px-0 text-red-400 text-xs sm:text-sm">₦${data.stats.totalCharges.toLocaleString()} ..
                      <td class="py-3 px-4 sm:px-0 ${data.stats.netBalance >= 0 ? "text-green-400" : "text-red-400"} text-xs sm:text-sm">
                        ₦${data.stats.netBalance.toLocaleString()}
                       ..
                      <td class="py-3 px-4 sm:px-0 text-xs sm:text-sm">${data.stats.totalTransactions} ..
                     ..
                  `;
                  })
                  .join("")}
              </tbody>
             ..
          </div>
        </div>
      </div>
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
    const netAmount =
      txn.type === "deposit" ? txn.amount - charges : txn.amount + charges;

    csv += `"${formatDate(txn.date)}",${txn.type},${txn.amount},${charges},${netAmount},${txn.status},"${txn.description || ""}","${txn.approvedBy || ""}"\n`;
  });

  csv += "\nSUMMARY\n";
  csv += `Customer,${customer.name}\n`;
  csv += `Email,${customer.email}\n`;
  csv += `Phone,${customer.phone || "N/A"}\n`;
  csv += `Current Balance,${customer.balance}\n`;
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
  const customersWithStats = state.customers.map((c) => {
    const stats = getCustomerStats(c.id, "all");
    return {
      ...c,
      stats: stats?.stats,
    };
  });

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
        <div class="glass-panel p-4 sm:p-6 rounded-2xl">
          <h3 class="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">Total Customers</h3>
          <p class="text-2xl sm:text-3xl font-bold">${state.customers.length}</p>
          <p class="text-xs sm:text-sm text-green-400 mt-1 sm:mt-2">${activeCustomers} active</p>
        </div>
        <div class="glass-panel p-4 sm:p-6 rounded-2xl">
          <h3 class="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">Net Deposits</h3>
          <p class="text-xl sm:text-3xl font-bold text-green-400">₦${totalNetDeposits.toLocaleString()}</p>
          <p class="text-xs text-gray-400 mt-1 hidden sm:block">After charges</p>
        </div>
        <div class="glass-panel p-4 sm:p-6 rounded-2xl">
          <h3 class="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">Net Withdrawals</h3>
          <p class="text-xl sm:text-3xl font-bold text-orange-400">₦${totalNetWithdrawals.toLocaleString()}</p>
          <p class="text-xs text-gray-400 mt-1 hidden sm:block">After charges</p>
        </div>
        <div class="glass-panel p-4 sm:p-6 rounded-2xl">
          <h3 class="text-xs sm:text-sm text-gray-400 mb-1 sm:mb-2">Total Charges</h3>
          <p class="text-xl sm:text-3xl font-bold text-red-400">₦${totalCharges.toLocaleString()}</p>
          <p class="text-xs text-gray-400 mt-1 hidden sm:block">Revenue</p>
        </div>
      </div>

      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <h3 class="text-base sm:text-lg font-semibold mb-3 sm:mb-4">Customer Statistics</h3>
        <div class="overflow-x-auto -mx-4 sm:mx-0">
          <div class="inline-block min-w-full align-middle">
            <table class="min-w-full divide-y divide-gray-700">
              <thead>
                <tr class="text-left text-gray-400 text-xs sm:text-sm">
                  <th class="pb-3 px-4 sm:px-0">Customer</th>
                  <th class="pb-3 px-4 sm:px-0 hidden sm:table-cell">Phone</th>
                  <th class="pb-3 px-4 sm:px-0">Balance</th>
                  <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Net Deposits</th>
                  <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Net Withdrawals</th>
                  <th class="pb-3 px-4 sm:px-0">Charges</th>
                  <th class="pb-3 px-4 sm:px-0 hidden lg:table-cell">Net Change</th>
                  <th class="pb-3 px-4 sm:px-0">Actions</th>
                  ..
              </thead>
              <tbody class="divide-y divide-gray-800">
                ${customersWithStats
                  .map(
                    (c) => `
                  <tr class="hover:bg-gray-800/30">
                    <td class="py-3 px-4 sm:px-0">
                      <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-xs font-bold flex-shrink-0">
                          ${c.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")
                            .substring(0, 2)
                            .toUpperCase()}
                        </div>
                        <div>
                          <p class="font-medium text-xs sm:text-sm">${c.name}</p>
                          <p class="text-xs text-gray-400 hidden sm:block">${c.email}</p>
                        </div>
                      </div>
                      ..
                    <td class="py-3 px-4 sm:px-0 hidden sm:table-cell">
                      <span class="text-xs ${c.phone ? "text-green-400" : "text-gray-500"}">
                        ${c.phone || "No SMS"}
                      </span>
                      ..
                    <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm">₦${(c.balance || 0).toLocaleString()} ..
                    <td class="py-3 px-4 sm:px-0 text-green-400 text-xs sm:text-sm hidden md:table-cell">₦${(c.stats?.deposits.net || 0).toLocaleString()} ..
                    <td class="py-3 px-4 sm:px-0 text-orange-400 text-xs sm:text-sm hidden md:table-cell">₦${(c.stats?.withdrawals.net || 0).toLocaleString()} ..
                    <td class="py-3 px-4 sm:px-0 text-red-400 text-xs sm:text-sm">₦${(c.stats?.totalCharges || 0).toLocaleString()} ..
                    <td class="py-3 px-4 sm:px-0 ${(c.stats?.netBalance || 0) >= 0 ? "text-green-400" : "text-red-400"} text-xs sm:text-sm hidden lg:table-cell">
                      ₦${(c.stats?.netBalance || 0).toLocaleString()}
                      ..
                    <td class="py-3 px-4 sm:px-0">
                      <div class="flex gap-2">
                        <button onclick="viewCustomer('${c.id}')" class="text-blue-400 hover:text-blue-300 p-1" title="View Details">
                          <i class="fas fa-eye text-xs sm:text-sm"></i>
                        </button>
                        <button onclick="renderCustomerSummary(document.getElementById('contentArea'), '${c.id}')" class="text-green-400 hover:text-green-300 p-1" title="View Summary">
                          <i class="fas fa-chart-bar text-xs sm:text-sm"></i>
                        </button>
                      </div>
                      ..
                    ..
                `,
                  )
                  .join("")}
              </tbody>
             ..
          </div>
        </div>
      </div>
    </div>
  `;

  container.innerHTML = html;
  document.getElementById("pageTitle").textContent = "Customer Reports";
}

// ==================== DORMANT CUSTOMERS SECTION ====================

function renderDormantCustomers(container) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const customersWithLastActivity = state.customers.map((customer) => {
    const customerTransactions = state.transactions.filter(
      (t) => t.customerId === customer.id,
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
      const today = new Date();
      const diffTime = Math.abs(today - lastTransactionDate);
      daysSinceLastTransaction = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    }

    const isDormant = !lastTransactionDate || daysSinceLastTransaction > 30;

    return {
      ...customer,
      lastTransactionDate,
      lastTransactionType,
      lastTransactionAmount,
      daysSinceLastTransaction,
      totalTransactions: customerTransactions.length,
      isDormant,
    };
  });

  const dormantCustomers = customersWithLastActivity.filter((c) => c.isDormant);
  dormantCustomers.sort((a, b) => {
    if (!a.daysSinceLastTransaction) return -1;
    if (!b.daysSinceLastTransaction) return 1;
    return b.daysSinceLastTransaction - a.daysSinceLastTransaction;
  });

  const totalCustomers = state.customers.length;
  const dormantCount = dormantCustomers.length;
  const activeCount = totalCustomers - dormantCount;
  const dormantPercentage =
    totalCustomers > 0 ? ((dormantCount / totalCustomers) * 100).toFixed(1) : 0;

  const html = `
    <div class="space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-0">
      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 sm:mb-6">
          <div>
            <h3 class="text-base sm:text-lg font-semibold">Dormant Customers</h3>
            <p class="text-xs sm:text-sm text-gray-400">Customers with no transactions in the last 30 days</p>
          </div>
          <div class="flex gap-2 w-full sm:w-auto">
            <button onclick="sendBulkSMSToDormantCustomers()" 
              class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-green-600 hover:bg-green-500 rounded-lg text-xs sm:text-sm transition-colors flex items-center justify-center gap-2"
              ${dormantCount === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed"' : ""}>
              <i class="fas fa-envelope text-xs sm:text-sm"></i>
              SMS (${dormantCount})
            </button>
            <button onclick="exportDormantCustomers()" 
              class="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs sm:text-sm transition-colors flex items-center justify-center gap-2"
              ${dormantCount === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed"' : ""}>
              <i class="fas fa-download text-xs sm:text-sm"></i>
              Export
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
            <p class="text-xs text-gray-400">Active in last 30 days</p>
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
            ? `
          <div class="overflow-x-auto -mx-4 sm:mx-0">
            <div class="inline-block min-w-full align-middle">
              <table class="min-w-full divide-y divide-gray-700">
                <thead>
                  <tr class="text-left text-gray-400 text-xs sm:text-sm">
                    <th class="pb-3 px-4 sm:px-0">Customer</th>
                    <th class="pb-3 px-4 sm:px-0 hidden sm:table-cell">Contact</th>
                    <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Phone</th>
                    <th class="pb-3 px-4 sm:px-0">Balance</th>
                    <th class="pb-3 px-4 sm:px-0 hidden lg:table-cell">Last Transaction</th>
                    <th class="pb-3 px-4 sm:px-0">Days</th>
                    <th class="pb-3 px-4 sm:px-0 hidden md:table-cell">Total Txns</th>
                    <th class="pb-3 px-4 sm:px-0">Actions</th>
                    ..
                </thead>
                <tbody class="divide-y divide-gray-800">
                  ${dormantCustomers
                    .map(
                      (customer) => `
                    <tr class="hover:bg-gray-800/30 transition-colors">
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
                          </div>
                        </div>
                        ..
                      <td class="py-3 px-4 sm:px-0 hidden sm:table-cell">
                        <div class="text-xs">
                          <div class="flex items-center gap-1">
                            <i class="fas fa-envelope text-gray-500 text-xs"></i>
                            <span class="break-words">${customer.email}</span>
                          </div>
                        </div>
                        ..
                      <td class="py-3 px-4 sm:px-0 hidden md:table-cell">
                        <div class="text-xs">
                          <div class="flex items-center gap-1">
                            <i class="fas fa-phone-alt text-gray-500 text-xs"></i>
                            <span>${customer.phone || "N/A"}</span>
                          </div>
                        </div>
                        ..
                      <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm">₦${(customer.balance || 0).toLocaleString()} ..
                      <td class="py-3 px-4 sm:px-0 hidden lg:table-cell">
                        ${
                          customer.lastTransactionDate
                            ? `
                          <div class="text-xs">
                            <div>${formatDate(customer.lastTransactionDate)}</div>
                            <div class="text-gray-400 capitalize">${customer.lastTransactionType} of ₦${(customer.lastTransactionAmount || 0).toLocaleString()}</div>
                          </div>
                        `
                            : '<span class="text-xs text-gray-500">Never</span>'
                        }
                        ..
                      <td class="py-3 px-4 sm:px-0">
                        <span class="px-2 py-1 rounded text-xs ${customer.daysSinceLastTransaction > 90 ? "bg-red-500/20 text-red-400" : customer.daysSinceLastTransaction > 60 ? "bg-orange-500/20 text-orange-400" : "bg-yellow-500/20 text-yellow-400"}">
                          ${customer.daysSinceLastTransaction ? `${customer.daysSinceLastTransaction}d` : "Never"}
                        </span>
                        ..
                      <td class="py-3 px-4 sm:px-0 hidden md:table-cell text-xs">${customer.totalTransactions} ..
                      <td class="py-3 px-4 sm:px-0">
                        <div class="flex gap-2">
                          <button onclick="viewCustomer('${customer.id}')" class="text-blue-400 hover:text-blue-300 p-1" title="View Details">
                            <i class="fas fa-eye text-xs sm:text-sm"></i>
                          </button>
                          ${
                            customer.phone
                              ? `
                            <button onclick="sendSMSReminder('${customer.id}')" class="text-green-400 hover:text-green-300 p-1" title="Send SMS Reminder">
                              <i class="fas fa-envelope text-xs sm:text-sm"></i>
                            </button>
                          `
                              : ""
                          }
                          <button onclick="reactivateCustomer('${customer.id}')" class="text-purple-400 hover:text-purple-300 p-1" title="Mark as Reactivated">
                            <i class="fas fa-user-check text-xs sm:text-sm"></i>
                          </button>
                        </div>
                        ..
                       ..
                  `,
                    )
                    .join("")}
                </tbody>
               ..
            </div>
          </div>
        `
            : `
          <div class="text-center py-8 sm:py-12 bg-gray-800/30 rounded-xl">
            <div class="w-12 h-12 sm:w-16 sm:h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-3 sm:mb-4">
              <i class="fas fa-check-circle text-green-400 text-xl sm:text-2xl"></i>
            </div>
            <h3 class="text-base sm:text-lg font-semibold mb-2">No Dormant Customers</h3>
            <p class="text-xs sm:text-sm text-gray-400">All customers have been active in the last 30 days</p>
          </div>
        `
        }
      </div>
      
      ${
        dormantCount > 0
          ? `
        <div class="glass-panel rounded-2xl p-4 sm:p-6">
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
        </div>
      `
          : ""
      }
    </div>
  `;

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

  if (!confirm(`Send SMS reminder to ${customer.name} at ${customer.phone}?`)) {
    return;
  }

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
    .filter((customer) => {
      const customerTransactions = state.transactions.filter(
        (t) => t.customerId === customer.id,
      );
      if (customerTransactions.length === 0) return true;

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
  ) {
    return;
  }

  showNotification(
    `Sending SMS to ${dormantCustomers.length} customers...`,
    "info",
  );

  let sent = 0;
  let failed = 0;

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
        (t) => t.customerId === customer.id,
      );
      let lastTransactionDate = null;
      let daysDormant = "Never";

      if (customerTransactions.length > 0) {
        const sortedTransactions = [...customerTransactions].sort(
          (a, b) => new Date(b.date) - new Date(a.date),
        );
        lastTransactionDate = sortedTransactions[0].date;
        const lastDate = new Date(lastTransactionDate);
        const diffTime = Math.abs(new Date() - lastDate);
        daysDormant = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      const isDormant = !lastTransactionDate || daysDormant > 30;

      if (isDormant) {
        return {
          Name: customer.name,
          Email: customer.email,
          Phone: customer.phone || "N/A",
          Balance: customer.balance,
          "Last Transaction Date": lastTransactionDate
            ? formatDate(lastTransactionDate)
            : "Never",
          "Days Dormant":
            daysDormant === "Never" ? "Never" : `${daysDormant} days`,
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
        ) {
          value = `"${value.replace(/"/g, '""')}"`;
        }
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

  if (!confirm(`Mark ${customer.name} as reactivated?`)) {
    return;
  }

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
  const html = `
    <div class="glass-panel rounded-2xl p-4 sm:p-6 animate-fade-in">
      <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <h3 class="text-base sm:text-lg font-semibold">Staff Members</h3>
        <button onclick="showAddStaffModal()" class="w-full sm:w-auto px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-lg text-sm transition-colors">
          <i class="fas fa-plus mr-2"></i>Add Staff
        </button>
      </div>
      
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        ${state.staff
          .map(
            (staff) => `
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
              <div class="flex items-start justify-between mb-3 sm:mb-4">
                <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-full bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center font-bold text-base sm:text-lg">
                  ${
                    staff.name
                      ? staff.name
                          .split(" ")
                          .map((n) => n[0])
                          .join("")
                          .substring(0, 2)
                      : "??"
                  }
                </div>
                <span class="px-2 py-1 rounded text-xs ${staff.status === "active" ? "bg-green-500/20 text-green-400" : "bg-gray-500/20 text-gray-400"}">
                  ${staff.status}
                </span>
              </div>
              <h4 class="font-semibold text-sm sm:text-base mb-1 break-words">${staff.name}</h4>
              <p class="text-xs sm:text-sm text-gray-400 mb-1 capitalize">${staff.role}</p>
              <p class="text-xs text-gray-500 mb-2 break-words">${staff.email}</p>
              ${staff.phone ? `<p class="text-xs text-green-400 mb-2">📱 ${staff.phone}</p>` : '<p class="text-xs text-gray-500 mb-2">⚠️ No phone number</p>'}
              <div class="flex items-center gap-2 text-xs text-gray-400">
                <i class="fas fa-clock text-xs"></i>
                Last active: ${staff.lastActive || "Unknown"}
              </div>
            </div>
          `,
          )
          .join("")}
      </div>
    </div>
  `;
  container.innerHTML = html;
}

function showAddStaffModal() {
  const modalHtml = `
    <div id="staffModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-900 rounded-2xl p-4 sm:p-8 max-w-md w-full mx-auto animate-slideIn max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4 sm:mb-6">
          <h3 class="text-lg sm:text-xl font-semibold">Add New Staff Member</h3>
          <button onclick="closeStaffModal()" class="text-gray-400 hover:text-white p-2">
            <i class="fas fa-times text-lg"></i>
          </button>
        </div>
        <form onsubmit="handleAddStaff(event)" class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Full Name</label>
            <input type="text" id="staffName" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Email</label>
            <input type="email" id="staffEmail" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Phone Number</label>
            <input type="tel" id="staffPhone" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base" placeholder="08012345678">
            <p class="text-xs text-gray-400 mt-1">Optional - for admin SMS notifications</p>
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Password</label>
            <input type="password" id="staffPassword" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-300 mb-2">Role</label>
            <select id="staffRole" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-white focus:border-blue-500 text-base">
              <option value="staff">Staff</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div class="flex flex-col sm:flex-row gap-4 pt-4">
            <button type="button" onclick="closeStaffModal()" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800">
              Cancel
            </button>
            <button type="submit" class="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl">
              Add Staff
            </button>
          </div>
        </form>
      </div>
    </div>
  `;

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
    const errorMessage =
      error.response?.data?.message || "Failed to add staff member";
    showNotification(errorMessage, "error");
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

  const html = `
    <div class="glass-panel rounded-2xl p-4 sm:p-6 animate-fade-in">
      <h3 class="text-base sm:text-lg font-semibold mb-4 sm:mb-6">${state.role === "admin" ? "All Transactions" : "My Transaction Requests"}</h3>
      <div class="space-y-3 sm:space-y-4">
        ${myTransactions
          .slice(0, 20)
          .map((txn) => {
            const charges = txn.charges || 0;
            const netAmount =
              txn.type === "deposit"
                ? txn.amount - charges
                : txn.amount + charges;
            const customer = state.customers.find(
              (c) => c.id === txn.customerId,
            );
            const hasSMS = customer?.phone ? "📱" : "⚠️";

            return `
            <div class="flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 bg-gray-800/30 rounded-xl border border-gray-700/50 gap-3">
              <div class="flex items-center gap-3 sm:gap-4">
                <div class="w-8 h-8 sm:w-10 sm:h-10 rounded-full ${txn.type === "deposit" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"} flex items-center justify-center flex-shrink-0">
                  <i class="fas fa-arrow-${txn.type === "deposit" ? "down" : "up"} text-sm sm:text-base"></i>
                </div>
                <div>
                  <p class="font-medium text-sm sm:text-base">${txn.customerName} ${hasSMS}</p>
                  <div class="flex items-center gap-2 text-xs text-gray-400">
                    <i class="fas fa-calendar-alt"></i>
                    <span>${formatDate(txn.date)}</span>
                  </div>
                  ${
                    charges > 0
                      ? `
                    <div class="text-xs text-red-400 mt-1">
                      Charge: ₦${charges.toLocaleString()}
                    </div>
                  `
                      : ""
                  }
                </div>
              </div>
              <div class="text-left sm:text-right pl-11 sm:pl-0">
                <p class="font-bold text-sm sm:text-base ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">
                  ${txn.type === "deposit" ? "+" : "-"}₦${(txn.amount || 0).toLocaleString()}
                </p>
                <p class="text-xs text-blue-400">Net: ₦${netAmount.toLocaleString()}</p>
                <span class="text-xs px-2 py-1 rounded-full ${getStatusStyle(txn.status)} inline-block mt-1">
                  ${txn.status}
                </span>
              </div>
            </div>
          `;
          })
          .join("")}
          ${
            myTransactions.length === 0
              ? '<p class="text-center text-gray-400 py-4">No transactions found</p>'
              : myTransactions.length > 20
                ? '<p class="text-center text-gray-500 text-xs mt-4">Showing last 20 transactions</p>'
                : ""
          }
      </div>
    </div>
  `;
  container.innerHTML = html;
}

// ==================== ADMIN TRANSACTIONS VIEW ====================

function renderAdminTransactions(container) {
  const pending = state.transactions.filter((t) => t.status === "pending");
  const others = state.transactions.filter((t) => t.status !== "pending");

  const pendingByStaff = {};

  pending.forEach((txn) => {
    const customer = state.customers.find((c) => c.id === txn.customerId);
    const staffId = customer?.addedBy?.staffId || "unknown";
    const staffName = customer?.addedBy?.staffName || "Unknown Staff";

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

  const html = `
    <div class="space-y-4 sm:space-y-6 animate-fade-in px-4 sm:px-0">
      ${
        staffPendingList.length > 0
          ? `
        <div class="glass-panel rounded-2xl p-4 sm:p-6 border-l-4 border-yellow-500">
          <h3 class="text-base sm:text-lg font-semibold mb-3 sm:mb-4 flex items-center gap-2">
            <i class="fas fa-users text-yellow-500 text-sm sm:text-base"></i>
            Pending Approvals by Staff
          </h3>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
            ${staffPendingList
              .map(
                (staff) => `
              <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700 hover:border-yellow-500/50 transition-all">
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
              </div>
            `,
              )
              .join("")}
          </div>
          
          <div class="flex justify-end mt-4 pt-4 border-t border-gray-700">
            <button onclick="approveAllPendingTransactions()" class="px-4 sm:px-6 py-2 sm:py-3 bg-green-600 hover:bg-green-500 rounded-lg transition-colors flex items-center gap-2 text-sm sm:text-base">
              <i class="fas fa-check-double"></i>
              Approve All (${pending.length})
            </button>
          </div>
        </div>
      `
          : `
        <div class="glass-panel rounded-2xl p-8 sm:p-12 text-center">
          <div class="w-12 h-12 sm:w-16 sm:h-16 mx-auto bg-green-500/20 rounded-full flex items-center justify-center mb-3 sm:mb-4">
            <i class="fas fa-check-double text-green-400 text-xl sm:text-2xl"></i>
          </div>
          <h3 class="text-base sm:text-lg font-semibold mb-2">All Caught Up!</h3>
          <p class="text-xs sm:text-sm text-gray-400">No pending transactions requiring approval</p>
        </div>
      `
      }

      ${
        pending.length > 0
          ? `
        <div class="glass-panel rounded-2xl p-4 sm:p-6">
          <h3 class="text-base sm:text-lg font-semibold mb-3 sm:mb-4">All Pending Transactions</h3>
          <div class="space-y-3 sm:space-y-4">
            ${pending
              .map((txn) => {
                const customer = state.customers.find(
                  (c) => c.id === txn.customerId,
                );
                const staffName =
                  customer?.addedBy?.staffName || "Unknown Staff";
                const charges = txn.charges || 0;
                const netAmount =
                  txn.type === "deposit"
                    ? txn.amount - charges
                    : txn.amount + charges;
                const hasSMS = customer?.phone ? "📱" : "⚠️";

                return `
                <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700 hover:border-yellow-500/50 transition-all" id="txn-${txn.id}">
                  <div class="flex flex-col lg:flex-row justify-between items-start gap-3 sm:gap-4">
                    <div class="flex items-start gap-3 sm:gap-4 flex-1">
                      <div class="w-8 h-8 sm:w-12 sm:h-12 rounded-full ${txn.type === "deposit" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"} flex items-center justify-center flex-shrink-0">
                        <i class="fas fa-arrow-${txn.type === "deposit" ? "down" : "up"} text-sm sm:text-xl"></i>
                      </div>
                      <div class="flex-1">
                        <div class="flex flex-wrap items-center gap-2">
                          <p class="font-semibold text-sm sm:text-lg">₦${(txn.amount || 0).toLocaleString()}</p>
                          <span class="px-2 py-0.5 ${txn.type === "deposit" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"} rounded-full text-xs font-medium">
                            ${txn.type}
                          </span>
                          <span class="px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded-full text-xs">
                            ${staffName} ${hasSMS}
                          </span>
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
                            <span class="font-mono ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">
                              ${txn.type === "deposit" ? "+" : "-"}₦${(txn.amount || 0).toLocaleString()}
                            </span>
                          </div>
                          ${
                            charges > 0
                              ? `
                          <div class="flex justify-between text-xs sm:text-sm">
                            <span class="text-gray-400">Charge:</span>
                            <span class="font-mono text-red-400">-₦${charges.toLocaleString()}</span>
                          </div>
                          <div class="flex justify-between text-xs sm:text-sm pt-1 border-t border-gray-700">
                            <span class="text-gray-300 font-medium">Net:</span>
                            <span class="font-mono text-blue-400 font-bold">₦${netAmount.toLocaleString()}</span>
                          </div>
                          `
                              : `
                          <div class="flex justify-between text-xs sm:text-sm pt-1 border-t border-gray-700">
                            <span class="text-gray-300 font-medium">Net:</span>
                            <span class="font-mono text-blue-400 font-bold">₦${netAmount.toLocaleString()}</span>
                          </div>
                          `
                          }
                        </div>
                      </div>
                    </div>

                    <div class="flex gap-2 w-full lg:w-auto mt-2 lg:mt-0">
                      <button onclick="processTransaction('${txn.id}', 'approved')" 
                        class="flex-1 lg:flex-none px-3 sm:px-4 py-2 bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm">
                        <i class="fas fa-check"></i>
                        <span>Approve</span>
                      </button>
                      <button onclick="processTransaction('${txn.id}', 'rejected')" 
                        class="flex-1 lg:flex-none px-3 sm:px-4 py-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors flex items-center justify-center gap-2 text-xs sm:text-sm">
                        <i class="fas fa-times"></i>
                        <span>Reject</span>
                      </button>
                    </div>
                  </div>
                  
                  ${
                    txn.description
                      ? `
                    <div class="mt-3 pt-3 border-t border-gray-700">
                      <div class="flex items-start gap-2">
                        <i class="fas fa-align-left text-gray-500 text-xs mt-1"></i>
                        <div class="flex-1">
                          <p class="text-xs text-gray-400 mb-1">Description:</p>
                          <p class="text-xs sm:text-sm text-gray-300 bg-gray-900/50 p-2 rounded-lg break-words">${txn.description}</p>
                        </div>
                      </div>
                    </div>
                  `
                      : ""
                  }
                </div>
              `;
              })
              .join("")}
          </div>
        </div>
      `
          : ""
      }

      <div class="glass-panel rounded-2xl p-4 sm:p-6">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
          <h3 class="text-base sm:text-lg font-semibold">Transaction History</h3>
          <div class="flex gap-2 w-full sm:w-auto">
            <select
              id="staffTransactionFilter"
              onchange="filterTransactionsByStaff()"
              class="flex-1 sm:flex-none px-2 sm:px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs sm:text-sm text-white"
            >
              <option value="">All Staff</option>
              ${state.staff
                .map((s) => `<option value="${s.id}">${s.name}</option>`)
                .join("")}
            </select>
            <select
              id="sortTransactions"
              onchange="sortTransactions()"
              class="flex-1 sm:flex-none px-2 sm:px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-xs sm:text-sm text-white"
            >
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
                  ..
              </thead>
              <tbody class="divide-y divide-gray-800" id="transactionsTableBody">
                ${others
                  .map((txn) => {
                    const customer = state.customers.find(
                      (c) => c.id === txn.customerId,
                    );
                    const staffName = customer?.addedBy?.staffName || "System";
                    const staffId = customer?.addedBy?.staffId || "system";
                    const charges = txn.charges || 0;
                    const netAmount =
                      txn.type === "deposit"
                        ? txn.amount - charges
                        : txn.amount + charges;

                    return `
                    <tr class="hover:bg-gray-800/30 transition-colors transaction-row" data-staff="${staffId}">
                      <td class="py-3 px-4 sm:px-0 font-mono text-xs text-gray-500 hidden md:table-cell">${txn.id.substring(0, 8)}...  ..
                      <td class="py-3 px-4 sm:px-0 text-xs sm:text-sm break-words max-w-[120px] sm:max-w-none">${txn.customerName} ..
                      <td class="py-3 px-4 sm:px-0 hidden sm:table-cell">
                        <span class="px-2 py-1 bg-purple-500/20 text-purple-400 rounded-full text-xs">
                          ${staffName}
                        </span>
                       ..
                      <td class="py-3 px-4 sm:px-0">
                        <span class="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm">
                          <i class="fas fa-arrow-${txn.type === "deposit" ? "down text-green-400" : "up text-orange-400"}"></i>
                          ${txn.type}
                        </span>
                       ..
                      <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">
                        ${txn.type === "deposit" ? "+" : "-"}₦${(txn.amount || 0).toLocaleString()}
                       ..
                      <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-red-400 hidden sm:table-cell">
                        ${charges > 0 ? `-₦${charges.toLocaleString()}` : "-"}
                       ..
                      <td class="py-3 px-4 sm:px-0 font-mono text-xs sm:text-sm text-blue-400">
                        ₦${netAmount.toLocaleString()}
                       ..
                      <td class="py-3 px-4 sm:px-0 hidden md:table-cell text-xs sm:text-sm text-gray-300">
                        <div class="flex items-center gap-1">
                          <i class="fas fa-calendar-alt text-gray-500 text-xs"></i>
                          ${formatDate(txn.date)}
                        </div>
                       ..
                      <td class="py-3 px-4 sm:px-0">
                        <span class="px-2 py-1 rounded text-xs ${getStatusStyle(txn.status)}">
                          ${txn.status}
                        </span>
                       ..
                      <td class="py-3 px-4 sm:px-0">
                        <button onclick="viewTransactionDetails('${txn.id}')" class="text-blue-400 hover:text-blue-300 p-1" title="View Details">
                          <i class="fas fa-eye text-xs sm:text-sm"></i>
                        </button>
                       ..
                      ..
                  `;
                  })
                  .join("")}
              </tbody>
             ..
          </div>
        </div>
      </div>
    </div>
  `;
  container.innerHTML = html;
}

// ==================== HELPER FUNCTIONS FOR TRANSACTIONS ====================

function filterTransactionsByStaff() {
  const staffId = document.getElementById("staffTransactionFilter")?.value;
  const rows = document.querySelectorAll(
    "#transactionsTableBody .transaction-row",
  );

  if (!rows.length) return;

  rows.forEach((row) => {
    if (!staffId || row.dataset.staff === staffId) {
      row.style.display = "";
    } else {
      row.style.display = "none";
    }
  });
}

function viewStaffPendingTransactions(staffId) {
  if (staffId === "unknown") {
    showNotification(
      "Cannot identify staff member for these transactions",
      "warning",
    );
    return;
  }

  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff) return;

  const staffCustomers = state.customers.filter(
    (c) => c.addedBy?.staffId === staffId,
  );
  const pendingTransactions = state.transactions.filter(
    (t) =>
      staffCustomers.some((c) => c.id === t.customerId) &&
      t.status === "pending",
  );

  if (pendingTransactions.length === 0) {
    showNotification("No pending transactions for this staff member", "info");
    return;
  }

  const modalHtml = `
    <div id="staffPendingModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-900 rounded-2xl p-4 sm:p-8 max-w-4xl w-full mx-auto max-h-[90vh] overflow-y-auto animate-slideIn">
        <div class="flex justify-between items-center mb-4 sm:mb-6">
          <div>
            <h3 class="text-lg sm:text-xl font-semibold">${staff.name} - Pending</h3>
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
              const netAmount =
                txn.type === "deposit"
                  ? txn.amount - charges
                  : txn.amount + charges;
              const customer = state.customers.find(
                (c) => c.id === txn.customerId,
              );
              const hasSMS = customer?.phone ? "📱" : "⚠️";

              return `
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-xl border border-gray-700">
              <div class="flex flex-col sm:flex-row justify-between items-start gap-3">
                <div class="flex-1">
                  <div class="flex flex-wrap items-center gap-2 mb-2">
                    <span class="px-2 py-1 rounded text-xs ${txn.type === "deposit" ? "bg-green-500/20 text-green-400" : "bg-orange-500/20 text-orange-400"}">
                      ${txn.type}
                    </span>
                    <span class="text-white font-bold text-sm sm:text-base">₦${txn.amount.toLocaleString()}</span>
                    <span class="text-xs">${hasSMS}</span>
                  </div>
                  <p class="text-xs sm:text-sm text-gray-300">Customer: ${txn.customerName}</p>
                  <p class="text-xs text-gray-400">Date: ${formatDate(txn.date)}</p>
                  
                  <div class="mt-2 p-2 sm:p-3 bg-gray-900/50 rounded-lg">
                    <div class="flex justify-between text-xs sm:text-sm mb-1">
                      <span class="text-gray-400">Gross:</span>
                      <span class="font-mono ${txn.type === "deposit" ? "text-green-400" : "text-orange-400"}">
                        ${txn.type === "deposit" ? "+" : "-"}₦${txn.amount.toLocaleString()}
                      </span>
                    </div>
                    ${
                      charges > 0
                        ? `
                      <div class="flex justify-between text-xs sm:text-sm mb-1">
                        <span class="text-gray-400">Charge:</span>
                        <span class="font-mono text-red-400">-₦${charges.toLocaleString()}</span>
                      </div>
                      <div class="flex justify-between text-xs sm:text-sm pt-1 border-t border-gray-700">
                        <span class="text-gray-300">Net:</span>
                        <span class="font-mono text-blue-400 font-bold">₦${netAmount.toLocaleString()}</span>
                      </div>
                    `
                        : `
                      <div class="text-xs text-gray-400">No charges applied</div>
                    `
                    }
                  </div>
                  
                  ${
                    txn.description
                      ? `
                    <div class="mt-2 text-xs text-gray-400 break-words">
                      <span class="text-gray-500">Desc:</span> ${txn.description}
                    </div>
                  `
                      : ""
                  }
                </div>
                <div class="flex gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                  <button onclick="processTransaction('${txn.id}', 'rejected', true, '${staffId}')" class="flex-1 sm:flex-none px-3 py-2 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg text-xs sm:text-sm transition-colors">
                    Reject
                  </button>
                  <button onclick="processTransaction('${txn.id}', 'approved', true, '${staffId}')" class="flex-1 sm:flex-none px-3 py-2 bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white rounded-lg text-xs sm:text-sm transition-colors">
                    Approve
                  </button>
                </div>
              </div>
            </div>
          `;
            })
            .join("")}
        </div>
        
        <div class="flex flex-col sm:flex-row justify-end gap-4 mt-6 pt-4 border-t border-gray-700">
          <button onclick="closeStaffPendingModal()" class="px-6 py-2 border border-gray-600 rounded-lg hover:bg-gray-800 transition-colors">
            Close
          </button>
          <button onclick="approveAllStaffTransactions('${staffId}')" class="px-6 py-2 bg-green-600 hover:bg-green-500 rounded-lg transition-colors flex items-center justify-center gap-2">
            <i class="fas fa-check-double"></i>
            Approve All
          </button>
        </div>
      </div>
    </div>
  `;

  const modalContainer = document.createElement("div");
  modalContainer.innerHTML = modalHtml;
  document.body.appendChild(modalContainer);
}

function closeStaffPendingModal() {
  const modal = document.getElementById("staffPendingModal");
  if (modal) modal.remove();
}

function closeTransactionModal() {
  const modal = document.getElementById("transactionModal");
  if (modal) modal.remove();
}

async function approveAllStaffTransactions(staffId) {
  if (staffId === "unknown") {
    showNotification(
      "Cannot identify staff member for these transactions",
      "warning",
    );
    return;
  }

  const staff = state.staff.find((s) => s.id === staffId);
  if (!staff) return;

  const staffCustomers = state.customers.filter(
    (c) => c.addedBy?.staffId === staffId,
  );
  const pendingTransactions = state.transactions.filter(
    (t) =>
      staffCustomers.some((c) => c.id === t.customerId) &&
      t.status === "pending",
  );

  if (pendingTransactions.length === 0) {
    showNotification("No pending transactions for this staff member", "info");
    closeStaffPendingModal();
    return;
  }

  if (
    !confirm(
      `Are you sure you want to approve all ${pendingTransactions.length} pending transactions for ${staff.name}?`,
    )
  ) {
    return;
  }

  let approved = 0;
  let failed = 0;

  showNotification(
    `Processing ${pendingTransactions.length} transactions...`,
    "info",
  );

  for (const txn of pendingTransactions) {
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

  if (failed === 0) {
    showNotification(
      `Successfully approved all ${approved} transactions for ${staff.name}`,
      "success",
    );
  } else {
    showNotification(
      `Approved ${approved} transactions, ${failed} failed for ${staff.name}`,
      "warning",
    );
  }

  closeStaffPendingModal();
  navigate("transactions");
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
  ) {
    return;
  }

  let approved = 0;
  let failed = 0;

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

  if (failed === 0) {
    showNotification(
      `Successfully approved all ${approved} transactions`,
      "success",
    );
  } else {
    showNotification(
      `Approved ${approved} transactions, ${failed} failed`,
      "warning",
    );
  }

  navigate("transactions");
}

function viewTransactionDetails(txnId) {
  const transaction = state.transactions.find((t) => t.id === txnId);
  if (!transaction) return;

  const customer = state.customers.find((c) => c.id === transaction.customerId);
  const staffName = customer?.addedBy?.staffName || "System";
  const charges = transaction.charges || 0;
  const netAmount =
    transaction.type === "deposit"
      ? transaction.amount - charges
      : transaction.amount + charges;
  const hasSMS = customer?.phone ? "Yes" : "No";

  const modalHtml = `
    <div id="transactionModal" class="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
      <div class="bg-gray-900 rounded-2xl p-4 sm:p-8 max-w-2xl w-full mx-auto animate-slideIn max-h-[90vh] overflow-y-auto">
        <div class="flex justify-between items-center mb-4 sm:mb-6">
          <h3 class="text-lg sm:text-xl font-semibold">Transaction Details</h3>
          <button onclick="closeTransactionModal()" class="text-gray-400 hover:text-white p-2">
            <i class="fas fa-times text-lg"></i>
          </button>
        </div>
        
        <div class="space-y-3 sm:space-y-4">
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
              <p class="text-xs text-gray-400 mb-1">Transaction ID</p>
              <p class="text-xs sm:text-sm font-mono break-words">${transaction.id}</p>
            </div>
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
              <p class="text-xs text-gray-400 mb-1">Status</p>
              <span class="px-2 py-1 rounded text-xs ${getStatusStyle(transaction.status)}">
                ${transaction.status}
              </span>
            </div>
          </div>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
              <p class="text-xs text-gray-400 mb-1">Customer</p>
              <p class="text-xs sm:text-sm font-medium break-words">${transaction.customerName}</p>
            </div>
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
              <p class="text-xs text-gray-400 mb-1">SMS Enabled</p>
              <p class="text-xs sm:text-sm ${hasSMS === "Yes" ? "text-green-400" : "text-red-400"}">${hasSMS}</p>
            </div>
          </div>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
              <p class="text-xs text-gray-400 mb-1">Staff</p>
              <p class="text-xs sm:text-sm font-medium break-words">${staffName}</p>
            </div>
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
              <p class="text-xs text-gray-400 mb-1">Date</p>
              <p class="text-xs sm:text-sm">${formatDate(transaction.date)}</p>
            </div>
          </div>
          
          <div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
            <p class="text-xs text-gray-400 mb-2">Amount Breakdown</p>
            <div class="space-y-1 sm:space-y-2">
              <div class="flex justify-between text-xs sm:text-sm">
                <span>Type:</span>
                <span class="font-medium ${transaction.type === "deposit" ? "text-green-400" : "text-orange-400"}">
                  ${transaction.type.toUpperCase()}
                </span>
              </div>
              <div class="flex justify-between text-xs sm:text-sm">
                <span>Gross Amount:</span>
                <span class="font-mono ${transaction.type === "deposit" ? "text-green-400" : "text-orange-400"}">
                  ${transaction.type === "deposit" ? "+" : "-"}₦${transaction.amount.toLocaleString()}
                </span>
              </div>
              ${
                charges > 0
                  ? `
                <div class="flex justify-between text-xs sm:text-sm">
                  <span>Charge:</span>
                  <span class="font-mono text-red-400">-₦${charges.toLocaleString()}</span>
                </div>
                <div class="flex justify-between text-xs sm:text-sm pt-1 sm:pt-2 border-t border-gray-700">
                  <span class="font-semibold">Net Amount:</span>
                  <span class="font-mono text-blue-400 font-bold">₦${netAmount.toLocaleString()}</span>
                </div>
              `
                  : `
                <div class="flex justify-between text-xs sm:text-sm pt-1 sm:pt-2 border-t border-gray-700">
                  <span class="font-semibold">Net Amount:</span>
                  <span class="font-mono text-blue-400 font-bold">₦${netAmount.toLocaleString()}</span>
                </div>
                <p class="text-xs text-gray-500 mt-2">No charges applied to this transaction</p>
              `
              }
            </div>
          </div>
          
          ${
            transaction.description
              ? `
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
              <p class="text-xs text-gray-400 mb-1">Description</p>
              <p class="text-xs sm:text-sm break-words">${transaction.description}</p>
            </div>
          `
              : ""
          }
          
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
              <p class="text-xs text-gray-400 mb-1">Requested By</p>
              <p class="text-xs sm:text-sm">${transaction.requestedBy || "Customer"}</p>
            </div>
            <div class="bg-gray-800/50 p-3 sm:p-4 rounded-lg">
              <p class="text-xs text-gray-400 mb-1">Approved By</p>
              <p class="text-xs sm:text-sm">${transaction.approvedBy || "Pending"}</p>
            </div>
          </div>
          
          ${
            transaction.status === "pending"
              ? `
            <div class="flex flex-col sm:flex-row gap-4 pt-4">
              <button onclick="processTransaction('${transaction.id}', 'rejected'); closeTransactionModal()" class="flex-1 px-6 py-3 bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white rounded-lg transition-colors">
                Reject
              </button>
              <button onclick="processTransaction('${transaction.id}', 'approved'); closeTransactionModal()" class="flex-1 px-6 py-3 bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white rounded-lg transition-colors">
                Approve
              </button>
            </div>
          `
              : ""
          }
        </div>
      </div>
    </div>
  `;

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

// ==================== TRANSACTION HANDLERS ====================

async function handleNewTransaction(e) {
  e.preventDefault();

  const formData = new FormData(e.target);
  const customerId = formData.get("customerId");
  const customer = state.customers.find((c) => c.id === customerId);
  const type = formData.get("type");
  const amount = parseFloat(formData.get("amount"));
  const charges = parseFloat(formData.get("charges")) || 0;

  if (!customer) {
    showNotification("Please select a customer", "error");
    return;
  }

  const netAmount = type === "deposit" ? amount - charges : amount + charges;

  if (type === "withdrawal") {
    const totalDeduction = amount + charges;
    if (totalDeduction > customer.balance) {
      showNotification(
        `Insufficient funds! Customer balance: ₦${customer.balance.toLocaleString()}. Total deduction including charges: ₦${totalDeduction.toLocaleString()}`,
        "error",
      );
      return;
    }
  }

  const txnData = {
    customerId: customerId,
    customerName: customer.name,
    type: type,
    amount: amount,
    charges: charges,
    netAmount: netAmount,
    description: formData.get("description"),
    status: "pending",
    requestedBy: state.currentUser.name,
    requestedAt: new Date().toISOString(),
  };

  try {
    const response = await api.post("/transactions", txnData);

    await loadAllData();

    if (charges > 0) {
      showNotification(
        `✅ Transaction request submitted! ${type === "deposit" ? "Deposit" : "Withdrawal"} of ₦${amount.toLocaleString()} with ₦${charges.toLocaleString()} charges. Net: ₦${netAmount.toLocaleString()}\n📱 SMS alert will be sent to customer upon approval.`,
        "success",
      );
    } else {
      showNotification(
        `✅ Transaction request submitted for ${type} of ₦${amount.toLocaleString()}\n📱 SMS alert will be sent to customer upon approval.`,
        "success",
      );
    }
    navigate("history");
  } catch (error) {
    console.error("Transaction submission error:", error);
    const errorMessage =
      error.response?.data?.message || "Failed to submit transaction";
    showNotification(errorMessage, "error");
  }
}

async function processTransaction(
  txnId,
  action,
  refreshView = true,
  staffId = null,
) {
  try {
    const transaction = state.transactions.find((t) => t.id === txnId);
    if (!transaction) {
      showNotification("Transaction not found", "error");
      return;
    }

    const response = await api.patch(`/transactions/${txnId}`, {
      status: action,
      approvedBy: state.currentUser.name,
    });

    await loadAllData();

    if (action === "approved") {
      const charges = transaction.charges || 0;
      const netAmount =
        transaction.type === "deposit"
          ? transaction.amount - charges
          : transaction.amount + charges;

      showNotification(
        `✅ Transaction ${action}! ${transaction.type === "deposit" ? "Deposit" : "Withdrawal"} of ₦${transaction.amount.toLocaleString()} ${action}. ${charges > 0 ? `Charges: ₦${charges.toLocaleString()}. ` : ""}Net: ₦${netAmount.toLocaleString()}\n📱 SMS alert sent to customer.`,
        "success",
      );
    } else {
      showNotification(`❌ Transaction ${action}`, "error");
    }

    closeStaffPendingModal();
    closeTransactionModal();

    if (refreshView) {
      if (staffId) {
        navigate("staff");
      } else {
        navigate("transactions");
      }
    }
  } catch (error) {
    console.error("Transaction processing error:", error);
    const errorMessage =
      error.response?.data?.message || "Failed to process transaction";
    showNotification(errorMessage, "error");
  }
}

// ==================== NAVIGATION ====================

function navigate(view) {
  state.currentView = view;
  renderSidebar();

  if (window.innerWidth < 768) {
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    if (sidebar) sidebar.classList.remove("open");
    if (overlay) overlay.classList.add("hidden");
    document.body.style.overflow = "";
  }

  const titles = {
    dashboard: "Dashboard Overview",
    customers: "Customer Management",
    "dormant-customers": "Dormant Customers",
    transactions:
      state.role === "admin" ? "Transaction Approvals" : "New Transaction",
    staff: "Staff Management",
    reports: "System Reports",
    "customer-reports": "Customer Reports",
    settings: "System Settings",
    "new-customer": "Register New Customer",
    history: "Transaction History",
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
    default:
      renderDashboard(contentArea);
  }
}

// ==================== NOTIFICATIONS ====================

function toggleNotifications() {
  const panel = document.getElementById("notificationPanel");
  panel.classList.toggle("translate-x-full");
}

function checkPendingNotifications() {
  const pendingCount = state.transactions.filter(
    (t) => t.status === "pending",
  ).length;
  const badge = document.getElementById("notifBadge");
  if (pendingCount > 0 && state.role === "admin") {
    badge.classList.remove("hidden");
    state.notifications.push({
      id: Date.now(),
      message: `${pendingCount} transactions pending approval`,
      time: "Just now",
      unread: true,
    });
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
      (n) => `
      <div class="p-4 hover:bg-gray-800/50 transition-colors ${n.unread ? "border-l-2 border-blue-500" : ""}">
        <p class="text-sm mb-1">${n.message}</p>
        <p class="text-xs text-gray-500">${n.time}</p>
      </div>
    `,
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
    const now = new Date();
    document.getElementById("liveTime").textContent =
      now.toLocaleTimeString("en-GB");
  }, 1000);
}

function logout() {
  localStorage.removeItem("token");
  state.currentUser = null;
  state.role = null;
  state.customers = [];
  state.transactions = [];
  state.staff = [];
  document.getElementById("app").classList.add("hidden");
  document.getElementById("loginScreen").classList.remove("hidden");
  document.getElementById("passwordInput").value = "";
  document.getElementById("emailInput").value = "";
  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.classList.remove("border-blue-500", "bg-blue-500/10");
    btn.classList.add("border-gray-600");
  });
}

// ==================== CUSTOMER EDIT MODALS ====================

function editCustomer(id) {
  const customer = state.customers.find((c) => c.id === id);
  showModal(`
    <div class="p-4 sm:p-6">
      <h3 class="text-lg sm:text-xl font-bold mb-4 sm:mb-6">Edit Customer</h3>
      <form onsubmit="handleEditCustomer(event, '${id}')" class="space-y-3 sm:space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Name</label>
          <input type="text" id="editName" value="${customer.name}" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-base">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Email</label>
          <input type="email" id="editEmail" value="${customer.email}" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-base">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Phone</label>
          <input type="tel" id="editPhone" value="${customer.phone}" required class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-base">
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Address</label>
          <textarea id="editAddress" rows="2" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-base">${customer.address || ""}</textarea>
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-300 mb-2">Status</label>
          <select id="editStatus" class="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl text-base">
            <option value="active" ${customer.status === "active" ? "selected" : ""}>Active</option>
            <option value="inactive" ${customer.status === "inactive" ? "selected" : ""}>Inactive</option>
          </select>
        </div>
        <div class="flex flex-col sm:flex-row gap-4 pt-4">
          <button type="button" onclick="closeModal()" class="flex-1 px-6 py-3 border border-gray-600 rounded-xl hover:bg-gray-800">
            Cancel
          </button>
          <button type="submit" class="flex-1 px-6 py-3 bg-blue-600 hover:bg-blue-500 rounded-xl">
            Update
          </button>
        </div>
      </form>
    </div>
  `);
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
    const response = await api.put(`/customers/${id}`, updatedData);

    const index = state.customers.findIndex((c) => c.id === id);
    state.customers[index] = { ...state.customers[index], ...updatedData };

    closeModal();
    showNotification("Customer updated successfully", "success");
    renderCustomers(document.getElementById("contentArea"));
  } catch (error) {
    console.error("Update customer error:", error);
    const errorMessage =
      error.response?.data?.message || "Failed to update customer";
    showNotification(errorMessage, "error");
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

function checkAuth() {
  const token = localStorage.getItem("token");
  if (token) {
    api
      .get("/verify")
      .then((response) => {
        state.currentUser = response.data.user;
        state.role = response.data.user.role;
        document.getElementById("loginScreen").classList.add("hidden");
        document.getElementById("app").classList.remove("hidden");
        initializeApp();
      })
      .catch(() => {
        localStorage.removeItem("token");
      });
  }
}

// Initialize with demo data
window.onload = () => {
  selectRole("admin");
  checkAuth();
};
