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
  getPendingTransactions,
} = require("../controllers/transactionController");

// Health check/debug route
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Transaction route is working",
  });
});

// GET routes
router.get("/", getAllTransactions);
router.get("/stats", getTransactionStats);
router.get("/pending", getPendingTransactions);
router.get("/customer/:customerId", getTransactionsByCustomer);

// POST route
router.post("/", createTransaction);

// PATCH routes
router.patch("/:transactionId/approve", approveTransaction);
router.patch("/:transactionId/reject", rejectTransaction);

module.exports = router;
