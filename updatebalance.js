// Run this ONCE as a migration script (e.g., node migrate.js)
const mongoose = require("mongoose");

async function migrate() {
  await mongoose.connect(
    "mongodb+srv://okpokorchristopher_db_user:Clement1256@nodejs.rbwp35a.mongodb.net/BL_MULTI_CONCEPT?appName=nodejs",
  );

  const db = mongoose.connection.db;
  const collection = db.collection("customers");

  // Find all customers where id is stored as number
  const numericIds = await collection
    .find({ id: { $type: "number" } })
    .toArray();
  console.log(`Found ${numericIds.length} customers with numeric id`);

  for (const doc of numericIds) {
    await collection.updateOne(
      { _id: doc._id },
      {
        $set: {
          id: doc.id.toString(),
          customerNumber: doc.customerNumber?.toString(),
        },
      },
    );
    console.log(
      `Migrated: ${doc.name} (id: ${doc.id} → "${doc.id.toString()}")`,
    );
  }

  console.log("Migration complete");
  process.exit(0);
}

migrate().catch(console.error);
