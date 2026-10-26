#!/usr/bin/env bash
# T1376: rebuild the mooblox_e2e_* courses on 5.2 and copy the manifest back. Usage: client/tools/e2e-build.sh
set -euo pipefail
D="$(cd "$(dirname "$0")/../../.research/testdata/e2e" && pwd)"
C=moodle52-app-1
docker exec "$C" mkdir -p /tmp/mooblox-e2e
docker cp "$D/build.php" "$C":/tmp/mooblox-e2e/
docker cp "$D/spec.json" "$C":/tmp/mooblox-e2e/
docker exec "$C" chown -R www-data /tmp/mooblox-e2e
docker exec -u www-data -w /var/www/html "$C" php /tmp/mooblox-e2e/build.php /tmp/mooblox-e2e/spec.json /tmp/mooblox-e2e/manifest.json 2>&1 | grep -E "^mooblox_e2e|manifest|Exception|rror" || true
docker cp "$C":/tmp/mooblox-e2e/manifest.json "$D/manifest.json"
