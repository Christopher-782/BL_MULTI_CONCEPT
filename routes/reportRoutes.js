const express = require("express");
const router = express.Router();
const {
  getRevenueReports,
  getRevenueByDateRange,
  getLoanSummary,
  getTransactionSummary,
} = require("../controllers/reportController");

// Revenue reports
router.get("/reports/revenue", getRevenueReports);
router.get("/reports/revenue/range", getRevenueByDateRange);
router.get("/reports/loans/summary", getLoanSummary);
router.get("/reports/transactions/summary", getTransactionSummary);

module.exports = router;
