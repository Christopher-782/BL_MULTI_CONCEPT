const Loan = require("../models/loan");
const Customer = require("../models/customer");
const Transaction = require("../models/transaction");
const smsService = require("../services/smsService"); // ADDED: Import SMS service
const mongoose = require("mongoose");

// Generate unique ID
function generateId() {
  return "LOAN" + Date.now() + Math.floor(Math.random() * 1000);
}

// Calculate loan details
function calculateLoanDetails(
  amount,
  interestRate,
  repaymentPeriod,
  numberOfInstallments,
) {
  const interest = (amount * interestRate) / 100;
  const totalPayable = amount + interest;
  const installmentAmount = totalPayable / numberOfInstallments;

  return { interest, totalPayable, installmentAmount };
}

// Create loan/overdraft request
exports.createLoanRequest = async (req, res) => {
  try {
    console.log("Received loan request body:", req.body);

    const {
      customerId,
      customerName,
      customerNumber,
      phone,
      type,
      amount,
      interestRate,
      repaymentPeriod,
      numberOfInstallments,
      repaymentStartDate,
      purpose,
      notes,
      requestedBy,
    } = req.body;

    // Validate required fields
    if (!customerId) {
      return res.status(400).json({ error: "Customer ID is required" });
    }
    if (!customerName) {
      return res.status(400).json({ error: "Customer name is required" });
    }
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }
    if (!interestRate || interestRate < 0) {
      return res.status(400).json({ error: "Valid interest rate is required" });
    }
    if (!repaymentPeriod) {
      return res.status(400).json({ error: "Repayment period is required" });
    }
    if (!numberOfInstallments || numberOfInstallments <= 0) {
      return res
        .status(400)
        .json({ error: "Valid number of installments is required" });
    }
    if (!repaymentStartDate) {
      return res
        .status(400)
        .json({ error: "Repayment start date is required" });
    }

    // Validate customer exists
    const customer = await Customer.findOne({ id: customerId });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // For overdraft, check if customer already has active overdraft
    if (type === "overdraft") {
      const activeOverdraft = await Loan.findOne({
        customerId: customerId,
        type: "overdraft",
        status: { $in: ["approved", "active"] },
      });

      if (activeOverdraft) {
        return res
          .status(400)
          .json({ error: "Customer already has an active overdraft" });
      }
    }

    // Calculate loan details
    const { interest, totalPayable, installmentAmount } = calculateLoanDetails(
      amount,
      interestRate,
      repaymentPeriod,
      numberOfInstallments,
    );

    // Calculate end date
    const startDate = new Date(repaymentStartDate);
    let endDate = new Date(startDate);

    if (repaymentPeriod === "weekly") {
      endDate.setDate(startDate.getDate() + numberOfInstallments * 7);
    } else if (repaymentPeriod === "bi-weekly") {
      endDate.setDate(startDate.getDate() + numberOfInstallments * 14);
    } else if (repaymentPeriod === "monthly") {
      endDate.setMonth(startDate.getMonth() + numberOfInstallments);
    }

    // Generate repayment schedule
    const repayments = [];
    let currentDate = new Date(startDate);

    for (let i = 0; i < numberOfInstallments; i++) {
      repayments.push({
        id: "REPAY" + Date.now() + i + Math.random().toString(36).substr(2, 4),
        dueDate: new Date(currentDate),
        amount: installmentAmount,
        status: "pending",
      });

      if (repaymentPeriod === "weekly") {
        currentDate.setDate(currentDate.getDate() + 7);
      } else if (repaymentPeriod === "bi-weekly") {
        currentDate.setDate(currentDate.getDate() + 14);
      } else if (repaymentPeriod === "monthly") {
        currentDate.setMonth(currentDate.getMonth() + 1);
      }
    }

    // Create safe requestedBy object
    const safeRequestedBy = {
      staffId: requestedBy?.staffId || "system",
      staffName: requestedBy?.staffName || "System",
    };

    // Create loan object
    const loan = new Loan({
      id: generateId(),
      customerId,
      customerName,
      customerNumber,
      phone,
      type: type || "loan",
      amount: Number(amount),
      interestRate: Number(interestRate),
      totalPayable,
      repaymentPeriod,
      numberOfInstallments: Number(numberOfInstallments),
      installmentAmount,
      repaymentStartDate: startDate,
      repaymentEndDate: endDate,
      repayments,
      status: "pending",
      requestedBy: safeRequestedBy,
      requestedAt: new Date(),
      purpose: purpose || "",
      notes: notes || "",
      outstandingBalance: totalPayable,
      amountDisbursed: 0,
      amountRepaid: 0,
    });

    await loan.save();
    console.log("✅ Loan saved successfully:", loan.id);

    res.status(201).json({
      success: true,
      message: `${type === "loan" ? "Loan" : "Overdraft"} request submitted successfully`,
      loan: {
        id: loan.id,
        customerName: loan.customerName,
        amount: loan.amount,
        status: loan.status,
        createdAt: loan.createdAt,
      },
    });
  } catch (error) {
    console.error("Create loan request error:", error);
    res.status(500).json({
      error: error.message || "Failed to create loan request",
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};

// Get all loan requests (admin view)
exports.getAllLoans = async (req, res) => {
  try {
    const loans = await Loan.find().sort({ createdAt: -1 });
    res.json(loans);
  } catch (error) {
    console.error("Get all loans error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get loans by staff (staff view)
exports.getLoansByStaff = async (req, res) => {
  try {
    const { staffId } = req.params;
    const loans = await Loan.find({ "requestedBy.staffId": staffId }).sort({
      createdAt: -1,
    });
    res.json(loans);
  } catch (error) {
    console.error("Get loans by staff error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get loans by customer
exports.getLoansByCustomer = async (req, res) => {
  try {
    const { customerId } = req.params;
    const loans = await Loan.find({ customerId }).sort({ createdAt: -1 });
    res.json(loans);
  } catch (error) {
    console.error("Get loans by customer error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Approve loan - CORRECTED VERSION WITH SMS

exports.approveLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { approvedBy } = req.body;

    const loan = await Loan.findOne({ id: loanId });
    if (!loan) {
      return res.status(404).json({ error: "Loan request not found" });
    }

    if (loan.status !== "pending") {
      return res.status(400).json({ error: "Loan already processed" });
    }

    const customer = await Customer.findOne({ id: loan.customerId });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const interest = loan.totalPayable - loan.amount;

    // Update loan status
    loan.status = "active";
    loan.approvedBy = {
      adminId: approvedBy.id,
      adminName: approvedBy.name,
      approvedAt: new Date(),
    };
    loan.amountDisbursed = loan.amount;
    loan.outstandingBalance = loan.totalPayable;
    loan.outstandingPrincipal = loan.amount;
    loan.outstandingInterest = interest;
    loan.autoDebitEnabled = true;

    await loan.save();

    // CREATE DISBURSEMENT TRANSACTION - MAKE SURE netAmount is POSITIVE
    const disbursementTransaction = new Transaction({
      id: "TXN" + Date.now() + Math.random(),
      customerId: loan.customerId,
      customerName: loan.customerName,
      type: "loan_disbursement",
      amount: loan.amount,
      charges: 0,
      netAmount: loan.amount, // KEEP POSITIVE - THIS IS A CREDIT
      description: `Loan disbursement - ${loan.id}`,
      status: "approved",
      requestedBy: approvedBy.name,
      approvedBy: approvedBy.name,
      date: new Date().toISOString(),
    });
    await disbursementTransaction.save();

    // Credit customer's account - ADD the money
    const newCashBalance = (customer.cashBalance || 0) + loan.amount;
    await Customer.findOneAndUpdate(
      { id: loan.customerId },
      {
        $set: {
          cashBalance: newCashBalance,
          balance: newCashBalance,
        },
        $inc: {
          loanBalance: loan.amount,
          totalLoanAmount: loan.amount,
          totalInterestAccrued: interest,
        },
      },
    );

    // Send SMS notification
    if (customer.phone) {
      try {
        await smsService.sendLoanDisbursementAlert(
          customer.phone,
          loan.amount,
          newCashBalance,
          loan.id,
          loan.interestRate,
          loan.totalPayable,
          loan.numberOfInstallments,
          loan.repaymentPeriod,
          loan.installmentAmount,
        );
      } catch (smsError) {
        console.error("SMS failed:", smsError.message);
      }
    }

    res.json({
      success: true,
      message: `✅ Loan approved! ₦${loan.amount.toLocaleString()} disbursed to ${customer.name}'s account.`,
      loan: {
        id: loan.id,
        amount: loan.amount,
        totalPayable: loan.totalPayable,
        status: loan.status,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        newBalance: newCashBalance,
        loanBalance: (customer.loanBalance || 0) + loan.amount,
      },
    });
  } catch (error) {
    console.error("Approve loan error:", error);
    res.status(500).json({ error: error.message });
  }
};
// Reject loan request
exports.rejectLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { rejectedBy, reason } = req.body;

    const loan = await Loan.findOne({ id: loanId });
    if (!loan) {
      return res.status(404).json({ error: "Loan request not found" });
    }

    if (loan.status !== "pending") {
      return res.status(400).json({ error: "Loan request already processed" });
    }

    loan.status = "rejected";
    loan.notes = reason;

    await loan.save();

    res.json({
      message: `${loan.type === "loan" ? "Loan" : "Overdraft"} request rejected`,
      loan,
    });
  } catch (error) {
    console.error("Reject loan error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Record repayment - ATOMIC VERSION with immediate balance deduction
// Record repayment - INTEREST REVENUE RECOGNIZED ON PAYMENT (not disbursement)
exports.recordRepayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { loanId, repaymentId } = req.params;
    const { paidBy, paymentAmount } = req.body;

    const loan = await Loan.findOne({ id: loanId }).session(session);
    if (!loan) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Loan not found" });
    }

    const repaymentIndex = loan.repayments.findIndex(
      (r) => r.id === repaymentId,
    );
    if (repaymentIndex === -1) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Repayment schedule not found" });
    }

    const repayment = loan.repayments[repaymentIndex];
    if (repayment.status === "paid") {
      await session.abortTransaction();
      return res.status(400).json({
        error: "This installment has already been paid",
        paidDate: repayment.paidDate,
      });
    }

    const customer = await Customer.findOne({ id: loan.customerId }).session(
      session,
    );
    if (!customer) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Customer not found" });
    }

    const repaymentAmount = paymentAmount || repayment.amount || 0;
    const availableBalance = customer.cashBalance || customer.balance || 0;

    if (repaymentAmount > availableBalance) {
      await session.abortTransaction();
      return res.status(400).json({
        error: "Insufficient funds for loan repayment",
        availableBalance,
        requestedRepayment: repaymentAmount,
        shortfall: repaymentAmount - availableBalance,
      });
    }

    // 🔴 KEY CHANGE: Calculate interest revenue for THIS installment only
    const totalInterest = loan.totalPayable - loan.amount;
    const interestRatio = totalInterest / loan.totalPayable;

    // Interest portion for this specific payment
    const interestPortion = repaymentAmount * interestRatio;
    const principalPortion = repaymentAmount - interestPortion;

    // Update repayment record with breakdown
    repayment.status = "paid";
    repayment.paidDate = new Date();
    repayment.paidBy = paidBy || "Customer";
    repayment.paidAmount = repaymentAmount;
    repayment.principalPortion = principalPortion;
    repayment.interestPortion = interestPortion;
    repayment.interestRevenue = interestPortion; // 💰 REVENUE RECOGNIZED NOW!

    // Update loan totals
    loan.amountRepaid = (loan.amountRepaid || 0) + repaymentAmount;
    loan.outstandingBalance = Math.max(
      0,
      loan.totalPayable - loan.amountRepaid,
    );

    // 🔴 KEY CHANGE: Track cumulative principal and interest separately
    loan.principalRepaidToDate =
      (loan.principalRepaidToDate || 0) + principalPortion;
    loan.interestEarnedToDate =
      (loan.interestEarnedToDate || 0) + interestPortion;

    // Check completion
    const wasCompleted = loan.status === "completed";
    if (
      loan.outstandingBalance <= 0 ||
      loan.amountRepaid >= loan.totalPayable
    ) {
      loan.status = "completed";
      loan.completedAt = new Date();
      loan.outstandingBalance = 0;
    }

    // Deduct from customer balance
    const updatedCustomer = await Customer.findOneAndUpdate(
      { id: loan.customerId },
      {
        $inc: {
          cashBalance: -repaymentAmount,
          balance: -repaymentAmount,
          loanBalance: -principalPortion,
          totalRepaid: repaymentAmount,
        },
      },
      { new: true, session },
    );

    await loan.save({ session });

    // Create transaction record
    const transaction = new Transaction({
      id: "TXN" + Date.now() + Math.random().toString(36).substr(2, 4),
      customerId: loan.customerId,
      customerName: loan.customerName,
      customerPhone: customer.phone || null,
      type: "loan_repayment",
      amount: repaymentAmount,
      principalPortion: principalPortion,
      interestPortion: interestPortion,
      interestRevenue: interestPortion, // Track revenue in transaction too
      charges: 0,
      netAmount: -repaymentAmount,
      description: `Loan repayment #${repaymentIndex + 1}/${loan.numberOfInstallments} (Principal: ₦${principalPortion.toLocaleString()}, Interest: ₦${interestPortion.toLocaleString()})`,
      status: "approved",
      requestedBy: paidBy || "Customer",
      approvedBy: paidBy || "System",
      date: new Date().toISOString(),
      loanId: loan.id,
      repaymentId: repaymentId,
    });
    await transaction.save({ session });

    // 🔴 KEY CHANGE: Record interest revenue transaction for accounting
    if (interestPortion > 0) {
      const revenueTransaction = new Transaction({
        id: "REV" + Date.now() + Math.random().toString(36).substr(2, 4),
        customerId: loan.customerId,
        customerName: loan.customerName,
        type: "interest_revenue", // New type for revenue tracking
        amount: interestPortion,
        netAmount: interestPortion, // Positive = revenue to company
        description: `Interest revenue from loan ${loan.id} - Installment ${repaymentIndex + 1}`,
        status: "approved",
        approvedBy: "System",
        date: new Date().toISOString(),
        loanId: loan.id,
        repaymentId: repaymentId,
        isRevenue: true, // Flag for revenue reports
      });
      await revenueTransaction.save({ session });
    }

    await session.commitTransaction();

    // Send SMS
    if (customer.phone) {
      try {
        await smsService.sendDebitAlert(
          customer.phone,
          repaymentAmount,
          updatedCustomer.cashBalance,
          transaction.id,
          0,
        );

        if (loan.status === "completed" && !wasCompleted) {
          await smsService.sendLoanCompletedAlert(
            customer.phone,
            customer.name,
            loan.id,
            loan.amountRepaid,
            totalInterest,
          );
        }
      } catch (smsError) {
        console.error("SMS failed:", smsError.message);
      }
    }

    res.json({
      success: true,
      message:
        loan.status === "completed"
          ? "🎉 Loan fully repaid!"
          : "Repayment recorded",
      loan: {
        id: loan.id,
        status: loan.status,
        outstandingBalance: loan.outstandingBalance,
        amountRepaid: loan.amountRepaid,
        principalRepaidToDate: loan.principalRepaidToDate,
        interestEarnedToDate: loan.interestEarnedToDate, // 💰 Total interest actually earned
        progress: Math.round((loan.amountRepaid / loan.totalPayable) * 100),
      },
      thisRepayment: {
        installmentNumber: repaymentIndex + 1,
        totalPaid: repaymentAmount,
        principalPortion: principalPortion,
        interestPortion: interestPortion, // 💰 This installment's interest
        interestRevenue: interestPortion, // 💰 Revenue recognized now
      },
      customer: {
        newCashBalance: updatedCustomer.cashBalance,
        loanBalance: updatedCustomer.loanBalance,
        amountDeducted: repaymentAmount,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Record repayment error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
}; // Get revenue reports
exports.getRevenueReports = async (req, res) => {
  try {
    const { period, type } = req.query;

    let startDate = new Date();
    if (period === "daily") startDate.setHours(0, 0, 0, 0);
    else if (period === "weekly") startDate.setDate(startDate.getDate() - 7);
    else if (period === "monthly") startDate.setMonth(startDate.getMonth() - 1);
    else if (period === "yearly")
      startDate.setFullYear(startDate.getFullYear() - 1);
    else startDate = new Date(0);

    // 🔴 KEY CHANGE: Calculate interest from ACTUAL PAYMENTS, not total expected
    let interestRevenue = [];
    if (!type || type === "all" || type === "interest") {
      // Sum up interest from completed repayments
      interestRevenue = await Loan.aggregate([
        {
          $match: {
            status: { $in: ["active", "completed"] },
            // Only count loans with actual payments
            amountRepaid: { $gt: 0 },
          },
        },
        {
          $project: {
            // Calculate interest earned to date based on actual repayments
            interestEarnedToDate: 1,
            principalRepaidToDate: 1,
            amountRepaid: 1,
            repayments: {
              $filter: {
                input: "$repayments",
                as: "repayment",
                cond: { $eq: ["$$repayment.status", "paid"] },
              },
            },
            createdAt: 1,
          },
        },
        {
          $addFields: {
            // Sum interest from paid installments only
            actualInterestRevenue: {
              $sum: {
                $map: {
                  input: "$repayments",
                  as: "r",
                  in: { $ifNull: ["$$r.interestPortion", 0] },
                },
              },
            },
          },
        },
        {
          $group: {
            _id:
              period === "daily"
                ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
                : period === "monthly"
                  ? { $dateToString: { format: "%Y-%m", date: "$createdAt" } }
                  : period === "yearly"
                    ? { $year: "$createdAt" }
                    : null,
            totalInterest: { $sum: "$actualInterestRevenue" },
            totalLoans: { $sum: 1 },
            totalPrincipalRepaid: { $sum: "$principalRepaidToDate" },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    }

    // Transaction charges (unchanged)
    let transactionCharges = [];
    if (!type || type === "all" || type === "charges") {
      transactionCharges = await Transaction.aggregate([
        {
          $match: {
            status: "approved",
            createdAt: { $gte: startDate },
            type: { $in: ["deposit", "withdrawal"] }, // Exclude loan transactions
          },
        },
        {
          $group: {
            _id:
              period === "daily"
                ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
                : period === "monthly"
                  ? { $dateToString: { format: "%Y-%m", date: "$createdAt" } }
                  : period === "yearly"
                    ? { $year: "$createdAt" }
                    : null,
            totalCharges: { $sum: "$charges" },
            totalTransactions: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    }

    const totalInterest = interestRevenue.reduce(
      (sum, item) => sum + (item.totalInterest || 0),
      0,
    );
    const totalCharges = transactionCharges.reduce(
      (sum, item) => sum + (item.totalCharges || 0),
      0,
    );

    res.json({
      success: true,
      period: period || "all",
      totalRevenue: totalInterest + totalCharges,
      summary: {
        interestRevenue: totalInterest, // 💰 Only from actual payments
        transactionCharges: totalCharges,
      },
      breakdown: {
        interest: interestRevenue,
        charges: transactionCharges,
      },
      dashboard: {
        totalInterestEarned: totalInterest, // 💰 Actually collected
        totalChargesEarned: totalCharges,
        activeLoansCount: await Loan.countDocuments({ status: "active" }),
        completedLoansCount: await Loan.countDocuments({ status: "completed" }),
        // 🔴 NEW: Show unearned interest (future revenue)
        totalUnearnedInterest: await Loan.aggregate([
          { $match: { status: "active" } },
          {
            $project: {
              remainingInterest: {
                $subtract: [
                  { $subtract: ["$totalPayable", "$amount"] }, // Total expected interest
                  { $ifNull: ["$interestEarnedToDate", 0] }, // Minus already earned
                ],
              },
            },
          },
          { $group: { _id: null, total: { $sum: "$remainingInterest" } } },
        ]).then((r) => r[0]?.total || 0),
      },
    });
  } catch (error) {
    console.error("Get revenue reports error:", error);
    res.status(500).json({ error: error.message });
  }
};
// Get loan summary
exports.getLoanSummary = async (req, res) => {
  try {
    const summary = await Loan.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalOutstanding: { $sum: "$outstandingBalance" },
        },
      },
    ]);

    const activeLoans = await Loan.find({ status: "active" });
    const upcomingRepayments = [];

    activeLoans.forEach((loan) => {
      loan.repayments.forEach((repayment) => {
        if (
          repayment.status === "pending" &&
          new Date(repayment.dueDate) > new Date()
        ) {
          upcomingRepayments.push({
            loanId: loan.id,
            customerName: loan.customerName,
            dueDate: repayment.dueDate,
            amount: repayment.amount,
          });
        }
      });
    });

    upcomingRepayments.sort(
      (a, b) => new Date(a.dueDate) - new Date(b.dueDate),
    );

    res.json({
      summary,
      activeLoansCount: activeLoans.length,
      upcomingRepayments: upcomingRepayments.slice(0, 10),
    });
  } catch (error) {
    console.error("Get loan summary error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get customer loan summary
exports.getCustomerLoanSummary = async (req, res) => {
  try {
    const { customerId } = req.params;

    const customer = await Customer.findOne({ id: customerId });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const activeLoans = await Loan.find({
      customerId: customerId,
      status: "active",
    });

    const loanHistory = await Loan.find({
      customerId: customerId,
      status: { $in: ["completed", "defaulted"] },
    });

    const upcomingRepayments = [];
    activeLoans.forEach((loan) => {
      loan.repayments.forEach((repayment) => {
        if (
          repayment.status === "pending" &&
          new Date(repayment.dueDate) > new Date()
        ) {
          upcomingRepayments.push({
            loanId: loan.id,
            loanType: loan.type,
            dueDate: repayment.dueDate,
            amount: repayment.amount,
            remainingBalance: loan.outstandingBalance,
          });
        }
      });
    });

    upcomingRepayments.sort(
      (a, b) => new Date(a.dueDate) - new Date(b.dueDate),
    );

    res.json({
      customer: {
        name: customer.name,
        cashBalance: customer.cashBalance,
        loanBalance: customer.loanBalance,
        netWorth: customer.cashBalance - customer.loanBalance,
        totalLoansTaken: customer.totalLoanAmount,
        totalInterestAccrued: customer.totalInterestAccrued,
      },
      activeLoans: activeLoans.map((loan) => ({
        id: loan.id,
        type: loan.type,
        originalAmount: loan.amount,
        totalPayable: loan.totalPayable,
        amountRepaid: loan.amountRepaid,
        outstandingBalance: loan.outstandingBalance,
        nextInstallment: upcomingRepayments.find((r) => r.loanId === loan.id)
          ?.dueDate,
      })),
      loanHistory: loanHistory.map((loan) => ({
        id: loan.id,
        type: loan.type,
        amount: loan.amount,
        completedAt: loan.completedAt || loan.updatedAt,
      })),
      upcomingRepayments: upcomingRepayments.slice(0, 5),
    });
  } catch (error) {
    console.error("Get customer loan summary error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get dashboard summary with interest revenue
exports.getDashboardSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    const todayRevenue = await Loan.aggregate([
      {
        $match: {
          status: { $in: ["active", "completed"] },
          createdAt: { $gte: today },
        },
      },
      {
        $group: {
          _id: null,
          interest: { $sum: { $subtract: ["$totalPayable", "$amount"] } },
          count: { $sum: 1 },
        },
      },
    ]);

    const monthRevenue = await Loan.aggregate([
      {
        $match: {
          status: { $in: ["active", "completed"] },
          createdAt: { $gte: thisMonth },
        },
      },
      {
        $group: {
          _id: null,
          interest: { $sum: { $subtract: ["$totalPayable", "$amount"] } },
          principal: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const allTime = await Loan.aggregate([
      {
        $match: { status: { $in: ["active", "completed"] } },
      },
      {
        $group: {
          _id: null,
          totalInterest: { $sum: { $subtract: ["$totalPayable", "$amount"] } },
          totalPrincipal: { $sum: "$amount" },
          totalLoans: { $sum: 1 },
        },
      },
    ]);

    const chargesToday = await Transaction.aggregate([
      { $match: { status: "approved", createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: "$charges" } } },
    ]);

    const chargesMonth = await Transaction.aggregate([
      { $match: { status: "approved", createdAt: { $gte: thisMonth } } },
      { $group: { _id: null, total: { $sum: "$charges" } } },
    ]);

    res.json({
      success: true,
      today: {
        interestRevenue: todayRevenue[0]?.interest || 0,
        transactionCharges: chargesToday[0]?.total || 0,
        newLoans: todayRevenue[0]?.count || 0,
      },
      thisMonth: {
        interestRevenue: monthRevenue[0]?.interest || 0,
        principalDisbursed: monthRevenue[0]?.principal || 0,
        transactionCharges: chargesMonth[0]?.total || 0,
        newLoans: monthRevenue[0]?.count || 0,
      },
      allTime: {
        totalInterestRevenue: allTime[0]?.totalInterest || 0,
        totalPrincipalDisbursed: allTime[0]?.totalPrincipal || 0,
        totalLoans: allTime[0]?.totalLoans || 0,
      },
      currentStatus: {
        activeLoans: await Loan.countDocuments({ status: "active" }),
        pendingLoans: await Loan.countDocuments({ status: "pending" }),
        completedLoans: await Loan.countDocuments({ status: "completed" }),
        totalOutstanding:
          (
            await Loan.aggregate([
              { $match: { status: "active" } },
              { $group: { _id: null, total: { $sum: "$outstandingBalance" } } },
            ])
          )[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("Get dashboard summary error:", error);
    res.status(500).json({ error: error.message });
  }
};
