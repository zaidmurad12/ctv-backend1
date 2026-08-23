package com.ctvplatform.androidtv.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ctvplatform.androidtv.data.remote.dto.MovieSummaryDto
import com.ctvplatform.androidtv.data.repository.MovieRepository
import com.ctvplatform.androidtv.data.repository.MoviesOutcome
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HomeUiState(
    val isLoading: Boolean = true,
    val movies: List<MovieSummaryDto> = emptyList(),
    val isError: Boolean = false,
)

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val movieRepository: MovieRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    init {
        loadMovies()
    }

    fun loadMovies() {
        _uiState.update { it.copy(isLoading = true, isError = false) }
        viewModelScope.launch {
            when (val outcome = movieRepository.listMovies()) {
                is MoviesOutcome.Success -> _uiState.update {
                    it.copy(isLoading = false, movies = outcome.movies, isError = false)
                }
                MoviesOutcome.Error -> _uiState.update {
                    it.copy(isLoading = false, isError = true)
                }
            }
        }
    }
}
