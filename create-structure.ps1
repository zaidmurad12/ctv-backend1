# ==========================================
# CTV Platform Project Structure Generator
# ==========================================

$folders = @(
    "apps",
    "apps/backend",
    "apps/admin",
    "apps/android-tv",

    "services",
    "services/importer",
    "services/importer/cinemana",
    "services/importer/tmdb",
    "services/importer/subtitles",
    "services/importer/matcher",
    "services/importer/scheduler",

    "services/scraper",
    "services/scraper/browser",
    "services/scraper/network",
    "services/scraper/javascript",
    "services/scraper/extractor",

    "services/transcoder",

    "packages",
    "packages/common",
    "packages/config",
    "packages/database",
    "packages/logger",
    "packages/sdk",
    "packages/types",

    "tools",
    "tools/inspector",
    "tools/api-discovery",
    "tools/endpoint-tester",
    "tools/migration",

    "storage",
    "storage/cache",
    "storage/posters",
    "storage/backdrops",
    "storage/logos",
    "storage/subtitles",
    "storage/trailers",
    "storage/logs",
    "storage/reports",

    "docs",
    "docker",
    ".github",
    ".github/workflows"
)

foreach ($folder in $folders) {
    New-Item -ItemType Directory -Force -Path $folder | Out-Null
}

$files = @(
    ".env",
    ".gitignore",
    "README.md",
    "package.json",
    "turbo.json",

    "docs/ARCHITECTURE.md",
    "docs/API.md",
    "docs/DATABASE.md",
    "docs/ROADMAP.md",

    "apps/backend/README.md",
    "apps/admin/README.md",
    "apps/android-tv/README.md",

    "services/importer/README.md",
    "services/scraper/README.md",

    "packages/common/index.ts",
    "packages/config/index.ts",
    "packages/database/index.ts",
    "packages/logger/index.ts",
    "packages/sdk/index.ts",
    "packages/types/index.ts"
)

foreach ($file in $files) {
    if (!(Test-Path $file)) {
        New-Item -ItemType File -Path $file | Out-Null
    }
}

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "      CTV Platform Created"
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""
