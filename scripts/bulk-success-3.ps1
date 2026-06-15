# Group 1 third pass: remaining green/emerald patterns
$excluded = @('tierColors', 'gameStateValidator', 'marketSimulator', 'settingsStore')
$files = Get-ChildItem -Path src -Recurse -Include *.tsx,*.ts -ErrorAction SilentlyContinue
$filtered = @()
foreach ($f in $files) {
    $skip = $false
    foreach ($ex in $excluded) {
        if ($f.FullName -like "*$ex*") { $skip = $true; break }
    }
    if (-not $skip) { $filtered += $f }
}

$totalFiles = 0
$totalChanges = 0

foreach ($file in $filtered) {
    $content = Get-Content -Raw $file.FullName
    $original = $content

    # Remaining specific patterns
    $content = $content.Replace('hover:bg-emerald-400', 'hover:bg-success')
    $content = $content.Replace('text-green-600', 'text-success')
    $content = $content.Replace('border-green-700/30', 'border-success/30')
    $content = $content.Replace('border-green-700/40', 'border-success/40')
    $content = $content.Replace('border-green-700', 'border-success')
    $content = $content.Replace('border-green-900/40', 'border-success/40')
    $content = $content.Replace('hover:border-green-700/30', 'hover:border-success/30')
    $content = $content.Replace('hover:border-green-700', 'hover:border-success')
    $content = $content.Replace('hover:border-green-500/40', 'hover:border-success/40')
    $content = $content.Replace('hover:border-emerald-500/40', 'hover:border-success/40')
    $content = $content.Replace('hover:border-emerald-500/50', 'hover:border-success/50')
    $content = $content.Replace('hover:border-emerald-500/60', 'hover:border-success/60')

    if ($content -ne $original) {
        $diffLines = (Compare-Object ($original -split "`n") ($content -split "`n") | Measure-Object).Count
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $totalFiles++
        $totalChanges += $diffLines
        Write-Host "Updated: $($file.FullName) ($diffLines diff lines)"
    }
}
Write-Host ""
Write-Host "================================="
Write-Host "Total files updated: $totalFiles"
Write-Host "Total diff lines: $totalChanges"
Write-Host "================================="
