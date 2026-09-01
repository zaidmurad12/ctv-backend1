package com.ctvplatform.androidtv.ui.details

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.ctvplatform.androidtv.data.remote.dto.MovieDetailDto
import com.ctvplatform.androidtv.data.repository.MovieDetailOutcome
import com.ctvplatform.androidtv.data.repository.MovieRepository
import com.ctvplatform.androidtv.ui.navigation.Routes
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MovieDetailsUiState(
    val isLoading: Boolean = true,
    val movie: MovieDetailDto? = null,
    val isError: Boolean = false,
)

@HiltViewModel
class MovieDetailsViewModel @Inject constructor(
    private val movieRepository: MovieRepository,
    savedStateHandle: SavedStateHandle,
) : ViewModel() {

    private val movieId: String = checkNotNull(savedStateHandle[Routes.DETAILS_ARG_MOVIE_ID])

    private val _uiState = MutableStateFlow(MovieDetailsUiState())
    val uiState: StateFlow<MovieDetailsUiState> = _uiState.asStateFlow()

    init {
        load()
    }

    fun load() {
        _uiState.update { it.copy(isLoading = true, isError = false) }
        viewModelScope.launch {
            when (val outcome = movieRepository.getMovieDetails(movieId)) {
                is MovieDetailOutcome.Success -> _uiState.update {
                    it.copy(isLoading = false, movie = outcome.movie, isError = false)
                }
                MovieDetailOutcome.Error -> _uiState.update {
                    it.copy(isLoading = false, isError = true)
                }
            }
        }
    }
}
