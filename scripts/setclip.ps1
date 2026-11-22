Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$bmp = New-Object System.Drawing.Bitmap 320, 160
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(9, 105, 218))
$font = New-Object System.Drawing.Font('Segoe UI', 20)
$g.DrawString('paste test', $font, [System.Drawing.Brushes]::White, 60, 55)
$g.Dispose()
[System.Windows.Forms.Clipboard]::SetImage($bmp)
Write-Output "clipboard image set"
