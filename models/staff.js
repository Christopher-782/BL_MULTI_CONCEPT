const mongoose = require("mongoose");

const staffSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  role: { type: String, enum: ["admin", "staff"], default: "staff" },
  password: String,
  status: { type: String, enum: ["active", "offline"], default: "active" },
  lastActive: { type: String, default: "Just now" },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Staff", staffSchema, "staffs");
