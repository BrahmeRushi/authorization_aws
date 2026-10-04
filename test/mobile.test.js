import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { GOOGLE_PAY_PACKAGE, PHONEPE_PACKAGE } from "../src/upi.js";
import { createMobilePayment, paymentLaunches } from "../src/mobile-entry.js";

describe("Android checkout payment", () => {
  it("creates a UPI request the phone app can open in Google Pay or PhonePe", async () => {
    const payment = await createMobilePayment({
      amount: "149",
      note: "Groceries",
      payeeName: "Sample Store",
      payeeVpa: "samplemerchant@upi",
    }, { now: 1_700_000_000_000, rand: () => 0.25 });

    assert.equal(payment.order.amount, "149.00");
    assert.match(payment.order.qrDataUrl, /^data:image\/png;base64,/);
    assert.match(payment.order.links.generic, /pa=samplemerchant%40upi/);
    assert.match(payment.order.links.generic, /am=149\.00/);
    assert.match(payment.order.links.generic, /cu=INR/);
    assert.match(payment.launches.googlePay.url, /^upi:\/\/pay\?/);
    assert.equal(payment.launches.googlePay.target, "googlePay");
    assert.equal(payment.launches.phonePe.target, "phonePe");
    assert.equal(payment.launches.phonePe.url, payment.launches.googlePay.url);
    assert.equal(GOOGLE_PAY_PACKAGE, "com.google.android.apps.nbu.paisa.user");
    assert.equal(PHONEPE_PACKAGE, "com.phonepe.app");
    assert.deepEqual(paymentLaunches(payment.order).any, {
      target: "any",
      url: payment.order.links.generic,
    });
  });

  it("opens only upi://pay links in the official Google Pay and PhonePe packages", () => {
    const activity = readFileSync(
      new URL("../android/app/src/main/java/com/authorizationaws/upi/MainActivity.java", import.meta.url),
      "utf8",
    );
    const request = readFileSync(
      new URL("../android/app/src/main/java/com/authorizationaws/upi/UpiRequest.java", import.meta.url),
      "utf8",
    );
    assert.ok(activity.includes("UpiRequest.GOOGLE_PAY"));
    assert.ok(activity.includes("UpiRequest.PHONEPE"));
    assert.ok(activity.includes('url.startsWith("upi://pay?")'));
    assert.ok(request.includes(GOOGLE_PAY_PACKAGE));
    assert.ok(request.includes(PHONEPE_PACKAGE));
    assert.ok(request.includes('new StringBuilder("upi://pay?")'));
  });
});
