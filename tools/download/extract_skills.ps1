$ErrorActionPreference = 'Continue'
$baseDir = "c:\Users\HP\Desktop\cinematic-web-references"
$skillsDir = "$baseDir\skills"
New-Item -ItemType Directory -Force -Path $skillsDir | Out-Null

$zipFiles = Get-ChildItem -Path $baseDir -Filter "*.zip" -Depth 0

foreach ($zip in $zipFiles) {
    # Skip the ones ending in -main.zip as those were the github manual downloads
    if ($zip.Name -match '-main\.zip$|-master\.zip$') {
        continue
    }

    $skillName = $zip.Name -replace '\.zip$', ''
    $targetDir = "$skillsDir\$skillName"
    $extractTemp = "$skillsDir\temp_$skillName"
    
    Write-Host "Extracting $($zip.Name)..."
    
    if (Test-Path $extractTemp) { Remove-Item $extractTemp -Recurse -Force }
    Expand-Archive -Path $zip.FullName -DestinationPath $extractTemp -Force
    
    # Strip nesting
    $nested = Get-ChildItem $extractTemp -Directory | Select-Object -First 1
    
    if ($nested) {
        if (Test-Path $targetDir) { Remove-Item $targetDir -Recurse -Force }
        Move-Item -Path $nested.FullName -Destination $targetDir -Force
    } else {
        if (Test-Path $targetDir) { Remove-Item $targetDir -Recurse -Force }
        Move-Item -Path $extractTemp -Destination $targetDir -Force
    }
    
    if (Test-Path $extractTemp) { Remove-Item $extractTemp -Recurse -Force -ErrorAction SilentlyContinue }
}
Write-Host "Done extracting skills."
