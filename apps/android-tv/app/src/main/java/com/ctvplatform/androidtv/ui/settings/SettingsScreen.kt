package com.ctvplatform.androidtv.ui.settings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.ctvplatform.androidtv.ui.core.Focusable
import com.ctvplatform.androidtv.ui.core.UI_SCALE_OPTIONS
import com.ctvplatform.androidtv.ui.core.UiScaleStore
import com.ctvplatform.androidtv.ui.core.focusGlow
import com.ctvplatform.androidtv.ui.core.s
import com.ctvplatform.androidtv.ui.theme.CtvBackground

/**
 * Wires rn-tv-design-kit's UI_SCALE_OPTIONS to a picker. Unlike the RN kit (which needs the app
 * relaunched to re-scale already-imported screens - see core/scale.ts), UiScaleStore.setScale
 * updates a live Compose CompositionLocal, so every s()/fs() call on screen recomposes with the
 * new value immediately - no restart needed.
 */
@Composable
fun SettingsScreen() {
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(CtvBackground)
            .padding(s(40)),
    ) {
        Text(
            text = "حجم الواجهة",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onSurface,
        )
        Text(
            text = "يُطبَّق فورًا دون الحاجة لإعادة تشغيل التطبيق",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.padding(top = s(4), bottom = s(20)),
        )
        Row(horizontalArrangement = Arrangement.spacedBy(s(12))) {
            UI_SCALE_OPTIONS.forEach { option ->
                val selected = UiScaleStore.scale == option
                Focusable(onClick = { UiScaleStore.setScale(context, option) }) { focused ->
                    androidx.compose.foundation.layout.Box(
                        modifier = Modifier
                            .focusGlow(focused, shape = RoundedCornerShape(999.dp))
                            .background(
                                when {
                                    selected -> MaterialTheme.colorScheme.primary
                                    focused -> Color.White
                                    else -> Color.White.copy(alpha = 0.08f)
                                },
                                RoundedCornerShape(999.dp),
                            )
                            .padding(horizontal = s(20), vertical = s(10)),
                    ) {
                        Text(
                            text = "${(option * 100).toInt()}%",
                            style = MaterialTheme.typography.labelLarge,
                            color = if (focused && !selected) Color.Black else Color.White,
                        )
                    }
                }
            }
        }
    }
}
