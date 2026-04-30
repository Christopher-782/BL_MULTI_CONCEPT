// transactionRoute.js
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

// GET routes (Notice we removed "/transactions")
router.get("/", getAllTransactions);
router.get("/stats", getTransactionStats);
router.get("/customer/:customerId", getTransactionsByCustomer);

// POST route
router.post("/", createTransaction);

// PATCH routes (Notice we removed "/transactions")
router.patch("/:transactionId/approve", approveTransaction);
router.patch("/:transactionId/reject", rejectTransaction);

module.exports = router;
