package com.ctvplatform.androidtv.ui.core

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.TextUnit
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * Mirrors rn-tv-design-kit's core/scale.ts: real Android TV boxes report wildly different
 * logical window sizes for the same physical 1080p panel depending on OEM density bucket, and
 * no single automatic formula got every device right - so this stays a manual, user-adjustable
 * multiplier (wired to SettingsScreen's "UI Size" list) instead of guessing.
 */
const val DEFAULT_UI_SCALE = 0.9f
val UI_SCALE_OPTIONS = listOf(0.5f, 0.6f, 0.7f, 0.8f, 0.9f, 1.0f, 1.1f, 1.2f)

private const val PREFS_NAME = "ui_settings"
private const val KEY_UI_SCALE = "ui_scale"

private fun readPref(context: Context): Float =
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getFloat(KEY_UI_SCALE, DEFAULT_UI_SCALE)

private fun writePref(context: Context, value: Float) {
    context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
        .edit()
        .putFloat(KEY_UI_SCALE, value)
        .apply()
}

/**
 * Process-wide store backing LocalUiScale, initialized once from CtvApplication.onCreate.
 *
 * Unlike the RN kit's s()/fs() - which bake their multiplier into a StyleSheet built once at
 * module-import time, so a changed scale needs React.lazy + a full app relaunch to take effect -
 * `scale` here is Compose state read live inside every composable that calls s()/fs() (via
 * LocalUiScale, provided from this store's value). Calling setScale() updates both the
 * persisted pref and this state, so every screen currently on screen recomposes with the new
 * scale immediately. Do not reintroduce a restart-gate "to match the docs": that caveat is
 * specific to RN's static StyleSheet timing and does not apply here.
 */
object UiScaleStore {
    var scale by mutableFloatStateOf(DEFAULT_UI_SCALE)
        private set

    fun init(context: Context) {
        scale = readPref(context.applicationContext)
    }

    fun setScale(context: Context, value: Float) {
        scale = value
        writePref(context.applicationContext, value)
    }
}

val LocalUiScale = compositionLocalOf { DEFAULT_UI_SCALE }

@Composable
fun s(size: Int): Dp = (size * LocalUiScale.current).dp

@Composable
fun fs(size: Int): TextUnit = (size * LocalUiScale.current).sp
