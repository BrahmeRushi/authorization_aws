package com.authorizationaws.upi;

import java.net.URLDecoder;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Map;

public final class UpiRequest {
    public static final String GOOGLE_PAY = "com.google.android.apps.nbu.paisa.user";
    public static final String PHONEPE = "com.phonepe.app";

    private UpiRequest() {}

    public static String normalizeAmount(String raw) {
        String value = raw == null ? "" : raw.trim().replace(",", "");
        if (!value.matches("\\d+(\\.\\d{1,2})?")) {
            throw new IllegalArgumentException("Enter an amount in rupees, such as 149 or 149.50.");
        }
        String[] parts = value.split("\\.", -1);
        if (parts[0].length() > 6) {
            throw new IllegalArgumentException("Amount cannot exceed ₹1,00,000.00.");
        }
        String fraction = parts.length == 2 ? (parts[1] + "00").substring(0, 2) : "00";
        String amount = Integer.parseInt(parts[0]) + "." + fraction;
        int paisa = Integer.parseInt(parts[0]) * 100 + Integer.parseInt(fraction);
        if (paisa < 100) {
            throw new IllegalArgumentException("Minimum amount is ₹1.00.");
        }
        if (paisa > 10_000_000) {
            throw new IllegalArgumentException("Amount cannot exceed ₹1,00,000.00.");
        }
        return amount;
    }

    public static void checkPayee(String name, String vpa, String note) {
        String payee = name == null ? "" : name.trim().replaceAll("\\s+", " ");
        String upiId = vpa == null ? "" : vpa.trim();
        String memo = note == null ? "" : note.trim().replaceAll("\\s+", " ");
        if (!payee.matches("[\\p{L}\\p{N}][\\p{L}\\p{N} .'-]{1,49}")) {
            throw new IllegalArgumentException("Enter the payee name using 2 to 50 letters or numbers.");
        }
        if (!upiId.matches("[a-zA-Z0-9][a-zA-Z0-9.\\-_]{1,255}@[a-zA-Z][a-zA-Z0-9]{1,63}")) {
            throw new IllegalArgumentException("Enter a UPI ID such as shopname@okhdfcbank.");
        }
        if (!memo.matches("[\\p{L}\\p{N} .,:#'&()/_\\-]{0,80}")) {
            throw new IllegalArgumentException("Keep the note to 80 letters, numbers, or simple punctuation.");
        }
    }

    public static String payUrl(String vpa, String name, String amount, String note, String transactionRef) {
        StringBuilder url = new StringBuilder("upi://pay?");
        append(url, "pa", vpa.trim());
        append(url, "pn", name.trim().replaceAll("\\s+", " "));
        append(url, "tr", transactionRef);
        String memo = note == null ? "" : note.trim().replaceAll("\\s+", " ");
        if (!memo.isEmpty()) {
            append(url, "tn", memo);
        }
        append(url, "am", amount);
        append(url, "cu", "INR");
        append(url, "mode", "04");
        return url.toString();
    }

    public static Map<String, String> parseResponse(String response) {
        Map<String, String> fields = new LinkedHashMap<>();
        if (response == null || response.isBlank()) {
            return fields;
        }
        String query = response;
        int question = query.indexOf('?');
        if (question >= 0) {
            query = query.substring(question + 1);
        }
        for (String part : query.split("&")) {
            int equals = part.indexOf('=');
            if (equals <= 0) {
                continue;
            }
            String key = decode(part.substring(0, equals));
            String value = decode(part.substring(equals + 1));
            fields.put(key, value);
        }
        return fields;
    }

    public static String statusLabel(Map<String, String> fields) {
        String status = value(fields, "Status");
        if (status == null) {
            return "No payment result";
        }
        if ("SUCCESS".equalsIgnoreCase(status)) {
            return "Paid";
        }
        if ("SUBMITTED".equalsIgnoreCase(status)) {
            return "Submitted";
        }
        if ("FAILURE".equalsIgnoreCase(status) || "FAILED".equalsIgnoreCase(status)) {
            return "Failed";
        }
        return status;
    }

    private static String value(Map<String, String> fields, String name) {
        for (Map.Entry<String, String> entry : fields.entrySet()) {
            if (entry.getKey().equalsIgnoreCase(name) && entry.getValue() != null && !entry.getValue().isBlank()) {
                return entry.getValue();
            }
        }
        return null;
    }

    public static String appName(String packageName) {
        if (PHONEPE.equals(packageName)) {
            return "PhonePe";
        }
        if (GOOGLE_PAY.equals(packageName)) {
            return "Google Pay";
        }
        return "a UPI app";
    }

    private static void append(StringBuilder url, String key, String value) {
        if (url.charAt(url.length() - 1) != '?') {
            url.append('&');
        }
        url.append(encode(key)).append('=').append(encode(value));
    }

    private static String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    public static String responseSummary(String raw) {
        Map<String, String> fields = parseResponse(raw);
        String label = statusLabel(fields);
        String txn = value(fields, "txnId");
        String approval = value(fields, "ApprovalRefNo");
        StringBuilder summary = new StringBuilder(label);
        if (txn != null) {
            summary.append("\nTransaction ").append(txn);
        }
        if (approval != null) {
            summary.append("\nApproval ").append(approval);
        }
        return summary.toString();
    }
}
