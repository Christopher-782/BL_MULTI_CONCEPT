const Customer = require("../models/customer");

// Helper function to parse dates safely
function parseDate(dateString) {
  if (!dateString) return new Date();

  // If it's already a Date object
  if (dateString instanceof Date) return dateString;

  // Check if it's in DD/MM/YYYY format
  if (
    typeof dateString === "string" &&
    dateString.match(/^\d{2}\/\d{2}\/\d{4}$/)
  ) {
    const parts = dateString.split("/");
    // DD/MM/YYYY to YYYY-MM-DD
    return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
  }

  // Try to parse as ISO date
  const date = new Date(dateString);
  if (!isNaN(date.getTime())) return date;

  // Default to current date
  return new Date();
}

// Generate next available customer number
async function generateNextCustomerNumber() {
  try {
    // Get all existing customer numbers
    const customers = await Customer.find({
      customerNumber: { $exists: true, $ne: null },
    });
    const usedNumbers = customers
      .map((c) => parseInt(c.customerNumber))
      .filter((n) => !isNaN(n))
      .sort((a, b) => a - b);

    // Find next available number
    let nextNum = 1;
    for (let num of usedNumbers) {
      if (num === nextNum) {
        nextNum++;
      } else if (num > nextNum) {
        break;
      }
    }

    if (nextNum > 999) {
      return null; // No available numbers
    }

    return nextNum.toString().padStart(3, "0");
  } catch (error) {
    console.error("Error generating customer number:", error);
    return null;
  }
}

// Create customer with staff tracking and auto-generated customer number
exports.createCustomer = async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      balance, // Legacy field
      cashBalance, // New field
      loanBalance, // New field
      staffId,
      staffName,
      staffEmail,
      customerNumber, // Optional - can be provided or auto-generated
      joined, // Optional - can be provided or auto-generated
      status,
    } = req.body;

    console.log("Creating customer with data:", {
      name,
      email,
      phone,
      address,
      cashBalance: cashBalance || balance,
      loanBalance,
      staffId,
      staffName,
      staffEmail,
      customerNumber,
      joined,
    });

    // Validate required fields
    if (!name || !email || !phone) {
      return res
        .status(400)
        .json({ error: "Name, email, and phone are required" });
    }

    // Generate a customer ID
    const customerId = "CUST" + Date.now();

    // Check if customer already exists by email
    const existingCustomer = await Customer.findOne({ email });
    if (existingCustomer) {
      return res.status(400).json({ error: "Customer already exists" });
    }

    // Handle customer number
    let finalCustomerNumber = customerNumber;

    if (finalCustomerNumber) {
      // Check if provided number is available
      const numberExists = await Customer.findOne({
        customerNumber: finalCustomerNumber,
      });
      if (numberExists) {
        return res.status(400).json({
          error: `Customer number ${finalCustomerNumber} is already taken`,
        });
      }
    } else {
      // Auto-generate a number
      finalCustomerNumber = await generateNextCustomerNumber();
      if (!finalCustomerNumber) {
        return res
          .status(400)
          .json({ error: "No available customer numbers (001-999)" });
      }
    }

    // Handle balance - prefer cashBalance, fallback to balance
    const finalCashBalance =
      cashBalance !== undefined ? cashBalance : balance || 0;
    const finalLoanBalance = loanBalance || 0;

    // Handle joined date
    const joinedDate = joined ? parseDate(joined) : new Date();

    // Create customer object with separate balance tracking
    const customerData = {
      id: customerId,
      customerId: customerId,
      customerNumber: finalCustomerNumber,
      name,
      email,
      phone,
      address: address || "",
      // Separate balance tracking
      cashBalance: finalCashBalance,
      loanBalance: finalLoanBalance,
      totalLoanAmount: 0,
      totalInterestAccrued: 0,
      // Legacy field for backward compatibility
      balance: finalCashBalance,
      status: status || "active",
      joined: joinedDate,
    };

    // Only add addedBy if staff information is provided
    if (staffId && staffName) {
      customerData.addedBy = {
        staffId,
        staffName,
        staffEmail: staffEmail || "",
      };
    }

    const customer = new Customer(customerData);
    await customer.save();

    console.log(
      "Customer saved successfully:",
      customer.id,
      "Number:",
      customer.customerNumber,
      "Cash Balance:",
      customer.cashBalance,
      "Loan Balance:",
      customer.loanBalance,
    );

    res.status(201).json({
      message: "Customer created successfully",
      customer: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        cashBalance: customer.cashBalance,
        loanBalance: customer.loanBalance,
        netWorth: customer.cashBalance - customer.loanBalance,
        status: customer.status,
        joined: customer.joined,
        addedBy: customer.addedBy || null,
      },
    });
  } catch (error) {
    console.error("Create customer error:", error);

    // Handle validation errors
    if (error.name === "ValidationError") {
      const errors = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        error: "Validation error",
        details: errors,
      });
    }

    res.status(500).json({ error: error.message });
  }
};

// Get customer by customer number
exports.getCustomerByNumber = async (req, res) => {
  try {
    const { number } = req.params;
    const paddedNumber = number.padStart(3, "0");

    const customer = await Customer.findOne({ customerNumber: paddedNumber });

    if (!customer) {
      return res
        .status(404)
        .json({ error: `Customer number ${paddedNumber} not found` });
    }

    // Return with net worth calculation
    const customerData = customer.toObject();
    customerData.netWorth = customer.cashBalance - customer.loanBalance;

    res.json(customerData);
  } catch (error) {
    console.error("Get customer by number error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all customers (including who added them)
exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });

    // Add net worth to each customer
    const customersWithNetWorth = customers.map((customer) => {
      const customerObj = customer.toObject();
      customerObj.netWorth = customer.cashBalance - customer.loanBalance;
      return customerObj;
    });

    res.json(customersWithNetWorth);
  } catch (error) {
    console.error("Get all customers error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get customers added by a specific staff member
exports.getCustomersByStaff = async (req, res) => {
  try {
    const { staffId } = req.params;
    const customers = await Customer.find({ "addedBy.staffId": staffId }).sort({
      createdAt: -1,
    });

    // Add net worth to each customer
    const customersWithNetWorth = customers.map((customer) => {
      const customerObj = customer.toObject();
      customerObj.netWorth = customer.cashBalance - customer.loanBalance;
      return customerObj;
    });

    res.json(customersWithNetWorth);
  } catch (error) {
    console.error("Get customers by staff error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get customer summary with loan information
exports.getCustomerSummary = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findOne({ id: id });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Get loan information from Loan model
    const Loan = require("../models/loan");
    const loans = await Loan.find({ customerId: customer.id }).sort({
      createdAt: -1,
    });

    const activeLoans = loans.filter((l) => l.status === "active");
    const completedLoans = loans.filter((l) => l.status === "completed");
    const pendingLoans = loans.filter((l) => l.status === "pending");

    // Calculate total interest from paid loans
    let totalInterestPaid = 0;
    completedLoans.forEach((loan) => {
      totalInterestPaid += loan.totalInterest || 0;
    });

    res.json({
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        cashBalance: customer.cashBalance,
        loanBalance: customer.loanBalance,
        netWorth: customer.cashBalance - customer.loanBalance,
        totalLoanAmount: customer.totalLoanAmount,
        totalInterestPaid: totalInterestPaid,
        status: customer.status,
        joined: customer.joined,
      },
      loans: {
        active: activeLoans.length,
        completed: completedLoans.length,
        pending: pendingLoans.length,
        totalDisbursed: customer.totalLoanAmount,
        outstanding: customer.loanBalance,
      },
      activeLoans: activeLoans.map((loan) => ({
        id: loan.id,
        type: loan.type,
        amount: loan.amount,
        totalPayable: loan.totalPayable,
        repaid: loan.amountRepaid,
        outstanding: loan.outstandingBalance,
        nextInstallment: loan.repayments.find((r) => r.status === "pending")
          ?.dueDate,
      })),
    });
  } catch (error) {
    console.error("Get customer summary error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update customer balance (for deposits/withdrawals)
exports.updateCustomerBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type, description } = req.body;

    const customer = await Customer.findOne({ id: id });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    let update = {};
    if (type === "deposit") {
      update.cashBalance = customer.cashBalance + amount;
    } else if (type === "withdrawal") {
      if (customer.cashBalance < amount) {
        return res.status(400).json({ error: "Insufficient balance" });
      }
      update.cashBalance = customer.cashBalance - amount;
    } else {
      return res.status(400).json({ error: "Invalid transaction type" });
    }

    // Also update the legacy balance field
    update.balance = update.cashBalance;

    const updatedCustomer = await Customer.findOneAndUpdate(
      { id: id },
      { $set: update },
      { returnDocument: "after" },
    );

    res.json({
      message: "Balance updated successfully",
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        cashBalance: updatedCustomer.cashBalance,
        loanBalance: updatedCustomer.loanBalance,
        netWorth: updatedCustomer.cashBalance - updatedCustomer.loanBalance,
      },
    });
  } catch (error) {
    console.error("Update customer balance error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update customer loan balance (for loan disbursements/repayments)
exports.updateCustomerLoanBalance = async (req, res) => {
  try {
    const { id } = req.params;
    const { amount, type, interestAmount } = req.body;

    const customer = await Customer.findOne({ id: id });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    let update = {};
    if (type === "disbursement") {
      update.loanBalance = customer.loanBalance + amount;
      update.totalLoanAmount = (customer.totalLoanAmount || 0) + amount;
      if (interestAmount) {
        update.totalInterestAccrued =
          (customer.totalInterestAccrued || 0) + interestAmount;
      }
    } else if (type === "repayment") {
      if (customer.loanBalance < amount) {
        return res
          .status(400)
          .json({ error: "Loan balance would become negative" });
      }
      update.loanBalance = customer.loanBalance - amount;
    } else {
      return res.status(400).json({ error: "Invalid loan transaction type" });
    }

    const updatedCustomer = await Customer.findOneAndUpdate(
      { id: id },
      { $set: update },
      { returnDocument: "after" },
    );

    res.json({
      message: "Loan balance updated successfully",
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        cashBalance: updatedCustomer.cashBalance,
        loanBalance: updatedCustomer.loanBalance,
        netWorth: updatedCustomer.cashBalance - updatedCustomer.loanBalance,
        totalLoanAmount: updatedCustomer.totalLoanAmount,
      },
    });
  } catch (error) {
    console.error("Update customer loan balance error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update customer (general info, not balances)
exports.updateCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Remove fields that shouldn't be updated directly
    delete updates._id;
    delete updates.id;
    delete updates.customerNumber; // Prevent customer number updates
    delete updates.addedBy;
    delete updates.createdAt;
    delete updates.updatedAt;

    // Prevent balance updates through this endpoint (use specific endpoints)
    delete updates.cashBalance;
    delete updates.loanBalance;
    delete updates.balance;
    delete updates.totalLoanAmount;
    delete updates.totalInterestAccrued;

    // Handle joined date if provided
    if (updates.joined) {
      updates.joined = parseDate(updates.joined);
    }

    const customer = await Customer.findOneAndUpdate({ id: id }, updates, {
      returnDocument: "after",
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({
      message: "Customer updated successfully",
      customer: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        cashBalance: customer.cashBalance,
        loanBalance: customer.loanBalance,
        netWorth: customer.cashBalance - customer.loanBalance,
        status: customer.status,
      },
    });
  } catch (error) {
    console.error("Update customer error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Delete customer (optional)
exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer has active loans
    const Loan = require("../models/loan");
    const activeLoans = await Loan.findOne({
      customerId: id,
      status: { $in: ["active", "pending"] },
    });

    if (activeLoans) {
      return res.status(400).json({
        error: "Cannot delete customer with active or pending loans",
      });
    }

    const customer = await Customer.findOneAndDelete({ id: id });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({
      message: "Customer deleted successfully",
      customerId: customer.id,
      customerName: customer.name,
    });
  } catch (error) {
    console.error("Delete customer error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get customer statistics for dashboard
exports.getCustomerStatistics = async (req, res) => {
  try {
    const totalCustomers = await Customer.countDocuments();
    const activeCustomers = await Customer.countDocuments({ status: "active" });
    const customersWithLoans = await Customer.countDocuments({
      loanBalance: { $gt: 0 },
    });

    const totalCashBalance = await Customer.aggregate([
      { $group: { _id: null, total: { $sum: "$cashBalance" } } },
    ]);

    const totalLoanBalance = await Customer.aggregate([
      { $group: { _id: null, total: { $sum: "$loanBalance" } } },
    ]);

    const totalNetWorth =
      (totalCashBalance[0]?.total || 0) - (totalLoanBalance[0]?.total || 0);

    res.json({
      totalCustomers,
      activeCustomers,
      customersWithLoans,
      totalCashBalance: totalCashBalance[0]?.total || 0,
      totalLoanBalance: totalLoanBalance[0]?.total || 0,
      totalNetWorth,
    });
  } catch (error) {
    console.error("Get customer statistics error:", error);
    res.status(500).json({ error: error.message });
  }
};
