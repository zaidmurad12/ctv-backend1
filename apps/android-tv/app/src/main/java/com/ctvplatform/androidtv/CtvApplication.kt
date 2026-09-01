package com.ctvplatform.androidtv

import android.app.Application
import com.ctvplatform.androidtv.ui.core.UiScaleStore
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class CtvApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        UiScaleStore.init(this)
    }
}
