#!/usr/bin/env bash
set -euo pipefail

# Keep merged dependencies reproducible. Database schema changes remain explicit
# so routine task merges can never reset or mutate development data implicitly.
npm ci --ignore-scripts --no-audit --no-fund