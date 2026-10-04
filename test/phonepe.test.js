import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createPhonePeClient,
  localStatusFromPhonePe,
  phonepeConfigFromEnv,
} from "../src/phonepe.js";

function jsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(payload);
    },
  };
}

describe("PhonePe Payment Gateway client", () => {
  it("stays disabled until merchant credentials are complete", () => {
    assert.equal(phonepeConfigFromEnv({}), null);
    assert.equal(phonepeConfigFromEnv({
      PHONEPE_CLIENT_ID: "id",
      PHONEPE_CLIENT_SECRET: "secret",
      PHONEPE_CLIENT_VERSION: "1",
    }), null);
  });

  it("uses the sandbox and production hosts from PhonePe's docs", () => {
    const sandbox = phonepeConfigFromEnv({
      PHONEPE_CLIENT_ID: "id",
      PHONEPE_CLIENT_SECRET: "secret",
      PHONEPE_CLIENT_VERSION: "1",
      PHONEPE_MERCHANT_ID: "MID",
    });
    assert.match(sandbox.tokenUrl, /^https:\/\/api-preprod\.phonepe\.com\/apis\/pg-sandbox\/v1\/oauth\/token$/);
    assert.match(sandbox.payUrl, /\/checkout\/v2\/pay$/);
    const production = phonepeConfigFromEnv({
      PHONEPE_ENV: "production",
      PHONEPE_CLIENT_ID: "id",
      PHONEPE_CLIENT_SECRET: "secret",
      PHONEPE_CLIENT_VERSION: "1",
      PHONEPE_MERCHANT_ID: "MID",
    });
    assert.match(production.tokenUrl, /^https:\/\/api\.phonepe\.com\/apis\/identity-manager\/v1\/oauth\/token$/);
    assert.match(production.statusUrl("ORD-1"), /\/pg\/checkout\/v2\/order\/ORD-1\/status/);
  });

  it("authorizes with O-Bearer and creates a checkout in paisa", async () => {
    const calls = [];
    const fetchImpl = async (url, options) => {
      calls.push({ url: String(url), options });
      if (String(url).includes("/oauth/token")) {
        return jsonResponse({ access_token: "tok-1", expires_at: 4_000_000_000, token_type: "O-Bearer" });
      }
      return jsonResponse({
        orderId: "OMO1",
        state: "PENDING",
        redirectUrl: "https://mercury.example/checkout",
      });
    };
    const config = phonepeConfigFromEnv({
      PHONEPE_CLIENT_ID: "id",
      PHONEPE_CLIENT_SECRET: "secret",
      PHONEPE_CLIENT_VERSION: "1",
      PHONEPE_MERCHANT_ID: "MID",
    });
    const client = createPhonePeClient(config, fetchImpl, () => 1_000);
    const checkout = await client.createCheckout({
      merchantOrderId: "TORDER1",
      amountPaisa: 14900,
      redirectUrl: "https://shop.example/phonepe/return?order=TORDER1",
      message: "Groceries",
    });
    assert.equal(checkout.redirectUrl, "https://mercury.example/checkout");
    const pay = calls[1];
    assert.equal(pay.options.headers.Authorization, "O-Bearer tok-1");
    assert.deepEqual(JSON.parse(pay.options.body), {
      merchantOrderId: "TORDER1",
      amount: 14900,
      expireAfter: 1200,
      paymentFlow: {
        type: "PG_CHECKOUT",
        message: "Groceries",
        merchantUrls: { redirectUrl: "https://shop.example/phonepe/return?order=TORDER1" },
      },
    });
    const tokenBody = calls[0].options.body;
    assert.equal(tokenBody.get("grant_type"), "client_credentials");
    assert.equal(tokenBody.get("client_secret"), "secret");
  });

  it("checks order status with the merchant id header", async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes("/oauth/token")) {
        return jsonResponse({ access_token: "tok-2", expires_at: 4_000_000_000 });
      }
      return jsonResponse({ orderId: "OMO2", state: "COMPLETED", amount: 14900 });
    };
    const seen = [];
    const wrapped = async (url, options) => {
      seen.push({ url: String(url), options });
      return fetchImpl(url, options);
    };
    const config = phonepeConfigFromEnv({
      PHONEPE_CLIENT_ID: "id",
      PHONEPE_CLIENT_SECRET: "secret",
      PHONEPE_CLIENT_VERSION: "1",
      PHONEPE_MERCHANT_ID: "MID123",
    });
    const client = createPhonePeClient(config, wrapped, () => 1_000);
    const status = await client.orderStatus("TORDER2");
    assert.equal(status.state, "COMPLETED");
    assert.equal(localStatusFromPhonePe("COMPLETED"), "paid");
    assert.equal(localStatusFromPhonePe("FAILED"), "failed");
    assert.equal(seen[1].options.headers["X-MERCHANT-ID"], "MID123");
    assert.match(seen[1].url, /\/checkout\/v2\/order\/TORDER2\/status\?details=false&errorContext=true$/);
  });
});
