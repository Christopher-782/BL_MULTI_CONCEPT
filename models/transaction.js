const mongoose = require("mongoose");

function generateTransactionId() {
  return `TXN${Date.now()}${Math.random()
    .toString(36)
    .substring(2, 8)
    .toUpperCase()}`;
}

const transactionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      unique: true,
      required: true,
      default: generateTransactionId,
      index: true,
    },

    customerId: {
      type: String,
      required: true,
      index: true,
    },

    customerName: String,
    customerPhone: String,

    amount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },

    charges: {
      type: Number,
      min: 0,
      default: 0,
    },

    netAmount: {
      type: Number,
      default: 0,
    },

    principalPortion: { type: Number, default: 0 },
    interestPortion: { type: Number, default: 0 },
    interestRevenue: { type: Number, default: 0 },
    chargesPortion: { type: Number, default: 0 },

    loanId: { type: String, default: null },
    repaymentId: { type: String, default: null },

    isOverdraftSettlement: { type: Boolean, default: false },
    isRevenue: { type: Boolean, default: false },
    revenueType: { type: String, default: null },

    isAutoDebit: { type: Boolean, default: false },
    autoDebitAmount: { type: Number, default: 0 },
    overdraftCleared: { type: Boolean, default: false },
    remainingAfterAutoDebit: { type: Number, default: 0 },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "voided"],
      default: "pending",
      index: true,
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
      index: true,
    },

    date: {
      type: Date,
      default: Date.now,
      index: true,
    },

    approvedBy: String,
    approvedAt: Date,

    rejectedBy: String,
    rejectedAt: Date,
    rejectionReason: String,

    description: String,

    requestedBy: { type: String, default: "System" },
    requestedById: { type: String, default: null, index: true },

    staffName: { type: String, default: "System" },
    staffId: { type: String, default: null, index: true },

    requestedAt: Date,
    finalBalance: Number,

    voidedBy: { type: String, default: null },
    voidedAt: Date,
    voidReason: { type: String, default: "" },
    reversalBalance: Number,
    originalTransactionId: { type: String, default: null },
  },
  {
    timestamps: true,
  },
);

transactionSchema.pre("validate", function (next) {
  if (!this.id) {
    this.id = generateTransactionId();
  }

  if (this.netAmount === undefined || this.netAmount === null) {
    this.netAmount = Number(this.amount || 0) - Number(this.charges || 0);
  }

  next();
});

transactionSchema.index({ createdAt: -1 });
transactionSchema.index({ date: -1 });
transactionSchema.index({ status: 1, requestedById: 1 });
transactionSchema.index({ customerId: 1, date: -1 });
transactionSchema.index({ customerId: 1, createdAt: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ status: 1, createdAt: -1 });
transactionSchema.index({ requestedAt: -1 });
transactionSchema.index({ loanId: 1 });
transactionSchema.index({ isAutoDebit: 1, type: 1 });
transactionSchema.index({ isRevenue: 1, revenueType: 1 });

module.exports = mongoose.model(
  "Transaction",
  transactionSchema,
  "transactions",
);
