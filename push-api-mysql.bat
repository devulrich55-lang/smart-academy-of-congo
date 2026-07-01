@echo off

title Push API MySQL vers GitHub

cd /d "%~dp0backend-python"



echo.

echo  Push API — migration MySQL

echo  ==========================

echo.



where git >nul 2>&1

if errorlevel 1 (

  echo ERREUR: Git non installe.

  pause

  exit /b 1

)



git add -A

git status --short



git commit -m "feat: migration MySQL + pagination et montee en charge pour forte charge utilisateurs"

if errorlevel 1 (

  echo Rien a commiter ou commit deja fait.

)



git remote remove origin 2>nul

git remote add origin https://github.com/devulrich55-lang/Evo-smartUni-API.git 2>nul

git branch -M main 2>nul

git push -u origin main



if errorlevel 1 (

  echo.

  echo ERREUR push — verifiez votre connexion GitHub.

  pause

  exit /b 1

)



echo.

echo OK — API poussee sur GitHub.

echo Puis sur Render : Manual Deploy + DATABASE_URL MySQL

echo.

pause

