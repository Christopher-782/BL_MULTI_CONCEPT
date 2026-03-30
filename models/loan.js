const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    customerId: { type: String, required: true },
    customerName: { type: String, required: true },
    customerNumber: { type: String },
    phone: { type: String },
    type: { type: String, enum: ["loan", "overdraft"], required: true },
    amount: { type: Number, required: true }, // Principal amount
    interestRate: { type: Number, required: true },
    totalPayable: { type: Number, required: true }, // Principal + total interest
    repaymentPeriod: {
      type: String,
      enum: ["weekly", "bi-weekly", "monthly"],
      required: true,
    },
    numberOfInstallments: { type: Number, required: true },
    installmentAmount: { type: Number, required: true },
    repaymentStartDate: { type: Date, required: true },
    repaymentEndDate: { type: Date, required: true },

    // 🔴 ENHANCED: Repayments with interest tracking per installment
    repayments: [
      {
        id: { type: String },
        dueDate: { type: Date },
        amount: { type: Number }, // Total installment amount
        paidDate: { type: Date },
        status: {
          type: String,
          enum: ["pending", "paid", "overdue"],
          default: "pending",
        },
        paidBy: { type: String },
        // 🔴 NEW: Track principal/interest breakdown per installment
        principalPortion: { type: Number, default: 0 }, // Principal in this payment
        interestPortion: { type: Number, default: 0 }, // Interest in this payment
        interestRevenue: { type: Number, default: 0 }, // Revenue recognized (same as interestPortion)
      },
    ],

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
    requestedBy: {
      staffId: { type: String },
      staffName: { type: String },
    },
    requestedAt: { type: Date, default: Date.now },
    approvedBy: {
      adminId: { type: String },
      adminName: { type: String },
      approvedAt: { type: Date },
    },
    amountDisbursed: { type: Number, default: 0 },
    amountRepaid: { type: Number, default: 0 }, // Total paid (principal + interest)
    outstandingBalance: { type: Number, default: 0 },

    // 🔴 NEW: Track cumulative amounts from actual payments
    principalRepaidToDate: { type: Number, default: 0 }, // Principal actually collected
    interestEarnedToDate: { type: Number, default: 0 }, // Interest actually earned (revenue)

    purpose: { type: String },
    notes: { type: String },
  },
  {
    timestamps: true,
  },
);

// 🔴 NEW: Index for revenue reporting queries
loanSchema.index({ status: 1, "repayments.status": 1 });
loanSchema.index({ interestEarnedToDate: 1 });

module.exports =
  mongoose.models.Loan || mongoose.model("Loan", loanSchema, "loans");
