param([switch]$CtrlE)
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class Keys {
  [DllImport("user32.dll")] public static extern void keybd_event(byte bVk, byte bScan, uint dwFlags, UIntPtr dwExtraInfo);
  public static void Combo(byte mod, byte key) {
    keybd_event(mod, 0, 0, UIntPtr.Zero);
    System.Threading.Thread.Sleep(60);
    keybd_event(key, 0, 0, UIntPtr.Zero);
    System.Threading.Thread.Sleep(60);
    keybd_event(key, 0, 2, UIntPtr.Zero);
    keybd_event(mod, 0, 2, UIntPtr.Zero);
  }
}
"@
$shell = New-Object -ComObject WScript.Shell
$proc = Get-Process electron -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -like '*MD Browser*' } | Select-Object -First 1
if ($proc) {
  $null = $shell.AppActivate($proc.Id)
  Start-Sleep -Milliseconds 600
}
if ($CtrlE) {
  [Keys]::Combo(0x11, 0x45)
  Write-Output "sent: Ctrl+E"
} else {
  [Keys]::Combo(0x11, 0x53)
  Write-Output "sent: Ctrl+S"
}
