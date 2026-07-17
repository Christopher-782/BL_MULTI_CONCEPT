const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
    },

    customerId: { type: String, default: null, index: true },
    customerName: { type: String, default: "", trim: true },
    customerPhone: { type: String, default: "", trim: true },

    amount: { type: Number, required: true, min: 0 },
    charges: { type: Number, default: 0, min: 0 },

    // Displayed transaction value:
    // deposit = amount - charges
    // withdrawal = amount + charges
    netAmount: { type: Number, required: true, default: 0 },

    // The exact value applied to the customer's cash balance.
    // A reversal always applies the negative of this value.
    balanceDelta: { type: Number, default: 0 },

    principalPortion: { type: Number, default: 0, min: 0 },
    interestPortion: { type: Number, default: 0, min: 0 },
    interestRevenue: { type: Number, default: 0, min: 0 },
    chargesPortion: { type: Number, default: 0, min: 0 },

    loanId: { type: String, default: null, index: true },
    repaymentId: { type: String, default: null },

    autoDebitAmount: { type: Number, default: 0, min: 0 },
    remainingAfterAutoDebit: { type: Number, default: 0 },
    overdraftCleared: { type: Boolean, default: false },
    isAutoDebit: { type: Boolean, default: false },
    isOverdraftSettlement: { type: Boolean, default: false },

    isRevenue: { type: Boolean, default: false },
    revenueType: { type: String, default: null },

    originalTransactionId: { type: String, default: null, index: true },
    reversalTransactionId: { type: String, default: null },

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

    date: { type: Date, default: Date.now, index: true },

    requestedBy: { type: String, default: "System" },
    requestedById: { type: String, default: null },
    staffName: { type: String, default: "System" },
    staffId: { type: String, default: null },
    requestedAt: { type: Date, default: Date.now },

    approvedBy: { type: String, default: null },
    approvedAt: { type: Date, default: null },

    rejectedBy: { type: String, default: null },
    rejectedAt: { type: Date, default: null },
    rejectionReason: { type: String, default: "" },

    voidedBy: { type: String, default: null },
    voidedAt: { type: Date, default: null },
    voidReason: { type: String, default: "" },
    reversalBalance: { type: Number, default: null },

    description: { type: String, default: "", trim: true },
    finalBalance: { type: Number, default: null },
  },
  { timestamps: true },
);

transactionSchema.index({ status: 1, requestedById: 1 });
transactionSchema.index({ customerId: 1, date: -1 });
transactionSchema.index({ type: 1, status: 1 });
transactionSchema.index({ originalTransactionId: 1, status: 1 });

module.exports =
  mongoose.models.Transaction ||
  mongoose.model("Transaction", transactionSchema, "transactions");
