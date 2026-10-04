const VPA_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}$/;
const NAME_PATTERN = /^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N} .'-]{1,49}$/u;
const NOTE_PATTERN = /^[\p{L}\p{M}\p{N} .,:'#&()/_-]{0,80}$/u;

export const GOOGLE_PAY_PACKAGE = "com.google.android.apps.nbu.paisa.user";
export const PHONEPE_PACKAGE = "com.phonepe.app";

const MIN_PAISA = 100;
const MAX_PAISA = 10_000_000;

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.name = "InputError";
    this.statusCode = 400;
  }
}

export function normalizeAmount(input) {
  const raw = String(input ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new InputError("Enter an amount in rupees, such as 149 or 149.50.");
  }
  const [rupees, fraction = ""] = raw.split(".");
  if (rupees.length > 6) {
    throw new InputError("Amount cannot exceed ₹1,00,000.00.");
  }
  const amount = `${Number(rupees)}.${`${fraction}00`.slice(0, 2)}`;
  const paisa = rupeesToPaisa(amount);
  if (paisa < MIN_PAISA) {
    throw new InputError("Minimum amount is ₹1.00.");
  }
  if (paisa > MAX_PAISA) {
    throw new InputError("Amount cannot exceed ₹1,00,000.00.");
  }
  return { amount, paisa };
}

export function rupeesToPaisa(amount) {
  const [rupees, fraction] = amount.split(".");
  return Number(rupees) * 100 + Number(fraction);
}

export function assertPayeeVpa(vpa) {
  const value = String(vpa ?? "").trim();
  if (!VPA_PATTERN.test(value)) {
    throw new InputError("Enter a UPI ID such as shopname@okhdfcbank.");
  }
  return value;
}

export function assertPayeeName(name) {
  const value = String(name ?? "").trim().replace(/\s+/g, " ");
  if (!NAME_PATTERN.test(value)) {
    throw new InputError("Enter the payee name using 2 to 50 letters or numbers.");
  }
  return value;
}

export function assertNote(note) {
  const value = String(note ?? "").trim().replace(/\s+/g, " ");
  if (!NOTE_PATTERN.test(value)) {
    throw new InputError("Keep the note to 80 letters, numbers, or simple punctuation.");
  }
  return value;
}

export function assertMerchantCode(code) {
  const value = String(code ?? "").trim();
  if (value === "") return "";
  if (!/^\d{4}$/.test(value)) {
    throw new InputError("Merchant category code must be 4 digits.");
  }
  return value;
}

function encodeQuery(params) {
  return Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && String(value) !== "")
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

export function buildUpiQuery(payment, mode) {
  return encodeQuery({
    pa: payment.payeeVpa,
    pn: payment.payeeName,
    mc: payment.merchantCode,
    tr: payment.transactionRef,
    tn: payment.note,
    am: payment.amount,
    cu: "INR",
    mode,
  });
}

export function androidUpiIntent(query, packageName) {
  return `intent://pay?${query}#Intent;scheme=upi;package=${packageName};end`;
}

export function buildPaymentLinks(payment) {
  const intentQuery = buildUpiQuery(payment, "04");
  const qrQuery = buildUpiQuery(payment, "01");
  const generic = `upi://pay?${intentQuery}`;
  return {
    generic,
    qr: `upi://pay?${qrQuery}`,
    googlePay: {
      android: androidUpiIntent(intentQuery, GOOGLE_PAY_PACKAGE),
      ios: `gpay://upi/pay?${intentQuery}`,
    },
    phonePe: {
      android: androidUpiIntent(intentQuery, PHONEPE_PACKAGE),
      ios: `phonepe://pay?${intentQuery}`,
    },
  };
}
