@echo off
echo Installing Biometric Sync Agent as a Windows Service using NSSM...
REM Ensure NSSM is downloaded and placed in this folder or in PATH
nssm install "BiometricSyncAgent" "%CD%\venv\Scripts\python.exe" "%CD%\sync_agent.py"
nssm set "BiometricSyncAgent" AppDirectory "%CD%"
nssm set "BiometricSyncAgent" Description "Syncs Biometric Data to Franchise ERP Cloud"
nssm start "BiometricSyncAgent"
echo Service Installed and Started!
pause
