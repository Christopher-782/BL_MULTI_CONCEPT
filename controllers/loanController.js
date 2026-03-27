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

    // Validate customer exists and has sufficient balance for overdraft
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
        id: "REPAY" + Date.now() + i,
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

    // Create loan object
    const loan = new Loan({
      id: generateId(),
      customerId,
      customerName,
      customerNumber,
      phone,
      type,
      amount,
      interestRate,
      totalPayable,
      repaymentPeriod,
      numberOfInstallments,
      installmentAmount,
      repaymentStartDate: startDate,
      repaymentEndDate: endDate,
      repayments,
      status: "pending",
      requestedBy,
      requestedAt: new Date(),
      purpose,
      notes,
      outstandingBalance: totalPayable,
    });

    await loan.save();

    res.status(201).json({
      message: `${type === "loan" ? "Loan" : "Overdraft"} request submitted successfully`,
      loan,
    });
  } catch (error) {
    console.error("Create loan request error:", error);
    res.status(500).json({ error: error.message });
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
exports.approveLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { approvedBy, disbursedAmount } = req.body;

    const loan = await Loan.findOne({ id: loanId });
    if (!loan) {
      return res.status(404).json({ error: "Loan request not found" });
    }

    if (loan.status !== "pending") {
      return res.status(400).json({ error: "Loan request already processed" });
    }

    // Update loan status
    loan.status = "active";
    loan.approvedBy = {
      adminId: approvedBy.id,
      adminName: approvedBy.name,
      approvedAt: new Date(),
    };
    loan.amountDisbursed = disbursedAmount || loan.amount;
    loan.outstandingBalance = loan.totalPayable;

    await loan.save();

    // Create transaction record for disbursement
    const Transaction = require("../models/transaction");
    const transaction = new Transaction({
      id: "TXN" + Date.now(),
      customerId: loan.customerId,
      customerName: loan.customerName,
      type: "deposit",
      amount: loan.amountDisbursed,
      charges: 0,
      netAmount: loan.amountDisbursed,
      description: `${loan.type === "loan" ? "Loan" : "Overdraft"} disbursement - ${loan.id}`,
      status: "approved",
      requestedBy: approvedBy.name,
      approvedBy: approvedBy.name,
      date: new Date().toISOString(),
    });

    await transaction.save();

    // Update customer balance
    const Customer = require("../models/customer");
    await Customer.findOneAndUpdate(
      { id: loan.customerId },
      { $inc: { balance: loan.amountDisbursed } },
    );

    res.json({
      message: `${loan.type === "loan" ? "Loan" : "Overdraft"} approved and disbursed successfully`,
      loan,
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

// Record repayment
exports.recordRepayment = async (req, res) => {
  try {
    const { loanId, repaymentId } = req.params;
    const { paidBy, paymentAmount } = req.body;

    const loan = await Loan.findOne({ id: loanId });
    if (!loan) {
      return res.status(404).json({ error: "Loan not found" });
    }

    const repayment = loan.repayments.find((r) => r.id === repaymentId);
    if (!repayment) {
      return res.status(404).json({ error: "Repayment schedule not found" });
    }

    if (repayment.status === "paid") {
      return res
        .status(400)
        .json({ error: "This installment has already been paid" });
    }

    // Update repayment
    repayment.status = "paid";
    repayment.paidDate = new Date();
    repayment.paidBy = paidBy;

    // Update loan totals
    loan.amountRepaid += repayment.amount;
    loan.outstandingBalance = loan.totalPayable - loan.amountRepaid;

    // Check if loan is completed
    if (loan.outstandingBalance <= 0) {
      loan.status = "completed";
    }

    await loan.save();

    // Create transaction record for repayment
    const Transaction = require("../models/transaction");
    const transaction = new Transaction({
      id: "TXN" + Date.now(),
      customerId: loan.customerId,
      customerName: loan.customerName,
      type: "withdrawal",
      amount: repayment.amount,
      charges: 0,
      netAmount: repayment.amount,
      description: `${loan.type === "loan" ? "Loan" : "Overdraft"} repayment - Installment ${loan.repayments.indexOf(repayment) + 1}`,
      status: "approved",
      requestedBy: paidBy,
      approvedBy: paidBy,
      date: new Date().toISOString(),
    });

    await transaction.save();

    // Update customer balance (deduct repayment)
    const Customer = require("../models/customer");
    await Customer.findOneAndUpdate(
      { id: loan.customerId },
      { $inc: { balance: -repayment.amount } },
    );

    res.json({
      message: `Repayment recorded successfully`,
      loan,
      repayment,
    });
  } catch (error) {
    console.error("Record repayment error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get revenue reports
exports.getRevenueReports = async (req, res) => {
  try {
    const { period } = req.query; // daily, weekly, monthly, yearly

    let startDate = new Date();
    let groupFormat = {};

    switch (period) {
      case "daily":
        startDate.setHours(0, 0, 0, 0);
        groupFormat = {
          year: { $year: "$date" },
          month: { $month: "$date" },
          day: { $dayOfMonth: "$date" },
        };
        break;
      case "weekly":
        startDate.setDate(startDate.getDate() - 7);
        groupFormat = {
          year: { $year: "$date" },
          week: { $week: "$date" },
        };
        break;
      case "monthly":
        startDate.setMonth(startDate.getMonth() - 1);
        groupFormat = {
          year: { $year: "$date" },
          month: { $month: "$date" },
        };
        break;
      case "yearly":
        startDate.setFullYear(startDate.getFullYear() - 1);
        groupFormat = {
          year: { $year: "$date" },
        };
        break;
      default:
        startDate = new Date(0); // all time
    }

    // Get loan interest revenue
    const completedLoans = await Loan.aggregate([
      {
        $match: {
          status: "completed",
          ...(period !== "all" ? { createdAt: { $gte: startDate } } : {}),
        },
      },
      {
        $group: {
          _id: groupFormat,
          totalInterest: { $sum: { $subtract: ["$totalPayable", "$amount"] } },
          totalLoans: { $sum: 1 },
          totalDisbursed: { $sum: "$amount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Get transaction charges revenue
    const Transaction = require("../models/transaction");
    const transactionCharges = await Transaction.aggregate([
      {
        $match: {
          status: "approved",
          ...(period !== "all"
            ? { date: { $gte: startDate.toISOString() } }
            : {}),
        },
      },
      {
        $group: {
          _id: groupFormat,
          totalCharges: { $sum: "$charges" },
          totalTransactions: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Calculate totals
    let totalInterest = 0;
    let totalCharges = 0;

    completedLoans.forEach((loan) => {
      totalInterest += loan.totalInterest;
    });

    transactionCharges.forEach((charge) => {
      totalCharges += charge.totalCharges;
    });

    res.json({
      period,
      totalRevenue: totalInterest + totalCharges,
      breakdown: {
        interestRevenue: totalInterest,
        transactionCharges: totalCharges,
      },
      details: {
        loans: completedLoans,
        transactions: transactionCharges,
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
