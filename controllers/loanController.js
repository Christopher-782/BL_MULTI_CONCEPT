const Loan = require("../models/loan");
const Customer = require("../models/customer");
const Transaction = require("../models/transaction");
const smsService = require("../services/smsService");
const mongoose = require("mongoose");

function generateId() {
  return "LOAN" + Date.now() + Math.floor(Math.random() * 1000);
}

function calculateLoanDetails(
  amount,
  interestRate,
  repaymentPeriod,
  numberOfInstallments,
) {
  const interest = (amount * interestRate) / 100;
  const totalPayable = amount + interest;
  const installmentAmount = totalPayable / numberOfInstallments;
  return { interest, totalPayable, installmentAmount };
}

exports.createLoanRequest = async (req, res) => {
  try {
    console.log("Received loan request body:", req.body);
    const {
      customerId,
      customerName,
      customerNumber,
      phone,
      type,
      amount,
      interestRate,
      repaymentPeriod,
      numberOfInstallments,
      paymentDeadline,
      repaymentStartDate,
      purpose,
      notes,
      requestedBy,
      processingCharges,
    } = req.body;

    if (!customerId)
      return res.status(400).json({ error: "Customer ID is required" });
    if (!customerName)
      return res.status(400).json({ error: "Customer name is required" });
    if (!amount || amount <= 0)
      return res.status(400).json({ error: "Valid amount is required" });

    if (type !== "overdraft") {
      if (!interestRate || interestRate < 0)
        return res
          .status(400)
          .json({ error: "Valid interest rate is required" });
      if (!repaymentPeriod)
        return res.status(400).json({ error: "Repayment period is required" });
      if (!numberOfInstallments || numberOfInstallments <= 0)
        return res
          .status(400)
          .json({ error: "Valid number of installments is required" });
      if (!repaymentStartDate)
        return res
          .status(400)
          .json({ error: "Repayment start date is required" });
    }

    const customer = await Customer.findOne({ id: customerId });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    if (type === "overdraft") {
      const activeOverdraft = await Loan.findOne({
        customerId,
        type: "overdraft",
        status: { $in: ["approved", "active"] },
      });
      if (activeOverdraft)
        return res
          .status(400)
          .json({ error: "Customer already has an active overdraft" });
    }

    let interest = 0,
      totalPayable = amount,
      installmentAmount = amount,
      endDate = new Date(),
      repayments = [];

    if (type !== "overdraft") {
      const calc = calculateLoanDetails(
        amount,
        interestRate,
        repaymentPeriod,
        numberOfInstallments,
      );
      interest = calc.interest;
      totalPayable = calc.totalPayable;
      installmentAmount = calc.installmentAmount;
      const startDate = new Date(repaymentStartDate);
      endDate = new Date(startDate);
      if (repaymentPeriod === "weekly")
        endDate.setDate(startDate.getDate() + numberOfInstallments * 7);
      else if (repaymentPeriod === "bi-weekly")
        endDate.setDate(startDate.getDate() + numberOfInstallments * 14);
      else if (repaymentPeriod === "monthly")
        endDate.setMonth(startDate.getMonth() + numberOfInstallments);

      let currentDate = new Date(startDate);
      for (let i = 0; i < numberOfInstallments; i++) {
        repayments.push({
          id:
            "REPAY" + Date.now() + i + Math.random().toString(36).substr(2, 4),
          dueDate: new Date(currentDate),
          amount: installmentAmount,
          status: "pending",
        });
        if (repaymentPeriod === "weekly")
          currentDate.setDate(currentDate.getDate() + 7);
        else if (repaymentPeriod === "bi-weekly")
          currentDate.setDate(currentDate.getDate() + 14);
        else if (repaymentPeriod === "monthly")
          currentDate.setMonth(currentDate.getMonth() + 1);
      }
    } else {
      const charges = Number(processingCharges) || 0;
      totalPayable = Number(amount) + charges;
      endDate = new Date(paymentDeadline || Date.now());
      repayments = [
        {
          id: "REPAY" + Date.now() + Math.random().toString(36).substr(2, 4),
          dueDate: new Date(endDate),
          amount: totalPayable,
          principalPortion: Number(amount),
          chargesPortion: charges,
          status: "pending",
        },
      ];
    }

    const safeRequestedBy = {
      staffId: requestedBy?.staffId || "system",
      staffName: requestedBy?.staffName || "System",
    };

    const loan = new Loan({
      id: generateId(),
      customerId,
      customerName,
      customerNumber,
      phone,
      type: type || "loan",
      amount: Number(amount),
      interestRate: type === "overdraft" ? 0 : Number(interestRate),
      totalPayable,
      repaymentPeriod: type === "overdraft" ? null : repaymentPeriod,
      numberOfInstallments:
        type === "overdraft" ? 1 : Number(numberOfInstallments),
      installmentAmount,
      repaymentStartDate:
        type === "overdraft" ? null : new Date(repaymentStartDate),
      repaymentEndDate: endDate,
      paymentDeadline: type === "overdraft" ? new Date(paymentDeadline) : null,
      processingCharges:
        type === "overdraft" ? Number(processingCharges) || 0 : 0,
      repayments,
      status: "pending",
      requestedBy: safeRequestedBy,
      requestedAt: new Date(),
      purpose: purpose || "",
      notes: notes || "",
      outstandingBalance: totalPayable,
      amountDisbursed: 0,
      amountRepaid: 0,
    });

    await loan.save();
    console.log("Loan saved successfully:", loan.id);

    res.status(201).json({
      success: true,
      message: `${type === "loan" ? "Loan" : "Overdraft"} request submitted successfully`,
      loan: {
        id: loan.id,
        customerName: loan.customerName,
        amount: loan.amount,
        processingCharges: loan.processingCharges,
        totalPayable: loan.totalPayable,
        status: loan.status,
        createdAt: loan.createdAt,
      },
    });
  } catch (error) {
    console.error("Create loan request error:", error);
    res
      .status(500)
      .json({
        error: error.message || "Failed to create loan request",
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      });
  }
};

exports.getAllLoans = async (req, res) => {
  try {
    res.json(await Loan.find().sort({ createdAt: -1 }));
  } catch (error) {
    console.error("Get all loans error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getLoansByStaff = async (req, res) => {
  try {
    res.json(
      await Loan.find({ "requestedBy.staffId": req.params.staffId }).sort({
        createdAt: -1,
      }),
    );
  } catch (error) {
    console.error("Get loans by staff error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getLoansByCustomer = async (req, res) => {
  try {
    res.json(
      await Loan.find({ customerId: req.params.customerId }).sort({
        createdAt: -1,
      }),
    );
  } catch (error) {
    console.error("Get loans by customer error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.approveLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { approvedBy } = req.body;
    const loan = await Loan.findOne({ id: loanId });
    if (!loan) return res.status(404).json({ error: "Loan request not found" });
    if (loan.status !== "pending")
      return res.status(400).json({ error: "Loan already processed" });

    const customer = await Customer.findOne({ id: loan.customerId });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const isOverdraft = loan.type === "overdraft";
    const processingCharges = loan.processingCharges || 0;
    const interest = isOverdraft ? 0 : loan.totalPayable - loan.amount;
    const totalPayable = isOverdraft
      ? loan.amount + processingCharges
      : loan.totalPayable;

    loan.status = "active";
    loan.approvedBy = {
      adminId: approvedBy.id,
      adminName: approvedBy.name,
      approvedAt: new Date(),
    };
    loan.amountDisbursed = loan.amount;
    loan.outstandingBalance = totalPayable;
    loan.outstandingPrincipal = loan.amount;
    loan.outstandingInterest = interest;
    loan.outstandingCharges = isOverdraft ? processingCharges : 0;
    loan.totalPayable = totalPayable;
    loan.autoDebitEnabled = true;
    await loan.save();

    const disbursementTransaction = new Transaction({
      id: "TXN" + Date.now() + Math.random(),
      customerId: loan.customerId,
      customerName: loan.customerName,
      type: isOverdraft ? "overdraft_disbursement" : "loan_disbursement",
      amount: loan.amount,
      charges: 0,
      netAmount: loan.amount,
      description: isOverdraft
        ? `Overdraft disbursement - ${loan.id} (Balance increased by N${loan.amount.toLocaleString()}. Charges: N${processingCharges.toLocaleString()} due on settlement)`
        : `Loan disbursement - ${loan.id}`,
      status: "approved",
      requestedBy: approvedBy.name,
      approvedBy: approvedBy.name,
      date: new Date().toISOString(),
    });
    await disbursementTransaction.save();

    let newCashBalance, smsMessage;

    if (isOverdraft) {
      newCashBalance = (customer.cashBalance || 0) + loan.amount;
      await Customer.findOneAndUpdate(
        { id: loan.customerId },
        {
          $set: {
            cashBalance: newCashBalance,
            balance: newCashBalance,
            hasActiveLoan: true,
            activeLoanId: loan.id,
            hasActiveOverdraft: true,
          },
          $inc: { totalLoanAmount: loan.amount, totalInterestAccrued: 0 },
        },
      );
      smsMessage = `VaultFlow: Dear ${customer.name}, your overdraft of N${loan.amount.toLocaleString()} has been approved. Processing charges: N${processingCharges.toLocaleString()}. Total due by ${new Date(loan.paymentDeadline).toLocaleDateString("en-GB")}: N${totalPayable.toLocaleString()}. Your balance is now N${newCashBalance.toLocaleString()}. All deposits will auto-debit until cleared.`;
    } else {
      newCashBalance = (customer.cashBalance || 0) + loan.amount;
      await Customer.findOneAndUpdate(
        { id: loan.customerId },
        {
          $set: {
            cashBalance: newCashBalance,
            balance: newCashBalance,
            hasActiveLoan: true,
            activeLoanId: loan.id,
          },
          $inc: {
            loanBalance: loan.amount,
            totalLoanAmount: loan.amount,
            totalInterestAccrued: interest,
          },
        },
      );
      smsMessage = `VaultFlow: Dear ${customer.name}, your loan of N${loan.amount.toLocaleString()} has been approved and disbursed. Interest: N${interest.toLocaleString()}. Total payable: N${totalPayable.toLocaleString()}. New balance: N${newCashBalance.toLocaleString()}.`;
    }

    if (customer.phone) {
      try {
        if (isOverdraft)
          await smsService.sendSMS({ to: customer.phone, message: smsMessage });
        else
          await smsService.sendLoanDisbursementAlert(
            customer.phone,
            loan.amount,
            newCashBalance,
            loan.id,
            loan.interestRate,
            loan.totalPayable,
            loan.numberOfInstallments,
            loan.repaymentPeriod,
            loan.installmentAmount,
          );
      } catch (smsError) {
        console.error("SMS failed:", smsError.message);
      }
    }

    res.json({
      success: true,
      message: isOverdraft
        ? `Overdraft approved! N${loan.amount.toLocaleString()} added to ${customer.name}'s balance. Charges: N${processingCharges.toLocaleString()}. Total due: N${totalPayable.toLocaleString()}. New balance: N${newCashBalance.toLocaleString()}.`
        : `Loan approved! N${loan.amount.toLocaleString()} disbursed to ${customer.name}'s account.`,
      loan: {
        id: loan.id,
        amount: loan.amount,
        processingCharges: isOverdraft ? processingCharges : undefined,
        totalPayable,
        status: loan.status,
        paymentDeadline: isOverdraft ? loan.paymentDeadline : undefined,
      },
      customer: {
        id: customer.id,
        name: customer.name,
        newBalance: newCashBalance,
        hasActiveOverdraft: isOverdraft,
      },
    });
  } catch (error) {
    console.error("Approve loan error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.rejectLoan = async (req, res) => {
  try {
    const { loanId } = req.params;
    const { rejectedBy, reason } = req.body;
    const loan = await Loan.findOne({ id: loanId });
    if (!loan) return res.status(404).json({ error: "Loan request not found" });
    if (loan.status !== "pending")
      return res.status(400).json({ error: "Loan request already processed" });

    loan.status = "rejected";
    loan.rejectedBy = {
      adminId: rejectedBy?.id,
      adminName: rejectedBy?.name,
      rejectedAt: new Date(),
    };
    loan.notes = reason || loan.notes;
    await loan.save();

    const customer = await Customer.findOne({ id: loan.customerId });
    if (customer?.phone) {
      try {
        await smsService.sendSMS({
          to: customer.phone,
          message: `VaultFlow: Dear ${customer.name}, your ${loan.type} request of N${loan.amount.toLocaleString()} has been declined. Reason: ${reason || "Does not meet criteria"}. Contact us for more info.`,
        });
      } catch (smsError) {
        console.error("SMS failed:", smsError.message);
      }
    }

    res.json({
      success: true,
      message: `${loan.type === "loan" ? "Loan" : "Overdraft"} request rejected`,
      loan: { id: loan.id, status: loan.status, rejectedBy: loan.rejectedBy },
    });
  } catch (error) {
    console.error("Reject loan error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.processDepositWithOverdraft = async (
  customerId,
  depositAmount,
  charges = 0,
  approvedBy = "System",
) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const customer = await Customer.findOne({ id: customerId }).session(
      session,
    );
    if (!customer) {
      await session.abortTransaction();
      return { success: false, error: "Customer not found" };
    }

    if (customer.hasActiveOverdraft && customer.activeLoanId) {
      const loan = await Loan.findOne({ id: customer.activeLoanId }).session(
        session,
      );

      if (loan && loan.status === "active" && loan.type === "overdraft") {
        const outstanding = loan.outstandingBalance || loan.totalPayable || 0;

        if (outstanding > 0) {
          const netDeposit = depositAmount - charges;
          const repaymentAmount = Math.min(netDeposit, outstanding);
          const remainingForCustomer = netDeposit - repaymentAmount;

          loan.amountRepaid = (loan.amountRepaid || 0) + repaymentAmount;
          loan.outstandingBalance = Math.max(0, outstanding - repaymentAmount);

          const remainingPrincipal =
            loan.amount - (loan.principalRepaidToDate || 0);
          const principalPortion = Math.min(
            repaymentAmount,
            remainingPrincipal,
          );
          const chargesPortion = repaymentAmount - principalPortion;

          const repayment = loan.repayments[0];
          repayment.paidAmount = (repayment.paidAmount || 0) + repaymentAmount;
          repayment.principalPortion =
            (repayment.principalPortion || 0) + principalPortion;
          repayment.chargesPortion =
            (repayment.chargesPortion || 0) + chargesPortion;
          repayment.paidDate = new Date();
          repayment.paidBy = approvedBy;

          loan.principalRepaidToDate =
            (loan.principalRepaidToDate || 0) + principalPortion;
          loan.chargesPaidToDate =
            (loan.chargesPaidToDate || 0) + chargesPortion;

          let isFullyPaid = false;

          if (
            loan.outstandingBalance <= 0 ||
            loan.amountRepaid >= loan.totalPayable
          ) {
            loan.status = "completed";
            loan.completedAt = new Date();
            loan.outstandingBalance = 0;
            loan.outstandingPrincipal = 0;
            loan.outstandingCharges = 0;
            isFullyPaid = true;
            repayment.status = "paid";

            await Customer.findOneAndUpdate(
              { id: customerId },
              {
                $set: {
                  hasActiveOverdraft: false,
                  activeLoanId: null,
                  hasActiveLoan: false,
                },
              },
              { session },
            );
          } else {
            loan.outstandingPrincipal = Math.max(
              0,
              loan.amount - loan.principalRepaidToDate,
            );
            loan.outstandingCharges = Math.max(
              0,
              loan.processingCharges - loan.chargesPaidToDate,
            );
          }

          await loan.save({ session });

          // FIX 1: Correct balance calculation based on whether balance is negative or positive
          const oldBalance = customer.cashBalance || 0;
          let newCashBalance;

          if (oldBalance < 0) {
            // When balance is negative, deposit reduces the debt directly
            // Repayment is already accounted for in the loan update
            newCashBalance = oldBalance + depositAmount - charges;
          } else {
            // When balance is positive, repayment is deducted from what customer keeps
            newCashBalance =
              oldBalance + depositAmount - charges - repaymentAmount;
          }

          await Customer.findOneAndUpdate(
            { id: customerId },
            {
              $set: { cashBalance: newCashBalance, balance: newCashBalance },
            },
            { session },
          );

          const overdraftTxn = new Transaction({
            id: "TXN" + Date.now() + Math.random().toString(36).substr(2, 4),
            customerId,
            customerName: customer.name,
            customerPhone: customer.phone || null,
            type: "overdraft_repayment",
            amount: repaymentAmount,
            principalPortion,
            chargesPortion,
            netAmount: -repaymentAmount,
            description: `Auto-debit from deposit: Overdraft repayment (Principal: N${principalPortion.toLocaleString()}, Charges: N${chargesPortion.toLocaleString()})${isFullyPaid ? " - FULLY CLEARED" : ""}`,
            status: "approved",
            approvedBy,
            date: new Date().toISOString(),
            loanId: loan.id,
            isAutoDebit: true,
          });
          await overdraftTxn.save({ session });

          // FIX 2: Create charges revenue transaction for overdraft charges portion (only if not already recorded)
          if (chargesPortion > 0) {
            const alreadyRecorded = loan.chargesRevenueRecorded || 0;
            const newRevenue = chargesPortion - alreadyRecorded;
            if (newRevenue > 0) {
              const revenueTxn = new Transaction({
                id:
                  "REV" + Date.now() + Math.random().toString(36).substr(2, 4),
                customerId,
                customerName: customer.name,
                type: "overdraft_charges_revenue",
                amount: newRevenue,
                netAmount: newRevenue,
                description: `Overdraft charges revenue from auto-debit - ${loan.id}`,
                status: "approved",
                approvedBy: "System",
                date: new Date().toISOString(),
                loanId: loan.id,
                isRevenue: true,
                revenueType: "overdraft_charges",
              });
              await revenueTxn.save({ session });
              loan.chargesRevenueRecorded = alreadyRecorded + newRevenue;
              await loan.save({ session });
            }
          }

          await session.commitTransaction();

          if (customer.phone) {
            try {
              let msg = `VaultFlow: Dear ${customer.name}, N${repaymentAmount.toLocaleString()} auto-debited from your N${depositAmount.toLocaleString()} deposit for overdraft repayment. `;
              if (isFullyPaid) msg += `Overdraft FULLY CLEARED! `;
              msg += `Outstanding: N${loan.outstandingBalance.toLocaleString()}. Available: N${remainingForCustomer.toLocaleString()}.`;
              await smsService.sendSMS({ to: customer.phone, message: msg });
            } catch (smsError) {
              console.error("SMS failed:", smsError.message);
            }
          }

          return {
            success: true,
            originalDeposit: depositAmount,
            netDeposit,
            autoDebit: repaymentAmount,
            remainingForCustomer,
            overdraftCleared: isFullyPaid,
            loan,
            principalPortion,
            chargesPortion,
          };
        }
      }
    }

    // No active overdraft - normal deposit
    const netDeposit = depositAmount - charges;
    const newCashBalance = (customer.cashBalance || 0) + netDeposit;

    await Customer.findOneAndUpdate(
      { id: customerId },
      {
        $set: { cashBalance: newCashBalance, balance: newCashBalance },
      },
      { session },
    );

    await session.commitTransaction();
    return {
      success: true,
      originalDeposit: depositAmount,
      netDeposit,
      autoDebit: 0,
      remainingForCustomer: netDeposit,
      overdraftCleared: false,
      loan: null,
    };
  } catch (error) {
    await session.abortTransaction();
    console.error("Process deposit with overdraft error:", error);
    return { success: false, error: error.message };
  } finally {
    session.endSession();
  }
};

exports.recordRepayment = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { loanId, repaymentId } = req.params;
    const {
      paidBy,
      paymentAmount,
      isFullSettlement,
      totalPayable,
      processingCharges,
    } = req.body;

    const loan = await Loan.findOne({ id: loanId }).session(session);
    if (!loan) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Loan not found" });
    }

    const customer = await Customer.findOne({ id: loan.customerId }).session(
      session,
    );
    if (!customer) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Customer not found" });
    }

    // OVERDRAFT FULL SETTLEMENT
    if (loan.type === "overdraft" && isFullSettlement) {
      const totalDue = totalPayable || loan.totalPayable;
      const chargesDue = processingCharges || loan.processingCharges || 0;
      const principalDue = loan.amount || 0;
      const availableBalance = customer.cashBalance || customer.balance || 0;

      if (availableBalance < totalDue) {
        await session.abortTransaction();
        return res.status(400).json({
          error: "Insufficient funds to settle overdraft",
          required: totalDue,
          available: availableBalance,
          shortfall: totalDue - availableBalance,
          breakdown: {
            principal: principalDue,
            charges: chargesDue,
            total: totalDue,
          },
        });
      }

      const repayment = loan.repayments[0];
      repayment.status = "paid";
      repayment.paidDate = new Date();
      repayment.paidBy = paidBy || "Admin";
      repayment.paidAmount = totalDue;
      repayment.principalPortion = principalDue;
      repayment.chargesPortion = chargesDue;
      repayment.interestPortion = 0;

      loan.status = "completed";
      loan.amountRepaid = totalDue;
      loan.outstandingBalance = 0;
      loan.outstandingPrincipal = 0;
      loan.outstandingInterest = 0;
      loan.outstandingCharges = 0;
      loan.completedAt = new Date();
      loan.principalRepaidToDate = principalDue;
      loan.chargesPaidToDate = chargesDue;
      loan.interestEarnedToDate = 0;

      // FIX 3: Use { new: true } instead of { returnDocument: "after" } for Mongoose session compatibility
      const updatedCustomer = await Customer.findOneAndUpdate(
        { id: loan.customerId },
        {
          $inc: { cashBalance: -totalDue, balance: -totalDue },
          $set: {
            hasActiveLoan: false,
            activeLoanId: null,
            hasActiveOverdraft: false,
          },
        },
        { new: true, session },
      );

      await loan.save({ session });

      const transaction = new Transaction({
        id: "TXN" + Date.now() + Math.random().toString(36).substr(2, 4),
        customerId: loan.customerId,
        customerName: loan.customerName,
        customerPhone: customer.phone || null,
        type: "overdraft_repayment",
        amount: totalDue,
        principalPortion: principalDue,
        chargesPortion: chargesDue,
        interestPortion: 0,
        charges: chargesDue,
        netAmount: -totalDue,
        description: `Overdraft settlement: Principal N${principalDue.toLocaleString()} + Processing Charges N${chargesDue.toLocaleString()} = N${totalDue.toLocaleString()}`,
        status: "approved",
        requestedBy: paidBy || "Admin",
        approvedBy: paidBy || "Admin",
        date: new Date().toISOString(),
        loanId: loan.id,
        repaymentId,
        isOverdraftSettlement: true,
      });
      await transaction.save({ session });

      // FIX 4: Prevent double-counting charges revenue
      const alreadyRecorded = loan.chargesRevenueRecorded || 0;
      const newRevenue = chargesDue - alreadyRecorded;
      if (newRevenue > 0) {
        const chargesRevenueTransaction = new Transaction({
          id: "REV" + Date.now() + Math.random().toString(36).substr(2, 4),
          customerId: loan.customerId,
          customerName: loan.customerName,
          type: "overdraft_charges_revenue",
          amount: newRevenue,
          netAmount: newRevenue,
          description: `Overdraft processing charges revenue from ${loan.customerName} - Loan ${loan.id}`,
          status: "approved",
          approvedBy: "System",
          date: new Date().toISOString(),
          loanId: loan.id,
          isRevenue: true,
          revenueType: "overdraft_charges",
        });
        await chargesRevenueTransaction.save({ session });
        loan.chargesRevenueRecorded = alreadyRecorded + newRevenue;
        await loan.save({ session });
      }

      await session.commitTransaction();

      if (customer.phone) {
        try {
          await smsService.sendSMS({
            to: customer.phone,
            message: `VaultFlow: Dear ${customer.name}, your overdraft of N${principalDue.toLocaleString()} has been fully settled. Charges: N${chargesDue.toLocaleString()}. Total deducted: N${totalDue.toLocaleString()}. New balance: N${updatedCustomer.cashBalance.toLocaleString()}.`,
          });
        } catch (smsError) {
          console.error("SMS failed:", smsError.message);
        }
      }

      return res.json({
        success: true,
        message: "Overdraft fully settled!",
        loan: {
          id: loan.id,
          status: "completed",
          amountRepaid: totalDue,
          principalRepaid: principalDue,
          chargesPaid: chargesDue,
          outstandingBalance: 0,
        },
        settlement: {
          principal: principalDue,
          charges: chargesDue,
          totalPaid: totalDue,
        },
        customer: {
          newCashBalance: updatedCustomer.cashBalance,
          amountDeducted: totalDue,
        },
      });
    }

    // REGULAR LOAN REPAYMENT
    const repaymentIndex = loan.repayments.findIndex(
      (r) => r.id === repaymentId,
    );
    if (repaymentIndex === -1) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Repayment schedule not found" });
    }

    const repayment = loan.repayments[repaymentIndex];
    if (repayment.status === "paid") {
      await session.abortTransaction();
      return res
        .status(400)
        .json({
          error: "This installment has already been paid",
          paidDate: repayment.paidDate,
        });
    }

    const repaymentAmount = paymentAmount || repayment.amount || 0;
    const availableBalance = customer.cashBalance || customer.balance || 0;

    if (repaymentAmount > availableBalance) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({
          error: "Insufficient funds for loan repayment",
          availableBalance,
          requestedRepayment: repaymentAmount,
          shortfall: repaymentAmount - availableBalance,
        });
    }

    const totalInterest = loan.totalPayable - loan.amount;
    const interestRatio = totalInterest / loan.totalPayable;
    const interestPortion = repaymentAmount * interestRatio;
    const principalPortion = repaymentAmount - interestPortion;

    repayment.status = "paid";
    repayment.paidDate = new Date();
    repayment.paidBy = paidBy || "Customer";
    repayment.paidAmount = repaymentAmount;
    repayment.principalPortion = principalPortion;
    repayment.interestPortion = interestPortion;
    repayment.interestRevenue = interestPortion;
    repayment.chargesPortion = 0;

    loan.amountRepaid = (loan.amountRepaid || 0) + repaymentAmount;
    loan.outstandingBalance = Math.max(
      0,
      loan.totalPayable - loan.amountRepaid,
    );
    loan.principalRepaidToDate =
      (loan.principalRepaidToDate || 0) + principalPortion;
    loan.interestEarnedToDate =
      (loan.interestEarnedToDate || 0) + interestPortion;

    if (
      loan.outstandingBalance <= 0 ||
      loan.amountRepaid >= loan.totalPayable
    ) {
      loan.status = "completed";
      loan.completedAt = new Date();
      loan.outstandingBalance = 0;
    }

    const updatedCustomer = await Customer.findOneAndUpdate(
      { id: loan.customerId },
      {
        $inc: {
          cashBalance: -repaymentAmount,
          balance: -repaymentAmount,
          loanBalance: -principalPortion,
          totalRepaid: repaymentAmount,
        },
      },
      { new: true, session },
    );

    await loan.save({ session });

    const transaction = new Transaction({
      id: "TXN" + Date.now() + Math.random().toString(36).substr(2, 4),
      customerId: loan.customerId,
      customerName: loan.customerName,
      customerPhone: customer.phone || null,
      type: "loan_repayment",
      amount: repaymentAmount,
      principalPortion,
      interestPortion,
      interestRevenue: interestPortion,
      charges: 0,
      netAmount: -repaymentAmount,
      description: `Loan repayment #${repaymentIndex + 1}/${loan.numberOfInstallments} (Principal: N${principalPortion.toLocaleString()}, Interest: N${interestPortion.toLocaleString()})`,
      status: "approved",
      requestedBy: paidBy || "Customer",
      approvedBy: paidBy || "System",
      date: new Date().toISOString(),
      loanId: loan.id,
      repaymentId,
    });
    await transaction.save({ session });

    if (interestPortion > 0) {
      const revenueTransaction = new Transaction({
        id: "REV" + Date.now() + Math.random().toString(36).substr(2, 4),
        customerId: loan.customerId,
        customerName: loan.customerName,
        type: "interest_revenue",
        amount: interestPortion,
        netAmount: interestPortion,
        description: `Interest revenue from loan ${loan.id} - Installment ${repaymentIndex + 1}`,
        status: "approved",
        approvedBy: "System",
        date: new Date().toISOString(),
        loanId: loan.id,
        repaymentId,
        isRevenue: true,
        revenueType: "loan_interest",
      });
      await revenueTransaction.save({ session });
    }

    await session.commitTransaction();

    if (customer.phone) {
      try {
        await smsService.sendDebitAlert(
          customer.phone,
          repaymentAmount,
          updatedCustomer.cashBalance,
          transaction.id,
          0,
        );
        if (loan.status === "completed") {
          await smsService.sendSMS({
            to: customer.phone,
            message: `VaultFlow: Congratulations ${customer.name}! Your loan ${loan.id} has been fully repaid. Total paid: N${loan.amountRepaid.toLocaleString()}.`,
          });
        }
      } catch (smsError) {
        console.error("SMS failed:", smsError.message);
      }
    }

    res.json({
      success: true,
      message:
        loan.status === "completed"
          ? "Loan fully repaid!"
          : "Repayment recorded successfully",
      loan: {
        id: loan.id,
        status: loan.status,
        outstandingBalance: loan.outstandingBalance,
        amountRepaid: loan.amountRepaid,
        principalRepaidToDate: loan.principalRepaidToDate,
        interestEarnedToDate: loan.interestEarnedToDate,
      },
      thisRepayment: {
        installmentNumber: repaymentIndex + 1,
        totalPaid: repaymentAmount,
        principalPortion,
        interestPortion,
      },
      customer: {
        newCashBalance: updatedCustomer.cashBalance,
        loanBalance: updatedCustomer.loanBalance,
        amountDeducted: repaymentAmount,
      },
    });
  } catch (error) {
    await session.abortTransaction();
    console.error("Record repayment error:", error);
    res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

// FIX 5: Revenue reports - group by payment date, not loan creation date
exports.getRevenueReports = async (req, res) => {
  try {
    const { period, type } = req.query;
    let startDate = new Date();
    if (period === "daily") startDate.setHours(0, 0, 0, 0);
    else if (period === "weekly") startDate.setDate(startDate.getDate() - 7);
    else if (period === "monthly") startDate.setMonth(startDate.getMonth() - 1);
    else if (period === "yearly")
      startDate.setFullYear(startDate.getFullYear() - 1);
    else startDate = new Date(0);

    // FIX 5a: Interest revenue grouped by repayment paidDate, not loan createdAt
    let interestRevenue = [];
    if (!type || type === "all" || type === "interest") {
      interestRevenue = await Loan.aggregate([
        {
          $match: {
            status: { $in: ["active", "completed"] },
            amountRepaid: { $gt: 0 },
          },
        },
        { $unwind: "$repayments" },
        {
          $match: {
            "repayments.status": "paid",
            "repayments.paidDate": { $gte: startDate },
          },
        },
        {
          $group: {
            _id:
              period === "daily"
                ? {
                    $dateToString: {
                      format: "%Y-%m-%d",
                      date: "$repayments.paidDate",
                    },
                  }
                : period === "monthly"
                  ? {
                      $dateToString: {
                        format: "%Y-%m",
                        date: "$repayments.paidDate",
                      },
                    }
                  : period === "yearly"
                    ? { $year: "$repayments.paidDate" }
                    : null,
            totalInterest: { $sum: "$repayments.interestPortion" },
            totalPrincipal: { $sum: "$repayments.principalPortion" },
            totalLoans: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    }

    let transactionCharges = [];
    if (!type || type === "all" || type === "charges") {
      transactionCharges = await Transaction.aggregate([
        {
          $match: {
            status: "approved",
            createdAt: { $gte: startDate },
            type: { $in: ["deposit", "withdrawal"] },
          },
        },
        {
          $group: {
            _id:
              period === "daily"
                ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
                : period === "monthly"
                  ? { $dateToString: { format: "%Y-%m", date: "$createdAt" } }
                  : period === "yearly"
                    ? { $year: "$createdAt" }
                    : null,
            totalCharges: { $sum: "$charges" },
            totalTransactions: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    }

    let overdraftChargesRevenue = [];
    if (!type || type === "all" || type === "overdraft_charges") {
      overdraftChargesRevenue = await Transaction.aggregate([
        {
          $match: {
            type: "overdraft_charges_revenue",
            status: "approved",
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id:
              period === "daily"
                ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
                : period === "monthly"
                  ? { $dateToString: { format: "%Y-%m", date: "$createdAt" } }
                  : period === "yearly"
                    ? { $year: "$createdAt" }
                    : null,
            totalChargesRevenue: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    }

    let autoDebitRevenue = [];
    if (!type || type === "all" || type === "auto_debit") {
      autoDebitRevenue = await Transaction.aggregate([
        {
          $match: {
            type: "overdraft_repayment",
            isAutoDebit: true,
            status: "approved",
            createdAt: { $gte: startDate },
          },
        },
        {
          $group: {
            _id:
              period === "daily"
                ? { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }
                : period === "monthly"
                  ? { $dateToString: { format: "%Y-%m", date: "$createdAt" } }
                  : period === "yearly"
                    ? { $year: "$createdAt" }
                    : null,
            totalAutoDebit: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);
    }

    const totalInterest = interestRevenue.reduce(
      (sum, item) => sum + (item.totalInterest || 0),
      0,
    );
    const totalCharges = transactionCharges.reduce(
      (sum, item) => sum + (item.totalCharges || 0),
      0,
    );
    const totalOverdraftCharges = overdraftChargesRevenue.reduce(
      (sum, item) => sum + (item.totalChargesRevenue || 0),
      0,
    );
    const totalAutoDebit = autoDebitRevenue.reduce(
      (sum, item) => sum + (item.totalAutoDebit || 0),
      0,
    );

    // FIX 5b: Unearned interest excludes overdrafts (they have no interest, only charges)
    const unearnedInterestResult = await Loan.aggregate([
      { $match: { status: "active", type: { $ne: "overdraft" } } },
      {
        $project: {
          remainingInterest: {
            $subtract: [
              { $subtract: ["$totalPayable", "$amount"] },
              { $ifNull: ["$interestEarnedToDate", 0] },
            ],
          },
        },
      },
      { $group: { _id: null, total: { $sum: "$remainingInterest" } } },
    ]);

    res.json({
      success: true,
      period: period || "all",
      totalRevenue: totalInterest + totalCharges + totalOverdraftCharges,
      summary: {
        interestRevenue: totalInterest,
        transactionCharges: totalCharges,
        overdraftChargesRevenue: totalOverdraftCharges,
        autoDebitRevenue: totalAutoDebit,
      },
      breakdown: {
        interest: interestRevenue,
        charges: transactionCharges,
        overdraftCharges: overdraftChargesRevenue,
        autoDebit: autoDebitRevenue,
      },
      dashboard: {
        totalInterestEarned: totalInterest,
        totalChargesEarned: totalCharges,
        totalOverdraftChargesEarned: totalOverdraftCharges,
        totalAutoDebitEarned: totalAutoDebit,
        activeLoansCount: await Loan.countDocuments({
          status: "active",
          type: "loan",
        }),
        completedLoansCount: await Loan.countDocuments({ status: "completed" }),
        activeOverdraftsCount: await Loan.countDocuments({
          status: "active",
          type: "overdraft",
        }),
        totalUnearnedInterest: unearnedInterestResult[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("Get revenue reports error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getLoanSummary = async (req, res) => {
  try {
    const summary = await Loan.aggregate([
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
          totalOutstanding: { $sum: "$outstandingBalance" },
        },
      },
    ]);

    const activeLoans = await Loan.find({ status: "active" });
    const upcomingRepayments = [];
    activeLoans.forEach((loan) => {
      loan.repayments.forEach((repayment) => {
        if (
          repayment.status === "pending" &&
          new Date(repayment.dueDate) > new Date()
        ) {
          upcomingRepayments.push({
            loanId: loan.id,
            customerName: loan.customerName,
            dueDate: repayment.dueDate,
            amount: repayment.amount,
          });
        }
      });
    });
    upcomingRepayments.sort(
      (a, b) => new Date(a.dueDate) - new Date(b.dueDate),
    );

    res.json({
      summary,
      activeLoansCount: activeLoans.length,
      upcomingRepayments: upcomingRepayments.slice(0, 10),
    });
  } catch (error) {
    console.error("Get loan summary error:", error);
    res.status(500).json({ error: error.message });
  }
};

exports.getCustomerLoanSummary = async (req, res) => {
  try {
    const { customerId } = req.params;
    const customer = await Customer.findOne({ id: customerId });
    if (!customer) return res.status(404).json({ error: "Customer not found" });

    const activeLoans = await Loan.find({ customerId, status: "active" });
    const loanHistory = await Loan.find({
      customerId,
      status: { $in: ["completed", "defaulted"] },
    });

    const upcomingRepayments = [];
    activeLoans.forEach((loan) => {
      loan.repayments.forEach((repayment) => {
        if (
          repayment.status === "pending" &&
          new Date(repayment.dueDate) > new Date()
        ) {
          upcomingRepayments.push({
            loanId: loan.id,
            loanType: loan.type,
            dueDate: repayment.dueDate,
            amount: repayment.amount,
            remainingBalance: loan.outstandingBalance,
          });
        }
      });
    });
    upcomingRepayments.sort(
      (a, b) => new Date(a.dueDate) - new Date(b.dueDate),
    );

    res.json({
      customer: {
        name: customer.name,
        cashBalance: customer.cashBalance,
        loanBalance: customer.loanBalance,
        netWorth: customer.cashBalance - customer.loanBalance,
        totalLoansTaken: customer.totalLoanAmount,
        totalInterestAccrued: customer.totalInterestAccrued,
        hasActiveOverdraft: customer.hasActiveOverdraft,
      },
      activeLoans: activeLoans.map((loan) => ({
        id: loan.id,
        type: loan.type,
        originalAmount: loan.amount,
        totalPayable: loan.totalPayable,
        amountRepaid: loan.amountRepaid,
        outstandingBalance: loan.outstandingBalance,
        nextInstallment: upcomingRepayments.find((r) => r.loanId === loan.id)
          ?.dueDate,
      })),
      loanHistory: loanHistory.map((loan) => ({
        id: loan.id,
        type: loan.type,
        amount: loan.amount,
        completedAt: loan.completedAt || loan.updatedAt,
      })),
      upcomingRepayments: upcomingRepayments.slice(0, 5),
    });
  } catch (error) {
    console.error("Get customer loan summary error:", error);
    res.status(500).json({ error: error.message });
  }
};

// FIX 6: Dashboard summary - correct date grouping and exclude overdrafts from interest
exports.getDashboardSummary = async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisMonth = new Date();
    thisMonth.setDate(1);
    thisMonth.setHours(0, 0, 0, 0);

    // FIX 6a: Interest from actual repayments paid today, not loans created today
    const todayRevenue = await Loan.aggregate([
      { $match: { status: { $in: ["active", "completed"] } } },
      { $unwind: "$repayments" },
      {
        $match: {
          "repayments.status": "paid",
          "repayments.paidDate": { $gte: today },
        },
      },
      {
        $group: {
          _id: null,
          interest: { $sum: "$repayments.interestPortion" },
          principal: { $sum: "$repayments.principalPortion" },
          count: { $sum: 1 },
        },
      },
    ]);

    const monthRevenue = await Loan.aggregate([
      { $match: { status: { $in: ["active", "completed"] } } },
      { $unwind: "$repayments" },
      {
        $match: {
          "repayments.status": "paid",
          "repayments.paidDate": { $gte: thisMonth },
        },
      },
      {
        $group: {
          _id: null,
          interest: { $sum: "$repayments.interestPortion" },
          principal: { $sum: "$repayments.principalPortion" },
          count: { $sum: 1 },
        },
      },
    ]);

    // All-time interest from actual repayments
    const allTime = await Loan.aggregate([
      { $match: { status: { $in: ["active", "completed"] } } },
      { $unwind: "$repayments" },
      { $match: { "repayments.status": "paid" } },
      {
        $group: {
          _id: null,
          totalInterest: { $sum: "$repayments.interestPortion" },
          totalPrincipal: { $sum: "$repayments.principalPortion" },
          totalLoans: { $sum: 1 },
        },
      },
    ]);

    const chargesToday = await Transaction.aggregate([
      { $match: { status: "approved", createdAt: { $gte: today } } },
      { $group: { _id: null, total: { $sum: "$charges" } } },
    ]);
    const chargesMonth = await Transaction.aggregate([
      { $match: { status: "approved", createdAt: { $gte: thisMonth } } },
      { $group: { _id: null, total: { $sum: "$charges" } } },
    ]);
    const overdraftChargesToday = await Transaction.aggregate([
      {
        $match: {
          type: "overdraft_charges_revenue",
          status: "approved",
          createdAt: { $gte: today },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const overdraftChargesMonth = await Transaction.aggregate([
      {
        $match: {
          type: "overdraft_charges_revenue",
          status: "approved",
          createdAt: { $gte: thisMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const autoDebitToday = await Transaction.aggregate([
      {
        $match: {
          type: "overdraft_repayment",
          isAutoDebit: true,
          status: "approved",
          createdAt: { $gte: today },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    const autoDebitMonth = await Transaction.aggregate([
      {
        $match: {
          type: "overdraft_repayment",
          isAutoDebit: true,
          status: "approved",
          createdAt: { $gte: thisMonth },
        },
      },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);

    res.json({
      success: true,
      today: {
        interestRevenue: todayRevenue[0]?.interest || 0,
        transactionCharges: chargesToday[0]?.total || 0,
        overdraftChargesRevenue: overdraftChargesToday[0]?.total || 0,
        autoDebitRevenue: autoDebitToday[0]?.total || 0,
        newLoans: todayRevenue[0]?.count || 0,
      },
      thisMonth: {
        interestRevenue: monthRevenue[0]?.interest || 0,
        principalDisbursed: monthRevenue[0]?.principal || 0,
        transactionCharges: chargesMonth[0]?.total || 0,
        overdraftChargesRevenue: overdraftChargesMonth[0]?.total || 0,
        autoDebitRevenue: autoDebitMonth[0]?.total || 0,
        newLoans: monthRevenue[0]?.count || 0,
      },
      allTime: {
        totalInterestRevenue: allTime[0]?.totalInterest || 0,
        totalPrincipalDisbursed: allTime[0]?.totalPrincipal || 0,
        totalLoans: allTime[0]?.totalLoans || 0,
      },
      currentStatus: {
        activeLoans: await Loan.countDocuments({
          status: "active",
          type: "loan",
        }),
        activeOverdrafts: await Loan.countDocuments({
          status: "active",
          type: "overdraft",
        }),
        pendingLoans: await Loan.countDocuments({ status: "pending" }),
        completedLoans: await Loan.countDocuments({ status: "completed" }),
        totalOutstanding:
          (
            await Loan.aggregate([
              { $match: { status: "active" } },
              { $group: { _id: null, total: { $sum: "$outstandingBalance" } } },
            ])
          )[0]?.total || 0,
      },
    });
  } catch (error) {
    console.error("Get dashboard summary error:", error);
    res.status(500).json({ error: error.message });
  }
};
