// services/smsService.js - Using Bearer Token
const axios = require("axios");

// Get environment variables
const BEARER_TOKEN = process.env.BULKSMS_BEARER_TOKEN;
const SENDER_ID = process.env.BULKSMS_SENDER_ID || "BL MULTI CONCEPT";

// Format Nigerian phone numbers
const formatPhoneNumber = (phone) => {
  if (!phone) return null;

  // Remove all non-numeric characters
  let cleaned = phone.toString().replace(/\D/g, "");

  // Format for Nigeria (234XXXXXXXXXX)
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

// Send SMS function
const sendSMS = async (phone, message) => {
  try {
    const formattedPhone = formatPhoneNumber(phone);

    if (!formattedPhone) {
      console.error("❌ Invalid phone number:", phone);
      return { success: false, error: "Invalid phone number" };
    }

    if (!BEARER_TOKEN) {
      console.error(
        "❌ BULKSMS_BEARER_TOKEN not found in environment variables",
      );
      return { success: false, error: "SMS service not configured" };
    }

    console.log("📤 Sending SMS via BulkSMS Nigeria (Bearer Token)...");
    console.log("To:", formattedPhone);
    console.log("From:", SENDER_ID);
    console.log("Message:", message.substring(0, 50) + "...");

    // Send using Bearer Token
    const response = await axios.post(
      "https://www.bulksmsnigeria.com/api/v2/sms/create",
      {
        from: SENDER_ID,
        to: formattedPhone,
        body: message,
        gateway: "direct",
        dnd: 2,
      },
      {
        headers: {
          Authorization: `Bearer ${BEARER_TOKEN}`,
          "Content-Type": "application/json",
        },
        timeout: 30000,
      },
    );

    console.log("📊 API Response:", JSON.stringify(response.data, null, 2));

    // Check if successful
    if (
      response.data.status === "success" ||
      response.data.code === "BSNG-0000"
    ) {
      console.log("✅ SMS sent successfully!");
      console.log("📱 Message ID:", response.data.data?.message_id);
      return {
        success: true,
        messageId: response.data.data?.message_id,
        data: response.data,
      };
    } else {
      console.log("❌ SMS failed:", response.data);
      return {
        success: false,
        error: response.data.message || "Unknown error",
        data: response.data,
      };
    }
  } catch (error) {
    console.error("❌ SMS Error:");
    if (error.response) {
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
    } else {
      console.error("Message:", error.message);
    }
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

  const message = `VAULTFLOW

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

  const message = `VAULTFLOW

✗ DEBIT ALERT
Amount: ₦${formattedAmount}
Balance: ₦${formattedBalance}
Date: ${date}
Ref: ${transactionId || "N/A"}

Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Export functions
module.exports = {
  sendCreditAlert,
  sendDebitAlert,
  sendSMS,
  formatPhoneNumber,
};
