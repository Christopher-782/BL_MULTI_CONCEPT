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
// Add this test endpoint BEFORE app.listen()
app.get("/api/test-sms-now", async (req, res) => {
  console.log("🔍 Test SMS endpoint called");

  try {
    // Import your SMS service
    const { sendSMS } = require("./services/smsService");

    const phone = "2348078777467"; // Your phone number
    const message = `Test SMS from VaultFlow on Render at ${new Date().toLocaleString()}`;

    console.log("Sending to:", phone);
    console.log("Message:", message);

    const result = await sendSMS(phone, message);

    console.log("Result:", result);

    res.json({
      success: result.success,
      message: result.success
        ? "✅ SMS sent! Check your phone."
        : "❌ SMS failed",
      details: result,
      environment: {
        tokenExists: !!process.env.BULKSMS_TOKEN,
        tokenLength: process.env.BULKSMS_TOKEN?.length,
        testMode: process.env.TEST_MODE,
      },
    });
  } catch (error) {
    console.error("Test endpoint error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});
app.listen(process.env.PORT, () => {
  console.log(`Server running on port`);
});
