import assert from "node:assert/strict";
import { once } from "node:events";
import { describe, it } from "node:test";
import { GOOGLE_PAY_PACKAGE, PHONEPE_PACKAGE } from "../src/upi.js";
import { createApp } from "../src/server.js";

async function withServer(options, run) {
  const server = createApp({ phonepe: false, ...options });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const { port } = server.address();
  try {
    return await run(`http://127.0.0.1:${port}`);
  } finally {
    server.close();
    await once(server, "close");
  }
}

describe("checkout server", () => {
  it("creates a Google Pay and PhonePe payment request", async () => {
    await withServer({}, async (base) => {
      const page = await fetch(`${base}/`);
      assert.equal(page.status, 200);
      assert.match(await page.text(), /Google Pay or PhonePe/);

      const response = await fetch(`${base}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: "149.5",
          note: "Groceries",
          payeeName: "Sample Store",
          payeeVpa: "samplemerchant@upi",
        }),
      });
      assert.equal(response.status, 201);
      const order = await response.json();
      assert.equal(order.amount, "149.50");
      assert.equal(order.status, "awaiting_payment");
      assert.match(order.links.generic, /^upi:\/\/pay\?/);
      assert.match(order.links.generic, /pa=samplemerchant%40upi/);
      assert.match(order.links.generic, /am=149\.50/);
      assert.match(order.links.generic, /cu=INR/);
      assert.match(order.links.googlePay.android, new RegExp(GOOGLE_PAY_PACKAGE));
      assert.match(order.links.phonePe.android, new RegExp(PHONEPE_PACKAGE));
      assert.match(order.qrDataUrl, /^data:image\/png;base64,/);
      assert.equal(order.phonepe.configured, false);

      const stored = await fetch(`${base}/api/orders/${order.id}`);
      assert.equal(stored.status, 200);
      const status = await fetch(`${base}/api/orders/${order.id}/status`, { method: "POST" });
      const statusBody = await status.json();
      assert.equal(statusBody.verifiable, false);
      assert.match(statusBody.message, /PhonePe Payment Gateway/);
    });
  });

  it("rejects an unusable payment request", async () => {
    await withServer({}, async (base) => {
      const response = await fetch(`${base}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: "0",
          payeeName: "Sample Store",
          payeeVpa: "samplemerchant@upi",
        }),
      });
      assert.equal(response.status, 400);
      const body = await response.json();
      assert.match(body.error, /Minimum amount/);
    });
  });

  it("adds a PhonePe hosted checkout when the gateway client is configured", async () => {
    const phonepe = {
      client: {
        async createCheckout() {
          return {
            orderId: "OMO9",
            state: "PENDING",
            redirectUrl: "https://mercury.example/pay",
            expireAt: 1,
          };
        },
        async orderStatus() {
          return { orderId: "OMO9", state: "COMPLETED", amount: 20000 };
        },
      },
    };
    await withServer({ phonepe }, async (base) => {
      const created = await fetch(`${base}/api/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Forwarded-Proto": "https" },
        body: JSON.stringify({
          amount: "200",
          payeeName: "Sample Store",
          payeeVpa: "samplemerchant@upi",
          note: "Bill",
        }),
      });
      const order = await created.json();
      assert.equal(order.phonepe.redirectUrl, "https://mercury.example/pay");
      const returned = await fetch(`${base}/phonepe/return?order=${order.id}`, { redirect: "manual" });
      assert.equal(returned.status, 302);
      const status = await fetch(`${base}/api/orders/${order.id}/status`, { method: "POST" });
      const body = await status.json();
      assert.equal(body.status, "paid");
      assert.equal(body.statusSource, "phonepe");
    });
  });
});
