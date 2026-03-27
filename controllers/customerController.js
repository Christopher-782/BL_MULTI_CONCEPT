const Customer = require("../models/customer");

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
      balance,
      staffId,
      staffName,
      staffEmail,
      customerNumber, // Optional - can be provided or auto-generated
    } = req.body;

    console.log("Creating customer with data:", {
      name,
      email,
      phone,
      address,
      balance,
      staffId,
      staffName,
      staffEmail,
      customerNumber,
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
        return res
          .status(400)
          .json({
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

    // Create customer object
    const customerData = {
      id: customerId,
      customerId: customerId,
      customerNumber: finalCustomerNumber,
      name,
      email,
      phone,
      address: address || "",
      balance: balance || 0,
      status: "active",
      joined: new Date().toLocaleDateString("en-GB"),
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
        balance: customer.balance,
        status: customer.status,
        joined: customer.joined,
        addedBy: customer.addedBy || null,
      },
    });
  } catch (error) {
    console.error("Create customer error:", error);
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

    res.json(customer);
  } catch (error) {
    console.error("Get customer by number error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Get all customers (including who added them)
exports.getAllCustomers = async (req, res) => {
  try {
    const customers = await Customer.find().sort({ createdAt: -1 });
    res.json(customers);
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
    res.json(customers);
  } catch (error) {
    console.error("Get customers by staff error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Update customer
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

    const customer = await Customer.findOneAndUpdate({ id: id }, updates, {
      returnDocument: "after",
    });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json(customer);
  } catch (error) {
    console.error("Update customer error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Delete customer (optional)
exports.deleteCustomer = async (req, res) => {
  try {
    const { id } = req.params;
    const customer = await Customer.findOneAndDelete({ id: id });

    if (!customer) {
      return res.status(404).json({ error: "Customer not found" });
    }

    res.json({ message: "Customer deleted successfully" });
  } catch (error) {
    console.error("Delete customer error:", error);
    res.status(500).json({ error: error.message });
  }
};
