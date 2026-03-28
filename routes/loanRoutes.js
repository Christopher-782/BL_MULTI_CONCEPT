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
} = require("../controllers/loanController");

router.post("/loans", createLoanRequest);
router.get("/loans", getAllLoans);
router.get("/loans/staff/:staffId", getLoansByStaff);
router.get("/loans/customer/:customerId", getLoansByCustomer);
router.patch("/loans/:loanId/approve", approveLoan);
router.patch("/loans/:loanId/reject", rejectLoan);
router.post("/loans/:loanId/repayments/:repaymentId", recordRepayment);
router.get("/reports/revenue", getRevenueReports);
router.get("/loans/summary", getLoanSummary);
router.get("/loans/customer/:customerId/summary", getCustomerLoanSummary);

module.exports = router;
