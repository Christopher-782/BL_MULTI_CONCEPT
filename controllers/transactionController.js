// transactionController.js - Fixed Version with Loan Support
const Transaction = require("../models/transaction");
const Customer = require("../models/customer");
const Loan = require("../models/loan"); // Add Loan model import

// ✅ IMPORT SMS SERVICE
const {
  sendCreditAlert,
  sendDebitAlert,
  sendSMS,
  sendLoanDisbursementAlert,
  sendLoanRepaymentCreditAlert,
  sendLoanRepaymentDebitAlert,
  sendAutoDebitSummary,
  sendLoanCompletedAlert,
} = require("../services/smsService");

// Import auto-debit function
const { processAutoDebitForLoan } = require("./loanController");

exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    console.error("Get all transactions error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionsByStatus = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: req.params.status });
    res.json(transactions);
  } catch (error) {
    console.error("Get transactions by status error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    console.log("Creating transaction with data:", req.body);

    const customer = await Customer.findOne({ id: req.body.customerId });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const txnId = "TXN" + Date.now();
    const charges = req.body.charges || 0;

    // Handle different transaction types
    let netAmount;
    switch (req.body.type) {
      case "deposit":
        netAmount = req.body.amount - charges;
        break;
      case "withdrawal":
        netAmount = req.body.amount + charges;
        break;
      case "loan_disbursement":
        netAmount = req.body.amount; // Positive - customer receives money
        break;
      case "loan_repayment":
      case "loan_repayment_auto":
        netAmount = req.body.amount; // Positive amount, but will be deducted
        break;
      default:
        netAmount = req.body.amount;
    }

    const transactionData = {
      id: txnId,
      transactionId: txnId,
      customerId: req.body.customerId,
      customerName: req.body.customerName,
      customerPhone: customer.phone || null,
      type: req.body.type,
      amount: req.body.amount,
      charges: charges,
      netAmount: netAmount,
      principalPortion: req.body.principalPortion || 0,
      interestPortion: req.body.interestPortion || 0,
      description: req.body.description || "",
      status: "pending",
      requestedBy: req.body.requestedBy || "Customer",
      requestedAt: req.body.requestedAt || new Date(),
      date: new Date(),
    };

    const transaction = new Transaction(transactionData);
    await transaction.save();

    console.log(`✅ Transaction created: ${txnId} for ${customer.name}`);

    res.status(201).json(transaction);
  } catch (error) {
    console.error("Create transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.updateTransactionStatus = async (req, res) => {
  try {
    const { status, approvedBy } = req.body;

    console.log(
      `🔄 Updating transaction ${req.params.id} to status: ${status}`,
    );

    const currentTransaction = await Transaction.findOne({ id: req.params.id });
    if (!currentTransaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const charges = currentTransaction.charges || 0;
    const netAmount = currentTransaction.netAmount || currentTransaction.amount;

    // 🔒 Check withdrawal balance BEFORE approval
    if (status === "approved" && currentTransaction.type === "withdrawal") {
      const customer = await Customer.findOne({
        id: currentTransaction.customerId,
      });

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      const availableBalance =
        customer.cashBalance !== undefined
          ? customer.cashBalance
          : customer.balance || 0;

      if (availableBalance < netAmount) {
        const rejectedTransaction = await Transaction.findOneAndUpdate(
          { id: req.params.id },
          {
            status: "rejected",
            approvedBy: "System - Insufficient Funds",
            processedAt: new Date(),
          },
          { returnDocument: "after" },
        );

        console.log(`❌ Transaction rejected: Insufficient funds`);

        if (customer.phone) {
          try {
            const rejectionMessage = `BL MULTI CONCEPT

❌ TRANSACTION REJECTED
Type: ${currentTransaction.type.toUpperCase()}
Amount: ₦${(currentTransaction.amount || 0).toLocaleString()}
${charges > 0 ? `Charges: ₦${charges.toLocaleString()}` : ""}
Reason: Insufficient funds
Date: ${new Date().toLocaleString()}
Ref: ${currentTransaction.id}

Please ensure you have sufficient balance.`;

            await sendSMS(customer.phone, rejectionMessage);
          } catch (smsError) {
            console.error("Rejection SMS failed:", smsError.message);
          }
        }

        return res.status(400).json({
          error: "Insufficient funds for withdrawal including charges",
          transaction: rejectedTransaction,
        });
      }
    }

    // ✅ Update transaction status
    const updateData = {
      status,
      approvedBy,
      processedAmount: netAmount,
      processedAt: new Date(),
    };

    const transaction = await Transaction.findOneAndUpdate(
      { id: req.params.id },
      updateData,
      { returnDocument: "after" },
    );

    // 🚀 HANDLE APPROVAL
    if (status === "approved") {
      const customer = await Customer.findOne({ id: transaction.customerId });
      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      const oldBalance =
        customer.cashBalance !== undefined
          ? customer.cashBalance
          : customer.balance || 0;

      let newBalance = oldBalance;
      let autoDebitResult = null;

      // 💰 UPDATE BALANCE BASED ON TRANSACTION TYPE
      switch (transaction.type) {
        case "deposit":
          newBalance = oldBalance + netAmount;
          await Customer.findOneAndUpdate(
            { id: transaction.customerId },
            {
              $set: {
                cashBalance: newBalance,
                balance: newBalance,
                lastActive: new Date(),
              },
            },
          );
          console.log(`💰 Deposit: Added ₦${netAmount} to ${customer.name}`);

          // Process auto-debit for loan repayments
          autoDebitResult = await processAutoDebitForLoan(
            transaction.customerId,
            netAmount,
            transaction.id,
          );

          if (autoDebitResult && autoDebitResult.debited) {
            const updatedCustomer = await Customer.findOne({
              id: transaction.customerId,
            });
            newBalance = updatedCustomer.cashBalance;
            console.log(
              `💰 Auto-Debit: Deducted ₦${autoDebitResult.totalDebited.toLocaleString()} for loan repayment`,
            );
          }
          break;

        case "withdrawal":
          newBalance = oldBalance - netAmount;
          await Customer.findOneAndUpdate(
            { id: transaction.customerId },
            {
              $set: {
                cashBalance: newBalance,
                balance: newBalance,
                lastActive: new Date(),
              },
            },
          );
          console.log(
            `💰 Withdrawal: Deducted ₦${netAmount} from ${customer.name}`,
          );
          break;

        case "loan_disbursement":
          // LOAN DISBURSEMENT - ADD MONEY TO CUSTOMER
          newBalance = oldBalance + netAmount;
          await Customer.findOneAndUpdate(
            { id: transaction.customerId },
            {
              $set: {
                cashBalance: newBalance,
                balance: newBalance,
                lastActive: new Date(),
              },
              $inc: {
                loanBalance: netAmount,
                totalLoanAmount: netAmount,
              },
            },
          );
          console.log(
            `💰 Loan Disbursement: Added ₦${netAmount} to ${customer.name}`,
          );
          break;

        case "loan_repayment":
        case "loan_repayment_auto":
          // LOAN REPAYMENT - DEDUCT MONEY FROM CUSTOMER
          if (oldBalance < netAmount) {
            return res.status(400).json({
              error: "Insufficient funds for loan repayment",
              balance: oldBalance,
              required: netAmount,
            });
          }
          newBalance = oldBalance - netAmount;
          await Customer.findOneAndUpdate(
            { id: transaction.customerId },
            {
              $set: {
                cashBalance: newBalance,
                balance: newBalance,
                lastActive: new Date(),
              },
              $inc: {
                loanBalance: -(transaction.principalPortion || netAmount),
              },
            },
          );
          console.log(
            `💰 Loan Repayment: Deducted ₦${netAmount} from ${customer.name}`,
          );
          break;

        default:
          console.log(`⚠️ Unknown transaction type: ${transaction.type}`);
      }

      console.log(
        `✅ Customer ${customer.name} balance updated: ₦${oldBalance.toLocaleString()} → ₦${newBalance.toLocaleString()}`,
      );

      // 📱 SEND SMS (NON-BLOCKING)
      if (customer.phone) {
        try {
          switch (transaction.type) {
            case "deposit":
              if (autoDebitResult && autoDebitResult.debited) {
                await sendAutoDebitSummary(
                  customer.phone,
                  customer.name,
                  netAmount,
                  autoDebitResult.totalDebited,
                  newBalance,
                  autoDebitResult.details,
                );
              } else {
                await sendCreditAlert(
                  customer.phone,
                  netAmount,
                  newBalance,
                  transaction.id,
                  charges,
                );
              }
              break;

            case "withdrawal":
              await sendDebitAlert(
                customer.phone,
                netAmount,
                newBalance,
                transaction.id,
                charges,
              );
              break;

            case "loan_disbursement":
              // Get loan details for SMS
              const loan =
                (await Loan.findOne({ id: transaction.relatedLoanId })) ||
                (await Loan.findOne({
                  id: transaction.description?.match(/LOAN\d+/)?.[0],
                }));
              if (loan) {
                await sendLoanDisbursementAlert(
                  customer.phone,
                  loan.amount,
                  newBalance,
                  loan.id,
                  loan.interestRate,
                  loan.totalPayable,
                  loan.numberOfInstallments,
                  loan.repaymentPeriod,
                  loan.installmentAmount,
                );
              } else {
                await sendCreditAlert(
                  customer.phone,
                  netAmount,
                  newBalance,
                  transaction.id,
                  charges,
                );
              }
              break;

            case "loan_repayment":
              await sendLoanRepaymentCreditAlert(
                customer.phone,
                netAmount,
                transaction.principalPortion || netAmount,
                transaction.interestPortion || 0,
                newBalance,
                transaction.relatedLoanId || "N/A",
                transaction.installmentNumber || 1,
                transaction.totalInstallments || 1,
              );
              break;

            case "loan_repayment_auto":
              await sendLoanRepaymentDebitAlert(
                customer.phone,
                netAmount,
                transaction.principalPortion || netAmount,
                transaction.interestPortion || 0,
                newBalance,
                transaction.relatedLoanId || "N/A",
                transaction.installmentNumber || 1,
                transaction.totalInstallments || 1,
              );
              break;
          }
        } catch (smsError) {
          console.error(
            "❌ SMS failed but transaction successful:",
            smsError.message,
          );
        }
      } else {
        console.log(`⚠️ No phone number for customer ${customer.name}`);
      }

      return res.json({
        ...transaction.toObject(),
        updatedCustomerBalance: newBalance,
        netAmount: netAmount,
        charges: charges,
        autoDebit: autoDebitResult,
        smsSent: customer.phone ? true : false,
      });
    }

    // Handle rejection
    if (status === "rejected") {
      const customer = await Customer.findOne({ id: transaction.customerId });
      if (customer && customer.phone) {
        try {
          const amount = transaction.amount || currentTransaction.amount || 0;
          const txnCharges =
            transaction.charges || currentTransaction.charges || 0;

          const rejectionMessage = `BL MULTI CONCEPT

❌ TRANSACTION REJECTED
Type: ${(transaction.type || currentTransaction.type).toUpperCase()}
Amount: ₦${amount.toLocaleString()}
${txnCharges > 0 ? `Charges: ₦${txnCharges.toLocaleString()}` : ""}
Reason: ${approvedBy || "Not approved"}
Date: ${new Date().toLocaleString()}
Ref: ${transaction.id}

Contact support for more information.`;

          await sendSMS(customer.phone, rejectionMessage);
          console.log(`📱 Rejection SMS sent to ${customer.phone}`);
        } catch (smsError) {
          console.error("Rejection SMS failed:", smsError.message);
        }
      }
    }

    res.json(transaction);
  } catch (error) {
    console.error("❌ Update transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get transactions by customer
exports.getTransactionsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const transactions = await Transaction.find({ customerId }).sort({
      createdAt: -1,
    });
    res.json(transactions);
  } catch (error) {
    console.error("Get transactions by customer error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get transaction by ID
exports.getTransactionById = async (req, res) => {
  try {
    const { id } = req.params;
    const transaction = await Transaction.findOne({ id: id });

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    res.json(transaction);
  } catch (error) {
    console.error("Get transaction by ID error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get transaction statistics
exports.getTransactionStatistics = async (req, res) => {
  try {
    const stats = await Transaction.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalCharges: { $sum: "$charges" },
        },
      },
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const dailyTotal = await Transaction.aggregate([
      {
        $match: {
          createdAt: { $gte: today },
          status: "approved",
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$netAmount" },
          totalCharges: { $sum: "$charges" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      statusBreakdown: stats,
      today: {
        total: dailyTotal[0]?.total || 0,
        charges: dailyTotal[0]?.totalCharges || 0,
        count: dailyTotal[0]?.count || 0,
      },
    });
  } catch (error) {
    console.error("Get transaction statistics error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Test SMS endpoint
exports.testSMS = async (req, res) => {
  try {
    const { phone, type = "credit" } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number required" });
    }

    const testAmount = 1000;
    const testBalance = 5000;
    const testRef = "TEST" + Date.now();

    if (type === "credit") {
      const result = await sendCreditAlert(
        phone,
        testAmount,
        testBalance,
        testRef,
      );
      res.json({ message: "Test credit alert sent", result });
    } else if (type === "debit") {
      const result = await sendDebitAlert(
        phone,
        testAmount,
        testBalance,
        testRef,
      );
      res.json({ message: "Test debit alert sent", result });
    } else if (type === "loan_disbursement") {
      const result = await sendLoanDisbursementAlert(
        phone,
        50000,
        90000,
        "LOAN001",
        10,
        55000,
        4,
        "weekly",
        13750,
      );
      res.json({ message: "Test loan disbursement alert sent", result });
    } else {
      res.status(400).json({ error: "Invalid test type" });
    }
  } catch (error) {
    console.error("Test SMS error:", error);
    res.status(500).json({ error: error.message });
  }
};
