#!/bin/bash

# Schedule AI Native Host 설치 스크립트 (macOS)
# Chrome Extension과 통신하기 위한 Native Messaging Host 등록

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOST_NAME="com.scheduleai.host"

# Chrome Native Messaging Hosts 디렉토리
CHROME_HOSTS_DIR="$HOME/Library/Application Support/Google/Chrome/NativeMessagingHosts"

# Native Host 바이너리 경로 (빌드 후 위치)
# 개발 중에는 target/release, 배포 시에는 앱 번들 내부
if [[ -f "/Applications/Schedule AI.app/Contents/MacOS/schedule-ai-host" ]]; then
    HOST_PATH="/Applications/Schedule AI.app/Contents/MacOS/schedule-ai-host"
elif [[ -f "$SCRIPT_DIR/../schedule-ai-host/target/release/schedule-ai-host" ]]; then
    HOST_PATH="$SCRIPT_DIR/../schedule-ai-host/target/release/schedule-ai-host"
elif [[ -f "$SCRIPT_DIR/../target/release/schedule-ai-host" ]]; then
    HOST_PATH="$SCRIPT_DIR/../target/release/schedule-ai-host"
else
    echo "Error: Native Host binary not found."
    echo "Please build it first: cd schedule-ai-host && cargo build --release"
    exit 1
fi

# 절대 경로로 변환
HOST_PATH="$(cd "$(dirname "$HOST_PATH")" && pwd)/$(basename "$HOST_PATH")"

echo "Schedule AI Native Host Installer"
echo "=================================="
echo ""
echo "Host binary: $HOST_PATH"
echo "Target directory: $CHROME_HOSTS_DIR"
echo ""

# 디렉토리 생성
mkdir -p "$CHROME_HOSTS_DIR"

# Chrome Extension ID를 입력받거나 개발 모드 사용
read -p "Chrome Extension ID (press Enter for development mode): " EXTENSION_ID

if [[ -z "$EXTENSION_ID" ]]; then
    # 개발 모드: 모든 확장 허용 (보안 주의)
    ALLOWED_ORIGINS="\"chrome-extension://*/\""
    echo "Warning: Development mode - allowing all extensions"
else
    ALLOWED_ORIGINS="\"chrome-extension://$EXTENSION_ID/\""
fi

# Native Host manifest 생성
MANIFEST_PATH="$CHROME_HOSTS_DIR/$HOST_NAME.json"

cat > "$MANIFEST_PATH" << EOF
{
  "name": "$HOST_NAME",
  "description": "Schedule AI Focus Mode Native Host",
  "path": "$HOST_PATH",
  "type": "stdio",
  "allowed_origins": [
    $ALLOWED_ORIGINS
  ]
}
EOF

echo "Created manifest at: $MANIFEST_PATH"
echo ""
echo "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Load the Chrome extension from: $SCRIPT_DIR"
echo "2. Copy the Extension ID from chrome://extensions"
echo "3. Re-run this script with the Extension ID for production use"
