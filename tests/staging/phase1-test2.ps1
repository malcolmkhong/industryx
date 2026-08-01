$fp = "fp-" + (Get-Date -Format "HHmmss")
Write-Host "Using test fingerprint: $fp"
Write-Host ""

$endpoints = @(
  @{ name="initialize-guest";  url="http://localhost:3000/api/auth/initialize-guest";   method="POST"; body="{`"deviceId`":`"d1-$fp`",`"fingerprintHash`":`"$fp`"}" },
  @{ name="recover-by-device"; url="http://localhost:3000/api/auth/recover-by-device";  method="POST"; body="{`"deviceId`":`"d2-$fp`",`"fingerprintHash`":`"$fp`"}" },
  @{ name="claim-guest";       url="http://localhost:3000/api/auth/claim-guest";        method="POST"; body="{`"newUserId`":`"00000000-0000-0000-0000-000000000000`",`"deviceId`":`"d3-$fp`"}" },
  @{ name="link-identity";     url="http://localhost:3000/api/auth/link-identity";      method="POST"; body="{`"idempotencyKey`":`"ik-$fp`",`"fingerprintHash`":`"$fp`"}" },
  @{ name="confirm-link";      url="http://localhost:3000/api/auth/confirm-link";       method="POST"; body="{`"idempotencyKey`":`"ik-c-$fp`"}" }
)

foreach ($e in $endpoints) {
  $status = "?"
  try {
    $req = [System.Net.HttpWebRequest]::Create($e.url)
    $req.Method = $e.method
    $req.ContentType = "application/json"
    $req.Timeout = 15000
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($e.body)
    $req.ContentLength = $bytes.Length
    $stream = $req.GetRequestStream()
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Close()
    $resp = $req.GetResponse()
    $status = $resp.StatusCode.value__
    $resp.Close()
  } catch [System.Net.WebException] {
    $status = $_.Exception.Response.StatusCode.value__
  }
  Write-Host "$($e.name): $status"
}

Write-Host ""
Write-Host "Waiting 3s for fire-and-forget writes..."
Start-Sleep -Seconds 3
Write-Host "Done. Now check request_ip_log via SQL."
