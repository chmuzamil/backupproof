# Friendly Restore Dashboard - Windows agent stub
param(
  [string]$ApiUrl = "http://localhost:8787/api",
  [Parameter(Mandatory=$true)][string]$Token,
  [string]$Name = $env:COMPUTERNAME
)

$body = @{ name = $Name; hostname = $env:COMPUTERNAME; platform = "win32"; token = $Token } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$ApiUrl/agents/register" -ContentType "application/json" -Body $body

while ($true) {
  try {
    Invoke-RestMethod -Method Post -Uri "$ApiUrl/agents/heartbeat" -ContentType "application/json" -Body (@{ token = $Token } | ConvertTo-Json)
  } catch {}
  Start-Sleep -Seconds 300
}
