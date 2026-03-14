param(
  [string]$SourcePath = ".\icons\Gemini_Generated_Image_cn7iy1cn7iy1cn7i.png",
  [string]$OutputDir = ".\icons"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$resolvedSource = Resolve-Path -Path $SourcePath
$resolvedOutput = Resolve-Path -Path $OutputDir

$targetSizes = @(16, 32, 48, 128)

Get-ChildItem -Path $resolvedOutput -Filter "icon*.png" -File -ErrorAction SilentlyContinue | Remove-Item -Force

$sourceImage = [System.Drawing.Image]::FromFile($resolvedSource)

try {
  foreach ($size in $targetSizes) {
    $bitmap = New-Object System.Drawing.Bitmap($size, $size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

    try {
      $graphics.Clear([System.Drawing.Color]::Transparent)
      $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

      $scale = [Math]::Min($size / $sourceImage.Width, $size / $sourceImage.Height)
      $drawWidth = [int][Math]::Round($sourceImage.Width * $scale)
      $drawHeight = [int][Math]::Round($sourceImage.Height * $scale)
      $x = [int][Math]::Floor(($size - $drawWidth) / 2)
      $y = [int][Math]::Floor(($size - $drawHeight) / 2)

      $graphics.DrawImage($sourceImage, $x, $y, $drawWidth, $drawHeight)

      $outputPath = Join-Path $resolvedOutput "icon$size.png"
      $bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)
      Write-Host "Generated $outputPath"
    }
    finally {
      $graphics.Dispose()
      $bitmap.Dispose()
    }
  }
}
finally {
  $sourceImage.Dispose()
}
