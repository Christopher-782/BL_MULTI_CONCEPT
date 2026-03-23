// test-sms.js
require("dotenv").config();
const { sendCreditAlert, sendDebitAlert } = require("./services/smsService");

async function testSMS() {
  console.log("🧪 Testing BulkSMS Nigeria Integration");
  console.log("=".repeat(50));
  console.log(
    "API Token:",
    process.env.BULKSMS_TOKEN ? "✓ Configured" : "✗ Missing",
  );
  console.log("=".repeat(50));

  // Replace with your actual phone number
  const yourNumber = "08012345678"; // CHANGE THIS TO YOUR NUMBER
  const testAmount = 5000;
  const testBalance = 25000;
  const testRef = "TEST001";

  console.log("\n📱 Testing Credit Alert...");
  console.log("-".repeat(30));
  const creditResult = await sendCreditAlert(
    yourNumber,
    testAmount,
    testBalance,
    testRef,
  );

  if (creditResult.success) {
    console.log("✅ Credit alert test successful!");
    if (creditResult.testMode) {
      console.log("📝 Test mode was ON - check console for message preview");
    } else {
      console.log("📱 Check your phone - SMS should arrive soon!");
    }
  } else {
    console.log("❌ Credit alert test failed:", creditResult.error);
  }

  // Wait 2 seconds
  await new Promise((resolve) => setTimeout(resolve, 2000));

  console.log("\n💸 Testing Debit Alert...");
  console.log("-".repeat(30));
  const debitResult = await sendDebitAlert(
    yourNumber,
    testAmount,
    testBalance,
    testRef,
  );

  if (debitResult.success) {
    console.log("✅ Debit alert test successful!");
  } else {
    console.log("❌ Debit alert test failed:", debitResult.error);
  }

  console.log("\n✅ Test completed!");
}

testSMS();
