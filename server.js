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

// Test SMS endpoint with detailed logging
app.get("/api/test-sms-detail", async (req, res) => {
  console.log("\n🔍 ===== TEST SMS ENDPOINT CALLED =====");
  console.log("Query params:", req.query);

  const { sendSMS } = require("./services/smsService");
  const testPhone = req.query.phone || "2348078777467";
  const testMessage =
    req.query.message ||
    `Test SMS from VaultFlow on Render at ${new Date().toLocaleString()}`;

  console.log("Sending to:", testPhone);
  console.log("Message:", testMessage);

  const result = await sendSMS(testPhone, testMessage);

  console.log("Result:", result);
  res.json({
    success: result.success,
    message: result.success
      ? "SMS sent! Check your phone and BulkSMS dashboard."
      : "SMS failed",
    details: result,
    environment: {
      hasToken: !!process.env.BULKSMS_TOKEN,
      tokenFirstFour: process.env.BULKSMS_TOKEN?.substring(0, 4),
      senderId: process.env.BULKSMS_SENDER_ID,
      nodeEnv: process.env.NODE_ENV,
    },
  });
});
app.listen(process.env.PORT, () => {
  console.log(`Server running on port`);
});
