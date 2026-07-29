package app.astral

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.ActivityNotFoundException
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.View
import android.view.ViewGroup
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.PermissionRequest
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import android.widget.FrameLayout
import org.json.JSONObject

class MainActivity : ComponentActivity() {
    private lateinit var rootView: FrameLayout
    private lateinit var webView: WebView
    private var pendingPermissionRequest: PermissionRequest? = null
    private var filePathCallback: ValueCallback<Array<Uri>>? = null
    private var proximityWakeLock: PowerManager.WakeLock? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult(),
    ) { result ->
        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        filePathCallback?.onReceiveValue(if (result.resultCode == Activity.RESULT_OK) uris else null)
        filePathCallback = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        WindowCompat.setDecorFitsSystemWindows(window, false)
        window.statusBarColor = Color.TRANSPARENT
        window.navigationBarColor = Color.TRANSPARENT
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.isStatusBarContrastEnforced = false
            window.isNavigationBarContrastEnforced = false
        }
        WindowCompat.getInsetsController(window, window.decorView).apply {
            isAppearanceLightStatusBars = false
            isAppearanceLightNavigationBars = false
        }
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        CookieManager.getInstance().setAcceptCookie(true)

        webView = WebView(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.rgb(9, 10, 16))
            setLayerType(View.LAYER_TYPE_HARDWARE, null)
            isHapticFeedbackEnabled = false
            isHorizontalScrollBarEnabled = false
            isVerticalScrollBarEnabled = false
            overScrollMode = View.OVER_SCROLL_NEVER
            isScrollbarFadingEnabled = true
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_BOUND, true)
            }
            addJavascriptInterface(AstralNativeBridge(), "AstralAndroidNative")
            settings.apply {
                javaScriptEnabled = true
                domStorageEnabled = true
                databaseEnabled = true
                mediaPlaybackRequiresUserGesture = false
                cacheMode = WebSettings.LOAD_DEFAULT
                mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
                setSupportZoom(false)
                builtInZoomControls = false
                displayZoomControls = false
                textZoom = 100
                loadsImagesAutomatically = true
                blockNetworkImage = false
                setNeedInitialFocus(false)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    offscreenPreRaster = true
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    isAlgorithmicDarkeningAllowed = false
                }
                userAgentString = "$userAgentString AstralAndroid/${BuildConfig.VERSION_NAME}"
            }
            CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)
            webViewClient = AstralWebViewClient()
            webChromeClient = AstralWebChromeClient()
        }

        rootView = FrameLayout(this).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.rgb(9, 10, 16))
            addView(webView)
        }

        ViewCompat.setOnApplyWindowInsetsListener(rootView) { view, insets ->
            val systemBars = insets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout(),
            )
            view.setPadding(0, systemBars.top, 0, systemBars.bottom)
            insets
        }

        setContentView(rootView)
        ViewCompat.requestApplyInsets(rootView)
        AstralNotificationChannels.ensure(this)
        requestInitialNotificationPermission()

        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                dispatchBackToWebApp()
            }
        })

        webView.loadUrl(ASTRAL_START_URL)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val url = intent.data ?: return
        if (::webView.isInitialized && (url.scheme == "https" || url.scheme == "http") && isAstralHost(url.host)) {
            webView.loadUrl(url.toString())
        }
    }

    override fun onDestroy() {
        pendingPermissionRequest?.deny()
        pendingPermissionRequest = null
        if (::webView.isInitialized) {
            webView.destroy()
        }
        setProximityEnabled(false)
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != MEDIA_PERMISSION_REQUEST_CODE) return

        val request = pendingPermissionRequest ?: return
        pendingPermissionRequest = null
        if (grantResults.all { it == PackageManager.PERMISSION_GRANTED }) {
            request.grant(request.resources)
        } else {
            request.deny()
        }
    }

    private fun dispatchBackToWebApp() {
        val script = """
            (function() {
              var event = new Event('astral:native-back', {cancelable: true});
              return window.dispatchEvent(event);
            })();
        """.trimIndent()

        webView.evaluateJavascript(script) { result ->
            if (result == "false") return@evaluateJavascript
            if (webView.canGoBack()) {
                webView.goBack()
            } else {
                moveTaskToBack(true)
            }
        }
    }

    private fun requestMediaPermissions(request: PermissionRequest) {
        val permissions = mutableListOf<String>()
        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE in request.resources) {
            permissions += Manifest.permission.RECORD_AUDIO
        }
        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE in request.resources) {
            permissions += Manifest.permission.CAMERA
        }

        val missing = permissions.filter {
            ContextCompat.checkSelfPermission(this, it) != PackageManager.PERMISSION_GRANTED
        }
        if (missing.isEmpty()) {
            request.grant(request.resources)
            return
        }

        pendingPermissionRequest?.deny()
        pendingPermissionRequest = request
        ActivityCompat.requestPermissions(this, missing.toTypedArray(), MEDIA_PERMISSION_REQUEST_CODE)
    }

    private inner class AstralWebViewClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (url.scheme == "https" && isAstralHost(url.host)) return false
            if (url.scheme == "http" && isAstralHost(url.host)) return false
            if (shouldOpenInlineInWebView(url)) return false

            try {
                startActivity(Intent(Intent.ACTION_VIEW, url))
            } catch (_: ActivityNotFoundException) {
                return false
            }
            return true
        }

        override fun onPageFinished(view: WebView, url: String) {
            super.onPageFinished(view, url)
            applyAndroidWebViewLayoutFix(view)
            view.postDelayed({ applyAndroidWebViewLayoutFix(view) }, 250)
        }
    }

    private inner class AstralWebChromeClient : WebChromeClient() {
        override fun onPermissionRequest(request: PermissionRequest) {
            runOnUiThread { requestMediaPermissions(request) }
        }

        override fun onShowFileChooser(
            webView: WebView,
            filePathCallback: ValueCallback<Array<Uri>>,
            fileChooserParams: FileChooserParams,
        ): Boolean {
            this@MainActivity.filePathCallback?.onReceiveValue(null)
            this@MainActivity.filePathCallback = filePathCallback
            return try {
                fileChooserLauncher.launch(createFileChooserIntent(fileChooserParams))
                true
            } catch (_: ActivityNotFoundException) {
                this@MainActivity.filePathCallback = null
                filePathCallback.onReceiveValue(null)
                false
            }
        }
    }

    private inner class AstralNativeBridge {
        @JavascriptInterface
        fun getAppInfo(): String {
            return JSONObject()
                .put("packageName", packageName)
                .put("versionName", BuildConfig.VERSION_NAME)
                .put("versionCode", BuildConfig.VERSION_CODE)
                .put("nativePushConfigured", false)
                .toString()
        }

        @JavascriptInterface
        fun getPermissionStatuses(): String {
            return JSONObject()
                .put("camera", permissionStatus(Manifest.permission.CAMERA))
                .put("microphone", permissionStatus(Manifest.permission.RECORD_AUDIO))
                .put(
                    "notifications",
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        permissionStatus(Manifest.permission.POST_NOTIFICATIONS)
                    } else {
                        "granted"
                    },
                )
                .put(
                    "bluetooth",
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                        permissionStatus(Manifest.permission.BLUETOOTH_CONNECT)
                    } else {
                        "unsupported"
                    },
                )
                .toString()
        }

        @JavascriptInterface
        fun requestPermission(permission: String?): String {
            val manifestPermission = when (permission) {
                "camera" -> Manifest.permission.CAMERA
                "microphone" -> Manifest.permission.RECORD_AUDIO
                "notifications" ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) Manifest.permission.POST_NOTIFICATIONS else null
                "bluetooth" ->
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) Manifest.permission.BLUETOOTH_CONNECT else null
                else -> null
            } ?: return if (permission == "notifications") "granted" else "unsupported"

            if (ContextCompat.checkSelfPermission(this@MainActivity, manifestPermission) == PackageManager.PERMISSION_GRANTED) {
                return "granted"
            }
            runOnUiThread {
                ActivityCompat.requestPermissions(
                    this@MainActivity,
                    arrayOf(manifestPermission),
                    BRIDGE_PERMISSION_REQUEST_CODE,
                )
            }
            return "denied"
        }

        @JavascriptInterface
        fun openAppSettings() {
            runOnUiThread {
                startActivity(
                    Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                        data = Uri.parse("package:$packageName")
                    },
                )
            }
        }

        @JavascriptInterface
        fun getNotificationSettings(): String = readNotificationSettings().toString()

        @JavascriptInterface
        fun updateNotificationSettings(rawSettings: String?): String {
            val updates = runCatching { JSONObject(rawSettings.orEmpty()) }.getOrNull() ?: JSONObject()
            val preferences = getSharedPreferences(NOTIFICATION_PREFERENCES, Context.MODE_PRIVATE)
            val editor = preferences.edit()
            for (key in NOTIFICATION_SETTING_KEYS) {
                if (updates.has(key)) {
                    editor.putBoolean(key, updates.optBoolean(key, DEFAULT_NOTIFICATION_SETTINGS.getValue(key)))
                }
            }
            editor.apply()
            return readNotificationSettings().toString()
        }

        @JavascriptInterface
        fun areNotificationsEnabled(): Boolean =
            NotificationManagerCompat.from(this@MainActivity).areNotificationsEnabled()

        @JavascriptInterface
        fun openAppNotificationSettings() {
            runOnUiThread {
                startActivity(
                    Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).apply {
                        putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                    },
                )
            }
        }

        @JavascriptInterface
        fun openChannelNotificationSettings(_channelId: String?) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
                openAppNotificationSettings()
                return
            }
            runOnUiThread {
                startActivity(
                    Intent(Settings.ACTION_CHANNEL_NOTIFICATION_SETTINGS).apply {
                        putExtra(Settings.EXTRA_APP_PACKAGE, packageName)
                        putExtra(Settings.EXTRA_CHANNEL_ID, AstralNotificationChannels.CHANNEL_ID)
                    },
                )
            }
        }

        @JavascriptInterface
        fun vibrate(pattern: String?) {
            runOnUiThread {
                vibratePattern(pattern)
            }
        }

        @JavascriptInterface
        fun showNotification(title: String?, body: String?, url: String?, tag: String?, isCall: Boolean) {
            runOnUiThread {
                showNativeNotification(title, body, url, tag, isCall)
            }
        }

        @JavascriptInterface
        fun cancelNotification(tag: String?) {
            runOnUiThread {
                getSystemService(NotificationManager::class.java).cancel(AstralNotificationChannels.NOTIFICATION_ID)
            }
        }

        @JavascriptInterface
        fun setProximityEnabled(enabled: Boolean) {
            runOnUiThread {
                this@MainActivity.setProximityEnabled(enabled)
            }
        }
    }

    private companion object {
        private const val ASTRAL_START_URL = "https://astraof.com/channels/@me"
        private const val MEDIA_PERMISSION_REQUEST_CODE = 410
        private const val BRIDGE_PERMISSION_REQUEST_CODE = 412
        private const val NOTIFICATION_PREFERENCES = "astral_notification_settings"
        private val INLINE_MEDIA_EXTENSIONS = setOf(
            "apng",
            "avif",
            "bmp",
            "gif",
            "heic",
            "heif",
            "jpeg",
            "jpg",
            "m4a",
            "m4v",
            "mp3",
            "mp4",
            "ogg",
            "opus",
            "pdf",
            "png",
            "svg",
            "wav",
            "webm",
            "webp",
        )
        private val FILE_CHOOSER_MIME_TYPES = arrayOf(
            "image/*",
            "video/*",
            "audio/*",
            "application/pdf",
            "text/*",
            "application/zip",
            "application/json",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "application/vnd.ms-excel",
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "application/vnd.ms-powerpoint",
            "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "application/octet-stream",
        )
        private val DEFAULT_NOTIFICATION_SETTINGS = linkedMapOf(
            "messageSound" to true,
            "messageVibrate" to true,
            "messageHeadsUp" to true,
            "mentionSound" to true,
            "mentionVibrate" to true,
            "mentionHeadsUp" to true,
            "callSound" to true,
            "callVibrate" to true,
            "callFullscreen" to true,
            "systemSound" to true,
            "systemVibrate" to false,
            "showOnLockscreen" to true,
            "quickActions" to true,
        )
        private val NOTIFICATION_SETTING_KEYS = DEFAULT_NOTIFICATION_SETTINGS.keys
        private val ANDROID_WEBVIEW_LAYOUT_FIX_SCRIPT = """
            (function() {
              var root = document.documentElement;
              if (!root) return;

              root.classList.add('platform-android-webview-shell');
              root.classList.add('android-fast-mode');
              root.classList.add('mobile-lite');
              root.setAttribute('data-android-fast-mode', 'true');
              window.__ASTRAL_ANDROID_FAST_MODE__ = true;

              [
                '--safe-area-top',
                '--safe-area-right',
                '--safe-area-bottom',
                '--safe-area-left',
                '--native-safe-area-top',
                '--native-safe-area-right',
                '--native-safe-area-bottom',
                '--native-safe-area-left',
                '--android-statusbar-fallback-top',
                '--android-virtual-frame-top',
                '--android-virtual-frame-side',
                '--android-virtual-frame-bottom'
              ].forEach(function(name) {
                root.style.setProperty(name, '0px', 'important');
              });

              root.style.setProperty('--mobile-bottom-nav-height', '60px', 'important');

              var styleId = 'astral-android-webview-layout-fix';
              if (!document.getElementById(styleId)) {
                var style = document.createElement('style');
                style.id = styleId;
                style.textContent = [
                  'html.platform-android-webview-shell {',
                  '  --safe-area-top: 0px !important;',
                  '  --safe-area-right: 0px !important;',
                  '  --safe-area-bottom: 0px !important;',
                  '  --safe-area-left: 0px !important;',
                  '  --mobile-bottom-nav-height: 60px !important;',
                  '}',
                  'html.platform-android-webview-shell .safe-area-top { padding-top: 0 !important; }',
                  'html.platform-android-webview-shell .safe-area-bottom { padding-bottom: 0 !important; }',
                  'html.platform-android-webview-shell .safe-area-left { padding-left: 0 !important; }',
                  'html.platform-android-webview-shell .safe-area-right { padding-right: 0 !important; }'
                ].join('\n');
                document.head.appendChild(style);
              }

              if (window.AstralAndroidNative && !window.__astralAndroidVibratePatched) {
                var nativeVibrate = window.AstralAndroidNative.vibrate.bind(window.AstralAndroidNative);
                window.__astralAndroidVibratePatched = true;
                navigator.vibrate = function(pattern) {
                  try {
                    nativeVibrate(Array.isArray(pattern) ? pattern.join(',') : String(pattern || 0));
                    return true;
                  } catch (error) {
                    return false;
                  }
                };
              }

              if (window.AstralAndroidNative && !window.__astralAndroidNotificationPatched) {
                window.__astralAndroidNotificationPatched = true;
                var nativeNotify = window.AstralAndroidNative.showNotification.bind(window.AstralAndroidNative);
                var NativeNotification = function(title, options) {
                  options = options || {};
                  var body = options.body || '';
                  var tag = options.tag || '';
                  var dataUrl = '';
                  try {
                    dataUrl = (options.data && options.data.url) || options.url || location.href;
                  } catch (error) {
                    dataUrl = location.href;
                  }
                  var isCall = /call|voice|звон|вызов/i.test(String(title || '') + ' ' + String(body || '') + ' ' + String(tag || ''));
                  nativeNotify(String(title || 'Astral'), String(body || ''), String(dataUrl || ''), String(tag || ''), Boolean(isCall));
                  this.title = title || 'Astral';
                  this.body = body;
                  this.tag = tag;
                  setTimeout(function() {
                    if (typeof this.onshow === 'function') this.onshow();
                  }.bind(this), 0);
                };
                NativeNotification.permission = window.AstralAndroidNative.areNotificationsEnabled() ? 'granted' : 'denied';
                NativeNotification.requestPermission = function(callback) {
                  var permission = window.AstralAndroidNative.requestPermission('notifications');
                  NativeNotification.permission = permission === 'granted' ? 'granted' : 'denied';
                  if (typeof callback === 'function') callback(NativeNotification.permission);
                  return Promise.resolve(NativeNotification.permission);
                };
                NativeNotification.prototype.close = function() {};
                window.Notification = NativeNotification;
              }

              if (window.AstralAndroidNative && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && !window.__astralAndroidProximityPatched) {
                window.__astralAndroidProximityPatched = true;
                var setProximity = window.AstralAndroidNative.setProximityEnabled.bind(window.AstralAndroidNative);
                var originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
                navigator.mediaDevices.getUserMedia = function(constraints) {
                  return originalGetUserMedia(constraints).then(function(stream) {
                    var usesAudio = Boolean(constraints && constraints.audio);
                    if (usesAudio) {
                      setProximity(true);
                      try {
                        stream.getAudioTracks().forEach(function(track) {
                          track.addEventListener('ended', function() {
                            setTimeout(function() { setProximity(false); }, 500);
                          });
                        });
                      } catch (error) {}
                    }
                    return stream;
                  });
                };
                window.addEventListener('beforeunload', function() { setProximity(false); });
              }
            })();
        """.trimIndent()

        private fun isAstralHost(host: String?): Boolean {
            return host == "astraof.com" || host?.endsWith(".astraof.com") == true
        }

        private fun applyAndroidWebViewLayoutFix(view: WebView) {
            view.evaluateJavascript(ANDROID_WEBVIEW_LAYOUT_FIX_SCRIPT, null)
        }
    }

    private fun permissionStatus(permission: String): String {
        return if (ContextCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) {
            "granted"
        } else {
            "denied"
        }
    }

    private fun readNotificationSettings(): JSONObject {
        val preferences = getSharedPreferences(NOTIFICATION_PREFERENCES, Context.MODE_PRIVATE)
        return JSONObject().apply {
            for ((key, defaultValue) in DEFAULT_NOTIFICATION_SETTINGS) {
                put(key, preferences.getBoolean(key, defaultValue))
            }
        }
    }

    private fun createFileChooserIntent(fileChooserParams: WebChromeClient.FileChooserParams): Intent {
        val acceptedTypes = fileChooserParams.acceptTypes
            ?.map { it.trim() }
            ?.filter { it.isNotEmpty() && it != "." }
            ?.takeIf { it.isNotEmpty() }
            ?.toTypedArray()
            ?: FILE_CHOOSER_MIME_TYPES
        return Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = if (acceptedTypes.size == 1) acceptedTypes.first() else "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, acceptedTypes)
            putExtra(Intent.EXTRA_ALLOW_MULTIPLE, fileChooserParams.mode == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE)
        }
    }

    private fun requestInitialNotificationPermission() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) return
        if (ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return
        ActivityCompat.requestPermissions(
            this,
            arrayOf(Manifest.permission.POST_NOTIFICATIONS),
            BRIDGE_PERMISSION_REQUEST_CODE,
        )
    }

    private fun shouldOpenInlineInWebView(uri: Uri): Boolean {
        val scheme = uri.scheme?.lowercase()
        if (scheme == "blob" || scheme == "data" || scheme == "file" || scheme == "content") return true
        if (scheme != "https" && scheme != "http") return false
        val extension = uri.lastPathSegment
            ?.substringAfterLast('.', missingDelimiterValue = "")
            ?.lowercase()
            .orEmpty()
        return extension in INLINE_MEDIA_EXTENSIONS
    }

    private fun showNativeNotification(title: String?, body: String?, url: String?, tag: String?, isCall: Boolean) {
        AstralNotificationChannels.ensure(this)
        val preferences = getSharedPreferences(NOTIFICATION_PREFERENCES, Context.MODE_PRIVATE)
        val soundEnabled = preferences.getBoolean(
            if (isCall) "callSound" else "messageSound",
            true,
        )
        val vibrateEnabled = preferences.getBoolean(
            if (isCall) "callVibrate" else "messageVibrate",
            true,
        )
        val notification = AstralNotificationChannels.userNotification(
            this,
            title.orEmpty().ifBlank { "Astral" },
            body,
            url,
            tag,
            isCall,
            soundEnabled,
            vibrateEnabled,
        )
        val manager = getSystemService(NotificationManager::class.java)
        manager.notify(AstralNotificationChannels.NOTIFICATION_ID, notification)
    }

    @SuppressLint("WakelockTimeout")
    private fun setProximityEnabled(enabled: Boolean) {
        val powerManager = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (!powerManager.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return

        val wakeLock = proximityWakeLock ?: powerManager.newWakeLock(
            PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
            "Astral:VoiceProximity",
        ).also {
            proximityWakeLock = it
        }

        if (enabled && !wakeLock.isHeld) {
            wakeLock.acquire()
            return
        }
        if (!enabled && wakeLock.isHeld) {
            wakeLock.release()
        }
    }

    private fun vibratePattern(rawPattern: String?) {
        val pattern = rawPattern
            ?.split(',')
            ?.mapNotNull { it.trim().toLongOrNull() }
            ?.map { it.coerceIn(0L, 500L) }
            ?.filter { it > 0L }
            ?.take(8)
            .orEmpty()
        if (pattern.isEmpty()) return

        val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val manager = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
            manager.defaultVibrator
        } else {
            @Suppress("DEPRECATION")
            getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
        }

        if (!vibrator.hasVibrator()) return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val effect = if (pattern.size == 1) {
                VibrationEffect.createOneShot(pattern.first(), VibrationEffect.DEFAULT_AMPLITUDE)
            } else {
                VibrationEffect.createWaveform(longArrayOf(0L) + pattern.toLongArray(), -1)
            }
            vibrator.vibrate(effect)
        } else {
            @Suppress("DEPRECATION")
            if (pattern.size == 1) {
                vibrator.vibrate(pattern.first())
            } else {
                vibrator.vibrate(longArrayOf(0L) + pattern.toLongArray(), -1)
            }
        }
    }
}
