package com.ctvplatform.androidtv.ui.core

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Mirrors rn-tv-design-kit's theme.ts focusShadow/focusShadowTight: a white glow (never
 * Android's own always-black `elevation` renderer, which draws a dark blob under non-white
 * surfaces when combined with a colored shadow) around the focused element. Colored shadows via
 * ambientColor/spotColor are supported since API 28, which matches this app's minSdk.
 */
fun Modifier.focusGlow(focused: Boolean, tight: Boolean = false, shape: RoundedCornerShape = RoundedCornerShape(8.dp)): Modifier {
    if (!focused) return this
    val elevation: Dp = if (tight) 5.dp else 14.dp
    return this.shadow(
        elevation = elevation,
        shape = shape,
        ambientColor = Color.White,
        spotColor = Color.White,
    )
}

/** Mirrors theme.ts's cardShadow: a real black drop-shadow, not a focus glow - always on, not focus-gated. */
fun Modifier.cardDropShadow(shape: RoundedCornerShape = RoundedCornerShape(8.dp)): Modifier =
    this.shadow(elevation = 6.dp, shape = shape, ambientColor = Color.Black, spotColor = Color.Black)
