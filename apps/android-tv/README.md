# CTV Platform — Android TV (Phase 1)

Native Android TV app per `specification/10-Android-TV.md.txt`: Kotlin, Jetpack
Compose + Compose for TV (`androidx.tv`), Hilt, Retrofit, Coil, Navigation
Compose. **Phase 1 scope only**: Login + Home (browse movies). Every other
screen in the spec (TV Shows, Search, Details, Player, Continue Watching,
Favorites, Settings, etc.) is a follow-up phase — see
`specification/25-MILESTONES.md.txt` Milestone 7.

## Requirements

- **JDK 17** (Android Gradle Plugin 8.x requires it). If you don't have one,
  a portable copy can be extracted anywhere and pointed at via `JAVA_HOME`
  for the build shell only — no system install needed.
- Android SDK with `platforms;android-35` and `build-tools` installed
  (`local.properties` here points at a specific machine's SDK path — update
  `sdk.dir` for yours, or set the `ANDROID_HOME` env var instead).
- An Android TV emulator (AVD) or a real Android TV device (Android 9+) on
  the same network as your backend.

## Configure the backend URL

`app/build.gradle.kts` sets `API_BASE_URL` to the dev machine's LAN IP
(currently `http://192.168.0.115:3000/api/v1`) so a **real Android TV
device** on the same Wi-Fi can reach `apps/backend`. This IP changes
whenever the machine reconnects to a different network — find the current
one with `ipconfig` (Windows) and update it here, then rebuild. The backend
process must actually be running (`pnpm dev:backend` from the repo root)
for the app to load anything; it binds `0.0.0.0:3000` by default, so it's
reachable from other devices on the LAN as long as the firewall allows
Node.js inbound connections (already the case if you've accepted the
"Node.js JavaScript Runtime" Windows Firewall prompt).

Testing in an **emulator** instead? Use `http://10.0.2.2:3000/api/v1`, the
standard alias an emulator uses to reach `localhost` on the host machine.

## Build

```bash
cd apps/android-tv
JAVA_HOME=/path/to/jdk-17 ./gradlew assembleDebug
# Windows: set JAVA_HOME=C:\path\to\jdk-17 && gradlew.bat assembleDebug
```

Produces `app/build/outputs/apk/debug/app-debug.apk`.

## Install & run

```bash
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.ctvplatform.androidtv/.MainActivity
```

Log in with a real account from your backend (e.g. the seeded admin:
`admin@ctv.local` / `Admin@123` — see `prisma/seed.mjs`).

## What's here vs. not

Implemented: Login (calls `POST /auth/login`, stores tokens encrypted via
`EncryptedSharedPreferences`), Home (calls `GET /movies`, one horizontally
scrollable poster row). Not implemented yet: everything else in the full
spec — TV Shows/Search/Details screens, Media3 ExoPlayer playback, Continue
Watching, Favorites, Collections, Recommendations, Settings, offline
caching, subtitle/audio/quality selection.

The launcher icon and TV banner (`res/drawable/tv_banner.xml`,
`res/mipmap-anydpi-v26/ic_launcher.xml`) are placeholders — swap them for
the real app logo when available.
