import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  GOOGLE_PAY_PACKAGE,
  InputError,
  PHONEPE_PACKAGE,
  buildPaymentLinks,
  normalizeAmount,
} from "../src/upi.js";
import { createOrder } from "../src/orders.js";

const payment = {
  payeeVpa: "samplemerchant@upi",
  payeeName: "Sample Store",
  merchantCode: "5411",
  transactionRef: "TORDER123",
  note: "Groceries",
  amount: "149.50",
};

describe("UPI payment links", () => {
  it("builds Google Pay and PhonePe intents from the NPCI pay URI", () => {
    const links = buildPaymentLinks(payment);
    assert.equal(
      links.generic,
      "upi://pay?pa=samplemerchant%40upi&pn=Sample%20Store&mc=5411&tr=TORDER123&tn=Groceries&am=149.50&cu=INR&mode=04",
    );
    assert.match(links.qr, /mode=01$/);
    assert.match(links.googlePay.android, new RegExp(`package=${GOOGLE_PAY_PACKAGE};end$`));
    assert.match(links.phonePe.android, new RegExp(`package=${PHONEPE_PACKAGE};end$`));
    assert.match(links.googlePay.ios, /^gpay:\/\/upi\/pay\?/);
    assert.match(links.phonePe.ios, /^phonepe:\/\/pay\?/);
  });

  it("omits an empty merchant code and keeps the amount in rupees", () => {
    const order = createOrder({
      amount: "10",
      payeeVpa: "shop.name@okhdfcbank",
      payeeName: "Neighbourhood Kirana",
      note: "",
    }, { now: 1_700_000_000_000, rand: () => 0.5 });
    assert.equal(order.amount, "10.00");
    assert.equal(order.paisa, 1000);
    assert.equal(order.links.generic.includes("mc="), false);
    assert.match(order.links.generic, /am=10\.00/);
    assert.match(order.links.generic, /cu=INR/);
    assert.equal(order.id, order.links.generic.match(/tr=([A-Z0-9]+)/)[1]);
  });

  it("rejects amounts and UPI IDs that cannot be paid", () => {
    assert.throws(() => normalizeAmount("0.50"), InputError);
    assert.throws(() => normalizeAmount("100000.01"), InputError);
    assert.throws(() => normalizeAmount("ten"), InputError);
    assert.throws(() => createOrder({
      amount: "20",
      payeeVpa: "not a vpa",
      payeeName: "Store",
    }), InputError);
  });
});
