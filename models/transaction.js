const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  customerId: String,
  customerName: String,
  customerPhone: String,
  amount: Number,
  charges: { type: Number, default: 0 },
  netAmount: Number,

  principalPortion: { type: Number, default: 0 },
  interestPortion: { type: Number, default: 0 },
  interestRevenue: { type: Number, default: 0 },
  chargesPortion: { type: Number, default: 0 },
  loanId: { type: String, default: null },
  repaymentId: { type: String, default: null },
  isOverdraftSettlement: { type: Boolean, default: false },
  isRevenue: { type: Boolean, default: false },
  revenueType: { type: String, default: null },

  // FIX: Added missing fields for overdraft auto-debit tracking
  isAutoDebit: { type: Boolean, default: false },
  autoDebitAmount: { type: Number, default: 0 },
  overdraftCleared: { type: Boolean, default: false },
  remainingAfterAutoDebit: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "voided"],
    default: "pending",
  },
  type: {
    type: String,
    enum: [
      "deposit",
      "withdrawal",
      "loan_disbursement",
      "overdraft_disbursement",
      "loan_repayment",
      "overdraft_repayment",
      "interest_revenue",
      "overdraft_charges_revenue",
      "manual_charge",
      "reversal",
    ],
    required: true,
  },
  date: { type: Date, default: Date.now },
  approvedBy: String,
  approvedAt: Date,
  rejectedBy: String,
  rejectedAt: Date,
  rejectionReason: String,
  description: String,
  requestedBy: { type: String, default: "System" },
  requestedById: { type: String, default: null },
  staffName: { type: String, default: "System" },
  staffId: { type: String, default: null },
  requestedAt: Date,
  finalBalance: Number,

  // FIX: Added void tracking fields
  voidedBy: { type: String, default: null },
  voidedAt: { type: Date },
  voidReason: { type: String, default: "" },
  reversalBalance: { type: Number },
  originalTransactionId: { type: String, default: null },

  createdAt: { type: Date, default: Date.now },
});

transactionSchema.index({ date: -1 });
transactionSchema.index({ status: 1, requestedById: 1 });
transactionSchema.index({ customerId: 1, date: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ loanId: 1 });
transactionSchema.index({ isAutoDebit: 1, type: 1 }); // FIX: Added for auto-debit queries
transactionSchema.index({ isRevenue: 1, revenueType: 1 }); // FIX: Added for revenue queries

module.exports = mongoose.model(
  "Transaction",
  transactionSchema,
  "transactions",
);
