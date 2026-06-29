@echo off
title Repartir a zero — frontend sur GitHub
cd /d "%~dp0"

echo.
echo  Evo-smartUni — remplacement complet du depot frontend
echo  https://github.com/devulrich55-lang/smart-academy-of-congo
echo  ========================================================
echo.
echo  Ce script :
echo    - ignore backend-python/ et docs/
echo    - recree un historique propre (1 commit)
echo    - force le push sur main (vide l'ancien contenu confus)
echo.
echo  ATTENTION : ecrase tout sur GitHub main pour ce depot.
echo.

set /p CONFIRM=Etes-vous sur ? Tapez OUI en majuscules : 
if /not "%CONFIRM%"=="OUI" (
  echo Annule.
  pause
  exit /b 0
)

where git >nul 2>&1
if errorlevel 1 (
  echo ERREUR: Git non installe.
  pause
  exit /b 1
)

git checkout --orphan clean-main 2>nul
if errorlevel 1 (
  echo Creation branche orphan...
  git checkout --orphan clean-main
)

git add -A
git status

echo.
git commit -m "Frontend Evo-smartUni — site statique Render"

git branch -D main 2>nul
git branch -m main

git remote remove origin 2>nul
git remote add origin https://github.com/devulrich55-lang/smart-academy-of-congo.git

echo.
echo Push vers GitHub (connexion si demandee)...
git push -u origin main --force

if errorlevel 1 (
  echo.
  echo ERREUR push. Verifiez votre connexion GitHub.
  pause
  exit /b 1
)

echo.
echo OK — Depot remplace.
echo GitHub : https://github.com/devulrich55-lang/smart-academy-of-congo
echo Render : Manual Deploy ^> Deploy latest commit
echo.
pause
