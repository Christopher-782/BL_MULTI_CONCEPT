const mongoose = require("mongoose");

const repaymentSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    dueDate: { type: Date, default: null },
    amount: { type: Number, default: 0, min: 0 },
    paidAmount: { type: Number, default: 0, min: 0 },
    paidDate: { type: Date, default: null },
    status: {
      type: String,
      enum: ["pending", "paid", "overdue"],
      default: "pending",
    },
    paidBy: { type: String, default: null },
    principalPortion: { type: Number, default: 0, min: 0 },
    interestPortion: { type: Number, default: 0, min: 0 },
    interestRevenue: { type: Number, default: 0, min: 0 },
    chargesPortion: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const loanSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      unique: true,
      immutable: true,
      trim: true,
    },
    customerId: { type: String, required: true, index: true },
    customerName: { type: String, required: true, trim: true },
    customerNumber: { type: String, default: null },
    phone: { type: String, default: "" },

    type: {
      type: String,
      enum: ["loan", "overdraft"],
      required: true,
    },

    amount: { type: Number, required: true, min: 0 },
    interestRate: { type: Number, required: true, min: 0 },
    totalPayable: { type: Number, required: true, min: 0 },
    processingCharges: { type: Number, default: 0, min: 0 },

    repaymentPeriod: {
      type: String,
      enum: ["weekly", "bi-weekly", "monthly", null],
      default: null,
    },
    numberOfInstallments: { type: Number, default: 1, min: 1 },
    installmentAmount: { type: Number, default: 0, min: 0 },

    repaymentStartDate: { type: Date, default: null },
    repaymentEndDate: { type: Date, default: null },
    paymentDeadline: { type: Date, default: null },

    repayments: { type: [repaymentSchema], default: [] },

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
      index: true,
    },

    requestedBy: {
      staffId: { type: String, default: null },
      staffName: { type: String, default: "System" },
    },
    requestedAt: { type: Date, default: Date.now },

    approvedBy: {
      adminId: { type: String, default: null },
      adminName: { type: String, default: null },
      approvedAt: { type: Date, default: null },
    },

    amountDisbursed: { type: Number, default: 0, min: 0 },
    amountRepaid: { type: Number, default: 0, min: 0 },
    outstandingBalance: { type: Number, default: 0, min: 0 },
    outstandingPrincipal: { type: Number, default: 0, min: 0 },
    outstandingInterest: { type: Number, default: 0, min: 0 },
    outstandingCharges: { type: Number, default: 0, min: 0 },

    principalRepaidToDate: { type: Number, default: 0, min: 0 },
    interestEarnedToDate: { type: Number, default: 0, min: 0 },
    chargesPaidToDate: { type: Number, default: 0, min: 0 },
    chargesRevenueRecorded: { type: Number, default: 0, min: 0 },

    completedAt: { type: Date, default: null },
    purpose: { type: String, default: "" },
    notes: { type: String, default: "" },
  },
  { timestamps: true },
);

loanSchema.index({ status: 1, "repayments.status": 1 });
loanSchema.index({ customerId: 1, type: 1, status: 1 });
loanSchema.index({ interestEarnedToDate: 1 });

module.exports =
  mongoose.models.Loan || mongoose.model("Loan", loanSchema, "loans");
