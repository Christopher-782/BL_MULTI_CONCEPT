const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit");

const customerRouter = require("./routes/customerRoutes");
const staffRouter = require("./routes/staffRoutes");
const transactionRouter = require("./routes/transactionRoutes");
const loanRoutes = require("./routes/loanRoutes");
const reportRoutes = require("./routes/reportRoutes");
const expensesRouter = require("./routes/expensesRouter");

const app = express();

// Required for Render.com and express-rate-limit
app.set("trust proxy", 1);

// VERY IMPORTANT: Put this before express.json(), static files, limiters, and routes
app.use((req, res, next) => {
  const allowedOrigins = [
    "https://bl-multi-concept.onrender.com",
    "https://bl-multi-concept-api.onrender.com",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5500",
  ];

  const origin = req.headers.origin;

  // Helpful debug log for Render logs
  console.log("Request Origin:", origin || "No origin");

  if (!origin || allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
  }

  res.setHeader("Vary", "Origin");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With",
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  // Stop preflight here
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }

  next();
});

app.use(express.json());
app.use(express.static("public"));

mongoose
  .connect(process.env.MONGO)
  .then(() => console.log("MONGO IS CONNECTED"))
  .catch((err) => console.log("Failed To Connect:", err.message));

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: {
    status: 429,
    message:
      "Too many requests from this IP, please try again after 15 minutes.",
  },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: {
    status: 429,
    message: "Too many login attempts, please try again after 15 minutes.",
  },
});

const financialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.method === "OPTIONS",
  message: {
    status: 429,
    message: "Too many financial operations, please slow down.",
  },
});

app.use(generalLimiter);
app.use("/login", authLimiter);
app.use("/register", authLimiter);
app.use("/transactions", financialLimiter);

// Health check
app.get("/health", (req, res) => {
  res.json({
    success: true,
    message: "API is running",
    origin: req.headers.origin || null,
  });
});

// Routes
app.use("/", staffRouter);
app.use("/", customerRouter);
app.use("/transactions", transactionRouter);
app.use("/", loanRoutes);
app.use("/", reportRoutes);
app.use("/expenses", expensesRouter);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const Staff = require("./models/staff");

async function createAdmin() {
  try {
    const adminExists = await Staff.findOne({ role: "admin" });

    if (!adminExists) {
      await Staff.create({
        name: "Administrator",
        email: "admin@vaultflow.com",
        password: "admin123",
        role: "admin",
        status: "active",
      });

      console.log("Admin user created");
    }
  } catch (error) {
    console.error("Create admin error:", error.message);
  }
}

createAdmin();

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
