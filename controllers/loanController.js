const Loan = require("../models/loan");
const Customer = require("../models/customer");
const Transaction = require("../models/transaction");

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
    console.log("Received loan request body:", req.body); // Debug log

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

    // ========== ADD VALIDATION ==========
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

    // ========== FIX: Handle requestedBy properly ==========
    // Create a safe requestedBy object
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

// Approve loan request
// controllers/loanController.js - Update approveLoan function
// Approve loan request - FIXED VERSION
// Approve loan - SIMPLIFIED VERSION
// Customer is DEBITED immediately (loan + interest), pays back later
// controllers/loanController.js

// Approve loan - CORRECTED VERSION
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

    // Find customer
    const customer = await Customer.findOne({ id: loan.customerId });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // ========== CORRECT LOAN APPROVAL LOGIC ==========
    // DO NOT deduct anything from cash balance!
    // Instead, ADD the principal to cash balance (disbursement)

    const interest = loan.totalPayable - loan.amount;

    // Update loan status to ACTIVE
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
    loan.autoDebitEnabled = true; // Enable auto-debit for repayments

    await loan.save();

    // CREATE TRANSACTION: DISBURSE LOAN PRINCIPAL
    // This ADDS money to customer's cash balance
    const disbursementTransaction = new Transaction({
      id: "TXN" + Date.now() + Math.random(),
      customerId: loan.customerId,
      customerName: loan.customerName,
      type: "loan_disbursement",
      amount: loan.amount,
      charges: 0,
      netAmount: loan.amount,
      description: `Loan disbursement - ${loan.id}`,
      status: "approved",
      requestedBy: approvedBy.name,
      approvedBy: approvedBy.name,
      date: new Date().toISOString(),
    });

    await disbursementTransaction.save();

    // INCREASE customer's cash balance (they receive the loan money)
    const newCashBalance = (customer.cashBalance || 0) + loan.amount;

    await Customer.findOneAndUpdate(
      { id: loan.customerId },
      {
        $set: {
          cashBalance: newCashBalance,
          balance: newCashBalance, // Legacy field
        },
        $inc: {
          loanBalance: loan.amount, // Track as liability
          totalLoanAmount: loan.amount,
          totalInterestAccrued: interest,
        },
      },
    );

    // Send SMS notification
    await sendLoanApprovalSMS(customer, loan);

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

// SMS notification for loan approval
async function sendLoanApprovalSMS(customer, loan) {
  if (!customer.phone) return;

  const message = `🏦 LOAN APPROVED!\n\nDear ${customer.name},\nYour loan of ₦${loan.amount.toLocaleString()} has been approved and disbursed to your account.\n\nRepayment Schedule:\n- ${loan.numberOfInstallments} ${loan.repaymentPeriod}ly installments\n- Each installment: ₦${loan.installmentAmount.toLocaleString()}\n- Total to repay: ₦${loan.totalPayable.toLocaleString()}\n\n⚠️ Note: 50% of future deposits will be automatically deducted for loan repayment.\n\nThank you for banking with us.`;

  // Send SMS (implement your SMS service)
  console.log("SMS to", customer.phone, ":", message);
  // await sendSMS(customer.phone, message);
}
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

// Record repayment
// controllers/loanController.js - Update recordRepayment function
// Record repayment - SIMPLIFIED VERSION
// Customer pays back to restore their cash balance
exports.recordRepayment = async (req, res) => {
  try {
    const { loanId, repaymentId } = req.params;
    const { paidBy, paymentAmount } = req.body;

    const loan = await Loan.findOne({ id: loanId });
    if (!loan) {
      return res.status(404).json({ error: "Loan not found" });
    }

    const repaymentIndex = loan.repayments.findIndex(
      (r) => r.id === repaymentId,
    );
    if (repaymentIndex === -1) {
      return res.status(404).json({ error: "Repayment schedule not found" });
    }

    const repayment = loan.repayments[repaymentIndex];
    if (repayment.status === "paid") {
      return res
        .status(400)
        .json({ error: "This installment has already been paid" });
    }

    const Customer = require("../models/customer");
    const customer = await Customer.findOne({ id: loan.customerId });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // For cash payments, we don't check cashBalance - we ADD to it
    // For transfer deductions, check if they have enough
    const repaymentAmount = paymentAmount || repayment.amount || 0;

    // Update repayment status
    repayment.status = "paid";
    repayment.paidDate = new Date();
    repayment.paidBy = paidBy || "Customer";
    repayment.paidAmount = repaymentAmount;

    // Update loan totals
    loan.amountRepaid = (loan.amountRepaid || 0) + repaymentAmount;
    loan.outstandingBalance = Math.max(
      0,
      (loan.totalPayable || 0) - (loan.amountRepaid || 0),
    );

    // Check if loan is completed
    if (loan.outstandingBalance <= 0) {
      loan.status = "completed";
      loan.completedAt = new Date();
    }

    await loan.save();

    // Calculate principal vs interest for this payment
    const totalInterest = (loan.totalPayable || 0) - (loan.amount || 0);
    const interestRatio = totalInterest / (loan.totalPayable || 1);
    const interestPortion = repaymentAmount * interestRatio;
    const principalPortion = repaymentAmount - interestPortion;

    // ADD payment to customer's cash balance (they're getting money back)
    // REDUCE loan balance
    const updatedCustomer = await Customer.findOneAndUpdate(
      { id: loan.customerId },
      {
        $inc: {
          cashBalance: repaymentAmount, // Money ADDED to account
          balance: repaymentAmount, // Legacy field
          loanBalance: -principalPortion, // Loan liability decreases
        },
      },
      { returnDocument: "after", new: true },
    );

    // Create transaction record
    const Transaction = require("../models/transaction");
    const transaction = new Transaction({
      id: "TXN" + Date.now(),
      customerId: loan.customerId,
      customerName: loan.customerName,
      customerPhone: customer?.phone || null,
      type: "loan_repayment",
      amount: repaymentAmount,
      principalPortion: principalPortion,
      interestPortion: interestPortion,
      charges: 0,
      netAmount: repaymentAmount, // Positive = credit
      description: `Loan repayment - Installment ${repaymentIndex + 1}/${loan.numberOfInstallments} (Principal: ₦${principalPortion.toLocaleString()}, Interest: ₦${interestPortion.toLocaleString()})`,
      status: "approved",
      requestedBy: paidBy || "Customer",
      approvedBy: paidBy || "System",
      date: new Date().toISOString(),
    });
    await transaction.save();

    // Send notification
    try {
      if (
        typeof NotificationService !== "undefined" &&
        NotificationService.notifyRepaymentReceived
      ) {
        await NotificationService.notifyRepaymentReceived(
          loan,
          repayment,
          repaymentIndex + 1,
        );
      }
    } catch (e) {
      console.log("Notification skipped:", e.message);
    }

    res.json({
      success: true,
      message: "Repayment recorded successfully",
      loan: {
        id: loan.id,
        status: loan.status,
        outstandingBalance: loan.outstandingBalance,
        amountRepaid: loan.amountRepaid,
        progress:
          Math.round((loan.amountRepaid / loan.totalPayable) * 100) + "%",
      },
      repayment: {
        installmentNumber: repaymentIndex + 1,
        amountPaid: repaymentAmount,
        principalRestored: principalPortion,
        interest: interestPortion,
        paidDate: repayment.paidDate,
      },
      customer: {
        cashBalance: updatedCustomer?.cashBalance || 0,
        loanBalance: updatedCustomer?.loanBalance || 0,
        netWorth:
          (updatedCustomer?.cashBalance || 0) -
          (updatedCustomer?.loanBalance || 0),
      },
      transaction: {
        id: transaction.id,
        amountCredited: repaymentAmount,
      },
    });
  } catch (error) {
    console.error("Record repayment error:", error);
    res.status(500).json({
      error: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
};
// Get revenue reports
// Get revenue reports - INTEREST SHOWS AS REVENUE
exports.getRevenueReports = async (req, res) => {
  try {
    const { period, type } = req.query; // period: daily, weekly, monthly, yearly, all
    // type: 'interest', 'charges', 'all'

    let startDate = new Date();
    let matchStage = {};
    let groupFormat = {};

    // Set date range
    switch (period) {
      case "daily":
        startDate.setHours(0, 0, 0, 0);
        break;
      case "weekly":
        startDate.setDate(startDate.getDate() - 7);
        break;
      case "monthly":
        startDate.setMonth(startDate.getMonth() - 1);
        break;
      case "yearly":
        startDate.setFullYear(startDate.getFullYear() - 1);
        break;
      default:
        startDate = new Date(0); // all time
    }

    // Build match stage for date filtering
    if (period && period !== "all") {
      matchStage.createdAt = { $gte: startDate };
    }

    // Get INTEREST REVENUE from approved loans
    let interestRevenue = [];
    if (!type || type === "all" || type === "interest") {
      interestRevenue = await Loan.aggregate([
        {
          $match: {
            status: { $in: ["active", "completed"] },
            ...matchStage,
          },
        },
        {
          $project: {
            interestAmount: { $subtract: ["$totalPayable", "$amount"] },
            amountRepaid: 1,
            totalPayable: 1,
            createdAt: 1,
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            year: { $year: "$createdAt" },
          },
        },
        {
          $group: {
            _id:
              period === "daily"
                ? "$date"
                : period === "monthly"
                  ? "$month"
                  : period === "yearly"
                    ? "$year"
                    : null,
            totalInterest: { $sum: "$interestAmount" },
            totalLoans: { $sum: 1 },
            totalPrincipal: { $sum: "$amount" },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    }

    // Get TRANSACTION CHARGES revenue
    let transactionCharges = [];
    if (!type || type === "all" || type === "charges") {
      const Transaction = require("../models/transaction");
      transactionCharges = await Transaction.aggregate([
        {
          $match: {
            status: "approved",
            ...(period && period !== "all"
              ? {
                  createdAt: { $gte: startDate },
                }
              : {}),
          },
        },
        {
          $project: {
            charges: 1,
            createdAt: 1,
            date: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
            month: { $dateToString: { format: "%Y-%m", date: "$createdAt" } },
            year: { $year: "$createdAt" },
          },
        },
        {
          $group: {
            _id:
              period === "daily"
                ? "$date"
                : period === "monthly"
                  ? "$month"
                  : period === "yearly"
                    ? "$year"
                    : null,
            totalCharges: { $sum: "$charges" },
            totalTransactions: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    }

    // Calculate totals
    const totalInterest = interestRevenue.reduce(
      (sum, item) => sum + (item.totalInterest || 0),
      0,
    );
    const totalCharges = transactionCharges.reduce(
      (sum, item) => sum + (item.totalCharges || 0),
      0,
    );
    const totalRevenue = totalInterest + totalCharges;

    res.json({
      success: true,
      period: period || "all",
      totalRevenue: totalRevenue,
      summary: {
        interestRevenue: totalInterest,
        transactionCharges: totalCharges,
      },
      breakdown: {
        interest: interestRevenue,
        charges: transactionCharges,
      },
      // For dashboard widgets
      dashboard: {
        totalInterestEarned: totalInterest,
        totalChargesEarned: totalCharges,
        activeLoansCount: await Loan.countDocuments({ status: "active" }),
        completedLoansCount: await Loan.countDocuments({ status: "completed" }),
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
// Add to loanController.js
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

// Add route
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

    // Today's interest revenue
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

    // This month's interest revenue
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

    // All-time totals
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

    // Transaction charges
    const Transaction = require("../models/transaction");
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
