const express = require("express");
const router = express.Router();
const {
  getRevenueByRepaymentDate, // ← FIXED: Was getRevenueReports
  getRevenueByDateRange,
  getLoanSummary,
  getTransactionSummary,
} = require("../controllers/reportController");

// Revenue reports
router.get("/reports/revenue", getRevenueByRepaymentDate); // ← FIXED
router.get("/reports/revenue/range", getRevenueByDateRange);
router.get("/reports/loans/summary", getLoanSummary);
router.get("/reports/transactions/summary", getTransactionSummary);

module.exports = router;
