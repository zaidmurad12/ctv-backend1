package com.ctvplatform.androidtv.ui.search

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ctvplatform.androidtv.data.remote.dto.SearchResultItemDto
import com.ctvplatform.androidtv.data.repository.MovieRepository
import com.ctvplatform.androidtv.data.repository.SearchOutcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SearchUiState(
    val query: String = "",
    val isLoading: Boolean = false,
    val results: List<SearchResultItemDto> = emptyList(),
    val isError: Boolean = false,
)

private const val SEARCH_DEBOUNCE_MS = 300L
private const val MIN_QUERY_LENGTH = 2

@HiltViewModel
class SearchViewModel @Inject constructor(
    private val movieRepository: MovieRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(SearchUiState())
    val uiState: StateFlow<SearchUiState> = _uiState.asStateFlow()

    private var searchJob: Job? = null

    fun onQueryChange(query: String) {
        _uiState.update { it.copy(query = query) }
        searchJob?.cancel()

        if (query.length < MIN_QUERY_LENGTH) {
            _uiState.update { it.copy(results = emptyList(), isLoading = false, isError = false) }
            return
        }

        searchJob = viewModelScope.launch {
            delay(SEARCH_DEBOUNCE_MS)
            _uiState.update { it.copy(isLoading = true, isError = false) }
            when (val outcome = movieRepository.search(query)) {
                is SearchOutcome.Success -> _uiState.update {
                    it.copy(isLoading = false, results = outcome.results, isError = false)
                }
                SearchOutcome.Error -> _uiState.update {
                    it.copy(isLoading = false, isError = true)
                }
            }
        }
    }

    fun onBackspace() {
        onQueryChange(_uiState.value.query.dropLast(1))
    }

    fun onKey(char: String) {
        onQueryChange(_uiState.value.query + char)
    }

    fun onSpace() {
        onQueryChange(_uiState.value.query + " ")
    }
}
