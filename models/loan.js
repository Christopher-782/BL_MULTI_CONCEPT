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
    repaymentPeriod: {
      type: String,
      enum: ["weekly", "bi-weekly", "monthly"],
      required: true,
    },
    numberOfInstallments: { type: Number, required: true },
    installmentAmount: { type: Number, required: true },
    repaymentStartDate: { type: Date, required: true },
    repaymentEndDate: { type: Date, required: true },
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
    purpose: { type: String },
    notes: { type: String },
  },
  {
    timestamps: true,
  },
);

module.exports =
  mongoose.models.Loan || mongoose.model("Loan", loanSchema, "loans");
