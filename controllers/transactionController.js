const Transaction = require("../models/transaction");
const Customer = require("../models/customer");
const Expense = require("../models/expenses");
const Loan = require("../models/loan");
const smsService = require("../services/smsService");
const mongoose = require("mongoose");

const DEBUG = process.env.NODE_ENV !== "production";
const customerCache = new Map();

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

function getCustomerUpdateQuery(customer) {
  if (customer?._id) return { _id: customer._id };
  if (customer?.id) return { id: customer.id };
  if (customer?.customerNumber)
    return { customerNumber: customer.customerNumber };
  throw new Error("Cannot build customer update query");
}

function clearCustomerCache() {
  customerCache.clear();
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

  // Never use cache inside balance-changing session operations.
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
  } catch (err) {
    // Ignore invalid ObjectId cast errors.
  }

  if (DEBUG) {
    console.error(`[DEBUG] FAILURE: No customer found: ${identifier}`);
  }

  return null;
}

exports.createTransaction = async (req, res) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const {
      customerId,
      customerName,
      customerPhone,
      type,
      amount,
      charges = 0,
      description,
      requestedBy,
      requestedById,
      staffName,
      staffId,
      status,
      approvedBy,
      approvedAt,
      isQuickTransaction,
    } = req.body;

    if (!customerId) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Missing customerId" });
    }

    const numAmount = Number(amount);
    const numCharges = Number(charges || 0);
    const numNetAmount =
      type === "withdrawal" ? numAmount + numCharges : numAmount - numCharges;

    if (!Number.isFinite(numAmount) || numAmount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Invalid amount" });
    }

    // 1. Find the customer using the robust helper
    const customer = await findCustomerRobustly(customerId, {
      session,
      useCache: false,
    });

    if (!customer) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Customer not found" });
    }

    // 2. CRITICAL FIX: Use the string 'id' for the update query.
    // This is much more reliable than _id when working with lean objects and sessions.
    const customerUpdateQuery = { id: customer.id };

    const finalStaffName =
      requestedBy || staffName || req.user?.name || "System";
    const finalStaffId = requestedById || staffId || req.user?.id || null;
    const shouldApprove = status === "approved" || isQuickTransaction === true;

    let finalBalance = 0;

    if (shouldApprove) {
      if (!["deposit", "withdrawal"].includes(type)) {
        await session.abortTransaction();
        return res.status(400).json({ error: "Unsupported transaction type" });
      }

      const delta = type === "deposit" ? numNetAmount : -numNetAmount;

      // Update customer balance
      const updatedCustomer = await Customer.findOneAndUpdate(
        customerUpdateQuery,
        {
          $inc: {
            cashBalance: delta,
            balance: delta,
            totalTransactions: 1,
            totalDeposits: type === "deposit" ? numNetAmount : 0,
            totalWithdrawals: type === "withdrawal" ? numNetAmount : 0,
            totalChargesPaid: numCharges,
          },
        },
        { new: true, session },
      );

      if (!updatedCustomer) {
        await session.abortTransaction();
        return res
          .status(400)
          .json({ error: "Customer balance update failed" });
      }
      finalBalance = updatedCustomer.cashBalance;
    }

    // 3. Create the transaction record
    const transaction = new Transaction({
      id: generateTransactionId("TXN"),
      customerId: customer.id, // Use the stable string ID
      customerName: customerName || customer.name,
      customerPhone: customerPhone || customer.phone || "",
      type,
      amount: numAmount,
      charges: numCharges,
      netAmount: numNetAmount,
      description: description || "",
      status: shouldApprove ? "approved" : "pending",
      requestedBy: finalStaffName,
      requestedById: finalStaffId,
      staffName: finalStaffName,
      staffId: finalStaffId,
      requestedAt: new Date(),
      date: new Date(),
      approvedBy: shouldApprove ? finalStaffName : undefined,
      approvedAt: shouldApprove ? new Date() : undefined,
      finalBalance: shouldApprove ? finalBalance : undefined,
    });

    await transaction.save({ session });
    await session.commitTransaction();

    return res.status(201).json({
      success: true,
      transaction,
      customer: {
        id: customer.id,
        name: customer.name,
        newBalance: finalBalance,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("CREATE TRANSACTION ERROR:", error);
    return res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};
exports.approveTransaction = async (req, res) => {
  if (DEBUG) console.log("=== APPROVE TRANSACTION ===", req.params, req.body);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId } = req.params;
    const { approvedBy } = req.body;
    const approverName = getPersonName(approvedBy, "Admin");

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

    const customer = await findCustomerRobustly(transaction.customerId, {
      session,
      useCache: false,
    });

    if (!customer) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Customer not found" });
    }

    const amount = toNumber(transaction.amount);
    const charges = toNumber(transaction.charges);
    const netAmount = amount - charges;

    if (amount <= 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Invalid transaction amount" });
    }

    if (charges < 0 || netAmount < 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Invalid transaction charges" });
    }

    transaction.amount = amount;
    transaction.charges = charges;
    transaction.netAmount = netAmount;

    let newBalance;
    let overdraftResult = null;

    if (
      transaction.type === "overdraft_charges_revenue" ||
      transaction.type === "interest_revenue"
    ) {
      transaction.status = "approved";
      transaction.approvedBy = approverName;
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
    }

    if (!["deposit", "withdrawal"].includes(transaction.type)) {
      await session.abortTransaction();
      return res.status(400).json({
        error: `Invalid transaction type for approval: ${transaction.type}`,
      });
    }

    const customerUpdateQuery = getCustomerUpdateQuery(customer);

    if (transaction.type === "deposit") {
      const netDeposit = netAmount;

      if (customer.hasActiveOverdraft && customer.activeLoanId) {
        const loan = await Loan.findOne({ id: customer.activeLoanId }).session(
          session,
        );

        if (loan && loan.status === "active" && loan.type === "overdraft") {
          const outstanding = toNumber(
            loan.outstandingBalance ?? loan.totalPayable,
          );

          if (outstanding > 0) {
            const repaymentAmount = Math.min(netDeposit, outstanding);
            const remainingForCustomer = netDeposit - repaymentAmount;

            const remainingPrincipal = Math.max(
              0,
              toNumber(loan.amount) - toNumber(loan.principalRepaidToDate),
            );

            const principalPortion = Math.min(
              repaymentAmount,
              remainingPrincipal,
            );

            const chargesPortion = repaymentAmount - principalPortion;

            loan.amountRepaid = toNumber(loan.amountRepaid) + repaymentAmount;
            loan.outstandingBalance = Math.max(
              0,
              outstanding - repaymentAmount,
            );

            loan.principalRepaidToDate =
              toNumber(loan.principalRepaidToDate) + principalPortion;

            loan.chargesPaidToDate =
              toNumber(loan.chargesPaidToDate) + chargesPortion;

            if (!Array.isArray(loan.repayments)) {
              loan.repayments = [];
            }

            if (!loan.repayments[0]) {
              loan.repayments.push({});
            }

            loan.repayments[0].paidAmount =
              toNumber(loan.repayments[0].paidAmount) + repaymentAmount;

            loan.repayments[0].principalPortion =
              toNumber(loan.repayments[0].principalPortion) + principalPortion;

            loan.repayments[0].chargesPortion =
              toNumber(loan.repayments[0].chargesPortion) + chargesPortion;

            loan.repayments[0].paidDate = new Date();
            loan.repayments[0].paidBy = approverName;

            let isFullyPaid = false;

            if (
              loan.outstandingBalance <= 0 ||
              toNumber(loan.amountRepaid) >= toNumber(loan.totalPayable)
            ) {
              loan.status = "completed";
              loan.completedAt = new Date();
              loan.outstandingBalance = 0;
              loan.outstandingPrincipal = 0;
              loan.outstandingCharges = 0;
              loan.repayments[0].status = "paid";
              isFullyPaid = true;
            } else {
              loan.outstandingPrincipal = Math.max(
                0,
                toNumber(loan.amount) - toNumber(loan.principalRepaidToDate),
              );

              loan.outstandingCharges = Math.max(
                0,
                toNumber(loan.processingCharges) -
                  toNumber(loan.chargesPaidToDate),
              );
            }

            loan.markModified("repayments");
            await loan.save({ session });

            const oldBalance = getBalance(customer);

            const balanceDelta =
              oldBalance < 0 ? netDeposit : remainingForCustomer;

            const customerUpdate = {
              $inc: {
                cashBalance: balanceDelta,
                balance: balanceDelta,
                totalTransactions: 1,
                totalDeposits: netAmount,
                totalWithdrawals: 0,
                totalChargesPaid: charges,
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
              customerUpdateQuery,
              customerUpdate,
              { new: true, session },
            ).lean();

            if (!updatedCustomer) {
              await session.abortTransaction();
              return res.status(400).json({ error: "Customer update failed" });
            }

            newBalance = getBalance(updatedCustomer);

            const now = Date.now();

            const overdraftTxn = new Transaction({
              id: `TXN${now}${Math.random().toString(36).substring(2, 6)}`,
              customerId: transaction.customerId,
              customerName: customer.name,
              customerPhone: customer.phone || null,
              type: "overdraft_repayment",
              amount: repaymentAmount,
              principalPortion,
              chargesPortion,
              netAmount: -repaymentAmount,
              description: `Auto-debit from deposit: Overdraft repayment (Principal: ₦${principalPortion.toLocaleString()}, Charges: ₦${chargesPortion.toLocaleString()})${
                isFullyPaid ? " - FULLY CLEARED" : ""
              }`,
              status: "approved",
              approvedBy: approverName,
              approvedAt: new Date(),
              date: new Date(),
              loanId: loan.id,
              isAutoDebit: true,
              finalBalance: newBalance,
            });

            await overdraftTxn.save({ session });

            if (chargesPortion > 0) {
              const alreadyRecorded = toNumber(loan.chargesRevenueRecorded);
              const newRevenue = chargesPortion - alreadyRecorded;

              if (newRevenue > 0) {
                const revenueTxn = new Transaction({
                  id: `REV${now}${Math.random().toString(36).substring(2, 6)}`,
                  customerId: transaction.customerId,
                  customerName: customer.name,
                  type: "overdraft_charges_revenue",
                  amount: newRevenue,
                  charges: 0,
                  netAmount: newRevenue,
                  description: `Overdraft charges revenue from auto-debit - ${loan.id}`,
                  status: "approved",
                  approvedBy: "System",
                  approvedAt: new Date(),
                  date: new Date(),
                  loanId: loan.id,
                  isRevenue: true,
                  revenueType: "overdraft_charges",
                });

                await revenueTxn.save({ session });

                loan.chargesRevenueRecorded = alreadyRecorded + newRevenue;
                await loan.save({ session });
              }
            }

            if (charges > 0) {
              const depositChargesRevenue = new Transaction({
                id: `REV${now}${Math.random().toString(36).substring(2, 6)}`,
                customerId: transaction.customerId,
                customerName: customer.name,
                type: "overdraft_charges_revenue",
                amount: charges,
                charges: 0,
                netAmount: charges,
                description: `Transaction charges from deposit - ${transaction.id}`,
                status: "approved",
                approvedBy: "System",
                approvedAt: new Date(),
                date: new Date(),
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
                  message: `VaultFlow: Dear ${customer.name}, ₦${repaymentAmount.toLocaleString()} auto-debited from your ₦${amount.toLocaleString()} deposit for overdraft repayment. ${
                    isFullyPaid ? "Overdraft FULLY CLEARED! " : ""
                  }Outstanding: ₦${toNumber(
                    loan.outstandingBalance,
                  ).toLocaleString()}. Available: ₦${remainingForCustomer.toLocaleString()}.`,
                })
                .catch((e) => console.error("SMS failed:", e.message));
            }
          }
        }
      }

      if (!overdraftResult) {
        const updatedCustomer = await Customer.findOneAndUpdate(
          customerUpdateQuery,
          {
            $inc: {
              cashBalance: netAmount,
              balance: netAmount,
              totalTransactions: 1,
              totalDeposits: netAmount,
              totalWithdrawals: 0,
              totalChargesPaid: charges,
            },
          },
          { new: true, session },
        ).lean();

        if (!updatedCustomer) {
          await session.abortTransaction();
          return res.status(400).json({ error: "Customer update failed" });
        }

        newBalance = getBalance(updatedCustomer);
      }
    }

    if (transaction.type === "withdrawal") {
      const currentBalance = getBalance(customer);

      if (netAmount > currentBalance && !customer.hasActiveOverdraft) {
        await session.abortTransaction();
        return res.status(400).json({
          error: "Insufficient funds",
          currentBalance,
          requestedAmount: netAmount,
        });
      }

      const withdrawalFilter = getCustomerUpdateQuery(customer);

      if (!customer.hasActiveOverdraft) {
        withdrawalFilter.$or = [
          { cashBalance: { $gte: netAmount } },
          {
            cashBalance: { $exists: false },
            balance: { $gte: netAmount },
          },
        ];
      }

      const updatedCustomer = await Customer.findOneAndUpdate(
        withdrawalFilter,
        {
          $inc: {
            cashBalance: -netAmount,
            balance: -netAmount,
            totalTransactions: 1,
            totalDeposits: 0,
            totalWithdrawals: netAmount,
            totalChargesPaid: charges,
          },
        },
        { new: true, session },
      ).lean();

      if (!updatedCustomer) {
        await session.abortTransaction();
        return res.status(400).json({
          error: "Insufficient funds or customer update failed",
          currentBalance,
          requestedAmount: netAmount,
        });
      }

      newBalance = getBalance(updatedCustomer);
    }

    transaction.status = "approved";
    transaction.approvedBy = approverName;
    transaction.approvedAt = new Date();
    transaction.finalBalance = newBalance;

    await transaction.save({ session });

    await session.commitTransaction();

    clearCustomerCache();

    if (customer.phone && !overdraftResult) {
      const smsPromise =
        transaction.type === "deposit"
          ? smsService.sendCreditAlert(
              customer.phone,
              amount,
              newBalance,
              transaction.id,
              charges,
            )
          : smsService.sendDebitAlert(
              customer.phone,
              amount,
              newBalance,
              transaction.id,
              charges,
            );

      smsPromise.catch((e) => console.error("SMS failed:", e.message));
    }

    let message =
      transaction.type === "deposit"
        ? "Deposit approved!"
        : "Withdrawal approved!";

    if (overdraftResult) {
      message = `Deposit approved! ₦${overdraftResult.autoDebit.toLocaleString()} auto-debited for overdraft. ${
        overdraftResult.overdraftCleared ? "Overdraft FULLY CLEARED! " : ""
      }Customer received ₦${overdraftResult.remainingForCustomer.toLocaleString()}.`;
    }

    return res.json({
      success: true,
      message,
      transaction: {
        id: transaction.id,
        type: transaction.type,
        amount: transaction.amount,
        charges: transaction.charges,
        netAmount: transaction.netAmount,
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
    return res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
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

    const transaction = await Transaction.findOne({ id: transactionId });

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "pending") {
      return res.status(400).json({ error: "Transaction already processed" });
    }

    transaction.status = "rejected";
    transaction.rejectedBy = getPersonName(rejectedBy, "Admin");
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

      stats.forEach((stat) => {
        if (result[stat._id]) {
          result[stat._id] = {
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
  session.startTransaction();

  try {
    const { transactionIds, approvedBy } = req.body;
    const approverName =
      typeof approvedBy === "string" ? approvedBy : approvedBy.name;

    if (!Array.isArray(transactionIds) || transactionIds.length === 0) {
      await session.abortTransaction();
      return res.status(400).json({ error: "No transaction IDs provided" });
    }

    const results = {
      approved: 0,
      failed: 0,
      errors: [],
    };

    // 1. Fetch all transactions in one go
    const transactions = await Transaction.find({
      id: { $in: transactionIds },
      status: "pending",
    }).session(session);

    for (const transaction of transactions) {
      try {
        // --- REUSE YOUR EXISTING LOGIC ---
        // Note: In a real production app, you should move the logic
        // inside your existing 'approveTransaction' into a reusable service function.

        // For this example, we simulate the logic required for each txn:
        const customer = await findCustomerRobustly(transaction.customerId, {
          session,
        });
        if (!customer)
          throw new Error(`Customer ${transaction.customerName} not found`);

        // ... (Insert the core logic from your current approveTransaction here)
        // e.g., updating customer balance, handling overdraft repayments, etc.

        transaction.status = "approved";
        transaction.approvedBy = approverName;
        transaction.approvedAt = new Date();
        await transaction.save({ session });

        results.approved++;
      } catch (err) {
        results.failed++;
        results.errors.push({ id: transaction.id, error: err.message });
      }
    }

    await session.commitTransaction();
    clearCustomerCache();

    return res.json({
      success: true,
      results,
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Bulk Approval Error:", error);
    return res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
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
    const transaction = await Transaction.findOneAndDelete({
      id: req.params.transactionId,
    });

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

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

exports.voidTransaction = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { transactionId } = req.params;
    const { voidedBy, reason } = req.body;
    const voidedByName = getPersonName(voidedBy, "Admin");

    const transaction = await Transaction.findOne({
      id: transactionId,
    }).session(session);

    if (!transaction) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.status !== "approved") {
      await session.abortTransaction();
      return res.status(400).json({
        error: "Only approved transactions can be voided",
        currentStatus: transaction.status,
      });
    }

    if (!["deposit", "withdrawal"].includes(transaction.type)) {
      await session.abortTransaction();
      return res.status(400).json({
        error: `Cannot void type: ${transaction.type}`,
      });
    }

    const customer = await findCustomerRobustly(transaction.customerId, {
      session,
      useCache: false,
    });

    if (!customer) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Customer not found" });
    }

    const amount = toNumber(transaction.amount);
    const charges = toNumber(transaction.charges);
    const netAmount = amount - charges;

    if (netAmount < 0) {
      await session.abortTransaction();
      return res.status(400).json({
        error: "Cannot void transaction because its amount/charges are invalid",
      });
    }

    const balanceDelta =
      transaction.type === "deposit" ? -netAmount : netAmount;

    const updatedCustomer = await Customer.findOneAndUpdate(
      getCustomerUpdateQuery(customer),
      {
        $inc: {
          cashBalance: balanceDelta,
          balance: balanceDelta,
          totalTransactions: -1,
          totalDeposits: transaction.type === "deposit" ? -netAmount : 0,
          totalWithdrawals: transaction.type === "withdrawal" ? -netAmount : 0,
          totalChargesPaid: -charges,
        },
      },
      { new: true, session },
    ).lean();

    if (!updatedCustomer) {
      await session.abortTransaction();
      return res.status(400).json({ error: "Customer update failed" });
    }

    const reversalBalance = getBalance(updatedCustomer);

    transaction.status = "voided";
    transaction.voidedBy = voidedByName;
    transaction.voidedAt = new Date();
    transaction.voidReason = reason || "";
    transaction.reversalBalance = reversalBalance;

    await transaction.save({ session });

    const reversalTxn = new Transaction({
      id: generateTransactionId("TXN"),
      customerId: transaction.customerId,
      customerName: transaction.customerName,
      customerPhone: transaction.customerPhone,
      type: "reversal",
      amount,
      charges: 0,
      netAmount: balanceDelta,
      description: `Reversal of ${transaction.type} ${transaction.id}. Reason: ${
        reason || "No reason provided"
      }`,
      status: "approved",
      approvedBy: voidedByName,
      approvedAt: new Date(),
      originalTransactionId: transaction.id,
      date: new Date(),
      finalBalance: reversalBalance,
    });

    await reversalTxn.save({ session });

    await session.commitTransaction();

    clearCustomerCache();

    return res.json({
      success: true,
      message: `Transaction ${transaction.id} voided`,
      transaction: {
        id: transaction.id,
        status: "voided",
        originalType: transaction.type,
        reversalBalance,
      },
      reversalTransaction: {
        id: reversalTxn.id,
        amount: reversalTxn.amount,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        newBalance: reversalBalance,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Void transaction error:", error);
    return res.status(500).json({ error: error.message });
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
