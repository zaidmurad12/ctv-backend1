package com.ctvplatform.androidtv.data.remote.dto

import com.squareup.moshi.JsonClass

/** Mirrors apps/backend/src/catalog/dto.ts's CastMemberDto. */
@JsonClass(generateAdapter = true)
data class CastMemberDto(
    val name: String,
    val character: String? = null,
    val profile: String? = null,
)

/** Mirrors apps/backend/src/catalog/dto.ts's StreamResponseDto. */
@JsonClass(generateAdapter = true)
data class StreamDto(
    val id: String,
    val quality: String,
    val codec: String? = null,
    val language: String? = null,
    val serverName: String,
    val streamUrl: String,
    val isDefault: Boolean,
)

/** Mirrors apps/backend/src/catalog/dto.ts's SubtitleResponseDto. */
@JsonClass(generateAdapter = true)
data class SubtitleDto(
    val id: String,
    val language: String,
    val format: String,
    val url: String,
    val isDefault: Boolean,
)

/** Mirrors apps/backend/src/catalog/dto.ts's MovieDetailDto (extends MovieSummaryDto). */
@JsonClass(generateAdapter = true)
data class MovieDetailDto(
    val id: String,
    val title: String,
    val overview: String? = null,
    val releaseDate: String? = null,
    val rating: Double? = null,
    val artwork: ArtworkDto,
    val originalTitle: String? = null,
    val tagline: String? = null,
    val titleAr: String? = null,
    val genres: List<String> = emptyList(),
    val cast: List<CastMemberDto> = emptyList(),
    val director: String? = null,
    val streams: List<StreamDto> = emptyList(),
    val subtitles: List<SubtitleDto> = emptyList(),
)

/** Mirrors apps/backend/src/search/dto.ts's SearchResultItemDto. */
@JsonClass(generateAdapter = true)
data class SearchResultItemDto(
    val id: String,
    val type: String,
    val title: String,
    val poster: String? = null,
)
