#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="dev.ayaka.youtube_music_discord_presence"
EXTENSION_ID="klebilgcaopidgkbffhnffgjljegimno"
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
CLIENT_ID=""

usage() {
  echo "Usage: $0 --client-id DISCORD_APPLICATION_ID"
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --client-id)
      CLIENT_ID="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [[ ! "$CLIENT_ID" =~ ^[0-9]{17,20}$ ]]; then
  echo "--client-id must be a 17-20 digit Discord Application ID." >&2
  exit 2
fi

if [[ ! -f "$ROOT_DIR/packages/extension/dist/manifest.json" || ! -f "$ROOT_DIR/packages/native-host/dist/native-host.cjs" ]]; then
  echo "Build output is missing; running pnpm build..."
  pnpm --dir "$ROOT_DIR" build
fi

CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_ROOT="$DATA_HOME/youtube-music-discord-presence"
HOST_ROOT="$INSTALL_ROOT/native-host"
EXTENSION_ROOT="$INSTALL_ROOT/extension"
APP_CONFIG_ROOT="$CONFIG_HOME/youtube-music-discord-presence"
LOG_ROOT="${XDG_STATE_HOME:-$HOME/.local/state}/youtube-music-discord-presence"
WRAPPER="$HOST_ROOT/native-host"

mkdir -p "$HOST_ROOT" "$EXTENSION_ROOT" "$APP_CONFIG_ROOT" "$LOG_ROOT"
cp "$ROOT_DIR/packages/native-host/dist/native-host.cjs" "$HOST_ROOT/native-host.cjs"
cp "$ROOT_DIR/packages/native-host/dist/native-host.cjs.map" "$HOST_ROOT/native-host.cjs.map"
cp -R "$ROOT_DIR/packages/extension/dist/." "$EXTENSION_ROOT/"

cat > "$APP_CONFIG_ROOT/config.json" <<EOF
{
  "discordClientId": "$CLIENT_ID"
}
EOF
chmod 600 "$APP_CONFIG_ROOT/config.json"

cat > "$WRAPPER" <<EOF
#!/usr/bin/env bash
exec /usr/bin/node "$HOST_ROOT/native-host.cjs" 2>>"$LOG_ROOT/native-host.log"
EOF
chmod 755 "$WRAPPER"

installed=0
for profile_root in \
  "$CONFIG_HOME/BraveSoftware/Brave-Browser" \
  "$CONFIG_HOME/BraveSoftware/Brave-Browser-Beta" \
  "$CONFIG_HOME/BraveSoftware/Brave-Browser-Dev"
do
  if [[ -d "$profile_root" ]]; then
    manifest_dir="$profile_root/NativeMessagingHosts"
    mkdir -p "$manifest_dir"
    cat > "$manifest_dir/$HOST_NAME.json" <<EOF
{
  "name": "$HOST_NAME",
  "description": "YouTube Music Discord Presence Native Host",
  "path": "$WRAPPER",
  "type": "stdio",
  "allowed_origins": [
    "chrome-extension://$EXTENSION_ID/"
  ]
}
EOF
    echo "Registered Native Host for: $profile_root"
    installed=$((installed + 1))
  fi
done

if [[ $installed -eq 0 ]]; then
  echo "No Brave profile root was found under $CONFIG_HOME/BraveSoftware." >&2
  exit 1
fi

echo
echo "Installed successfully."
echo "Extension directory: $EXTENSION_ROOT"
echo "Extension ID:        $EXTENSION_ID"
echo
echo "Open brave://extensions, enable Developer mode, click Load unpacked,"
echo "and select the extension directory above. Then restart Brave."
