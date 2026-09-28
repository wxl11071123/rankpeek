@echo off
setlocal

set "RANKPEEK_LOCAL_DATA_ROOT=%LOCALAPPDATA%\RankPeek-dev"

cd /d "%~dp0..\rankpeek-backend"
echo Starting RankPeek backend with RANKPEEK_LOCAL_DATA_ROOT=%RANKPEEK_LOCAL_DATA_ROOT%
mvn spring-boot:run
