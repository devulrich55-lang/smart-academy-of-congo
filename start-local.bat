@echo off

title Evo-smartUni — serveur local

cd /d "%~dp0backend-python"



echo.

echo  Evo-smartUni — demarrage local

echo  ==========================================

echo  Site      : http://127.0.0.1:8000/index.html

echo  Connexion : http://127.0.0.1:8000/connexion.html

echo.

echo  Ne fermez pas cette fenetre pendant vos tests.

echo.



where python >nul 2>&1

if errorlevel 1 (

  echo ERREUR: Python introuvable. Installez Python 3.10+ depuis python.org

  echo         Cochez "Add Python to PATH" lors de l'installation.

  pause

  exit /b 1

)



echo Installation des dependances Python...

python -m pip install -r requirements.txt -q

if errorlevel 1 (

  echo ERREUR: pip install a echoue. Verifiez votre connexion Internet.

  pause

  exit /b 1

)



if not exist "data" mkdir data

if not exist ".env" (
  echo Copie de .env.example vers .env ...
  copy /Y ".env.example" ".env" >nul
)

echo Ouverture du navigateur dans 4 secondes...

start "" cmd /c "timeout /t 4 /nobreak >nul && start http://127.0.0.1:8000/index.html"



echo Demarrage du serveur sur le port 8000...

python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

if errorlevel 1 (

  echo.

  echo ERREUR: le serveur n'a pas demarre. Copiez le message ci-dessus.

  pause

)

