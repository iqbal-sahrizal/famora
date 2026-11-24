package app.famora.family;

import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.StatFs;
import android.provider.Settings;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {
    private static final ExecutorService DOWNLOAD_EXECUTOR = Executors.newSingleThreadExecutor();
    private static final AtomicBoolean DOWNLOAD_IN_PROGRESS = new AtomicBoolean(false);

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
    public void canRequestPackageInstalls(PluginCall call) {
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            granted = getContext().getPackageManager().canRequestPackageInstalls();
        }
        JSObject ret = new JSObject();
        ret.put("granted", granted);
        call.resolve(ret);
    }

    @PluginMethod
    public void openUnknownSourcesSettings(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName())
            );
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
        }
        call.resolve();
    }

    @PluginMethod
    public void downloadAndVerifyApk(PluginCall call) {
        String urlString = call.getString("url");
        String expectedSha256 = call.getString("sha256");
        Integer versionCode = call.getInt("versionCode", 0);

        if (urlString == null || !urlString.startsWith("https://")) {
            call.reject("APK download URL must use HTTPS.");
            return;
        }
        if (expectedSha256 == null || !expectedSha256.trim().matches("^[a-fA-F0-9]{64}$")) {
            call.reject("Invalid expected SHA-256 checksum.");
            return;
        }
        if (!DOWNLOAD_IN_PROGRESS.compareAndSet(false, true)) {
            call.reject("An APK download is already in progress.");
            return;
        }

        DOWNLOAD_EXECUTOR.execute(() -> {
            HttpURLConnection conn = null;
            File tempFile = null;
            try {
                File updatesDir = new File(getContext().getCacheDir(), "updates");
                if (!updatesDir.exists() && !updatesDir.mkdirs()) {
                    throw new IllegalStateException("Could not create updates cache directory.");
                }

                // Clean up older APK files in cache
                File[] existingFiles = updatesDir.listFiles();
                if (existingFiles != null) {
                    for (File existing : existingFiles) {
                        if (existing.isFile() && !existing.getName().endsWith(versionCode + ".apk")) {
                            //noinspection ResultOfMethodCallIgnored
                            existing.delete();
                        }
                    }
                }

                File targetFile = new File(updatesDir, "senvamily-" + versionCode + ".apk");
                if (targetFile.exists() && expectedSha256.equalsIgnoreCase(computeSha256(targetFile))) {
                    JSObject ret = new JSObject();
                    ret.put("filePath", targetFile.getAbsolutePath());
                    ret.put("sha256", expectedSha256.toLowerCase(Locale.US));
                    ret.put("fileSize", targetFile.length());
                    call.resolve(ret);
                    return;
                }

                URL url = URI.create(urlString).toURL();
                conn = (HttpURLConnection) url.openConnection();
                conn.setRequestMethod("GET");
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(30000);
                conn.setInstanceFollowRedirects(true);
                conn.connect();

                int status = conn.getResponseCode();
                if (status < 200 || status >= 300) {
                    throw new IllegalStateException("APK download failed with HTTP " + status);
                }

                long totalBytes = conn.getContentLengthLong();
                StatFs statFs = new StatFs(updatesDir.getAbsolutePath());
                long availableBytes = statFs.getAvailableBytes();
                if (totalBytes > 0 && availableBytes < totalBytes + (10 * 1024 * 1024L)) {
                    throw new IllegalStateException("Insufficient storage space to download update.");
                }

                tempFile = new File(updatesDir, "senvamily-" + versionCode + ".apk.part");
                long downloadedBytes = 0;
                int lastReportedProgress = -1;

                try (
                    InputStream input = new BufferedInputStream(conn.getInputStream());
                    FileOutputStream output = new FileOutputStream(tempFile, false)
                ) {
                    byte[] buffer = new byte[16384];
                    int read;
                    while ((read = input.read(buffer)) != -1) {
                        output.write(buffer, 0, read);
                        downloadedBytes += read;
                        if (totalBytes > 0) {
                            int progress = (int) Math.min(100, (downloadedBytes * 100L) / totalBytes);
                            if (progress != lastReportedProgress && (progress % 5 == 0 || progress == 100)) {
                                lastReportedProgress = progress;
                                JSObject evt = new JSObject();
                                evt.put("progress", progress);
                                evt.put("downloadedBytes", downloadedBytes);
                                evt.put("totalBytes", totalBytes);
                                notifyListeners("downloadProgress", evt);
                            }
                        }
                    }
                    output.flush();
                }

                String actualSha256 = computeSha256(tempFile);
                if (!expectedSha256.equalsIgnoreCase(actualSha256)) {
                    //noinspection ResultOfMethodCallIgnored
                    tempFile.delete();
                    throw new SecurityException("APK SHA-256 verification failed.");
                }

                if (targetFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    targetFile.delete();
                }
                if (!tempFile.renameTo(targetFile)) {
                    throw new IllegalStateException("Failed to finalize verified APK file.");
                }

                JSObject ret = new JSObject();
                ret.put("filePath", targetFile.getAbsolutePath());
                ret.put("sha256", actualSha256);
                ret.put("fileSize", targetFile.length());
                call.resolve(ret);
            } catch (Exception e) {
                if (tempFile != null && tempFile.exists()) {
                    //noinspection ResultOfMethodCallIgnored
                    tempFile.delete();
                }
                call.reject(e.getMessage() != null ? e.getMessage() : "APK download failed.", e);
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
                DOWNLOAD_IN_PROGRESS.set(false);
            }
        });
    }

    @PluginMethod
    public void installApk(PluginCall call) {
        String filePath = call.getString("filePath");
        if (filePath == null || filePath.trim().isEmpty()) {
            call.reject("Missing APK file path.");
            return;
        }

        File apkFile = new File(filePath);
        if (!apkFile.exists() || !apkFile.isFile()) {
            call.reject("Verified APK file does not exist.");
            return;
        }

        try {
            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                apkFile
            );

            Intent installIntent = new Intent(Intent.ACTION_VIEW);
            installIntent.setDataAndType(contentUri, "application/vnd.android.package-archive");
            installIntent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            installIntent.putExtra(Intent.EXTRA_RETURN_RESULT, true);

            startActivityForResult(call, installIntent, "handleInstallResult");
        } catch (Exception e) {
            call.reject("Unable to launch Android package installer.", e);
        }
    }

    @ActivityCallback
    private void handleInstallResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        if (result.getResultCode() == Activity.RESULT_OK) {
            ret.put("status", "completed");
        } else if (result.getResultCode() == Activity.RESULT_CANCELED) {
            ret.put("status", "cancelled");
        } else {
            ret.put("status", "launched");
        }
        call.resolve(ret);
    }

    private static String computeSha256(File file) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA-256");
        try (InputStream fis = new BufferedInputStream(new FileInputStream(file))) {
            byte[] buffer = new byte[16384];
            int read;
            while ((read = fis.read(buffer)) != -1) {
                digest.update(buffer, 0, read);
            }
        }
        byte[] hash = digest.digest();
        StringBuilder hex = new StringBuilder(hash.length * 2);
        for (byte b : hash) {
            hex.append(String.format(Locale.US, "%02x", b & 0xff));
        }
        return hex.toString();
    }
}
