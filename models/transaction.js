const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  customerId: String,
  customerName: String,
  customerPhone: String, // <-- ADD THIS (for SMS)
  amount: Number,
  charges: { type: Number, default: 0 },
  netAmount: Number,
  status: {
    type: String,
    enum: ["pending", "approved", "rejected"],
    default: "pending",
  },
  type: {
    type: String,
    enum: [
      "deposit",
      "withdrawal",
      "loan_disbursement",
      "loan_repayment",
      "interest_revenue",
    ],
    required: true,
  },
  date: { type: Date, default: Date.now },
  approvedBy: String,
  approvedAt: Date, // <-- ADD THIS
  rejectedBy: String, // <-- ADD THIS
  rejectedAt: Date, // <-- ADD THIS
  rejectionReason: String, // <-- ADD THIS
  description: String,

  // STAFF FIELDS - ADD THESE
  requestedBy: { type: String, default: "System" }, // Staff name
  requestedById: { type: String, default: null }, // Staff ID <-- KEY FIX
  staffName: { type: String, default: "System" }, // Alias for frontend
  staffId: { type: String, default: null }, // Alias for frontend

  requestedAt: Date,
  finalBalance: Number, // <-- ADD THIS (track balance after approval)
  createdAt: { type: Date, default: Date.now },
});

// Better indexes for common queries
transactionSchema.index({ date: -1 });
transactionSchema.index({ status: 1, requestedById: 1 }); // <-- ADD THIS for staff grouping
transactionSchema.index({ customerId: 1, date: -1 });

module.exports = mongoose.model(
  "Transaction",
  transactionSchema,
  "transactions",
);
