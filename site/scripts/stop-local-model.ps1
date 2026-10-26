$ErrorActionPreference = 'Stop'
$modelDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../local-ai-runtime'))
$pidFile = Join-Path $modelDirectory 'running.json'
if (-not (Test-Path -LiteralPath $pidFile)) { Write-Output '本机 AI 没有运行记录。'; exit 0 }
$state = Get-Content -LiteralPath $pidFile -Raw | ConvertFrom-Json
$expectedModel = Join-Path $modelDirectory 'bin/llama-server.exe'
$service = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$state.service)
$model = Get-CimInstance Win32_Process -Filter ('ProcessId = ' + [int]$state.model)
$serviceScript = Join-Path $PSScriptRoot 'local-model-service.mjs'
if ($service -and ($service.Name -ne 'node.exe' -or -not $service.CommandLine.Contains($serviceScript))) { throw '服务进程与启动记录不符，未停止。' }
if ($model -and $model.ExecutablePath -ne $expectedModel) { throw '模型进程与启动记录不符，未停止。' }
if ($model) { Stop-Process -Id ([int]$state.model) -ErrorAction SilentlyContinue }
if ($service) { Stop-Process -Id ([int]$state.service) -ErrorAction SilentlyContinue }
if (Test-Path -LiteralPath $pidFile) { Remove-Item -LiteralPath $pidFile }
Write-Output '本机 AI 已停止。'
