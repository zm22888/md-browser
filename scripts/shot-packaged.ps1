Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class PackShot {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
}
"@
[PackShot]::SetProcessDPIAware()
$proc = Get-Process "MD Browser" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object -First 1
if ($proc) {
  [PackShot]::ShowWindow($proc.MainWindowHandle, 9)
  [PackShot]::SetForegroundWindow($proc.MainWindowHandle)
  Start-Sleep -Milliseconds 900
  Add-Type -AssemblyName System.Drawing
  Add-Type -AssemblyName System.Windows.Forms
  $b = [System.Windows.Forms.SystemInformation]::VirtualScreen
  $bmp = New-Object System.Drawing.Bitmap $b.Width, $b.Height
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CopyFromScreen($b.X, $b.Y, 0, 0, $bmp.Size)
  $bmp.Save("D:\workspace\md\.shots\packaged2.png", [System.Drawing.Imaging.ImageFormat]::Png)
  $g.Dispose()
  $bmp.Dispose()
  Write-Output "saved packaged2"
} else {
  Write-Output "MD Browser process not found"
}
