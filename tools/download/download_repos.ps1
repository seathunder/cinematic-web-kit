$repos = @(
    @{ Owner="atishaytuli07"; Repo="frameSequenceAnimation"; Target="frameSequenceAnimation" },
    @{ Owner="Dilip-kumar-22"; Repo="orbit"; Target="orbit" },
    @{ Owner="Grantmantek"; Repo="threejs-scroll-scene"; Target="threejs-scroll-scene" },
    @{ Owner="Dieg0arc"; Repo="3D-scrolling-practice"; Target="3D-scrolling-practice" },
    @{ Owner="itsjwill"; Repo="motion-primitives-website"; Target="motion-primitives-website" },
    @{ Owner="davidhckh"; Repo="portfolio-2025"; Target="portfolio-2025" },
    @{ Owner="shehzadres"; Repo="Webgl-Data-Globe"; Target="Webgl-Data-Globe" }
)

$baseDir = "c:\Users\HP\Desktop\cinematic-web-references\repos"
$results = @()

if (!(Test-Path $baseDir)) {
    New-Item -ItemType Directory -Force -Path $baseDir | Out-Null
}

foreach ($r in $repos) {
    $owner = $r.Owner
    $repo = $r.Repo
    $targetName = $r.Target
    $targetDir = Join-Path $baseDir $targetName
    $tempZip = Join-Path $baseDir "$targetName.zip"
    $tempExt = Join-Path $baseDir "${targetName}_temp"

    Write-Host "Processing $owner/$repo..."

    try {
        # 1. Get default branch
        $apiUrl = "https://api.github.com/repos/$owner/$repo"
        $apiResp = Invoke-RestMethod -Uri $apiUrl -ErrorAction Stop
        $defaultBranch = $apiResp.default_branch

        # 2. Download ZIP
        $zipUrl = "https://github.com/$owner/$repo/archive/refs/heads/$defaultBranch.zip"
        Invoke-WebRequest -Uri $zipUrl -OutFile $tempZip -ErrorAction Stop

        # 3. Extract to temp location
        if (Test-Path $tempExt) { Remove-Item -Recurse -Force $tempExt }
        Expand-Archive -Path $tempZip -DestinationPath $tempExt -Force

        # Move contents
        $extractedRoot = Get-ChildItem -Path $tempExt -Directory | Select-Object -First 1
        if (!(Test-Path $targetDir)) { New-Item -ItemType Directory -Force -Path $targetDir | Out-Null }
        
        Get-ChildItem -Path $extractedRoot.FullName | Move-Item -Destination $targetDir -Force
        
        # Cleanup temp
        if (Test-Path $tempZip) { Remove-Item -Path $tempZip -Force }
        if (Test-Path $tempExt) { Remove-Item -Recurse -Force $tempExt }

        # 4. Remove junk files
        $junkPaths = @(
            ".git", "node_modules", "dist", "build", ".next", "coverage", "__pycache__", ".cache", ".DS_Store", "Thumbs.db", ".idea"
        )
        foreach ($j in $junkPaths) {
            $jPath = Join-Path $targetDir $j
            if (Test-Path $jPath) { Remove-Item -Recurse -Force $jPath }
        }

        # Measure size
        $size = (Get-ChildItem $targetDir -Recurse -File | Measure-Object -Property Length -Sum).Sum
        $sizeMb = [math]::Round($size / 1MB, 2)

        $results += @{ Repo="$owner/$repo"; Status="Success"; Size="${sizeMb}MB" }
        Write-Host "Success: $owner/$repo (${sizeMb}MB)"
    } catch {
        $results += @{ Repo="$owner/$repo"; Status="Failed: $_"; Size="0MB" }
        Write-Host "Failed: $owner/$repo - $_"
    }
}

$results | ConvertTo-Json
