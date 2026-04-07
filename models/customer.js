// models/customer.js
const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    customerNumber: { type: String, unique: true },
    name: { type: String, required: true },
    email: { type: String },
    phone: { type: String },
    address: { type: String },

    // BALANCE TRACKING - SEPARATE!
    cashBalance: { type: Number, default: 0 }, // Actual cash deposits
    loanBalance: { type: Number, default: 0 }, // Outstanding loan amount
    totalLoanAmount: { type: Number, default: 0 }, // Total loans taken
    totalInterestAccrued: { type: Number, default: 0 }, // Total interest on loans

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

module.exports =
  mongoose.models.Customer ||
  mongoose.model("Customer", customerSchema, "customers");
