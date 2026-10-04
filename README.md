# Pay with Google Pay or PhonePe

A small checkout for India that creates a [UPI](https://www.npci.org.in/) payment request. The same request opens in Google Pay or PhonePe, and it is also encoded as a QR code either app can scan.

The app does not collect a UPI PIN, and it does not log into anyone's Google Pay or PhonePe account. The customer approves the transfer inside the official app.

## Run

```bash
npm install
npm start
```

Open http://localhost:3000, enter the amount and your merchant UPI ID, then create the payment request.

Copy `.env.example` to `.env` if you want a default payee:

```bash
MERCHANT_VPA=yourshop@okhdfcbank
MERCHANT_NAME=Your Shop Name
```

## What the buttons do

Google Pay and PhonePe are opened with the NPCI `upi://pay` parameters (`pa`, `pn`, `tr`, `tn`, `am`, `cu=INR`). On Android the link targets the official app package:

- Google Pay: `com.google.android.apps.nbu.paisa.user`
- PhonePe: `com.phonepe.app`

On a computer, scan the QR with either phone app. A real transfer only happens after the customer approves it in that app, and only if the payee UPI ID is a real merchant or person.

This page cannot see the bank result of a plain UPI intent. Treat the order as awaiting payment unless a payment gateway reports it.

## PhonePe hosted checkout

PhonePe Payment Gateway can collect the payment on PhonePe's checkout page and report `COMPLETED` or `FAILED`. Create a PhonePe Business account, then set the sandbox or production keys from Developer Settings:

```bash
PHONEPE_ENV=sandbox
PHONEPE_CLIENT_ID=
PHONEPE_CLIENT_SECRET=
PHONEPE_CLIENT_VERSION=
PHONEPE_MERCHANT_ID=
PUBLIC_BASE_URL=https://your-public-host
```

`PUBLIC_BASE_URL` must be an address PhonePe can redirect the customer back to. Without these values, Google Pay and PhonePe still open through UPI intent and QR.

## Tests

```bash
npm test
```
