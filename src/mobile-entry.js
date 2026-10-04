import QRCode from "qrcode";
import { InputError } from "./upi.js";
import { createOrder } from "./orders.js";

export function paymentLaunches(order) {
  const url = order.links.generic;
  return {
    googlePay: { target: "googlePay", url },
    phonePe: { target: "phonePe", url },
    any: { target: "any", url },
  };
}

export async function createMobilePayment(input, options) {
  const order = createOrder(input, options);
  const qrDataUrl = await QRCode.toDataURL(order.links.qr, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 280,
  });
  return { order: { ...order, qrDataUrl }, launches: paymentLaunches(order) };
}

function showError(formError, message) {
  formError.hidden = !message;
  formError.textContent = message || "";
}

function rupee(amount) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(Number(amount));
}

export function mountCheckout(doc = document) {
  const form = doc.querySelector("#pay-form");
  const formError = doc.querySelector("#form-error");
  const result = doc.querySelector("#result");
  const amountInput = doc.querySelector("#amount");
  const noteInput = doc.querySelector("#note");
  const nameInput = doc.querySelector("#payee-name");
  const vpaInput = doc.querySelector("#payee-vpa");
  const codeInput = doc.querySelector("#merchant-code");

  function openPayment(target, url) {
    const bridge = doc.defaultView?.UpiAndroid;
    if (bridge && typeof bridge.launch === "function") {
      bridge.launch(target, url);
      return;
    }
    doc.defaultView.location.href = url;
  }

  function render(payment) {
    const { order, launches } = payment;
    result.hidden = false;
    doc.querySelector("#result-amount").textContent = rupee(order.amount);
    doc.querySelector("#result-payee").textContent = `${order.payeeName} · ${order.payeeVpa}`;
    doc.querySelector("#result-ref").textContent = order.id;
    doc.querySelector("#result-note").textContent = order.note || "—";
    doc.querySelector("#upi-text").textContent = order.links.generic;
    doc.querySelector("#qr").src = order.qrDataUrl;
    doc.querySelector("#gpay-link").onclick = (event) => {
      event.preventDefault();
      openPayment(launches.googlePay.target, launches.googlePay.url);
    };
    doc.querySelector("#phonepe-link").onclick = (event) => {
      event.preventDefault();
      openPayment(launches.phonePe.target, launches.phonePe.url);
    };
    doc.querySelector("#upi-link").onclick = (event) => {
      event.preventDefault();
      openPayment(launches.any.target, launches.any.url);
    };
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  doc.querySelector("#fill-sample").addEventListener("click", () => {
    amountInput.value = "149.00";
    noteInput.value = "Groceries";
    nameInput.value = "Sample Store";
    vpaInput.value = "samplemerchant@upi";
    codeInput.value = "";
    showError(formError, "");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    showError(formError, "");
    const button = doc.querySelector("#create-payment");
    button.disabled = true;
    try {
      const payment = await createMobilePayment({
        amount: amountInput.value,
        note: noteInput.value,
        payeeName: nameInput.value,
        payeeVpa: vpaInput.value,
        merchantCode: codeInput.value,
      });
      render(payment);
    } catch (error) {
      showError(
        formError,
        error instanceof InputError ? error.message : "Could not create the payment request.",
      );
    } finally {
      button.disabled = false;
    }
  });
}

if (typeof document !== "undefined") {
  mountCheckout(document);
}
