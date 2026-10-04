package com.authorizationaws.upi;

import org.junit.Test;

import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertThrows;

public class UpiRequestTest {
    @Test
    public void buildsThePaymentGooglePayAndPhonePeOpen() {
        String url = UpiRequest.payUrl(
                "samplemerchant@upi",
                "Sample Store",
                UpiRequest.normalizeAmount("149"),
                "Groceries",
                "TORDER123");
        assertEquals(
                "upi://pay?pa=samplemerchant%40upi&pn=Sample%20Store&tr=TORDER123&tn=Groceries&am=149.00&cu=INR&mode=04",
                url);
        assertEquals("Google Pay", UpiRequest.appName(UpiRequest.GOOGLE_PAY));
        assertEquals("PhonePe", UpiRequest.appName(UpiRequest.PHONEPE));
    }

    @Test
    public void rejectsAmountsBelowOneRupee() {
        IllegalArgumentException error = assertThrows(
                IllegalArgumentException.class,
                () -> UpiRequest.normalizeAmount("0"));
        assertEquals("Minimum amount is ₹1.00.", error.getMessage());
    }

    @Test
    public void readsTheResultReturnedByTheUpiApp() {
        Map<String, String> fields = UpiRequest.parseResponse(
                "txnId=YB123&responseCode=00&Status=SUCCESS&txnRef=TORDER123&ApprovalRefNo=REF9");
        assertEquals("Paid", UpiRequest.statusLabel(fields));
        assertEquals("Paid\nTransaction YB123\nApproval REF9", UpiRequest.responseSummary(
                "txnId=YB123&responseCode=00&Status=SUCCESS&txnRef=TORDER123&ApprovalRefNo=REF9"));
        assertEquals("Failed", UpiRequest.statusLabel(UpiRequest.parseResponse("Status=FAILURE")));
    }
}
