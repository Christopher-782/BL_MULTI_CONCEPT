// services/smsService.js - Complete Professional SMS Service
const axios = require("axios");
require("dotenv").config();

const BULKSMS_TOKEN = process.env.BULKSMS_TOKEN;
const TEST_MODE = process.env.TEST_MODE === "true" || false;

// ==================== UTILITY FUNCTIONS ====================

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
  if (amount === undefined || amount === null) return "0";
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
const formatDate = (date = null) => {
  const now = date ? new Date(date) : new Date();
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

// ==================== CORE SMS SENDER ====================

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

// ==================== TRANSACTION ALERTS ====================

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
  message += `CR ALERT\n`;
  message += `Amount: ${formattedAmount}\n`;

  if (charges > 0) {
    message += `Charges: N${formattedCharges}\n`;
  }

  message += `Balance: ${formattedBalance}\n`;
  message += `Date: ${date}\n`;
  message += `Ref: ${transactionId || "N/A"}\n\n`;
  message += `Thank you for trusting us!`;

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
  message += `DR ALERT\n`;
  message += `Amount: ${formattedAmount}\n`;

  if (charges > 0) {
    message += `Charges: N${formattedCharges}\n`;
  }

  message += `Balance: ${formattedBalance}\n`;
  message += `Date: ${date}\n`;
  message += `Ref: ${transactionId || "N/A"}\n\n`;
  message += `Thank you for trusting us!`;

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
      message += `CR ALERT\n`;
    } else {
      message += `DR ALERT\n`;
    }
  } else {
    message += `TRANSACTION ${status.toUpperCase()}\n`;
  }

  message += `Amount: ${formatCurrency(amount)}\n`;

  if (charges > 0) {
    message += `Charges: N${formatCurrency(charges)}\n`;
  }

  if (balance !== null) {
    message += `Balance: ${formatCurrency(balance)}\n`;
  }

  message += `Date: ${date}\n`;
  message += `Ref: ${transaction.id}\n\n`;
  message += `Thank you for trusting us!`;

  return await sendSMS(phone, message);
};

// ==================== LOAN DISBURSEMENT ALERT ====================

const sendLoanDisbursementAlert = async (
  phone,
  amount,
  newBalance,
  loanId,
  interestRate,
  totalPayable,
  numberOfInstallments,
  repaymentPeriod,
  installmentAmount,
) => {
  const formattedAmount = formatCurrency(amount);
  const formattedBalance = formatCurrency(newBalance);
  const formattedTotalPayable = formatCurrency(totalPayable);
  const formattedInstallment = formatCurrency(installmentAmount);
  const date = formatDate();

  let message = `BL MULTI CONCEPT\n\n`;
  message += `LOAN DISBURSEMENT (CR)\n`;
  message += `==========================\n`;
  message += `Loan ID: ${loanId}\n`;
  message += `Amount: N${formattedAmount}\n`;
  message += `Interest Rate: ${interestRate}%\n`;
  message += `Total to Repay: N${formattedTotalPayable}\n`;
  message += `New Balance: N${formattedBalance}\n`;
  message += `Date: ${date}\n\n`;
  message += `Repayment Schedule:\n`;
  message += `- ${numberOfInstallments} ${repaymentPeriod}ly installments\n`;
  message += `- Each installment: N${formattedInstallment}\n\n`;

  message += `Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// ==================== LOAN REPAYMENT CREDIT ALERT ====================

const sendLoanRepaymentCreditAlert = async (
  phone,
  amount,
  principalPortion,
  interestPortion,
  newCashBalance,
  loanId,
  installmentNumber,
  totalInstallments,
) => {
  const formattedAmount = formatCurrency(amount);
  const formattedPrincipal = formatCurrency(principalPortion);
  const formattedInterest = formatCurrency(interestPortion);
  const formattedBalance = formatCurrency(newCashBalance);
  const date = formatDate();

  let message = `BL MULTI CONCEPT\n\n`;
  message += `LOAN REPAYMENT (CR)\n`;
  message += `==========================\n`;
  message += `Loan ID: ${loanId}\n`;
  message += `Installment: ${installmentNumber}/${totalInstallments}\n`;
  message += `Amount Credited: N${formattedAmount}\n`;
  message += `  ↳ Principal: N${formattedPrincipal}\n`;
  message += `  ↳ Interest: N${formattedInterest}\n`;
  message += `New Balance: N${formattedBalance}\n`;
  message += `Date: ${date}\n\n`;
  message += `Thank you for repaying your loan!`;

  return await sendSMS(phone, message);
};

// ==================== LOAN REPAYMENT DEBIT ALERT (Auto-Debit) ====================

const sendLoanRepaymentDebitAlert = async (
  phone,
  amount,
  principalPortion,
  interestPortion,
  remainingBalance,
  loanId,
  installmentNumber,
  totalInstallments,
) => {
  const formattedAmount = formatCurrency(amount);
  const formattedPrincipal = formatCurrency(principalPortion);
  const formattedInterest = formatCurrency(interestPortion);
  const formattedRemaining = formatCurrency(remainingBalance);
  const date = formatDate();

  let message = `BL MULTI CONCEPT\n\n`;
  message += `LOAN REPAYMENT (DR)\n`;
  message += `==========================\n`;
  message += `Loan ID: ${loanId}\n`;
  message += `Installment: ${installmentNumber}/${totalInstallments}\n`;
  message += `Amount Debited: N${formattedAmount}\n`;
  message += `  ↳ Principal: N${formattedPrincipal}\n`;
  message += `  ↳ Interest: N${formattedInterest}\n`;
  message += `Remaining Balance: N${formattedRemaining}\n`;
  message += `Date: ${date}\n\n`;
  message += `Thank you for your payment!`;

  return await sendSMS(phone, message);
};

// ==================== AUTO-DEBIT SUMMARY ALERT ====================

const sendAutoDebitSummary = async (
  phone,
  customerName,
  depositAmount,
  autoDebitAmount,
  netCredit,
  loanDetails,
) => {
  const formattedDeposit = formatCurrency(depositAmount);
  const formattedDebit = formatCurrency(autoDebitAmount);
  const formattedNet = formatCurrency(netCredit);
  const date = formatDate();

  let message = `BL MULTI CONCEPT\n\n`;
  message += `DEPOSIT WITH AUTO-DEBIT\n`;
  message += `===========================\n`;
  message += `Dear ${customerName},\n\n`;
  message += `Deposit Received: N${formattedDeposit}\n`;
  message += `Auto-DR (Loan Repayment): -N${formattedDebit}\n`;
  message += `━━━━━━━━━━━━━━━━━━━━━━\n`;
  message += `Net Credited: N${formattedNet}\n\n`;

  if (loanDetails && loanDetails.length > 0) {
    message += `Loan Repayment Breakdown:\n`;
    loanDetails.forEach((loan, idx) => {
      message += `${idx + 1}. Loan ${loan.loanId}: N${formatCurrency(loan.amount)} (Principal: N${formatCurrency(loan.principal)}, Interest: N${formatCurrency(loan.interest)})\n`;
    });
    message += `\n`;
  }

  message += `Date: ${date}\n\n`;
  message += `Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// ==================== LOAN COMPLETED ALERT ====================

const sendLoanCompletedAlert = async (
  phone,
  customerName,
  loanId,
  totalPaid,
  interestPaid,
) => {
  const formattedTotal = formatCurrency(totalPaid);
  const formattedInterest = formatCurrency(interestPaid);
  const date = formatDate();

  let message = `BL MULTI CONCEPT\n\n`;
  message += `LOAN COMPLETED\n`;
  message += `=================\n`;
  message += `Dear ${customerName},\n\n`;
  message += `Congratulations! Your loan (${loanId}) has been fully repaid.\n\n`;
  message += `Total Paid: N${formattedTotal}\n`;
  message += `Interest Paid: N${formattedInterest}\n`;
  message += `Date: ${date}\n\n`;
  message += `Thank you for your prompt payments!\n\n`;
  message += `You can now apply for a new loan.`;

  return await sendSMS(phone, message);
};

// ==================== LOAN OVERDUE ALERT ====================

const sendLoanOverdueAlert = async (
  phone,
  customerName,
  loanId,
  overdueAmount,
  daysOverdue,
  installmentNumber,
  totalInstallments,
) => {
  const formattedAmount = formatCurrency(overdueAmount);
  const date = formatDate();

  let message = `BL MULTI CONCEPT\n\n`;
  message += `LOAN OVERDUE NOTICE\n`;
  message += `=======================\n`;
  message += `Dear ${customerName},\n\n`;
  message += `Your loan repayment for ${loanId}\n`;
  message += `Installment ${installmentNumber}/${totalInstallments}\n`;
  message += `is now ${daysOverdue} days overdue.\n\n`;
  message += `Amount Due: N${formattedAmount}\n`;
  message += `Date: ${date}\n\n`;
  message += `Please make payment immediately to avoid penalties.\n\n`;
  message += `Thank you for your prompt attention.`;

  return await sendSMS(phone, message);
};

// ==================== LOAN REPAYMENT REMINDER ====================

const sendLoanRepaymentReminder = async (
  phone,
  customerName,
  loanId,
  dueAmount,
  dueDate,
  installmentNumber,
  totalInstallments,
) => {
  const formattedAmount = formatCurrency(dueAmount);
  const formattedDueDate = new Date(dueDate).toLocaleDateString("en-GB");

  let message = `BL MULTI CONCEPT\n\n`;
  message += `LOAN REPAYMENT REMINDER\n`;
  message += `==========================\n`;
  message += `Dear ${customerName},\n\n`;
  message += `Your loan repayment for ${loanId}\n`;
  message += `Installment ${installmentNumber}/${totalInstallments}\n`;
  message += `of N${formattedAmount} is due on ${formattedDueDate}.\n\n`;
  message += `Please ensure sufficient funds in your account for auto-debit.\n\n`;
  message += `Thank you for banking with us!`;

  return await sendSMS(phone, message);
};

// ==================== SIMPLE SMS ====================

const sendSimpleSMS = async (phone, message) => {
  const fullMessage = `BL MULTI CONCEPT\n\n${message}\n\nThank you for trusting us!`;
  return await sendSMS(phone, fullMessage);
};

// ==================== REACTIVATION SMS ====================

const sendReactivationSMS = async (phone, customerName, daysDormant) => {
  const message = `BL MULTI CONCEPT\n\nREACTIVATION OFFER\n\nDear ${customerName},\n\nWe miss you! It's been ${daysDormant} since your last transaction.\n\nSpecial offer: Make a deposit today and get 50% off charges!\n\nLog in to your account to get started.\n\nThank you for banking with us!`;

  return await sendSMS(phone, message);
};

// ==================== BULK SMS ====================

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

// ==================== TEST FUNCTION ====================

const testSMSFormat = () => {
  console.log("\n🧪 Testing SMS Format...");
  console.log("================================================");

  const testAmount = 5000;
  const testBalance = 33500;
  const testCharges = 500;
  const testId = "TXN1774436733684";

  console.log("\n📱 CREDIT ALERT WITH CHARGES:");
  console.log("================================================");
  const creditWithCharges = `BL MULTI CONCEPT

CR ALERT
Amount: 5,000
Charges: N500
Balance: 33,500
Date: 3/25/2026, 11:05:50 AM
Ref: TXN1774436733684

Thank you for trusting us!`;
  console.log(creditWithCharges);

  console.log("\n📱 DEBIT ALERT WITHOUT CHARGES:");
  console.log("================================================");
  const debitWithoutCharges = `BL MULTI CONCEPT

DR ALERT
Amount: 5,000
Balance: 33,500
Date: 3/25/2026, 11:05:50 AM
Ref: TXN1774436733684

Thank you for trusting us!`;
  console.log(debitWithoutCharges);

  console.log("\n📱 LOAN DISBURSEMENT ALERT:");
  console.log("================================================");
  const loanDisbursement = `BL MULTI CONCEPT

🏦 LOAN DISBURSEMENT (CREDIT)
==========================
Loan ID: LOAN123456
Amount: N150,000
Interest Rate: 10%
Total to Repay: N165,000
New Balance: N90,000
Date: 3/28/2026, 10:30:00 AM

Repayment Schedule:
- 4 weekly installments
- Each installment: N41,250

⚠️ Note: 50% of future deposits will be automatically deducted for loan repayment.

Thank you for banking with us!`;
  console.log(loanDisbursement);

  console.log("\n📱 LOAN REPAYMENT CREDIT ALERT:");
  console.log("================================================");
  const loanRepaymentCredit = `BL MULTI CONCEPT

💰 LOAN REPAYMENT (CREDIT)
==========================
Loan ID: LOAN123456
Installment: 1/4
Amount Credited: N41,250
  ↳ Principal: N37,500
  ↳ Interest: N3,750
New Balance: N48,750
Date: 3/28/2026, 10:30:00 AM

Thank you for repaying your loan!`;
  console.log(loanRepaymentCredit);

  console.log("\n📱 LOAN REPAYMENT DEBIT ALERT (Auto-Debit):");
  console.log("================================================");
  const loanRepaymentDebit = `BL MULTI CONCEPT

💰 LOAN REPAYMENT (DEBIT)
==========================
Loan ID: LOAN123456
Installment: 1/4
Amount Debited: N41,250
  ↳ Principal: N37,500
  ↳ Interest: N3,750
Remaining Balance: N123,750
Date: 3/28/2026, 10:30:00 AM

Thank you for your payment!`;
  console.log(loanRepaymentDebit);

  console.log("\n📱 AUTO-DEBIT SUMMARY:");
  console.log("================================================");
  const autoDebitSummary = `BL MULTI CONCEPT

💰 DEPOSIT WITH AUTO-DEBIT
===========================
Dear John Doe,

Deposit Received: N100,000
Auto-Debit (Loan Repayment): -N50,000
━━━━━━━━━━━━━━━━━━━━━━
Net Credited: N50,000

Loan Repayment Breakdown:
1. Loan LOAN001: N30,000 (Principal: N27,500, Interest: N2,500)
2. Loan LOAN002: N20,000 (Principal: N18,000, Interest: N2,000)

Date: 3/28/2026, 10:30:00 AM

Thank you for banking with us!`;
  console.log(autoDebitSummary);

  console.log("\n📱 LOAN COMPLETED ALERT:");
  console.log("================================================");
  const loanCompleted = `BL MULTI CONCEPT

✅ LOAN COMPLETED
=================
Dear John Doe,

Congratulations! Your loan (LOAN123456) has been fully repaid.

Total Paid: N165,000
Interest Paid: N15,000
Date: 3/28/2026, 10:30:00 AM

Thank you for your prompt payments!

You can now apply for a new loan.`;
  console.log(loanCompleted);

  console.log("\n📱 LOAN OVERDUE ALERT:");
  console.log("================================================");
  const loanOverdue = `BL MULTI CONCEPT

⚠️ LOAN OVERDUE NOTICE
=======================
Dear John Doe,

Your loan repayment for LOAN123456
Installment 2/4
is now 5 days overdue.

Amount Due: N41,250
Date: 3/28/2026, 10:30:00 AM

Please make payment immediately to avoid penalties.

Thank you for your prompt attention.`;
  console.log(loanOverdue);

  console.log("\n📱 LOAN REPAYMENT REMINDER:");
  console.log("================================================");
  const loanReminder = `BL MULTI CONCEPT

🔔 LOAN REPAYMENT REMINDER
==========================
Dear John Doe,

Your loan repayment for LOAN123456
Installment 2/4
of N41,250 is due on 4/4/2026.

Please ensure sufficient funds in your account for auto-debit.

Thank you for banking with us!`;
  console.log(loanReminder);

  console.log("\n✅ SMS Format Test Complete!");
};

// ==================== EXPORTS ====================

module.exports = {
  // Core
  sendSMS,
  formatPhoneNumber,
  cleanMessage,
  formatCurrency,
  formatDate,

  // Transaction alerts
  sendCreditAlert,
  sendDebitAlert,
  sendTransactionAlert,

  // Loan alerts
  sendLoanDisbursementAlert,
  sendLoanRepaymentCreditAlert,
  sendLoanRepaymentDebitAlert,
  sendAutoDebitSummary,
  sendLoanCompletedAlert,
  sendLoanOverdueAlert,
  sendLoanRepaymentReminder,

  // Utility
  sendSimpleSMS,
  sendReactivationSMS,
  sendBulkSMS,

  // Test
  testSMSFormat,
};
