$ErrorActionPreference = 'Continue'
$reposDir = "c:\Users\HP\Desktop\cinematic-web-references\repos"

$zipFiles = Get-ChildItem -Path $reposDir -Filter "*.zip"

foreach ($zip in $zipFiles) {
    # Extract the base name to use as directory name (remove -main.zip, -master.zip etc)
    $repoName = $zip.Name -replace '(-main\.zip|-master\.zip|\.zip)$', ''
    
    # Manually map repo names from zip file name to our requested folder names if needed, 
    # but the regex should handle these well enough.
    
    $targetDir = "$reposDir\$repoName"
    $extractTemp = "$reposDir\temp_$repoName"
    
    Write-Host "Extracting $($zip.Name) to $repoName..."
    
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
    
    # Clean junk directories
    @('.git', 'node_modules', 'dist', 'build', '.next', 'coverage', '__pycache__', '.cache', '.idea', '.parcel-cache', '.turbo') | ForEach-Object {
        Get-ChildItem -Path $targetDir -Recurse -Directory -Filter $_ -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item $_.FullName -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    
    # Clean junk files
    @('.DS_Store', 'Thumbs.db', 'desktop.ini') | ForEach-Object {
        Get-ChildItem -Path $targetDir -Recurse -File -Filter $_ -ErrorAction SilentlyContinue | ForEach-Object {
            Remove-Item $_.FullName -Force -ErrorAction SilentlyContinue
        }
    }
    
    # Cleanup zip and temp
    Remove-Item $zip.FullName -Force -ErrorAction SilentlyContinue
    if (Test-Path $extractTemp) { Remove-Item $extractTemp -Recurse -Force -ErrorAction SilentlyContinue }
    
    Write-Host "Done extracting and cleaning $repoName"
}
Write-Host "All local zips processed."
