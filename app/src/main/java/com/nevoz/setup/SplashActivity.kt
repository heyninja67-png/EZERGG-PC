package com.nevoz.setup

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.content.Intent
import android.graphics.Color
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.Gravity
import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat

class SplashActivity : AppCompatActivity() {
    private val handler = Handler(Looper.getMainLooper())

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(4, 5, 17)
        window.navigationBarColor = Color.rgb(4, 5, 17)

        val root = FrameLayout(this)
        val bg = ImageView(this).apply {
            setImageResource(R.drawable.nevoz_wallpaper)
            scaleType = ImageView.ScaleType.CENTER_CROP
        }
        root.addView(bg, FrameLayout.LayoutParams(-1, -1))
        root.addView(View(this).apply {
            setBackgroundColor(Color.argb(118, 0, 0, 18))
        }, FrameLayout.LayoutParams(-1, -1))

        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(32, 30, 32, 30)
        }

        val logo = ImageView(this).apply {
            setImageResource(R.drawable.nevoz_logo)
            scaleType = ImageView.ScaleType.FIT_CENTER
            alpha = 0f
            scaleX = .72f
            scaleY = .72f
            contentDescription = "NEVOZ SETUP"
        }
        content.addView(logo, LinearLayout.LayoutParams(286, 286))

        val ring = ProgressBar(this, null, android.R.attr.progressBarStyle).apply {
            indeterminateTintList = ContextCompat.getColorStateList(this@SplashActivity, R.color.nevoz_cyan)
        }
        val ringParams = LinearLayout.LayoutParams(46, 46)
        ringParams.topMargin = 12
        content.addView(ring, ringParams)

        val tagline = TextView(this).apply {
            text = "SEU PC VIRTUAL. SEMPRE COM VOCÊ."
            textSize = 11f
            letterSpacing = .14f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(220, 224, 255))
            alpha = 0f
        }
        val taglineParams = LinearLayout.LayoutParams(-1, -2)
        taglineParams.topMargin = 8
        content.addView(tagline, taglineParams)

        val progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progress = 0
            progressTintList = ContextCompat.getColorStateList(this@SplashActivity, R.color.nevoz_cyan)
            progressBackgroundTintList = ContextCompat.getColorStateList(this@SplashActivity, R.color.nevoz_track)
        }
        val progressParams = LinearLayout.LayoutParams(-1, 7)
        progressParams.topMargin = 34
        content.addView(progress, progressParams)

        val status = TextView(this).apply {
            text = "INICIANDO O NEVOZ SETUP..."
            textSize = 10f
            letterSpacing = .11f
            gravity = Gravity.CENTER
            setTextColor(Color.rgb(160, 173, 226))
            alpha = 0f
        }
        val statusParams = LinearLayout.LayoutParams(-1, -2)
        statusParams.topMargin = 14
        content.addView(status, statusParams)

        root.addView(content, FrameLayout.LayoutParams(-1, -1))
        setContentView(root)

        AnimatorSet().apply {
            playTogether(
                ObjectAnimator.ofFloat(logo, View.ALPHA, 0f, 1f),
                ObjectAnimator.ofFloat(logo, View.SCALE_X, .72f, 1f),
                ObjectAnimator.ofFloat(logo, View.SCALE_Y, .72f, 1f),
                ObjectAnimator.ofFloat(tagline, View.ALPHA, 0f, 1f)
            )
            duration = 850
            interpolator = AccelerateDecelerateInterpolator()
            start()
        }
        ObjectAnimator.ofFloat(logo, View.TRANSLATION_Y, 0f, -7f, 0f).apply {
            duration = 1800
            repeatCount = ValueAnimator.INFINITE
            repeatMode = ValueAnimator.REVERSE
            startDelay = 850
            start()
        }
        ObjectAnimator.ofFloat(ring, View.ROTATION, 0f, 360f).apply {
            duration = 1150
            repeatCount = ValueAnimator.INFINITE
            interpolator = android.view.animation.LinearInterpolator()
            start()
        }
        ObjectAnimator.ofFloat(status, View.ALPHA, 0f, 1f).apply {
            duration = 450
            startDelay = 650
            start()
        }
        ValueAnimator.ofInt(0, 100).apply {
            duration = 2300
            interpolator = AccelerateDecelerateInterpolator()
            addUpdateListener {
                progress.progress = it.animatedValue as Int
                status.text = when (progress.progress) {
                    in 0..25 -> "CARREGANDO ELEMENTOS VISUAIS..."
                    in 26..55 -> "PREPARANDO SEU PAINEL..."
                    in 56..85 -> "RESTAURANDO SEUS PERFIS SALVOS..."
                    else -> "TUDO PRONTO!"
                }
            }
            start()
        }
        handler.postDelayed({
            startActivity(Intent(this, MainActivity::class.java))
            overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
            finish()
        }, 2600)
    }

    override fun onDestroy() {
        handler.removeCallbacksAndMessages(null)
        super.onDestroy()
    }
}
