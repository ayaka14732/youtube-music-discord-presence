// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import {
  createPlaybackUpdate,
  readTrack,
  TrackTransitionGuard,
} from "./player.ts";

function setPlayerMarkup(): HTMLMediaElement {
  document.body.innerHTML = `
    <ytmusic-player-bar>
      <a class="title" href="/watch?v=abc123">A Song</a>
      <div class="byline">First Artist &amp; Second Artist • The Album • 2026</div>
      <img class="image" src="https://lh3.googleusercontent.com/art=w120-h120" />
      <span class="time-info">0:42 / 3:00</span>
    </ytmusic-player-bar>
    <video></video>
  `;

  const media = document.querySelector("video");
  if (!media) throw new Error("missing media element");
  Object.defineProperties(media, {
    paused: { configurable: true, value: false },
    ended: { configurable: true, value: false },
    currentTime: { configurable: true, value: 42 },
    duration: { configurable: true, value: 180 },
  });
  return media;
}

describe("YouTube Music player reader", () => {
  it("extracts track data without relying on localized button labels", () => {
    setPlayerMarkup();
    const track = readTrack(document, "https://music.youtube.com/");

    expect(track).toEqual({
      title: "A Song",
      artists: ["First Artist", "Second Artist"],
      album: "The Album",
      artworkUrl: "https://lh3.googleusercontent.com/art=w120-h120",
      trackUrl: "https://music.youtube.com/watch?v=abc123",
    });
  });

  it("uses the media element as playback truth", () => {
    setPlayerMarkup();
    const update = createPlaybackUpdate(document, "source-1", 123456);

    expect(update.playback).toEqual({
      state: "playing",
      positionSeconds: 42,
      durationSeconds: 180,
    });
  });

  it("returns a stopped snapshot when there is no player metadata", () => {
    document.body.innerHTML = "<video></video>";
    const update = createPlaybackUpdate(document, "source-1", 123456);
    expect(update.track).toBeNull();
    expect(update.playback.state).toBe("stopped");
  });

  it("falls back to the displayed player time when media timing is unavailable", () => {
    const media = setPlayerMarkup();
    const timeInfo = document.querySelector<HTMLElement>(".time-info");
    if (!timeInfo) throw new Error("missing time info");
    timeInfo.textContent = "0:15 / 4:08";
    Object.defineProperties(media, {
      currentTime: { configurable: true, value: Number.NaN },
      duration: { configurable: true, value: Number.NaN },
    });

    expect(createPlaybackUpdate(document, "source-1", 123456).playback).toEqual({
      state: "playing",
      positionSeconds: 15,
      durationSeconds: 248,
    });
  });

  it("uses a reset displayed time while the shared media element is still stale", () => {
    setPlayerMarkup();
    const timeInfo = document.querySelector<HTMLElement>(".time-info");
    if (!timeInfo) throw new Error("missing time info");
    timeInfo.textContent = "0:01 / 4:08";

    expect(createPlaybackUpdate(document, "source-1", 123456).playback).toMatchObject({
      positionSeconds: 1,
      durationSeconds: 248,
    });
  });
});

describe("track transition guard", () => {
  function update(title: string, positionSeconds: number, observedAtMs: number) {
    return {
      type: "PLAYBACK_UPDATE" as const,
      protocolVersion: 1 as const,
      sourceId: "source-1",
      observedAtMs,
      track: { title, artists: ["Artist"] },
      playback: {
        state: "playing" as const,
        positionSeconds,
        durationSeconds: 508,
      },
    };
  }

  it("does not reuse the previous song position during a track change", () => {
    const guard = new TrackTransitionGuard();
    expect(guard.stabilize(update("Old song", 455, 1_000)).playback.positionSeconds).toBe(455);

    const firstNewSnapshot = guard.stabilize(update("New song", 455, 1_100));
    expect(firstNewSnapshot.playback).toMatchObject({
      positionSeconds: 0,
      durationSeconds: null,
    });
    expect(guard.isTransitioning).toBe(true);
    expect(guard.needsFollowUpSnapshot).toBe(true);

    const resetSnapshot = guard.stabilize(update("New song", 0.4, 1_500));
    expect(resetSnapshot.playback).toMatchObject({
      positionSeconds: 0.4,
      durationSeconds: 508,
    });
    expect(guard.isTransitioning).toBe(false);
    expect(guard.needsFollowUpSnapshot).toBe(false);
  });

  it("stops requesting transition snapshots after a short polling window", () => {
    const guard = new TrackTransitionGuard();
    guard.stabilize(update("Old song", 455, 1_000));
    guard.stabilize(update("New song", 455, 1_100));

    const laterSnapshot = guard.stabilize(update("New song", 460, 6_100));

    expect(laterSnapshot.playback).toMatchObject({
      positionSeconds: 0,
      durationSeconds: null,
    });
    expect(guard.isTransitioning).toBe(true);
    expect(guard.needsFollowUpSnapshot).toBe(false);
  });

  it("preserves a non-zero position on the first page snapshot", () => {
    const guard = new TrackTransitionGuard();
    expect(guard.stabilize(update("Opened song", 455, 1_000)).playback.positionSeconds).toBe(455);
  });
});
