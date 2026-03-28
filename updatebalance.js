// scripts/migrate-customer-balances.js
const mongoose = require("mongoose");
const Customer = require("../models/customer");

async function migrateCustomerBalances() {
  try {
    const customers = await Customer.find();

    for (const customer of customers) {
      // If they have old balance field, move it to cashBalance
      if (
        customer.balance !== undefined &&
        customer.cashBalance === undefined
      ) {
        customer.cashBalance = customer.balance;
        customer.loanBalance = 0;
        customer.totalLoanAmount = 0;
        customer.totalInterestAccrued = 0;
        await customer.save();
        console.log(
          `Migrated customer ${customer.name}: Cash = ₦${customer.cashBalance}`,
        );
      }
    }

    console.log("Migration complete!");
  } catch (error) {
    console.error("Migration error:", error);
  } finally {
    mongoose.disconnect();
  }
}

migrateCustomerBalances();
