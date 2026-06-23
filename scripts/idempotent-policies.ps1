# Adds DROP POLICY IF EXISTS before every CREATE POLICY in supabase/migrations/*.sql
# so migrations are idempotent against a Supabase preview that already has
# the policies from a `supabase db pull` of the live database.

$ErrorActionPreference = 'Stop'

$migrationsDir = Join-Path $PSScriptRoot '..\supabase\migrations'
$files = Get-ChildItem -Path $migrationsDir -Filter '*.sql' -File

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw
    if ($content -notmatch 'CREATE POLICY') { continue }
    if ($content -match 'DROP POLICY IF EXISTS') { continue }  # already fixed

    Write-Host "Patching $($file.Name)..."

    # Use a regex that captures:
    #   (1) the policy name in quotes after CREATE POLICY
    #   (2) the ON <table> clause
    # We insert `DROP POLICY IF EXISTS <name> ON <table>;` before each CREATE POLICY.
    $pattern = '(?ms)(CREATE POLICY\s+)(?<name>"[^"]+")(\s+ON\s+(?<table>[\w\."]+))'

    $newContent = [regex]::Replace(
        $content,
        $pattern,
        {
            param($m)
            $name = $m.Groups['name'].Value
            $table = $m.Groups['table'].Value
            return "DROP POLICY IF EXISTS $name ON $table;`n$($m.Value)"
        }
    )

    Set-Content -Path $file.FullName -Value $newContent -NoNewline -Encoding UTF8
}

Write-Host "Done."
