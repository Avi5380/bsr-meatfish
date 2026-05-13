@echo off
chcp 65001 > nul
cd /d "%~dp0"
title בשר ודגים - דוח הוצאות והכנסות
echo.
echo ================================================
echo  בשר ודגים - דוח הוצאות והכנסות
echo ================================================
echo.
echo [1/3] קורא את כל קבצי האקסל...
call node extract.js
echo.
echo [2/3] מפעיל שרת מקומי על http://localhost:3031
start "" node server.js
timeout /t 2 /nobreak > nul
start "" http://localhost:3031
echo.
echo [3/3] רוצה גם קישור פומבי לשיתוף? (Y/N)
choice /c YN /n
if errorlevel 2 goto end
if errorlevel 1 (
  echo.
  echo מפעיל קישור פומבי דרך Cloudflare...
  echo כתובת תופיע למטה - שלח אותה לכל מי שצריך לראות.
  echo להפסקה: סגור את החלון.
  echo.
  bin\cloudflared.exe tunnel --url http://localhost:3031
)
:end
