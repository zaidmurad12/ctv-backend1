plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.ksp)
    alias(libs.plugins.hilt)
}

android {
    namespace = "com.ctvplatform.androidtv"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.ctvplatform.androidtv"
        minSdk = 28
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"

        // Deployed backend on Cloud Run (apps/backend) — persistent HTTPS URL, replaces the
        // old LAN dev-machine IP now that the app doesn't need the dev backend running locally.
        buildConfigField("String", "API_BASE_URL", "\"https://ctv-platform-backend-188952464622.me-central1.run.app/api/v1\"")
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isMinifyEnabled = false
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    implementation(libs.core.ktx)
    implementation(libs.lifecycle.runtime.ktx)
    implementation(libs.lifecycle.viewmodel.compose)
    implementation(libs.activity.compose)
    implementation(libs.navigation.compose)

    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.ui.graphics)
    implementation(libs.compose.foundation)
    // Only for the handful of components androidx.tv.material3 doesn't provide (e.g. CircularProgressIndicator).
    implementation(libs.compose.material3)
    // Icons.Filled.Language / Backspace (VirtualKeyboard) live in the extended set, not core.
    implementation(libs.compose.material.icons.extended)
    debugImplementation(libs.compose.ui.tooling)
    implementation(libs.compose.ui.tooling.preview)

    implementation(libs.tv.foundation)
    implementation(libs.tv.material)

    implementation(libs.hilt.android)
    ksp(libs.hilt.compiler)
    implementation(libs.hilt.navigation.compose)

    implementation(libs.retrofit.core)
    implementation(libs.retrofit.converter.moshi)
    implementation(libs.okhttp.core)
    implementation(libs.okhttp.logging.interceptor)
    implementation(libs.moshi.kotlin)
    ksp(libs.moshi.codegen)

    implementation(libs.coil.compose)
    implementation(libs.kotlinx.coroutines.android)
}
