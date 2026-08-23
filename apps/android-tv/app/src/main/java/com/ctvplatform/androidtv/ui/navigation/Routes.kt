package com.ctvplatform.androidtv.ui.navigation

object Routes {
    const val HOME = "home"
    const val SEARCH = "search"
    const val SETTINGS = "settings"
    const val DETAILS_ARG_MOVIE_ID = "movieId"
    const val DETAILS = "details/{$DETAILS_ARG_MOVIE_ID}"

    fun details(movieId: String) = "details/$movieId"
}
