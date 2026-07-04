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

// FIX: Trust proxy (required for Render.com and express-rate-limit)
app.set("trust proxy", 1);

mongoose
  .connect(process.env.MONGO)
  .then(() => console.log("MONGO IS CONNECTED"))
  .catch((err) => console.log("Failed To Connect:", err.message));

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

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

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
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
  message: {
    status: 429,
    message: "Too many financial operations, please slow down.",
  },
});

app.use(generalLimiter);
app.use("/login", authLimiter);
app.use("/register", authLimiter);
app.use("/transactions", financialLimiter);

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
