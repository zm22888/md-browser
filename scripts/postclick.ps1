param([int]$X, [int]$Y)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public struct PT { public int X; public int Y; }
public class PostHelper {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr hWnd, uint Msg, IntPtr wParam, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool ScreenToClient(IntPtr hWnd, ref PT pt);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  public static void Activate(IntPtr h) {
    ShowWindow(h, 9);
    SetForegroundWindow(h);
  }
  public static string PostClick(IntPtr h, int sx, int sy) {
    var pt = new PT { X = sx, Y = sy };
    ScreenToClient(h, ref pt);
    var lp = (IntPtr)(((pt.Y & 0xFFFF) << 16) | (pt.X & 0xFFFF));
    PostMessage(h, 0x0201, (IntPtr)1, lp);
    System.Threading.Thread.Sleep(80);
    PostMessage(h, 0x0202, (IntPtr)0, lp);
    return "client(" + pt.X + "," + pt.Y + ")";
  }
}
"@
[PostHelper]::SetProcessDPIAware()
$proc = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*MD Browser*' } | Select-Object -First 1
if ($proc -and $proc.MainWindowHandle -ne 0) {
  [PostHelper]::Activate($proc.MainWindowHandle)
  Start-Sleep -Milliseconds 400
  $info = [PostHelper]::PostClick($proc.MainWindowHandle, $X, $Y)
  Write-Output "posted at $info"
} else {
  Write-Output "WARN: MD Browser window not found"
}
