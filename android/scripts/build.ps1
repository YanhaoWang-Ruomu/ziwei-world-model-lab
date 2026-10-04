$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $projectRoot
[xml]$manifest = Get-Content -LiteralPath 'AndroidManifest.xml' -Raw
$version = $manifest.manifest.GetAttribute('versionName','http://schemas.android.com/apk/res/android')
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Invalid release version' }
$apkPath = "release\GuanXingTai-$version.apk"
$jdkRoot = (Get-ChildItem '.tools\jdk' -Directory | Select-Object -First 1).FullName
$buildTools = (Get-ChildItem '.tools\build-tools' -Directory | Select-Object -First 1).FullName
$platformJar = (Get-ChildItem '.tools\platform' -Recurse -Filter android.jar | Select-Object -First 1).FullName
$pythonExe = if ($env:PYTHON) { $env:PYTHON } else { 'python' }
function Run-Checked([string]$file, [string[]]$arguments) {
    & $file @arguments
    if ($LASTEXITCODE -ne 0) { throw "Build command failed: $([IO.Path]::GetFileName($file))" }
}
foreach ($folder in @('build','build\classes','build\dex','build\generated','release','.signing')) { New-Item -ItemType Directory -Force -Path $folder | Out-Null }
$javaSources = @(Get-ChildItem 'src' -Recurse -Filter '*.java' | ForEach-Object { $_.FullName })
Run-Checked "$jdkRoot\bin\javac.exe" (@('-J-Duser.language=en','-encoding','UTF-8','--release','8','-classpath',$platformJar,'-d','build\classes') + $javaSources)
Run-Checked "$jdkRoot\bin\jar.exe" @('cf','build\classes.jar','-C','build\classes','.')
Run-Checked "$jdkRoot\bin\java.exe" @('-cp',"$buildTools\lib\d8.jar",'com.android.tools.r8.D8','--release','--min-api','26','--lib',$platformJar,'--output','build\dex','build\classes.jar')
Run-Checked "$buildTools\aapt2.exe" @('compile','--dir','res','-o','build\resources.zip')
Run-Checked "$buildTools\aapt2.exe" @('link','-I',$platformJar,'--manifest','AndroidManifest.xml','--java','build\generated','-o','build\unsigned.apk','build\resources.zip')
Run-Checked $pythonExe @('-c','from zipfile import ZipFile; z=ZipFile("build/unsigned.apk","a"); z.write("build/dex/classes.dex","classes.dex"); z.close()')
Run-Checked "$buildTools\zipalign.exe" @('-f','-p','4','build\unsigned.apk','build\aligned.apk')
if (-not (Test-Path '.signing\release.p12')) {
    if (Test-Path '.signing\password.txt') { throw 'Signing state incomplete: retain the existing signing files and investigate.' }
    $passwordBytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Fill($passwordBytes)
    [IO.File]::WriteAllText((Join-Path $projectRoot '.signing\password.txt'),[Convert]::ToBase64String($passwordBytes))
    Run-Checked "$jdkRoot\bin\keytool.exe" @('-genkeypair','-keystore','.signing\release.p12','-storetype','PKCS12','-storepass:file','.signing\password.txt','-alias','guanxingtai-release','-keyalg','RSA','-keysize','3072','-sigalg','SHA256withRSA','-validity','10000','-dname','CN=GuanXingTai')
}
Run-Checked "$jdkRoot\bin\java.exe" @('-jar',"$buildTools\lib\apksigner.jar",'sign','--ks','.signing\release.p12','--ks-key-alias','guanxingtai-release','--ks-pass','file:.signing\password.txt','--out',$apkPath,'build\aligned.apk')
Run-Checked "$jdkRoot\bin\java.exe" @('-jar',"$buildTools\lib\apksigner.jar",'verify','--verbose','--print-certs',$apkPath)
$hash = (Get-FileHash $apkPath -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $projectRoot 'release\SHA256SUMS.txt'),"$hash  GuanXingTai-$version.apk`n")
Write-Output 'Android release APK built and signature verified. Signing keys remain local.'
