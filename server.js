const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv").config();
const path = require("path");
const mongoose = require("mongoose");
const customerRouter = require("./routes/customerRoutes");
const staffRouter = require("./routes/staffRoutes");
const transactionRouter = require("./routes/transactionRoutes");
const loanRoutes = require("./routes/loanRoutes");
const reportRoutes = require("./routes/reportRoutes");
const app = express();
mongoose
  .connect(process.env.MONGO)
  .then(() => console.log("MONGO IS CONNECTED"))
  .catch((err) => console.log("Failed To Connect:", err.message));

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

// Routes
app.use("/", staffRouter);
app.use("/", customerRouter);
app.use("/", transactionRouter);
app.use("/", loanRoutes);
app.use("/", reportRoutes);

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const Staff = require("./models/staff");

async function createAdmin() {
  const adminExists = await Staff.findOne({ role: "admin" });

  if (!adminExists) {
    await Staff.create({
      name: "Administrator",
      email: "admin@vaultflow.com",
      password: "admin123",
      role: "admin",
      status: "active",
    });

    console.log("Admin user created");
  }
}

createAdmin();

app.listen(process.env.PORT, () => {
  console.log(`Server running on port`);
});
