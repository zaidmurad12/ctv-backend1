package com.ctvplatform.androidtv.ui.home

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.focusRestorer
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.Button
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.ctvplatform.androidtv.R
import com.ctvplatform.androidtv.data.remote.dto.MovieSummaryDto
import com.ctvplatform.androidtv.ui.components.MoviePosterCard
import com.ctvplatform.androidtv.ui.core.fs
import com.ctvplatform.androidtv.ui.core.s
import com.ctvplatform.androidtv.ui.theme.CtvBackground

@Composable
fun HomeScreen(onMovieSelected: (String) -> Unit = {}) {
    val viewModel: HomeViewModel = hiltViewModel()
    val state by viewModel.uiState.collectAsState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(CtvBackground),
    ) {
        when {
            state.isLoading -> LoadingState()
            state.isError -> ErrorState(onRetry = viewModel::loadMovies)
            else -> HomeContent(movies = state.movies, onMovieSelected = onMovieSelected)
        }

        // The sidebar now owns search/settings entry points — this is just the wordmark.
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.titleLarge,
            color = MaterialTheme.colorScheme.onSurface,
            modifier = Modifier.padding(horizontal = s(40), vertical = s(24)),
        )
    }
}

@OptIn(ExperimentalComposeUiApi::class)
@Composable
private fun HomeContent(movies: List<MovieSummaryDto>, onMovieSelected: (String) -> Unit) {
    val featured = movies.firstOrNull()

    AnimatedVisibility(
        visible = true,
        enter = fadeIn(tween(400)) + slideInVertically(tween(400), initialOffsetY = { it / 12 }),
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            if (featured != null) {
                HeroSection(movie = featured)
            }

            Text(
                text = stringResource(R.string.home_section_movies),
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.padding(start = s(40), top = s(8), bottom = s(16)),
            )

            LazyRow(
                modifier = Modifier.focusRestorer(),
                contentPadding = PaddingValues(horizontal = s(40)),
                horizontalArrangement = Arrangement.spacedBy(s(20)),
            ) {
                items(movies, key = { it.id }) { movie ->
                    MoviePosterCard(
                        title = movie.title,
                        posterUrl = movie.artwork.poster,
                        onClick = { onMovieSelected(movie.id) },
                    )
                }
            }
        }
    }
}

@Composable
private fun HeroSection(movie: MovieSummaryDto) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(s(440)),
    ) {
        AsyncImage(
            model = movie.artwork.backdrop ?: movie.artwork.poster,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
        Box(
            modifier = Modifier
                .fillMaxSize()
                .background(
                    Brush.verticalGradient(
                        0f to Color.Transparent,
                        0.55f to Color(0x99000000),
                        1f to CtvBackground,
                    ),
                ),
        )
        Column(
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = s(40), end = s(96), bottom = s(32)),
        ) {
            Text(
                text = "مُميّز",
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.primary,
            )
            Text(
                text = movie.title,
                style = MaterialTheme.typography.displayLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = s(4)),
            )
            movie.overview?.let { overview ->
                Text(
                    text = overview,
                    style = MaterialTheme.typography.bodyLarge.copy(fontSize = fs(18)),
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier
                        .padding(top = s(12))
                        .width(s(640)),
                )
            }
        }
    }
}

@Composable
private fun LoadingState() {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
            Text(
                text = stringResource(R.string.home_loading),
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(top = s(16)),
            )
        }
    }
}

@Composable
private fun ErrorState(onRetry: () -> Unit) {
    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = stringResource(R.string.home_error),
                style = MaterialTheme.typography.titleLarge,
                color = MaterialTheme.colorScheme.onSurface,
            )
            Button(onClick = onRetry, modifier = Modifier.padding(top = s(20))) {
                Text(stringResource(R.string.home_retry))
            }
        }
    }
}
