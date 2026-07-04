const express = require("express");
const router = express.Router();
const Expense = require("../models/expenses");

// @desc    Get all expenses
// @route   GET /api/expenses
router.get("/", async (req, res) => {
  try {
    const expenses = await Expense.find().sort({ date: -1 });
    res.json(expenses);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// @desc    Create a new expense
// @route   POST /api/expenses
router.post("/", async (req, res) => {
  const { description, amount, category, date } = req.body;
  try {
    const newExpense = new Expense({
      description,
      amount,
      category,
      date: date || Date.now(),
    });
    const savedExpense = await newExpense.save();
    res.status(201).json(savedExpense);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
