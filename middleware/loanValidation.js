const validateLoanRequest = async (req, res, next) => {
  const { type, amount, customerId } = req.body;

  try {
    const Customer = require("../models/customer");
    const Transaction = require("../models/transaction");

    const customer = await Customer.findOne({ id: customerId });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const cashBalance = customer.cashBalance || customer.balance || 0;

    if (type === "loan") {
      // Rule: Customer must have 40% of requested amount
      const requiredBalance = amount * 0.4;

      if (cashBalance < requiredBalance) {
        return res.status(400).json({
          error: "Loan eligibility failed",
          rule: "Customer must have 40% of requested amount in cash balance",
          required: requiredBalance,
          available: cashBalance,
          shortfall: requiredBalance - cashBalance,
        });
      }
    } else if (type === "overdraft") {
      // No credibility check for overdraft - admin will review manually
      // Force interest rate to 6.45% for overdraft
      req.body.interestRate = 6.45;
    }

    // Attach eligibility data for admin review
    req.eligibilityChecked = true;
    next();
  } catch (error) {
    console.error("Loan validation error:", error);
    res.status(500).json({ error: "Validation failed" });
  }
};

// Middleware to enforce overdraft interest rate on approval
const enforceOverdraftRate = (req, res, next) => {
  // If approving an overdraft, ensure interest rate is 6.45%
  if (req.body.type === "overdraft" || req.loan?.type === "overdraft") {
    req.body.interestRate = 6.45;
  }
  next();
};

module.exports = { validateLoanRequest, enforceOverdraftRate };
