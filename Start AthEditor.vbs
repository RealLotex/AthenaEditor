Option Explicit
Dim shell, fs, root, deno, command
Set shell = CreateObject("WScript.Shell")
Set fs = CreateObject("Scripting.FileSystemObject")
root = fs.GetParentFolderName(WScript.ScriptFullName)
deno = shell.ExpandEnvironmentStrings("%LOCALAPPDATA%") & "\Microsoft\WinGet\Links\deno.exe"
If Not fs.FileExists(deno) Then deno = "deno.exe"
shell.CurrentDirectory = root
command = Chr(34) & deno & Chr(34) & " run -A " & Chr(34) & root & "\tools\start.js" & Chr(34)
On Error Resume Next
shell.Run command, 0, False
If Err.Number <> 0 Then
  MsgBox "AthEditor needs Deno to start. Install Deno, then open Start AthEditor again.", vbExclamation, "AthEditor"
End If
