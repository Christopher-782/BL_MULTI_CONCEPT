const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    customerNumber: { type: String, unique: true },
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    address: { type: String },

    // BALANCE TRACKING
    cashBalance: { type: Number, default: 0 }, // Can go negative with overdraft
    balance: { type: Number, default: 0 }, // Alias for cashBalance
    loanBalance: { type: Number, default: 0 }, // Outstanding regular loan amount
    totalLoanAmount: { type: Number, default: 0 }, // Total loans taken
    totalInterestAccrued: { type: Number, default: 0 }, // Total interest on loans

    // OVERDRAFT TRACKING
    hasActiveOverdraft: { type: Boolean, default: false },
    activeLoanId: { type: String, default: null }, // Can be loan or overdraft ID
    hasActiveLoan: { type: Boolean, default: false },

    // For quick reference
    status: { type: String, enum: ["active", "inactive"], default: "active" },

    // Metadata
    addedBy: {
      staffId: { type: String },
      staffName: { type: String },
      staffEmail: { type: String },
    },
    joined: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

// Virtual for total balance (cash only - loans not included)
customerSchema.virtual("availableBalance").get(function () {
  return this.cashBalance; // Loans are NOT available for withdrawal
});

// Virtual for net worth (cash minus loans)
customerSchema.virtual("netWorth").get(function () {
  return this.cashBalance - this.loanBalance;
});

// Virtual to check if balance is negative (overdraft active)
customerSchema.virtual("isNegativeBalance").get(function () {
  return this.cashBalance < 0;
});

// Virtual for overdraft amount used
customerSchema.virtual("overdraftAmountUsed").get(function () {
  return this.cashBalance < 0 ? Math.abs(this.cashBalance) : 0;
});

module.exports =
  mongoose.models.Customer ||
  mongoose.model("Customer", customerSchema, "customers");
