#!/usr/bin/env bash
set -euo pipefail

HOST_NAME="dev.ayaka.youtube_music_discord_presence"
CONFIG_HOME="${XDG_CONFIG_HOME:-$HOME/.config}"
DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
PURGE_CONFIG=false

if [[ "${1:-}" == "--purge" ]]; then
  PURGE_CONFIG=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: $0 [--purge]" >&2
  exit 2
fi

for profile_root in \
  "$CONFIG_HOME/BraveSoftware/Brave-Browser" \
  "$CONFIG_HOME/BraveSoftware/Brave-Browser-Beta" \
  "$CONFIG_HOME/BraveSoftware/Brave-Browser-Dev"
do
  manifest="$profile_root/NativeMessagingHosts/$HOST_NAME.json"
  if [[ -f "$manifest" ]]; then
    rm -- "$manifest"
    echo "Removed: $manifest"
  fi
done

rm -rf -- "$DATA_HOME/youtube-music-discord-presence"
rm -rf -- "${XDG_STATE_HOME:-$HOME/.local/state}/youtube-music-discord-presence"
if [[ "$PURGE_CONFIG" == true ]]; then
  rm -rf -- "$CONFIG_HOME/youtube-music-discord-presence"
fi

echo "Uninstalled. Remove the extension from brave://extensions if it is still listed."
