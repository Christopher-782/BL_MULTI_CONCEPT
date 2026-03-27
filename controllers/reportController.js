const Loan = require("../models/loan");
const Transaction = require("../models/transaction");

// Get revenue reports with filtering
exports.getRevenueReports = async (req, res) => {
  try {
    const { period } = req.query;
    console.log("Revenue report requested for period:", period);

    let startDate = new Date();
    let endDate = new Date();

    // Set date range based on period
    switch (period) {
      case "daily":
        startDate.setHours(0, 0, 0, 0);
        endDate.setHours(23, 59, 59, 999);
        break;
      case "weekly":
        startDate.setDate(startDate.getDate() - 7);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "monthly":
        startDate.setMonth(startDate.getMonth() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      case "yearly":
        startDate.setFullYear(startDate.getFullYear() - 1);
        startDate.setHours(0, 0, 0, 0);
        break;
      default:
        startDate = new Date(0); // all time
        endDate = new Date();
    }

    // Get transaction charges - use createdAt field
    const transactionQuery = {
      status: "approved",
      charges: { $gt: 0 },
    };

    if (period && period !== "all") {
      transactionQuery.createdAt = { $gte: startDate };
      if (period === "daily") {
        transactionQuery.createdAt.$lte = endDate;
      }
    }

    const transactions = await Transaction.find(transactionQuery);
    const totalCharges = transactions.reduce(
      (sum, t) => sum + (t.charges || 0),
      0,
    );

    // Get loan interest revenue - use createdAt field
    const loanQuery = { status: "completed" };
    if (period && period !== "all") {
      loanQuery.createdAt = { $gte: startDate };
      if (period === "daily") {
        loanQuery.createdAt.$lte = endDate;
      }
    }

    const loans = await Loan.find(loanQuery);
    const totalInterest = loans.reduce((sum, l) => {
      return sum + ((l.totalPayable || l.amount) - (l.amount || 0));
    }, 0);

    console.log(
      `Found ${transactions.length} transactions with charges: ₦${totalCharges}`,
    );
    console.log(
      `Found ${loans.length} completed loans with interest: ₦${totalInterest}`,
    );

    res.json({
      success: true,
      period: period || "all",
      totalRevenue: totalInterest + totalCharges,
      breakdown: {
        interestRevenue: totalInterest,
        transactionCharges: totalCharges,
      },
      summary: {
        totalLoans: loans.length,
        totalTransactions: transactions.length,
        totalDisbursed: loans.reduce((sum, l) => sum + (l.amount || 0), 0),
        totalRepaid: loans.reduce((sum, l) => sum + (l.amountRepaid || 0), 0),
      },
    });
  } catch (error) {
    console.error("Get revenue reports error:", error);
    res.status(500).json({
      error: error.message,
    });
  }
};

// Get detailed revenue by date range - FIXED (no aggregation on date string)
exports.getRevenueByDateRange = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res
        .status(400)
        .json({ error: "Start date and end date are required" });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    // Get transactions within date range - use createdAt field
    const transactions = await Transaction.find({
      status: "approved",
      charges: { $gt: 0 },
      createdAt: { $gte: start, $lte: end },
    }).sort({ createdAt: 1 });

    // Group by day manually
    const dailyMap = new Map();

    transactions.forEach((t) => {
      const dateKey = t.createdAt.toISOString().split("T")[0];
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, { totalCharges: 0, totalTransactions: 0 });
      }
      const dayData = dailyMap.get(dateKey);
      dayData.totalCharges += t.charges || 0;
      dayData.totalTransactions += 1;
    });

    const dailyBreakdown = Array.from(dailyMap.entries())
      .map(([date, data]) => ({
        _id: { date },
        totalCharges: data.totalCharges,
        totalTransactions: data.totalTransactions,
      }))
      .sort((a, b) => a._id.date.localeCompare(b._id.date));

    // Get loan revenue by date range
    const loans = await Loan.find({
      status: "completed",
      createdAt: { $gte: start, $lte: end },
    });

    const totalInterest = loans.reduce((sum, l) => {
      return sum + ((l.totalPayable || l.amount) - (l.amount || 0));
    }, 0);

    res.json({
      success: true,
      startDate,
      endDate,
      dailyBreakdown,
      loanRevenue: { totalInterest, totalLoans: loans.length },
      totalRevenue:
        totalInterest +
        dailyBreakdown.reduce((sum, d) => sum + d.totalCharges, 0),
    });
  } catch (error) {
    console.error("Get revenue by date range error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get loan summary report - FIXED (no aggregation on date string)
exports.getLoanSummary = async (req, res) => {
  try {
    const summary = await Loan.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalPayable: { $sum: "$totalPayable" },
          totalRepaid: { $sum: "$amountRepaid" },
          totalOutstanding: { $sum: "$outstandingBalance" },
        },
      },
    ]);

    const activeLoans = await Loan.find({ status: "active" }).sort({
      createdAt: -1,
    });

    const upcomingRepayments = [];
    activeLoans.forEach((loan) => {
      if (loan.repayments && loan.repayments.length) {
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
              status: repayment.status,
            });
          }
        });
      }
    });

    upcomingRepayments.sort(
      (a, b) => new Date(a.dueDate) - new Date(b.dueDate),
    );

    res.json({
      success: true,
      summary,
      activeLoansCount: activeLoans.length,
      activeLoans: activeLoans.slice(0, 10),
      upcomingRepayments: upcomingRepayments.slice(0, 10),
      totalOutstanding: summary.reduce(
        (sum, s) => sum + (s.totalOutstanding || 0),
        0,
      ),
    });
  } catch (error) {
    console.error("Get loan summary error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get transaction summary - FIXED (use createdAt field)
exports.getTransactionSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const matchQuery = { status: "approved" };

    if (startDate && endDate) {
      matchQuery.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const summary = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: "$type",
          totalAmount: { $sum: "$amount" },
          totalCharges: { $sum: "$charges" },
          totalNet: { $sum: "$netAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    const total = await Transaction.aggregate([
      { $match: matchQuery },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          totalCharges: { $sum: "$charges" },
          totalNet: { $sum: "$netAmount" },
          count: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      byType: summary,
      total: total[0] || {
        totalAmount: 0,
        totalCharges: 0,
        totalNet: 0,
        count: 0,
      },
    });
  } catch (error) {
    console.error("Get transaction summary error:", error);
    res.status(500).json({ error: error.message });
  }
};
