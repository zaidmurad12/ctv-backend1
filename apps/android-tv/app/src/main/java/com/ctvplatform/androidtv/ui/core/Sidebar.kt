package com.ctvplatform.androidtv.ui.core

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.ctvplatform.androidtv.ui.theme.CtvBackground

/**
 * Persistent left nav rail — mirrors rn-tv-design-kit's theme.ts spacing.sidebarWidth (s(88))
 * and spacing.contentStart (s(104)): screens padding their content to s(104) leave exactly a
 * s(16) gap past this rail's own s(88) width, so nothing sits flush against it.
 */
enum class SidebarDestination { HOME, SEARCH, SETTINGS }

@Composable
fun Sidebar(
    current: SidebarDestination,
    onHomeClick: () -> Unit,
    onSearchClick: () -> Unit,
    onSettingsClick: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxHeight()
            .width(s(88))
            .background(CtvBackground),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        SidebarIcon(Icons.Filled.Home, "الرئيسية", current == SidebarDestination.HOME, onHomeClick)
        SidebarIcon(Icons.Filled.Search, "بحث", current == SidebarDestination.SEARCH, onSearchClick, topPadding = s(24))
        SidebarIcon(Icons.Filled.Settings, "الإعدادات", current == SidebarDestination.SETTINGS, onSettingsClick, topPadding = s(24))
    }
}

@Composable
private fun SidebarIcon(
    icon: ImageVector,
    contentDescription: String,
    selected: Boolean,
    onClick: () -> Unit,
    topPadding: Dp = 0.dp,
) {
    Focusable(onClick = onClick, modifier = Modifier.padding(top = topPadding)) { focused ->
        val active = focused || selected
        Box(
            modifier = Modifier
                .focusGlow(focused, tight = true, shape = CircleShape)
                .background(if (active) Color.White else Color.White.copy(alpha = 0.08f), CircleShape)
                .padding(s(12)),
        ) {
            Icon(icon, contentDescription = contentDescription, tint = if (active) Color.Black else Color.White)
        }
    }
}
