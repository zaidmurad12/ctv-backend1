package com.ctvplatform.androidtv.ui.search

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.style.TextOverflow
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.tv.material3.MaterialTheme
import androidx.tv.material3.Text
import coil.compose.AsyncImage
import com.ctvplatform.androidtv.data.remote.dto.SearchResultItemDto
import com.ctvplatform.androidtv.ui.core.Focusable
import com.ctvplatform.androidtv.ui.core.VirtualKeyboard
import com.ctvplatform.androidtv.ui.core.focusGlow
import com.ctvplatform.androidtv.ui.core.s
import com.ctvplatform.androidtv.ui.theme.CtvBackground
import com.ctvplatform.androidtv.ui.theme.CtvBorder

/** Left pane = the ported virtual keyboard, right pane = live results — same split as the RN kit's SearchScreen. */
@Composable
fun SearchScreen(onMovieSelected: (String) -> Unit) {
    val viewModel: SearchViewModel = hiltViewModel()
    val state by viewModel.uiState.collectAsState()

    Row(
        modifier = Modifier
            .fillMaxSize()
            .background(CtvBackground)
            .padding(s(40)),
    ) {
        Column(modifier = Modifier.width(s(420))) {
            Text(
                text = state.query.ifEmpty { "ابحث عن فيلم…" },
                style = MaterialTheme.typography.headlineMedium,
                color = MaterialTheme.colorScheme.onSurface,
            )
            VirtualKeyboard(
                onKey = viewModel::onKey,
                onBackspace = viewModel::onBackspace,
                onSpace = viewModel::onSpace,
                modifier = Modifier.fillMaxWidth().padding(top = s(20)),
            )
        }

        Box(modifier = Modifier.fillMaxHeight().padding(start = s(32))) {
            when {
                state.isLoading -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = MaterialTheme.colorScheme.primary)
                }
                state.results.isEmpty() -> Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(
                        text = if (state.query.length < 2) "اكتب حرفين على الأقل" else "لا توجد نتائج",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                else -> LazyVerticalGrid(
                    columns = GridCells.Fixed(4),
                    contentPadding = PaddingValues(bottom = s(24)),
                ) {
                    items(state.results, key = { it.id }) { result ->
                        SearchResultCard(result = result, onClick = { onMovieSelected(result.id) })
                    }
                }
            }
        }
    }
}

@Composable
private fun SearchResultCard(result: SearchResultItemDto, onClick: () -> Unit) {
    val shape = RoundedCornerShape(s(8))
    Focusable(onClick = onClick, modifier = Modifier.width(s(128)).padding(s(8))) { focused ->
        Column {
            AsyncImage(
                model = result.poster,
                contentDescription = result.title,
                contentScale = ContentScale.Crop,
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(2f / 3f)
                    .focusGlow(focused, tight = true, shape = shape)
                    .clip(shape)
                    .background(CtvBorder),
            )
            Text(
                text = result.title,
                style = MaterialTheme.typography.labelLarge,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = s(6)),
            )
        }
    }
}
