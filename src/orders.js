import {
  assertMerchantCode,
  assertNote,
  assertPayeeName,
  assertPayeeVpa,
  buildPaymentLinks,
  normalizeAmount,
} from "./upi.js";

export class OrderStore {
  constructor() {
    this.orders = new Map();
  }

  save(order) {
    this.orders.set(order.id, order);
    return order;
  }

  get(id) {
    return this.orders.get(id) ?? null;
  }
}

export function createTransactionRef(now = Date.now(), rand = Math.random) {
  const time = now.toString(36).toUpperCase();
  const suffix = Math.floor(rand() * 36 ** 4)
    .toString(36)
    .toUpperCase()
    .padStart(4, "0");
  return `T${time}${suffix}`.replace(/[^A-Z0-9]/g, "").slice(0, 35);
}

export function createOrder(input, { now = Date.now(), rand = Math.random } = {}) {
  const { amount, paisa } = normalizeAmount(input.amount);
  const payeeVpa = assertPayeeVpa(input.payeeVpa);
  const payeeName = assertPayeeName(input.payeeName);
  const note = assertNote(input.note);
  const merchantCode = assertMerchantCode(input.merchantCode);
  const id = createTransactionRef(now, rand);
  const payment = {
    payeeVpa,
    payeeName,
    merchantCode,
    transactionRef: id,
    note,
    amount,
  };
  return {
    id,
    amount,
    paisa,
    payeeVpa,
    payeeName,
    merchantCode,
    note,
    currency: "INR",
    status: "awaiting_payment",
    statusSource: "local",
    createdAt: new Date(now).toISOString(),
    links: buildPaymentLinks(payment),
    phonepe: null,
  };
}
