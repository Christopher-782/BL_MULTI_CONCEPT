const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  customerId: String,
  customerName: String,
  // REMOVED duplicate type definition - keep only the one below
  amount: Number,
  charges: { type: Number, default: 0 },
  netAmount: Number,
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  // Single type definition with all valid values including interest_revenue
  type: {
    type: String,
    enum: [
      "deposit",
      "withdrawal",
      "loan_disbursement",
      "loan_repayment",
      "interest_revenue", // ADD THIS
    ],
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
