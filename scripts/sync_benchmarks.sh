#!/bin/bash

# Sync and update benchmark data for web display
# This script should be run daily via cron

# Configuration
SOURCE_DIR="/home/TROMP/SPECFEMPP-benchmarks/nightly_benchmarks/data/benchmarks"
DEST_DIR="/tigress/lsawade/public_html/minimal_specfempp_review/benchmarks"
MANIFEST_FILE="/tigress/lsawade/public_html/minimal_specfempp_review/benchmarks_manifest.json"
BADGES_DIR="/tigress/lsawade/public_html/minimal_specfempp_review/badges"

# Create destination directories if they don't exist
mkdir -p "$DEST_DIR"
mkdir -p "$BADGES_DIR"

# Sync benchmark data (only profiles.json files)
echo "Syncing benchmark data from $SOURCE_DIR to $DEST_DIR"
rsync -av --include='*/' --include='*/profiles.json' --exclude='*' "$SOURCE_DIR/" "$DEST_DIR/"

# Generate manifest file
echo "Generating manifest file at $MANIFEST_FILE"
echo '{' > "$MANIFEST_FILE"
echo '  "files": [' >> "$MANIFEST_FILE"

# Find all profiles.json files and format as JSON array
TEMP_FILE=$(mktemp)
find "$DEST_DIR" -name "profiles.json" -type f | sort | while IFS= read -r file; do
    # Convert absolute path to relative path from web root
    rel_path=$(echo "$file" | sed "s|$DEST_DIR|./benchmarks|")
    echo "    \"$rel_path\"" >> "$TEMP_FILE"
done

# Add files to manifest with proper comma formatting
if [ -s "$TEMP_FILE" ]; then
    # Add commas to all lines except the last
    sed '$ ! s/$/,/' "$TEMP_FILE" >> "$MANIFEST_FILE"
fi
rm -f "$TEMP_FILE"

echo '  ],' >> "$MANIFEST_FILE"
echo "  \"updated\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"" >> "$MANIFEST_FILE"
echo '}' >> "$MANIFEST_FILE"

# Count files synced
file_count=$(find "$DEST_DIR" -name "profiles.json" -type f | wc -l)
echo "Sync complete: $file_count benchmark files"
echo "Manifest updated at $(date)"

# Fetch Jenkins badge images
echo "Fetching Jenkins badge images..."

# Define badge URLs and output filenames
declare -A BADGES=(
    ["gnu_main"]="https://jenkins.princeton.edu/buildStatus/icon?job=SpecFEM_KOKKOS%2FGNU_main&build=last&subject=GCC%20(main)"
    ["intel_main"]="https://jenkins.princeton.edu/buildStatus/icon?job=SpecFEM_KOKKOS%2FIntel_main&build=last&subject=IntelLLVM%20(main)"
    ["nvidia_main"]="https://jenkins.princeton.edu/buildStatus/icon?job=SpecFEM_KOKKOS%2FNVIDIA_main&build=last&subject=NVIDIA%20(main)"
    ["gnu_devel"]="https://jenkins.princeton.edu/buildStatus/icon?job=SpecFEM_KOKKOS%2FGNU_devel&build=last&subject=GCC%20(devel)"
    ["intel_devel"]="https://jenkins.princeton.edu/buildStatus/icon?job=SpecFEM_KOKKOS%2FIntel_devel&build=last&subject=IntelLLVM%20(devel)"
    ["nvidia_devel"]="https://jenkins.princeton.edu/buildStatus/icon?job=SpecFEM_KOKKOS%2FNVIDIA_devel&build=last&subject=NVIDIA%20(devel)"
    ["nightly_benchmarks"]="https://jenkins.princeton.edu/buildStatus/icon?job=SpecFEM_KOKKOS%2FNightly_Benchmarks&build=last&subject=Nightly%20Benchmarks"
)

# Download each badge with curl
badge_count=0
for badge_name in "${!BADGES[@]}"; do
    badge_url="${BADGES[$badge_name]}"
    output_file="$BADGES_DIR/${badge_name}.svg"
    
    if curl -s -f -o "$output_file" "$badge_url"; then
        echo "  ✓ Downloaded: ${badge_name}.svg"
        ((badge_count++))
    else
        echo "  ✗ Failed to download: ${badge_name}.svg"
        # Create an error badge as fallback
        cat > "$output_file" << 'EOF'
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="20">
    <rect width="120" height="20" fill="#555"/>
    <rect x="60" width="60" height="20" fill="#9f9f9f"/>
    <text x="30" y="14" fill="#fff" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11" text-anchor="middle">Status</text>
    <text x="90" y="14" fill="#fff" font-family="DejaVu Sans,Verdana,Geneva,sans-serif" font-size="11" text-anchor="middle">Unknown</text>
</svg>
EOF
    fi
done

echo "Badge sync complete: $badge_count badges downloaded"

# Create timestamp file for badge sync tracking
TIMESTAMP_FILE="$BADGES_DIR/last_sync.json"
cat > "$TIMESTAMP_FILE" << EOF
{
  "last_sync": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "unix_timestamp": $(date +%s)
}
EOF

echo "Timestamp file created: $TIMESTAMP_FILE"
echo "All syncing completed at $(date)"
