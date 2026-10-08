# Local interactive configuration. Never place a real key in source, command arguments or chat.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$projectDir = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$target = Join-Path $projectDir '.dev.vars'
if ((Split-Path -Parent $target) -ne $projectDir) { throw 'Unexpected configuration path' }
$dialog = New-Object Windows.Forms.Form
$dialog.Text = '观星台 · 千问北京区密钥（仅本机）'
$dialog.Size = New-Object Drawing.Size(560,300)
$dialog.StartPosition = 'CenterScreen'
$label = New-Object Windows.Forms.Label
$label.Text = '密钥只写入本机开发配置。不会上传 GitHub，也不会自动启用线上服务。每日保守预算 5 元，适用于本应用；其他程序使用同一密钥的费用不受此处控制。'
$label.SetBounds(20,20,500,70)
$keyBox = New-Object Windows.Forms.TextBox
$keyBox.UseSystemPasswordChar = $true
$keyBox.SetBounds(20,105,500,30)
$saveButton = New-Object Windows.Forms.Button
$saveButton.Text = '保存密钥并启用本机预览的千问接入'
$saveButton.SetBounds(20,160,500,40)
$saveButton.Add_Click({
  try {
    $secret = $keyBox.Text.Trim()
    if ($secret -notmatch '^sk-[A-Za-z0-9_-]{16,200}$') { [Windows.Forms.MessageBox]::Show('请填写有效的百炼 API Key。') | Out-Null; return }
    $lines = if (Test-Path -LiteralPath $target) { [IO.File]::ReadAllLines($target) } else { @() }
    $kept = @($lines | Where-Object { $_ -notmatch '^\s*(DASHSCOPE_API_KEY|QWEN_ENABLED|QWEN_BUDGET_CNY|QWEN_PRICING_VERIFIED)\s*=' })
    $content = ($kept + @("DASHSCOPE_API_KEY=`"$secret`"",'QWEN_ENABLED="1"','QWEN_BUDGET_CNY="5"','QWEN_PRICING_VERIFIED="2026-10-09"')) -join [Environment]::NewLine
    [IO.File]::WriteAllText($target,$content+[Environment]::NewLine,(New-Object Text.UTF8Encoding($false)))
    $keyBox.Clear(); $secret = $null; $content = $null; $lines = $null; $kept = $null
    [Windows.Forms.MessageBox]::Show('本机配置已保存。重启本机预览后生效；线上服务需另行配置服务器密钥。') | Out-Null
    $dialog.Close()
  } catch { [Windows.Forms.MessageBox]::Show('未能保存配置，请检查本机目录写入权限。未输出密钥或异常详情。') | Out-Null }
})
$dialog.Controls.AddRange(@($label,$keyBox,$saveButton))
[void]$dialog.ShowDialog()
$dialog.Dispose()
