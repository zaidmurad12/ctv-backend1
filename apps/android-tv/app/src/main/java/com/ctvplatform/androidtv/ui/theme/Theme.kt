package com.ctvplatform.androidtv.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.darkColorScheme
import com.ctvplatform.androidtv.ui.core.LocalUiScale
import com.ctvplatform.androidtv.ui.core.UiScaleStore

private val CtvColorScheme = darkColorScheme(
    primary = CtvPrimary,
    onPrimary = CtvOnPrimary,
    secondary = CtvSecondary,
    background = CtvBackground,
    onBackground = CtvOnSurface,
    surface = CtvSurface,
    onSurface = CtvOnSurface,
    onSurfaceVariant = CtvOnSurfaceMuted,
    surfaceVariant = CtvSurfaceGlass,
    border = CtvBorder,
    error = CtvError,
)

@Composable
fun CtvPlatformTheme(content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalUiScale provides UiScaleStore.scale) {
        MaterialTheme(
            colorScheme = CtvColorScheme,
            typography = CtvTypography,
            content = content,
        )
    }
}
