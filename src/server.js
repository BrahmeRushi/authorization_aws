import { createServer as createHttpServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import QRCode from "qrcode";
import { InputError } from "./upi.js";
import { createOrder, OrderStore } from "./orders.js";
import {
  createPhonePeClient,
  localStatusFromPhonePe,
  PhonePeError,
  phonepeConfigFromEnv,
} from "./phonepe.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");
const MAX_BODY = 16 * 1024;

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
};

export function loadEnvFile(filePath) {
  if (!existsSync(filePath)) return;
  const lines = readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function publicFile(urlPath) {
  const requested = urlPath === "/" ? "/index.html" : urlPath;
  let decoded;
  try {
    decoded = decodeURIComponent(requested);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const filePath = normalize(join(publicDir, decoded));
  if (!filePath.startsWith(publicDir)) return null;
  return filePath;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    request.on("data", (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new InputError("Request body is too large."));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new InputError("Request body must be JSON."));
      }
    });
    request.on("error", reject);
  });
}

function publicOrder(order) {
  return {
    id: order.id,
    amount: order.amount,
    currency: order.currency,
    payeeVpa: order.payeeVpa,
    payeeName: order.payeeName,
    merchantCode: order.merchantCode,
    note: order.note,
    status: order.status,
    statusSource: order.statusSource,
    createdAt: order.createdAt,
    links: order.links,
    qrDataUrl: order.qrDataUrl,
    phonepe: order.phonepe
      ? {
          configured: true,
          state: order.phonepe.state,
          redirectUrl: order.phonepe.redirectUrl,
          error: order.phonepe.error ?? null,
        }
      : { configured: false, state: null, redirectUrl: null, error: null },
  };
}

function requestOrigin(request) {
  const configured = process.env.PUBLIC_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");
  const host = request.headers.host;
  if (!host) return "";
  const proto = request.headers["x-forwarded-proto"] || "http";
  return `${proto}://${host}`;
}

async function attachQr(order) {
  order.qrDataUrl = await QRCode.toDataURL(order.links.qr, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });
  return order;
}

async function maybeCreatePhonePeCheckout(order, request, phonepe) {
  if (!phonepe) return;
  const origin = requestOrigin(request);
  if (!origin.startsWith("http://") && !origin.startsWith("https://")) {
    order.phonepe = {
      state: null,
      redirectUrl: null,
      error: "Set PUBLIC_BASE_URL before using PhonePe hosted checkout.",
    };
    return;
  }
  try {
    const checkout = await phonepe.client.createCheckout({
      merchantOrderId: order.id,
      amountPaisa: order.paisa,
      redirectUrl: `${origin}/phonepe/return?order=${encodeURIComponent(order.id)}`,
      message: order.note || `Payment ${order.id}`,
    });
    order.phonepe = { ...checkout, error: null };
  } catch (error) {
    order.phonepe = {
      state: null,
      redirectUrl: null,
      error: error instanceof PhonePeError ? error.message : "PhonePe checkout failed.",
    };
  }
}

export function createApp({
  store = new OrderStore(),
  phonepe,
  fetchImpl,
  now,
} = {}) {
  const phonepeBundle = phonepe === undefined
    ? (() => {
        const config = phonepeConfigFromEnv();
        return config ? { config, client: createPhonePeClient(config, fetchImpl, now) } : null;
      })()
    : phonepe || null;

  return createHttpServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/api/health") {
        sendJson(response, 200, { ok: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/config") {
        sendJson(response, 200, {
          merchantVpa: process.env.MERCHANT_VPA?.trim() || "",
          merchantName: process.env.MERCHANT_NAME?.trim() || "",
          merchantCode: process.env.MERCHANT_CODE?.trim() || "",
          phonepeCheckout: Boolean(phonepeBundle),
        });
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/orders") {
        const body = await readBody(request);
        const order = createOrder(
          {
            amount: body.amount,
            payeeVpa: body.payeeVpa || process.env.MERCHANT_VPA,
            payeeName: body.payeeName || process.env.MERCHANT_NAME,
            note: body.note,
            merchantCode: body.merchantCode || process.env.MERCHANT_CODE,
          },
          now ? { now: now() } : {},
        );
        await attachQr(order);
        await maybeCreatePhonePeCheckout(order, request, phonepeBundle);
        store.save(order);
        sendJson(response, 201, publicOrder(order));
        return;
      }
      const orderMatch = url.pathname.match(/^\/api\/orders\/([A-Za-z0-9]{6,40})$/);
      if (orderMatch && request.method === "GET") {
        const order = store.get(orderMatch[1]);
        if (!order) {
          sendJson(response, 404, { error: "Order not found." });
          return;
        }
        sendJson(response, 200, publicOrder(order));
        return;
      }
      const statusMatch = url.pathname.match(/^\/api\/orders\/([A-Za-z0-9]{6,40})\/status$/);
      if (statusMatch && request.method === "POST") {
        const order = store.get(statusMatch[1]);
        if (!order) {
          sendJson(response, 404, { error: "Order not found." });
          return;
        }
        const canCheck = phonepeBundle && (order.phonepe?.orderId || order.phonepe?.redirectUrl);
        if (!canCheck) {
          sendJson(response, 200, {
            ...publicOrder(order),
            verifiable: false,
            message: "UPI intent payments are confirmed inside Google Pay or PhonePe. Add PhonePe Payment Gateway credentials to check status here.",
          });
          return;
        }
        const remote = await phonepeBundle.client.orderStatus(order.id);
        order.status = localStatusFromPhonePe(remote.state);
        order.statusSource = "phonepe";
        order.phonepe.state = remote.state;
        store.save(order);
        sendJson(response, 200, { ...publicOrder(order), verifiable: true });
        return;
      }
      if (request.method === "GET" && url.pathname === "/phonepe/return") {
        const id = url.searchParams.get("order") || "";
        response.writeHead(302, { Location: `/?order=${encodeURIComponent(id)}&phonepeReturn=1` });
        response.end();
        return;
      }
      if (request.method === "GET") {
        const filePath = publicFile(url.pathname);
        if (!filePath || !existsSync(filePath)) {
          sendJson(response, 404, { error: "Not found." });
          return;
        }
        const ext = filePath.slice(filePath.lastIndexOf("."));
        const body = readFileSync(filePath);
        response.writeHead(200, {
          "Content-Type": CONTENT_TYPES[ext] || "application/octet-stream",
          "Content-Length": body.length,
          "Cache-Control": "no-store",
        });
        response.end(body);
        return;
      }
      sendJson(response, 405, { error: "Method not allowed." });
    } catch (error) {
      if (error instanceof InputError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      if (error instanceof PhonePeError) {
        sendJson(response, error.statusCode, { error: error.message });
        return;
      }
      sendJson(response, 500, { error: "Something went wrong while creating the payment." });
    }
  });
}

export function listen(server, port) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      if (error.code !== "EAFNOSUPPORT" && error.code !== "EADDRNOTAVAIL") {
        reject(error);
        return;
      }
      server.once("error", reject);
      server.listen(port, "0.0.0.0", () => {
        server.off("error", reject);
        resolve(server.address());
      });
    };
    server.once("error", onError);
    server.listen({ port, host: "::", ipv6Only: false }, () => {
      server.off("error", onError);
      resolve(server.address());
    });
  });
}

const isMain = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  loadEnvFile(join(__dirname, "..", ".env"));
  const port = Number(process.env.PORT || 3000);
  const server = createApp();
  listen(server, port).then((address) => {
    console.log(`UPI checkout listening on http://localhost:${address.port}`);
  });
}
