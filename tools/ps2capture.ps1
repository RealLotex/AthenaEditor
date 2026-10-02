# Launch PCSX2 on an AthenaEnv ELF, screenshot the render window, shut down.
# Called by tools/ps2run.js.
#
# ASCII only: Windows PowerShell 5.1 reads .ps1 as ANSI, so a stray em-dash
# breaks string parsing several lines later with a misleading error.
#
# Capture uses PrintWindow(PW_RENDERFULLCONTENT), which asks the window to draw
# itself into a DC and so needs neither foreground nor an unobstructed screen.
# The alternatives were both worse: PCSX2's own F8 screenshot needs the render
# window focused, and SetForegroundWindow is refused to a background process;
# forcing it with -fullscreen plus a minimise/restore does grab focus, but it
# hijacks the desktop and PCSX2 stops presenting once the window is minimised.
param(
  [Parameter(Mandatory=$true)][string]$Elf,
  [Parameter(Mandatory=$true)][string]$Log,
  [Parameter(Mandatory=$true)][string]$Png,
  [int]$Seconds = 14
)

$ErrorActionPreference = 'Stop'
$pcsx2 = 'C:\Program Files\PCSX2\pcsx2-qt.exe'
if (-not (Test-Path $pcsx2)) { Write-Output "NO PCSX2 at $pcsx2"; exit 3 }

Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing @'
using System;
using System.Text;
using System.Drawing;
using System.Runtime.InteropServices;
public class Cap {
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out R r);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr dc, uint flags);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowTextW(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  public struct R { public int L, T, Rt, B; }

  // PCSX2 keeps the game list on the window titled "PCSX2 ..." and renders
  // into a second one titled after the running program.
  public static IntPtr RenderWindow(uint want) {
    IntPtr hit = IntPtr.Zero;
    EnumWindows(delegate(IntPtr h, IntPtr p) {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == want && IsWindowVisible(h)) {
        var s = new StringBuilder(512); GetWindowTextW(h, s, 512);
        if (!s.ToString().StartsWith("PCSX2")) hit = h;
      }
      return true;
    }, IntPtr.Zero);
    return hit;
  }

  // Saves the window and returns the percentage of non-black pixels below the
  // title bar. An all-black client area is how AthenaEnv fails when it cannot
  // find main.js, so this number is the difference between "ran" and "did not".
  public static double Grab(IntPtr h, string path) {
    R r; GetWindowRect(h, out r);
    int w = r.Rt - r.L, ht = r.B - r.T;
    if (w <= 0 || ht <= 0) return -1;
    using (var bmp = new Bitmap(w, ht))
    using (var g = Graphics.FromImage(bmp)) {
      IntPtr dc = g.GetHdc();
      PrintWindow(h, dc, 2);   // PW_RENDERFULLCONTENT
      g.ReleaseHdc(dc);
      long lit = 0, total = 0;
      for (int y = 40; y < ht; y += 3)
        for (int x = 4; x < w - 4; x += 3) {
          var c = bmp.GetPixel(x, y);
          total++;
          if (c.R > 12 || c.G > 12 || c.B > 12) lit++;
        }
      bmp.Save(path, System.Drawing.Imaging.ImageFormat.Png);
      return total == 0 ? -1 : (100.0 * lit / total);
    }
  }
}
'@

# PCSX2 is single-instance: a stray one from an interrupted run makes every
# later launch hand off to it and exit immediately, so the capture silently
# produces nothing and the case reports "no render window". Clear it first.
$stray = Get-Process -Name 'pcsx2-qt' -ErrorAction SilentlyContinue
if ($stray) {
  Write-Output "KILLING $($stray.Count) stray PCSX2 process(es) from an earlier run"
  $stray | Stop-Process -Force
  Start-Sleep -Milliseconds 1200
}

if (Test-Path $Log) { Remove-Item $Log -Force -ErrorAction SilentlyContinue }

$pargs = @('-batch','-fastboot','-logfile', $Log, '--', $Elf)
$sw = [System.Diagnostics.Stopwatch]::StartNew()
$p = Start-Process -FilePath $pcsx2 -ArgumentList $pargs -PassThru -WindowStyle Hidden
Write-Output "LAUNCHED pid=$($p.Id)"

while ($sw.Elapsed.TotalSeconds -lt $Seconds) {
  Start-Sleep -Milliseconds 500
  $p.Refresh()
  if ($p.HasExited) { break }
}

$p.Refresh()
if ($p.HasExited) {
  Write-Output "SELF-EXITED after $([math]::Round($sw.Elapsed.TotalSeconds,1))s code=$($p.ExitCode)"
} else {
  $h = [Cap]::RenderWindow([uint32]$p.Id)
  if ($h -ne [IntPtr]::Zero) {
    $pct = [Cap]::Grab($h, $Png)
    Write-Output ("CAPTURED {0} lit={1:N2}%" -f (Split-Path $Png -Leaf), $pct)
    if ($pct -lt 1.0) { Write-Output "BLACK SCREEN: AthenaEnv rendered nothing" }
  } else {
    Write-Output "NO RENDER WINDOW"
  }
  Stop-Process -Id $p.Id -Force
  Write-Output "STOPPED after $([math]::Round($sw.Elapsed.TotalSeconds,1))s"
}
Start-Sleep -Milliseconds 800
