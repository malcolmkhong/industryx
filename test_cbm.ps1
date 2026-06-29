# Test codebase-memory-mcp CLI
$ErrorActionPreference = "Continue"
$exe = "a:\industryx\industryx\tools\codebase-memory-mcp\codebase-memory-mcp.exe"
$json = '{"pattern": "useGameStore", "project": "A-industryx-industryx"}'

Write-Host "Testing search_code..."
& $exe cli search_code $json 2>&1

Write-Host "`nTesting search_graph..."
& $exe cli search_graph ('{"name_pattern": ".*useGameStore.*", "project": "A-industryx-industryx"}') 2>&1

Write-Host "`nTesting trace_path..."
& $exe cli trace_path ('{"function_name": "useGameStore", "direction": "both", "project": "A-industryx-industryx"}') 2>&1
