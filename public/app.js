const form = document.querySelector("#pay-form");
const formError = document.querySelector("#form-error");
const result = document.querySelector("#result");
const amountInput = document.querySelector("#amount");
const noteInput = document.querySelector("#note");
const nameInput = document.querySelector("#payee-name");
const vpaInput = document.querySelector("#payee-vpa");
const codeInput = document.querySelector("#merchant-code");

const ua = navigator.userAgent || "";
const platform = /Android/i.test(ua) ? "android" : /iPhone|iPad|iPod/i.test(ua) ? "ios" : "desktop";

function showError(message) {
  formError.hidden = !message;
  formError.textContent = message || "";
}

function rupee(amount) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(amount));
}

function appHref(order, app) {
  const links = order.links[app];
  if (platform === "ios") return links.ios;
  return links.android;
}

function render(order) {
  result.hidden = false;
  document.querySelector("#result-amount").textContent = rupee(order.amount);
  document.querySelector("#result-payee").textContent = `${order.payeeName} · ${order.payeeVpa}`;
  document.querySelector("#result-ref").textContent = order.id;
  document.querySelector("#result-note").textContent = order.note || "—";
  document.querySelector("#upi-text").textContent = order.links.generic;
  document.querySelector("#qr").src = order.qrDataUrl;

  const gpay = document.querySelector("#gpay-link");
  const phonepe = document.querySelector("#phonepe-link");
  const any = document.querySelector("#upi-link");
  gpay.href = appHref(order, "googlePay");
  phonepe.href = appHref(order, "phonePe");
  any.href = order.links.generic;

  const hosted = document.querySelector("#phonepe-hosted");
  const phonepeError = document.querySelector("#phonepe-error");
  if (order.phonepe?.redirectUrl) {
    hosted.hidden = false;
    hosted.href = order.phonepe.redirectUrl;
  } else {
    hosted.hidden = true;
  }
  phonepeError.hidden = !order.phonepe?.error;
  phonepeError.textContent = order.phonepe?.error || "";

  const status = document.querySelector("#result-status");
  status.className = `status ${order.status === "paid" || order.status === "failed" ? order.status : ""}`;
  status.textContent = order.status === "paid"
    ? "Paid"
    : order.status === "failed"
      ? "Failed"
      : "Awaiting payment in the app";

  document.querySelector("#device-hint").textContent = platform === "desktop"
    ? "On a computer, scan the QR with Google Pay or PhonePe. The buttons open those apps on a phone."
    : "Choose an app. Approve the payment there. This page never asks for your UPI PIN.";

  document.querySelector("#status-note").textContent = order.statusSource === "phonepe"
    ? "Status came from PhonePe Payment Gateway."
    : "Google Pay and PhonePe confirm the transfer inside the app. This page can mark the order paid only after PhonePe Payment Gateway reports it.";

  result.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function loadConfig() {
  const response = await fetch("/api/config");
  if (!response.ok) return;
  const config = await response.json();
  if (config.merchantVpa) vpaInput.value = config.merchantVpa;
  if (config.merchantName) nameInput.value = config.merchantName;
  if (config.merchantCode) codeInput.value = config.merchantCode;
}

document.querySelector("#fill-sample").addEventListener("click", () => {
  amountInput.value = "149.00";
  noteInput.value = "Groceries";
  nameInput.value = "Sample Store";
  vpaInput.value = "samplemerchant@upi";
  codeInput.value = "";
  showError("");
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showError("");
  const button = document.querySelector("#create-payment");
  button.disabled = true;
  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: amountInput.value,
        note: noteInput.value,
        payeeName: nameInput.value,
        payeeVpa: vpaInput.value,
        merchantCode: codeInput.value,
      }),
    });
    const payload = await response.json();
    if (!response.ok) {
      showError(payload.error || "Could not create the payment request.");
      return;
    }
    history.replaceState(null, "", `/?order=${encodeURIComponent(payload.id)}`);
    render(payload);
  } catch {
    showError("Could not reach the checkout server.");
  } finally {
    button.disabled = false;
  }
});

async function restore() {
  const params = new URLSearchParams(location.search);
  const id = params.get("order");
  if (!id) return;
  const response = await fetch(`/api/orders/${encodeURIComponent(id)}`);
  if (!response.ok) return;
  let order = await response.json();
  if (params.get("phonepeReturn") === "1") {
    const statusResponse = await fetch(`/api/orders/${encodeURIComponent(id)}/status`, { method: "POST" });
    if (statusResponse.ok) order = await statusResponse.json();
  }
  render(order);
}

loadConfig().then(restore);
