# Group 1 third pass: remaining green/emerald + Groups 2-4 bulk migration
# Optimized for maximum safe migration throughput

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

$totalChanges = 0
$totalFiles = 0

foreach ($file in $filtered) {
    $content = Get-Content -Raw $file.FullName
    $original = $content

    # Group 1 third pass: remaining green/emerald
    $content = $content.Replace('border-green-700', 'border-success')
    $content = $content.Replace('border-green-900/40', 'border-success/40')
    $content = $content.Replace('border-green-800/60', 'border-success/60')
    $content = $content.Replace('border-green-800/70', 'border-success/70')
    $content = $content.Replace('border-green-700/30', 'border-success/30')
    $content = $content.Replace('border-green-700/40', 'border-success/40')
    $content = $content.Replace('border-green-700/50', 'border-success/50')
    $content = $content.Replace('border-green-700/60', 'border-success/60')
    $content = $content.Replace('border-green-700/70', 'border-success/70')
    $content = $content.Replace('bg-green-900/5', 'bg-success/5')
    $content = $content.Replace('bg-green-900/25', 'bg-success/25')
    $content = $content.Replace('text-green-600', 'text-success')
    $content = $content.Replace('text-green-800', 'text-success')
    $content = $content.Replace('hover:bg-emerald-400', 'hover:bg-success')
    $content = $content.Replace('hover:border-green-700', 'hover:border-success')
    $content = $content.Replace('border-emerald-500/20', 'border-success/20')
    $content = $content.Replace('border-emerald-900/30', 'border-success/30')
    $content = $content.Replace('border-emerald-900/40', 'border-success/40')
    $content = $content.Replace('bg-emerald-600', 'bg-success')
    $content = $content.Replace('border-green-500/40', 'border-success/40')
    $content = $content.Replace('border-green-600/50', 'border-success/50')
    $content = $content.Replace('border-green-400/40', 'border-success/40')
    $content = $content.Replace('border-green-900/20', 'border-success/20')

    # Group 2: MUTED (gray/slate)
    # text-gray-300/400 → text-subtle
    $content = $content.Replace('text-gray-300', 'text-subtle')
    $content = $content.Replace('text-gray-400', 'text-subtle')
    # text-gray-500/600 → text-muted-label
    $content = $content.Replace('text-gray-500', 'text-muted-label')
    $content = $content.Replace('text-gray-600', 'text-muted-label')
    # text-gray-700/800/900 → text-dim
    $content = $content.Replace('text-gray-700', 'text-dim')
    $content = $content.Replace('text-gray-800', 'text-dim')
    $content = $content.Replace('text-gray-900', 'text-dim')
    # bg-gray-500/600/700/800/900 → bg-muted-label
    $content = $content.Replace('bg-gray-500', 'bg-muted-label')
    $content = $content.Replace('bg-gray-600', 'bg-muted-label')
    $content = $content.Replace('bg-gray-700', 'bg-muted-label')
    $content = $content.Replace('bg-gray-800', 'bg-muted-label')
    $content = $content.Replace('bg-gray-900', 'bg-muted-label')
    # border-gray-500/600/700/800 → border-muted-label
    $content = $content.Replace('border-gray-500', 'border-muted-label')
    $content = $content.Replace('border-gray-600', 'border-muted-label')
    $content = $content.Replace('border-gray-700', 'border-muted-label')
    $content = $content.Replace('border-gray-800', 'border-muted-label')
    $content = $content.Replace('border-gray-900', 'border-muted-label')

    # Group 3: WARNING (yellow/amber)
    # text-yellow-300/400/500 → text-warning
    $content = $content.Replace('text-yellow-300', 'text-warning')
    $content = $content.Replace('text-yellow-400', 'text-warning')
    $content = $content.Replace('text-yellow-500', 'text-warning')
    $content = $content.Replace('text-amber-300', 'text-warning')
    $content = $content.Replace('text-amber-400', 'text-warning')
    $content = $content.Replace('text-amber-500', 'text-warning')
    # bg-yellow-500 → bg-warning
    $content = $content.Replace('bg-yellow-300', 'bg-warning')
    $content = $content.Replace('bg-yellow-400', 'bg-warning')
    $content = $content.Replace('bg-yellow-500', 'bg-warning')
    $content = $content.Replace('bg-amber-400', 'bg-warning')
    $content = $content.Replace('bg-amber-500', 'bg-warning')
    # border-yellow-500 → border-warning
    $content = $content.Replace('border-yellow-400', 'border-warning')
    $content = $content.Replace('border-yellow-500', 'border-warning')
    $content = $content.Replace('border-amber-400', 'border-warning')
    $content = $content.Replace('border-amber-500', 'border-warning')

    # Group 4: DANGER (red)
    # text-red-400/500 → text-danger
    $content = $content.Replace('text-red-300', 'text-danger')
    $content = $content.Replace('text-red-400', 'text-danger')
    $content = $content.Replace('text-red-500', 'text-danger')
    $content = $content.Replace('text-red-600', 'text-danger')
    # bg-red-500 → bg-danger
    $content = $content.Replace('bg-red-300', 'bg-danger')
    $content = $content.Replace('bg-red-400', 'bg-danger')
    $content = $content.Replace('bg-red-500', 'bg-danger')
    $content = $content.Replace('bg-red-600', 'bg-danger')
    $content = $content.Replace('bg-red-700', 'bg-danger')
    $content = $content.Replace('bg-red-800', 'bg-danger')
    $content = $content.Replace('bg-red-900', 'bg-danger')
    # border-red-500 → border-danger
    $content = $content.Replace('border-red-400', 'border-danger')
    $content = $content.Replace('border-red-500', 'border-danger')
    $content = $content.Replace('border-red-600', 'border-danger')
    $content = $content.Replace('border-red-700', 'border-danger')
    $content = $content.Replace('border-red-800', 'border-danger')

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
