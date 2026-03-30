const Transaction = require("../models/transaction");
const Customer = require("../models/customer");
const smsService = require("../services/smsService"); // ADD THIS IMPORT

// Create transaction (deposit/withdrawal)
exports.createTransaction = async (req, res) => {
  try {
    const {
      customerId,
      customerName,
      customerPhone,
      type,
      amount,
      charges,
      netAmount,
      description,
      requestedBy,
    } = req.body;

    // Validation
    if (!customerId || !amount || !type) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // Find customer
    const customer = await Customer.findOne({ id: customerId });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Check balance for withdrawals
    if (type === "withdrawal") {
      const availableBalance = customer.cashBalance || customer.balance || 0;
      const totalDeduction = netAmount;

      if (totalDeduction > availableBalance) {
        return res.status(400).json({
          error: "Insufficient funds",
          availableBalance,
          requestedAmount: totalDeduction,
          shortfall: totalDeduction - availableBalance,
        });
      }
    }

    // Create transaction
    const transaction = new Transaction({
      id: "TXN" + Date.now() + Math.random().toString(36).substr(2, 4),
      customerId,
      customerName,
      customerPhone,
      type,
      amount: Number(amount),
      charges: Number(charges) || 0,
      netAmount: Number(netAmount),
      description: description || "",
      status: "pending",
      requestedBy: requestedBy || "System",
      requestedAt: new Date(),
      date: new Date(),
    });

    await transaction.save();

    res.status(201).json({
      success: true,
      message: "Transaction request submitted successfully",
      transaction: {
        id: transaction.id,
        customerName: transaction.customerName,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
      },
    });
  } catch (error) {
    console.error("Create transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Approve transaction - WITH SMS ALERTS FIXED
exports.approveTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { approvedBy } = req.body;

    const transaction = await Transaction.findOne({ id: transactionId });
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ error: "Transaction already processed" });
    }

    const customer = await Customer.findOne({ id: transaction.customerId });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const charges = transaction.charges || 0;
    const netAmount = transaction.netAmount || transaction.amount - charges;

    // Calculate new balance based on transaction type
    let newBalance;
    let balanceChange;

    if (transaction.type === "deposit") {
      // For deposits: add net amount to balance
      newBalance = (customer.cashBalance || 0) + netAmount;
      balanceChange = +netAmount;
    } else if (transaction.type === "withdrawal") {
      // For withdrawals: subtract net amount from balance
      newBalance = (customer.cashBalance || 0) - netAmount;
      balanceChange = -netAmount;

      // Double-check sufficient funds
      if (newBalance < 0) {
        return res.status(400).json({
          error: "Insufficient funds for withdrawal",
          currentBalance: customer.cashBalance,
          requestedAmount: netAmount,
        });
      }
    } else {
      return res.status(400).json({ error: "Invalid transaction type" });
    }

    // Update transaction status
    transaction.status = "approved";
    transaction.approvedBy = approvedBy?.name || "Admin";
    transaction.approvedAt = new Date();
    transaction.finalBalance = newBalance;

    await transaction.save();

    // Update customer balance
    await Customer.findOneAndUpdate(
      { id: transaction.customerId },
      {
        $set: {
          cashBalance: newBalance,
          balance: newBalance, // Legacy field
        },
        $inc: {
          totalTransactions: 1,
          totalDeposits: transaction.type === "deposit" ? netAmount : 0,
          totalWithdrawals: transaction.type === "withdrawal" ? netAmount : 0,
          totalChargesPaid: charges,
        },
      },
    );

    // ✅ FIXED: Send SMS alert for credit/debit
    if (customer.phone) {
      try {
        if (transaction.type === "deposit") {
          // Send CREDIT alert
          await smsService.sendCreditAlert(
            customer.phone,
            transaction.amount,
            newBalance,
            transaction.id,
            charges,
          );
          console.log(`✅ Credit alert SMS sent to ${customer.phone}`);
        } else {
          // Send DEBIT alert
          await smsService.sendDebitAlert(
            customer.phone,
            transaction.amount,
            newBalance,
            transaction.id,
            charges,
          );
          console.log(`✅ Debit alert SMS sent to ${customer.phone}`);
        }
      } catch (smsError) {
        console.error("❌ Failed to send transaction SMS:", smsError.message);
        // Don't fail the transaction if SMS fails
      }
    }

    res.json({
      success: true,
      message: `✅ ${transaction.type === "deposit" ? "Deposit" : "Withdrawal"} approved! ₦${transaction.amount.toLocaleString()} ${transaction.type === "deposit" ? "credited to" : "debited from"} ${customer.name}'s account.`,
      transaction: {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        charges: charges,
        netAmount: netAmount,
        status: transaction.status,
        newBalance: newBalance,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        previousBalance: customer.cashBalance,
        newBalance: newBalance,
      },
    });
  } catch (error) {
    console.error("Approve transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Reject transaction
exports.rejectTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { rejectedBy, reason } = req.body;

    const transaction = await Transaction.findOne({ id: transactionId });
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ error: "Transaction already processed" });
    }

    transaction.status = "rejected";
    transaction.rejectedBy = rejectedBy?.name || "Admin";
    transaction.rejectedAt = new Date();
    transaction.rejectionReason = reason || "";

    await transaction.save();

    res.json({
      success: true,
      message: "Transaction rejected",
      transaction: {
        id: transaction.id,
        status: transaction.status,
      },
    });
  } catch (error) {
    console.error("Reject transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all transactions
exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    console.error("Get all transactions error:", error);
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

// Get transaction statistics
exports.getTransactionStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    // Today's stats
    const todayStats = await Transaction.aggregate([
      { $match: { status: "approved", createdAt: { $gte: today } } },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalCharges: { $sum: "$charges" },
        },
      },
    ]);

    // This month's stats
    const monthStats = await Transaction.aggregate([
      { $match: { status: "approved", createdAt: { $gte: thisMonth } } },
      {
        $group: {
          _id: "$type",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalCharges: { $sum: "$charges" },
        },
      },
    ]);

    // Pending count
    const pendingCount = await Transaction.countDocuments({
      status: "pending",
    });

    res.json({
      today: todayStats,
      thisMonth: monthStats,
      pendingCount,
    });
  } catch (error) {
    console.error("Get transaction stats error:", error);
    res.status(500).json({ error: error.message });
  }
};
// At bottom of transactionController.js
module.exports = {
  createTransaction: exports.createTransaction,
  updateTransactionStatus: exports.approveTransaction, // Alias here
  getAllTransactions: exports.getAllTransactions,
  getTransactionStats: exports.getTransactionStats,
  approveTransaction: exports.approveTransaction, // Also export original
  rejectTransaction: exports.rejectTransaction,
  getTransactionsByCustomer: exports.getTransactionsByCustomer,
};
