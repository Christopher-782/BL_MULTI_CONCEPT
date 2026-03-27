const Loan = require("../models/loan");
const Transaction = require("../models/transaction");

// Get revenue reports - NO AGGREGATION, just simple find()
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
        startDate = new Date(0);
        endDate = new Date();
    }

    console.log(`Date range: ${startDate} to ${endDate}`);

    // Build query for transactions - use createdAt field
    let transactionQuery = {
      status: "approved",
      charges: { $gt: 0 },
    };

    if (period && period !== "all") {
      transactionQuery.createdAt = { $gte: startDate };
      if (period === "daily") {
        transactionQuery.createdAt.$lte = endDate;
      }
    }

    // SIMPLE FIND - NO AGGREGATION
    const transactions = await Transaction.find(transactionQuery);
    const totalCharges = transactions.reduce(
      (sum, t) => sum + (t.charges || 0),
      0,
    );

    console.log(
      `Found ${transactions.length} transactions with charges: ₦${totalCharges}`,
    );

    // Build query for loans - use createdAt field
    let loanQuery = { status: "completed" };

    if (period && period !== "all") {
      loanQuery.createdAt = { $gte: startDate };
      if (period === "daily") {
        loanQuery.createdAt.$lte = endDate;
      }
    }

    // SIMPLE FIND - NO AGGREGATION
    const loans = await Loan.find(loanQuery);
    const totalInterest = loans.reduce((sum, l) => {
      const interest = (l.totalPayable || l.amount) - (l.amount || 0);
      return sum + (interest > 0 ? interest : 0);
    }, 0);

    console.log(`Found ${loans.length} completed loans: ₦${totalInterest}`);

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
    res.status(500).json({ error: error.message });
  }
};

// Get revenue by date range - NO AGGREGATION
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

    // Get transactions - simple find
    const transactions = await Transaction.find({
      status: "approved",
      charges: { $gt: 0 },
      createdAt: { $gte: start, $lte: end },
    });

    const totalCharges = transactions.reduce(
      (sum, t) => sum + (t.charges || 0),
      0,
    );

    // Group by day manually (in JavaScript, not MongoDB)
    const dailyMap = {};
    transactions.forEach((t) => {
      const dateKey = t.createdAt.toISOString().split("T")[0];
      if (!dailyMap[dateKey]) {
        dailyMap[dateKey] = { totalCharges: 0, totalTransactions: 0 };
      }
      dailyMap[dateKey].totalCharges += t.charges || 0;
      dailyMap[dateKey].totalTransactions += 1;
    });

    const dailyBreakdown = Object.entries(dailyMap)
      .map(([date, data]) => ({
        _id: { date },
        totalCharges: data.totalCharges,
        totalTransactions: data.totalTransactions,
      }))
      .sort((a, b) => a._id.date.localeCompare(b._id.date));

    // Get loans
    const loans = await Loan.find({
      status: "completed",
      createdAt: { $gte: start, $lte: end },
    });

    const totalInterest = loans.reduce((sum, l) => {
      const interest = (l.totalPayable || l.amount) - (l.amount || 0);
      return sum + (interest > 0 ? interest : 0);
    }, 0);

    res.json({
      success: true,
      startDate,
      endDate,
      dailyBreakdown,
      loanRevenue: { totalInterest, totalLoans: loans.length },
      totalRevenue: totalInterest + totalCharges,
    });
  } catch (error) {
    console.error("Get revenue by date range error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get loan summary report - NO AGGREGATION on date fields
exports.getLoanSummary = async (req, res) => {
  try {
    // Get all loans and group by status manually
    const allLoans = await Loan.find({});

    // Group by status
    const summaryMap = {};
    allLoans.forEach((loan) => {
      const status = loan.status;
      if (!summaryMap[status]) {
        summaryMap[status] = {
          count: 0,
          totalAmount: 0,
          totalPayable: 0,
          totalRepaid: 0,
          totalOutstanding: 0,
        };
      }
      summaryMap[status].count++;
      summaryMap[status].totalAmount += loan.amount || 0;
      summaryMap[status].totalPayable += loan.totalPayable || 0;
      summaryMap[status].totalRepaid += loan.amountRepaid || 0;
      summaryMap[status].totalOutstanding += loan.outstandingBalance || 0;
    });

    const summary = Object.entries(summaryMap).map(([_id, data]) => ({
      _id,
      ...data,
    }));

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

    const totalOutstanding = summary.reduce(
      (sum, s) => sum + (s.totalOutstanding || 0),
      0,
    );

    res.json({
      success: true,
      summary,
      activeLoansCount: activeLoans.length,
      activeLoans: activeLoans.slice(0, 10),
      upcomingRepayments: upcomingRepayments.slice(0, 10),
      totalOutstanding,
    });
  } catch (error) {
    console.error("Get loan summary error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get transaction summary - NO AGGREGATION on date fields
exports.getTransactionSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    let query = { status: "approved" };

    if (startDate && endDate) {
      query.createdAt = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    }

    const transactions = await Transaction.find(query);

    // Group by type manually
    const byTypeMap = {};
    let totalAmount = 0;
    let totalCharges = 0;
    let totalNet = 0;

    transactions.forEach((t) => {
      const type = t.type;
      if (!byTypeMap[type]) {
        byTypeMap[type] = {
          totalAmount: 0,
          totalCharges: 0,
          totalNet: 0,
          count: 0,
        };
      }
      byTypeMap[type].totalAmount += t.amount || 0;
      byTypeMap[type].totalCharges += t.charges || 0;
      byTypeMap[type].totalNet += t.netAmount || 0;
      byTypeMap[type].count++;

      totalAmount += t.amount || 0;
      totalCharges += t.charges || 0;
      totalNet += t.netAmount || 0;
    });

    const summary = Object.entries(byTypeMap).map(([_id, data]) => ({
      _id,
      ...data,
    }));

    res.json({
      success: true,
      byType: summary,
      total: {
        totalAmount,
        totalCharges,
        totalNet,
        count: transactions.length,
      },
    });
  } catch (error) {
    console.error("Get transaction summary error:", error);
    res.status(500).json({ error: error.message });
  }
};
