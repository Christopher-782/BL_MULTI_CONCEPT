const mongoose = require("mongoose");

const customerSchema = new mongoose.Schema({
  id: { type: String, unique: true },
  customerId: { type: String, unique: true, sparse: true },
  name: String,
  email: String,
  phone: { type: String, required: true },
  balance: { type: Number, default: 0 },
  status: { type: String, enum: ["active", "inactive"], default: "active" },
  joined: String,
  address: String,
  // Track who added the customer
  addedBy: {
    staffId: { type: String },
    staffName: String,
    staffEmail: String,
  },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Customer", customerSchema, "customers");
