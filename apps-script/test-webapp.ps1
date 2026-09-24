[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$Endpoint,

  [ValidateSet("ping", "upload", "duplicate", "validation", "concurrency", "near-limit", "all")]
  [string]$Mode = "all",

  [string]$RequestId
)

$ErrorActionPreference = "Stop"

if ($Endpoint -match "DEPLOYMENT_ID|script\.google\.com/d/" -or $Endpoint -notmatch "/exec/?$") {
  throw "Endpoint phải là URL Web App thật kết thúc bằng /exec, không dùng URL editor hoặc DEPLOYMENT_ID mẫu."
}

function Invoke-DigitalQcRequest {
  param(
    [hashtable]$Body,
    [switch]$AllowFailure
  )

  $json = $Body | ConvertTo-Json -Depth 10 -Compress
  try {
    $result = Invoke-RestMethod -Method Post -Uri $Endpoint -ContentType "application/json" -Body $json
  } catch {
    throw "Không gọi được Web App: $($_.Exception.Message)"
  }

  $result | ConvertTo-Json -Depth 10
  if (-not $result.success -and -not $AllowFailure) {
    throw "Apps Script trả lỗi $($result.code): $($result.message)"
  }

  return $result
}

function Get-Sha256 {
  param([byte[]]$Bytes)
  $hasher = [Security.Cryptography.SHA256]::Create()
  try {
    return [BitConverter]::ToString($hasher.ComputeHash($Bytes)).Replace("-", "").ToLowerInvariant()
  } finally {
    $hasher.Dispose()
  }
}

function New-UploadBody {
  param(
    [string]$UploadRequestId,
    [byte[]]$PdfBytes,
    [string]$Sha256Override
  )
  $sha256 = if ($Sha256Override) { $Sha256Override } else { Get-Sha256 $PdfBytes }
  return @{
    action = "upload_qc_pdf"
    api_version = 1
    data = @{
      request_id = $UploadRequestId
      product_key = "CLASP-TEST-001"
      project = "DIGITAL-QC-TEST"
      po = "PO-CLASP-TEST"
      part_no = "CLASP-TEST-001"
      lot_no = "LOT-TEST"
      supplier = "TEST"
      quantity = 1
      unit = "PCS"
      slip_no = "NK-CLASP-TEST"
      received_date = (Get-Date).ToString("yyyy-MM-dd")
      page_count = 1
      size_bytes = $PdfBytes.Length
      sha256 = $sha256
      pdf_base64 = [Convert]::ToBase64String($PdfBytes)
    }
  }
}

function New-SmallPdfBytes {
  return [Text.Encoding]::ASCII.GetBytes("%PDF-1.4`n1 0 obj`n<<>>`nendobj`ntrailer`n<<>>`n%%EOF`n")
}

function Assert-ExpectedError {
  param(
    [hashtable]$Body,
    [string]$Code
  )
  $result = Invoke-DigitalQcRequest $Body -AllowFailure
  if ($result.success -or $result.code -ne $Code) {
    throw "Expected server code $Code but received $($result | ConvertTo-Json -Compress)"
  }
  Write-Host "  expected $Code" -ForegroundColor DarkGray
}

Write-Host "Digital QC Apps Script test: $Endpoint" -ForegroundColor Cyan

if ($Mode -in @("ping", "all")) {
  Write-Host "`n[1/2] ping" -ForegroundColor Yellow
  Invoke-DigitalQcRequest @{ action = "ping"; api_version = 1 } | Out-Null
}

if ($Mode -in @("upload", "all")) {
  Write-Host "`n[2] upload_qc_pdf" -ForegroundColor Yellow
  $pdfBytes = New-SmallPdfBytes
  $requestId = if ($RequestId) { $RequestId } else { "clasp-test-" + [Guid]::NewGuid().ToString("N") }
  Invoke-DigitalQcRequest (New-UploadBody $requestId $pdfBytes) | Out-Null
}

if ($Mode -in @("duplicate", "all")) {
  Write-Host "`n[3] duplicate request_id" -ForegroundColor Yellow
  $pdfBytes = New-SmallPdfBytes
  $requestId = "clasp-duplicate-" + [Guid]::NewGuid().ToString("N")
  Invoke-DigitalQcRequest (New-UploadBody $requestId $pdfBytes) | Out-Null
  $duplicate = Invoke-DigitalQcRequest (New-UploadBody $requestId $pdfBytes)
  if (-not $duplicate.duplicate) { throw "The second request with the same request_id was not marked duplicate." }
  Write-Host "  duplicate=true" -ForegroundColor DarkGray
}

if ($Mode -in @("validation", "all")) {
  Write-Host "`n[4] validation errors" -ForegroundColor Yellow
  $pdfBytes = New-SmallPdfBytes
  Assert-ExpectedError (New-UploadBody ("clasp-bad-sha-" + [Guid]::NewGuid().ToString("N")) $pdfBytes (("0" * 64))) "HASH_MISMATCH"
  $badBytes = [Text.Encoding]::ASCII.GetBytes("not-a-pdf")
  Assert-ExpectedError (New-UploadBody ("clasp-bad-pdf-" + [Guid]::NewGuid().ToString("N")) $badBytes) "NOT_A_PDF"
}

if ($Mode -eq "near-limit") {
  Write-Host "`n[near-limit] PDF close to 20 MiB" -ForegroundColor Yellow
  $pdfBytes = [byte[]]::new((19 * 1024 * 1024))
  $signature = [Text.Encoding]::ASCII.GetBytes("%PDF-")
  [Array]::Copy($signature, 0, $pdfBytes, 0, $signature.Length)
  $requestId = "clasp-near-limit-" + [Guid]::NewGuid().ToString("N")
  Invoke-DigitalQcRequest (New-UploadBody $requestId $pdfBytes) | Out-Null
}

if ($Mode -eq "concurrency") {
  Write-Host "`n[concurrency] same request_id from two clients" -ForegroundColor Yellow
  $pdfBytes = New-SmallPdfBytes
  $requestId = "clasp-concurrent-" + [Guid]::NewGuid().ToString("N")
  $json = (New-UploadBody $requestId $pdfBytes | ConvertTo-Json -Depth 10 -Compress)
  $jobs = 1..2 | ForEach-Object {
    Start-Job -ScriptBlock {
      param($Uri, $JsonBody)
      try { Invoke-RestMethod -Method Post -Uri $Uri -ContentType "application/json" -Body $JsonBody }
      catch { @{ success = $false; message = $_.Exception.Message } }
    } -ArgumentList $Endpoint, $json
  }
  $results = $jobs | Wait-Job | Receive-Job
  $jobs | Remove-Job -Force
  if ($results.Count -ne 2 -or @($results | Where-Object { -not $_.success }).Count -gt 0) { throw "Concurrent upload did not complete successfully." }
  if (@($results | Where-Object { $_.duplicate -eq $true }).Count -lt 1) { throw "Concurrent upload did not produce a duplicate response." }
}

Write-Host "`nOK - Web App contract test passed." -ForegroundColor Green
