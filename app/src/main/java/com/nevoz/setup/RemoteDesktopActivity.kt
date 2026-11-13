package com.nevoz.setup

import android.app.Activity
import android.os.Bundle
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import android.net.Uri
import android.widget.FrameLayout
import android.widget.TextView

class RemoteDesktopActivity : Activity() {
    private var webView: WebView? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val target = intent.getStringExtra("remote_url") ?: run {
            finish()
            return
        }
        val targetUri = Uri.parse(target)
        val expectedHost = Uri.parse(BuildConfig.API_BASE_URL).host
        if (targetUri.scheme != "https" || targetUri.host.isNullOrBlank() || targetUri.host != expectedHost) {
            finish()
            return
        }

        val frame = FrameLayout(this).apply { setBackgroundColor(android.graphics.Color.BLACK) }
        val view = WebView(this).apply {
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.loadsImagesAutomatically = true
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.mixedContentMode = android.webkit.WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.javaScriptCanOpenWindowsAutomatically = false
            webChromeClient = WebChromeClient()
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                    return request.url.host != expectedHost || request.url.scheme != "https"
                }
            }
            setBackgroundColor(android.graphics.Color.BLACK)
        }
        frame.addView(view, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT))
        setContentView(frame)
        webView = view
        view.loadUrl(target)
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        val view = webView
        if (view?.canGoBack() == true) view.goBack() else super.onBackPressed()
    }

    override fun onDestroy() {
        webView?.apply {
            stopLoading()
            loadUrl("about:blank")
            clearHistory()
            removeAllViews()
            destroy()
        }
        webView = null
        super.onDestroy()
    }
}
