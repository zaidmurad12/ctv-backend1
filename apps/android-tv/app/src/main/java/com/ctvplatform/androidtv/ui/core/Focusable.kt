package com.ctvplatform.androidtv.ui.core

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.layout.Box
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.semantics.Role

/**
 * Kotlin/Compose equivalent of rn-tv-design-kit's core/Focusable.tsx: every card/button in the
 * app scales in with a spring on focus instead of snapping instantly. Only `scale` is animated
 * (GPU-composited via graphicsLayer under the hood), never width/height/border - see
 * focusGlow() for the white glow that also only applies while focused.
 *
 * `.clickable()` already activates on D-pad CENTER/Enter for a focusable component (Compose
 * Foundation's own TV support), so no manual key handling is needed here - unlike the RN kit's
 * Focusable.tsx, which had to wire Pressable's onPress itself.
 */
@Composable
fun Focusable(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    scaleTo: Float = 1.06f,
    onFocusChange: (Boolean) -> Unit = {},
    content: @Composable (focused: Boolean) -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val scale by animateFloatAsState(
        targetValue = if (focused) scaleTo else 1f,
        animationSpec = spring(dampingRatio = Spring.DampingRatioMediumBouncy, stiffness = Spring.StiffnessMedium),
        label = "focusableScale",
    )

    Box(
        modifier = modifier
            .scale(scale)
            .onFocusChanged {
                focused = it.isFocused
                onFocusChange(it.isFocused)
            }
            .focusable()
            .clickable(role = Role.Button, onClick = onClick),
    ) {
        content(focused)
    }
}
