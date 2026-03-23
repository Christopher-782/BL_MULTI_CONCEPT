const express = require("express");
const router = express.Router();
const {
  getAllTransactions,
  getTransactionsByStatus,
  createTransaction,
  updateTransactionStatus,
} = require("../controllers/transactionController");

router.get("/transactions", getAllTransactions);
router.get("/status/:status", getTransactionsByStatus);
router.post("/transactions", createTransaction);
router.patch("/transactions/:id", updateTransactionStatus);

module.exports = router;
