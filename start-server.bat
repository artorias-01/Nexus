@echo off
title Chat Backup Server
color 0A

echo.
echo  ================================================
echo   Chat Backup Server — Starting...
echo  ================================================
echo.

REM Check if Java is installed
java -version >nul 2>&1
if %errorlevel% neq 0 (
    color 0C
    echo  ERROR: Java is not installed or not in PATH.
    echo  Download it from: https://adoptium.net
    echo.
    pause
    exit /b 1
)

REM Compile if .class doesn't exist or .java is newer
if not exist ChatBackupServer.class (
    echo  Compiling ChatBackupServer.java...
    javac ChatBackupServer.java
    if %errorlevel% neq 0 (
        color 0C
        echo  Compilation failed. Check the Java file.
        pause
        exit /b 1
    )
    echo  Compiled successfully!
    echo.
)

REM Start the server
java ChatBackupServer

echo.
echo  Server stopped.
pause
