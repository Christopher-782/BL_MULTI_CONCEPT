// scripts/fix-loan-disbursements.js
const mongoose = require("mongoose");
const Transaction = require("../models/transaction");
const Customer = require("../models/customer");
require("dotenv").config();

async function fixLoanDisbursements() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("Connected to MongoDB");

    // Find all loan disbursement transactions
    const disbursements = await Transaction.find({ type: "loan_disbursement" });

    for (const txn of disbursements) {
      // Fix the netAmount to be positive
      if (txn.netAmount < 0) {
        txn.netAmount = Math.abs(txn.netAmount);
        txn.amount = Math.abs(txn.amount);
        await txn.save();
        console.log(`Fixed transaction ${txn.id}: amount now ₦${txn.amount}`);
      }
    }

    // Recalculate all customer balances
    const customers = await Customer.find();

    for (const customer of customers) {
      const transactions = await Transaction.find({
        customerId: customer.id,
        status: "approved",
      }).sort({ date: 1 });

      let balance = 0;

      for (const txn of transactions) {
        if (txn.type === "deposit" || txn.type === "loan_disbursement") {
          balance += txn.netAmount;
        } else if (
          txn.type === "withdrawal" ||
          txn.type === "loan_repayment" ||
          txn.type === "loan_repayment_auto"
        ) {
          balance -= txn.netAmount;
        }
      }

      await Customer.findOneAndUpdate(
        { id: customer.id },
        {
          $set: {
            cashBalance: balance,
            balance: balance,
          },
        },
      );

      console.log(
        `Customer ${customer.name}: New balance ₦${balance.toLocaleString()}`,
      );
    }

    console.log("✅ Migration complete");
    process.exit(0);
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  }
}

fixLoanDisbursements();
