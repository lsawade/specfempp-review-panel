#!/bin/bash

# Setup cron job to run benchmark sync daily at 6 AM

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
SYNC_SCRIPT="$SCRIPT_DIR/sync_benchmarks.sh"
LOG_FILE="$PROJECT_DIR/sync_benchmarks.log"

# Cron job line (runs at 6 AM daily)
CRON_JOB="0 6 * * * $SYNC_SCRIPT >> $LOG_FILE 2>&1"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -q "$SYNC_SCRIPT"; then
    echo "Cron job already exists for $SYNC_SCRIPT"
    echo "Current crontab:"
    crontab -l | grep "$SYNC_SCRIPT"
else
    # Add to crontab
    (crontab -l 2>/dev/null; echo "$CRON_JOB") | crontab -
    echo "Cron job added successfully!"
    echo "$CRON_JOB"
fi

echo ""
echo "To view your crontab: crontab -l"
echo "To remove the cron job: crontab -e (then delete the line)"
echo "Logs will be written to: $LOG_FILE"
echo ""
echo "Running initial sync now..."
"$SYNC_SCRIPT"
