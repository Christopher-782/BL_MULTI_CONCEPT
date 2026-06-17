const Transaction = require("../models/transaction");
const Customer = require("../models/customer");
const Loan = require("../models/loan");
const smsService = require("../services/smsService");
const mongoose = require("mongoose");

const DEBUG = process.env.NODE_ENV !== "production";
const customerCache = new Map();

async function findCustomerRobustly(identifier, useCache = false) {
  if (!identifier) {
    if (DEBUG)
      console.error("[DEBUG] findCustomerRobustly: Identifier is empty/null");
    return null;
  }
  if (DEBUG)
    console.log(`[DEBUG] findCustomerRobustly: Searching for: "${identifier}"`);

  const cacheKey = identifier.toString();
  if (useCache && customerCache.has(cacheKey)) {
    return customerCache.get(cacheKey);
  }

  let customer = await Customer.findOne({ id: identifier.toString() }).lean();
  if (customer) {
    if (useCache) customerCache.set(cacheKey, customer);
    return customer;
  }

  const numericId = Number(identifier);
  if (!isNaN(numericId)) {
    customer = await Customer.findOne({ id: numericId }).lean();
    if (customer) {
      if (useCache) customerCache.set(cacheKey, customer);
      return customer;
    }
  }

  customer = await Customer.findOne({
    customerNumber: identifier.toString(),
  }).lean();
  if (customer) {
    if (useCache) customerCache.set(cacheKey, customer);
    return customer;
  }

  if (!isNaN(numericId)) {
    customer = await Customer.findOne({ customerNumber: numericId }).lean();
    if (customer) {
      if (useCache) customerCache.set(cacheKey, customer);
      return customer;
    }
  }

  try {
    customer = await Customer.findById(identifier).lean();
    if (customer) {
      if (useCache) customerCache.set(cacheKey, customer);
      return customer;
    }
  } catch (err) {}

  if (DEBUG) console.error(`[DEBUG] FAILURE: No customer found: ${identifier}`);
  return null;
}

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

    if (DEBUG)
      console.log(
        "[DEBUG] Incoming transaction:",
        JSON.stringify(req.body, null, 2),
      );
    if (!customerId)
      return res.status(400).json({ error: "Missing customerId" });

    const customer = await findCustomerRobustly(customerId);
    if (!customer)
      return res
        .status(404)
        .json({
          error: "Customer not found",
          debugInfo: `Tried: ${customerId}`,
        });

    const numAmount = Number(amount);
    const numCharges = Number(charges) || 0;
    const numNetAmount =
      netAmount !== undefined ? Number(netAmount) : numAmount - numCharges;

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
      requestedBy: finalStaffName,
      requestedById: finalStaffId,
      staffName: finalStaffName,
      staffId: finalStaffId,
      requestedAt: new Date(),
      date: new Date(),
    });

    await transaction.save();
    if (DEBUG)
      console.log(
        "[DEBUG] Saved transaction:",
        JSON.stringify(transaction.toObject(), null, 2),
      );

    res.status(201).json({ success: true, transaction });
  } catch (error) {
    console.error("Create transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.approveTransaction = async (req, res) => {
  if (DEBUG) console.log("=== APPROVE TRANSACTION ===", req.params, req.body);

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

    const customer = await findCustomerRobustly(transaction.customerId, true);
    if (!customer) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Customer not found" });
    }

    const charges = transaction.charges || 0;
    const netAmount = transaction.netAmount;
    let newBalance;
    let overdraftResult = null;

    if (transaction.type === "deposit") {
      const depositAmount = transaction.amount;
      const netDeposit = depositAmount - charges;

      if (customer.hasActiveOverdraft && customer.activeLoanId) {
        const loan = await Loan.findOne({ id: customer.activeLoanId })
          .session(session)
          .lean();

        if (loan && loan.status === "active" && loan.type === "overdraft") {
          const outstanding = loan.outstandingBalance || loan.totalPayable || 0;

          if (outstanding > 0) {
            const repaymentAmount = Math.min(netDeposit, outstanding);
            const remainingForCustomer = netDeposit - repaymentAmount;

            loan.amountRepaid = (loan.amountRepaid || 0) + repaymentAmount;
            loan.outstandingBalance = Math.max(
              0,
              outstanding - repaymentAmount,
            );

            const remainingPrincipal =
              loan.amount - (loan.principalRepaidToDate || 0);
            const principalPortion = Math.min(
              repaymentAmount,
              remainingPrincipal,
            );
            const chargesPortion = repaymentAmount - principalPortion;

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

            await Loan.updateOne({ id: loan.id }, loan, { session });

            const oldBalance = customer.cashBalance || 0;
            newBalance =
              oldBalance < 0
                ? oldBalance + depositAmount - charges
                : oldBalance + depositAmount - charges - repaymentAmount;

            const now = Date.now();
            const overdraftTxn = new Transaction({
              id: "TXN" + now + Math.random().toString(36).substr(2, 4),
              customerId: transaction.customerId,
              customerName: customer.name,
              customerPhone: customer.phone || null,
              type: "overdraft_repayment",
              amount: repaymentAmount,
              principalPortion,
              chargesPortion,
              netAmount: -repaymentAmount,
              description: `Auto-debit from deposit: Overdraft repayment (Principal: N${principalPortion.toLocaleString()}, Charges: N${chargesPortion.toLocaleString()})${isFullyPaid ? " - FULLY CLEARED" : ""}`,
              status: "approved",
              approvedBy: approvedBy?.name || "Admin",
              date: new Date().toISOString(),
              loanId: loan.id,
              isAutoDebit: true,
            });
            await overdraftTxn.save({ session });

            if (chargesPortion > 0) {
              const alreadyRecorded = loan.chargesRevenueRecorded || 0;
              const newRevenue = chargesPortion - alreadyRecorded;
              if (newRevenue > 0) {
                const revenueTxn = new Transaction({
                  id: "REV" + now + Math.random().toString(36).substr(2, 4),
                  customerId: transaction.customerId,
                  customerName: customer.name,
                  type: "overdraft_charges_revenue",
                  amount: newRevenue,
                  netAmount: newRevenue,
                  description: `Overdraft charges revenue from auto-debit - ${loan.id}`,
                  status: "approved",
                  approvedBy: "System",
                  date: new Date().toISOString(),
                  loanId: loan.id,
                  isRevenue: true,
                  revenueType: "overdraft_charges",
                });
                await revenueTxn.save({ session });
                await Loan.updateOne(
                  { id: loan.id },
                  {
                    $set: {
                      chargesRevenueRecorded: alreadyRecorded + newRevenue,
                    },
                  },
                  { session },
                );
              }
            }

            if (charges > 0) {
              const depositChargesRevenue = new Transaction({
                id: "REV" + now + Math.random().toString(36).substr(2, 4),
                customerId: transaction.customerId,
                customerName: customer.name,
                type: "overdraft_charges_revenue",
                amount: charges,
                netAmount: charges,
                description: `Transaction charges from deposit - ${transaction.id}`,
                status: "approved",
                approvedBy: "System",
                date: new Date().toISOString(),
                isRevenue: true,
                revenueType: "transaction_charges",
              });
              await depositChargesRevenue.save({ session });
            }

            overdraftResult = {
              autoDebit: repaymentAmount,
              remainingForCustomer,
              overdraftCleared: isFullyPaid,
              principalPortion,
              chargesPortion,
            };

            transaction.autoDebitAmount = repaymentAmount;
            transaction.overdraftCleared = isFullyPaid;
            transaction.remainingAfterAutoDebit = remainingForCustomer;
            transaction.principalPortion = principalPortion;
            transaction.chargesPortion = chargesPortion;

            if (customer.phone) {
              smsService
                .sendSMS({
                  to: customer.phone,
                  message: `VaultFlow: Dear ${customer.name}, N${repaymentAmount.toLocaleString()} auto-debited from your N${depositAmount.toLocaleString()} deposit for overdraft repayment. ${isFullyPaid ? "Overdraft FULLY CLEARED! " : ""}Outstanding: N${loan.outstandingBalance.toLocaleString()}. Available: N${remainingForCustomer.toLocaleString()}.`,
                })
                .catch((e) => console.error("SMS failed:", e.message));
            }
          }
        }
      }

      if (!overdraftResult) {
        newBalance = (customer.cashBalance || 0) + transaction.amount - charges;
      }
    } else if (transaction.type === "withdrawal") {
      newBalance = (customer.cashBalance || 0) - netAmount;
      if (newBalance < 0 && !customer.hasActiveOverdraft) {
        await session.abortTransaction();
        return res
          .status(400)
          .json({
            error: "Insufficient funds",
            currentBalance: customer.cashBalance,
            requestedAmount: netAmount,
          });
      }
    } else if (
      transaction.type === "overdraft_charges_revenue" ||
      transaction.type === "interest_revenue"
    ) {
      transaction.status = "approved";
      transaction.approvedBy = approvedBy?.name || "Admin";
      transaction.approvedAt = new Date();
      await transaction.save({ session });
      await session.commitTransaction();
      return res.json({
        success: true,
        message: "Revenue transaction approved",
        transaction: {
          id: transaction.id,
          type: transaction.type,
          status: "approved",
        },
      });
    } else {
      await session.abortTransaction();
      return res.status(400).json({ error: "Invalid transaction type" });
    }

    transaction.status = "approved";
    transaction.approvedBy = approvedBy?.name || "Admin";
    transaction.approvedAt = new Date();
    transaction.finalBalance = newBalance;
    await transaction.save({ session });

    const updateQuery = customer.id
      ? { id: customer.id }
      : { _id: customer._id };
    await Customer.findOneAndUpdate(
      updateQuery,
      {
        $set: { cashBalance: newBalance, balance: newBalance },
        $inc: {
          totalTransactions: 1,
          totalDeposits: transaction.type === "deposit" ? netAmount : 0,
          totalWithdrawals: transaction.type === "withdrawal" ? netAmount : 0,
          totalChargesPaid: charges,
        },
      },
      { session },
    );

    await session.commitTransaction();

    if (customer.phone && !overdraftResult) {
      const smsPromise =
        transaction.type === "deposit"
          ? smsService.sendCreditAlert(
              customer.phone,
              transaction.amount,
              newBalance,
              transaction.id,
              charges,
            )
          : smsService.sendDebitAlert(
              customer.phone,
              transaction.amount,
              newBalance,
              transaction.id,
              charges,
            );
      smsPromise.catch((e) => console.error("SMS failed:", e.message));
    }

    let message = `${transaction.type === "deposit" ? "Deposit" : "Withdrawal"} approved!`;
    if (overdraftResult) {
      message = `Deposit approved! N${overdraftResult.autoDebit.toLocaleString()} auto-debited for overdraft. ${overdraftResult.overdraftCleared ? "Overdraft FULLY CLEARED! " : ""}Customer received N${overdraftResult.remainingForCustomer.toLocaleString()}.`;
    }

    res.json({
      success: true,
      message,
      transaction: {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
        newBalance,
        approvedBy: transaction.approvedBy,
        autoDebitAmount: overdraftResult?.autoDebit || 0,
        overdraftCleared: overdraftResult?.overdraftCleared || false,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        newBalance,
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

exports.rejectTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { rejectedBy, reason } = req.body;

    const transaction = await Transaction.findOne({ id: transactionId });
    if (!transaction)
      return res.status(404).json({ error: "Transaction not found" });
    if (transaction.status !== "pending")
      return res.status(400).json({ error: "Transaction already processed" });

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

exports.getAllTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find().sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Transaction.countDocuments(),
    ]);

    res.json({
      success: true,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionsByCustomer = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find({ customerId: req.params.customerId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments({ customerId: req.params.customerId }),
    ]);

    res.json({
      success: true,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
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

    const [todayStats, monthStats] = await Promise.all([
      Transaction.aggregate([
        { $match: { status: "approved", createdAt: { $gte: today } } },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            totalCharges: { $sum: "$charges" },
          },
        },
      ]),
      Transaction.aggregate([
        { $match: { status: "approved", createdAt: { $gte: thisMonth } } },
        {
          $group: {
            _id: "$type",
            count: { $sum: 1 },
            totalAmount: { $sum: "$amount" },
            totalCharges: { $sum: "$charges" },
          },
        },
      ]),
    ]);

    const format = (stats) => {
      const r = {
        deposits: { count: 0, totalAmount: 0, totalCharges: 0 },
        withdrawals: { count: 0, totalAmount: 0, totalCharges: 0 },
        overdraft_repayments: { count: 0, totalAmount: 0, totalCharges: 0 },
      };
      stats.forEach((s) => {
        if (r[s._id])
          r[s._id] = {
            count: s.count,
            totalAmount: s.totalAmount,
            totalCharges: s.totalCharges,
          };
      });
      return r;
    };

    res.json({
      success: true,
      today: format(todayStats),
      thisMonth: format(monthStats),
    });
  } catch (error) {
    console.error("Get transaction stats error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getPendingTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: "pending" })
      .sort({ requestedAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, count: transactions.length, transactions });
  } catch (error) {
    console.error("Get pending transactions error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionsByStaff = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find({
        $or: [
          { requestedById: req.params.staffId },
          { staffId: req.params.staffId },
        ],
      })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Transaction.countDocuments({
        $or: [
          { requestedById: req.params.staffId },
          { staffId: req.params.staffId },
        ],
      }),
    ]);

    res.json({
      success: true,
      count: transactions.length,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Get transactions by staff error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      id: req.params.transactionId,
    }).lean();
    if (!transaction)
      return res.status(404).json({ error: "Transaction not found" });
    res.json({ success: true, transaction });
  } catch (error) {
    console.error("Get transaction by ID error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findOneAndDelete({
      id: req.params.transactionId,
    });
    if (!transaction)
      return res.status(404).json({ error: "Transaction not found" });
    res.json({ success: true, message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Delete transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getRevenueStats = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const [todayResult, monthResult] = await Promise.all([
      Transaction.aggregate([
        { $match: { status: "approved", createdAt: { $gte: today } } },
        {
          $facet: {
            charges: [
              { $match: { charges: { $gt: 0 } } },
              {
                $group: {
                  _id: null,
                  total: { $sum: "$charges" },
                  count: { $sum: 1 },
                },
              },
            ],
            overdraft: [
              { $match: { type: "overdraft_charges_revenue" } },
              {
                $group: {
                  _id: null,
                  total: { $sum: "$amount" },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]),
      Transaction.aggregate([
        { $match: { status: "approved", createdAt: { $gte: thisMonth } } },
        {
          $facet: {
            charges: [
              { $match: { charges: { $gt: 0 } } },
              {
                $group: {
                  _id: null,
                  total: { $sum: "$charges" },
                  count: { $sum: 1 },
                },
              },
            ],
            overdraft: [
              { $match: { type: "overdraft_charges_revenue" } },
              {
                $group: {
                  _id: null,
                  total: { $sum: "$amount" },
                  count: { $sum: 1 },
                },
              },
            ],
          },
        },
      ]),
    ]);

    const extract = (r) => ({
      transactionCharges: r[0]?.charges[0]?.total || 0,
      transactionCount: r[0]?.charges[0]?.count || 0,
      overdraftRevenue: r[0]?.overdraft[0]?.total || 0,
      overdraftCount: r[0]?.overdraft[0]?.count || 0,
      totalRevenue:
        (r[0]?.charges[0]?.total || 0) + (r[0]?.overdraft[0]?.total || 0),
    });

    res.json({
      success: true,
      today: extract(todayResult),
      thisMonth: extract(monthResult),
    });
  } catch (error) {
    console.error("Get revenue stats error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.voidTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId } = req.params;
    const { voidedBy, reason } = req.body;

    const transaction = await Transaction.findOne({
      id: transactionId,
    }).session(session);
    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Transaction not found" });
    }
    if (transaction.status !== "approved") {
      await session.abortTransaction();
      return res
        .status(400)
        .json({
          error: "Only approved transactions can be voided",
          currentStatus: transaction.status,
        });
    }

    const customer = await findCustomerRobustly(transaction.customerId, true);
    if (!customer) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Customer not found" });
    }

    let reversalBalance;
    const netAmount = transaction.netAmount;

    if (transaction.type === "deposit")
      reversalBalance = (customer.cashBalance || 0) - netAmount;
    else if (transaction.type === "withdrawal")
      reversalBalance = (customer.cashBalance || 0) + netAmount;
    else {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ error: `Cannot void type: ${transaction.type}` });
    }

    transaction.status = "voided";
    transaction.voidedBy = voidedBy?.name || "Admin";
    transaction.voidedAt = new Date();
    transaction.voidReason = reason || "";
    transaction.reversalBalance = reversalBalance;
    await transaction.save({ session });

    const updateQuery = customer.id
      ? { id: customer.id }
      : { _id: customer._id };
    await Customer.findOneAndUpdate(
      updateQuery,
      {
        $set: { cashBalance: reversalBalance, balance: reversalBalance },
        $inc: {
          totalTransactions: -1,
          totalDeposits: transaction.type === "deposit" ? -netAmount : 0,
          totalWithdrawals: transaction.type === "withdrawal" ? -netAmount : 0,
          totalChargesPaid: -(transaction.charges || 0),
        },
      },
      { session },
    );

    const reversalTxn = new Transaction({
      id: "TXN" + Date.now() + Math.random().toString(36).substr(2, 4),
      customerId: transaction.customerId,
      customerName: transaction.customerName,
      customerPhone: transaction.customerPhone,
      type: "reversal",
      amount: transaction.amount,
      charges: 0,
      netAmount: transaction.type === "deposit" ? -netAmount : netAmount,
      description: `Reversal of ${transaction.type} ${transaction.id}. Reason: ${reason || "No reason provided"}`,
      status: "approved",
      approvedBy: voidedBy?.name || "Admin",
      originalTransactionId: transaction.id,
      date: new Date(),
    });
    await reversalTxn.save({ session });

    await session.commitTransaction();
    res.json({
      success: true,
      message: `Transaction ${transaction.id} voided`,
      transaction: {
        id: transaction.id,
        status: "voided",
        originalType: transaction.type,
        reversalBalance,
      },
      reversalTransaction: { id: reversalTxn.id, amount: reversalTxn.amount },
      customer: {
        id: customer.id,
        name: customer.name,
        newBalance: reversalBalance,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Void transaction error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

exports.getDashboardSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const [
      totalCustomers,
      totalTransactions,
      pendingTransactions,
      todayApproved,
      monthApproved,
      activeOverdrafts,
      balanceStats,
    ] = await Promise.all([
      Customer.countDocuments(),
      Transaction.countDocuments(),
      Transaction.countDocuments({ status: "pending" }),
      Transaction.countDocuments({
        status: "approved",
        createdAt: { $gte: today },
      }),
      Transaction.countDocuments({
        status: "approved",
        createdAt: { $gte: thisMonth },
      }),
      Customer.countDocuments({ hasActiveOverdraft: true }),
      Customer.aggregate([
        {
          $group: {
            _id: null,
            totalCashBalance: { $sum: "$cashBalance" },
            totalBalance: { $sum: "$balance" },
            avgBalance: { $avg: "$cashBalance" },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      summary: {
        totalCustomers,
        totalTransactions,
        pendingTransactions,
        todayApprovedTransactions: todayApproved,
        monthApprovedTransactions: monthApproved,
        activeOverdrafts,
        totalCashBalance: balanceStats[0]?.totalCashBalance || 0,
        totalBalance: balanceStats[0]?.totalBalance || 0,
        averageBalance: Math.round(balanceStats[0]?.avgBalance || 0),
      },
    });
  } catch (error) {
    console.error("Get dashboard summary error:", error);
    res.status(500).json({ error: error.message });
  }
};
