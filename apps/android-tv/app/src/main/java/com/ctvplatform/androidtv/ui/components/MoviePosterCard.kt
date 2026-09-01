package com.ctvplatform.androidtv.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil.compose.AsyncImage
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import com.ctvplatform.androidtv.ui.core.Focusable
import com.ctvplatform.androidtv.ui.core.focusGlow
import com.ctvplatform.androidtv.ui.core.fs
import com.ctvplatform.androidtv.ui.core.s
import com.ctvplatform.androidtv.ui.theme.CtvBorder
import com.ctvplatform.androidtv.ui.theme.CtvSurface

/** Kotlin/Compose port of rn-tv-design-kit's examples/MovieCard.tsx onto this app's own poster shape/data. */
@Composable
fun MoviePosterCard(
    title: String,
    posterUrl: String?,
    modifier: Modifier = Modifier,
    onClick: () -> Unit = {},
) {
    val posterShape = RoundedCornerShape(s(8))

    Focusable(onClick = onClick, modifier = modifier.width(s(128))) { focused ->
        Column {
            AsyncImage(
                model = posterUrl,
                contentDescription = title,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(2f / 3f)
                    .focusGlow(focused, tight = true, shape = posterShape)
                    .clip(posterShape)
                    .background(CtvSurface)
                    .border(2.dp, if (focused) Color.White else CtvBorder, posterShape),
            )
            Text(
                text = title,
                style = MaterialTheme.typography.labelLarge.copy(fontSize = fs(13)),
                color = if (focused) Color.White else MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = s(8)),
            )
        }
    }
}
