param(
  [string]$Source = "registry",
  [string]$Scenario = "two-tribe-two-system",
  [string]$OutputPath = "../frontend/score/public/verifier/latest.json",
  [switch]$Execute
)

$ErrorActionPreference = "Stop"

function Run-Step([string]$Label, [string]$Command) {
  Write-Host ""
  Write-Host "== $Label ==" -ForegroundColor Cyan
  Write-Host $Command -ForegroundColor DarkGray
  Invoke-Expression $Command
}

Push-Location $PSScriptRoot/..
try {
  Run-Step "Emit verifier artifact" "npx tsx src/main.ts --source=$Source --scenario=$Scenario --output=$OutputPath"
  Run-Step "Prepare commit manifest" "npx tsx src/prepare-commit.ts --input=$OutputPath"
  Run-Step "Submit dry-run receipt" "npx tsx src/submit-commit.ts --input=$OutputPath"

  if ($Execute) {
    Run-Step "Submit execute receipt" "npx tsx src/submit-commit.ts --input=$OutputPath --execute"
  }

  $absoluteOutputPath = Resolve-Path $OutputPath
  $envelope = Get-Content $absoluteOutputPath -Raw | ConvertFrom-Json
  if (-not $envelope.audit.indexPath) {
    throw "Verifier output did not include an audit index path."
  }

  $indexPath = Join-Path (Split-Path $absoluteOutputPath -Parent) $envelope.audit.indexPath
  $index = Get-Content $indexPath -Raw | ConvertFrom-Json
  if (-not $index.latestTickMs) {
    throw "Audit index did not report a latest tick."
  }

  $receiptRelativePath = $envelope.audit.latestReceiptPath
  if (-not $receiptRelativePath) {
    throw "Verifier output did not include a latest receipt path."
  }

  $receiptPath = Join-Path (Split-Path $absoluteOutputPath -Parent) $receiptRelativePath
  if (Test-Path $receiptPath) {
    Run-Step "Verify published artifact against chain" "npx tsx src/verify-audit.ts --input=$OutputPath --receipt=`"$receiptPath`""
  } else {
    Write-Host ""
    Write-Host "No receipt file found at $receiptPath yet. Skipping verify step." -ForegroundColor Yellow
  }
}
finally {
  Pop-Location
}
