$ErrorActionPreference = 'Stop'
$modelDirectory = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../local-ai-runtime'))
& node (Join-Path $PSScriptRoot 'install-local-model.mjs') $modelDirectory
if ($LASTEXITCODE -ne 0) { throw '下载或校验失败，请再次运行继续下载。' }
$binaryDirectory = Join-Path $modelDirectory 'bin'
if (Test-Path -LiteralPath $binaryDirectory) {
  if ((Get-Item -LiteralPath $binaryDirectory).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw '运行目录不能是链接。' }
}
Expand-Archive -LiteralPath (Join-Path $modelDirectory 'llama-b11669-bin-win-cuda-12.4-x64.zip') -DestinationPath $binaryDirectory -Force
Expand-Archive -LiteralPath (Join-Path $modelDirectory 'cudart-llama-bin-win-cuda-12.4-x64.zip') -DestinationPath $binaryDirectory -Force
Write-Output '本机图文模型已安装，请运行 start-local-model.ps1。'
