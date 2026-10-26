$ErrorActionPreference = 'Stop'
$modelDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../local-ai-runtime'))
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$serviceScript = Join-Path $PSScriptRoot 'local-model-service.mjs'
try {
  $probe = Invoke-WebRequest -Uri 'http://127.0.0.1:8788/' -TimeoutSec 2 -UseBasicParsing
  if ($probe.StatusCode -eq 200) { Write-Output '本机服务已经启动：http://127.0.0.1:8788/'; exit 0 }
} catch { }
$process = Start-Process -FilePath $nodeExecutable -ArgumentList @(('"' + $serviceScript + '"'), ('"' + $modelDirectory + '"')) -WorkingDirectory $modelDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $modelDirectory 'service-status.log') -RedirectStandardError (Join-Path $modelDirectory 'service-error.log')
Write-Output '本机 AI 正在启动。连接页面：http://127.0.0.1:8788/'
