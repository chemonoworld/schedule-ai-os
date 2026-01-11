#!/bin/bash

# Schedule AI Native Host 제거 스크립트 (macOS)

HOST_NAME="com.scheduleai.host"
CHROME_HOSTS_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"
MANIFEST_PATH="$CHROME_HOSTS_DIR/$HOST_NAME.json"

echo "Schedule AI Native Host Uninstaller"
echo "===================================="
echo ""

if [[ -f "$MANIFEST_PATH" ]]; then
    rm "$MANIFEST_PATH"
    echo "Removed: $MANIFEST_PATH"
else
    echo "Native Host manifest not found."
fi

echo ""
echo "Uninstallation complete!"
