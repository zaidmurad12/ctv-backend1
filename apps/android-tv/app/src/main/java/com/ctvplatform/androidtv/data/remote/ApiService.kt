package com.ctvplatform.androidtv.data.remote

import com.ctvplatform.androidtv.data.remote.dto.ApiEnvelope
import com.ctvplatform.androidtv.data.remote.dto.MovieDetailDto
import com.ctvplatform.androidtv.data.remote.dto.MovieSummaryDto
import com.ctvplatform.androidtv.data.remote.dto.SearchResultItemDto
import retrofit2.http.GET
import retrofit2.http.Path
import retrofit2.http.Query

/** Talks only to apps/backend's public API — never to a database or a provider directly, per specification/10-Android-TV.md.txt's "Security: No Direct Database Access, No Provider Access." */
interface ApiService {
    @GET("movies")
    suspend fun listMovies(): ApiEnvelope<List<MovieSummaryDto>>

    @GET("movies/{id}")
    suspend fun getMovie(@Path("id") id: String): ApiEnvelope<MovieDetailDto>

    @GET("search")
    suspend fun search(@Query("search") query: String): ApiEnvelope<List<SearchResultItemDto>>
}
