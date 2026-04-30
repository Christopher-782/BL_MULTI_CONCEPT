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

router.patch("/:transactionId/approve", approveTransaction);
router.patch("/:transactionId/reject", rejectTransaction);

module.exports = router;
