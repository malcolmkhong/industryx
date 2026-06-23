# Removes consecutive duplicate `DROP POLICY IF EXISTS` statements
# (introduced when the idempotent-policies.ps1 script was run on a file
# that already had manual DROP POLICY IF EXISTS lines from a prior
# hand-cleanup). Deduplication is per-policy-name, keeping the first
# occurrence.

$ErrorActionPreference = 'Stop'

$migrationsDir = Join-Path $PSScriptRoot '..\supabase\migrations'
$files = Get-ChildItem -Path $migrationsDir -Filter '*.sql' -File

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    if ($content -notmatch 'DROP POLICY IF EXISTS') { continue }

    $lines = $content -split "`n"
    $out = @()
    $seen = @{}  # policy_name -> $true once we've emitted a DROP for it
    $i = 0
    while ($i -lt $lines.Count) {
        $line = $lines[$i]
        if ($line -match '^\s*DROP POLICY IF EXISTS\s+"(?<name>[^"]+)"\s+ON\s+(?<table>[\w\."]+)\s*;?\s*$') {
            $name = $matches['name']
            if ($seen.ContainsKey($name)) {
                # already saw this DROP — skip
                $i++
                continue
            }
            $seen[$name] = $true
        }
        $out += $line
        $i++
    }
    $newContent = ($out -join "`n")
    if ($newContent -ne $content) {
        Write-Host "Dedup $($file.Name)..."
        Set-Content -Path $file.FullName -Value $newContent -NoNewline -Encoding UTF8
    }
}

Write-Host "Done."
