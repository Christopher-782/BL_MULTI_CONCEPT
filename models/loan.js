const mongoose = require("mongoose");

const loanSchema = new mongoose.Schema(
  {
    id: { type: String, unique: true },
    customerId: { type: String, required: true },
    customerName: { type: String, required: true },
    customerNumber: { type: String },
    phone: { type: String },
    type: { type: String, enum: ["loan", "overdraft"], required: true },
    amount: { type: Number, required: true },
    interestRate: { type: Number, required: true },
    totalPayable: { type: Number, required: true },

    // FIX: Made optional - only required for regular loans
    repaymentPeriod: {
      type: String,
      enum: ["weekly", "bi-weekly", "monthly"],
      default: null,
    },
    numberOfInstallments: { type: Number, default: 1 },
    installmentAmount: { type: Number, default: 0 },

    // FIX: Made optional for overdraft
    repaymentStartDate: { type: Date, default: null },
    repaymentEndDate: { type: Date, default: null },

    // NEW: Payment deadline for overdraft
    paymentDeadline: { type: Date, default: null },

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
        principalPortion: { type: Number, default: 0 },
        interestPortion: { type: Number, default: 0 },
        interestRevenue: { type: Number, default: 0 },
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
    amountRepaid: { type: Number, default: 0 },
    outstandingBalance: { type: Number, default: 0 },
    principalRepaidToDate: { type: Number, default: 0 },
    interestEarnedToDate: { type: Number, default: 0 },
    purpose: { type: String },
    notes: { type: String },
  },
  {
    timestamps: true,
  },
);

loanSchema.index({ status: 1, "repayments.status": 1 });
loanSchema.index({ interestEarnedToDate: 1 });

module.exports =
  mongoose.models.Loan || mongoose.model("Loan", loanSchema, "loans");
