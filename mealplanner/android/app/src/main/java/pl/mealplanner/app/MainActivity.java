package pl.mealplanner.app;

import android.app.Activity;
import android.os.Bundle;
import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.graphics.Color;
import android.view.Window;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * Google Play Compliant MainActivity hosting the MealPlanner Hybrid WebView.
 * - Disables arbitrary file:// and content:// access (assets served strictly via HTTPS virtual host).
 * - Prevents directory traversal when resolving bundled assets/www/* resources.
 * - Pauses/resumes WebView timers across Activity lifecycle to conserve battery & CPU.
 * - Bridges Android system back navigation to in-app modal/tab history before exiting.
 */
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
        // Security hardening: disable direct file:// and content:// URI access
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setLoadWithOverviewMode(true);
        settings.setUseWideViewPort(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setSupportZoom(true);
        settings.setBuiltInZoomControls(true);
        settings.setDisplayZoomControls(false);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && APP_HOST.equalsIgnoreCase(uri.getHost())) {
                    String path = uri.getPath();
                    if (path == null || path.equals("/") || path.isEmpty()) {
                        path = "/index.html";
                    }
                    // Guard against path traversal
                    if (path.contains("..")) {
                        return createNotFoundResponse();
                    }
                    String cleanPath = path.startsWith("/") ? path.substring(1) : path;
                    String assetPath = "www/" + cleanPath;
                    String mimeType = resolveMimeType(cleanPath);
                    try {
                        InputStream stream = getAssets().open(assetPath);
                        Map<String, String> headers = new HashMap<>();
                        headers.put("X-Content-Type-Options", "nosniff");
                        headers.put("Cache-Control", "no-cache");
                        return new WebResourceResponse(mimeType, "UTF-8", 200, "OK", headers, stream);
                    } catch (Exception e) {
                        return createNotFoundResponse();
                    }
                }
                return super.shouldInterceptRequest(view, request);
            }
        });

        webView.loadUrl("https://" + APP_HOST + "/index.html");
        setContentView(webView);
    }

    private static String resolveMimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".js") || lower.endsWith(".mjs")) return "application/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".ico")) return "image/x-icon";
        if (lower.endsWith(".woff2")) return "font/woff2";
        return "text/html";
    }

    private static WebResourceResponse createNotFoundResponse() {
        return new WebResourceResponse(
            "application/json",
            "UTF-8",
            404,
            "Not Found",
            null,
            new java.io.ByteArrayInputStream("{\"error\":\"offline\"}".getBytes())
        );
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.onResume();
            webView.resumeTimers();
        }
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.stopLoading();
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        if (webView != null) {
            webView.evaluateJavascript(
                "(function() { return typeof window.__handleAndroidBack === 'function' ? Boolean(window.__handleAndroidBack()) : false; })()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if ("true".equalsIgnoreCase(value)) {
                            return;
                        }
                        if (webView != null && webView.canGoBack()) {
                            webView.goBack();
                        } else {
                            MainActivity.super.onBackPressed();
                        }
                    }
                }
            );
        } else {
            super.onBackPressed();
        }
    }
}
