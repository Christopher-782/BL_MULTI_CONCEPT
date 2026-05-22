const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const rateLimit = require("express-rate-limit"); // ADD THIS

const customerRouter = require("./routes/customerRoutes");
const staffRouter = require("./routes/staffRoutes");
const transactionRouter = require("./routes/transactionRoutes");
const loanRoutes = require("./routes/loanRoutes");
const reportRoutes = require("./routes/reportRoutes");

const app = express();

mongoose
  .connect(process.env.MONGO)
  .then(() => console.log("MONGO IS CONNECTED"))
  .catch((err) => console.log("Failed To Connect:", err.message));

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// ==================== RATE LIMITING ====================
// General API limiter - 100 requests per 15 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    message:
      "Too many requests from this IP, please try again after 15 minutes.",
  },
});

// Strict limiter for auth routes - 5 attempts per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    message: "Too many login attempts, please try again after 15 minutes.",
  },
});

// Financial operations limiter - 10 requests per minute
const financialLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    message: "Too many financial operations, please slow down.",
  },
});

// Apply general limiter to all API routes
app.use(generalLimiter);

// Apply stricter limits to specific routes
app.use("/login", authLimiter);
app.use("/register", authLimiter);
// Apply to your transaction routes (adjust paths based on your router definitions)
app.use("/transactions", financialLimiter);
// ==================== END RATE LIMITING ====================

// Routes
app.use("/", staffRouter);
app.use("/", customerRouter);
app.use("/transactions", transactionRouter);
app.use("/", loanRoutes);
app.use("/", reportRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const Staff = require("./models/staff");

async function createAdmin() {
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
}

createAdmin();

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
