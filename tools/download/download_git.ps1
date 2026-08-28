$ErrorActionPreference = 'Continue'
$baseDir = "c:\Users\HP\Desktop\cinematic-web-references"
$reposDir = "$baseDir\repos"

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
    
    # Skip if already exists and has files (we extracted 6 manually already)
    if ((Test-Path $targetDir) -and (Get-ChildItem $targetDir -ErrorAction SilentlyContinue).Count -gt 0) {
        Write-Host "SKIP: $($r.Repo) - already exists"
        $results += [PSCustomObject]@{Repo=$r.Repo; Status="SKIPPED"; Error=""}
        continue
    }

    Write-Host "--- Cloning: $($r.Owner)/$($r.Repo) ---"
    
    try {
        $cloneUrl = "https://github.com/$($r.Owner)/$($r.Repo).git"
        
        # Git shallow clone
        Write-Host "  Cloning --depth 1 from $cloneUrl"
        $gitOutput = & git clone --depth 1 $cloneUrl $targetDir 2>&1
        
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path $targetDir)) {
            throw "Git clone failed: $gitOutput"
        }
        
        Write-Host "  Successfully cloned. Cleaning junk..."
        
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
        
        Write-Host "  SUCCESS."
        $results += [PSCustomObject]@{Repo=$r.Repo; Status="SUCCESS"; Error=""}
        
    } catch {
        Write-Host "  FAILED: $($_.Exception.Message)"
        $results += [PSCustomObject]@{Repo=$r.Repo; Status="FAILED"; Error=$_.Exception.Message}
        if (Test-Path $targetDir) { Remove-Item $targetDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
}

Write-Host "`n========================================"
Write-Host "       FINAL CLONE REPORT"
Write-Host "========================================"
$results | Format-Table -AutoSize
