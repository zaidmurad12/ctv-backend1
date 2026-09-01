package com.ctvplatform.androidtv.ui.navigation

import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import com.ctvplatform.androidtv.ui.core.Sidebar
import com.ctvplatform.androidtv.ui.core.SidebarDestination
import com.ctvplatform.androidtv.ui.details.MovieDetailsScreen
import com.ctvplatform.androidtv.ui.home.HomeScreen
import com.ctvplatform.androidtv.ui.search.SearchScreen
import com.ctvplatform.androidtv.ui.settings.SettingsScreen

/**
 * Content is public — no login gate, so Home is the start destination. The sidebar (mirrors
 * rn-tv-design-kit's spacing.sidebarWidth) is persistent chrome for the three top-level
 * destinations; Details hides it for an immersive full-width view, the same pattern the RN
 * kit's own contentStart-vs-full-bleed screens used.
 */
@Composable
fun CtvNavHost(navController: NavHostController = rememberNavController()) {
    val backStackEntry by navController.currentBackStackEntryAsState()
    val showSidebar = backStackEntry?.destination?.route != Routes.DETAILS

    Row(modifier = Modifier.fillMaxSize()) {
        if (showSidebar) {
            Sidebar(
                current = when (backStackEntry?.destination?.route) {
                    Routes.SEARCH -> SidebarDestination.SEARCH
                    Routes.SETTINGS -> SidebarDestination.SETTINGS
                    else -> SidebarDestination.HOME
                },
                onHomeClick = {
                    navController.navigate(Routes.HOME) { popUpTo(Routes.HOME) { inclusive = true } }
                },
                onSearchClick = { navController.navigate(Routes.SEARCH) },
                onSettingsClick = { navController.navigate(Routes.SETTINGS) },
            )
        }

        NavHost(
            navController = navController,
            startDestination = Routes.HOME,
            modifier = Modifier.weight(1f),
        ) {
            composable(Routes.HOME) {
                HomeScreen(onMovieSelected = { movieId -> navController.navigate(Routes.details(movieId)) })
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
}
