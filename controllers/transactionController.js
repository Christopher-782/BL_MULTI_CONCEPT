const Transaction = require("../models/transaction");
const Customer = require("../models/customer");
const Expense = require("../models/expenses");
const Loan = require("../models/loan");
const smsService = require("../services/smsService");
const mongoose = require("mongoose");

const DEBUG = process.env.NODE_ENV !== "production";
const customerCache = new Map();
const QUICK_TRANSACTION_ROLES = new Set(["admin", "staff"]);
const REVENUE_TRANSACTION_TYPES = new Set([
  "interest_revenue",
  "overdraft_charges_revenue",
]);

class TransactionError extends Error {
  constructor(message, statusCode = 400, details = undefined) {
    super(message);
    this.name = "TransactionError";
    this.statusCode = statusCode;
    this.details = details;
  }
}

function calculateTransactionAmounts(type, amount, charges = 0) {
  const numericAmount = Number(amount);
  const numericCharges = Number(charges);

  if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
    throw new TransactionError(
      "Transaction amount must be greater than zero",
      400,
    );
  }

  if (!Number.isFinite(numericCharges) || numericCharges < 0) {
    throw new TransactionError("Transaction charges cannot be negative", 400);
  }

  if (type === "deposit") {
    const netAmount = numericAmount - numericCharges;

    if (netAmount < 0) {
      throw new TransactionError(
        "Deposit charges cannot exceed the deposit amount",
        400,
      );
    }

    return {
      amount: numericAmount,
      charges: numericCharges,
      netAmount,
      balanceDelta: netAmount,
    };
  }

  if (type === "withdrawal") {
    const netAmount = numericAmount + numericCharges;

    return {
      amount: numericAmount,
      charges: numericCharges,
      netAmount,
      balanceDelta: -netAmount,
    };
  }

  throw new TransactionError(`Unsupported transaction type: ${type}`, 400);
}

function generateTransactionId(prefix = "TXN") {
  return `${prefix}${Date.now()}${Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()}`;
}

function toNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function getBalance(customer) {
  return toNumber(customer?.cashBalance ?? customer?.balance ?? 0);
}

function getPersonName(value, fallback = "Admin") {
  if (!value) return fallback;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.name) return value.name;
  return fallback;
}

function getRequestActor(req, fallbackName = "System") {
  const user = req.user || {};
  const body = req.body || {};

  return {
    id:
      user.id ||
      user._id?.toString?.() ||
      body.requestedById ||
      body.staffId ||
      null,
    name:
      user.name ||
      user.staffName ||
      getPersonName(body.approvedBy, "") ||
      getPersonName(body.voidedBy, "") ||
      body.requestedBy ||
      body.staffName ||
      fallbackName,
    role: String(user.role || "").toLowerCase(),
  };
}

function getCustomerUpdateQuery(customer) {
  if (customer?._id) return { _id: customer._id };
  if (customer?.id) return { id: customer.id };
  if (customer?.customerNumber) {
    return { customerNumber: customer.customerNumber };
  }
  throw new TransactionError("Cannot build customer update query", 500);
}

function clearCustomerCache() {
  customerCache.clear();
}

function buildHttpErrorResponse(error) {
  return {
    statusCode: error.statusCode || 500,
    payload: {
      error: error.message || "Transaction processing failed",
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

async function findCustomerRobustly(identifier, options = false) {
  const normalizedOptions =
    typeof options === "boolean" ? { useCache: options } : options || {};

  const { useCache = false, session = null } = normalizedOptions;

  if (!identifier) {
    if (DEBUG) {
      console.error("[DEBUG] findCustomerRobustly: Identifier is empty/null");
    }
    return null;
  }

  const cacheKey = identifier.toString();

  if (useCache && !session && customerCache.has(cacheKey)) {
    return customerCache.get(cacheKey);
  }

  const applySession = (query) => (session ? query.session(session) : query);

  if (DEBUG) {
    console.log(`[DEBUG] findCustomerRobustly: Searching for: "${identifier}"`);
  }

  let customer = await applySession(
    Customer.findOne({ id: identifier.toString() }),
  ).lean();

  if (customer) {
    if (useCache && !session) customerCache.set(cacheKey, customer);
    return customer;
  }

  const numericId = Number(identifier);

  if (!Number.isNaN(numericId)) {
    customer = await applySession(Customer.findOne({ id: numericId })).lean();

    if (customer) {
      if (useCache && !session) customerCache.set(cacheKey, customer);
      return customer;
    }
  }

  customer = await applySession(
    Customer.findOne({ customerNumber: identifier.toString() }),
  ).lean();

  if (customer) {
    if (useCache && !session) customerCache.set(cacheKey, customer);
    return customer;
  }

  if (!Number.isNaN(numericId)) {
    customer = await applySession(
      Customer.findOne({ customerNumber: numericId }),
    ).lean();

    if (customer) {
      if (useCache && !session) customerCache.set(cacheKey, customer);
      return customer;
    }
  }

  try {
    customer = await applySession(Customer.findById(identifier)).lean();

    if (customer) {
      if (useCache && !session) customerCache.set(cacheKey, customer);
      return customer;
    }
  } catch (error) {
    // Ignore invalid ObjectId cast errors.
  }

  if (DEBUG) {
    console.error(`[DEBUG] FAILURE: No customer found: ${identifier}`);
  }

  return null;
}

function buildCustomerStatsIncrement(type, netAmount, charges, direction = 1) {
  return {
    totalTransactions: direction,
    totalDeposits: type === "deposit" ? direction * netAmount : 0,
    totalWithdrawals: type === "withdrawal" ? direction * netAmount : 0,
    totalChargesPaid: direction * charges,
  };
}

async function createOverdraftRevenueTransaction({
  transaction,
  customer,
  loan,
  chargesPortion,
  approverName,
  session,
}) {
  if (chargesPortion <= 0) return null;

  const revenueTransaction = new Transaction({
    id: generateTransactionId("REV"),
    customerId: transaction.customerId,
    customerName: customer.name,
    customerPhone: customer.phone || "",
    type: "overdraft_charges_revenue",
    amount: chargesPortion,
    charges: 0,
    netAmount: chargesPortion,
    balanceDelta: 0,
    description: `Overdraft charges revenue from auto-debit - ${loan.id}`,
    status: "approved",
    approvedBy: approverName,
    approvedAt: new Date(),
    requestedBy: "System",
    staffName: "System",
    date: new Date(),
    loanId: loan.id,
    originalTransactionId: transaction.id,
    isRevenue: true,
    revenueType: "overdraft_charges",
  });

  await revenueTransaction.save({ session });
  return revenueTransaction;
}

async function processDepositWithActiveOverdraft({
  transaction,
  customer,
  amount,
  charges,
  netAmount,
  approverName,
  session,
}) {
  if (!customer.hasActiveOverdraft || !customer.activeLoanId) {
    return null;
  }

  const loan = await Loan.findOne({
    id: customer.activeLoanId,
    type: "overdraft",
    status: "active",
  }).session(session);

  if (!loan) return null;

  const outstanding = toNumber(loan.outstandingBalance ?? loan.totalPayable);
  if (outstanding <= 0) return null;

  const repaymentAmount = Math.min(netAmount, outstanding);
  const remainingForCustomer = netAmount - repaymentAmount;
  const remainingPrincipal = Math.max(
    0,
    toNumber(loan.amount) - toNumber(loan.principalRepaidToDate),
  );
  const principalPortion = Math.min(repaymentAmount, remainingPrincipal);
  const chargesPortion = repaymentAmount - principalPortion;

  loan.amountRepaid = toNumber(loan.amountRepaid) + repaymentAmount;
  loan.outstandingBalance = Math.max(0, outstanding - repaymentAmount);
  loan.principalRepaidToDate =
    toNumber(loan.principalRepaidToDate) + principalPortion;
  loan.chargesPaidToDate = toNumber(loan.chargesPaidToDate) + chargesPortion;
  loan.chargesRevenueRecorded =
    toNumber(loan.chargesRevenueRecorded) + chargesPortion;

  if (!Array.isArray(loan.repayments)) loan.repayments = [];
  if (!loan.repayments[0]) loan.repayments.push({});

  loan.repayments[0].paidAmount =
    toNumber(loan.repayments[0].paidAmount) + repaymentAmount;
  loan.repayments[0].principalPortion =
    toNumber(loan.repayments[0].principalPortion) + principalPortion;
  loan.repayments[0].chargesPortion =
    toNumber(loan.repayments[0].chargesPortion) + chargesPortion;
  loan.repayments[0].paidDate = new Date();
  loan.repayments[0].paidBy = approverName;

  const isFullyPaid =
    loan.outstandingBalance <= 0 ||
    toNumber(loan.amountRepaid) >= toNumber(loan.totalPayable);

  if (isFullyPaid) {
    loan.status = "completed";
    loan.completedAt = new Date();
    loan.outstandingBalance = 0;
    loan.outstandingPrincipal = 0;
    loan.outstandingCharges = 0;
    loan.repayments[0].status = "paid";
  } else {
    loan.outstandingPrincipal = Math.max(
      0,
      toNumber(loan.amount) - toNumber(loan.principalRepaidToDate),
    );
    loan.outstandingCharges = Math.max(
      0,
      toNumber(loan.processingCharges) - toNumber(loan.chargesPaidToDate),
    );
  }

  loan.markModified("repayments");
  await loan.save({ session });

  // Preserve the existing project behaviour for legacy negative balances.
  const oldBalance = getBalance(customer);
  const customerBalanceDelta =
    oldBalance < 0 ? netAmount : remainingForCustomer;

  const customerUpdate = {
    $inc: {
      cashBalance: customerBalanceDelta,
      balance: customerBalanceDelta,
      ...buildCustomerStatsIncrement("deposit", netAmount, charges),
    },
  };

  if (isFullyPaid) {
    customerUpdate.$set = {
      hasActiveOverdraft: false,
      activeLoanId: null,
      hasActiveLoan: false,
    };
  }

  const updatedCustomer = await Customer.findOneAndUpdate(
    getCustomerUpdateQuery(customer),
    customerUpdate,
    { new: true, session },
  ).lean();

  if (!updatedCustomer) {
    throw new TransactionError("Customer update failed", 400);
  }

  const newBalance = getBalance(updatedCustomer);

  const repaymentTransaction = new Transaction({
    id: generateTransactionId("TXN"),
    customerId: transaction.customerId,
    customerName: customer.name,
    customerPhone: customer.phone || "",
    type: "overdraft_repayment",
    amount: repaymentAmount,
    charges: 0,
    principalPortion,
    chargesPortion,
    netAmount: repaymentAmount,
    balanceDelta: 0,
    description: `Auto-debit from deposit: Overdraft repayment (Principal: ₦${principalPortion.toLocaleString()}, Charges: ₦${chargesPortion.toLocaleString()})${
      isFullyPaid ? " - FULLY CLEARED" : ""
    }`,
    status: "approved",
    approvedBy: approverName,
    approvedAt: new Date(),
    requestedBy: "System",
    staffName: "System",
    date: new Date(),
    loanId: loan.id,
    originalTransactionId: transaction.id,
    isAutoDebit: true,
    finalBalance: newBalance,
  });

  await repaymentTransaction.save({ session });

  await createOverdraftRevenueTransaction({
    transaction,
    customer,
    loan,
    chargesPortion,
    approverName,
    session,
  });

  transaction.autoDebitAmount = repaymentAmount;
  transaction.overdraftCleared = isFullyPaid;
  transaction.remainingAfterAutoDebit = remainingForCustomer;
  transaction.principalPortion = principalPortion;
  transaction.chargesPortion = chargesPortion;
  transaction.loanId = loan.id;

  return {
    updatedCustomer,
    newBalance,
    balanceDelta: customerBalanceDelta,
    overdraftResult: {
      autoDebit: repaymentAmount,
      remainingForCustomer,
      overdraftCleared: isFullyPaid,
      principalPortion,
      chargesPortion,
      outstandingBalance: toNumber(loan.outstandingBalance),
      loanId: loan.id,
    },
    notification: customer.phone
      ? {
          kind: "overdraftDeposit",
          phone: customer.phone,
          customerName: customer.name,
          amount,
          repaymentAmount,
          remainingForCustomer,
          outstandingBalance: toNumber(loan.outstandingBalance),
          isFullyPaid,
        }
      : null,
  };
}

async function approveTransactionService({
  transaction,
  approverName,
  session,
}) {
  if (!transaction) {
    throw new TransactionError("Transaction not found", 404);
  }

  if (transaction.status !== "pending") {
    throw new TransactionError("Transaction already processed", 409);
  }

  if (REVENUE_TRANSACTION_TYPES.has(transaction.type)) {
    const amount = toNumber(transaction.amount, NaN);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new TransactionError("Invalid revenue transaction amount", 400);
    }

    transaction.amount = amount;
    transaction.charges = 0;
    transaction.netAmount = amount;
    transaction.balanceDelta = 0;
    transaction.status = "approved";
    transaction.approvedBy = approverName;
    transaction.approvedAt = new Date();
    await transaction.save({ session });

    return {
      transaction,
      customer: null,
      newBalance: null,
      overdraftResult: null,
      notification: null,
      message: "Revenue transaction approved",
    };
  }

  if (!["deposit", "withdrawal"].includes(transaction.type)) {
    throw new TransactionError(
      `Invalid transaction type for approval: ${transaction.type}`,
      400,
    );
  }

  const customer = await findCustomerRobustly(transaction.customerId, {
    session,
    useCache: false,
  });

  if (!customer) {
    throw new TransactionError("Customer not found", 404);
  }

  const { amount, charges, netAmount, balanceDelta } =
    calculateTransactionAmounts(
      transaction.type,
      transaction.amount,
      transaction.charges,
    );

  transaction.amount = amount;
  transaction.charges = charges;
  transaction.netAmount = netAmount;

  let updatedCustomer;
  let newBalance;
  let actualBalanceDelta = balanceDelta;
  let overdraftResult = null;
  let notification = null;

  if (transaction.type === "deposit") {
    const overdraftProcessing = await processDepositWithActiveOverdraft({
      transaction,
      customer,
      amount,
      charges,
      netAmount,
      approverName,
      session,
    });

    if (overdraftProcessing) {
      ({
        updatedCustomer,
        newBalance,
        balanceDelta: actualBalanceDelta,
        overdraftResult,
        notification,
      } = overdraftProcessing);
    } else {
      updatedCustomer = await Customer.findOneAndUpdate(
        getCustomerUpdateQuery(customer),
        {
          $inc: {
            cashBalance: balanceDelta,
            balance: balanceDelta,
            ...buildCustomerStatsIncrement("deposit", netAmount, charges),
          },
        },
        { new: true, session },
      ).lean();

      if (!updatedCustomer) {
        throw new TransactionError("Customer update failed", 400);
      }

      newBalance = getBalance(updatedCustomer);
      notification = customer.phone
        ? {
            kind: "deposit",
            phone: customer.phone,
            amount,
            charges,
            newBalance,
            transactionId: transaction.id,
          }
        : null;
    }
  } else {
    const requiredAmount = Math.abs(balanceDelta);
    const withdrawalFilter = {
      ...getCustomerUpdateQuery(customer),
      $or: [
        { cashBalance: { $gte: requiredAmount } },
        {
          cashBalance: { $exists: false },
          balance: { $gte: requiredAmount },
        },
      ],
    };

    updatedCustomer = await Customer.findOneAndUpdate(
      withdrawalFilter,
      {
        $inc: {
          cashBalance: balanceDelta,
          balance: balanceDelta,
          ...buildCustomerStatsIncrement("withdrawal", netAmount, charges),
        },
      },
      { new: true, session },
    ).lean();

    if (!updatedCustomer) {
      throw new TransactionError("Insufficient funds", 400, {
        currentBalance: getBalance(customer),
        requestedAmount: requiredAmount,
      });
    }

    newBalance = getBalance(updatedCustomer);
    notification = customer.phone
      ? {
          kind: "withdrawal",
          phone: customer.phone,
          amount,
          charges,
          newBalance,
          transactionId: transaction.id,
        }
      : null;
  }

  transaction.balanceDelta = actualBalanceDelta;
  transaction.status = "approved";
  transaction.approvedBy = approverName;
  transaction.approvedAt = new Date();
  transaction.finalBalance = newBalance;

  await transaction.save({ session });

  let message =
    transaction.type === "deposit"
      ? "Deposit approved!"
      : "Withdrawal approved!";

  if (overdraftResult) {
    message = `Deposit approved! ₦${overdraftResult.autoDebit.toLocaleString()} auto-debited for overdraft. ${
      overdraftResult.overdraftCleared ? "Overdraft FULLY CLEARED! " : ""
    }Customer received ₦${overdraftResult.remainingForCustomer.toLocaleString()}.`;
  }

  return {
    transaction,
    customer: updatedCustomer,
    newBalance,
    overdraftResult,
    notification,
    message,
  };
}

async function sendPostCommitNotification(notification) {
  if (!notification) return;

  try {
    if (notification.kind === "deposit") {
      await smsService.sendCreditAlert(
        notification.phone,
        notification.amount,
        notification.newBalance,
        notification.transactionId,
        notification.charges,
      );
      return;
    }

    if (notification.kind === "withdrawal") {
      await smsService.sendDebitAlert(
        notification.phone,
        notification.amount,
        notification.newBalance,
        notification.transactionId,
        notification.charges,
      );
      return;
    }

    if (notification.kind === "overdraftDeposit") {
      await smsService.sendSMS({
        to: notification.phone,
        message: `VaultFlow: Dear ${notification.customerName}, ₦${notification.repaymentAmount.toLocaleString()} auto-debited from your ₦${notification.amount.toLocaleString()} deposit for overdraft repayment. ${
          notification.isFullyPaid ? "Overdraft FULLY CLEARED! " : ""
        }Outstanding: ₦${notification.outstandingBalance.toLocaleString()}. Available: ₦${notification.remainingForCustomer.toLocaleString()}.`,
      });
    }
  } catch (error) {
    console.error("SMS failed:", error.message);
  }
}

exports.createTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  const actor = getRequestActor(req, "System");
  let result = null;
  let transaction = null;
  let customer = null;

  try {
    await session.withTransaction(async () => {
      const {
        customerId,
        customerName,
        customerPhone,
        type,
        amount,
        charges = 0,
        description,
        isQuickTransaction,
      } = req.body;

      if (!customerId) {
        throw new TransactionError("Missing customerId", 400);
      }

      if (!["deposit", "withdrawal"].includes(type)) {
        throw new TransactionError("Unsupported transaction type", 400);
      }

      const calculated = calculateTransactionAmounts(type, amount, charges);

      customer = await findCustomerRobustly(customerId, {
        session,
        useCache: false,
      });

      if (!customer) {
        throw new TransactionError("Customer not found", 404);
      }

      transaction = new Transaction({
        id: generateTransactionId("TXN"),
        customerId: customer.id || customer._id?.toString(),
        customerName: customerName || customer.name,
        customerPhone: customerPhone || customer.phone || "",
        type,
        amount: calculated.amount,
        charges: calculated.charges,
        netAmount: calculated.netAmount,
        balanceDelta: 0,
        description: description || "",
        status: "pending",
        requestedBy: actor.name,
        requestedById: actor.id,
        staffName: actor.name,
        staffId: actor.id,
        requestedAt: new Date(),
        date: new Date(),
      });

      await transaction.save({ session });

      const canApproveQuickTransaction =
        isQuickTransaction === true && QUICK_TRANSACTION_ROLES.has(actor.role);

      if (canApproveQuickTransaction) {
        result = await approveTransactionService({
          transaction,
          approverName: actor.name,
          session,
        });
      }
    });

    clearCustomerCache();

    if (result?.notification) {
      void sendPostCommitNotification(result.notification);
    }

    return res.status(201).json({
      success: true,
      message: result?.message || "Transaction request submitted",
      transaction: result?.transaction || transaction,
      customer: {
        id: customer.id,
        name: customer.name,
        newBalance: result?.newBalance ?? getBalance(customer),
      },
    });
  } catch (error) {
    console.error("CREATE TRANSACTION ERROR:", error);
    const { statusCode, payload } = buildHttpErrorResponse(error);
    return res.status(statusCode).json(payload);
  } finally {
    await session.endSession();
  }
};

exports.approveTransaction = async (req, res) => {
  if (DEBUG) console.log("=== APPROVE TRANSACTION ===", req.params);

  const session = await mongoose.startSession();
  const actor = getRequestActor(req, "Admin");
  let result;

  try {
    await session.withTransaction(async () => {
      const transaction = await Transaction.findOne({
        id: req.params.transactionId,
        status: "pending",
      }).session(session);

      if (!transaction) {
        throw new TransactionError(
          "Transaction not found or already processed",
          404,
        );
      }

      result = await approveTransactionService({
        transaction,
        approverName: actor.name,
        session,
      });
    });

    clearCustomerCache();

    if (result.notification) {
      void sendPostCommitNotification(result.notification);
    }

    return res.json({
      success: true,
      message: result.message,
      transaction: {
        id: result.transaction.id,
        type: result.transaction.type,
        amount: result.transaction.amount,
        charges: result.transaction.charges,
        netAmount: result.transaction.netAmount,
        balanceDelta: result.transaction.balanceDelta,
        status: result.transaction.status,
        newBalance: result.newBalance,
        approvedBy: result.transaction.approvedBy,
        autoDebitAmount: result.overdraftResult?.autoDebit || 0,
        overdraftCleared: result.overdraftResult?.overdraftCleared || false,
      },
      customer: result.customer
        ? {
            id: result.customer.id,
            name: result.customer.name,
            newBalance: result.newBalance,
            hasActiveOverdraft: Boolean(result.customer.hasActiveOverdraft),
          }
        : null,
    });
  } catch (error) {
    console.error("Approve transaction error:", error);
    const { statusCode, payload } = buildHttpErrorResponse(error);
    return res.status(statusCode).json(payload);
  } finally {
    await session.endSession();
  }
};

exports.getRevenueSummary = async (req, res) => {
  try {
    const { period } = req.query; // 'daily', 'weekly', 'monthly', 'yearly', 'all'

    // 1. Calculate the Start Date based on the period requested
    const startDate = new Date();
    if (period === "daily") {
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "weekly") {
      startDate.setDate(startDate.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "monthly") {
      startDate.setMonth(startDate.getMonth() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else if (period === "yearly") {
      startDate.setFullYear(startDate.getFullYear() - 1);
      startDate.setHours(0, 0, 0, 0);
    } else {
      // If 'all', set to a very old date
      startDate.setFullYear(1970);
    }

    // 2. Run Aggregation for Transactions (Revenue)
    const revenueStats = await Transaction.aggregate([
      {
        $match: {
          status: "approved",
          date: { $gte: startDate }, // THIS IS THE KEY FIX: Filter by date
        },
      },
      {
        $group: {
          _id: null,
          transactionCharges: { $sum: "$charges" },
          loanInterest: {
            $sum: {
              $cond: [{ $eq: ["$type", "interest_revenue"] }, "$amount", 0],
            },
          },
          overdraftCharges: {
            $sum: {
              $cond: [
                { $eq: ["$type", "overdraft_charges_revenue"] },
                "$amount",
                0,
              ],
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          transactionCharges: 1,
          loanInterest: 1,
          overdraftCharges: 1,
          totalInflow: {
            $add: ["$transactionCharges", "$loanInterest", "$overdraftCharges"],
          },
        },
      },
    ]);

    // 3. Run Aggregation for Expenses
    // We must calculate expenses for the same period to get accurate Net Profit
    const expenseStats = await Expense.aggregate([
      {
        $match: {
          date: { $gte: startDate },
        },
      },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: "$amount" },
        },
      },
    ]);

    // 4. Combine Results
    const revenue = revenueStats[0] || {
      transactionCharges: 0,
      loanInterest: 0,
      overdraftCharges: 0,
      totalInflow: 0,
    };

    const totalExpenses = expenseStats[0]?.totalExpenses || 0;
    const netProfit = revenue.totalInflow - totalExpenses;

    // 5. Return structured data to the frontend
    res.json({
      success: true,
      data: {
        ...revenue,
        totalExpenses: totalExpenses,
        netProfit: netProfit,
      },
    });
  } catch (error) {
    console.error("Revenue Summary Error:", error);
    res.status(500).json({ error: error.message });
  }
};
exports.rejectTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const { rejectedBy, reason } = req.body;
    const actor = getRequestActor(req, "Admin");

    const transaction = await Transaction.findOne({ id: transactionId });

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ error: "Transaction already processed" });
    }

    transaction.status = "rejected";
    transaction.rejectedBy = actor.name || getPersonName(rejectedBy, "Admin");
    transaction.rejectedAt = new Date();
    transaction.rejectionReason = reason || "";

    await transaction.save();

    return res.json({
      success: true,
      message: "Transaction rejected",
      transaction: { id: transaction.id, status: transaction.status },
    });
  } catch (error) {
    console.error("Reject transaction error:", error);
    return res.status(500).json({ error: error.message });
  }
};

exports.getAllTransactions = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 1000);
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      Transaction.find({})
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Transaction.countDocuments(),
    ]);

    return res.json({
      success: true,
      count: transactions.length,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Get all transactions error:", error);
    return res.status(500).json({ error: error.message });
  }
};

exports.getTransactionsByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;

    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const skip = (page - 1) * limit;

    const customer = await findCustomerRobustly(customerId, false);

    if (!customer) {
      return res.status(404).json({
        success: false,
        error: "Customer not found",
        debugInfo: `Tried: ${customerId}`,
      });
    }

    const possibleCustomerIds = [
      customer.id,
      customer._id?.toString(),
      customer.customerId,
      customer.customerNumber,
      customerId,
      String(customer.id || ""),
      String(customer.customerNumber || ""),
    ]
      .filter(Boolean)
      .map((value) => String(value));

    const query = {
      customerId: { $in: possibleCustomerIds },
    };

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ date: -1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Transaction.countDocuments(query),
    ]);

    return res.json({
      success: true,
      count: transactions.length,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
      customerDebug: {
        searchedCustomerId: customerId,
        matchedIds: possibleCustomerIds,
      },
    });
  } catch (error) {
    console.error("Get customer transactions error:", error);
    return res.status(500).json({ error: error.message });
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
      const result = {
        deposits: { count: 0, totalAmount: 0, totalCharges: 0 },
        withdrawals: { count: 0, totalAmount: 0, totalCharges: 0 },
        overdraft_repayments: { count: 0, totalAmount: 0, totalCharges: 0 },
      };

      const keyMap = {
        deposit: "deposits",
        withdrawal: "withdrawals",
        overdraft_repayment: "overdraft_repayments",
      };

      stats.forEach((stat) => {
        const responseKey = keyMap[stat._id];
        if (responseKey) {
          result[responseKey] = {
            count: stat.count,
            totalAmount: stat.totalAmount,
            totalCharges: stat.totalCharges,
          };
        }
      });

      return result;
    };

    return res.json({
      success: true,
      today: format(todayStats),
      thisMonth: format(monthStats),
    });
  } catch (error) {
    console.error("Get transaction stats error:", error);
    return res.status(500).json({ error: error.message });
  }
};

exports.getPendingTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: "pending" })
      .sort({ requestedAt: -1, createdAt: -1 })
      .limit(100)
      .lean();

    return res.json({
      success: true,
      count: transactions.length,
      transactions,
    });
  } catch (error) {
    console.error("Get pending transactions error:", error);
    return res.status(500).json({ error: error.message });
  }
};

exports.getTransactionsByStaff = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { requestedById: req.params.staffId },
        { staffId: req.params.staffId },
      ],
    };

    const [transactions, total] = await Promise.all([
      Transaction.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),

      Transaction.countDocuments(query),
    ]);

    return res.json({
      success: true,
      count: transactions.length,
      transactions,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error("Get transactions by staff error:", error);
    return res.status(500).json({ error: error.message });
  }
};
// New Bulk Approval Endpoint

exports.bulkApproveTransactions = async (req, res) => {
  const session = await mongoose.startSession();
  const actor = getRequestActor(req, "Admin");
  const results = [];
  const notifications = [];

  try {
    const rawTransactionIds = req.body?.transactionIds;

    if (!Array.isArray(rawTransactionIds) || rawTransactionIds.length === 0) {
      throw new TransactionError("No transaction IDs provided", 400);
    }

    const transactionIds = [...new Set(rawTransactionIds.map(String))];

    await session.withTransaction(async () => {
      // withTransaction may retry the callback after transient MongoDB errors.
      // Reset callback-owned arrays so retries cannot duplicate the response.
      results.length = 0;
      notifications.length = 0;

      const transactions = await Transaction.find({
        id: { $in: transactionIds },
        status: "pending",
      }).session(session);

      if (transactions.length !== transactionIds.length) {
        const foundIds = new Set(transactions.map((item) => item.id));
        const missingOrProcessed = transactionIds.filter(
          (id) => !foundIds.has(id),
        );

        throw new TransactionError(
          "One or more transactions were not found or already processed",
          409,
          { transactionIds: missingOrProcessed },
        );
      }

      const transactionById = new Map(
        transactions.map((transaction) => [transaction.id, transaction]),
      );

      // Preserve the order supplied by the frontend.
      for (const transactionId of transactionIds) {
        const transaction = transactionById.get(transactionId);
        const result = await approveTransactionService({
          transaction,
          approverName: actor.name,
          session,
        });

        results.push({
          id: result.transaction.id,
          type: result.transaction.type,
          customerId: result.customer?.id || null,
          newBalance: result.newBalance,
          status: result.transaction.status,
        });

        if (result.notification) notifications.push(result.notification);
      }
    });

    clearCustomerCache();

    for (const notification of notifications) {
      void sendPostCommitNotification(notification);
    }

    return res.json({
      success: true,
      message: `${results.length} transaction${
        results.length === 1 ? "" : "s"
      } approved successfully`,
      results: {
        approved: results.length,
        failed: 0,
        transactions: results,
        errors: [],
      },
    });
  } catch (error) {
    console.error("Bulk Approval Error:", error);
    const { statusCode, payload } = buildHttpErrorResponse(error);
    return res.status(statusCode).json(payload);
  } finally {
    await session.endSession();
  }
};

exports.getTransactionById = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      id: req.params.transactionId,
    }).lean();

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    return res.json({ success: true, transaction });
  } catch (error) {
    console.error("Get transaction by ID error:", error);
    return res.status(500).json({ error: error.message });
  }
};

exports.deleteTransaction = async (req, res) => {
  try {
    const transaction = await Transaction.findOne({
      id: req.params.transactionId,
    });

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (!["pending", "rejected"].includes(transaction.status)) {
      return res.status(409).json({
        error:
          "Approved or voided transactions cannot be deleted. Void the transaction instead.",
      });
    }

    await transaction.deleteOne();

    return res.json({
      success: true,
      message: "Transaction deleted successfully",
    });
  } catch (error) {
    console.error("Delete transaction error:", error);
    return res.status(500).json({ error: error.message });
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

    const extract = (result) => ({
      transactionCharges: result[0]?.charges[0]?.total || 0,
      transactionCount: result[0]?.charges[0]?.count || 0,
      overdraftRevenue: result[0]?.overdraft[0]?.total || 0,
      overdraftCount: result[0]?.overdraft[0]?.count || 0,
      totalRevenue:
        (result[0]?.charges[0]?.total || 0) +
        (result[0]?.overdraft[0]?.total || 0),
    });

    return res.json({
      success: true,
      today: extract(todayResult),
      thisMonth: extract(monthResult),
    });
  } catch (error) {
    console.error("Get revenue stats error:", error);
    return res.status(500).json({ error: error.message });
  }
};

async function reverseOverdraftAutoDebit({
  transaction,
  voidedByName,
  voidedAt,
  session,
}) {
  const repaymentAmount = toNumber(transaction.autoDebitAmount);
  if (repaymentAmount <= 0) {
    return { restoreOverdraftFlags: false, loan: null };
  }

  if (!transaction.loanId) {
    throw new TransactionError(
      "This auto-debit transaction has no loan reference and cannot be reversed safely",
      409,
    );
  }

  const loan = await Loan.findOne({ id: transaction.loanId }).session(session);
  if (!loan) {
    throw new TransactionError(
      "The overdraft linked to this transaction could not be found",
      404,
    );
  }

  const principalPortion = toNumber(transaction.principalPortion);
  const chargesPortion = toNumber(transaction.chargesPortion);

  loan.amountRepaid = Math.max(
    0,
    toNumber(loan.amountRepaid) - repaymentAmount,
  );
  loan.outstandingBalance = Math.min(
    toNumber(loan.totalPayable),
    toNumber(loan.outstandingBalance) + repaymentAmount,
  );
  loan.principalRepaidToDate = Math.max(
    0,
    toNumber(loan.principalRepaidToDate) - principalPortion,
  );
  loan.chargesPaidToDate = Math.max(
    0,
    toNumber(loan.chargesPaidToDate) - chargesPortion,
  );
  loan.chargesRevenueRecorded = Math.max(
    0,
    toNumber(loan.chargesRevenueRecorded) - chargesPortion,
  );
  loan.outstandingPrincipal = Math.max(
    0,
    toNumber(loan.amount) - toNumber(loan.principalRepaidToDate),
  );
  loan.outstandingCharges = Math.max(
    0,
    toNumber(loan.processingCharges) - toNumber(loan.chargesPaidToDate),
  );
  loan.status = "active";
  loan.completedAt = undefined;

  if (Array.isArray(loan.repayments) && loan.repayments[0]) {
    const repayment = loan.repayments[0];
    repayment.paidAmount = Math.max(
      0,
      toNumber(repayment.paidAmount) - repaymentAmount,
    );
    repayment.principalPortion = Math.max(
      0,
      toNumber(repayment.principalPortion) - principalPortion,
    );
    repayment.chargesPortion = Math.max(
      0,
      toNumber(repayment.chargesPortion) - chargesPortion,
    );
    repayment.status = "pending";

    if (repayment.paidAmount <= 0) {
      repayment.paidDate = undefined;
      repayment.paidBy = undefined;
    }

    loan.markModified("repayments");
  }

  await loan.save({ session });

  await Transaction.updateMany(
    {
      originalTransactionId: transaction.id,
      status: "approved",
      type: {
        $in: ["overdraft_repayment", "overdraft_charges_revenue"],
      },
    },
    {
      $set: {
        status: "voided",
        voidedBy: voidedByName,
        voidedAt,
        voidReason: `Automatically voided with original transaction ${transaction.id}`,
      },
    },
    { session },
  );

  return { restoreOverdraftFlags: true, loan };
}

exports.voidTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  const actor = getRequestActor(req, "Admin");
  let responseData;

  try {
    await session.withTransaction(async () => {
      const transaction = await Transaction.findOne({
        id: req.params.transactionId,
        status: "approved",
      }).session(session);

      if (!transaction) {
        throw new TransactionError(
          "Transaction not found or it is not approved",
          404,
        );
      }

      if (!["deposit", "withdrawal"].includes(transaction.type)) {
        throw new TransactionError(
          `Cannot void transaction type: ${transaction.type}`,
          400,
        );
      }

      const customer = await findCustomerRobustly(transaction.customerId, {
        session,
        useCache: false,
      });

      if (!customer) {
        throw new TransactionError("Customer not found", 404);
      }

      const calculated = calculateTransactionAmounts(
        transaction.type,
        transaction.amount,
        transaction.charges,
      );

      const hasStoredBalanceDelta =
        transaction.balanceDelta !== undefined &&
        transaction.balanceDelta !== null &&
        Number.isFinite(Number(transaction.balanceDelta));

      if (toNumber(transaction.autoDebitAmount) > 0 && !hasStoredBalanceDelta) {
        throw new TransactionError(
          "This legacy auto-debit transaction has no stored balance effect and cannot be reversed safely",
          409,
        );
      }

      const originalBalanceDelta = hasStoredBalanceDelta
        ? Number(transaction.balanceDelta)
        : calculated.balanceDelta;
      const reversalDelta = -originalBalanceDelta;
      const voidedAt = new Date();

      const overdraftReversal = await reverseOverdraftAutoDebit({
        transaction,
        voidedByName: actor.name,
        voidedAt,
        session,
      });

      const customerUpdate = {
        $inc: {
          cashBalance: reversalDelta,
          balance: reversalDelta,
          ...buildCustomerStatsIncrement(
            transaction.type,
            calculated.netAmount,
            calculated.charges,
            -1,
          ),
        },
      };

      if (overdraftReversal.restoreOverdraftFlags) {
        customerUpdate.$set = {
          hasActiveOverdraft: true,
          hasActiveLoan: true,
          activeLoanId: transaction.loanId,
        };
      }

      const updatedCustomer = await Customer.findOneAndUpdate(
        getCustomerUpdateQuery(customer),
        customerUpdate,
        { new: true, session },
      ).lean();

      if (!updatedCustomer) {
        throw new TransactionError("Customer update failed", 400);
      }

      const reversalBalance = getBalance(updatedCustomer);

      const reversalTransaction = new Transaction({
        id: generateTransactionId("REV"),
        customerId: transaction.customerId,
        customerName: transaction.customerName,
        customerPhone: transaction.customerPhone || "",
        type: "reversal",
        amount: calculated.amount,
        charges: 0,
        netAmount: Math.abs(reversalDelta),
        balanceDelta: reversalDelta,
        description: `Reversal of ${transaction.type} ${transaction.id}. Reason: ${
          req.body?.reason || "No reason provided"
        }`,
        status: "approved",
        requestedBy: actor.name,
        requestedById: actor.id,
        staffName: actor.name,
        staffId: actor.id,
        approvedBy: actor.name,
        approvedAt: voidedAt,
        originalTransactionId: transaction.id,
        loanId: transaction.loanId || null,
        date: voidedAt,
        finalBalance: reversalBalance,
      });

      await reversalTransaction.save({ session });

      transaction.status = "voided";
      transaction.voidedBy = actor.name;
      transaction.voidedAt = voidedAt;
      transaction.voidReason = req.body?.reason || "";
      transaction.reversalBalance = reversalBalance;
      transaction.reversalTransactionId = reversalTransaction.id;
      await transaction.save({ session });

      responseData = {
        transaction,
        reversalTransaction,
        customer: updatedCustomer,
        reversalBalance,
      };
    });

    clearCustomerCache();

    return res.json({
      success: true,
      message: `Transaction ${responseData.transaction.id} voided`,
      transaction: {
        id: responseData.transaction.id,
        status: responseData.transaction.status,
        originalType: responseData.transaction.type,
        reversalBalance: responseData.reversalBalance,
      },
      reversalTransaction: {
        id: responseData.reversalTransaction.id,
        amount: responseData.reversalTransaction.amount,
        balanceDelta: responseData.reversalTransaction.balanceDelta,
      },
      customer: {
        id: responseData.customer.id,
        name: responseData.customer.name,
        newBalance: responseData.reversalBalance,
      },
    });
  } catch (error) {
    console.error("Void transaction error:", error);
    const { statusCode, payload } = buildHttpErrorResponse(error);
    return res.status(statusCode).json(payload);
  } finally {
    await session.endSession();
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

    return res.json({
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
    return res.status(500).json({ error: error.message });
  }
};
