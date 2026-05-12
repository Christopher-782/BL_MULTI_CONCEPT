const express = require("express");
const router = express.Router();
const {
  createLoanRequest,
  getAllLoans,
  getLoansByStaff,
  getLoansByCustomer,
  approveLoan,
  rejectLoan,
  recordRepayment,
  getRevenueReports,
  getLoanSummary,
  getCustomerLoanSummary,
  getDashboardSummary,
} = require("../controllers/loanController");
const {
  validateLoanRequest,
  enforceOverdraftRate,
} = require("../middleware/loanValidation");

console.log("Middleware check:", validateLoanRequest);
console.log("Controller check:", createLoanRequest);

// ========== LOAN ROUTES ==========
router.post("/loans", createLoanRequest);
router.get("/loans", getAllLoans);
router.get("/loans/staff/:staffId", getLoansByStaff);
router.get("/loans/customer/:customerId", getLoansByCustomer);

// ========== LOAN ACTIONS ==========
router.patch("/loans/:loanId/approve", approveLoan);
router.patch("/loans/:loanId/reject", rejectLoan);

// ========== REPAYMENT (FIXED: PATCH instead of POST) ==========
router.patch("/loans/:loanId/repayments/:repaymentId", recordRepayment);

// ========== REPORTS & DASHBOARD ==========
router.get("/reports/revenue", getRevenueReports);
router.get("/dashboard/summary", getDashboardSummary);
router.get("/loans/summary", getLoanSummary);
router.get("/loans/customer/:customerId/summary", getCustomerLoanSummary);

module.exports = router;
