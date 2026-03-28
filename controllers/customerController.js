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

// Helper function to format currency safely
function formatCurrency(amount) {
  if (amount === undefined || amount === null) return 0;
  return Number(amount);
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
      cashBalance: cashBalance !== undefined ? cashBalance : balance,
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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: "Invalid email format" });
    }

    // Validate phone format (basic)
    if (!phone || phone.length < 10) {
      return res.status(400).json({ error: "Valid phone number is required" });
    }

    // Generate a customer ID
    const customerId = "CUST" + Date.now() + Math.floor(Math.random() * 1000);

    // Check if customer already exists by email
    const existingCustomer = await Customer.findOne({ email });
    if (existingCustomer) {
      return res
        .status(400)
        .json({ error: "Customer with this email already exists" });
    }

    // Check if customer already exists by phone
    const existingPhone = await Customer.findOne({ phone });
    if (existingPhone) {
      return res
        .status(400)
        .json({ error: "Customer with this phone number already exists" });
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
    const finalCashBalance = formatCurrency(
      cashBalance !== undefined ? cashBalance : balance || 0,
    );
    const finalLoanBalance = formatCurrency(loanBalance || 0);

    // Handle joined date
    const joinedDate = joined ? parseDate(joined) : new Date();

    // Create customer object with separate balance tracking
    const customerData = {
      id: customerId,
      customerId: customerId,
      customerNumber: finalCustomerNumber,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      phone: phone.trim(),
      address: address ? address.trim() : "",
      // Separate balance tracking
      cashBalance: finalCashBalance,
      loanBalance: finalLoanBalance,
      totalLoanAmount: 0,
      totalInterestAccrued: 0,
      // Legacy field for backward compatibility
      balance: finalCashBalance,
      status: status || "active",
      joined: joinedDate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Only add addedBy if staff information is provided
    if (staffId && staffName) {
      customerData.addedBy = {
        staffId: staffId.trim(),
        staffName: staffName.trim(),
        staffEmail: staffEmail ? staffEmail.trim() : "",
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
      success: true,
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
        netWorth: (customer.cashBalance || 0) - (customer.loanBalance || 0),
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

    // Handle duplicate key errors
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      return res.status(400).json({
        error: `Duplicate value for ${field}. This value already exists.`,
      });
    }

    res.status(500).json({
      error: error.message || "Failed to create customer",
    });
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
    customerData.netWorth =
      (customer.cashBalance || 0) - (customer.loanBalance || 0);
    customerData.availableBalance = customer.cashBalance || 0;

    res.json(customerData);
  } catch (error) {
    console.error("Get customer by number error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get customer by ID
exports.getCustomerById = async (req, res) => {
  try {
    const { id } = req.params;

    const customer = await Customer.findOne({ id: id });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Return with net worth calculation
    const customerData = customer.toObject();
    customerData.netWorth =
      (customer.cashBalance || 0) - (customer.loanBalance || 0);
    customerData.availableBalance = customer.cashBalance || 0;

    res.json(customerData);
  } catch (error) {
    console.error("Get customer by ID error:", error);
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
      customerObj.netWorth =
        (customer.cashBalance || 0) - (customer.loanBalance || 0);
      customerObj.availableBalance = customer.cashBalance || 0;
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
      customerObj.netWorth =
        (customer.cashBalance || 0) - (customer.loanBalance || 0);
      customerObj.availableBalance = customer.cashBalance || 0;
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

    // Calculate total interest accrued from active loans
    let totalInterestAccrued = 0;
    activeLoans.forEach((loan) => {
      totalInterestAccrued += loan.totalInterest || 0;
    });

    // Calculate total repayments
    let totalRepaid = 0;
    loans.forEach((loan) => {
      totalRepaid += loan.amountRepaid || 0;
    });

    res.json({
      success: true,
      customer: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        cashBalance: customer.cashBalance || 0,
        loanBalance: customer.loanBalance || 0,
        netWorth: (customer.cashBalance || 0) - (customer.loanBalance || 0),
        totalLoanAmount: customer.totalLoanAmount || 0,
        totalInterestPaid: totalInterestPaid,
        totalInterestAccrued: totalInterestAccrued,
        totalRepaid: totalRepaid,
        status: customer.status,
        joined: customer.joined,
        addedBy: customer.addedBy,
      },
      loans: {
        active: activeLoans.length,
        completed: completedLoans.length,
        pending: pendingLoans.length,
        totalDisbursed: customer.totalLoanAmount || 0,
        outstanding: customer.loanBalance || 0,
        totalRepaid: totalRepaid,
      },
      activeLoans: activeLoans.map((loan) => ({
        id: loan.id,
        type: loan.type,
        amount: loan.amount,
        interestRate: loan.interestRate,
        totalPayable: loan.totalPayable,
        repaid: loan.amountRepaid,
        outstanding: loan.outstandingBalance,
        nextInstallment: loan.repayments?.find((r) => r.status === "pending")
          ?.dueDate,
        nextInstallmentAmount: loan.repayments?.find(
          (r) => r.status === "pending",
        )?.amount,
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

    // Validate input
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    if (!type || !["deposit", "withdrawal"].includes(type)) {
      return res.status(400).json({ error: "Invalid transaction type" });
    }

    const customer = await Customer.findOne({ id: id });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const currentCashBalance =
      customer.cashBalance !== undefined
        ? customer.cashBalance
        : customer.balance || 0;

    let newCashBalance;
    let update = {};

    if (type === "deposit") {
      newCashBalance = currentCashBalance + amount;
      update = {
        cashBalance: newCashBalance,
        balance: newCashBalance, // Legacy field
      };
    } else if (type === "withdrawal") {
      if (currentCashBalance < amount) {
        return res.status(400).json({
          error: "Insufficient balance",
          balance: currentCashBalance,
          required: amount,
        });
      }
      newCashBalance = currentCashBalance - amount;
      update = {
        cashBalance: newCashBalance,
        balance: newCashBalance, // Legacy field
      };
    }

    const updatedCustomer = await Customer.findOneAndUpdate(
      { id: id },
      { $set: update },
      { returnDocument: "after" },
    );

    res.json({
      success: true,
      message: "Balance updated successfully",
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        cashBalance: updatedCustomer.cashBalance,
        loanBalance: updatedCustomer.loanBalance || 0,
        netWorth:
          (updatedCustomer.cashBalance || 0) -
          (updatedCustomer.loanBalance || 0),
      },
      transaction: {
        type,
        amount,
        description: description || "",
        newBalance: newCashBalance,
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
    const { amount, type, interestAmount, loanId } = req.body;

    // Validate input
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: "Valid amount is required" });
    }

    if (!type || !["disbursement", "repayment"].includes(type)) {
      return res.status(400).json({ error: "Invalid loan transaction type" });
    }

    const customer = await Customer.findOne({ id: id });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    const currentLoanBalance = customer.loanBalance || 0;
    const currentCashBalance = customer.cashBalance || 0;
    let update = {};
    let newLoanBalance;
    let newCashBalance = currentCashBalance;

    if (type === "disbursement") {
      newLoanBalance = currentLoanBalance + amount;
      update = {
        loanBalance: newLoanBalance,
        totalLoanAmount: (customer.totalLoanAmount || 0) + amount,
      };

      if (interestAmount) {
        update.totalInterestAccrued =
          (customer.totalInterestAccrued || 0) + interestAmount;
      }
    } else if (type === "repayment") {
      if (currentLoanBalance < amount) {
        return res.status(400).json({
          error: "Loan balance would become negative",
          currentLoanBalance,
          repaymentAmount: amount,
        });
      }

      // Check if customer has enough cash balance for repayment
      if (currentCashBalance < amount) {
        return res.status(400).json({
          error: "Insufficient cash balance for loan repayment",
          cashBalance: currentCashBalance,
          required: amount,
        });
      }

      newLoanBalance = currentLoanBalance - amount;
      newCashBalance = currentCashBalance - amount;

      update = {
        loanBalance: newLoanBalance,
        cashBalance: newCashBalance,
        balance: newCashBalance, // Legacy field
      };
    }

    const updatedCustomer = await Customer.findOneAndUpdate(
      { id: id },
      { $set: update },
      { returnDocument: "after" },
    );

    res.json({
      success: true,
      message:
        type === "disbursement"
          ? "Loan disbursed successfully"
          : "Loan repayment recorded successfully",
      customer: {
        id: updatedCustomer.id,
        name: updatedCustomer.name,
        cashBalance: updatedCustomer.cashBalance || 0,
        loanBalance: updatedCustomer.loanBalance || 0,
        netWorth:
          (updatedCustomer.cashBalance || 0) -
          (updatedCustomer.loanBalance || 0),
        totalLoanAmount: updatedCustomer.totalLoanAmount || 0,
      },
      loanTransaction: {
        type,
        amount,
        interestAmount: interestAmount || 0,
        newLoanBalance,
        cashDeducted: type === "repayment" ? amount : 0,
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
    delete updates.customerId;
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

    // Validate email if being updated
    if (updates.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updates.email)) {
        return res.status(400).json({ error: "Invalid email format" });
      }
      updates.email = updates.email.toLowerCase().trim();

      // Check if email is taken by another customer
      const existingCustomer = await Customer.findOne({
        email: updates.email,
        id: { $ne: id },
      });
      if (existingCustomer) {
        return res
          .status(400)
          .json({ error: "Email already in use by another customer" });
      }
    }

    // Validate phone if being updated
    if (updates.phone && updates.phone.length < 10) {
      return res.status(400).json({ error: "Valid phone number is required" });
    }

    const customer = await Customer.findOneAndUpdate(
      { id: id },
      { $set: updates },
      { returnDocument: "after" },
    );

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({
      success: true,
      message: "Customer updated successfully",
      customer: {
        id: customer.id,
        customerNumber: customer.customerNumber,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        address: customer.address,
        cashBalance: customer.cashBalance || 0,
        loanBalance: customer.loanBalance || 0,
        netWorth: (customer.cashBalance || 0) - (customer.loanBalance || 0),
        status: customer.status,
        joined: customer.joined,
      },
    });
  } catch (error) {
    console.error("Update customer error:", error);

    if (error.code === 11000) {
      return res
        .status(400)
        .json({ error: "Duplicate value for unique field" });
    }

    res.status(500).json({ error: error.message });
  }
};

// Delete customer
exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;

    // Check if customer exists
    const customer = await Customer.findOne({ id: id });
    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    // Check if customer has active loans
    const Loan = require("../models/loan");
    const activeLoans = await Loan.findOne({
      customerId: id,
      status: { $in: ["active", "pending"] },
    });

    if (activeLoans) {
      return res.status(400).json({
        error: "Cannot delete customer with active or pending loans",
        activeLoanId: activeLoans.id,
        activeLoanType: activeLoans.type,
      });
    }

    // Check if customer has any pending transactions
    const Transaction = require("../models/transaction");
    const pendingTransactions = await Transaction.findOne({
      customerId: id,
      status: "pending",
    });

    if (pendingTransactions) {
      return res.status(400).json({
        error: "Cannot delete customer with pending transactions",
        pendingTransactionId: pendingTransactions.id,
      });
    }

    await Customer.findOneAndDelete({ id: id });

    res.json({
      success: true,
      message: "Customer deleted successfully",
      customer: {
        id: customer.id,
        name: customer.name,
        customerNumber: customer.customerNumber,
      },
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
    const inactiveCustomers = await Customer.countDocuments({
      status: "inactive",
    });
    const customersWithLoans = await Customer.countDocuments({
      loanBalance: { $gt: 0 },
    });
    const customersWithCash = await Customer.countDocuments({
      cashBalance: { $gt: 0 },
    });

    const totalCashBalance = await Customer.aggregate([
      { $group: { _id: null, total: { $sum: "$cashBalance" } } },
    ]);

    const totalLoanBalance = await Customer.aggregate([
      { $group: { _id: null, total: { $sum: "$loanBalance" } } },
    ]);

    const totalNetWorth =
      (totalCashBalance[0]?.total || 0) - (totalLoanBalance[0]?.total || 0);

    // Get average balances
    const avgCashBalance =
      totalCustomers > 0
        ? (totalCashBalance[0]?.total || 0) / totalCustomers
        : 0;
    const avgLoanBalance =
      totalCustomers > 0
        ? (totalLoanBalance[0]?.total || 0) / totalCustomers
        : 0;

    res.json({
      success: true,
      statistics: {
        totalCustomers,
        activeCustomers,
        inactiveCustomers,
        customersWithLoans,
        customersWithCash,
        totalCashBalance: totalCashBalance[0]?.total || 0,
        totalLoanBalance: totalLoanBalance[0]?.total || 0,
        totalNetWorth,
        avgCashBalance,
        avgLoanBalance,
      },
    });
  } catch (error) {
    console.error("Get customer statistics error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Search customers
exports.searchCustomers = async (req, res) => {
  try {
    const { query } = req.query;

    if (!query || query.trim() === "") {
      return res.status(400).json({ error: "Search query is required" });
    }

    const searchRegex = new RegExp(query, "i");

    const customers = await Customer.find({
      $or: [
        { name: searchRegex },
        { email: searchRegex },
        { phone: searchRegex },
        { customerNumber: searchRegex },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(20);

    const customersWithNetWorth = customers.map((customer) => {
      const customerObj = customer.toObject();
      customerObj.netWorth =
        (customer.cashBalance || 0) - (customer.loanBalance || 0);
      return customerObj;
    });

    res.json({
      success: true,
      count: customers.length,
      customers: customersWithNetWorth,
    });
  } catch (error) {
    console.error("Search customers error:", error);
    res.status(500).json({ error: error.message });
  }
};
