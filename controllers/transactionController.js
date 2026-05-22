const Transaction = require("../models/transaction");
const Customer = require("../models/customer");
const Loan = require("../models/loan"); // Added for overdraft handling
const smsService = require("../services/smsService");
const mongoose = require("mongoose");

async function findCustomerRobustly(identifier) {
  if (!identifier) {
    console.error("[DEBUG] findCustomerRobustly: Identifier is empty/null");
    return null;
  }

  console.log(
    `[DEBUG] findCustomerRobustly: Searching for identifier: "${identifier}" (type: ${typeof identifier})`,
  );

  // 1. Try searching by 'id' (String)
  let customer = await Customer.findOne({ id: identifier.toString() });
  if (customer) {
    console.log(`[DEBUG] SUCCESS: Found via 'id' (string): ${customer.name}`);
    return customer;
  }

  // 2. Try searching by 'id' (Number)
  const numericId = Number(identifier);
  if (!isNaN(numericId)) {
    customer = await Customer.findOne({ id: numericId });
    if (customer) {
      console.log(`[DEBUG] SUCCESS: Found via 'id' (number): ${customer.name}`);
      return customer;
    }
  }

  // 3. Try searching by 'customerNumber' (String)
  customer = await Customer.findOne({ customerNumber: identifier.toString() });
  if (customer) {
    console.log(
      `[DEBUG] SUCCESS: Found via 'customerNumber' (string): ${customer.name}`,
    );
    return customer;
  }

  // 4. Try searching by 'customerNumber' (Number)
  if (!isNaN(numericId)) {
    customer = await Customer.findOne({ customerNumber: numericId });
    if (customer) {
      console.log(
        `[DEBUG] SUCCESS: Found via 'customerNumber' (number): ${customer.name}`,
      );
      return customer;
    }
  }

  // 5. Try searching by standard MongoDB '_id'
  try {
    customer = await Customer.findById(identifier);
    if (customer) {
      console.log(`[DEBUG] SUCCESS: Found via '_id': ${customer.name}`);
      return customer;
    }
  } catch (err) {}

  console.error(
    `[DEBUG] FAILURE: No customer found matching identifier: ${identifier}`,
  );
  return null;
}

// ==========================================================
// CREATE TRANSACTION
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
      requestedById,
      staffName,
      staffId,
    } = req.body;

    console.log(
      "[DEBUG] Incoming transaction:",
      JSON.stringify(req.body, null, 2),
    );

    if (!customerId) {
      return res.status(400).json({ error: "Missing customerId" });
    }

    const customer = await findCustomerRobustly(customerId);

    if (!customer) {
      return res.status(404).json({
        error: "Customer not found",
        debugInfo: `Tried searching for ${customerId}`,
      });
    }

    const numAmount = Number(amount);
    const numCharges = Number(charges) || 0;
    const numNetAmount =
      netAmount !== undefined ? Number(netAmount) : numAmount - numCharges;

    // Determine staff info - prioritize explicit IDs, fallback to name
    const finalStaffName =
      requestedBy || staffName || req.user?.name || "System";
    const finalStaffId = requestedById || staffId || req.user?.id || null;

    const transaction = new Transaction({
      id: "TXN" + Date.now() + Math.random().toString(36).substr(2, 4),
      customerId: customer.id || customer._id.toString(),
      customerName: customerName || customer.name,
      customerPhone: customerPhone || customer.phone || "",
      type,
      amount: numAmount,
      charges: numCharges,
      netAmount: numNetAmount,
      description: description || "",
      status: "pending",

      // FIX: Store both name AND ID
      requestedBy: finalStaffName,
      requestedById: finalStaffId,
      staffName: finalStaffName,
      staffId: finalStaffId,

      requestedAt: new Date(),
      date: new Date(),
    });

    await transaction.save();

    console.log(
      "[DEBUG] Saved transaction:",
      JSON.stringify(transaction.toObject(), null, 2),
    );

    res.status(201).json({
      success: true,
      transaction,
    });
  } catch (error) {
    console.error("Create transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

// ==========================================================
// PROCESS DEPOSIT WITH OVERDRAFT AUTO-DEBIT
// ==========================================================
async function processDepositWithOverdraft(
  customerId,
  depositAmount,
  charges = 0,
  approvedBy = "System",
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const customer = await Customer.findOne({ id: customerId }).session(
      session,
    );
    if (!customer) {
      await session.abortTransaction();
      return { success: false, error: "Customer not found" };
    }

    const netDeposit = depositAmount - charges;

    // Check if customer has active overdraft
    if (customer.hasActiveOverdraft && customer.activeLoanId) {
      const loan = await Loan.findOne({ id: customer.activeLoanId }).session(
        session,
      );

      if (loan && loan.status === "active" && loan.type === "overdraft") {
        const outstanding = loan.outstandingBalance || loan.totalPayable || 0;

        if (outstanding > 0) {
          // Calculate how much goes to overdraft repayment
          const repaymentAmount = Math.min(netDeposit, outstanding);
          const remainingForCustomer = netDeposit - repaymentAmount;

          // Update overdraft
          loan.amountRepaid = (loan.amountRepaid || 0) + repaymentAmount;
          loan.outstandingBalance = Math.max(0, outstanding - repaymentAmount);

          // Determine portions (principal first, then charges)
          const remainingPrincipal =
            loan.amount - (loan.principalRepaidToDate || 0);
          const principalPortion = Math.min(
            repaymentAmount,
            remainingPrincipal,
          );
          const chargesPortion = repaymentAmount - principalPortion;

          // Update repayment record
          const repayment = loan.repayments[0];
          repayment.paidAmount = (repayment.paidAmount || 0) + repaymentAmount;
          repayment.principalPortion =
            (repayment.principalPortion || 0) + principalPortion;
          repayment.chargesPortion =
            (repayment.chargesPortion || 0) + chargesPortion;
          repayment.paidDate = new Date();
          repayment.paidBy = approvedBy;

          loan.principalRepaidToDate =
            (loan.principalRepaidToDate || 0) + principalPortion;
          loan.chargesPaidToDate =
            (loan.chargesPaidToDate || 0) + chargesPortion;

          let isFullyPaid = false;

          // Check if fully repaid
          if (
            loan.outstandingBalance <= 0 ||
            loan.amountRepaid >= loan.totalPayable
          ) {
            loan.status = "completed";
            loan.completedAt = new Date();
            loan.outstandingBalance = 0;
            loan.outstandingPrincipal = 0;
            loan.outstandingCharges = 0;
            isFullyPaid = true;

            repayment.status = "paid";

            // Clear overdraft flags
            await Customer.findOneAndUpdate(
              { id: customerId },
              {
                $set: {
                  hasActiveOverdraft: false,
                  activeLoanId: null,
                  hasActiveLoan: false,
                },
              },
              { session },
            );
          } else {
            // Update outstanding amounts
            loan.outstandingPrincipal = Math.max(
              0,
              loan.amount - loan.principalRepaidToDate,
            );
            loan.outstandingCharges = Math.max(
              0,
              loan.processingCharges - loan.chargesPaidToDate,
            );
          }

          await loan.save({ session });

          // Create overdraft repayment transaction
          const overdraftTxn = new Transaction({
            id: "TXN" + Date.now() + Math.random().toString(36).substr(2, 4),
            customerId,
            customerName: customer.name,
            customerPhone: customer.phone || null,
            type: "overdraft_repayment",
            amount: repaymentAmount,
            principalPortion,
            chargesPortion,
            netAmount: -repaymentAmount,
            description: `Auto-debit from deposit: Overdraft repayment (Principal: ₦${principalPortion.toLocaleString()}, Charges: ₦${chargesPortion.toLocaleString()})${isFullyPaid ? " - FULLY CLEARED" : ""}`,
            status: "approved",
            approvedBy,
            date: new Date().toISOString(),
            loanId: loan.id,
            isAutoDebit: true,
          });
          await overdraftTxn.save({ session });

          // Create charges revenue transaction if charges portion exists
          if (chargesPortion > 0) {
            const revenueTxn = new Transaction({
              id: "REV" + Date.now() + Math.random().toString(36).substr(2, 4),
              customerId,
              customerName: customer.name,
              type: "overdraft_charges_revenue",
              amount: chargesPortion,
              netAmount: chargesPortion,
              description: `Overdraft charges revenue from auto-debit - ${loan.id}`,
              status: "approved",
              approvedBy: "System",
              date: new Date().toISOString(),
              loanId: loan.id,
              isRevenue: true,
              revenueType: "overdraft_charges",
            });
            await revenueTxn.save({ session });
          }

          await session.commitTransaction();

          // SMS notification
          if (customer.phone) {
            try {
              let msg = `VaultFlow: Dear ${customer.name}, ₦${repaymentAmount.toLocaleString()} auto-debited from your ₦${depositAmount.toLocaleString()} deposit for overdraft repayment. `;
              if (isFullyPaid) {
                msg += `🎉 Overdraft FULLY CLEARED! `;
              }
              msg += `Outstanding: ₦${loan.outstandingBalance.toLocaleString()}. Available: ₦${remainingForCustomer.toLocaleString()}.`;
              await smsService.sendSMS({ to: customer.phone, message: msg });
            } catch (smsError) {
              console.error("SMS failed:", smsError.message);
            }
          }

          return {
            success: true,
            originalDeposit: depositAmount,
            netDeposit,
            autoDebit: repaymentAmount,
            remainingForCustomer,
            overdraftCleared: isFullyPaid,
            loan,
            principalPortion,
            chargesPortion,
          };
        }
      }
    }

    await session.abortTransaction();
    return {
      success: true,
      originalDeposit: depositAmount,
      netDeposit,
      autoDebit: 0,
      remainingForCustomer: netDeposit,
      overdraftCleared: false,
      loan: null,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("Process deposit with overdraft error:", error);
    return { success: false, error: error.message };
  } finally {
    session.endSession();
  }
}

// ==========================================================
// APPROVE TRANSACTION (FIXED - single transaction, correct balance)
// ==========================================================
exports.approveTransaction = async (req, res) => {
  console.log("=== APPROVE TRANSACTION ===");
  console.log("Params:", req.params);
  console.log("Body:", req.body);
  console.log("Headers:", req.headers["content-type"]);
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId } = req.params;
    const { approvedBy } = req.body;

    const transaction = await Transaction.findOne({
      id: transactionId,
    }).session(session);
    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      await session.abortTransaction();
      return res.status(400).json({ error: "Transaction already processed" });
    }

    const customer = await findCustomerRobustly(transaction.customerId);
    if (!customer) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Customer not found" });
    }

    const charges = transaction.charges || 0;
    const netAmount = transaction.netAmount;

    let newBalance;
    let overdraftResult = null;

    if (transaction.type === "deposit") {
      // ===== INLINE AUTO-DEBIT LOGIC (same session) =====
      const depositAmount = transaction.amount;
      const netDeposit = depositAmount - charges;
      let customerBalance = customer.cashBalance || 0;

      // First: add the full net deposit to customer's balance
      customerBalance += netDeposit;

      // Check if customer has active overdraft
      if (customer.hasActiveOverdraft && customer.activeLoanId) {
        const loan = await Loan.findOne({
          id: customer.activeLoanId,
        }).session(session);

        if (loan && loan.status === "active" && loan.type === "overdraft") {
          const outstanding = loan.outstandingBalance || loan.totalPayable || 0;

          if (outstanding > 0) {
            // Calculate how much goes to overdraft repayment
            const repaymentAmount = Math.min(customerBalance, outstanding);
            const remainingForCustomer = customerBalance - repaymentAmount;

            // Update overdraft
            loan.amountRepaid = (loan.amountRepaid || 0) + repaymentAmount;
            loan.outstandingBalance = Math.max(
              0,
              outstanding - repaymentAmount,
            );

            // Determine portions (principal first, then charges)
            const remainingPrincipal =
              loan.amount - (loan.principalRepaidToDate || 0);
            const principalPortion = Math.min(
              repaymentAmount,
              remainingPrincipal,
            );
            const chargesPortion = repaymentAmount - principalPortion;

            // Update repayment record
            const repayment = loan.repayments[0];
            repayment.paidAmount =
              (repayment.paidAmount || 0) + repaymentAmount;
            repayment.principalPortion =
              (repayment.principalPortion || 0) + principalPortion;
            repayment.chargesPortion =
              (repayment.chargesPortion || 0) + chargesPortion;
            repayment.paidDate = new Date();
            repayment.paidBy = approvedBy?.name || "Admin";

            loan.principalRepaidToDate =
              (loan.principalRepaidToDate || 0) + principalPortion;
            loan.chargesPaidToDate =
              (loan.chargesPaidToDate || 0) + chargesPortion;

            let isFullyPaid = false;

            if (
              loan.outstandingBalance <= 0 ||
              loan.amountRepaid >= loan.totalPayable
            ) {
              loan.status = "completed";
              loan.completedAt = new Date();
              loan.outstandingBalance = 0;
              loan.outstandingPrincipal = 0;
              loan.outstandingCharges = 0;
              isFullyPaid = true;
              repayment.status = "paid";

              // Clear overdraft flags
              await Customer.findOneAndUpdate(
                { id: transaction.customerId },
                {
                  $set: {
                    hasActiveOverdraft: false,
                    activeLoanId: null,
                    hasActiveLoan: false,
                  },
                },
                { session },
              );
            } else {
              loan.outstandingPrincipal = Math.max(
                0,
                loan.amount - loan.principalRepaidToDate,
              );
              loan.outstandingCharges = Math.max(
                0,
                loan.processingCharges - loan.chargesPaidToDate,
              );
            }

            await loan.save({ session });

            // Create overdraft repayment transaction
            const overdraftTxn = new Transaction({
              id: "TXN" + Date.now() + Math.random().toString(36).substr(2, 4),
              customerId: transaction.customerId,
              customerName: customer.name,
              customerPhone: customer.phone || null,
              type: "overdraft_repayment",
              amount: repaymentAmount,
              principalPortion,
              chargesPortion,
              netAmount: -repaymentAmount,
              description: `Auto-debit from deposit: Overdraft repayment (Principal: ₦${principalPortion.toLocaleString()}, Charges: ₦${chargesPortion.toLocaleString()})${isFullyPaid ? " - FULLY CLEARED" : ""}`,
              status: "approved",
              approvedBy: approvedBy?.name || "Admin",
              date: new Date().toISOString(),
              loanId: loan.id,
              isAutoDebit: true,
            });
            await overdraftTxn.save({ session });

            // Create charges revenue transaction
            if (chargesPortion > 0) {
              const revenueTxn = new Transaction({
                id:
                  "REV" + Date.now() + Math.random().toString(36).substr(2, 4),
                customerId: transaction.customerId,
                customerName: customer.name,
                type: "overdraft_charges_revenue",
                amount: chargesPortion,
                netAmount: chargesPortion,
                description: `Overdraft charges revenue from auto-debit - ${loan.id}`,
                status: "approved",
                approvedBy: "System",
                date: new Date().toISOString(),
                loanId: loan.id,
                isRevenue: true,
                revenueType: "overdraft_charges",
              });
              await revenueTxn.save({ session });
            }

            overdraftResult = {
              autoDebit: repaymentAmount,
              remainingForCustomer,
              overdraftCleared: isFullyPaid,
              principalPortion,
              chargesPortion,
            };

            // Mark transaction with auto-debit info
            transaction.autoDebitAmount = repaymentAmount;
            transaction.overdraftCleared = isFullyPaid;
            transaction.remainingAfterAutoDebit = remainingForCustomer;
            transaction.principalPortion = principalPortion;
            transaction.chargesPortion = chargesPortion;

            // Customer keeps remaining amount after auto-debit
            newBalance = remainingForCustomer;

            // SMS
            if (customer.phone) {
              try {
                let msg = `VaultFlow: Dear ${customer.name}, ₦${repaymentAmount.toLocaleString()} auto-debited from your ₦${depositAmount.toLocaleString()} deposit for overdraft repayment. `;
                if (isFullyPaid) msg += `🎉 Overdraft FULLY CLEARED! `;
                msg += `Outstanding: ₦${loan.outstandingBalance.toLocaleString()}. Available: ₦${remainingForCustomer.toLocaleString()}.`;
                await smsService.sendSMS({ to: customer.phone, message: msg });
              } catch (smsError) {
                console.error("SMS failed:", smsError.message);
              }
            }
          }
        }
      }

      // No overdraft or no auto-debit occurred
      if (!overdraftResult) {
        newBalance = customerBalance; // net deposit added to balance
      }
      // =====================================================
    } else if (transaction.type === "withdrawal") {
      newBalance = (customer.cashBalance || 0) - netAmount;
      if (newBalance < 0 && !customer.hasActiveOverdraft) {
        await session.abortTransaction();
        return res.status(400).json({
          error: "Insufficient funds for withdrawal",
          currentBalance: customer.cashBalance,
          requestedAmount: netAmount,
        });
      }
    } else {
      await session.abortTransaction();
      return res.status(400).json({ error: "Invalid transaction type" });
    }

    // Update transaction
    transaction.status = "approved";
    transaction.approvedBy = approvedBy?.name || "Admin";
    transaction.approvedAt = new Date();
    transaction.finalBalance = newBalance;
    await transaction.save({ session });

    // Update customer balance ONCE with final correct amount
    const updateQuery = customer.id
      ? { id: customer.id }
      : { _id: customer._id };

    const customerUpdate = {
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
    };

    await Customer.findOneAndUpdate(updateQuery, customerUpdate, { session });

    await session.commitTransaction();

    // Send SMS for normal deposit/withdrawal (no auto-debit)
    if (customer.phone && !overdraftResult) {
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
      } catch (smsError) {
        console.error("SMS failed:", smsError.message);
      }
    }

    // Build response
    let message = `✅ ${transaction.type === "deposit" ? "Deposit" : "Withdrawal"} approved!`;
    if (overdraftResult) {
      message = `✅ Deposit approved! ₦${overdraftResult.autoDebit.toLocaleString()} auto-debited for overdraft. `;
      if (overdraftResult.overdraftCleared) {
        message += `🎉 Overdraft FULLY CLEARED! `;
      }
      message += `Customer received ₦${overdraftResult.remainingForCustomer.toLocaleString()}.`;
    }

    res.json({
      success: true,
      message,
      transaction: {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
        newBalance: newBalance,
        approvedBy: transaction.approvedBy,
        autoDebitAmount: overdraftResult?.autoDebit || 0,
        overdraftCleared: overdraftResult?.overdraftCleared || false,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        newBalance: newBalance,
        hasActiveOverdraft: overdraftResult
          ? !overdraftResult.overdraftCleared
          : customer.hasActiveOverdraft,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Approve transaction error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
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

    // Get auto-debit stats
    const autoDebitStats = await Transaction.aggregate([
      {
        $match: {
          type: "overdraft_repayment",
          isAutoDebit: true,
          status: "approved",
          createdAt: { $gte: thisMonth },
        },
      },
      {
        $group: {
          _id: null,
          totalAutoDebit: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      today: todayStats,
      thisMonth: monthStats,
      pendingCount,
      autoDebit: autoDebitStats[0] || { totalAutoDebit: 0, count: 0 },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// ==========================================================
// MODULE EXPORTS
// ==========================================================
module.exports = {
  createTransaction: exports.createTransaction,
  updateTransactionStatus: exports.approveTransaction,
  getAllTransactions: exports.getAllTransactions,
  getTransactionStats: exports.getTransactionStats,
  approveTransaction: exports.approveTransaction,
  rejectTransaction: exports.rejectTransaction,
  getTransactionsByCustomer: exports.getTransactionsByCustomer,
  // processDepositWithOverdraft: processDepositWithOverdraft,
};
