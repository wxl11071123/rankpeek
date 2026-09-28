# 修正构建产物的完整性标签（Low -> Medium）。
#
# 背景：D:\rankpeek rebuild 曾经带可继承的 Low 标签，新编译出来的 exe 会继承它。
# Windows 的强制完整性控制先于 ACL 检查：Low 进程写不了 Medium 目录，
# 于是 NSIS 安装器写不了 %TEMP%，双击直接报 "Error writing temporary file"，
# GraalVM 后端也建不了自己的数据目录。签名无关。
#
# 用法：build.bat 在打包结束后自动调用；也可手动跑。
# 脚本会验证改动前后文件 SHA-256 不变（完整性标签是元数据，不该改内容）。
#
# 本文件必须存成 UTF-8 with BOM：Windows PowerShell 5.1 对没有 BOM 的 UTF-8 按 ANSI 解码，
# 中文注释的字节一旦被拆错，就会凭空多出一个花括号，直接报语法错误。

$ErrorActionPreference = 'Stop'
$root = 'D:\rankpeek rebuild'

# 取文件 SHA-256：优先 Get-FileHash，拿不到就退 certutil。
# 本机 Windows PowerShell 5.1 里 Get-FileHash 会报「不是可识别的命令」（模块自动加载被关掉），
# build.bat 的 [6/6] 就死在这里：标签其实已经改对了，却因为校验工具拿不到而整包报失败。
function Get-Sha256([string]$file) {
    if (Get-Command Get-FileHash -ErrorAction SilentlyContinue) {
        return (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
    }
    $output = & certutil.exe -hashfile $file SHA256 2>&1
    if ($LASTEXITCODE -ne 0) { return $null }
    foreach ($line in $output) {
        $compact = ($line -replace '\s', '')
        if ($compact -match '^[0-9A-Fa-f]{64}$') { return $compact.ToUpperInvariant() }
    }
    return $null
}

# 读一个路径当前的完整性标签；没有显式标签就返回 $null（多数文件是继承父目录的 Medium）。
function Get-IntegrityLabel([string]$path) {
    $out = & icacls.exe $path 2>&1 | Out-String
    if ($out -match 'Mandatory Label\\(\w+) Mandatory Level') { return $matches[1] }
    return $null
}

$log = Join-Path $root 'logs\fix-rankpeek-build-output-integrity.txt'
$directories = @(
    (Join-Path $root 'rankpeek-backend\target'),
    (Join-Path $root 'rankpeek-frontend\release'),
    (Join-Path $root 'rankpeek-frontend\release\win-unpacked'),
    (Join-Path $root 'rankpeek-frontend\release\win-unpacked\resources\backend')
)
$executables = @(
    (Join-Path $root 'rankpeek-backend\target\rankpeek-native.exe'),
    (Join-Path $root 'rankpeek-frontend\release\win-unpacked\RankPeek.exe'),
    (Join-Path $root 'rankpeek-frontend\release\win-unpacked\resources\backend\rankpeek-backend.exe'),
    (Join-Path $root 'rankpeek-frontend\release\win-unpacked\resources\elevate.exe')
)
$release = Join-Path $root 'rankpeek-frontend\release'
if (Test-Path -LiteralPath $release -PathType Container) {
    $executables += @(Get-ChildItem -LiteralPath $release -Filter 'RankPeek Setup*.exe' -File |
        Select-Object -ExpandProperty FullName)
}
"start $(Get-Date -Format o)" | Out-File $log -Encoding utf8
# 设置完整性标签要 WRITE_OWNER 权限，非管理员跑 icacls /setintegritylevel 会直接 Access denied。
# 但「已经是 Medium」时这一步本来就不需要 —— 先读再决定要不要写，否则每次构建都会假失败。
$fixed = 0
$skipped = 0
foreach ($path in $directories) {
    if (-not (Test-Path -LiteralPath $path -PathType Container)) { continue }
    if ((Get-IntegrityLabel $path) -eq 'Medium') {
        "already Medium, skipped: $path" | Out-File $log -Append -Encoding utf8
        $skipped++
        continue
    }
    (& icacls.exe $path /setintegritylevel '(OI)(CI)M' 2>&1) | Out-File $log -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "icacls failed on $path (需要管理员权限才能改完整性标签)" }
    $fixed++
}
foreach ($path in $executables) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { continue }
    if ((Get-IntegrityLabel $path) -eq 'Medium') {
        "already Medium, skipped: $path" | Out-File $log -Append -Encoding utf8
        $skipped++
        continue
    }
    $before = Get-Sha256 $path
    (& icacls.exe $path /setintegritylevel M 2>&1) | Out-File $log -Append -Encoding utf8
    if ($LASTEXITCODE -ne 0) { throw "icacls failed on $path (需要管理员权限才能改完整性标签)" }
    $fixed++
    $after = Get-Sha256 $path
    if ($before -and $after) {
        if ($before -ne $after) { throw "Content hash changed on $path" }
        "hash unchanged: $path" | Out-File $log -Append -Encoding utf8
    } else {
        "hash check skipped (no hashing tool available): $path" | Out-File $log -Append -Encoding utf8
    }
}
"end $(Get-Date -Format o) fixed=$fixed skipped=$skipped" | Out-File $log -Append -Encoding utf8
Write-Host "integrity labels: fixed=$fixed already-medium=$skipped"
