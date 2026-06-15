# Final pass: remaining Groups 1-4 patterns
# Adds specific opacity modifiers missed by previous scripts
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

    # Group 1: success
    $content = $content.Replace('border-emerald-500/20', 'border-success/20')

    # Group 2: muted
    $content = $content.Replace('text-gray-200', 'text-subtle')
    $content = $content.Replace('text-gray-100', 'text-subtle')

    # Group 3: warning
    $content = $content.Replace('border-warning/50', 'border-warning/50')
    $content = $content.Replace('border-amber-500/20', 'border-warning/20')
    $content = $content.Replace('border-amber-500/40', 'border-warning/40')
    $content = $content.Replace('border-yellow-900/40', 'border-warning/40')
    $content = $content.Replace('border-yellow-900/20', 'border-warning/20')
    $content = $content.Replace('bg-amber-500/15', 'bg-warning/15')
    $content = $content.Replace('bg-yellow-500/15', 'bg-warning/15')
    $content = $content.Replace('hover:bg-yellow-400', 'hover:bg-warning')
    $content = $content.Replace('hover:bg-amber-400', 'hover:bg-warning')
    $content = $content.Replace('hover:bg-amber-500', 'hover:bg-warning')
    $content = $content.Replace('hover:text-amber-400', 'hover:text-warning')
    $content = $content.Replace('hover:text-yellow-400', 'hover:text-warning')

    # Group 4: danger
    $content = $content.Replace('border-red-500/20', 'border-danger/20')
    $content = $content.Replace('border-red-500/40', 'border-danger/40')
    $content = $content.Replace('border-red-900/40', 'border-danger/40')
    $content = $content.Replace('border-red-900/20', 'border-danger/20')
    $content = $content.Replace('bg-red-500/15', 'bg-danger/15')
    $content = $content.Replace('bg-red-500/10', 'bg-danger/10')
    $content = $content.Replace('bg-red-900/10', 'bg-danger/10')
    $content = $content.Replace('text-red-300', 'text-danger')
    $content = $content.Replace('hover:bg-red-500', 'hover:bg-danger')
    $content = $content.Replace('hover:bg-red-400', 'hover:bg-danger')
    $content = $content.Replace('hover:text-red-400', 'hover:text-danger')
    $content = $content.Replace('hover:border-red-500', 'hover:border-danger')
    $content = $content.Replace('hover:border-red-500/30', 'hover:border-danger/30')

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
