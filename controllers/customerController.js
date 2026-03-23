const Customer = require("../models/customer");

// Create customer with staff tracking
// Create customer with staff tracking
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
    });

    // Validate required fields
    if (!name || !email) {
      return res.status(400).json({ error: "Name and email are required" });
    }

    // Generate a customer ID
    const customerId = "CUST" + Date.now();

    // Check if customer already exists
    const existingCustomer = await Customer.findOne({ email });
    if (existingCustomer) {
      return res.status(400).json({ error: "Customer already exists" });
    }

    // Create customer object
    const customerData = {
      id: customerId,
      customerId: customerId,
      name,
      email,
      phone: phone || "",
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

    console.log("Customer saved successfully:", customer.id);

    res.status(201).json({
      message: "Customer created successfully",
      customer: {
        id: customer.id,
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
