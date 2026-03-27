const Loan = require("../models/loan");
const Transaction = require("../models/transaction");

// Get revenue reports with filtering
exports.getRevenueReports = async (req, res) => {
  try {
    const { period, startDate, endDate, type } = req.query;

    let dateFilter = {};
    let groupByFormat = {};
    let now = new Date();

    // Set date range based on period
    if (startDate && endDate) {
      // Custom date range
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else {
      // Predefined periods
      switch (period) {
        case "daily":
          dateFilter = {
            $gte: new Date(now.setHours(0, 0, 0, 0)),
            $lte: new Date(),
          };
          groupByFormat = {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
            day: { $dayOfMonth: "$createdAt" },
          };
          break;

        case "weekly":
          const weekAgo = new Date();
          weekAgo.setDate(weekAgo.getDate() - 7);
          dateFilter = { $gte: weekAgo };
          groupByFormat = {
            year: { $year: "$createdAt" },
            week: { $week: "$createdAt" },
          };
          break;

        case "monthly":
          const monthAgo = new Date();
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          dateFilter = { $gte: monthAgo };
          groupByFormat = {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          };
          break;

        case "yearly":
          const yearAgo = new Date();
          yearAgo.setFullYear(yearAgo.getFullYear() - 1);
          dateFilter = { $gte: yearAgo };
          groupByFormat = {
            year: { $year: "$createdAt" },
          };
          break;

        default:
          // All time
          dateFilter = {};
      }
    }

    // Get loan interest revenue
    const loanMatch = { status: "completed" };
    if (dateFilter.$gte || dateFilter.$lte) {
      loanMatch.createdAt = dateFilter;
    }

    const loanRevenue = await Loan.aggregate([
      { $match: loanMatch },
      {
        $group: {
          _id: groupByFormat,
          totalInterest: {
            $sum: {
              $subtract: [{ $ifNull: ["$totalPayable", "$amount"] }, "$amount"],
            },
          },
          totalLoans: { $sum: 1 },
          totalDisbursed: { $sum: "$amount" },
          totalRepaid: { $sum: "$amountRepaid" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Get transaction charges revenue
    const transactionMatch = { status: "approved" };
    if (dateFilter.$gte || dateFilter.$lte) {
      transactionMatch.date = dateFilter;
    }

    const transactionRevenue = await Transaction.aggregate([
      { $match: transactionMatch },
      {
        $group: {
          _id: groupByFormat,
          totalCharges: { $sum: "$charges" },
          totalTransactions: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalNet: { $sum: "$netAmount" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Calculate totals
    const totalInterest = loanRevenue.reduce(
      (sum, l) => sum + (l.totalInterest || 0),
      0,
    );
    const totalCharges = transactionRevenue.reduce(
      (sum, t) => sum + (t.totalCharges || 0),
      0,
    );

    res.json({
      success: true,
      period: period || "custom",
      dateRange: dateFilter,
      totalRevenue: totalInterest + totalCharges,
      breakdown: {
        interestRevenue: totalInterest,
        transactionCharges: totalCharges,
        loanDetails: loanRevenue,
        transactionDetails: transactionRevenue,
      },
      summary: {
        totalLoans: loanRevenue.reduce((sum, l) => sum + l.totalLoans, 0),
        totalDisbursed: loanRevenue.reduce(
          (sum, l) => sum + l.totalDisbursed,
          0,
        ),
        totalRepaid: loanRevenue.reduce((sum, l) => sum + l.totalRepaid, 0),
        totalTransactions: transactionRevenue.reduce(
          (sum, t) => sum + t.totalTransactions,
          0,
        ),
        totalTransactionAmount: transactionRevenue.reduce(
          (sum, t) => sum + t.totalAmount,
          0,
        ),
      },
    });
  } catch (error) {
    console.error("Get revenue reports error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get detailed revenue by date range
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

    // Get daily breakdown
    const dailyRevenue = await Transaction.aggregate([
      {
        $match: {
          status: "approved",
          date: { $gte: start.toISOString(), $lte: end.toISOString() },
        },
      },
      {
        $group: {
          _id: {
            year: { $year: { $dateFromString: { dateString: "$date" } } },
            month: { $month: { $dateFromString: { dateString: "$date" } } },
            day: { $dayOfMonth: { $dateFromString: { dateString: "$date" } } },
          },
          totalCharges: { $sum: "$charges" },
          totalTransactions: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1, "_id.day": 1 } },
    ]);

    // Get loan revenue by date range
    const loanRevenue = await Loan.aggregate([
      {
        $match: {
          status: "completed",
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: null,
          totalInterest: {
            $sum: {
              $subtract: [{ $ifNull: ["$totalPayable", "$amount"] }, "$amount"],
            },
          },
          totalLoans: { $sum: 1 },
        },
      },
    ]);

    res.json({
      success: true,
      startDate,
      endDate,
      dailyBreakdown: dailyRevenue,
      loanRevenue: loanRevenue[0] || { totalInterest: 0, totalLoans: 0 },
      totalRevenue:
        (loanRevenue[0]?.totalInterest || 0) +
        dailyRevenue.reduce((sum, d) => sum + d.totalCharges, 0),
    });
  } catch (error) {
    console.error("Get revenue by date range error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get loan summary report
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

    const activeLoans = await Loan.find({ status: "active" })
      .populate("customerId", "name phone")
      .sort({ createdAt: -1 });

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

// Get transaction summary
exports.getTransactionSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let dateFilter = {};
    if (startDate && endDate) {
      dateFilter = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const matchQuery = { status: "approved" };
    if (dateFilter.$gte) {
      matchQuery.date = dateFilter;
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
