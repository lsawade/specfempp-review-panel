#!/bin/bash

# Sync and update benchmark data for web display
# This script should be run daily via cron

# Configuration
SOURCE_DIR="/home/TROMP/SPECFEMPP-benchmarks/nightly_benchmarks/data/benchmarks"
DEST_DIR="/tigress/lsawade/public_html/minimal_specfempp_review/benchmarks"
MANIFEST_FILE="/tigress/lsawade/public_html/minimal_specfempp_review/benchmarks_manifest.json"

# Create destination directory if it doesn't exist
mkdir -p "$DEST_DIR"

# Sync benchmark data (only profiles.json files)
echo "Syncing benchmark data from $SOURCE_DIR to $DEST_DIR"
rsync -av --include='*/' --include='*/profiles.json' --exclude='*' "$SOURCE_DIR/" "$DEST_DIR/"

# Generate manifest file
echo "Generating manifest file at $MANIFEST_FILE"
echo '{' > "$MANIFEST_FILE"
echo '  "files": [' >> "$MANIFEST_FILE"

# Find all profiles.json files and format as JSON array
find "$DEST_DIR" -name "profiles.json" -type f | sort | while IFS= read -r file; do
    # Convert absolute path to relative path from web root
    rel_path=$(echo "$file" | sed "s|$DEST_DIR|./benchmarks|")
    echo "    \"$rel_path\"," >> "$MANIFEST_FILE"
done

# Remove trailing comma from last entry
sed -i '$ s/,$//' "$MANIFEST_FILE"

echo '  ],' >> "$MANIFEST_FILE"
echo "  \"updated\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" >> "$MANIFEST_FILE"
echo '}' >> "$MANIFEST_FILE"

# Count files synced
file_count=$(find "$DEST_DIR" -name "profiles.json" -type f | wc -l)
echo "Sync complete: $file_count benchmark files"
echo "Manifest updated at $(date)"
