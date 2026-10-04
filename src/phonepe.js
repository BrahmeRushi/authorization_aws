const SANDBOX_ORIGIN = "https://api-preprod.phonepe.com/apis/pg-sandbox";
const PRODUCTION_TOKEN_ORIGIN = "https://api.phonepe.com/apis/identity-manager";
const PRODUCTION_PG_ORIGIN = "https://api.phonepe.com/apis/pg";

export function phonepeConfigFromEnv(env = process.env) {
  const clientId = env.PHONEPE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.PHONEPE_CLIENT_SECRET?.trim() ?? "";
  const clientVersion = env.PHONEPE_CLIENT_VERSION?.trim() ?? "";
  const merchantId = env.PHONEPE_MERCHANT_ID?.trim() ?? "";
  if (!clientId || !clientSecret || !clientVersion || !merchantId) {
    return null;
  }
  const production = (env.PHONEPE_ENV ?? "sandbox").trim().toLowerCase() === "production";
  return {
    clientId,
    clientSecret,
    clientVersion,
    merchantId,
    environment: production ? "production" : "sandbox",
    tokenUrl: production
      ? `${PRODUCTION_TOKEN_ORIGIN}/v1/oauth/token`
      : `${SANDBOX_ORIGIN}/v1/oauth/token`,
    payUrl: production
      ? `${PRODUCTION_PG_ORIGIN}/checkout/v2/pay`
      : `${SANDBOX_ORIGIN}/checkout/v2/pay`,
    statusUrl(merchantOrderId) {
      const root = production ? PRODUCTION_PG_ORIGIN : SANDBOX_ORIGIN;
      return `${root}/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status?details=false&errorContext=true`;
    },
  };
}

export class PhonePeError extends Error {
  constructor(message, { statusCode = 502 } = {}) {
    super(message);
    this.name = "PhonePeError";
    this.statusCode = statusCode;
  }
}

async function readJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

export function createPhonePeClient(config, fetchImpl = fetch, now = () => Date.now()) {
  let cached = null;

  async function accessToken() {
    const current = now();
    if (cached && cached.expiresAtMs - 5 * 60 * 1000 > current) {
      return cached.token;
    }
    const body = new URLSearchParams({
      client_id: config.clientId,
      client_version: config.clientVersion,
      client_secret: config.clientSecret,
      grant_type: "client_credentials",
    });
    const response = await fetchImpl(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });
    const payload = await readJson(response);
    if (!response.ok || !payload.access_token) {
      throw new PhonePeError("PhonePe rejected the authorization request.");
    }
    const expiresAtMs = Number(payload.expires_at) > 0
      ? Number(payload.expires_at) * 1000
      : current + 5 * 60 * 1000;
    cached = { token: payload.access_token, expiresAtMs };
    return cached.token;
  }

  return {
    async createCheckout({ merchantOrderId, amountPaisa, redirectUrl, message }) {
      const token = await accessToken();
      const response = await fetchImpl(config.payUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `O-Bearer ${token}`,
        },
        body: JSON.stringify({
          merchantOrderId,
          amount: amountPaisa,
          expireAfter: 1200,
          paymentFlow: {
            type: "PG_CHECKOUT",
            message,
            merchantUrls: { redirectUrl },
          },
        }),
      });
      const payload = await readJson(response);
      if (!response.ok || !payload.redirectUrl) {
        throw new PhonePeError(payload.message || "PhonePe did not create a checkout.");
      }
      return {
        orderId: payload.orderId ?? "",
        state: payload.state ?? "PENDING",
        redirectUrl: payload.redirectUrl,
        expireAt: payload.expireAt ?? null,
      };
    },

    async orderStatus(merchantOrderId) {
      const token = await accessToken();
      const response = await fetchImpl(config.statusUrl(merchantOrderId), {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `O-Bearer ${token}`,
          "X-MERCHANT-ID": config.merchantId,
        },
      });
      const payload = await readJson(response);
      if (!response.ok || !payload.state) {
        throw new PhonePeError(payload.message || "PhonePe did not return an order status.");
      }
      return {
        orderId: payload.orderId ?? "",
        state: payload.state,
        amount: payload.amount ?? null,
      };
    },
  };
}

export function localStatusFromPhonePe(state) {
  if (state === "COMPLETED") return "paid";
  if (state === "FAILED") return "failed";
  return "awaiting_payment";
}
