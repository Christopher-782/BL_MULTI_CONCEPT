// routes/transactions.js
const express = require("express");
const router = express.Router();
const {
  getAllTransactions,
  getTransactionStats,
  createTransaction,
  approveTransaction,
  rejectTransaction,
  getTransactionsByCustomer,
} = require("../controllers/transactionController");

// GET routes
router.get("/transactions", getAllTransactions);
router.get("/transactions/stats", getTransactionStats);
router.get("/transactions/customer/:customerId", getTransactionsByCustomer);

// POST route
router.post("/transactions", createTransaction);

// PATCH routes - FIXED parameter names
router.patch("/transactions/:transactionId", approveTransaction);
router.patch("/transactions/:transactionId/reject", rejectTransaction);

module.exports = router;
