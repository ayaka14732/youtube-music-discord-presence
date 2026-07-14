# YouTube Music Discord Presence

A local-first Brave extension for showing the current YouTube Music track as
Discord Rich Presence. The primary target is Arch Linux with Brave Beta and the
Discord desktop client.

## How it works

The Manifest V3 extension reads playback information from `music.youtube.com`.
Its service worker chooses the active tab and forwards a validated activity over
Chrome Native Messaging. A small Node.js Native Host then updates Discord over
the local desktop RPC socket. No Discord user token, OAuth login, web service, or
remote telemetry is used.

## Requirements

- Node.js 26 or newer
- pnpm 11 or newer
- Brave Beta
- Discord desktop client
- A Discord application and its numeric Application ID

Create an application in the Discord Developer Portal. Its application name and
icon are what Discord uses for the Rich Presence identity. No client secret is
needed.

## Build

```bash
pnpm install
pnpm check
```

Build output is written to:

- `packages/extension/dist`
- `packages/native-host/dist/native-host.cjs`

## Install on this machine

```bash
./scripts/install-linux.sh --client-id YOUR_DISCORD_APPLICATION_ID
```

The installer only writes to the current user's XDG directories. It registers
the Native Host for every existing Brave Stable, Beta, or Dev profile root and
prints the unpacked extension directory.

Then:

1. Open `brave://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select `~/.local/share/youtube-music-discord-presence/extension`.
5. Confirm the extension ID is `klebilgcaopidgkbffhnffgjljegimno`.
6. Restart Brave, start Discord, and play a song on YouTube Music.

Run diagnostics with:

```bash
./scripts/doctor-linux.sh
```

The Native Host log is stored at
`~/.local/state/youtube-music-discord-presence/native-host.log`.

## Uninstall

```bash
./scripts/uninstall-linux.sh
```

Pass `--purge` to also delete the Discord Application ID configuration.

## Behavior

- A playing tab takes precedence over paused tabs.
- When multiple tabs are playing, the most recently updated tab wins.
- Pause, resume, seek, track changes, tab closure, and Discord restarts are handled.
- Paused activity is hidden after five minutes by default; the popup can change it.
- Discord updates are deduplicated and rate-limited.
- Closing Brave closes the Native Messaging pipe, clears the activity, and stops
  the Native Host process.

## Development

```bash
pnpm test:watch
pnpm typecheck
pnpm build
```
