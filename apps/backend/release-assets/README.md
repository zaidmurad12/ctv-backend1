# In-app update release assets

Serves the release APK the CinemanaTVRN app's own Settings screen offers as an in-app update
(`GET /app/version`, static file under `/downloads/`).

**On every new CinemanaTVRN release:**

1. Build the release APK as usual (`android\app\build\outputs\apk\release\ctv plus.apk`).
2. Copy it here, overwriting `ctv-plus-latest.apk`.
3. Update `../src/app-update/appVersion.ts`'s `LATEST_VERSION_CODE`/`LATEST_VERSION_NAME`/notes to
   match `android/app/build.gradle` in the CinemanaTVRN repo.
4. Redeploy this backend (`gcloud run deploy ctv-platform-backend --source .`).

Forgetting step 2 or 3 means the update check either offers a build nobody can download, or never
offers one that's already here. `.gcloudignore` has a specific exception for this one `*.apk` file
(it excludes every other `.apk` from uploads by default) - do not remove it, and do not rename this
file without updating `LATEST_APK_FILENAME` in `appVersion.ts` too.
