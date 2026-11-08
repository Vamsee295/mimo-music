# Renders every app icon from lib/logo.ts (Windows PowerShell, uses System.Drawing):
#   web/PWA icons (public/), Apple touch icon (app/), and the Android launcher + notification icons.
# Run from the repo root:  powershell -File scripts/make-icons.ps1 -Root .
param([string]$Root = ".")
Add-Type -AssemblyName System.Drawing
$src = Get-Content (Join-Path $Root "lib/logo.ts") -Raw
function Pts($name) {
  $m = [regex]::Match($src, "export const $name =\s*""([^""]+)""")
  if (-not $m.Success) { throw "lib/logo.ts has no $name path; not writing icons" }
  $nums = [regex]::Matches($m.Groups[1].Value, "-?\d+(\.\d+)?") | ForEach-Object { [single]$_.Value }
  $pts = @(); for ($i = 0; $i -lt $nums.Count; $i += 2) { $pts += New-Object System.Drawing.PointF $nums[$i], $nums[$i + 1] }
  return ,[System.Drawing.PointF[]]$pts
}
$tri = Pts "TRIANGLE"; $wave = Pts "WAVE"
$INK = [System.Drawing.ColorTranslator]::FromHtml('#0d0c0b')
$CREAM = [System.Drawing.Color]::FromArgb(255, 245, 239, 230)

# $tile: rounded | square | circle | none (transparent) · $scale: size of the framed mark on the tile
function Draw($size, $scale, $out, $tile, $markColor = $CREAM) {
  New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
  $b = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($b)
  $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'
  $g.Clear([System.Drawing.Color]::Transparent)
  $k = $size / 512.0; $g.ScaleTransform($k, $k)
  $bg = New-Object System.Drawing.SolidBrush $INK
  switch ($tile) {
    'rounded' {
      $gp = New-Object System.Drawing.Drawing2D.GraphicsPath; $r = 112; $d = 2 * $r
      $gp.AddArc(0, 0, $d, $d, 180, 90); $gp.AddArc(512 - $d, 0, $d, $d, 270, 90); $gp.AddArc(512 - $d, 512 - $d, $d, $d, 0, 90); $gp.AddArc(0, 512 - $d, $d, $d, 90, 90); $gp.CloseFigure()
      $g.FillPath($bg, $gp)
    }
    'square' { $g.FillRectangle($bg, 0, 0, 512, 512) }
    'circle' { $g.FillEllipse($bg, 0, 0, 512, 512) }
  }
  $g.TranslateTransform(256, 256); $g.ScaleTransform($scale, $scale); $g.TranslateTransform(-256, -256)
  # frame: rounded rect stroke (centre line), radius 100
  $fp = New-Object System.Drawing.Drawing2D.GraphicsPath; $x = 9.3; $y = 9.6; $w = 493.4; $h = 492.8; $rr = 100; $dd = 2 * $rr
  $fp.AddArc($x, $y, $dd, $dd, 180, 90); $fp.AddArc($x + $w - $dd, $y, $dd, $dd, 270, 90); $fp.AddArc($x + $w - $dd, $y + $h - $dd, $dd, $dd, 0, 90); $fp.AddArc($x, $y + $h - $dd, $dd, $dd, 90, 90); $fp.CloseFigure()
  $g.DrawPath((New-Object System.Drawing.Pen $markColor, 18.6), $fp)
  # play button with the wave cut out (even-odd)
  $pp = New-Object System.Drawing.Drawing2D.GraphicsPath ([System.Drawing.Drawing2D.FillMode]::Alternate)
  $pp.AddPolygon($tri); $pp.AddPolygon($wave)
  $g.FillPath((New-Object System.Drawing.SolidBrush $markColor), $pp)
  $b.Save($out, [System.Drawing.Imaging.ImageFormat]::Png); $g.Dispose(); $b.Dispose()
}

# ── web / PWA ──
Draw 512 0.74 "$Root\public\icon-512.png" 'rounded'
Draw 192 0.74 "$Root\public\icon-192.png" 'rounded'
Draw 180 0.72 "$Root\app\apple-icon.png" 'square'       # iOS rounds the corners itself
Draw 512 0.62 "$Root\public\icon-maskable.png" 'square' # Android crops to its own shape; keep the mark in the safe zone

# ── Android app (Capacitor) ──
$res = "$Root\android\app\src\main\res"
if (Test-Path $res) {
  $dens = @{ 'mdpi' = 1; 'hdpi' = 1.5; 'xhdpi' = 2; 'xxhdpi' = 3; 'xxxhdpi' = 4 }
  foreach ($d in $dens.Keys) {
    $k = $dens[$d]
    Draw ([int](48 * $k)) 0.74 "$res\mipmap-$d\ic_launcher.png" 'rounded'        # older launchers
    Draw ([int](48 * $k)) 0.6 "$res\mipmap-$d\ic_launcher_round.png" 'circle'
    # adaptive icon foreground: 108dp canvas, launchers show the middle ~66dp, so the mark sits at ~56%
    Draw ([int](108 * $k)) 0.56 "$res\mipmap-$d\ic_launcher_foreground.png" 'none'
  }
  # status-bar icon for the "Now playing" notification: Android tints it, so plain white on transparent
  Draw 96 0.9 "$res\drawable\ic_stat_mimo.png" 'none' ([System.Drawing.Color]::White)
}
Get-ChildItem "$Root\public\icon-*.png", "$Root\app\apple-icon.png" | Select-Object Name, Length
