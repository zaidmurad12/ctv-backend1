package com.ctvplatform.androidtv.data.repository

import com.ctvplatform.androidtv.data.remote.ApiService
import com.ctvplatform.androidtv.data.remote.dto.MovieDetailDto
import com.ctvplatform.androidtv.data.remote.dto.MovieSummaryDto
import com.ctvplatform.androidtv.data.remote.dto.SearchResultItemDto
import java.io.IOException
import javax.inject.Inject
import javax.inject.Singleton

sealed interface MoviesOutcome {
    data class Success(val movies: List<MovieSummaryDto>) : MoviesOutcome
    data object Error : MoviesOutcome
}

sealed interface MovieDetailOutcome {
    data class Success(val movie: MovieDetailDto) : MovieDetailOutcome
    data object Error : MovieDetailOutcome
}

sealed interface SearchOutcome {
    data class Success(val results: List<SearchResultItemDto>) : SearchOutcome
    data object Error : SearchOutcome
}

@Singleton
class MovieRepository @Inject constructor(private val apiService: ApiService) {
    suspend fun listMovies(): MoviesOutcome {
        return try {
            val envelope = apiService.listMovies()
            val data = envelope.data
            if (envelope.success && data != null) {
                MoviesOutcome.Success(data)
            } else {
                MoviesOutcome.Error
            }
        } catch (_: retrofit2.HttpException) {
            MoviesOutcome.Error
        } catch (_: IOException) {
            MoviesOutcome.Error
        }
    }

    suspend fun getMovieDetails(id: String): MovieDetailOutcome {
        return try {
            val envelope = apiService.getMovie(id)
            val data = envelope.data
            if (envelope.success && data != null) {
                MovieDetailOutcome.Success(data)
            } else {
                MovieDetailOutcome.Error
            }
        } catch (_: retrofit2.HttpException) {
            MovieDetailOutcome.Error
        } catch (_: IOException) {
            MovieDetailOutcome.Error
        }
    }

    suspend fun search(query: String): SearchOutcome {
        return try {
            val envelope = apiService.search(query)
            val data = envelope.data
            if (envelope.success && data != null) {
                SearchOutcome.Success(data)
            } else {
                SearchOutcome.Error
            }
        } catch (_: retrofit2.HttpException) {
            SearchOutcome.Error
        } catch (_: IOException) {
            SearchOutcome.Error
        }
    }
}
