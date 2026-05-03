#!/usr/bin/env sh
set -eu

# Minimal helper for running the Dataverse metadata crawler manually.
# The exact CLI flags may differ depending on how the crawler is installed, 
# so treat this script as a documented starting point rather than a fixed guaranteed command.

REPO_ROOT=$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)
TOKEN_FILE="$REPO_ROOT/TOKEN.txt"
RAW_DIR="$REPO_ROOT/data/raw"

BASE_URL="${BASE_URL:-https://dataverse.nl}"
ROOT_DATAVERSE="${ROOT_DATAVERSE:-maastricht}"
DATASET_VERSION="${DATASET_VERSION:-latest}"
CRAWLER_DIR="${CRAWLER_DIR:-}"
PYTHON_BIN="${PYTHON_BIN:-python3}"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
RAW_JSON="$RAW_DIR/dataverse-maastricht-${TIMESTAMP}.json"

mkdir -p "$RAW_DIR"

if [ ! -f "$TOKEN_FILE" ]; then
  echo "Missing $TOKEN_FILE"
  echo "Create TOKEN.txt in the repository root and paste your Dataverse API token into it."
  exit 1
fi

API_TOKEN=$(tr -d '\r\n' < "$TOKEN_FILE")

if [ -z "$API_TOKEN" ]; then
  echo "TOKEN.txt exists but is empty."
  exit 1
fi

echo "Raw output directory: $RAW_DIR"
echo "Base URL: $BASE_URL"
echo "Target Dataverse: $ROOT_DATAVERSE"
echo "Planned raw JSON file: $RAW_JSON"
echo

WORK_DIR=$(mktemp -d "${TMPDIR:-/tmp}/dataverse-crawler.XXXXXX")
cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT HUP INT TERM

run_crawler() {
  if [ -n "$CRAWLER_DIR" ]; then
    BASE_URL="$BASE_URL" API_KEY="$API_TOKEN" "$PYTHON_BIN" "$CRAWLER_DIR/dvmeta/main.py" "$@"
  else
    BASE_URL="$BASE_URL" API_KEY="$API_TOKEN" dataverse-metadata-crawler "$@"
  fi
}

if { [ -n "$CRAWLER_DIR" ] && [ -f "$CRAWLER_DIR/dvmeta/main.py" ]; } || command -v dataverse-metadata-crawler >/dev/null 2>&1; then
  echo "Running dataverse-metadata-crawler."
  echo

  (
    cd "$WORK_DIR"
    run_crawler -c "$ROOT_DATAVERSE" -v "$DATASET_VERSION" -d -a "$API_TOKEN" --no-log
  )

  CRAWLER_JSON=$(find "$WORK_DIR/exported_files/json_files" -name 'ds_metadata_*.json' -type f | sort | tail -n 1)
  if [ -z "$CRAWLER_JSON" ]; then
    echo "Crawler completed but no ds_metadata JSON file was found."
    exit 1
  fi

  cp "$CRAWLER_JSON" "$RAW_JSON"
  echo "Wrote $RAW_JSON"
else
  echo "dataverse-metadata-crawler is not on PATH."
  echo
  echo "Next steps:"
  echo "1. Clone or install the crawler separately."
  echo "2. Set CRAWLER_DIR to the cloned repository path if it does not install a PATH command."
  echo "3. Re-run this helper or run the equivalent command manually."
  echo
  echo "Example command shape:"
  echo "CRAWLER_DIR=/path/to/dataverse-metadata-crawler sh scripts/run_crawler.sh"
fi
