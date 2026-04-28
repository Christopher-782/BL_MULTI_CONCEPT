const mongoose = require("mongoose");

// 1. PASTE YOUR DATABASE CONNECTION STRING HERE
const MONGO_URI =
  "mongodb+srv://okpokorchristopher_db_user:Clement1256@nodejs.rbwp35a.mongodb.net/BL_MULTI_CONCEPT?appName=nodejs";

// 2. IMPORT YOUR MODELS
const Transaction = require("./models/Transaction");
const Customer = require("./models/Customer");

async function runMigration() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("✅ Connected to database successfully.");

    const transactions = await Transaction.find({});
    console.log(
      `🔍 Found ${transactions.length} transactions. Starting SILENT migration...`,
    );

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const txn of transactions) {
      try {
        // 1. Skip if already fixed
        if (txn.staffName && txn.staffId) {
          skippedCount++;
          continue;
        }

        // 2. Find the customer using the custom string ID (CUST...)
        // We use findOne({ id: ... }) to avoid the ObjectId CastError
        const customer = await Customer.findOne({ id: txn.customerId });

        if (customer && customer.addedBy) {
          // 3. THE SURGICAL UPDATE
          // We use updateOne() instead of .save()
          // This bypasss all backend "hooks" and prevents balance recalculation
          await Transaction.updateOne(
            { _id: txn._id },
            {
              $set: {
                staffName: customer.addedBy.staffName,
                staffId: customer.addedBy.staffId,
                requestedBy: customer.addedBy.staffName,
                requestedById: customer.addedBy.staffId,
              },
            },
          );

          updatedCount++;
          console.log(`✔️ Silently updated Txn ${txn._id}`);
        } else {
          console.log(
            `⚠️ Skipped Txn ${txn._id}: No customer/staff link found.`,
          );
          skippedCount++;
        }
      } catch (err) {
        console.error(`❌ Error on Txn ${txn._id}: ${err.message}`);
        errorCount++;
      }
    }

    console.log("\n--- MIGRATION SUMMARY ---");
    console.log(`✅ Successfully updated: ${updatedCount} transactions`);
    console.log(`⏭️  Skipped/No Info: ${skippedCount} transactions`);
    console.log(`❌ Errors: ${errorCount} transactions`);
    console.log("--------------------------");

    process.exit(0);
  } catch (error) {
    console.error("❌ FATAL ERROR:", error);
    process.exit(1);
  }
}

runMigration();
