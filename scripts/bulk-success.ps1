# Group 1: SUCCESS token bulk migration
# Replaces all green/emerald Tailwind color classes with semantic success tokens
# Opacity modifiers (/XX) are preserved automatically by simple substring replacement
# 
# Preserved exceptions:
# - neon-glow-green (custom CSS class in globals.css, not a Tailwind color)
# - hover:bg-emerald-800/50 (deliberately retained hover shade in DesktopHeader L113)
# - from-/via-/to- gradient stops (different visual concept, left for future work)
# - #hex colors (custom colors, not Tailwind classes)

$files = Get-ChildItem -Path src -Recurse -Include *.tsx,*.ts -ErrorAction SilentlyContinue
$totalFiles = 0
$totalLines = 0

foreach ($file in $files) {
    $content = Get-Content -Raw $file.FullName
    $original = $content

    # Text colors (base patterns; opacity modifiers preserved automatically)
    $content = $content.Replace('text-emerald-300', 'text-success')
    $content = $content.Replace('text-emerald-400', 'text-success')
    $content = $content.Replace('text-emerald-500', 'text-success')
    $content = $content.Replace('text-emerald-600', 'text-success')
    $content = $content.Replace('text-emerald-700', 'text-success')
    $content = $content.Replace('text-emerald-800', 'text-success')
    $content = $content.Replace('text-emerald-900', 'text-success')
    $content = $content.Replace('text-green-300', 'text-success')
    $content = $content.Replace('text-green-400', 'text-success')
    $content = $content.Replace('text-green-500', 'text-success')
    $content = $content.Replace('text-green-600', 'text-success')
    $content = $content.Replace('text-green-700', 'text-success')
    $content = $content.Replace('text-green-800', 'text-success')
    $content = $content.Replace('text-green-900', 'text-success')

    # Background colors
    $content = $content.Replace('bg-emerald-300', 'bg-success')
    $content = $content.Replace('bg-emerald-400', 'bg-success')
    $content = $content.Replace('bg-emerald-500', 'bg-success')
    $content = $content.Replace('bg-emerald-600', 'bg-success')
    $content = $content.Replace('bg-emerald-700', 'bg-success')
    $content = $content.Replace('bg-emerald-800', 'bg-success')
    $content = $content.Replace('bg-emerald-900', 'bg-success')
    $content = $content.Replace('bg-green-300', 'bg-success')
    $content = $content.Replace('bg-green-400', 'bg-success')
    $content = $content.Replace('bg-green-500', 'bg-success')
    $content = $content.Replace('bg-green-600', 'bg-success')
    $content = $content.Replace('bg-green-700', 'bg-success')
    $content = $content.Replace('bg-green-800', 'bg-success')
    $content = $content.Replace('bg-green-900', 'bg-success')

    # Border colors
    $content = $content.Replace('border-emerald-300', 'border-success')
    $content = $content.Replace('border-emerald-400', 'border-success')
    $content = $content.Replace('border-emerald-500', 'border-success')
    $content = $content.Replace('border-emerald-600', 'border-success')
    $content = $content.Replace('border-emerald-700', 'border-success')
    $content = $content.Replace('border-emerald-800', 'border-success')
    $content = $content.Replace('border-emerald-900', 'border-success')
    $content = $content.Replace('border-green-300', 'border-success')
    $content = $content.Replace('border-green-400', 'border-success')
    $content = $content.Replace('border-green-500', 'border-success')
    $content = $content.Replace('border-green-600', 'border-success')
    $content = $content.Replace('border-green-700', 'border-success')
    $content = $content.Replace('border-green-800', 'border-success')
    $content = $content.Replace('border-green-900', 'border-success')

    # Hover states (excluding the deliberate emerald-800/50 exception)
    $content = $content.Replace('hover:bg-emerald-500', 'hover:bg-success')
    $content = $content.Replace('hover:bg-emerald-600', 'hover:bg-success')
    $content = $content.Replace('hover:bg-emerald-700', 'hover:bg-success')
    $content = $content.Replace('hover:bg-green-500', 'hover:bg-success')
    $content = $content.Replace('hover:bg-green-600', 'hover:bg-success')
    $content = $content.Replace('hover:bg-green-700', 'hover:bg-success')
    $content = $content.Replace('hover:border-emerald-500', 'hover:border-success')
    $content = $content.Replace('hover:border-emerald-600', 'hover:border-success')
    $content = $content.Replace('hover:border-emerald-700', 'hover:border-success')
    $content = $content.Replace('hover:border-green-500', 'hover:border-success')
    $content = $content.Replace('hover:border-green-600', 'hover:border-success')
    $content = $content.Replace('hover:border-green-700', 'hover:border-success')
    $content = $content.Replace('hover:text-emerald-300', 'hover:text-success')
    $content = $content.Replace('hover:text-green-300', 'hover:text-success')

    if ($content -ne $original) {
        $diffLines = (Compare-Object ($original -split "`n") ($content -split "`n") | Measure-Object).Count
        Set-Content -Path $file.FullName -Value $content -NoNewline
        $totalFiles++
        $totalLines += $diffLines
        Write-Host "Updated: $($file.FullName) ($diffLines diff lines)"
    }
}
Write-Host ""
Write-Host "================================="
Write-Host "Total files updated: $totalFiles"
Write-Host "Total diff lines: $totalLines"
Write-Host "================================="
