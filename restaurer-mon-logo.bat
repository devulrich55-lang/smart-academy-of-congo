@echo off

title Restaurer mon logo — Smart Academy

cd /d "%~dp0"



echo.

echo  RESTAURER VOTRE LOGO (logos.png)

echo  ==================================

echo.

echo  1. Copiez votre fichier logos.png dans ce dossier :

echo     %cd%

echo.

echo  2. Rechargez le site (F5) — le logo sera detecte automatiquement.

echo.

echo  En attendant, un logo de secours (logos.svg) s'affiche sur la plateforme.

echo.

echo  Ouverture du dossier du projet...

start "" explorer "%cd%"

echo.

pause

