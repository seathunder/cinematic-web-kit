$ErrorActionPreference = 'Continue'
$baseDir = "c:\Users\HP\Desktop\cinematic-web-references"
$reposDir = "$baseDir\repos"
$tempDir = "$baseDir\extracted\temp_zips"

New-Item -ItemType Directory -Force -Path $reposDir, $tempDir | Out-Null

$repos = @(
    @{Owner="MustBeSimo"; Repo="cinematic-scroll-skill"; Dir="cinematic-scroll-skill"},
    @{Owner="Ph4NToMgg"; Repo="xiaomi-smart-audio-glasses"; Dir="xiaomi-smart-audio-glasses"},
    @{Owner="Relaxkartikey"; Repo="prior-gsap-animation-portfolio-website-template"; Dir="prior-gsap-animation-portfolio-website-template"},
    @{Owner="HarshalTarwale"; Repo="Apple-Vision-Pro-Website-Clone"; Dir="Apple-Vision-Pro-Website-Clone"},
    @{Owner="Vedantd2003"; Repo="ApplevisionWeb"; Dir="ApplevisionWeb"},
    @{Owner="rex009x"; Repo="gsap_macbook_landing"; Dir="gsap_macbook_landing"},
    @{Owner="KaranChandekar"; Repo="interactive-3d-portfolio"; Dir="interactive-3d-portfolio"},
    @{Owner="IHANsaja"; Repo="immersive-portfolio"; Dir="immersive-portfolio"},
    @{Owner="salonyranjan"; Repo="VertexFlow"; Dir="VertexFlow"},
    @{Owner="Plattnericus"; Repo="ThreeJS_Portfolio"; Dir="ThreeJS_Portfolio"},
    @{Owner="Kavtuai"; Repo="lattice-drift"; Dir="lattice-drift"},
    @{Owner="tsogjavklann"; Repo="awwwards-3d"; Dir="awwwards-3d"},
    @{Owner="atishaytuli07"; Repo="frameSequenceAnimation"; Dir="frameSequenceAnimation"},
    @{Owner="Dilip-kumar-22"; Repo="orbit"; Dir="orbit"},
    @{Owner="Grantmantek"; Repo="threejs-scroll-scene"; Dir="threejs-scroll-scene"},
    @{Owner="Dieg0arc"; Repo="3D-scrolling-practice"; Dir="3D-scrolling-practice"},
    @{Owner="itsjwill"; Repo="motion-primitives-website"; Dir="motion-primitives-website"},
    @{Owner="davidhckh"; Repo="portfolio-2025"; Dir="portfolio-2025"},
    @{Owner="shehzadres"; Repo="Webgl-Data-Globe"; Dir="Webgl-Data-Globe"}
)

$results = @()

foreach ($r in $repos) {
    $targetDir = "$reposDir\$($r.Dir)"
    
    # Skip if already exists with content
    if ((Test-Path $targetDir) -and (Get-ChildItem $targetDir -ErrorAction SilentlyContinue).Count -gt 0) {
        Write-Host "SKIP: $($r.Repo) - already exists"
        $results += [PSCustomObject]@{Repo=$r.Repo; Status="SKIPPED"; SizeMB=0; Error=""}
        continue
    }

    Write-Host "--- Processing: $($r.Owner)/$($r.Repo) ---"
    
    try {
        # Get default branch using curl
        $apiUrl = "https://api.github.com/repos/$($r.Owner)/$($r.Repo)"
        $apiJson = & curl.exe -s -L --connect-timeout 30 --max-time 60 -H "User-Agent: corpus-builder" $apiUrl 2>&1
        
        if ($LASTEXITCODE -ne 0) {
            throw "GitHub API request failed (exit code $LASTEXITCODE)"
        }
        
        $apiData = $apiJson | ConvertFrom-Json
        
        if ($apiData.message -eq "Not Found") {
            throw "Repository not found on GitHub"
        }
        
        $branch = $apiData.default_branch
        if (-not $branch) { $branch = "main" }
        Write-Host "  Branch: $branch"
        
        # Download ZIP using curl (much faster than Invoke-WebRequest)
        $zipUrl = "https://github.com/$($r.Owner)/$($r.Repo)/archive/refs/heads/$branch.zip"
        $zipPath = "$tempDir\$($r.Repo).zip"
        
        Write-Host "  Downloading..."
        & curl.exe -L -o $zipPath --connect-timeout 30 --max-time 600 --retry 3 --retry-delay 5 -# $zipUrl 2>&1
        
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $zipPath)) {
            throw "Download failed (curl exit code $LASTEXITCODE)"
        }
        
        $zipSize = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
        
        if ($zipSize -lt 0.001) {
            throw "Downloaded file is empty"
        }
        
        Write-Host "  ZIP size: ${zipSize}MB"
        
        # Extract
        $extractTemp = "$tempDir\$($r.Repo)_ext"
        if (Test-Path $extractTemp) { Remove-Item $extractTemp -Recurse -Force }
        
        Write-Host "  Extracting..."
        Expand-Archive -Path $zipPath -DestinationPath $extractTemp -Force
        
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
        
        # Final size
        $finalSize = (Get-ChildItem $targetDir -Recurse -File -ErrorAction SilentlyContinue | Measure-Object -Property Length -Sum).Sum
        $finalSizeMB = [math]::Round($finalSize / 1MB, 2)
        
        Write-Host "  SUCCESS: ${finalSizeMB}MB extracted"
        $results += [PSCustomObject]@{Repo=$r.Repo; Status="SUCCESS"; SizeMB=$finalSizeMB; Error=""}
        
        # Cleanup
        Remove-Item $zipPath -Force -ErrorAction SilentlyContinue
        if (Test-Path $extractTemp) { Remove-Item $extractTemp -Recurse -Force -ErrorAction SilentlyContinue }
        
    } catch {
        Write-Host "  FAILED: $($_.Exception.Message)"
        $results += [PSCustomObject]@{Repo=$r.Repo; Status="FAILED"; SizeMB=0; Error=$_.Exception.Message}
        # Cleanup on failure too
        $zipPath = "$tempDir\$($r.Repo).zip"
        if (Test-Path $zipPath) { Remove-Item $zipPath -Force -ErrorAction SilentlyContinue }
    }
}

# Final Report
Write-Host ""
Write-Host "========================================"
Write-Host "       FINAL DOWNLOAD REPORT"
Write-Host "========================================"

$results | Format-Table -AutoSize

$success = @($results | Where-Object { $_.Status -eq "SUCCESS" }).Count
$failed = @($results | Where-Object { $_.Status -eq "FAILED" }).Count
$skipped = @($results | Where-Object { $_.Status -eq "SKIPPED" }).Count
$totalSize = ($results | Measure-Object -Property SizeMB -Sum).Sum

Write-Host "Successful: $success / $($repos.Count)"
Write-Host "Failed:     $failed"
Write-Host "Skipped:    $skipped"
Write-Host "Total Size: ${totalSize}MB"

if ($failed -gt 0) {
    Write-Host ""
    Write-Host "FAILED REPOS:"
    $results | Where-Object { $_.Status -eq "FAILED" } | ForEach-Object { Write-Host "  - $($_.Repo): $($_.Error)" }
}

# Cleanup temp
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue }

Write-Host ""
Write-Host "DONE."
