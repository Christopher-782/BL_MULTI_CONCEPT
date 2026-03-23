// transaction.js model
const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  customerId: String,
  customerName: String,
  type: { type: String, enum: ["deposit", "withdrawal"] },
  amount: Number,
  charges: { type: Number, default: 0 },
  netAmount: Number,
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  date: String,
  approvedBy: String,
  description: String,
  requestedBy: String,
  requestedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model(
  "Transaction",
  transactionSchema,
  "transactions",
);
