const express = require("express");
const router = express.Router();
const mongoose = require("mongoose"); // Add this import
const Staff = require("../models/staff"); // Add this import - adjust path as needed
const {
  getAllStaff,
  login,
  createStaff,
} = require("../controllers/staffController");

router.post("/login", login);
router.post("/staff", createStaff);
router.get("/staff", getAllStaff);

// Add to your staff routes file
router.get("/check-collection", async (req, res) => {
  try {
    // Check if mongoose is connected
    if (mongoose.connection.readyState !== 1) {
      return res.status(500).json({
        error: "Database not connected",
        connectionState: mongoose.connection.readyState,
      });
    }

    // Count documents in staffs collection
    const count = await Staff.countDocuments();

    // Get all users (excluding passwords)
    const users = await Staff.find({}, "-password");

    // Also check collection name directly
    const collections = await mongoose.connection.db
      .listCollections()
      .toArray();
    const collectionNames = collections.map((c) => c.name);

    res.json({
      collectionName: "staffs",
      collections: collectionNames,
      userCount: count,
      users: users,
      database: {
        name: mongoose.connection.name,
        host: mongoose.connection.host,
        port: mongoose.connection.port,
      },
    });
  } catch (error) {
    console.error("Check collection error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Add a simple test endpoint to verify the route works
router.get("/test", (req, res) => {
  res.json({ message: "Staff routes are working" });
});

module.exports = router;
