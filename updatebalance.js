const mongoose = require("mongoose");
const Customer = require("./models/customer"); // Ensure this path is correct
const Transaction = require("./models/transaction"); // Ensure this path is correct

async function repairAllCustomerBalances() {
  // 1. Connect to your DB
  await mongoose.connect(
    "mongodb+srv://okpokorchristopher_db_user:Clement1256@nodejs.rbwp35a.mongodb.net/BL_MULTI_CONCEPT?appName=nodejs",
  );
  console.log("🚀 Connected to database. Starting Customer Balance Repair...");

  const customers = await Customer.find({});
  let fixedCount = 0;
  let errorCount = 0;

  for (const customer of customers) {
    try {
      // 2. Find every APPROVED transaction for this specific customer
      const transactions = await Transaction.find({
        customerId: customer.id,
        status: "approved",
      });

      // 3. Calculate the mathematically correct balance
      // Sum up all netAmounts (deposits add, withdrawals subtract)
      const calculatedBalance = transactions.reduce((sum, txn) => {
        // If it's a deposit, add. If it's a withdrawal, subtract.
        // Note: Transaction.netAmount should already be correctly signed
        // based on your transaction controller logic.
        const amount = txn.netAmount || 0;

        if (txn.type === "deposit" || txn.type === "loan_disbursement") {
          return sum + amount;
        } else if (txn.type === "withdrawal" || txn.type === "loan_repayment") {
          return sum - Math.abs(amount);
        } else {
          return sum;
        }
      }, 0);

      // 4. Only update if the current balance is different from the calculated one
      if (Math.abs(customer.cashBalance - calculatedBalance) > 0.01) {
        console.log(
          `🛠️ Fixing ${customer.name} (${customer.id}): ${customer.cashBalance} -> ${calculatedBalance}`,
        );

        await Customer.updateOne(
          { _id: customer._id },
          {
            $set: {
              cashBalance: calculatedBalance,
              balance: calculatedBalance,
            },
          },
        );
        fixedCount++;
      }
    } catch (err) {
      console.error(`❌ Error repairing customer ${customer.id}:`, err.message);
      errorCount++;
    }
  }

  console.log("\n--- REPAIR SUMMARY ---");
  console.log(`✅ Successfully synchronized: ${fixedCount} customers`);
  console.log(`❌ Errors encountered: ${errorCount}`);
  console.log("----------------------\n");

  process.exit();
}

repairAllCustomerBalances();
