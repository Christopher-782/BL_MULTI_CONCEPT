// services/smsService.js - Clean Professional Format
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

// Format currency for SMS
const formatCurrency = (amount) => {
  return amount.toLocaleString("en-NG", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
};

// Clean message for SMS gateway
const cleanMessage = (message) => {
  let cleaned = message;
  cleaned = cleaned.replace(/₦/g, "N");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  cleaned = cleaned.replace(/[^\x20-\x7E\n]/g, "");
  return cleaned;
};

// Format date
const formatDate = () => {
  const now = new Date();
  return now
    .toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    })
    .replace(",", "");
};

// Send SMS function
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

// Credit Alert (Deposit)
const sendCreditAlert = async (
  phone,
  amount,
  balance,
  transactionId = null,
  charges = 0,
) => {
  const formattedAmount = formatCurrency(amount);
  const formattedBalance = formatCurrency(balance);
  const formattedCharges = formatCurrency(charges);
  const date = formatDate();

  let message = `BL MULTI CONCEPT\n\n`;
  message += `CREDIT ALERT\n`;
  message += `Amount: ${formattedAmount}\n`;

  if (charges > 0) {
    message += `charges: N${formattedCharges}\n`;
  }

  message += `Balance: ${formattedBalance}\n`;
  message += `Date: ${date}\n`;
  message += `Ref: ${transactionId || "N/A"}\n\n`;
  message += `Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Debit Alert (Withdrawal)
const sendDebitAlert = async (
  phone,
  amount,
  balance,
  transactionId = null,
  charges = 0,
) => {
  const formattedAmount = formatCurrency(amount);
  const formattedBalance = formatCurrency(balance);
  const formattedCharges = formatCurrency(charges);
  const date = formatDate();

  let message = `BL MULTI CONCEPT\n\n`;
  message += `DEBIT ALERT\n`;
  message += `Amount: ${formattedAmount}\n`;

  if (charges > 0) {
    message += `charges: N${formattedCharges}\n`;
  }

  message += `Balance: ${formattedBalance}\n`;
  message += `Date: ${date}\n`;
  message += `Ref: ${transactionId || "N/A"}\n\n`;
  message += `Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Transaction Status Alert
const sendTransactionAlert = async (
  phone,
  transaction,
  status,
  customerBalance = null,
) => {
  const charges = transaction.charges || 0;
  const amount = transaction.amount;
  const balance = customerBalance;
  const date = formatDate();

  let message = `BL MULTI CONCEPT\n\n`;

  if (status === "approved") {
    if (transaction.type === "deposit") {
      message += `CREDIT ALERT\n`;
    } else {
      message += `DEBIT ALERT\n`;
    }
  } else {
    message += `TRANSACTION ${status.toUpperCase()}\n`;
  }

  message += `Amount: ${formatCurrency(amount)}\n`;

  if (charges > 0) {
    message += `charges: N${formatCurrency(charges)}\n`;
  }

  if (balance !== null) {
    message += `Balance: ${formatCurrency(balance)}\n`;
  }

  message += `Date: ${date}\n`;
  message += `Ref: ${transaction.id}\n\n`;
  message += `Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Simple SMS for general messages
const sendSimpleSMS = async (phone, message) => {
  const fullMessage = `BL MULTI CONCEPT\n\n${message}\n\nThank you for banking with us!`;
  return await sendSMS(phone, fullMessage);
};

// Bulk SMS
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

// Reactivation SMS
const sendReactivationSMS = async (phone, customerName, daysDormant) => {
  const message = `BL MULTI CONCEPT\n\nREACTIVATION OFFER\n\nDear ${customerName},\n\nWe miss you! It's been ${daysDormant} since your last transaction.\n\nSpecial offer: Make a deposit today and get 50% off charges!\n\nLog in to your account to get started.\n\nThank you for banking with us!`;

  return await sendSMS(phone, message);
};

// Test function
const testSMSFormat = () => {
  console.log("\n🧪 Testing SMS Format...");
  console.log("================================================");

  const testAmount = 5000;
  const testBalance = 33500;
  const testCharges = 500;
  const testId = "TXN1774436733684";

  console.log("\n📱 DEBIT ALERT WITH CHARGES:");
  console.log("================================================");
  const debitWithCharges = `BL MULTI CONCEPT

DEBIT ALERT
Amount: 5,000
charges: N500
Balance: 33,500
Date: 3/25/2026, 11:05:50 AM
Ref: TXN1774436733684

Thank you for banking with us!`;
  console.log(debitWithCharges);

  console.log("\n📱 DEBIT ALERT WITHOUT CHARGES:");
  console.log("================================================");
  const debitWithoutCharges = `BL MULTI CONCEPT

DEBIT ALERT
Amount: 5,000
Balance: 33,500
Date: 3/25/2026, 11:05:50 AM
Ref: TXN1774436733684

Thank you for banking with us!`;
  console.log(debitWithoutCharges);

  console.log("\n📱 CREDIT ALERT WITH CHARGES:");
  console.log("================================================");
  const creditWithCharges = `BL MULTI CONCEPT

CREDIT ALERT
Amount: 5,000
charges: N500
Balance: 33,500
Date: 3/25/2026, 11:05:50 AM
Ref: TXN1774436733684

Thank you for banking with us!`;
  console.log(creditWithCharges);
};

module.exports = {
  sendCreditAlert,
  sendDebitAlert,
  sendTransactionAlert,
  sendReactivationSMS,
  sendBulkSMS,
  sendSMS,
  sendSimpleSMS,
  formatPhoneNumber,
  cleanMessage,
  testSMSFormat,
};
