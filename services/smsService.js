// services/smsService.js - With Debug Logging
const axios = require("axios");
require("dotenv").config();

const BULKSMS_TOKEN = process.env.BULKSMS_TOKEN;
const SENDER_ID = process.env.BULKSMS_SENDER_ID || "BL MULTI CONCEPT";
const TEST_MODE = false;

console.log("🔧 SMS Service Initialized:");
console.log("  - BULKSMS_TOKEN exists:", !!BULKSMS_TOKEN);
console.log("  - BULKSMS_TOKEN length:", BULKSMS_TOKEN?.length || 0);
console.log("  - SENDER_ID:", SENDER_ID);
console.log("  - TEST_MODE:", TEST_MODE);

const formatPhoneNumber = (phone) => {
  if (!phone) return null;
  let cleaned = phone.toString().replace(/\D/g, "");
  if (cleaned.startsWith("0")) {
    cleaned = "234" + cleaned.substring(1);
  } else if (cleaned.length === 10) {
    cleaned = "234" + cleaned;
  } else if (cleaned.startsWith("234") && cleaned.length === 12) {
    cleaned = cleaned;
  } else if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }
  return cleaned;
};

const sendSMS = async (phone, message) => {
  console.log("\n📱 ===== SEND SMS CALLED =====");
  console.log("Time:", new Date().toISOString());

  try {
    const formattedPhone = formatPhoneNumber(phone);
    console.log("Original phone:", phone);
    console.log("Formatted phone:", formattedPhone);

    if (!formattedPhone) {
      console.error("❌ Invalid phone number");
      return { success: false, error: "Invalid phone number" };
    }

    if (!BULKSMS_TOKEN) {
      console.error("❌ BULKSMS_TOKEN is missing!");
      return { success: false, error: "SMS service not configured" };
    }

    console.log("📤 Sending to BulkSMS Nigeria API...");
    console.log("URL: https://www.bulksmsnigeria.com/api/v1/sms/create");
    console.log("Params:", {
      api_token: "***" + BULKSMS_TOKEN.slice(-4),
      from: SENDER_ID,
      to: formattedPhone,
      body: message.substring(0, 50) + "...",
      dnd: 2,
    });

    // Try with axios (GET method)
    const response = await axios.get(
      "https://www.bulksmsnigeria.com/api/v1/sms/create",
      {
        params: {
          api_token: BULKSMS_TOKEN,
          from: SENDER_ID,
          to: formattedPhone,
          body: message,
          dnd: 2,
        },
        timeout: 30000, // 30 second timeout
      },
    );

    console.log("📊 API Response Status:", response.status);
    console.log(
      "📊 API Response Data:",
      JSON.stringify(response.data, null, 2),
    );

    if (response.data) {
      if (response.data.status === "success" || response.data.message_id) {
        console.log("✅ SMS sent successfully!");
        return { success: true, data: response.data };
      } else {
        console.log("❌ API returned error:", response.data);
        return { success: false, error: response.data.message || "API error" };
      }
    }
  } catch (error) {
    console.error("❌ SMS Error Details:");
    if (error.code === "ECONNABORTED") {
      console.error("  - Timeout: Connection took too long");
    }
    if (error.response) {
      console.error("  - Status:", error.response.status);
      console.error("  - Headers:", error.response.headers);
      console.error("  - Data:", error.response.data);
    } else if (error.request) {
      console.error("  - No response received from API");
      console.error("  - Request was made but no response");
    } else {
      console.error("  - Error:", error.message);
    }
    console.error("  - Full error:", error);

    return { success: false, error: error.message };
  }
};

// Export functions...
module.exports = {
  sendCreditAlert: async (phone, amount, balance, transactionId) => {
    const message = `VAULTFLOW\n\n✓ CREDIT ALERT\nAmount: ₦${amount.toLocaleString()}\nBalance: ₦${balance.toLocaleString()}\nRef: ${transactionId || "N/A"}\n\nThank you!`;
    return await sendSMS(phone, message);
  },
  sendDebitAlert: async (phone, amount, balance, transactionId) => {
    const message = `VAULTFLOW\n\n✗ DEBIT ALERT\nAmount: ₦${amount.toLocaleString()}\nBalance: ₦${balance.toLocaleString()}\nRef: ${transactionId || "N/A"}\n\nThank you!`;
    return await sendSMS(phone, message);
  },
  sendSMS,
};
