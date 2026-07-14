#!/usr/bin/env bash
set -u

HOST_NAME="dev.ayaka.youtube_music_discord_presence"
EXTENSION_ID="klebilgcaopidgkbffhnffgjljegimno"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
INSTALL_ROOT="$DATA_HOME/youtube-music-discord-presence"
failures=0

check_file() {
  if [[ -f "$1" ]]; then
    echo "[ok] $2: $1"
  else
    echo "[missing] $2: $1"
    failures=$((failures + 1))
  fi
}

if command -v node >/dev/null 2>&1; then
  echo "[ok] Node: $(node --version) ($(command -v node))"
else
  echo "[missing] Node.js"
  failures=$((failures + 1))
fi

if command -v brave-browser-beta >/dev/null 2>&1; then
  echo "[ok] Brave Beta: $(command -v brave-browser-beta)"
else
  echo "[missing] brave-browser-beta"
  failures=$((failures + 1))
fi

if command -v discord >/dev/null 2>&1; then
  echo "[ok] Discord: $(command -v discord)"
else
  echo "[missing] Discord"
  failures=$((failures + 1))
fi

check_file "$INSTALL_ROOT/native-host/native-host" "Native Host launcher"
check_file "$INSTALL_ROOT/native-host/native-host.cjs" "Native Host bundle"
check_file "$INSTALL_ROOT/extension/manifest.json" "Extension"
check_file "$CONFIG_HOME/youtube-music-discord-presence/config.json" "Configuration"

found_manifest=false
for profile_root in \
  "$CONFIG_HOME/BraveSoftware/Brave-Browser" \
  "$CONFIG_HOME/BraveSoftware/Brave-Browser-Beta" \
  "$CONFIG_HOME/BraveSoftware/Brave-Browser-Dev"
do
  manifest="$profile_root/NativeMessagingHosts/$HOST_NAME.json"
  if [[ -f "$manifest" ]]; then
    echo "[ok] Native Host manifest: $manifest"
    found_manifest=true
  fi
done

if [[ "$found_manifest" == false ]]; then
  echo "[missing] No Brave Native Host manifest found"
  failures=$((failures + 1))
fi

echo "[info] Expected extension ID: $EXTENSION_ID"
echo "[info] Load unpacked directory: $INSTALL_ROOT/extension"
echo "[info] Native log: ${XDG_STATE_HOME:-$HOME/.local/state}/youtube-music-discord-presence/native-host.log"

if [[ $failures -gt 0 ]]; then
  echo "Doctor found $failures problem(s)."
  exit 1
fi
echo "All installation checks passed."
