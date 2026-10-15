#!/bin/sh
# Container entrypoint. Next.js lists the public folder once when it starts, so new hero assets
# have to be in place before the server comes up.
python3 -u scripts/fetch-deadlock-assets.py --if-new-heroes || echo "Asset update failed, serving the existing assets"
exec npm run start
