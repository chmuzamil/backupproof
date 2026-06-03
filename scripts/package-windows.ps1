$ErrorActionPreference = "Stop"
npm run build
New-Item -ItemType Directory -Force -Path dist-package | Out-Null
Copy-Item -Recurse dist, package.json, README.md dist-package\
Write-Host "Windows package ready in dist-package\"
