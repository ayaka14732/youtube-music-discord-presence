import type { ActivityPayload, PlaybackUpdate } from "@ytmdp/shared";

export interface TabSource {
  tabId: number;
  update: PlaybackUpdate;
}

export function selectActiveSource(sources: Iterable<TabSource>): TabSource | null {
  const candidates = [...sources].filter(
    ({ update }) => update.track && update.playback.state !== "stopped",
  );

  candidates.sort((left, right) => {
    const leftPlaying = left.update.playback.state === "playing" ? 1 : 0;
    const rightPlaying = right.update.playback.state === "playing" ? 1 : 0;
    return rightPlaying - leftPlaying || right.update.observedAtMs - left.update.observedAtMs;
  });

  return candidates[0] ?? null;
}

export function toActivityPayload(source: TabSource): ActivityPayload | null {
  const { track, playback, observedAtMs } = source.update;
  if (!track || playback.state === "stopped") return null;

  return {
    title: track.title,
    artists: track.artists,
    ...(track.album ? { album: track.album } : {}),
    ...(track.artworkUrl ? { artworkUrl: track.artworkUrl } : {}),
    ...(track.trackUrl ? { trackUrl: track.trackUrl } : {}),
    playbackState: playback.state,
    positionSeconds: playback.positionSeconds,
    durationSeconds: playback.durationSeconds,
    observedAtMs,
  };
}

export function activityFingerprint(activity: ActivityPayload | null): string {
  if (!activity) return "clear";
  return JSON.stringify({
    title: activity.title,
    artists: activity.artists,
    album: activity.album,
    artworkUrl: activity.artworkUrl,
    trackUrl: activity.trackUrl,
    playbackState: activity.playbackState,
    position: Math.floor(activity.positionSeconds),
    duration: activity.durationSeconds && Math.floor(activity.durationSeconds),
  });
}

export function pauseIdentity(source: TabSource): string {
  return `${source.tabId}:${source.update.sourceId}:${source.update.track?.title ?? ""}`;
}
