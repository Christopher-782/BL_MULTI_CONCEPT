const Staff = require("../models/staff");

exports.createStaff = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Check if staff already exists
    const existingUser = await Staff.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ error: "Staff already exists" });
    }

    // Create new staff (password stored as plain text)
    const staff = new Staff({
      name,
      email,
      password,
      role: role || "staff",
      status: "active",
      lastActive: "Just now",
    });

    await staff.save();

    res.status(201).json({
      message: "Staff created successfully",
      staff: {
        id: staff._id,
        name: staff.name,
        email: staff.email,
        role: staff.role,
      },
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.getAllStaff = async (req, res) => {
  try {
    const staff = await Staff.find({}, "-password");
    res.json(staff);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, role } = req.body;
    console.log("Login attempt:", email, password, role);
    const user = await Staff.findOne({ email, role });
    console.log("User found:", user);

    if (!user || user.password !== password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    res.json({
      name: user.name,
      email: user.email,
      role: user.role,
      id: user._id,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
