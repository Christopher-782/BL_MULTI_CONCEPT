const mongoose = require("mongoose");
const dotenv = require("dotenv").config();

function parseDDMMYYYY(dateStr) {
  // Handle format: "27/03/2026 13:14:50" or "27/03/2026"
  const parts = dateStr.split(/[\/\s:]/);
  if (parts.length >= 3) {
    const day = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // JS months are 0-indexed
    const year = parseInt(parts[2], 10);
    const hour = parseInt(parts[3], 10) || 0;
    const minute = parseInt(parts[4], 10) || 0;
    const second = parseInt(parts[5], 10) || 0;

    return new Date(year, month, day, hour, minute, second);
  }
  return new Date(dateStr); // fallback
}

async function fixDates() {
  await mongoose.connect(process.env.MONGO);

  const db = mongoose.connection.db;

  const cursor = db.collection("transactions").find({
    $expr: { $eq: [{ $type: "$date" }, "string"] },
  });

  let count = 0;
  for await (const doc of cursor) {
    const fixedDate = parseDDMMYYYY(doc.date);

    if (isNaN(fixedDate.getTime())) {
      console.log(`Skipping invalid date: ${doc.date} (id: ${doc._id})`);
      continue;
    }

    await db
      .collection("transactions")
      .updateOne({ _id: doc._id }, { $set: { date: fixedDate } });
    console.log(`Fixed: ${doc.date} → ${fixedDate.toISOString()}`);
    count++;
  }

  console.log(`\nFixed ${count} documents total`);
  process.exit(0);
}

fixDates().catch((err) => {
  console.error(err);
  process.exit(1);
});
