package com.authorizationaws.upi;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.widget.EditText;
import android.widget.TextView;

import androidx.activity.ComponentActivity;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;

import java.security.SecureRandom;

public class MainActivity extends ComponentActivity {
    private ActivityResultLauncher<Intent> paymentLauncher;
    private EditText amountView;
    private EditText noteView;
    private EditText nameView;
    private EditText vpaView;
    private TextView statusView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        amountView = findViewById(R.id.amount);
        noteView = findViewById(R.id.note);
        nameView = findViewById(R.id.payee_name);
        vpaView = findViewById(R.id.payee_vpa);
        statusView = findViewById(R.id.status);
        paymentLauncher = registerForActivityResult(
                new ActivityResultContracts.StartActivityForResult(),
                this::onPaymentResult);
        findViewById(R.id.fill_sample).setOnClickListener(view -> fillSample());
        findViewById(R.id.pay_gpay).setOnClickListener(view -> pay(UpiRequest.GOOGLE_PAY));
        findViewById(R.id.pay_phonepe).setOnClickListener(view -> pay(UpiRequest.PHONEPE));
    }

    private void fillSample() {
        amountView.setText("149.00");
        noteView.setText("Groceries");
        nameView.setText("Sample Store");
        vpaView.setText("samplemerchant@upi");
        statusView.setText("Sample details are filled. Choose Google Pay or PhonePe.");
    }

    private void pay(String packageName) {
        try {
            String amount = UpiRequest.normalizeAmount(text(amountView));
            String note = text(noteView);
            String name = text(nameView);
            String vpa = text(vpaView);
            UpiRequest.checkPayee(name, vpa, note);
            String url = UpiRequest.payUrl(vpa, name, amount, note, transactionRef());
            if (!url.startsWith("upi://pay?")) {
                statusView.setText("This payment link is not a UPI request.");
                return;
            }
            Intent pay = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            pay.setPackage(packageName);
            if (pay.resolveActivity(getPackageManager()) == null) {
                statusView.setText("Install " + UpiRequest.appName(packageName) + " to approve this payment.");
                return;
            }
            statusView.setText("Opening " + UpiRequest.appName(packageName) + "…");
            paymentLauncher.launch(pay);
        } catch (IllegalArgumentException error) {
            statusView.setText(error.getMessage());
        } catch (ActivityNotFoundException error) {
            statusView.setText("Install " + UpiRequest.appName(packageName) + " to approve this payment.");
        }
    }

    private void onPaymentResult(androidx.activity.result.ActivityResult result) {
        Intent data = result.getData();
        String raw = null;
        if (data != null) {
            raw = data.getStringExtra("response");
            if ((raw == null || raw.isBlank()) && data.getData() != null) {
                raw = data.getData().toString();
            }
        }
        if (raw == null || raw.isBlank()) {
            statusView.setText("Google Pay or PhonePe closed before sending a payment result.");
            return;
        }
        statusView.setText(UpiRequest.responseSummary(raw));
    }

    private static String text(EditText field) {
        return field.getText() == null ? "" : field.getText().toString();
    }

    private static String transactionRef() {
        String time = Long.toString(System.currentTimeMillis(), 36).toUpperCase();
        String suffix = Integer.toString(new SecureRandom().nextInt(36 * 36 * 36 * 36), 36).toUpperCase();
        return ("T" + time + suffix).replaceAll("[^A-Z0-9]", "");
    }
}
