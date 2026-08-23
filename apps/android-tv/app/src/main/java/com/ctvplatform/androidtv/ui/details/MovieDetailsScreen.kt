package com.ctvplatform.androidtv.ui.details

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.ctvplatform.androidtv.data.remote.dto.CastMemberDto
import com.ctvplatform.androidtv.data.remote.dto.MovieDetailDto
import com.ctvplatform.androidtv.ui.core.Focusable
import com.ctvplatform.androidtv.ui.core.focusGlow
import com.ctvplatform.androidtv.ui.core.fs
import com.ctvplatform.androidtv.ui.core.s
import com.ctvplatform.androidtv.ui.theme.CtvBackground
import com.ctvplatform.androidtv.ui.theme.CtvImdbYellow

@Composable
fun MovieDetailsScreen() {
    val viewModel: MovieDetailsViewModel = hiltViewModel()
    val state by viewModel.uiState.collectAsState()

    Box(modifier = Modifier.fillMaxSize().background(CtvBackground)) {
        when {
            state.isLoading -> LoadingState()
            state.isError || state.movie == null -> ErrorState(onRetry = viewModel::load)
            else -> DetailsContent(movie = state.movie!!)
        }
    }
}

@Composable
private fun DetailsContent(movie: MovieDetailDto) {
    Column(modifier = Modifier.fillMaxSize()) {
        Box(modifier = Modifier.fillMaxWidth().height(s(420))) {
            AsyncImage(
                model = movie.artwork.backdrop ?: movie.artwork.poster,
                contentDescription = null,
                contentScale = ContentScale.Crop,
                modifier = Modifier.fillMaxSize(),
            )
            Box(
                modifier = Modifier.fillMaxSize().background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.6f to Color(0x99000000),
                        1f to CtvBackground,
                    ),
                ),
            )
            Column(modifier = Modifier.align(Alignment.BottomStart).padding(start = s(40), end = s(96), bottom = s(24))) {
                movie.genres.takeIf { it.isNotEmpty() }?.let { genres ->
                    Text(
                        text = genres.joinToString(" • ").uppercase(),
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.primary,
                    )
                }
                Text(
                    text = movie.title,
                    style = MaterialTheme.typography.displayLarge.copy(fontSize = fs(40)),
                    color = MaterialTheme.colorScheme.onSurface,
                )
                movie.rating?.let { rating ->
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Box(
                            modifier = Modifier
                                .background(CtvImdbYellow, RoundedCornerShape(3.dp))
                                .padding(horizontal = s(4)),
                        ) {
                            Text(text = "IMDb", style = MaterialTheme.typography.labelMedium, color = Color.Black)
                        }
                        Text(
                            text = " %.1f".format(rating),
                            style = MaterialTheme.typography.labelLarge,
                            color = Color.White,
                            modifier = Modifier.padding(start = s(6)),
                        )
                    }
                }
            }
        }

        Column(modifier = Modifier.padding(horizontal = s(40), vertical = s(20))) {
            Focusable(onClick = { /* wired to Media3 playback in a follow-up phase */ }) { focused ->
                Box(
                    modifier = Modifier
                        .focusGlow(focused)
                        .background(if (focused) Color.White else MaterialTheme.colorScheme.primary, RoundedCornerShape(999.dp))
                        .padding(horizontal = s(28), vertical = s(12)),
                ) {
                    Text(
                        text = "تشغيل",
                        style = MaterialTheme.typography.titleLarge,
                        color = if (focused) Color.Black else Color.White,
                    )
                }
            }

            movie.overview?.let { overview ->
                Text(
                    text = overview,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.widthIn(max = 900.dp).padding(top = s(16)),
                )
            }

            if (movie.cast.isNotEmpty()) {
                Text(
                    text = "الطاقم",
                    style = MaterialTheme.typography.headlineMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    modifier = Modifier.padding(top = s(24), bottom = s(12)),
                )
                LazyRow(horizontalArrangement = Arrangement.spacedBy(s(16))) {
                    items(movie.cast) { member -> CastMemberCard(member) }
                }
            }
        }
    }
}

@Composable
private fun CastMemberCard(member: CastMemberDto) {
    Column(modifier = Modifier.width(s(96))) {
        AsyncImage(
            model = member.profile,
            contentDescription = member.name,
            contentScale = ContentScale.Crop,
            modifier = Modifier
                .fillMaxWidth()
                .height(s(96))
                .clip(RoundedCornerShape(999.dp)),
        )
        Text(
            text = member.name,
            style = MaterialTheme.typography.labelMedium,
            color = MaterialTheme.colorScheme.onSurface,
            maxLines = 1,
            modifier = Modifier.padding(top = s(6)),
        )
        member.character?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.labelMedium.copy(fontSize = fs(11)),
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                maxLines = 1,
            )
        }
    }
}

@Composable
private fun LoadingState() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "تعذّر تحميل تفاصيل الفيلم",
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Button(onClick = onRetry, modifier = Modifier.padding(top = s(20))) {
                Text("إعادة المحاولة")
            }
        }
    }
}
