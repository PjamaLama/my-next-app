@echo off
echo Cleaning build directories...
rmdir /s /q .next 2>nul
rmdir /s /q .next-build 2>nul

echo Starting Next.js development server...
set NODE_OPTIONS=--openssl-legacy-provider --no-warnings
set NEXT_TELEMETRY_DISABLED=1
set NEXT_TRACE_PROFILING_DISABLED=1
npx next dev 