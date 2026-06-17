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

const tc = require("../controllers/transactionController");
console.log("=== CONTROLLER EXPORTS ===");
console.log("Module type:", typeof tc);
console.log("Keys:", Object.keys(tc));
console.log("getAllTransactions:", typeof tc.getAllTransactions);
console.log("getTransactionStats:", typeof tc.getTransactionStats);
console.log("createTransaction:", typeof tc.createTransaction);
console.log("approveTransaction:", typeof tc.approveTransaction);
console.log("rejectTransaction:", typeof tc.rejectTransaction);
console.log("getTransactionsByCustomer:", typeof tc.getTransactionsByCustomer);

// GET routes (Notice we removed "/transactions")
router.get("/", getAllTransactions);
router.get("/stats", getTransactionStats);
router.get("/customer/:customerId", getTransactionsByCustomer);
router.get("/transactions/pending", getPendingTransactions);

// POST route
router.post("/", createTransaction);

// PATCH routes (Notice we removed "/transactions")
router.patch("/:transactionId/approve", approveTransaction);
router.patch("/:transactionId/reject", rejectTransaction);

module.exports = router;
