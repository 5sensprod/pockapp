; Pocket React - Installeur FINAL
; Version sans erreur - TESTÉ

!include "MUI2.nsh"

Name "Pocket React"
OutFile "PocketReactInstaller.exe"
InstallDir "$LOCALAPPDATA\PocketReact"
RequestExecutionLevel user

!define MUI_ABORTWARNING

!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES

; Page finish avec checkbox pour lancer l'app
!define MUI_FINISHPAGE_SHOWREADME
!define MUI_FINISHPAGE_SHOWREADME_TEXT "Lancer Pocket React"
!define MUI_FINISHPAGE_SHOWREADME_FUNCTION LaunchApp
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "French"

; Fonction pour lancer l'app à la fin de l'installation
Function LaunchApp
    Exec 'wscript.exe "$INSTDIR\launch.vbs"'
FunctionEnd

Section "Install"
    SetOutPath "$INSTDIR"
    
    ; Copie l'exécutable
    File "pocket-react.exe"
    
    ; Crée le dossier de données
    CreateDirectory "$INSTDIR\pb_data"
    
    ; Crée le script VBS de lancement
    FileOpen $0 "$INSTDIR\launch.vbs" w
    FileWrite $0 "Set objShell = CreateObject($\"WScript.Shell$\")$\r$\n"
    FileWrite $0 "objShell.CurrentDirectory = $\"$INSTDIR$\"$\r$\n"
    FileWrite $0 "objShell.Run $\"pocket-react.exe serve$\", 0, False$\r$\n"
    FileWrite $0 "WScript.Sleep 2000$\r$\n"
    FileWrite $0 "objShell.Run $\"chrome.exe --app=http://localhost:8090$\", 1, False$\r$\n"
    FileClose $0
    
    ; Crée les raccourcis
    CreateDirectory "$SMPROGRAMS\Pocket React"
    CreateShortcut "$SMPROGRAMS\Pocket React\Pocket React.lnk" "wscript.exe" '"$INSTDIR\launch.vbs"'
    CreateShortcut "$SMPROGRAMS\Pocket React\Desinstaller.lnk" "$INSTDIR\Uninstall.exe"
    CreateShortcut "$DESKTOP\Pocket React.lnk" "wscript.exe" '"$INSTDIR\launch.vbs"'
    
    ; Crée le désinstalleur
    WriteUninstaller "$INSTDIR\Uninstall.exe"
    
    ; Enregistre dans le registre Windows
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PocketReact" "DisplayName" "Pocket React"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PocketReact" "UninstallString" "$INSTDIR\Uninstall.exe"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PocketReact" "DisplayIcon" "$INSTDIR\pocket-react.exe"
SectionEnd

Section "Uninstall"
    ; Arrête l'application si elle tourne
    nsExec::Exec "taskkill /F /IM pocket-react.exe"
    Sleep 500
    
    ; Supprime les fichiers
    Delete "$INSTDIR\pocket-react.exe"
    Delete "$INSTDIR\launch.vbs"
    Delete "$INSTDIR\Uninstall.exe"
    RMDir /r "$INSTDIR\pb_data"
    RMDir "$INSTDIR"
    
    ; Supprime les raccourcis
    Delete "$DESKTOP\Pocket React.lnk"
    RMDir /r "$SMPROGRAMS\Pocket React"
    
    ; Supprime du registre
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\PocketReact"
SectionEnd
