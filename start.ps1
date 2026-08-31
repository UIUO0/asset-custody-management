# =========================================================================
#  تشغيل بيئة التطوير المحلية — ORG Asset Management
#  الاستخدام:  .\start.ps1
#  يوقف كل شي:  .\start.ps1 -Stop
# =========================================================================

param(
    [switch]$Stop,
    [switch]$SkipSupabase
)

$ErrorActionPreference = "Stop"
$Root = $PSScriptRoot

function Write-Step($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "    $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "    $msg" -ForegroundColor Yellow }

# --- إيقاف ---------------------------------------------------------------
if ($Stop) {
    Write-Step "إيقاف Supabase"
    Push-Location $Root
    pnpm dlx supabase@latest stop
    Pop-Location
    Write-Ok "تم. (أوقف سيرفر Vite بـ Ctrl+C في نافذته)"
    exit 0
}

# --- فحوصات أولية --------------------------------------------------------
Write-Step "فحص المتطلبات"

if (-not (Test-Path (Join-Path $Root ".env"))) {
    Write-Host "    ملف .env غير موجود. انسخ .env.example واملأه." -ForegroundColor Red
    exit 1
}
Write-Ok ".env موجود"

$env:PATH = $env:PATH  # تحديث المسار في الجلسة الحالية
try {
    docker info *> $null
    Write-Ok "Docker شغال"
} catch {
    Write-Host "    Docker Desktop غير شغال — شغّله ثم أعد المحاولة." -ForegroundColor Red
    exit 1
}

if (-not (Test-Path (Join-Path $Root "node_modules"))) {
    Write-Step "تثبيت الحزم (أول مرة)"
    Push-Location $Root; pnpm install; Pop-Location
}

# --- المنفذ 3000 ---------------------------------------------------------
Write-Step "فحص المنفذ 3000"
$excluded = netsh interface ipv4 show excludedportrange protocol=tcp | Out-String
$blocked = $false
foreach ($line in ($excluded -split "`n")) {
    if ($line -match '^\s*(\d+)\s+(\d+)') {
        $start = [int]$matches[1]; $count = [int]$matches[2]
        if (3000 -ge $start -and 3000 -lt ($start + $count)) { $blocked = $true }
    }
}
if ($blocked) {
    Write-Warn "المنفذ 3000 محجوز من Hyper-V/WinNAT — يحتاج صلاحيات أدمن لتحريره"
    Write-Warn "شغّل PowerShell كأدمن ونفّذ:  net stop winnat; net start winnat"
} else {
    Write-Ok "المنفذ 3000 متاح"
}

# --- Supabase ------------------------------------------------------------
if (-not $SkipSupabase) {
    Write-Step "تشغيل Supabase المحلي"
    Push-Location $Root
    pnpm dlx supabase@latest start
    Pop-Location
    Write-Ok "Studio: http://127.0.0.1:54323   |   Mailpit: http://127.0.0.1:54324"
}

# --- قاعدة البيانات ------------------------------------------------------
Write-Step "تطبيق الـ migrations وتوليد عميل Prisma"
Push-Location $Root
pnpm db:deploy-migration
Pop-Location

# مسح كاش Vite — بدونه يبقى عميل Prisma القديم مُقدَّماً (مزلقة موثّقة في CLAUDE.md)
$viteCache = Join-Path $Root "apps\webapp\node_modules\.vite"
if (Test-Path $viteCache) {
    Remove-Item -Recurse -Force $viteCache
    Write-Ok "تم مسح كاش Vite"
}

# --- سيرفر التطوير -------------------------------------------------------
Write-Step "تشغيل سيرفر التطوير"
Write-Host "    http://localhost:3000" -ForegroundColor Green
Write-Host "    admin@example.local (كلمة المرور تُطبع في مخرجات البذر)" -ForegroundColor DarkGray
Write-Host "    (Ctrl+C للإيقاف)`n" -ForegroundColor DarkGray

Push-Location (Join-Path $Root "apps\webapp")
pnpm dev
Pop-Location
