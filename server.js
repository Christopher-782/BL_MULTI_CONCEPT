const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const customerRouter = require("./routes/customerRoutes");
const staffRouter = require("./routes/staffRoutes");
const transactionRouter = require("./routes/transactionRoutes");
const app = express();
mongoose
  .connect(process.env.MONGO)
  .then(() => console.log("MONGO IS CONNECTED"))
  .catch((err) => console.log("Failed To Connect:", err.message));

app.use(cors());
app.use(express.json());
app.use(express.static("public"));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Routes
app.use("/", staffRouter);
app.use("/", customerRouter);
app.use("/", transactionRouter);

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

// Test SMS endpoint - Remove after testing
app.get("/api/test-sms-now", async (req, res) => {
  const { sendSMS } = require("./services/smsService");

  console.log("🔍 Testing SMS with Bearer Token...");
  console.log("Token exists:", !!process.env.BULKSMS_BEARER_TOKEN);

  const result = await sendSMS(
    "2348078777467", // Your phone number
    `Test SMS from VaultFlow using Bearer Token at ${new Date().toLocaleString()}`,
  );

  res.json({
    success: result.success,
    message: result.success
      ? "✅ SMS sent! Check your phone."
      : "❌ SMS failed",
    details: result,
    environment: {
      hasBearerToken: !!process.env.BULKSMS_BEARER_TOKEN,
      senderId: process.env.BULKSMS_SENDER_ID,
    },
  });
});
app.listen(process.env.PORT, () => {
  console.log(`Server running on port`);
});
