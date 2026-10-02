Option Explicit
Dim shell
Set shell = CreateObject("WScript.Shell")
If WScript.Arguments.Count = 0 Then WScript.Quit 1
If WScript.Arguments(0) = "--error" Then
  MsgBox WScript.Arguments(1), vbExclamation, "AthEditor"
Else
  shell.Run WScript.Arguments(0), 1, False
End If
