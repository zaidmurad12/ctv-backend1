package com.ctvplatform.androidtv.ui.core

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Backspace
import androidx.compose.material.icons.filled.Language
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.ctvplatform.androidtv.ui.theme.CtvBorderLight

private val AR_ROWS = listOf("ضصثقفغعهخحجد", "شسيبلاتنمكط", "ئءؤرلاىةوزظ")
private val EN_ROWS = listOf("qwertyuiop", "asdfghjkl", "zxcvbnm")
private const val NUMBER_ROW = "1234567890"
private const val SYMBOL_ROW = ".,-_@'"

private enum class KeyboardLang { AR, EN }

/**
 * Kotlin/Compose port of rn-tv-design-kit's examples/VirtualKeyboard.tsx: a real in-app D-pad-
 * navigable keyboard (Arabic 101 layout + English QWERTY, lowercase only - the backend's own
 * search match is already case-insensitive) so both languages are always reachable from the
 * remote regardless of the OS keyboard's default. Icons substituted for Compose Material icons
 * (Icons.Filled.Language / Backspace) since the RN kit's lucide-react-native pack doesn't exist
 * on this platform.
 */
@Composable
fun VirtualKeyboard(
    onKey: (String) -> Unit,
    onBackspace: () -> Unit,
    onSpace: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var kbLang by remember { mutableStateOf(KeyboardLang.AR) }
    val letterRows = if (kbLang == KeyboardLang.AR) AR_ROWS else EN_ROWS

    Row(
        modifier = modifier
            .background(Color.White.copy(alpha = 0.03f), RoundedCornerShape(s(14)))
            .border(1.dp, CtvBorderLight, RoundedCornerShape(s(14)))
            .padding(s(12)),
        horizontalArrangement = Arrangement.spacedBy(s(12)),
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(s(8))) {
            KeyRow(keys = NUMBER_ROW.map { it.toString() }, onKey = onKey)
            letterRows.forEach { row -> KeyRow(keys = row.map { it.toString() }, onKey = onKey) }
            Row(horizontalArrangement = Arrangement.spacedBy(s(6))) {
                KeyboardKey(
                    label = if (kbLang == KeyboardLang.AR) "EN" else "AR",
                    icon = Icons.Filled.Language,
                    modifier = Modifier.weight(1f),
                    onPress = { kbLang = if (kbLang == KeyboardLang.AR) KeyboardLang.EN else KeyboardLang.AR },
                )
                KeyboardKey(
                    label = if (kbLang == KeyboardLang.AR) "مسافة" else "space",
                    modifier = Modifier.weight(3f),
                    onPress = onSpace,
                )
                KeyboardKey(label = "", icon = Icons.AutoMirrored.Filled.Backspace, modifier = Modifier.weight(1f), onPress = onBackspace)
            }
        }

        Row {
            Box(
                modifier = Modifier
                    .fillMaxHeight()
                    .width(1.dp)
                    .background(CtvBorderLight),
            )
            Column(
                modifier = Modifier
                    .width(s(50))
                    .padding(start = s(12)),
                verticalArrangement = Arrangement.spacedBy(s(8)),
            ) {
                SYMBOL_ROW.forEach { ch ->
                    KeyboardKey(label = ch.toString(), modifier = Modifier.fillMaxWidth(), onPress = { onKey(ch.toString()) })
                }
            }
        }
    }
}

@Composable
private fun KeyRow(keys: List<String>, onKey: (String) -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(s(6))) {
        keys.forEach { ch -> KeyboardKey(label = ch, modifier = Modifier.weight(1f), onPress = { onKey(ch) }) }
    }
}

@Composable
private fun KeyboardKey(
    label: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    onPress: () -> Unit,
) {
    val shape = RoundedCornerShape(s(6))
    Focusable(onClick = onPress, modifier = modifier.height(s(38))) { focused ->
        val bg = if (focused) Color.White else Color.White.copy(alpha = 0.06f)
        val border = if (focused) Color.White else CtvBorderLight
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(s(38))
                .focusGlow(focused, tight = true, shape = shape)
                .clip(shape)
                .background(bg)
                .border(1.5.dp, border, shape),
            contentAlignment = Alignment.Center,
        ) {
            if (icon != null) {
                Icon(icon, contentDescription = label, tint = if (focused) Color.Black else Color.White)
            } else {
                Text(
                    text = label,
                    color = if (focused) Color.Black else Color.White,
                    style = MaterialTheme.typography.labelLarge.copy(fontSize = fs(15)),
                )
            }
        }
    }
}
