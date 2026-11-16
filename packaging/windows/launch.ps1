param([switch]$Setup)
$ErrorActionPreference = 'Stop'
try {
    $arguments = @((Join-Path $PSScriptRoot 'launcher.mjs'))
    if ($Setup) { $arguments += '--setup' }
    $output = & (Join-Path $PSScriptRoot 'runtime\node.exe') @arguments 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($output -join "`n") }
} catch {
    Add-Type -AssemblyName System.Windows.Forms
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, '无限画布启动失败') | Out-Null
}
