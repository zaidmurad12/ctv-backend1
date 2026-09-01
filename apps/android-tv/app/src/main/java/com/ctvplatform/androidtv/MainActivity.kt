package com.ctvplatform.androidtv

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.ctvplatform.androidtv.ui.navigation.CtvNavHost
import com.ctvplatform.androidtv.ui.theme.CtvPlatformTheme
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            CtvPlatformTheme {
                CtvNavHost()
            }
        }
    }
}
