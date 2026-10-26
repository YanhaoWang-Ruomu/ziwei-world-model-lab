$ErrorActionPreference = 'Stop'
$workspaceDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$previewDirectory = Join-Path $workspaceDirectory 'github-public/site'
if (-not (Test-Path -LiteralPath (Join-Path $previewDirectory 'server/chart-public.mjs'))) {
  $previewDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
  if (-not (Test-Path -LiteralPath (Join-Path $previewDirectory 'server/chart-public.mjs'))) { throw '未找到公开算法预览副本。' }
}
& (Join-Path $PSScriptRoot 'start-local-model.ps1')
$modelDirectory = Join-Path $workspaceDirectory 'local-ai-runtime'
try {
  $probe = Invoke-WebRequest -Uri 'http://127.0.0.1:8879/' -TimeoutSec 2 -UseBasicParsing
  if ($probe.StatusCode -eq 200) { Write-Output '预览已经启动：http://127.0.0.1:8879/#account'; exit 0 }
} catch { }
$nodeExecutable = (Get-Command node -ErrorAction Stop).Source
$previewScript = Join-Path $previewDirectory 'scripts/preview.mjs'
$env:PORT = '8879'
$env:WRANGLER_SEND_METRICS = 'false'
$env:XDG_CONFIG_HOME = Join-Path $previewDirectory '.cache/local-ai-config'
$env:WRANGLER_LOG_PATH = Join-Path $previewDirectory '.cache/local-ai-logs'
$process = Start-Process -FilePath $nodeExecutable -ArgumentList @(('"' + $previewScript + '"')) -WorkingDirectory $previewDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $modelDirectory 'preview-status.log') -RedirectStandardError (Join-Path $modelDirectory 'preview-error.log')
Write-Output '公开框架预览正在启动：http://127.0.0.1:8879/#account'
Write-Output '本机模型连接页：http://127.0.0.1:8788/'
