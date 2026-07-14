import { describe, expect, it, vi } from "vitest";
import { buildDiscordActivity } from "./activity.ts";

describe("Discord activity mapping", () => {
  it("builds corrected timestamps for a playing track", () => {
    vi.setSystemTime(20_000);
    const result = buildDiscordActivity({
      title: "Track",
      artists: ["Artist"],
      trackUrl: "https://music.youtube.com/watch?v=abc",
      playbackState: "playing",
      positionSeconds: 5,
      durationSeconds: 100,
      observedAtMs: 18_000,
    });

    expect(result).toMatchObject({
      name: "YouTube Music",
      type: 2,
      details: "Track",
      state: "Artist",
      startTimestamp: 13_000,
      endTimestamp: 113_000,
      buttons: [{ label: "Open in YouTube Music" }],
    });
    vi.useRealTimers();
  });

  it("removes timestamps while paused", () => {
    const result = buildDiscordActivity({
      title: "Track",
      artists: ["Artist"],
      playbackState: "paused",
      positionSeconds: 5,
      durationSeconds: 100,
      observedAtMs: Date.now(),
    });

    expect(result.state).toContain("Paused");
    expect("startTimestamp" in result).toBe(false);
    expect("endTimestamp" in result).toBe(false);
  });
});
