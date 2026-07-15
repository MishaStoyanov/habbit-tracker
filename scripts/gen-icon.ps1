Add-Type -AssemblyName System.Drawing

function New-IconBitmap([int]$size) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)

    $bg = [System.Drawing.Color]::FromArgb(255, 26, 29, 38)
    $accent = [System.Drawing.Color]::FromArgb(255, 255, 140, 26)

    $bgBrush = New-Object System.Drawing.SolidBrush $bg
    $margin = [int]($size * 0.04)
    $g.FillEllipse($bgBrush, $margin, $margin, $size - 2*$margin, $size - 2*$margin)

    $pen = New-Object System.Drawing.Pen $accent, ([Math]::Max(1, $size * 0.09))
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $cx = $size / 2.0
    $cy = $size / 2.0
    $r = $size * 0.28

    $points = @()
    for ($i = 0; $i -lt 5; $i++) {
        $ang = (-90 + $i * 72) * [Math]::PI / 180.0
        $x = $cx + $r * [Math]::Cos($ang)
        $y = $cy + $r * [Math]::Sin($ang)
        $points += New-Object System.Drawing.PointF([float]$x, [float]$y)
    }

    $accentBrush = New-Object System.Drawing.SolidBrush $accent
    $dotR = $size * 0.10
    foreach ($p in $points) {
        $g.FillEllipse($accentBrush, $p.X - $dotR, $p.Y - $dotR, $dotR*2, $dotR*2)
    }
    $g.FillEllipse($accentBrush, $cx - $dotR*1.15, $cy - $dotR*1.15, $dotR*2.3, $dotR*2.3)

    $g.Dispose()
    return $bmp
}

$assetsDir = Join-Path $PSScriptRoot "..\assets"
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

$png256 = New-IconBitmap 256
$png256.Save((Join-Path $assetsDir "icon.png"), [System.Drawing.Imaging.ImageFormat]::Png)

$png32 = New-IconBitmap 32
$png32.Save((Join-Path $assetsDir "tray.png"), [System.Drawing.Imaging.ImageFormat]::Png)

$hIcon = $png32.GetHicon()
$icon = [System.Drawing.Icon]::FromHandle($hIcon)
$fs = New-Object System.IO.FileStream((Join-Path $assetsDir "icon.ico"), [System.IO.FileMode]::Create)
$icon.Save($fs)
$fs.Close()

Write-Output "Icons written to $assetsDir"
