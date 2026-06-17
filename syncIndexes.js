const mongoose = require("mongoose");
require("dotenv").config();

const MONGO = process.env.MONGO || "mongodb://localhost:27017/your_db";

async function syncIndexes() {
  try {
    await mongoose.connect(MONGO);
    console.log("Connected to MongoDB");

    // Require your models so they're registered
    require("./models/customer");
    // require('../models/loan');
    // require('../models/transaction');

    const result = await mongoose.model("Customer").syncIndexes();
    console.log("Customer indexes synced:", result);

    await mongoose.disconnect();
    console.log("Disconnected");
    process.exit(0);
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
}

syncIndexes();
