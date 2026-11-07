// The latest CinemanaTVRN (Android TV) release the app itself can offer as an in-app update - the
// app's own Settings screen calls GET /app/version (see appUpdate.controller.ts) and compares
// versionCode against its own build. Bumped BY HAND alongside android/app/build.gradle's
// versionCode/versionName in the CinemanaTVRN repo (a separate repo from this one) every time a
// new release APK is built - and the built file itself must be copied into ./release-assets,
// replacing LATEST_APK_FILENAME, before this backend is redeployed. Forgetting either half (the
// numbers here, or the file in release-assets) means the check offers a build nobody can actually
// download, or never offers one that's already sitting there.
export const LATEST_VERSION_CODE = 220;
export const LATEST_VERSION_NAME = '1.24.60-resume-episode';
export const LATEST_APK_FILENAME = 'ctv-plus-latest.apk';
// Set (non-empty) to hand the app this URL instead of this backend's own /downloads/<filename> -
// Cloud Run's *.run.app domain turned out unreachable from at least one real user's network (a
// plain browser failed on that exact URL too, not just this app's own downloader, while the same
// URL worked fine elsewhere - a shared-hostname domain block, not anything wrong with the file or
// the download code). The CinemanaTVRN repo's own releases/ folder on GitHub - a differently
// hosted, CDN-backed (Fastly) domain far less likely to be caught by the same block - is what
// this currently points at. Update BOTH this and the copy under CinemanaTVRN/releases/ on every
// release if staying on GitHub hosting; clear it to fall back to this backend's own
// release-assets/ + /downloads/ path instead.
export const LATEST_APK_EXTERNAL_URL =
  'https://raw.githubusercontent.com/zaidmurad12/ctvplus/main/releases/ctv-plus-latest.apk';
export const LATEST_NOTES_AR =
  'صفحة المسلسل تفتح على آخر حلقة شاهدتها، وفتح أسرع للواجهة الرئيسية والأفلام والمسلسلات.';
export const LATEST_NOTES_EN =
  'A series page opens on the last episode you watched; faster start for Home, Movies and Series.';
