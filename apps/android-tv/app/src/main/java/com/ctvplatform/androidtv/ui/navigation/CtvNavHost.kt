package com.ctvplatform.androidtv.ui.navigation

import androidx.compose.runtime.Composable
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.ctvplatform.androidtv.ui.details.MovieDetailsScreen
import com.ctvplatform.androidtv.ui.home.HomeScreen
import com.ctvplatform.androidtv.ui.search.SearchScreen
import com.ctvplatform.androidtv.ui.settings.SettingsScreen

/** Content is public — no login gate, so Home is the start destination. */
@Composable
fun CtvNavHost(navController: NavHostController = rememberNavController()) {
    NavHost(navController = navController, startDestination = Routes.HOME) {
        composable(Routes.HOME) {
            HomeScreen(
                onMovieSelected = { movieId -> navController.navigate(Routes.details(movieId)) },
                onSearchClick = { navController.navigate(Routes.SEARCH) },
                onSettingsClick = { navController.navigate(Routes.SETTINGS) },
            )
        }
        composable(
            route = Routes.DETAILS,
            arguments = listOf(navArgument(Routes.DETAILS_ARG_MOVIE_ID) { type = NavType.StringType }),
        ) {
            MovieDetailsScreen()
        }
        composable(Routes.SEARCH) {
            SearchScreen(onMovieSelected = { movieId -> navController.navigate(Routes.details(movieId)) })
        }
        composable(Routes.SETTINGS) {
            SettingsScreen()
        }
    }
}
