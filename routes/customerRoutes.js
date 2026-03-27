const express = require("express");
const router = express.Router();
const {
  createCustomer,
  getAllCustomers,
  getCustomersByStaff,
  updateCustomer,
  deleteCustomer,
  getCustomerByNumber,
} = require("../controllers/customerController");

router.post("/customers", createCustomer);
router.get("/customers", getAllCustomers);
router.get("/customers/number/:number", getCustomerByNumber); // New route
router.get("/customers/staff/:staffId", getCustomersByStaff);
router.put("/customers/:id", updateCustomer);
router.delete("/customers/:id", deleteCustomer);

module.exports = router;
