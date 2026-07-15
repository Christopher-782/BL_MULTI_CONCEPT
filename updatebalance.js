const path = require("node:path");

require("dotenv").config({
  path: path.resolve(__dirname, ".env"),
});

const fs = require("node:fs");
const mongoose = require("mongoose");

const Customer = require("./models/customer");
const Transaction = require("./models/transaction");

// ======================================================
// CONFIGURATION
// ======================================================

const CONFIG = {
  mongoUri: process.env.MONGO,

  // Keep false during the first run.
  applyChanges: process.env.APPLY_CHANGES === "true",

  // Keep false unless your system intentionally permits negative balances.
  allowNegative: process.env.ALLOW_NEGATIVE === "true",

  /*
   * Keep false until you confirm that loan_disbursement and
   * loan_repayment directly change customer cash balances.
   */
  includeLoanTypes: process.env.INCLUDE_LOAN_TYPES === "true",

  /*
   * Name matching is less reliable than ID, phone or email matching.
   * Keep this false for the first audit.
   */
  allowNameFallback: process.env.ALLOW_NAME_FALLBACK === "true",
};

// ======================================================
// GENERAL HELPERS
// ======================================================

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function roundMoney(value) {
  return Math.round((toNumber(value) + Number.EPSILON) * 100) / 100;
}

function normaliseId(value, seen = new WeakSet()) {
  if (value === null || value === undefined) {
    return "";
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "bigint"
  ) {
    return String(value).trim().toLowerCase();
  }

  if (typeof value === "object") {
    /*
     * MongoDB ObjectId objects have a toHexString() method.
     * This must be checked before reading value._id because
     * ObjectId._id may point back to the same ObjectId.
     */
    if (typeof value.toHexString === "function") {
      try {
        return value.toHexString().trim().toLowerCase();
      } catch (error) {
        // Continue to other methods.
      }
    }

    /*
     * Prevent circular-object recursion.
     */
    if (seen.has(value)) {
      return "";
    }

    seen.add(value);

    if (
      value.$oid !== null &&
      value.$oid !== undefined &&
      value.$oid !== value
    ) {
      return normaliseId(value.$oid, seen);
    }

    if (value._id !== null && value._id !== undefined && value._id !== value) {
      return normaliseId(value._id, seen);
    }

    if (value.id !== null && value.id !== undefined && value.id !== value) {
      return normaliseId(value.id, seen);
    }
  }

  try {
    return String(value).trim().toLowerCase();
  } catch (error) {
    return "";
  }
}

function normalisePhone(value) {
  let phone = String(value || "").replace(/\D/g, "");

  /*
   * Normalise common Nigerian telephone formats:
   *
   * +2348012345678 -> 08012345678
   * 2348012345678  -> 08012345678
   * 8012345678     -> 08012345678
   */
  if (phone.startsWith("234") && phone.length === 13) {
    phone = `0${phone.slice(3)}`;
  }

  if (phone.length === 10 && !phone.startsWith("0")) {
    phone = `0${phone}`;
  }

  return phone;
}

function normaliseEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normaliseName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function safeDate(value) {
  const date = new Date(value || 0);

  if (Number.isNaN(date.getTime())) {
    return new Date(0);
  }

  return date;
}

function getTransactionDate(transaction) {
  return safeDate(
    transaction.date ||
      transaction.approvedAt ||
      transaction.createdAt ||
      transaction.requestedAt,
  );
}

// ======================================================
// CUSTOMER IDENTIFIER HELPERS
// ======================================================

function getCustomerAliases(customer) {
  return [
    customer._id,
    customer.id,
    customer.customerId,
    customer.customerNumber,
    customer.accountNumber,
  ]
    .map(normaliseId)
    .filter(Boolean);
}

function getTransactionAliases(transaction) {
  return [
    transaction.customerId,
    transaction.customerNumber,
    transaction.accountNumber,

    transaction.customer?._id,
    transaction.customer?.id,
    transaction.customer?.customerId,
    transaction.customer?.customerNumber,

    transaction.customerId?._id,
    transaction.customerId?.id,
    transaction.customerId?.customerId,
    transaction.customerId?.customerNumber,
  ]
    .map(normaliseId)
    .filter(Boolean);
}

function addToIndex(index, value, customerKey) {
  if (!value) {
    return;
  }

  if (!index.has(value)) {
    index.set(value, new Set());
  }

  index.get(value).add(customerKey);
}

function addOwners(targetSet, index, value) {
  if (!value) {
    return;
  }

  const owners = index.get(value);

  if (!owners) {
    return;
  }

  for (const owner of owners) {
    targetSet.add(owner);
  }
}

function buildCustomerIndexes(customers) {
  const indexes = {
    alias: new Map(),
    phone: new Map(),
    email: new Map(),
    name: new Map(),
  };

  for (const customer of customers) {
    const customerKey = normaliseId(customer._id);

    for (const alias of getCustomerAliases(customer)) {
      addToIndex(indexes.alias, alias, customerKey);
    }

    addToIndex(indexes.phone, normalisePhone(customer.phone), customerKey);

    addToIndex(indexes.email, normaliseEmail(customer.email), customerKey);

    addToIndex(indexes.name, normaliseName(customer.name), customerKey);
  }

  return indexes;
}

// ======================================================
// TRANSACTION-TO-CUSTOMER MATCHING
// ======================================================

function resolveTransactionCustomer(transaction, indexes) {
  /*
   * First choice: IDs and account/customer numbers.
   */
  const identifierMatches = new Set();

  for (const alias of getTransactionAliases(transaction)) {
    addOwners(identifierMatches, indexes.alias, alias);
  }

  if (identifierMatches.size === 1) {
    return {
      customerKey: [...identifierMatches][0],
      method: "identifier",
      candidates: [...identifierMatches],
    };
  }

  if (identifierMatches.size > 1) {
    return {
      customerKey: null,
      method: "ambiguous-identifier",
      candidates: [...identifierMatches],
    };
  }

  /*
   * Second choice: telephone number.
   */
  const transactionPhone = normalisePhone(
    transaction.customerPhone ||
      transaction.phone ||
      transaction.customer?.phone,
  );

  const phoneMatches = new Set();

  addOwners(phoneMatches, indexes.phone, transactionPhone);

  if (phoneMatches.size === 1) {
    return {
      customerKey: [...phoneMatches][0],
      method: "phone-fallback",
      candidates: [...phoneMatches],
    };
  }

  if (phoneMatches.size > 1) {
    return {
      customerKey: null,
      method: "ambiguous-phone",
      candidates: [...phoneMatches],
    };
  }

  /*
   * Third choice: email address.
   */
  const transactionEmail = normaliseEmail(
    transaction.customerEmail ||
      transaction.email ||
      transaction.customer?.email,
  );

  const emailMatches = new Set();

  addOwners(emailMatches, indexes.email, transactionEmail);

  if (emailMatches.size === 1) {
    return {
      customerKey: [...emailMatches][0],
      method: "email-fallback",
      candidates: [...emailMatches],
    };
  }

  if (emailMatches.size > 1) {
    return {
      customerKey: null,
      method: "ambiguous-email",
      candidates: [...emailMatches],
    };
  }

  /*
   * Last possible choice: exact customer name.
   *
   * Name fallback remains disabled unless explicitly enabled because
   * separate customers may have identical names.
   */
  const transactionName = normaliseName(
    transaction.customerName || transaction.customer?.name,
  );

  const nameMatches = new Set();

  addOwners(nameMatches, indexes.name, transactionName);

  if (nameMatches.size === 1) {
    const candidate = [...nameMatches][0];

    if (CONFIG.allowNameFallback) {
      return {
        customerKey: candidate,
        method: "name-fallback",
        candidates: [candidate],
      };
    }

    return {
      customerKey: null,
      method: "name-match-disabled",
      candidates: [candidate],
    };
  }

  if (nameMatches.size > 1) {
    return {
      customerKey: null,
      method: "ambiguous-name",
      candidates: [...nameMatches],
    };
  }

  return {
    customerKey: null,
    method: "unmatched",
    candidates: [],
  };
}

// ======================================================
// BALANCE CALCULATION
// ======================================================

function getCashDelta(transaction) {
  const type = String(transaction.type || "")
    .trim()
    .toLowerCase();

  const amount = Math.abs(toNumber(transaction.amount));
  const charges = Math.abs(toNumber(transaction.charges));
  const loanDeduction = Math.abs(toNumber(transaction.loanDeduction));

  const hasStoredNetAmount =
    transaction.netAmount !== null &&
    transaction.netAmount !== undefined &&
    transaction.netAmount !== "";

  const storedNetAmount = Math.abs(toNumber(transaction.netAmount));

  if (type === "deposit") {
    /*
     * Deposit behaviour:
     *
     * amount - charges - loan deduction = amount credited
     *
     * When netAmount already exists, it normally represents the amount
     * that was credited to the customer's balance.
     */
    const credit = hasStoredNetAmount
      ? storedNetAmount
      : Math.max(0, amount - charges - loanDeduction);

    return {
      supported: true,
      delta: roundMoney(credit),
      calculation: "deposit-credit",
    };
  }

  if (type === "withdrawal") {
    /*
     * Withdrawal behaviour:
     *
     * amount + charges = amount removed from the balance
     *
     * Some older records may store amount - charges as netAmount.
     * The larger value prevents withdrawal charges from being omitted.
     */
    const debit = hasStoredNetAmount
      ? Math.max(storedNetAmount, amount + charges)
      : amount + charges;

    return {
      supported: true,
      delta: roundMoney(-debit),
      calculation: "withdrawal-debit",
    };
  }

  if (type === "loan_disbursement") {
    if (!CONFIG.includeLoanTypes) {
      return {
        supported: false,
        delta: 0,
        calculation: "loan-disbursement-needs-manual-review",
      };
    }

    const credit = hasStoredNetAmount ? storedNetAmount : amount;

    return {
      supported: true,
      delta: roundMoney(credit),
      calculation: "loan-disbursement-credit",
    };
  }

  if (type === "loan_repayment") {
    if (!CONFIG.includeLoanTypes) {
      return {
        supported: false,
        delta: 0,
        calculation: "loan-repayment-needs-manual-review",
      };
    }

    const debit = hasStoredNetAmount ? storedNetAmount : amount;

    return {
      supported: true,
      delta: roundMoney(-debit),
      calculation: "loan-repayment-debit",
    };
  }

  /*
   * Unknown or specialised transaction types must not silently change
   * customer balances.
   */
  return {
    supported: false,
    delta: 0,
    calculation: `unsupported-type:${type || "missing"}`,
  };
}

// ======================================================
// REPORT HELPERS
// ======================================================

function summariseTransaction(transaction) {
  return {
    transactionId: normaliseId(
      transaction._id || transaction.id || transaction.transactionId,
    ),

    customerId: normaliseId(transaction.customerId),

    customerNumber:
      transaction.customerNumber || transaction.customer?.customerNumber || "",

    customerName: transaction.customerName || transaction.customer?.name || "",

    customerPhone:
      transaction.customerPhone ||
      transaction.phone ||
      transaction.customer?.phone ||
      "",

    type: transaction.type,
    amount: toNumber(transaction.amount),
    charges: toNumber(transaction.charges),
    loanDeduction: toNumber(transaction.loanDeduction),
    netAmount: transaction.netAmount,
    status: transaction.status,

    date:
      transaction.date ||
      transaction.approvedAt ||
      transaction.createdAt ||
      transaction.requestedAt,
  };
}

function customerAllowsNegativeBalance(customer) {
  return Boolean(
    customer.hasActiveOverdraft ||
    customer.activeOverdraft ||
    toNumber(customer.overdraftBalance) > 0 ||
    toNumber(customer.overdraftLimit) > 0,
  );
}

function createOutputDirectory() {
  const outputDirectory = path.join(__dirname, "balance-repair-output");

  fs.mkdirSync(outputDirectory, {
    recursive: true,
  });

  return outputDirectory;
}

function createTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

// ======================================================
// MAIN REPAIR FUNCTION
// ======================================================

async function repairCustomerBalances() {
  if (!CONFIG.mongoUri) {
    throw new Error("MONGO is missing. Add MONGO to the .env file.");
  }

  console.log("==========================================");
  console.log("CUSTOMER BALANCE REPAIR");
  console.log("==========================================");

  console.log(`Mode: ${CONFIG.applyChanges ? "WRITE MODE" : "AUDIT MODE"}`);

  console.log(`Negative balances allowed: ${CONFIG.allowNegative}`);

  console.log(`Loan transaction types included: ${CONFIG.includeLoanTypes}`);

  console.log(`Name fallback enabled: ${CONFIG.allowNameFallback}`);

  console.log("");

  await mongoose.connect(CONFIG.mongoUri);

  console.log("Connected to MongoDB.");

  const customers = await Customer.find({}).lean();

  const approvedTransactions = await Transaction.find({
    status: "approved",
  })
    .sort({
      date: 1,
      createdAt: 1,
    })
    .lean();

  console.log(`Customers loaded: ${customers.length}`);

  console.log(`Approved transactions loaded: ${approvedTransactions.length}`);

  const timestamp = createTimestamp();
  const outputDirectory = createOutputDirectory();

  /*
   * Save current balances before making any new change.
   */
  const backupPath = path.join(
    outputDirectory,
    `customer-balances-before-repair-${timestamp}.json`,
  );

  const backupData = customers.map((customer) => ({
    _id: customer._id,
    id: customer.id,
    customerId: customer.customerId,
    customerNumber: customer.customerNumber,
    name: customer.name,
    phone: customer.phone,
    email: customer.email,
    cashBalance: customer.cashBalance,
    balance: customer.balance,
    loanBalance: customer.loanBalance,
  }));

  fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), "utf8");

  console.log(`Balance backup created: ${backupPath}`);

  const indexes = buildCustomerIndexes(customers);

  const customerByKey = new Map();
  const groupedTransactions = new Map();
  const customerIssues = new Map();

  for (const customer of customers) {
    const customerKey = normaliseId(customer._id);

    customerByKey.set(customerKey, customer);

    groupedTransactions.set(customerKey, []);

    customerIssues.set(customerKey, []);
  }

  const unmatchedTransactions = [];
  const ambiguousTransactions = [];
  const unsupportedTransactions = [];
  const matchedTransactions = [];

  for (const transaction of approvedTransactions) {
    const resolution = resolveTransactionCustomer(transaction, indexes);

    if (!resolution.customerKey) {
      const unresolvedRecord = {
        ...summariseTransaction(transaction),
        resolutionMethod: resolution.method,
        candidates: resolution.candidates || [],
      };

      if (resolution.method.startsWith("ambiguous")) {
        ambiguousTransactions.push(unresolvedRecord);
      } else {
        unmatchedTransactions.push(unresolvedRecord);
      }

      /*
       * Block candidates from automatic updates if the transaction
       * appears to belong to them but could not be safely assigned.
       */
      for (const candidate of resolution.candidates || []) {
        if (customerIssues.has(candidate)) {
          customerIssues.get(candidate).push({
            issue: "possible-unresolved-transaction",
            ...unresolvedRecord,
          });
        }
      }

      continue;
    }

    const deltaResult = getCashDelta(transaction);

    if (!deltaResult.supported) {
      const unsupportedRecord = {
        ...summariseTransaction(transaction),
        resolvedCustomer: resolution.customerKey,
        resolutionMethod: resolution.method,
        reason: deltaResult.calculation,
      };

      unsupportedTransactions.push(unsupportedRecord);

      customerIssues.get(resolution.customerKey).push({
        issue: "unsupported-transaction-type",
        ...unsupportedRecord,
      });

      continue;
    }

    const matchedRecord = {
      transaction,
      delta: deltaResult.delta,
      calculation: deltaResult.calculation,
      resolutionMethod: resolution.method,
    };

    groupedTransactions.get(resolution.customerKey).push(matchedRecord);

    matchedTransactions.push({
      ...summariseTransaction(transaction),
      resolvedCustomer: resolution.customerKey,
      resolutionMethod: resolution.method,
      delta: deltaResult.delta,
      calculation: deltaResult.calculation,
    });
  }

  const customerResults = [];
  const updateOperations = [];

  for (const customer of customers) {
    const customerKey = normaliseId(customer._id);

    const transactions = groupedTransactions.get(customerKey) || [];

    const issues = customerIssues.get(customerKey) || [];

    transactions.sort(
      (left, right) =>
        getTransactionDate(left.transaction) -
        getTransactionDate(right.transaction),
    );

    const currentBalance = roundMoney(
      customer.cashBalance ?? customer.balance ?? 0,
    );

    if (transactions.length === 0) {
      customerResults.push({
        customerId: customerKey,
        customId: customer.id || customer.customerId || "",
        customerNumber: customer.customerNumber || "",
        name: customer.name,
        currentBalance,
        calculatedBalance: null,
        matchedTransactions: 0,
        issues: issues.length,
        status:
          issues.length > 0
            ? "skipped-unresolved-transactions"
            : "skipped-no-supported-transactions",
      });

      continue;
    }

    if (issues.length > 0) {
      customerResults.push({
        customerId: customerKey,
        customId: customer.id || customer.customerId || "",
        customerNumber: customer.customerNumber || "",
        name: customer.name,
        currentBalance,
        calculatedBalance: null,
        matchedTransactions: transactions.length,
        issues,
        status: "skipped-manual-review-required",
      });

      continue;
    }

    const calculatedBalance = roundMoney(
      transactions.reduce((sum, item) => sum + item.delta, 0),
    );

    const difference = roundMoney(calculatedBalance - currentBalance);

    const negativeBalancePermitted = customerAllowsNegativeBalance(customer);

    if (
      calculatedBalance < 0 &&
      !CONFIG.allowNegative &&
      !negativeBalancePermitted
    ) {
      customerResults.push({
        customerId: customerKey,
        customId: customer.id || customer.customerId || "",
        customerNumber: customer.customerNumber || "",
        name: customer.name,
        currentBalance,
        calculatedBalance,
        difference,
        matchedTransactions: transactions.length,
        status: "skipped-suspicious-negative-balance",
      });

      continue;
    }

    const requiresUpdate = Math.abs(difference) > 0.01;

    let status = "already-correct";

    if (requiresUpdate) {
      status = CONFIG.applyChanges ? "updated" : "would-update";
    }

    customerResults.push({
      customerId: customerKey,
      customId: customer.id || customer.customerId || "",
      customerNumber: customer.customerNumber || "",
      name: customer.name,
      currentBalance,
      calculatedBalance,
      difference,
      matchedTransactions: transactions.length,
      matchingMethods: [
        ...new Set(transactions.map((item) => item.resolutionMethod)),
      ],
      status,
    });

    if (requiresUpdate) {
      updateOperations.push({
        updateOne: {
          filter: {
            _id: customer._id,
          },
          update: {
            $set: {
              cashBalance: calculatedBalance,
              balance: calculatedBalance,
            },
          },
        },
      });
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),

    mode: CONFIG.applyChanges ? "write" : "audit",

    settings: {
      allowNegative: CONFIG.allowNegative,
      includeLoanTypes: CONFIG.includeLoanTypes,
      allowNameFallback: CONFIG.allowNameFallback,
    },

    totals: {
      customers: customers.length,

      approvedTransactions: approvedTransactions.length,

      matchedTransactions: matchedTransactions.length,

      unmatchedTransactions: unmatchedTransactions.length,

      ambiguousTransactions: ambiguousTransactions.length,

      unsupportedTransactions: unsupportedTransactions.length,

      proposedCustomerUpdates: updateOperations.length,

      suspiciousNegativeBalances: customerResults.filter(
        (customer) => customer.status === "skipped-suspicious-negative-balance",
      ).length,

      customersRequiringManualReview: customerResults.filter(
        (customer) =>
          customer.status === "skipped-manual-review-required" ||
          customer.status === "skipped-unresolved-transactions",
      ).length,
    },

    customerResults,
    matchedTransactions,
    unmatchedTransactions,
    ambiguousTransactions,
    unsupportedTransactions,
  };

  const reportPath = path.join(
    outputDirectory,
    `balance-repair-report-${timestamp}.json`,
  );

  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), "utf8");

  if (CONFIG.applyChanges && updateOperations.length > 0) {
    console.log("");
    console.log(
      `Applying ${updateOperations.length} customer balance updates...`,
    );

    const result = await Customer.bulkWrite(updateOperations, {
      ordered: false,
    });

    console.log(`Matched customers: ${result.matchedCount || 0}`);

    console.log(`Modified customers: ${result.modifiedCount || 0}`);
  }

  console.log("");
  console.log("==========================================");
  console.log("REPAIR SUMMARY");
  console.log("==========================================");

  console.log(`Customers: ${customers.length}`);

  console.log(`Approved transactions: ${approvedTransactions.length}`);

  console.log(`Matched transactions: ${matchedTransactions.length}`);

  console.log(`Unmatched transactions: ${unmatchedTransactions.length}`);

  console.log(`Ambiguous transactions: ${ambiguousTransactions.length}`);

  console.log(`Unsupported transactions: ${unsupportedTransactions.length}`);

  console.log(`Proposed customer updates: ${updateOperations.length}`);

  console.log(`Report: ${reportPath}`);
  console.log(`Backup: ${backupPath}`);

  if (!CONFIG.applyChanges) {
    console.log("");
    console.log("AUDIT MODE COMPLETED. NO DATABASE BALANCES WERE CHANGED.");

    console.log("Review the report before setting APPLY_CHANGES=true.");
  } else {
    console.log("");
    console.log("WRITE MODE COMPLETED.");
  }
}

// ======================================================
// EXECUTION
// ======================================================

repairCustomerBalances()
  .catch((error) => {
    console.error("");
    console.error("Repair failed:", error);

    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
    }
  });
