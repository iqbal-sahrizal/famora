package app.famora.family;

import android.annotation.SuppressLint;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.WebViewListener;

public class MainActivity extends BridgeActivity {
    private boolean currentWebDarkMode = false;

    private static final String THEME_SYNC_SCRIPT =
        "(function(){" +
        "  if (!window.__famoraThemeObserverInstalled) {" +
        "    window.__famoraThemeObserverInstalled = true;" +
        "    var notify = function() {" +
        "      var isDark = document.documentElement.classList.contains('dark');" +
        "      if (window.FamoraSystemBars && window.FamoraSystemBars.sync) {" +
        "        window.FamoraSystemBars.sync(isDark);" +
        "      }" +
        "    };" +
        "    var observer = new MutationObserver(notify);" +
        "    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });" +
        "    window.addEventListener('storage', notify);" +
        "  }" +
        "  var isDark = document.documentElement.classList.contains('dark');" +
        "  if (window.FamoraSystemBars && window.FamoraSystemBars.sync) {" +
        "    window.FamoraSystemBars.sync(isDark);" +
        "  }" +
        "})();";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        View rootView = findViewById(android.R.id.content);
        if (rootView != null) {
            ViewCompat.setOnApplyWindowInsetsListener(rootView, (view, windowInsets) -> {
                Insets bars = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars()
                        | WindowInsetsCompat.Type.displayCutout()
                );
                view.setPadding(bars.left, bars.top, bars.right, bars.bottom);
                return WindowInsetsCompat.CONSUMED;
            });
            ViewCompat.requestApplyInsets(rootView);
        }

        // Famora defaults to light theme (#F7F5EF) regardless of system night mode.
        applySystemBarAppearance(currentWebDarkMode);

        if (getBridge() != null) {
            WebView webView = getBridge().getWebView();
            if (webView != null) {
                webView.addJavascriptInterface(new ThemeBridge(), "FamoraSystemBars");
            }
            getBridge().addWebViewListener(new WebViewListener() {
                @Override
                public void onPageLoaded(WebView webView) {
                    syncThemeFromWebView();
                }
            });
        }

        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null && webView.canGoBack()) {
                    webView.goBack();
                } else {
                    setEnabled(false);
                    getOnBackPressedDispatcher().onBackPressed();
                    setEnabled(true);
                }
            }
        });
    }

    @Override
    public void onResume() {
        super.onResume();
        applySystemBarAppearance(currentWebDarkMode);
        syncThemeFromWebView();
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applySystemBarAppearance(currentWebDarkMode);
        syncThemeFromWebView();
    }

    private void syncThemeFromWebView() {
        if (getBridge() == null) {
            return;
        }
        WebView webView = getBridge().getWebView();
        if (webView != null) {
            webView.post(() -> webView.evaluateJavascript(THEME_SYNC_SCRIPT, null));
        }
    }

    @SuppressWarnings("deprecation")
    private void applySystemBarAppearance(boolean isDark) {
        currentWebDarkMode = isDark;
        int canvasColor = Color.parseColor(isDark ? "#161917" : "#F7F5EF");

        getWindow().addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
        getWindow().setStatusBarColor(canvasColor);
        getWindow().setNavigationBarColor(canvasColor);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            getWindow().setStatusBarContrastEnforced(false);
            getWindow().setNavigationBarContrastEnforced(false);
        }

        View decorView = getWindow().getDecorView();
        decorView.setBackgroundColor(canvasColor);

        View rootView = findViewById(android.R.id.content);
        if (rootView != null) {
            rootView.setBackgroundColor(canvasColor);
        }

        WindowInsetsControllerCompat controller =
            WindowCompat.getInsetsController(getWindow(), decorView);
        if (controller != null) {
            controller.setAppearanceLightStatusBars(!isDark);
            controller.setAppearanceLightNavigationBars(!isDark);
        }
    }

    private final class ThemeBridge {
        @JavascriptInterface
        public void sync(boolean isDark) {
            runOnUiThread(() -> applySystemBarAppearance(isDark));
        }
    }
}
