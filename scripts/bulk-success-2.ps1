# Group 1 second pass: remaining green/emerald patterns
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

    $content = $content.Replace('border-emerald-500/20', 'border-success/20')
    $content = $content.Replace('border-emerald-500/40', 'border-success/40')
    $content = $content.Replace('border-emerald-500/60', 'border-success/60')
    $content = $content.Replace('border-emerald-500/70', 'border-success/70')
    $content = $content.Replace('border-emerald-800/30', 'border-success/30')
    $content = $content.Replace('border-emerald-800/40', 'border-success/40')
    $content = $content.Replace('border-emerald-800/50', 'border-success/50')
    $content = $content.Replace('bg-emerald-900/10', 'bg-success/10')
    $content = $content.Replace('bg-emerald-900/15', 'bg-success/15')
    $content = $content.Replace('bg-emerald-900/25', 'bg-success/25')
    $content = $content.Replace('bg-emerald-900/40', 'bg-success/40')
    $content = $content.Replace('bg-emerald-900/50', 'bg-success/50')
    $content = $content.Replace('bg-emerald-900/60', 'bg-success/60')
    $content = $content.Replace('bg-emerald-900/70', 'bg-success/70')
    $content = $content.Replace('bg-green-900/10', 'bg-success/10')
    $content = $content.Replace('bg-green-900/15', 'bg-success/15')
    $content = $content.Replace('bg-green-900/40', 'bg-success/40')
    $content = $content.Replace('bg-green-900/50', 'bg-success/50')
    $content = $content.Replace('bg-green-900/60', 'bg-success/60')
    $content = $content.Replace('bg-green-900/70', 'bg-success/70')
    $content = $content.Replace('bg-green-800/40', 'bg-success/40')
    $content = $content.Replace('bg-green-800/50', 'bg-success/50')
    $content = $content.Replace('bg-green-800/60', 'bg-success/60')
    $content = $content.Replace('bg-green-800/70', 'bg-success/70')
    $content = $content.Replace('bg-green-700/40', 'bg-success/40')
    $content = $content.Replace('bg-green-700/50', 'bg-success/50')
    $content = $content.Replace('bg-green-700/60', 'bg-success/60')
    $content = $content.Replace('bg-green-700/70', 'bg-success/70')
    $content = $content.Replace('border-green-800/30', 'border-success/30')
    $content = $content.Replace('border-green-800/40', 'border-success/40')
    $content = $content.Replace('border-green-800/50', 'border-success/50')
    $content = $content.Replace('border-green-700/40', 'border-success/40')
    $content = $content.Replace('border-green-700/50', 'border-success/50')
    $content = $content.Replace('bg-emerald-400', 'bg-success')
    $content = $content.Replace('text-green-700', 'text-success')

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
