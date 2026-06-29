@echo off

title Restaurer mon logo — Evo-smartUni

cd /d "%~dp0"

echo.
echo  RESTAURER VOTRE LOGO (evo-uni.jpeg)
echo  ==================================
echo.
echo  1. Copiez votre fichier evo-uni.jpeg dans ce dossier :
echo     %cd%
echo.
echo  2. Copiez aussi dans ministere\, admin-uni\ et superadmin\ si besoin.
echo.
echo  3. Rechargez le site (F5) — le logo Evo-smartUni sera affiche.
echo.
echo  Ouverture du dossier du projet...
start "" explorer "%cd%"
echo.
pause
