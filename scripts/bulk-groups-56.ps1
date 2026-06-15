# Groups 5-6: INDUSTRIAL + DOMAIN bulk migration
# Maps all cyan/blue/sky/teal/indigo → brand/industrial
# Maps purple/violet/fuchsia/pink → research
# Maps orange → domain
# Maps red/rose → danger (already done in Group 4)
# Maps emerald/lime → success (already done in Group 1)
# Maps amber/yellow → warning (already done in Group 3)

$excluded = @('tierColors', 'gameStateValidator', 'marketSimulator', 'settingsStore', 'globals.css')
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

    # Group 5: INDUSTRIAL (cyan/blue/sky/teal/indigo)
    # All map to text-brand / bg-brand / border-brand
    $content = $content.Replace('text-cyan-300', 'text-brand')
    $content = $content.Replace('text-cyan-400', 'text-brand')
    $content = $content.Replace('text-cyan-500', 'text-brand')
    $content = $content.Replace('text-cyan-600', 'text-brand')
    $content = $content.Replace('bg-cyan-300', 'bg-brand')
    $content = $content.Replace('bg-cyan-400', 'bg-brand')
    $content = $content.Replace('bg-cyan-500', 'bg-brand')
    $content = $content.Replace('bg-cyan-600', 'bg-brand')
    $content = $content.Replace('bg-cyan-700', 'bg-brand')
    $content = $content.Replace('bg-cyan-800', 'bg-brand')
    $content = $content.Replace('bg-cyan-900', 'bg-brand')
    $content = $content.Replace('border-cyan-300', 'border-brand')
    $content = $content.Replace('border-cyan-400', 'border-brand')
    $content = $content.Replace('border-cyan-500', 'border-brand')
    $content = $content.Replace('border-cyan-600', 'border-brand')
    $content = $content.Replace('border-cyan-700', 'border-brand')
    $content = $content.Replace('border-cyan-800', 'border-brand')
    $content = $content.Replace('border-cyan-900', 'border-brand')

    # text-blue/sky/teal/indigo → text-brand
    $content = $content.Replace('text-blue-300', 'text-brand')
    $content = $content.Replace('text-blue-400', 'text-brand')
    $content = $content.Replace('text-blue-500', 'text-brand')
    $content = $content.Replace('text-sky-300', 'text-brand')
    $content = $content.Replace('text-sky-400', 'text-brand')
    $content = $content.Replace('text-sky-500', 'text-brand')
    $content = $content.Replace('text-teal-300', 'text-brand')
    $content = $content.Replace('text-teal-400', 'text-brand')
    $content = $content.Replace('text-teal-500', 'text-brand')
    $content = $content.Replace('text-indigo-300', 'text-brand')
    $content = $content.Replace('text-indigo-400', 'text-brand')
    $content = $content.Replace('text-indigo-500', 'text-brand')

    # bg-blue/sky/teal/indigo → bg-brand
    $content = $content.Replace('bg-blue-300', 'bg-brand')
    $content = $content.Replace('bg-blue-400', 'bg-brand')
    $content = $content.Replace('bg-blue-500', 'bg-brand')
    $content = $content.Replace('bg-blue-600', 'bg-brand')
    $content = $content.Replace('bg-blue-700', 'bg-brand')
    $content = $content.Replace('bg-blue-800', 'bg-brand')
    $content = $content.Replace('bg-blue-900', 'bg-brand')
    $content = $content.Replace('bg-sky-300', 'bg-brand')
    $content = $content.Replace('bg-sky-400', 'bg-brand')
    $content = $content.Replace('bg-sky-500', 'bg-brand')
    $content = $content.Replace('bg-sky-600', 'bg-brand')
    $content = $content.Replace('bg-sky-700', 'bg-brand')
    $content = $content.Replace('bg-sky-800', 'bg-brand')
    $content = $content.Replace('bg-sky-900', 'bg-brand')
    $content = $content.Replace('bg-teal-300', 'bg-brand')
    $content = $content.Replace('bg-teal-400', 'bg-brand')
    $content = $content.Replace('bg-teal-500', 'bg-brand')
    $content = $content.Replace('bg-teal-600', 'bg-brand')
    $content = $content.Replace('bg-teal-700', 'bg-brand')
    $content = $content.Replace('bg-teal-800', 'bg-brand')
    $content = $content.Replace('bg-teal-900', 'bg-brand')
    $content = $content.Replace('bg-indigo-500', 'bg-brand')
    $content = $content.Replace('bg-indigo-600', 'bg-brand')
    $content = $content.Replace('bg-indigo-700', 'bg-brand')
    $content = $content.Replace('bg-indigo-800', 'bg-brand')
    $content = $content.Replace('bg-indigo-900', 'bg-brand')

    # border-blue/sky/teal/indigo → border-brand
    $content = $content.Replace('border-blue-300', 'border-brand')
    $content = $content.Replace('border-blue-400', 'border-brand')
    $content = $content.Replace('border-blue-500', 'border-brand')
    $content = $content.Replace('border-blue-600', 'border-brand')
    $content = $content.Replace('border-blue-700', 'border-brand')
    $content = $content.Replace('border-blue-800', 'border-brand')
    $content = $content.Replace('border-blue-900', 'border-brand')
    $content = $content.Replace('border-sky-300', 'border-brand')
    $content = $content.Replace('border-sky-400', 'border-brand')
    $content = $content.Replace('border-sky-500', 'border-brand')
    $content = $content.Replace('border-sky-600', 'border-brand')
    $content = $content.Replace('border-sky-700', 'border-brand')
    $content = $content.Replace('border-sky-800', 'border-brand')
    $content = $content.Replace('border-sky-900', 'border-brand')
    $content = $content.Replace('border-teal-500', 'border-brand')
    $content = $content.Replace('border-teal-600', 'border-brand')
    $content = $content.Replace('border-teal-700', 'border-brand')
    $content = $content.Replace('border-teal-800', 'border-brand')
    $content = $content.Replace('border-teal-900', 'border-brand')
    $content = $content.Replace('border-indigo-500', 'border-brand')
    $content = $content.Replace('border-indigo-600', 'border-brand')
    $content = $content.Replace('border-indigo-700', 'border-brand')
    $content = $content.Replace('border-indigo-800', 'border-brand')
    $content = $content.Replace('border-indigo-900', 'border-brand')

    # Group 6: DOMAIN (purple/violet/fuchsia/pink → research)
    $content = $content.Replace('text-purple-300', 'text-research')
    $content = $content.Replace('text-purple-400', 'text-research')
    $content = $content.Replace('text-purple-500', 'text-research')
    $content = $content.Replace('text-purple-600', 'text-research')
    $content = $content.Replace('bg-purple-300', 'bg-research')
    $content = $content.Replace('bg-purple-400', 'bg-research')
    $content = $content.Replace('bg-purple-500', 'bg-research')
    $content = $content.Replace('bg-purple-600', 'bg-research')
    $content = $content.Replace('bg-purple-700', 'bg-research')
    $content = $content.Replace('bg-purple-800', 'bg-research')
    $content = $content.Replace('bg-purple-900', 'bg-research')
    $content = $content.Replace('border-purple-500', 'border-research')
    $content = $content.Replace('border-purple-600', 'border-research')
    $content = $content.Replace('border-purple-700', 'border-research')
    $content = $content.Replace('border-purple-800', 'border-research')
    $content = $content.Replace('border-purple-900', 'border-research')

    # violet/fuchsia/pink → research (close semantic match)
    $content = $content.Replace('text-violet-300', 'text-research')
    $content = $content.Replace('text-violet-400', 'text-research')
    $content = $content.Replace('text-violet-500', 'text-research')
    $content = $content.Replace('text-fuchsia-300', 'text-premium')
    $content = $content.Replace('text-fuchsia-400', 'text-premium')
    $content = $content.Replace('text-fuchsia-500', 'text-premium')
    $content = $content.Replace('text-pink-300', 'text-premium')
    $content = $content.Replace('text-pink-400', 'text-premium')
    $content = $content.Replace('text-pink-500', 'text-premium')
    $content = $content.Replace('bg-pink-500', 'bg-premium')
    $content = $content.Replace('bg-pink-600', 'bg-premium')
    $content = $content.Replace('bg-pink-700', 'bg-premium')
    $content = $content.Replace('bg-pink-800', 'bg-premium')
    $content = $content.Replace('bg-pink-900', 'bg-premium')
    $content = $content.Replace('border-pink-500', 'border-premium')
    $content = $content.Replace('border-pink-600', 'border-premium')
    $content = $content.Replace('border-pink-700', 'border-premium')
    $content = $content.Replace('border-pink-800', 'border-premium')

    # orange → domain (Tier 2, transport, events)
    $content = $content.Replace('text-orange-300', 'text-domain')
    $content = $content.Replace('text-orange-400', 'text-domain')
    $content = $content.Replace('text-orange-500', 'text-domain')
    $content = $content.Replace('text-orange-600', 'text-domain')
    $content = $content.Replace('bg-orange-500', 'bg-domain')
    $content = $content.Replace('bg-orange-600', 'bg-domain')
    $content = $content.Replace('bg-orange-700', 'bg-domain')
    $content = $content.Replace('bg-orange-800', 'bg-domain')
    $content = $content.Replace('bg-orange-900', 'bg-domain')
    $content = $content.Replace('border-orange-500', 'border-domain')
    $content = $content.Replace('border-orange-600', 'border-domain')
    $content = $content.Replace('border-orange-700', 'border-domain')
    $content = $content.Replace('border-orange-800', 'border-domain')
    $content = $content.Replace('border-orange-900', 'border-domain')

    # lime → success (lime is a lighter green, similar to text-green-300/400)
    $content = $content.Replace('text-lime-400', 'text-success')
    $content = $content.Replace('bg-lime-400', 'bg-success')

    # rose → danger (rose is a pinkish-red, similar to red-400)
    $content = $content.Replace('text-rose-300', 'text-danger')
    $content = $content.Replace('text-rose-400', 'text-danger')
    $content = $content.Replace('text-rose-500', 'text-danger')
    $content = $content.Replace('bg-rose-500', 'bg-danger')
    $content = $content.Replace('bg-rose-600', 'bg-danger')
    $content = $content.Replace('bg-rose-700', 'bg-danger')
    $content = $content.Replace('bg-rose-800', 'bg-danger')
    $content = $content.Replace('bg-rose-900', 'bg-danger')

    # Opacity modifiers preserved automatically by simple substring replacement

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
