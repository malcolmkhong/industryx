# ============================================
# Rename all migrations to Supabase timestamp format
# ============================================
# Why: Supabase CLI compares disk files (parsed as <version>_<name>.sql)
# against the schema_migrations table. Our files use sequential numbers
# (000_xxx.sql) which the CLI cannot parse, causing:
#   "Remote migration versions not found in local migrations directory"
#
# This script:
# 1. Fetches the live DB migration list (version + name)
# 2. Maps each DB entry to a disk file by name (with or without prefix)
# 3. Renames disk file to <version>_<original_name>.sql via git mv
# 4. For DB entries with no disk match (and duplicates), creates a stub
# 5. For disk files with no DB match, assigns a fresh timestamp
#    AFTER the latest DB timestamp (so they are picked up as pending)
#
# Run: pwsh scripts/rename-migrations-to-timestamps.ps1
# ============================================

$ErrorActionPreference = 'Stop'

# --- 1. Fetch live DB migration list --------------------------------------
$supabaseToken = $env:SUPABASE_ACCESS_TOKEN
if (-not $supabaseToken) {
  $envFile = '.env'
  if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
      if ($_ -match '^SUPABASE_ACCESS_TOKEN=(.+)$') { $supabaseToken = $1 }
    }
  }
}
if (-not $supabaseToken) { throw 'SUPABASE_ACCESS_TOKEN not set' }

$dbMigrations = Invoke-RestMethod `
  -Uri 'https://api.supabase.com/v1/projects/wkkzqtseqwcyyyezroqq/database/migrations' `
  -Headers @{ Authorization = "Bearer $supabaseToken" }

Write-Host "DB has $($dbMigrations.Count) migrations"

# --- 2. Get disk files ------------------------------------------------------
$diskFiles = Get-ChildItem 'supabase/migrations/*.sql' | ForEach-Object { $_.Name }
Write-Host "Disk has $($diskFiles.Count) migrations"

# --- 3. Build rename map ----------------------------------------------------
$renames = @()      # @(@{old='x.sql'; new='20260611114348_x.sql'}, ...)
$stubs  = @()       # @(@{version='20260622141103'; name='053_xxx'}, ...)
$assignedDisk = @{}
$assignedDb = @{}

# 3a. For each DB entry, find matching disk file (by exact name or stripped prefix)
foreach ($db in $dbMigrations) {
  $dbName = $db.name
  $candidates = @()

  # Exact match: disk has "<dbName>.sql"
  $exact = "$dbName.sql"
  if ($diskFiles -contains $exact) { $candidates += $exact }

  # Stripped match: dbName like "016_rate_limits" → disk "016_rate_limits.sql" (same)
  # Also: dbName like "tradable_resources" → disk "013_tradable_resources.sql" or "000_tradable_resources.sql"

  # Try matching by suffix after underscore
  foreach ($f in $diskFiles) {
    if ($f -in $assignedDisk.Values) { continue }
    $baseNoExt = $f -replace '\.sql$', ''
    # exact match (already covered)
    if ($baseNoExt -eq $dbName) { if ($candidates -notcontains $f) { $candidates += $f } }
    # dbName has no prefix → disk has "<num>_<dbName>.sql"
    elseif ($dbName -notmatch '^\d' -and $baseNoExt -match "^\d+_$([regex]::Escape($dbName))$") {
      if ($candidates -notcontains $f) { $candidates += $f }
    }
  }

  if ($candidates.Count -eq 1) {
    $old = $candidates[0]
    $new = "$($db.version)_$dbName.sql"
    $renames += @{ old = $old; new = $new; version = $db.version; name = $dbName }
    $assignedDisk[$old] = $new
    $assignedDb[$db.version] = $old
  } elseif ($candidates.Count -gt 1) {
    Write-Host "AMBIGUOUS: DB $($db.version) $dbName matches $($candidates -join ', ')" -ForegroundColor Yellow
    # Pick the first unassigned one
    $pick = $candidates | Where-Object { $_ -notin $assignedDisk.Values } | Select-Object -First 1
    if ($pick) {
      $new = "$($db.version)_$dbName.sql"
      $renames += @{ old = $pick; new = $new; version = $db.version; name = $dbName }
      $assignedDisk[$pick] = $new
      $assignedDb[$db.version] = $pick
    } else {
      # All candidates already used → create a stub
      $stubs += @{ version = $db.version; name = $dbName }
      $assignedDb[$db.version] = '<stub>'
    }
  } else {
    # No match → create a stub
    $stubs += @{ version = $db.version; name = $dbName }
    $assignedDb[$db.version] = '<stub>'
  }
}

# --- 4. Disk files not assigned to any DB entry → assign fresh timestamp ---
$latestVersion = ($dbMigrations | ForEach-Object { [int64]$_.version } | Measure-Object -Maximum).Maximum
$diskCount = 0
foreach ($f in ($diskFiles | Sort-Object)) {
  if ($f -in $assignedDisk.Keys) { continue }
  $diskCount++
  # New timestamp: latest + (diskCount seconds)
  $newVersion = ([int64]$latestVersion + $diskCount).ToString()
  # Strip the leading numeric prefix from name to avoid double-numbering
  $baseNoExt = $f -replace '\.sql$', ''
  # Keep original name as-is (no prefix stripping) — Supabase accepts any name
  $new = "${newVersion}_${baseNoExt}.sql"
  $renames += @{ old = $f; new = $new; version = $newVersion; name = $baseNoExt; isNew = $true }
}

Write-Host ""
Write-Host "Rename plan: $($renames.Count) files"
Write-Host "Stubs to create: $($stubs.Count)"
Write-Host ""

# --- 5. Execute renames via git mv -----------------------------------------
foreach ($r in $renames) {
  $oldPath = "supabase/migrations/$($r.old)"
  $newPath = "supabase/migrations/$($r.new)"
  if (-not (Test-Path $oldPath)) {
    Write-Host "MISSING: $oldPath" -ForegroundColor Red
    continue
  }
  if (Test-Path $newPath) {
    Write-Host "TARGET EXISTS: $newPath" -ForegroundColor Red
    continue
  }
  git mv $oldPath $newPath 2>&1 | Out-Null
  Write-Host "git mv $($r.old) → $($r.new)"
}

# --- 6. Create stubs --------------------------------------------------------
foreach ($s in $stubs) {
  $newPath = "supabase/migrations/$($s.version)_$($s.name).sql"
  if (Test-Path $newPath) { Write-Host "STUB EXISTS: $newPath" -ForegroundColor Yellow; continue }
  $stubContent = @"
-- Stub migration: matches DB version $($s.version) but no source file found.
-- This file was auto-generated by scripts/rename-migrations-to-timestamps.ps1
-- The migration was applied directly to the DB at some prior point.
-- Re-applying here would error, so we use a no-op.

DO `$`$` BEGIN
  RAISE NOTICE 'Stub migration: $(([int64]$s.version))_$($s.name) (no-op)';
END `$`$`;

SELECT 1;
"@
  Set-Content -Path $newPath -Value $stubContent -Encoding utf8
  git add $newPath
  Write-Host "created stub: $($s.name)" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "Done. Run 'git status' to review, then commit." -ForegroundColor Green