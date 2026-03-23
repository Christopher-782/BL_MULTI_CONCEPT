// services/smsService.js - Add this debug code
const axios = require("axios");
require("dotenv").config();

const BULKSMS_TOKEN = process.env.BULKSMS_TOKEN;

// ✅ ADD THIS DEBUG CODE
console.log("🔧 SMS Service Debug:");
console.log("  - BULKSMS_TOKEN exists:", !!BULKSMS_TOKEN);
console.log("  - BULKSMS_TOKEN length:", BULKSMS_TOKEN?.length || 0);
console.log(
  "  - BULKSMS_TOKEN first 10 chars:",
  BULKSMS_TOKEN ? BULKSMS_TOKEN.substring(0, 10) + "..." : "NOT SET",
);
console.log("  - TEST_MODE:", process.env.TEST_MODE);
// End debug code

const TEST_MODE = false;
// ... rest of your code
// Format Nigerian phone numbers
const formatPhoneNumber = (phone) => {
  if (!phone) return null;

  // Remove all non-numeric characters
  let cleaned = phone.toString().replace(/\D/g, "");

  // Format for Nigeria (BulkSMS expects 234XXXXXXXXXX)
  if (cleaned.startsWith("0")) {
    cleaned = "234" + cleaned.substring(1);
  } else if (cleaned.startsWith("234")) {
    cleaned = cleaned;
  } else if (cleaned.length === 10) {
    cleaned = "234" + cleaned;
  } else if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  return cleaned;
};

// Send SMS function
const sendSMS = async (phone, message) => {
  try {
    const formattedPhone = formatPhoneNumber(phone);

    if (!formattedPhone) {
      console.error("Invalid phone number");
      return { success: false, error: "Invalid phone number" };
    }

    if (TEST_MODE) {
      console.log("📱 SMS TEST MODE (BulkSMS Nigeria)");
      console.log("================================================");
      console.log("To:", formattedPhone);
      console.log("From: VAULTFLOW");
      console.log("Message:", message);
      console.log("================================================");
      console.log("✅ SMS would be sent in production mode");
      return { success: true, testMode: true };
    }

    console.log("📤 Sending real SMS via BulkSMS Nigeria...");
    console.log("To:", formattedPhone);
    console.log("Message length:", message.length);

    // BulkSMS Nigeria API endpoint
    const response = await axios.post(
      "https://www.bulksmsnigeria.com/api/v1/sms/create",
      {
        api_token: BULKSMS_TOKEN,
        from: "BL MULTI CONCEPT", // Your sender name
        to: formattedPhone,
        body: message,
        dnd: 2, // 2 = Don't send to DND numbers
      },
    );

    // Check response
    if (response.data && response.data.status === "success") {
      console.log("✅ SMS sent successfully!");
      console.log("📱 Message ID:", response.data.message_id);
      return { success: true, data: response.data };
    } else {
      console.log("❌ SMS failed:", response.data);
      return {
        success: false,
        error: response.data?.message || "Unknown error",
      };
    }
  } catch (error) {
    console.error("❌ SMS error:", error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

// Send credit alert (deposit)
const sendCreditAlert = async (
  phone,
  amount,
  balance,
  transactionId = null,
) => {
  const formattedAmount = amount.toLocaleString();
  const formattedBalance = balance.toLocaleString();
  const date = new Date().toLocaleString();

  const message = `BL MULTI CONCEPT

✓ CREDIT ALERT
Amount: ₦${formattedAmount}
Balance: ₦${formattedBalance}
Date: ${date}
Ref: ${transactionId || "N/A"}

Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Send debit alert (withdrawal)
const sendDebitAlert = async (phone, amount, balance, transactionId = null) => {
  const formattedAmount = amount.toLocaleString();
  const formattedBalance = balance.toLocaleString();
  const date = new Date().toLocaleString();

  const message = `BL MULTI CONCEPT

✗ DEBIT ALERT
Amount: ₦${formattedAmount}
Balance: ₦${formattedBalance}
Date: ${date}
Ref: ${transactionId || "N/A"}

Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Send transaction status alert
const sendTransactionAlert = async (phone, transaction, status) => {
  const charges = transaction.charges || 0;
  const netAmount =
    transaction.type === "deposit"
      ? transaction.amount - charges
      : transaction.amount + charges;

  const message = `BL MULTI CONCEPT

${status === "approved" ? "✓" : "✗"} TRANSACTION ${status.toUpperCase()}
Type: ${transaction.type.toUpperCase()}
Gross: ₦${transaction.amount.toLocaleString()}
${charges > 0 ? `Charges: ₦${charges.toLocaleString()}\nNet: ₦${netAmount.toLocaleString()}` : ""}
Ref: ${transaction.id}
Date: ${new Date().toLocaleString()}

Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

module.exports = {
  sendCreditAlert,
  sendDebitAlert,
  sendTransactionAlert,
  sendSMS,
  formatPhoneNumber,
};
