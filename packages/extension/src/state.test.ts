import type { PlaybackUpdate } from "@ytmdp/shared";
import { describe, expect, it } from "vitest";
import {
  selectActiveSource,
  toActivityPayload,
  type TabSource,
} from "./state.ts";

function source(
  tabId: number,
  state: PlaybackUpdate["playback"]["state"],
  observedAtMs: number,
  title = `Song ${tabId}`,
): TabSource {
  return {
    tabId,
    update: {
      type: "PLAYBACK_UPDATE",
      protocolVersion: 1,
      sourceId: `source-${tabId}`,
      observedAtMs,
      track: {
        title,
        artists: ["Artist"],
      },
      playback: {
        state,
        positionSeconds: 10,
        durationSeconds: 100,
      },
    },
  };
}

describe("extension state arbitration", () => {
  it("prefers a playing tab over a newer paused tab", () => {
    const active = selectActiveSource([
      source(1, "playing", 100),
      source(2, "paused", 200),
    ]);
    expect(active?.tabId).toBe(1);
  });

  it("chooses the newest tab when playback states match", () => {
    const active = selectActiveSource([
      source(1, "playing", 100),
      source(2, "playing", 200),
    ]);
    expect(active?.tabId).toBe(2);
  });

  it("maps playback snapshots to native activity payloads", () => {
    const activity = toActivityPayload(source(1, "playing", 1_000, "Track"));
    expect(activity).toMatchObject({
      title: "Track",
      artists: ["Artist"],
      playbackState: "playing",
      positionSeconds: 10,
      durationSeconds: 100,
      observedAtMs: 1_000,
    });
  });
});
