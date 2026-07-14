import { describe, expect, it } from "vitest";
import { PROTOCOL_VERSION } from "./index.ts";
import { NativeRequestSchema, PlaybackUpdateSchema } from "./schema.ts";

describe("shared protocol", () => {
  it("accepts a valid playback update", () => {
    const result = PlaybackUpdateSchema.safeParse({
      type: "PLAYBACK_UPDATE",
      protocolVersion: PROTOCOL_VERSION,
      sourceId: "page-1",
      observedAtMs: Date.now(),
      track: {
        title: "Song",
        artists: ["Artist"],
        artworkUrl: "https://example.com/art.jpg",
        trackUrl: "https://music.youtube.com/watch?v=abc",
      },
      playback: {
        state: "playing",
        positionSeconds: 12,
        durationSeconds: 180,
      },
    });

    expect(result.success).toBe(true);
  });

  it("rejects non-HTTPS artwork and malformed activity payloads", () => {
    const result = NativeRequestSchema.safeParse({
      type: "SET_ACTIVITY",
      protocolVersion: PROTOCOL_VERSION,
      activity: {
        title: "Song",
        artists: ["Artist"],
        artworkUrl: "javascript:alert(1)",
        playbackState: "playing",
        positionSeconds: -10,
        durationSeconds: 180,
        observedAtMs: Date.now(),
      },
    });

    expect(result.success).toBe(false);
  });
});
