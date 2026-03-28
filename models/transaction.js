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
  // In your transaction schema, update the type enum
  type: {
    type: String,
    enum: ["deposit", "withdrawal", "loan_disbursement", "loan_repayment"],
    required: true,
  },
  // Change from String to Date
  date: { type: Date, default: Date.now },
  approvedBy: String,
  description: String,
  requestedBy: String,
  requestedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

// Index for faster queries
transactionSchema.index({ date: -1, status: 1, charges: 1 });

module.exports = mongoose.model(
  "Transaction",
  transactionSchema,
  "transactions",
);
