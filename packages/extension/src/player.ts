import type { PlaybackUpdate, Track } from "@ytmdp/shared";
import { PROTOCOL_VERSION } from "@ytmdp/shared";

const TITLE_SELECTORS = [
  ".title.ytmusic-player-bar",
  "yt-formatted-string.title",
  ".title",
];

const BYLINE_SELECTORS = [
  ".byline.ytmusic-player-bar",
  "yt-formatted-string.byline",
  ".byline",
];

const ARTWORK_SELECTORS = [
  "img.image.ytmusic-player-bar",
  "img.image",
  "yt-img-shadow img",
];

function firstText(root: ParentNode, selectors: readonly string[]): string | null {
  for (const selector of selectors) {
    const element = root.querySelector<HTMLElement>(selector);
    const text = (element?.innerText || element?.textContent)?.trim();
    if (text) return text;
  }
  return null;
}

function normalizeHttpsUrl(value: string | null | undefined): string | undefined {
  if (!value) return undefined;

  try {
    const url = new URL(value, "https://music.youtube.com");
    if (url.protocol !== "https:") return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}

function parseArtists(byline: string): string[] {
  const artistPart = byline.split("•", 1)[0]?.trim().replace(/,$/, "");
  if (!artistPart) return [];

  return artistPart
    .split(/\s*(?:,|&|·)\s*/u)
    .map((artist) => artist.trim())
    .filter(Boolean);
}

function parseAlbum(byline: string): string | undefined {
  const segments = byline
    .split("•")
    .map((segment) => segment.trim())
    .filter(Boolean);
  return segments.length >= 2 ? segments[1] : undefined;
}

function findTrackUrl(root: ParentNode, locationHref: string): string | undefined {
  const titleLink = root.querySelector<HTMLAnchorElement>(
    '.title a[href*="watch?v="], a.title[href*="watch?v="], a[href*="watch?v="]',
  );
  const linkUrl = normalizeHttpsUrl(titleLink?.getAttribute("href"));
  if (linkUrl?.startsWith("https://music.youtube.com/")) return linkUrl;

  try {
    const current = new URL(locationHref);
    if (current.hostname === "music.youtube.com" && current.searchParams.has("v")) {
      return current.toString();
    }
  } catch {
    // Ignore invalid test or transitional URLs.
  }
  return undefined;
}

export function readTrack(
  document: Document,
  locationHref = document.location.href,
): Track | null {
  const playerBar = document.querySelector<HTMLElement>("ytmusic-player-bar");
  if (!playerBar) return null;

  const root: ParentNode = playerBar.shadowRoot ?? playerBar;
  const title = firstText(root, TITLE_SELECTORS);
  const byline = firstText(root, BYLINE_SELECTORS);
  if (!title || !byline) return null;

  const artists = parseArtists(byline);
  if (artists.length === 0) return null;

  let artworkUrl: string | undefined;
  for (const selector of ARTWORK_SELECTORS) {
    const image = root.querySelector<HTMLImageElement>(selector);
    artworkUrl = normalizeHttpsUrl(image?.currentSrc || image?.src);
    if (artworkUrl) break;
  }

  const album = parseAlbum(byline);
  const trackUrl = findTrackUrl(root, locationHref);
  return {
    title,
    artists,
    ...(album ? { album } : {}),
    ...(artworkUrl ? { artworkUrl } : {}),
    ...(trackUrl ? { trackUrl } : {}),
  };
}

export function findMediaElement(document: Document): HTMLMediaElement | null {
  return document.querySelector<HTMLMediaElement>("video, audio");
}

function finiteOrZero(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function createPlaybackUpdate(
  document: Document,
  sourceId: string,
  observedAtMs = Date.now(),
): PlaybackUpdate {
  const track = readTrack(document);
  const media = findMediaElement(document);
  const hasTrack = track !== null;
  const isPlaying = Boolean(media && !media.paused && !media.ended && hasTrack);

  return {
    type: "PLAYBACK_UPDATE",
    protocolVersion: PROTOCOL_VERSION,
    sourceId,
    observedAtMs,
    track,
    playback: {
      state: isPlaying ? "playing" : hasTrack ? "paused" : "stopped",
      positionSeconds: finiteOrZero(media?.currentTime ?? 0),
      durationSeconds:
        media && Number.isFinite(media.duration) && media.duration > 0
          ? media.duration
          : null,
    },
  };
}
