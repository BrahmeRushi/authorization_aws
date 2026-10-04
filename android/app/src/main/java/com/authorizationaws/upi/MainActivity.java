package com.authorizationaws.upi;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.widget.Toast;

import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private static final String GOOGLE_PAY = "com.google.android.apps.nbu.paisa.user";
    private static final String PHONEPE = "com.phonepe.app";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WebView webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);

        WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        webView.setWebViewClient(new android.webkit.WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });
        webView.addJavascriptInterface(new UpiBridge(), "UpiAndroid");
        webView.loadUrl("https://appassets.androidplatform.net/assets/www/mobile.html");
    }

    private final class UpiBridge {
        @JavascriptInterface
        public void launch(String target, String url) {
            runOnUiThread(() -> openUpiApp(target, url));
        }
    }

    private void openUpiApp(String target, String url) {
        if (url == null || !url.startsWith("upi://pay?")) {
            Toast.makeText(this, "This payment link is not a UPI request.", Toast.LENGTH_LONG).show();
            return;
        }
        Intent pay = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        if ("googlePay".equals(target)) {
            pay.setPackage(GOOGLE_PAY);
        } else if ("phonePe".equals(target)) {
            pay.setPackage(PHONEPE);
        }
        try {
            if ("any".equals(target)) {
                startActivity(Intent.createChooser(pay, "Pay with UPI"));
            } else {
                startActivity(pay);
            }
        } catch (ActivityNotFoundException error) {
            String name = "phonePe".equals(target) ? "PhonePe" : "googlePay".equals(target) ? "Google Pay" : "a UPI app";
            Toast.makeText(this, "Install " + name + " to approve this payment.", Toast.LENGTH_LONG).show();
        }
    }
}
