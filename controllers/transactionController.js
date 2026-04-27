const Transaction = require("../models/transaction");
const Customer = require("../models/customer");
const smsService = require("../services/smsService");

/**
 * HELPER: Robust Customer Lookup
 * This solves the 404 issue by handling String/Number mismatches
 * and id vs _id mismatches.
 */
async function findCustomerRobustly(identifier) {
  if (!identifier) return null;

  // 1. Try searching by the custom 'id' field as a string
  let customer = await Customer.findOne({ id: identifier.toString() });
  if (customer) return customer;

  // 2. Try searching by the custom 'id' field as a number
  const numericId = Number(identifier);
  if (!isNaN(numericId)) {
    customer = await Customer.findOne({ id: numericId });
    if (customer) return customer;
  }

  // 3. Try searching by the standard MongoDB '_id'
  try {
    customer = await Customer.findById(identifier);
    if (customer) return customer;
  } catch (err) {
    // Ignore error if identifier isn't a valid ObjectId
  }

  return null;
}

// ==========================================================
// CREATE TRANSACTION (Deposit/Withdrawal Request)
// ==========================================================
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

    // DEBUG LOG (Check your server terminal!)
    console.log(
      `[Transaction] Attempting to create ${type} for Customer ID: ${customerId} (Type: ${typeof customerId})`,
    );

    // Find customer using our robust helper
    const customer = await findCustomerRobustly(customerId);

    if (!customer) {
      console.error(
        `[Transaction Error] Customer not found for ID: ${customerId}`,
      );
      return res.status(404).json({ error: "Customer not found" });
    }

    // Check balance for withdrawals
    if (type === "withdrawal") {
      const availableBalance = customer.cashBalance || customer.balance || 0;
      const totalDeduction = Number(netAmount);

      if (totalDeduction > availableBalance) {
        return res.status(400).json({
          error: "Insufficient funds",
          availableBalance,
          requestedAmount: totalDeduction,
          shortfall: totalDeduction - availableBalance,
        });
      }
    }

    // Create transaction record
    const transaction = new Transaction({
      id: "TXN" + Date.now() + Math.random().toString(36).substr(2, 4),
      customerId: customer.id || customer._id.toString(), // Ensure we store the correct ID type
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

// ==========================================================
// APPROVE TRANSACTION
// ==========================================================
exports.approveTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { approvedBy } = req.body;

    // 1. Find the transaction
    const transaction = await Transaction.findOne({ id: transactionId });
    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ error: "Transaction already processed" });
    }

    // 2. Find the customer using robust lookup
    const customer = await findCustomerRobustly(transaction.customerId);
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const charges = transaction.charges || 0;
    const netAmount = transaction.netAmount || transaction.amount - charges;

    // 3. Calculate new balance
    let newBalance;
    if (transaction.type === "deposit") {
      newBalance = (customer.cashBalance || 0) + netAmount;
    } else if (transaction.type === "withdrawal") {
      newBalance = (customer.cashBalance || 0) - netAmount;
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

    // 4. Update transaction status
    transaction.status = "approved";
    transaction.approvedBy = approvedBy?.name || "Admin";
    transaction.approvedAt = new Date();
    transaction.finalBalance = newBalance;
    await transaction.save();

    // 5. Update customer balance and stats
    await Customer.findOneAndUpdate(
      { id: customer.id }, // Update using the robustly found customer's ID
      {
        $set: {
          cashBalance: newBalance,
          balance: newBalance,
        },
        $inc: {
          totalTransactions: 1,
          totalDeposits: transaction.type === "deposit" ? netAmount : 0,
          totalWithdrawals: transaction.type === "withdrawal" ? netAmount : 0,
          totalChargesPaid: charges,
        },
      },
    );

    // 6. Send SMS Alert
    if (customer.phone) {
      try {
        if (transaction.type === "deposit") {
          await smsService.sendCreditAlert(
            customer.phone,
            transaction.amount,
            newBalance,
            transaction.id,
            charges,
          );
        } else {
          await smsService.sendDebitAlert(
            customer.phone,
            transaction.amount,
            newBalance,
            transaction.id,
            charges,
          );
        }
        console.log(`✅ SMS sent to ${customer.phone}`);
      } catch (smsError) {
        console.error("❌ SMS failed:", smsError.message);
      }
    }

    res.json({
      success: true,
      message: `✅ ${transaction.type === "deposit" ? "Deposit" : "Withdrawal"} approved!`,
      transaction: {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
        newBalance: newBalance,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        newBalance: newBalance,
      },
    });
  } catch (error) {
    console.error("Approve transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================================================
// REJECT TRANSACTION
// ==========================================================
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
      transaction: { id: transaction.id, status: transaction.status },
    });
  } catch (error) {
    console.error("Reject transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================================================
// GETTERS
// ==========================================================
exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const transactions = await Transaction.find({ customerId }).sort({
      createdAt: -1,
    });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

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

    const pendingCount = await Transaction.countDocuments({
      status: "pending",
    });

    res.json({ today: todayStats, thisMonth: monthStats, pendingCount });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================================
// MODULE EXPORTS
// ==========================================================
module.exports = {
  createTransaction: exports.createTransaction,
  updateTransactionStatus: exports.approveTransaction, // Alias for router
  getAllTransactions: exports.getAllTransactions,
  getTransactionStats: exports.getTransactionStats,
  approveTransaction: exports.approveTransaction,
  rejectTransaction: exports.rejectTransaction,
  getTransactionsByCustomer: exports.getTransactionsByCustomer,
};
