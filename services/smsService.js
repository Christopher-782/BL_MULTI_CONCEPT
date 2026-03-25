// services/smsService.js - Updated with proper "N" currency display
const axios = require("axios");
require("dotenv").config();

const BULKSMS_TOKEN = process.env.BULKSMS_TOKEN;
const TEST_MODE = process.env.TEST_MODE === "true" || false;

// Format Nigerian phone numbers
const formatPhoneNumber = (phone) => {
  if (!phone) return null;

  let cleaned = phone.toString().replace(/\D/g, "");

  if (cleaned.startsWith("0")) {
    cleaned = "234" + cleaned.substring(1);
  } else if (cleaned.startsWith("234")) {
    cleaned = cleaned;
  } else if (cleaned.length === 10) {
    cleaned = "234" + cleaned;
  } else if (cleaned.length === 11 && cleaned.startsWith("0")) {
    cleaned = "234" + cleaned.substring(1);
  } else if (cleaned.startsWith("+")) {
    cleaned = cleaned.substring(1);
  }

  if (!cleaned.startsWith("234") || cleaned.length !== 13) {
    console.warn(
      `⚠️ Invalid Nigerian phone number format: ${phone} -> ${cleaned}`,
    );
    return null;
  }

  return cleaned;
};

// Format currency for SMS - Ensure "N" appears before amount
const formatCurrencyForSMS = (amount) => {
  // Format with commas and add "N" prefix
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `N${formatted}`;
};

// Clean message to ensure compatibility with SMS gateway
const cleanMessage = (message) => {
  // Ensure "N" is properly placed before amounts
  let cleaned = message;

  // Remove any existing ₦ symbol
  cleaned = cleaned.replace(/₦/g, "");

  // Ensure N is properly formatted (no spaces after N)
  cleaned = cleaned.replace(/N\s+(\d)/g, "N$1");

  // Ensure proper spacing
  cleaned = cleaned.replace(/\s+/g, " ").trim();

  // Convert to ASCII only
  cleaned = cleaned.replace(/[^\x20-\x7E\n]/g, "");

  return cleaned;
};

// Send SMS function with proper encoding
const sendSMS = async (phone, message) => {
  try {
    const formattedPhone = formatPhoneNumber(phone);

    if (!formattedPhone) {
      console.error("❌ Invalid phone number:", phone);
      return { success: false, error: "Invalid phone number" };
    }

    const cleanMsg = cleanMessage(message);
    const messageLength = cleanMsg.length;
    console.log(`📝 Message length: ${messageLength} characters`);

    if (TEST_MODE) {
      console.log("\n📱 SMS TEST MODE (BulkSMS Nigeria)");
      console.log("================================================");
      console.log("To:", formattedPhone);
      console.log("From: BL MULTI CONCEPT");
      console.log("Message:");
      console.log(cleanMsg);
      console.log("Message length:", messageLength);
      console.log("================================================\n");
      console.log("✅ SMS would be sent in production mode");
      return { success: true, testMode: true, message: cleanMsg };
    }

    console.log("📤 Sending real SMS via BulkSMS Nigeria...");
    console.log("To:", formattedPhone);
    console.log("Message length:", messageLength);

    const postData = {
      api_token: BULKSMS_TOKEN,
      from: "BL MULTI CONCEPT",
      to: formattedPhone,
      body: cleanMsg,
      dnd: 2,
    };

    const response = await axios.post(
      "https://www.bulksmsnigeria.com/api/v1/sms/create",
      postData,
      {
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        timeout: 30000,
      },
    );

    if (response.data && response.data.status === "success") {
      console.log("✅ SMS sent successfully!");
      console.log("📱 Message ID:", response.data.message_id);
      return { success: true, data: response.data };
    } else {
      console.log("❌ SMS failed:", response.data);
      return {
        success: false,
        error: response.data?.message || "Unknown error",
        response: response.data,
      };
    }
  } catch (error) {
    console.error("❌ SMS error:", error.response?.data || error.message);
    return {
      success: false,
      error: error.message,
      details: error.response?.data,
    };
  }
};

// Send credit alert (deposit) - With "N" currency symbol
const sendCreditAlert = async (
  phone,
  amount,
  balance,
  transactionId = null,
  charges = 0,
) => {
  const netAmount = amount - charges;

  // Format using "N" prefix
  const formattedAmount = formatCurrencyForSMS(amount);
  const formattedBalance = formatCurrencyForSMS(balance);
  const formattedCharges = charges > 0 ? formatCurrencyForSMS(charges) : null;
  const formattedNetAmount = formatCurrencyForSMS(netAmount);
  const date = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  let message = `BL MULTI CONCEPT\n\n`;
  message += `CREDIT ALERT\n`;
  message += `Amount: ${formattedAmount}\n`;

  if (charges > 0) {
    message += `Charges: ${formattedCharges}\n`;
    message += `Net: ${formattedNetAmount}\n`;
  }

  message += `Balance: ${formattedBalance}\n`;
  message += `Date: ${date}\n`;
  message += `Ref: ${transactionId || "N/A"}\n\n`;
  message += `Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Send debit alert (withdrawal) - With "N" currency symbol
const sendDebitAlert = async (
  phone,
  amount,
  balance,
  transactionId = null,
  charges = 0,
) => {
  const netAmount = amount + charges;

  // Format using "N" prefix
  const formattedAmount = formatCurrencyForSMS(amount);
  const formattedBalance = formatCurrencyForSMS(balance);
  const formattedCharges = charges > 0 ? formatCurrencyForSMS(charges) : null;
  const formattedNetAmount = formatCurrencyForSMS(netAmount);
  const date = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  let message = `BL MULTI CONCEPT\n\n`;
  message += `DEBIT ALERT\n`;
  message += `Amount: ${formattedAmount}\n`;

  if (charges > 0) {
    message += `Charges: ${formattedCharges}\n`;
    message += `Net: ${formattedNetAmount}\n`;
  }

  message += `Balance: ${formattedBalance}\n`;
  message += `Date: ${date}\n`;
  message += `Ref: ${transactionId || "N/A"}\n\n`;
  message += `Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Send transaction status alert
const sendTransactionAlert = async (
  phone,
  transaction,
  status,
  customerBalance = null,
) => {
  const charges = transaction.charges || 0;
  const netAmount =
    transaction.type === "deposit"
      ? transaction.amount - charges
      : transaction.amount + charges;

  const formattedAmount = formatCurrencyForSMS(transaction.amount);
  const formattedCharges = charges > 0 ? formatCurrencyForSMS(charges) : null;
  const formattedNetAmount = formatCurrencyForSMS(netAmount);
  const formattedBalance =
    customerBalance !== null ? formatCurrencyForSMS(customerBalance) : null;
  const date = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  let message = `BL MULTI CONCEPT\n\n`;
  message += `${status === "approved" ? "✓" : "✗"} TRANSACTION ${status.toUpperCase()}\n`;
  message += `Type: ${transaction.type.toUpperCase()}\n`;
  message += `Amount: ${formattedAmount}\n`;

  if (charges > 0) {
    message += `Charges: ${formattedCharges}\n`;
    message += `Net: ${formattedNetAmount}\n`;
  }

  if (formattedBalance) {
    message += `Balance: ${formattedBalance}\n`;
  }

  message += `Ref: ${transaction.id}\n`;
  message += `Date: ${date}\n\n`;
  message += `Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Send bulk SMS to multiple recipients
const sendBulkSMS = async (recipients, message) => {
  const results = [];
  const cleanMsg = cleanMessage(message);

  for (const recipient of recipients) {
    const result = await sendSMS(recipient.phone, cleanMsg);
    results.push({
      phone: recipient.phone,
      name: recipient.name,
      success: result.success,
      error: result.error,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  const successCount = results.filter((r) => r.success).length;
  const failCount = results.filter((r) => !r.success).length;

  console.log(
    `📊 Bulk SMS completed: ${successCount} sent, ${failCount} failed`,
  );

  return {
    success: successCount > 0,
    total: recipients.length,
    successCount,
    failCount,
    results,
  };
};

// Send dormant customer reactivation SMS
const sendReactivationSMS = async (phone, customerName, daysDormant) => {
  const message = `BL MULTI CONCEPT\n\nREACTIVATION OFFER\n\nDear ${customerName},\n\nWe miss you! It's been ${daysDormant} since your last transaction.\n\nSpecial offer: Make a deposit today and get 50% off charges!\n\nLog in to your account to get started.\n\nThank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Test function to verify SMS formatting
const testSMSFormat = () => {
  console.log("\n🧪 Testing SMS Format...");
  console.log("================================================");

  const testAmount = 5000;
  const testBalance = 33500;
  const testCharges = 0;
  const testId = "TXN1774436733684";

  const formattedAmount = formatCurrencyForSMS(testAmount);
  const formattedBalance = formatCurrencyForSMS(testBalance);

  console.log("Formatted Amount:", formattedAmount);
  console.log("Formatted Balance:", formattedBalance);

  const testMessage = `BL MULTI CONCEPT\n\nDEBIT ALERT\nAmount: ${formattedAmount}\nBalance: ${formattedBalance}\nDate: ${new Date().toLocaleString()}\nRef: ${testId}\n\nThank you for banking with us!`;

  console.log("\nExpected SMS Output:");
  console.log(testMessage);
  console.log("\n================================================\n");

  return testMessage;
};

module.exports = {
  sendCreditAlert,
  sendDebitAlert,
  sendTransactionAlert,
  sendReactivationSMS,
  sendBulkSMS,
  sendSMS,
  formatPhoneNumber,
  formatCurrencyForSMS,
  cleanMessage,
  testSMSFormat,
};
