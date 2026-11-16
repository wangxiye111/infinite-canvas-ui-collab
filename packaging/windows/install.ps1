param([string]$Destination, [switch]$Quiet, [switch]$NoLaunch, [switch]$NoShortcuts)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem

function Get-CanvasHash([string]$Path) {
    $stream = [IO.File]::OpenRead($Path)
    $hash = [Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose(); $hash.Dispose() }
}

function Install-Canvas {
    param([scriptblock]$Progress)
    if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw '此安装包适用于 Windows x64。' }
    & $Progress '正在准备安装文件…'
    $source = Join-Path $PSScriptRoot 'payload'
    if (-not (Test-Path -LiteralPath (Join-Path $source 'manifest.json'))) {
        $source = Join-Path ([IO.Path]::GetTempPath()) ('infinite-canvas-install-' + [Guid]::NewGuid().ToString('N'))
        [IO.Compression.ZipFile]::ExtractToDirectory((Join-Path $PSScriptRoot 'payload.zip'), $source)
    }
    $manifest = Get-Content -LiteralPath (Join-Path $source 'manifest.json') -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.product -ne 'infinite-canvas' -or $manifest.id -notmatch '^[a-zA-Z0-9._-]+$') { throw '安装文件无效，请重新下载安装包。' }
    $installBase = if ($Destination) { [IO.Path]::GetFullPath($Destination) } else { Join-Path $env:LOCALAPPDATA 'InfiniteCanvas' }
    $target = Join-Path $installBase ('releases\' + $manifest.id)
    $sourcePrefix = [IO.Path]::GetFullPath($source).TrimEnd('\') + '\'
    $targetPrefix = [IO.Path]::GetFullPath($target).TrimEnd('\') + '\'
    & $Progress '正在校验安装文件…'
    foreach ($file in $manifest.files) {
        $from = [IO.Path]::GetFullPath((Join-Path $source $file.path))
        $to = [IO.Path]::GetFullPath((Join-Path $target $file.path))
        if (-not $from.StartsWith($sourcePrefix, [StringComparison]::OrdinalIgnoreCase) -or -not $to.StartsWith($targetPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw '安装文件路径无效。' }
        if ((Get-CanvasHash $from) -ne $file.sha256) { throw ('安装文件校验失败：' + $file.path) }
    }
    & $Progress '正在安装画布与连接工具…'
    # Each release has its own directory. Never overwrite files used by another running release.
    if (-not (Test-Path -LiteralPath $target)) {
        New-Item -ItemType Directory -Path $target -Force | Out-Null
        foreach ($file in $manifest.files) {
            $to = Join-Path $target $file.path
            New-Item -ItemType Directory -Path (Split-Path -Parent $to) -Force | Out-Null
            Copy-Item -LiteralPath (Join-Path $source $file.path) -Destination $to
        }
        Copy-Item -LiteralPath (Join-Path $source 'manifest.json') -Destination (Join-Path $target 'manifest.json')
    } else {
        foreach ($file in $manifest.files) {
            $to = Join-Path $target $file.path
            if (-not (Test-Path -LiteralPath $to) -or (Get-CanvasHash $to) -ne $file.sha256) { throw '此版本的安装目录不完整，请关闭画布并移走该版本目录后重新安装。' }
        }
    }
    if (-not $NoShortcuts) {
        $shell = New-Object -ComObject WScript.Shell
        $startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) '无限画布'
        New-Item -ItemType Directory -Path $startMenu -Force | Out-Null
        foreach ($folder in @([Environment]::GetFolderPath('Desktop'), $startMenu)) {
            $shortcut = $shell.CreateShortcut((Join-Path $folder '无限画布.lnk'))
            $shortcut.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
            $shortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $target 'launch.ps1') + '"'
            $shortcut.WorkingDirectory = $target
            $shortcut.WindowStyle = 7
            $shortcut.Description = '打开无限画布，连接 ChatGPT 和 Google 账号'
            $shortcut.Save()
        }
        $quit = $shell.CreateShortcut((Join-Path $startMenu '退出无限画布.lnk'))
        $quit.TargetPath = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
        $quit.Arguments = '-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $target 'stop.ps1') + '"'
        $quit.WindowStyle = 7
        $quit.Save()
    }
    & $Progress '安装完成，正在打开画布…'
    if (-not $NoLaunch) {
        Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') -ArgumentList ('-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + (Join-Path $target 'launch.ps1') + '" -Setup') -WindowStyle Hidden
    }
    return $target
}

if ($Quiet) { Install-Canvas { param($text) Write-Host $text }; exit 0 }
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object Windows.Forms.Form
$form.Text = '安装无限画布'
$form.ClientSize = New-Object Drawing.Size(480, 210)
$form.StartPosition = 'CenterScreen'
$form.FormBorderStyle = 'FixedDialog'
$form.MaximizeBox = $false
$form.Font = New-Object Drawing.Font('Microsoft YaHei UI', 10)
$label = New-Object Windows.Forms.Label
$label.Location = New-Object Drawing.Point(24, 24)
$label.Size = New-Object Drawing.Size(430, 95)
$label.Text = "安装画布和本地连接工具。`n安装完成后，登录你的 ChatGPT 或 Google 账号即可开始。"
$form.Controls.Add($label)
$button = New-Object Windows.Forms.Button
$button.Text = '安装并打开'
$button.Location = New-Object Drawing.Point(315, 145)
$button.Size = New-Object Drawing.Size(140, 38)
$form.Controls.Add($button)
$button.Add_Click({
    $button.Enabled = $false
    try {
        Install-Canvas { param($text) $label.Text = $text; $label.Refresh() } | Out-Null
        $form.Close()
    } catch {
        $label.Text = '安装未完成，可重试。'
        [Windows.Forms.MessageBox]::Show($_.Exception.Message, '安装未完成') | Out-Null
        $button.Enabled = $true
    }
})
[Windows.Forms.Application]::Run($form)
