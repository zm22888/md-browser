param([int]$X, [int]$Y)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MouseHelper {
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y);
  [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, UIntPtr dwExtraInfo);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public static void Activate(IntPtr h) {
    ShowWindow(h, 9);
    keybd_event(0x12, 0, 0, UIntPtr.Zero);
    SetForegroundWindow(h);
    keybd_event(0x12, 0, 2, UIntPtr.Zero);
  }
  public static void LeftClick(int x, int y) {
    SetCursorPos(x, y);
    System.Threading.Thread.Sleep(120);
    mouse_event(0x02, 0, 0, 0, UIntPtr.Zero);
    mouse_event(0x04, 0, 0, 0, UIntPtr.Zero);
  }
}
"@
[MouseHelper]::SetProcessDPIAware()
# 先把光标移开再激活窗口，避免目标位置残留 tooltip 吞掉点击
[MouseHelper]::SetCursorPos(10, 10)
$proc = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*MD Browser*' } | Select-Object -First 1
if ($proc -and $proc.MainWindowHandle -ne 0) {
  [MouseHelper]::Activate($proc.MainWindowHandle)
  Start-Sleep -Milliseconds 600
} else {
  Write-Output "WARN: MD Browser window not found"
}
[MouseHelper]::LeftClick($X, $Y)
Write-Output "clicked: $X,$Y"
