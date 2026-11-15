package pl.mealplanner.app;

import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Color;
import android.view.Window;
import java.io.InputStream;

public class MainActivity extends Activity {
    private WebView webView;
    private static final String APP_HOST = "appassets.androidplatform.net";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#F6F5F0"));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && APP_HOST.equalsIgnoreCase(uri.getHost())) {
                    String path = uri.getPath();
                    if (path == null || path.equals("/") || path.isEmpty()) {
                        path = "/index.html";
                    }
                    String assetPath = "www" + path;
                    String mimeType = "text/html";
                    if (path.endsWith(".js")) {
                        mimeType = "application/javascript";
                    } else if (path.endsWith(".css")) {
                        mimeType = "text/css";
                    } else if (path.endsWith(".json")) {
                        mimeType = "application/json";
                    } else if (path.endsWith(".svg")) {
                        mimeType = "image/svg+xml";
                    }
                    try {
                        InputStream stream = getAssets().open(assetPath);
                        return new WebResourceResponse(mimeType, "UTF-8", stream);
                    } catch (Exception e) {
                        return new WebResourceResponse(
                            "application/json",
                            "UTF-8",
                            404,
                            "Not Found",
                            null,
                            new java.io.ByteArrayInputStream("{\"error\":\"offline\"}".getBytes())
                        );
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }
        });

        webView.loadUrl("https://" + APP_HOST + "/index.html");
        setContentView(webView);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
