import { PROTOCOL_VERSION } from "@ytmdp/shared";
import { createPlaybackUpdate, findMediaElement } from "./player.ts";

declare global {
  interface Window {
    __ytmdpContentLoaded?: boolean;
  }
}

if (!window.__ytmdpContentLoaded) {
  window.__ytmdpContentLoaded = true;
  const sourceId = crypto.randomUUID();
  let debounceTimer: number | undefined;
  let observedMedia: HTMLMediaElement | null = null;
  const onMediaEvent = (): void => scheduleSnapshot();

  const sendSnapshot = (): void => {
    const message = createPlaybackUpdate(document, sourceId);
    void chrome.runtime.sendMessage(message).catch(() => {
      // The extension may have been reloaded while this page stayed open.
    });
  };

  const scheduleSnapshot = (delayMs = 120): void => {
    if (debounceTimer !== undefined) window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(sendSnapshot, delayMs);
  };

  const mediaEvents = [
    "play",
    "pause",
    "ended",
    "emptied",
    "loadedmetadata",
    "durationchange",
    "seeked",
  ] as const;

  const observeMedia = (): void => {
    const media = findMediaElement(document);
    if (media === observedMedia) return;

    if (observedMedia) {
      for (const event of mediaEvents) {
        observedMedia.removeEventListener(event, onMediaEvent);
      }
    }

    observedMedia = media;
    if (observedMedia) {
      for (const event of mediaEvents) {
        observedMedia.addEventListener(event, onMediaEvent);
      }
    }
  };

  const observer = new MutationObserver(() => {
    observeMedia();
    scheduleSnapshot();
  });

  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["src", "href", "title", "aria-label"],
  });

  window.addEventListener("yt-navigate-finish", () => scheduleSnapshot(0));
  chrome.runtime.onMessage.addListener((message: unknown) => {
    if (
      typeof message === "object" &&
      message !== null &&
      "type" in message &&
      message.type === "REQUEST_SNAPSHOT"
    ) {
      scheduleSnapshot(0);
    }
  });

  window.addEventListener("pagehide", () => {
    observer.disconnect();
    void chrome.runtime
      .sendMessage({
        type: "SOURCE_GONE",
        protocolVersion: PROTOCOL_VERSION,
        sourceId,
      })
      .catch(() => undefined);
  });

  observeMedia();
  scheduleSnapshot(0);
}
