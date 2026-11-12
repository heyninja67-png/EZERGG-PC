#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
python -m pip install -r requirements-dev.txt
PYTHONPATH=. pytest -q
