// transactionController.js - Fixed Version
const Transaction = require("../models/transaction");
const Customer = require("../models/customer");

// ✅ IMPORT SMS SERVICE
const {
  sendCreditAlert,
  sendDebitAlert,
  sendSMS,
} = require("../services/smsService");

exports.getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find().sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    console.error("Get all transactions error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getTransactionsByStatus = async (req, res) => {
  try {
    const transactions = await Transaction.find({ status: req.params.status });
    res.json(transactions);
  } catch (error) {
    console.error("Get transactions by status error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.createTransaction = async (req, res) => {
  try {
    console.log("Creating transaction with data:", req.body);

    // Get customer to retrieve phone number
    const customer = await Customer.findOne({ id: req.body.customerId });

    const txnId = "TXN" + Date.now();
    const charges = req.body.charges || 0;

    const netAmount =
      req.body.type === "deposit"
        ? req.body.amount - charges
        : req.body.amount + charges;

    const transactionData = {
      id: txnId,
      transactionId: txnId,
      customerId: req.body.customerId,
      customerName: req.body.customerName,
      customerPhone: customer?.phone || null,
      type: req.body.type,
      amount: req.body.amount,
      charges: charges,
      netAmount: netAmount,
      description: req.body.description || "",
      status: "pending",
      requestedBy: req.body.requestedBy || "Customer",
      requestedAt: req.body.requestedAt || new Date(),
      date: new Date(),
    };

    const transaction = new Transaction(transactionData);
    await transaction.save();

    console.log(`✅ Transaction created: ${txnId} for ${customer?.name}`);

    res.status(201).json(transaction);
  } catch (error) {
    console.error("Create transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.updateTransactionStatus = async (req, res) => {
  try {
    const { status, approvedBy } = req.body;

    console.log(
      `🔄 Updating transaction ${req.params.id} to status: ${status}`,
    );

    // Get current transaction
    const currentTransaction = await Transaction.findOne({ id: req.params.id });

    if (!currentTransaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    const charges = currentTransaction.charges || 0;

    const netAmount =
      currentTransaction.type === "deposit"
        ? currentTransaction.amount - charges
        : currentTransaction.amount + charges;

    // 🔒 Check withdrawal balance BEFORE approval
    if (status === "approved" && currentTransaction.type === "withdrawal") {
      const customer = await Customer.findOne({
        id: currentTransaction.customerId,
      });

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      // FIX: Use cashBalance instead of balance (based on your customer model)
      const availableBalance =
        customer.cashBalance !== undefined
          ? customer.cashBalance
          : customer.balance || 0;

      if (availableBalance < netAmount) {
        const rejectedTransaction = await Transaction.findOneAndUpdate(
          { id: req.params.id },
          {
            status: "rejected",
            approvedBy: "System - Insufficient Funds",
            processedAt: new Date(),
          },
          { returnDocument: "after" },
        );

        console.log(`❌ Transaction rejected: Insufficient funds`);

        // Send rejection SMS
        if (customer.phone) {
          try {
            const rejectionMessage = `VAULTFLOW BANKING

❌ TRANSACTION REJECTED
Type: ${currentTransaction.type.toUpperCase()}
Amount: ₦${(currentTransaction.amount || 0).toLocaleString()}
${charges > 0 ? `Charges: ₦${charges.toLocaleString()}` : ""}
Reason: Insufficient funds
Date: ${new Date().toLocaleString()}
Ref: ${currentTransaction.id}

Please ensure you have sufficient balance.`;

            await sendSMS(customer.phone, rejectionMessage);
          } catch (smsError) {
            console.error("Rejection SMS failed:", smsError.message);
          }
        }

        return res.status(400).json({
          error: "Insufficient funds for withdrawal including charges",
          transaction: rejectedTransaction,
        });
      }
    }

    // ✅ Update transaction status
    const updateData = {
      status,
      approvedBy,
      processedAmount: netAmount,
      processedAt: new Date(),
    };

    const transaction = await Transaction.findOneAndUpdate(
      { id: req.params.id },
      updateData,
      { returnDocument: "after" },
    );

    // 🚀 HANDLE APPROVAL
    if (status === "approved") {
      const customer = await Customer.findOne({ id: transaction.customerId });

      if (!customer) {
        return res.status(404).json({ error: "Customer not found" });
      }

      // FIX: Use cashBalance consistently (based on your customer model)
      const oldBalance =
        customer.cashBalance !== undefined
          ? customer.cashBalance
          : customer.balance || 0;

      // 💰 UPDATE BALANCE
      if (transaction.type === "deposit") {
        customer.cashBalance = (customer.cashBalance || 0) + netAmount;
        customer.balance = customer.cashBalance; // Keep legacy field in sync
        console.log(`💰 Deposit: Added ₦${netAmount} to ${customer.name}`);
      } else if (transaction.type === "withdrawal") {
        customer.cashBalance = (customer.cashBalance || 0) - netAmount;
        customer.balance = customer.cashBalance; // Keep legacy field in sync
        console.log(
          `💰 Withdrawal: Deducted ₦${netAmount} from ${customer.name}`,
        );
      }

      await customer.save();

      console.log(
        `✅ Customer ${customer.name} balance updated: ₦${oldBalance.toLocaleString()} → ₦${customer.cashBalance.toLocaleString()}`,
      );

      // 📱 SEND SMS (NON-BLOCKING)
      if (customer.phone) {
        try {
          if (transaction.type === "deposit") {
            const result = await sendCreditAlert(
              customer.phone,
              netAmount,
              customer.cashBalance,
              transaction.id,
            );
            if (result.success) {
              console.log(`📱 Credit SMS sent to ${customer.phone}`);
            } else {
              console.log(`⚠️ Credit SMS failed: ${result.error}`);
            }
          } else if (transaction.type === "withdrawal") {
            const result = await sendDebitAlert(
              customer.phone,
              netAmount,
              customer.cashBalance,
              transaction.id,
            );
            if (result.success) {
              console.log(`📱 Debit SMS sent to ${customer.phone}`);
            } else {
              console.log(`⚠️ Debit SMS failed: ${result.error}`);
            }
          }
        } catch (smsError) {
          console.error(
            "❌ SMS failed but transaction successful:",
            smsError.message,
          );
        }
      } else {
        console.log(`⚠️ No phone number for customer ${customer.name}`);
      }

      return res.json({
        ...transaction.toObject(),
        updatedCustomerBalance: customer.cashBalance,
        netAmount: netAmount,
        charges: charges,
        smsSent: customer.phone ? true : false,
      });
    }

    // Handle rejection (manual rejection by staff)
    if (status === "rejected") {
      const customer = await Customer.findOne({ id: transaction.customerId });
      if (customer && customer.phone) {
        try {
          // FIX: Use currentTransaction or check if transaction has amount
          const amount = transaction.amount || currentTransaction.amount || 0;
          const txnCharges =
            transaction.charges || currentTransaction.charges || 0;

          const rejectionMessage = `VAULTFLOW BANKING

❌ TRANSACTION REJECTED
Type: ${(transaction.type || currentTransaction.type).toUpperCase()}
Amount: ₦${amount.toLocaleString()}
${txnCharges > 0 ? `Charges: ₦${txnCharges.toLocaleString()}` : ""}
Reason: ${approvedBy || "Not approved"}
Date: ${new Date().toLocaleString()}
Ref: ${transaction.id}

Contact support for more information.`;

          await sendSMS(customer.phone, rejectionMessage);
          console.log(`📱 Rejection SMS sent to ${customer.phone}`);
        } catch (smsError) {
          console.error("Rejection SMS failed:", smsError.message);
        }
      }
    }

    res.json(transaction);
  } catch (error) {
    console.error("❌ Update transaction error:", error);
    res.status(500).json({ error: error.message });
  }
};

// Optional: Add a test SMS endpoint
exports.testSMS = async (req, res) => {
  try {
    const { phone, type = "credit" } = req.body;

    if (!phone) {
      return res.status(400).json({ error: "Phone number required" });
    }

    const testAmount = 1000;
    const testBalance = 5000;
    const testRef = "TEST" + Date.now();

    if (type === "credit") {
      const result = await sendCreditAlert(
        phone,
        testAmount,
        testBalance,
        testRef,
      );
      res.json({ message: "Test credit alert sent", result });
    } else {
      const result = await sendDebitAlert(
        phone,
        testAmount,
        testBalance,
        testRef,
      );
      res.json({ message: "Test debit alert sent", result });
    }
  } catch (error) {
    console.error("Test SMS error:", error);
    res.status(500).json({ error: error.message });
  }
};
