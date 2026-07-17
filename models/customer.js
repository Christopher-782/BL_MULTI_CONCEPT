const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
    },

    // Kept for backward compatibility with older controller payloads.
    customerId: { type: String, default: null, index: true },

    customerNumber: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
    },

    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    phone: { type: String, default: "", trim: true },
    address: { type: String, default: "", trim: true },

    // BALANCE TRACKING
    cashBalance: { type: Number, default: 0 },

    // Kept temporarily because the current frontend/backend still reads it.
    // Every balance-changing operation must update it with cashBalance.
    balance: { type: Number, default: 0 },

    loanBalance: { type: Number, default: 0, min: 0 },
    totalLoanAmount: { type: Number, default: 0, min: 0 },
    totalInterestAccrued: { type: Number, default: 0, min: 0 },
    totalRepaid: { type: Number, default: 0, min: 0 },

    // TRANSACTION SUMMARY FIELDS USED BY THE CONTROLLERS
    totalTransactions: { type: Number, default: 0, min: 0 },
    totalDeposits: { type: Number, default: 0, min: 0 },
    totalWithdrawals: { type: Number, default: 0, min: 0 },
    totalChargesPaid: { type: Number, default: 0, min: 0 },

    // LOAN / OVERDRAFT QUICK REFERENCES
    hasActiveOverdraft: { type: Boolean, default: false },
    activeLoanId: { type: String, default: null },
    hasActiveLoan: { type: Boolean, default: false },

    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },

    addedBy: {
      staffId: { type: String, default: null },
      staffName: { type: String, default: null },
      staffEmail: { type: String, default: null },
    },

    joined: { type: Date, default: Date.now },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

customerSchema.virtual("availableBalance").get(function () {
  return Number(this.cashBalance || 0);
});

customerSchema.virtual("netWorth").get(function () {
  return Number(this.cashBalance || 0) - Number(this.loanBalance || 0);
});

customerSchema.virtual("isNegativeBalance").get(function () {
  return Number(this.cashBalance || 0) < 0;
});

customerSchema.virtual("overdraftAmountUsed").get(function () {
  const balance = Number(this.cashBalance || 0);
  return balance < 0 ? Math.abs(balance) : 0;
});

customerSchema.index({ status: 1, createdAt: -1 });
customerSchema.index({ "addedBy.staffId": 1, createdAt: -1 });

module.exports =
  mongoose.models.Customer ||
  mongoose.model("Customer", customerSchema, "customers");
