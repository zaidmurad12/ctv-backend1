package com.ctvplatform.androidtv.data.remote.dto

import com.squareup.moshi.Json
import com.squareup.moshi.JsonClass

/**
 * Mirrors apps/backend/src/common/interceptors/responseInterceptor.ts and
 * allExceptionsFilter.ts exactly: every backend response is either
 * `{success: true, data, meta?}` or `{success: false, error: {code, message}}`.
 */
@JsonClass(generateAdapter = true)
data class ApiEnvelope<T>(
    val success: Boolean,
    val data: T? = null,
    val error: ApiErrorDto? = null,
    val meta: PaginationMetaDto? = null,
)

@JsonClass(generateAdapter = true)
data class ApiErrorDto(
    val code: String,
    val message: String,
)

@JsonClass(generateAdapter = true)
data class ArtworkDto(
    val poster: String? = null,
    val backdrop: String? = null,
    val logo: String? = null,
)

/** Mirrors apps/backend/src/common/dto/pagination.dto.ts's PaginationMeta. */
@JsonClass(generateAdapter = true)
data class PaginationMetaDto(
    val page: Int,
    val limit: Int,
    val total: Int,
    val totalPages: Int,
    val hasNext: Boolean,
    val hasPrevious: Boolean,
)

@JsonClass(generateAdapter = true)
data class MovieSummaryDto(
    val id: String,
    val title: String,
    val overview: String? = null,
    @Json(name = "releaseDate") val releaseDate: String? = null,
    val rating: Double? = null,
    val artwork: ArtworkDto,
)
