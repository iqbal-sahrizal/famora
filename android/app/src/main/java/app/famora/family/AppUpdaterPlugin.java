package app.famora.family;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    @PluginMethod
    public void getAppVersion(PluginCall call) {
        try {
            PackageManager pm = getContext().getPackageManager();
            PackageInfo info = pm.getPackageInfo(getContext().getPackageName(), 0);
            long versionCode = PackageInfoCompat.getLongVersionCode(info);
            String versionName = info.versionName != null ? info.versionName : "1.0.0";

            JSObject ret = new JSObject();
            ret.put("versionCode", versionCode);
            ret.put("versionName", versionName);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Unable to read installed app version.", e);
        }
    }

    @PluginMethod
    public void openDownloadUrl(PluginCall call) {
        String urlString = call.getString("url");
        if (urlString == null || !urlString.startsWith("https://")) {
            call.reject("APK download URL must use HTTPS.");
            return;
        }
        try {
            Intent browserIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(urlString));
            browserIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(browserIntent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Unable to open download URL in browser.", e);
        }
    }
}
