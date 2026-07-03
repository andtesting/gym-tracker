# Curl fixture suite for the ingest-health edge function (docs/HEALTH_SYNC_PLAN.md s.9).
# Token-dependent tests need health_ingest_token filled in .secrets.local.json
# (fetch it once: Supabase Dashboard > SQL Editor >
#   select value from health.config where key = 'INGEST_TOKEN';)
# Without a token, the auth-independent tests (405/401/413) still run.
#
# Writes fixture rows tagged source='curl-fixture' into live health.* tables.
# Clean up afterwards in the SQL Editor:
#   delete from health.workouts where source = 'curl-fixture';
#   delete from health.samples  where source = 'curl-fixture';
#   delete from health.ingest_log;  -- if you want the fixture batches gone too

param(
  [string]$Token,
  [string]$Url = 'https://fvgussmhzuiihhrhnymq.supabase.co/functions/v1/ingest-health'
)

$ErrorActionPreference = 'Stop'
$fixtures = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $fixtures '..\..\..')).Path

if (-not $Token) {
  $secretsPath = Join-Path $repoRoot '.secrets.local.json'
  if (Test-Path $secretsPath) {
    $secrets = Get-Content $secretsPath -Raw | ConvertFrom-Json
    $Token = $secrets.health_ingest_token
  }
}

$results = @()
function Invoke-Test {
  param([string]$Name, [string]$Expect, [scriptblock]$Call)
  $tmp = [IO.Path]::GetTempFileName()
  try {
    $code = & $Call $tmp
    $body = Get-Content $tmp -Raw -ErrorAction SilentlyContinue
    $pass = $code -eq $Expect
    $script:results += [pscustomobject]@{ Test = $Name; Expected = $Expect; Got = $code; Pass = $pass; Body = $body }
    $status = if ($pass) { 'PASS' } else { 'FAIL' }
    Write-Host ("[{0}] {1}: expected {2}, got {3}" -f $status, $Name, $Expect, $code)
    if (-not $pass) { Write-Host ("       body: {0}" -f $body) }
    return $body
  } finally {
    Remove-Item $tmp -Force -ErrorAction SilentlyContinue
  }
}

Invoke-Test 'GET method' '405' { param($o) curl.exe -s --max-time 30 -o $o -w '%{http_code}' $Url } | Out-Null
Invoke-Test 'wrong token' '401' { param($o) curl.exe -s --max-time 30 -o $o -w '%{http_code}' -X POST -H 'Authorization: Bearer wrong-token' -H 'Content-Type: application/json' -d '{"batch_kind":"daily"}' $Url } | Out-Null

$big = [IO.Path]::GetTempFileName()
'x' * 6MB | Out-File -Encoding ascii -NoNewline $big
Invoke-Test 'oversized 6MB' '413' { param($o) curl.exe -s --max-time 120 -o $o -w '%{http_code}' -X POST -H 'Authorization: Bearer wrong-token' -H 'Content-Type: application/json' --data-binary "@$big" $Url } | Out-Null
Remove-Item $big -Force

if (-not $Token -or $Token -eq 'PASTE_FROM_DASHBOARD') {
  Write-Host "`nNo health_ingest_token in .secrets.local.json - skipping the token-dependent tests (valid batch, duplicate resend, malformed batch)."
} else {
  $valid = Join-Path $fixtures 'valid-daily.json'
  $malformed = Join-Path $fixtures 'malformed-sample.json'
  $auth = "Authorization: Bearer $Token"

  $first = Invoke-Test 'valid daily batch' '200' { param($o) curl.exe -s --max-time 60 -o $o -w '%{http_code}' -X POST -H $auth -H 'Content-Type: application/json' --data-binary "@$valid" $Url }
  $second = Invoke-Test 'duplicate resend' '200' { param($o) curl.exe -s --max-time 60 -o $o -w '%{http_code}' -X POST -H $auth -H 'Content-Type: application/json' --data-binary "@$valid" $Url }
  if ($second) {
    $counts = ($second | ConvertFrom-Json).counts
    $idempotent = ($counts.workouts_new -eq 0) -and ($counts.samples_new -eq 0)
    $status = if ($idempotent) { 'PASS' } else { 'FAIL' }
    $script:results += [pscustomobject]@{ Test = 'resend is no-op (counts *_new = 0)'; Expected = '0/0'; Got = "$($counts.workouts_new)/$($counts.samples_new)"; Pass = $idempotent; Body = $second }
    Write-Host ("[{0}] resend is no-op: workouts_new={1} samples_new={2}" -f $status, $counts.workouts_new, $counts.samples_new)
  }
  Invoke-Test 'malformed batch' '400' { param($o) curl.exe -s --max-time 60 -o $o -w '%{http_code}' -X POST -H $auth -H 'Content-Type: application/json' --data-binary "@$malformed" $Url } | Out-Null
}

$failed = @($results | Where-Object { -not $_.Pass })
Write-Host ("`n{0}/{1} passed" -f (@($results | Where-Object Pass).Count), $results.Count)
if ($failed.Count -gt 0) { exit 1 }
