package app.astral.feature.home

import android.annotation.SuppressLint
import android.graphics.Color
import android.net.Uri
import android.webkit.ConsoleMessage
import android.webkit.CookieManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.compose.BackHandler
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.viewinterop.AndroidView
import app.astral.core.model.UserSession
import org.json.JSONObject
import java.util.Locale

@SuppressLint("SetJavaScriptEnabled")
@Composable
fun HomeScreen(
    session: UserSession,
    webAppUrl: String,
    onLogout: () -> Unit,
) {
    val parsed = remember(webAppUrl) { Uri.parse(webAppUrl) }
    val startPath = remember(parsed) { buildStartPath(parsed) }
    val startUrl = remember(parsed) { buildStartUrl(parsed) }
    val localeTag = remember { Locale.getDefault().toLanguageTag().ifBlank { "en" } }
    val syncScript = remember(session.token, session.userId, localeTag) {
        buildSyncScript(
            token = session.token,
            userId = session.userId,
            localeTag = localeTag,
        )
    }
    val redirectScript = remember(startPath) { buildRedirectScript(startPath) }

    var webViewRef by remember { mutableStateOf<WebView?>(null) }
    var canGoBack by remember { mutableStateOf(false) }
    var loading by remember { mutableStateOf(true) }
    var hasSyncAttempt by remember(session.token, session.userId) { mutableStateOf(false) }
    var hasReachedAuthenticatedPage by remember(session.token, session.userId) { mutableStateOf(false) }
    var lastError by remember { mutableStateOf<String?>(null) }

    BackHandler(enabled = canGoBack) {
        webViewRef?.goBack()
    }

    DisposableEffect(Unit) {
        onDispose {
            webViewRef?.let { view ->
                view.stopLoading()
                view.destroy()
            }
            webViewRef = null
        }
    }

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            modifier = Modifier
                .fillMaxSize()
                .statusBarsPadding()
                .navigationBarsPadding(),
            factory = { context ->
                WebView(context).apply {
                    webViewRef = this
                    setBackgroundColor(Color.parseColor("#0B0F18"))

                    CookieManager.getInstance().setAcceptCookie(true)
                    CookieManager.getInstance().setAcceptThirdPartyCookies(this, true)

                    settings.apply {
                        javaScriptEnabled = true
                        domStorageEnabled = true
                        cacheMode = WebSettings.LOAD_DEFAULT
                        mediaPlaybackRequiresUserGesture = false
                        useWideViewPort = true
                        loadWithOverviewMode = true
                        builtInZoomControls = false
                        displayZoomControls = false
                        setSupportZoom(false)
                        userAgentString = "$userAgentString AstralNativeShell/1.3.10"
                        mixedContentMode = WebSettings.MIXED_CONTENT_COMPATIBILITY_MODE
                    }

                    webChromeClient = object : WebChromeClient() {
                        override fun onConsoleMessage(consoleMessage: ConsoleMessage): Boolean {
                            return super.onConsoleMessage(consoleMessage)
                        }
                    }
                    webViewClient = object : WebViewClient() {
                        override fun shouldOverrideUrlLoading(
                            view: WebView,
                            request: WebResourceRequest,
                        ): Boolean {
                            return false
                        }

                        override fun onPageStarted(view: WebView, url: String?, favicon: android.graphics.Bitmap?) {
                            super.onPageStarted(view, url, favicon)
                            loading = true
                            canGoBack = view.canGoBack()
                        }

                        override fun onReceivedError(
                            view: WebView,
                            request: WebResourceRequest,
                            error: WebResourceError,
                        ) {
                            super.onReceivedError(view, request, error)
                            if (request.isForMainFrame) {
                                lastError = error.description?.toString()
                                loading = false
                            }
                        }

                        override fun onPageFinished(view: WebView, url: String?) {
                            super.onPageFinished(view, url)
                            canGoBack = view.canGoBack()
                            val currentPath = Uri.parse(url ?: startUrl).path.orEmpty()

                            if (hasReachedAuthenticatedPage && (currentPath.startsWith("/login") || currentPath.startsWith("/auth"))) {
                                readStoredToken(view) { token ->
                                    if (token.isEmpty()) {
                                        loading = false
                                        onLogout()
                                        return@readStoredToken
                                    }
                                    loading = false
                                }
                                return
                            }

                            view.evaluateJavascript(syncScript) { raw ->
                                val result = normalizeJsString(raw)
                                when (result) {
                                    "sync-required" -> {
                                        hasSyncAttempt = true
                                        loading = true
                                        view.evaluateJavascript(redirectScript, null)
                                    }
                                    "ready" -> {
                                        if (
                                            currentPath.isBlank() ||
                                            currentPath == "/" ||
                                            currentPath.startsWith("/login") ||
                                            currentPath.startsWith("/auth")
                                        ) {
                                            loading = true
                                            view.evaluateJavascript(redirectScript, null)
                                        } else {
                                            hasReachedAuthenticatedPage = true
                                            lastError = null
                                            loading = false
                                        }
                                    }
                                    else -> {
                                        if (!hasSyncAttempt) {
                                            hasSyncAttempt = true
                                            loading = true
                                            view.reload()
                                        } else {
                                            lastError = result.ifBlank { "WebView bootstrap failed" }
                                            loading = false
                                        }
                                    }
                                }
                            }
                        }
                    }

                    loadUrl(startUrl)
                }
            },
            update = { view ->
                webViewRef = view
            },
        )

        if (loading) {
            CircularProgressIndicator(modifier = Modifier.align(Alignment.Center))
        }
    }
}

private fun buildStartUrl(uri: Uri): String {
    val scheme = uri.scheme ?: "https"
    val host = uri.host ?: "astraof.com"
    val portPart = if (uri.port == -1) "" else ":${uri.port}"
    return "$scheme://$host$portPart${buildStartPath(uri)}"
}

private fun buildStartPath(uri: Uri): String {
    val path = uri.encodedPath?.takeIf { it.isNotBlank() } ?: "/channels/@me"
    val query = uri.encodedQuery?.let { "?$it" }.orEmpty()
    val fragment = uri.encodedFragment?.let { "#$it" }.orEmpty()
    return "$path$query$fragment"
}

private fun buildSyncScript(
    token: String,
    userId: String,
    localeTag: String,
): String {
    val tokenLiteral = JSONObject.quote(token)
    val userIdLiteral = JSONObject.quote(userId)
    val localeLiteral = JSONObject.quote(localeTag)

    return """
        (function () {
            try {
                var desiredToken = $tokenLiteral;
                var desiredUserId = $userIdLiteral;
                var desiredLocale = $localeLiteral;
                var currentToken = localStorage.getItem('token') || '';
                var currentUserId = localStorage.getItem('userId') || '';
                if (currentToken !== desiredToken || currentUserId !== desiredUserId) {
                    localStorage.setItem('token', desiredToken);
                    localStorage.setItem('userId', desiredUserId);
                    if (!localStorage.getItem('locale')) {
                        localStorage.setItem('locale', desiredLocale);
                    }
                    return 'sync-required';
                }
                if (!localStorage.getItem('locale')) {
                    localStorage.setItem('locale', desiredLocale);
                }
                return 'ready';
            } catch (error) {
                return String(error && error.message ? error.message : error);
            }
        })();
    """.trimIndent()
}

private fun buildRedirectScript(startPath: String): String {
    val startPathLiteral = JSONObject.quote(startPath)
    return """
        (function () {
            window.location.replace($startPathLiteral);
        })();
    """.trimIndent()
}

private fun normalizeJsString(raw: String?): String {
    if (raw == null) return ""
    return raw
        .removePrefix("\"")
        .removeSuffix("\"")
        .replace("\\n", "\n")
        .replace("\\\"", "\"")
        .trim()
}

private fun readStoredToken(webView: WebView, onResult: (String) -> Unit) {
    val script = "(function(){try{return localStorage.getItem('token') || '';}catch(e){return '';}})();"
    webView.evaluateJavascript(script) { raw ->
        onResult(normalizeJsString(raw))
    }
}
