$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime\node.exe'))
# Only this installed release's runtime is owned here. Never stop system Node or another canvas checkout.
$owned = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.ExecutablePath -eq $runtime }
foreach ($item in $owned) {
    $current = Get-Process -Id $item.ProcessId -ErrorAction SilentlyContinue
    if ($current -and $current.Path -eq $runtime) {
        & (Join-Path $env:SystemRoot 'System32\taskkill.exe') /PID $item.ProcessId /T /F 2>$null | Out-Null
    }
}
