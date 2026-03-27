const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  customerId: { type: String, required: true },
  customerName: { type: String, required: true },
  customerNumber: { type: String },
  phone: { type: String },

  // Loan details
  type: { type: String, enum: ["loan", "overdraft"], required: true },
  amount: { type: Number, required: true },
  interestRate: { type: Number, required: true }, // Percentage (e.g., 5 for 5%)
  totalPayable: { type: Number, required: true }, // amount + interest

  // Repayment schedule
  repaymentPeriod: {
    type: String,
    enum: ["weekly", "bi-weekly", "monthly"],
    required: true,
  },
  numberOfInstallments: { type: Number, required: true },
  installmentAmount: { type: Number, required: true },
  repaymentStartDate: { type: Date, required: true },
  repaymentEndDate: { type: Date, required: true },

  // Payment tracking
  repayments: [
    {
      id: { type: String },
      dueDate: { type: Date },
      amount: { type: Number },
      paidDate: { type: Date },
      status: {
        type: String,
        enum: ["pending", "paid", "overdue"],
        default: "pending",
      },
      paidBy: { type: String },
    },
  ],

  // Status tracking
  status: {
    type: String,
    enum: [
      "pending",
      "approved",
      "active",
      "completed",
      "defaulted",
      "rejected",
    ],
    default: "pending",
  },

  // Request details
  requestedBy: {
    staffId: { type: String },
    staffName: { type: String },
  },
  requestedAt: { type: Date, default: Date.now },

  // Approval details
  approvedBy: {
    adminId: { type: String },
    adminName: { type: String },
    approvedAt: { type: Date },
  },

  // Financial tracking
  amountDisbursed: { type: Number, default: 0 },
  amountRepaid: { type: Number, default: 0 },
  outstandingBalance: { type: Number, default: 0 },

  // Additional notes
  purpose: { type: String },
  notes: { type: String },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// ========== FIX: Proper pre-save middleware ==========
loanSchema.pre("save", function (next) {
  // Update the updatedAt field
  this.updatedAt = new Date();
  // IMPORTANT: Call next() to continue the save operation
  next();
});

// Optional: Add pre-update middleware
loanSchema.pre("findOneAndUpdate", function (next) {
  this.set({ updatedAt: new Date() });
  next();
});

module.exports = mongoose.model("Loan", loanSchema, "loans");
