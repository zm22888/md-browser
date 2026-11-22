param([string]$Keys, [switch]$ShiftTap)
$shell = New-Object -ComObject WScript.Shell
$proc = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*MD Browser*' } | Select-Object -First 1
if ($proc) {
  $null = $shell.AppActivate($proc.Id)
  Start-Sleep -Milliseconds 600
} else {
  Write-Output "WARN: MD Browser window not found"
}
if ($ShiftTap) {
  # tap Shift to switch IME to English mode
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class ShiftKey {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public static void Tap() {
    keybd_event(0x10, 0, 0, UIntPtr.Zero);
    System.Threading.Thread.Sleep(60);
    keybd_event(0x10, 0, 2, UIntPtr.Zero);
  }
}
"@
  [ShiftKey]::Tap()
  Start-Sleep -Milliseconds 300
}
$shell.SendKeys($Keys)
Write-Output "sent: $Keys"
