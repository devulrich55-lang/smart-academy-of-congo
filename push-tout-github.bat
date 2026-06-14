@echo off
title Push frontend + API vers GitHub
cd /d "%~dp0"

echo.
echo  Smart Academy — envoi des corrections en ligne
echo  ================================================
echo.

where git >nul 2>&1
if errorlevel 1 (
  echo ERREUR: Git non installe.
  pause
  exit /b 1
)

echo [1/2] FRONTEND — smart-academy-of-congo
echo ----------------------------------------
git add -A
git status --short
git commit -m "fix: connexion API Render cross-origin + interface mobile" 2>nul
if errorlevel 1 echo (rien de nouveau ou deja commite)
git remote remove origin 2>nul
git remote add origin https://github.com/devulrich55-lang/smart-academy-of-congo.git 2>nul
git branch -M main 2>nul
git push -u origin main
if errorlevel 1 (
  echo Push frontend refuse — retry force...
  git push -u origin main --force
)
if errorlevel 1 (
  echo ERREUR push frontend.
  pause
  exit /b 1
)
echo OK frontend pousse.

echo.
echo [2/2] API — smart-academy-of-congo-API
echo ----------------------------------------
cd backend-python
git add app/config.py app/routes/auth.py render.yaml .env.example
git add -A
git status --short
git commit -m "fix: CROSS_ORIGIN_AUTH cookies pour frontend Render" 2>nul
if errorlevel 1 echo (rien de nouveau ou deja commite)
git remote remove origin 2>nul
git remote add origin https://github.com/devulrich55-lang/smart-academy-of-congo-API.git 2>nul
git branch -M main 2>nul
git push -u origin main
if errorlevel 1 (
  echo ERREUR push API.
  pause
  exit /b 1
)
echo OK API poussee.

echo.
echo ================================================
echo  TERMINE — Prochaines etapes sur Render :
echo.
echo  1. Static Site  ^> Manual Deploy
echo  2. API Service  ^> Manual Deploy
echo  3. API Environment :
echo     ALLOWED_ORIGINS=https://smart-academy-of-congo-dbfm.onrender.com
echo     FRONTEND_URL=https://smart-academy-of-congo-dbfm.onrender.com
echo     CROSS_ORIGIN_AUTH=true
echo.
echo  GitHub frontend : https://github.com/devulrich55-lang/smart-academy-of-congo
echo  GitHub API      : https://github.com/devulrich55-lang/smart-academy-of-congo-API
echo ================================================
pause
