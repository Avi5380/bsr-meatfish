' BSR.vbs — runs the PowerShell launcher invisibly (no console window flash)
Set s = CreateObject("WScript.Shell")
s.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File ""C:\Users\avraham\meatfish-app\bsr-app.ps1""", 0, False
