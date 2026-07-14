import {
  NATIVE_HOST_NAME,
  PROTOCOL_VERSION,
  type ExtensionStatus,
  type NativeRequest,
} from "@ytmdp/shared";
import { ContentMessageSchema, NativeResponseSchema } from "@ytmdp/shared/schema";
import {
  activityFingerprint,
  pauseIdentity,
  selectActiveSource,
  toActivityPayload,
  type TabSource,
} from "./state.ts";

const SESSION_SOURCES_KEY = "playbackSources";
const SESSION_STATUS_KEY = "extensionStatus";
const RECONNECT_ALARM = "native-host-reconnect";
const PAUSE_ALARM = "pause-hide-timeout";
const DEFAULT_PAUSE_TIMEOUT_MINUTES = 5;
const MAX_DISCORD_UPDATES_PER_WINDOW = 4;
const DISCORD_RATE_WINDOW_MS = 20_000;

let initialized = false;
let initializePromise: Promise<void> | undefined;
let sources = new Map<number, TabSource>();
let nativePort: chrome.runtime.Port | null = null;
let hostReady = false;
let reconnectAttempt = 0;
let lastSentFingerprint = "";
let queuedNativeRequest: NativeRequest | null = null;
let rateLimitTimer: ReturnType<typeof setTimeout> | undefined;
let activitySendTimes: number[] = [];
let hiddenPausedIdentity: string | null = null;

let status: ExtensionStatus = {
  enabled: true,
  hostStatus: "disconnected",
  discordStatus: "disconnected",
  pauseTimeoutMinutes: DEFAULT_PAUSE_TIMEOUT_MINUTES,
};

type ExtensionStatusPatch = {
  [Key in keyof ExtensionStatus]?: ExtensionStatus[Key] | undefined;
};

function serializeSources(): TabSource[] {
  return [...sources.values()];
}

async function persistSources(): Promise<void> {
  await chrome.storage.session.set({ [SESSION_SOURCES_KEY]: serializeSources() });
}

async function publishStatus(patch: ExtensionStatusPatch = {}): Promise<void> {
  const next = { ...status, ...patch } as ExtensionStatus;
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete (next as unknown as Record<string, unknown>)[key];
  }
  status = next;
  await chrome.storage.session.set({ [SESSION_STATUS_KEY]: status });
  await chrome.action.setBadgeText({
    text:
      !status.enabled || status.discordStatus === "connected"
        ? ""
        : status.hostStatus === "error" || status.discordStatus === "error"
          ? "!"
          : "…",
  });
  if (status.hostStatus === "error" || status.discordStatus === "error") {
    await chrome.action.setBadgeBackgroundColor({ color: "#ed4245" });
  } else {
    await chrome.action.setBadgeBackgroundColor({ color: "#f0b232" });
  }
  void chrome.runtime.sendMessage({ type: "STATUS_UPDATE", status }).catch(() => undefined);
}

async function initialize(): Promise<void> {
  if (initialized) return;
  if (initializePromise) return initializePromise;

  initializePromise = (async () => {
    const [session, local, tabs] = await Promise.all([
      chrome.storage.session.get([SESSION_SOURCES_KEY, SESSION_STATUS_KEY]),
      chrome.storage.local.get({
        enabled: true,
        pauseTimeoutMinutes: DEFAULT_PAUSE_TIMEOUT_MINUTES,
      }),
      chrome.tabs.query({ url: "https://music.youtube.com/*" }),
    ]);

    const validTabIds = new Set(
      tabs.flatMap((tab) => (typeof tab.id === "number" ? [tab.id] : [])),
    );
    const restored = session[SESSION_SOURCES_KEY];
    if (Array.isArray(restored)) {
      for (const value of restored) {
        if (
          typeof value === "object" &&
          value !== null &&
          "tabId" in value &&
          typeof value.tabId === "number" &&
          validTabIds.has(value.tabId) &&
          "update" in value
        ) {
          const parsed = ContentMessageSchema.safeParse(value.update);
          if (parsed.success && parsed.data.type === "PLAYBACK_UPDATE") {
            sources.set(value.tabId, { tabId: value.tabId, update: parsed.data });
          }
        }
      }
    }

    const previousStatus = session[SESSION_STATUS_KEY];
    if (typeof previousStatus === "object" && previousStatus !== null) {
      status = { ...status, ...(previousStatus as Partial<ExtensionStatus>) };
    }
    status.enabled = local.enabled === true;
    status.pauseTimeoutMinutes =
      typeof local.pauseTimeoutMinutes === "number"
        ? local.pauseTimeoutMinutes
        : DEFAULT_PAUSE_TIMEOUT_MINUTES;
    status.hostStatus = "disconnected";
    status.discordStatus = "disconnected";
    delete status.errorMessage;
    delete status.discordUsername;

    initialized = true;
    await persistSources();
    await reconcileActivity();
    await requestSnapshots();
  })();

  try {
    await initializePromise;
  } finally {
    initializePromise = undefined;
  }
}

async function requestSnapshots(): Promise<void> {
  const tabs = await chrome.tabs.query({ url: "https://music.youtube.com/*" });
  await Promise.all(
    tabs.map(async (tab) => {
      if (typeof tab.id !== "number") return;
      await chrome.tabs.sendMessage(tab.id, { type: "REQUEST_SNAPSHOT" }).catch(() => undefined);
    }),
  );
}

function postNative(request: NativeRequest): void {
  if (!nativePort || !hostReady) {
    queuedNativeRequest = request;
    ensureNativeConnection();
    return;
  }

  try {
    nativePort.postMessage(request);
  } catch (error) {
    queuedNativeRequest = request;
    void handleNativeDisconnect(error instanceof Error ? error.message : String(error));
  }
}

function sendRateLimited(request: NativeRequest): void {
  const now = Date.now();
  activitySendTimes = activitySendTimes.filter(
    (timestamp) => now - timestamp < DISCORD_RATE_WINDOW_MS,
  );

  if (activitySendTimes.length < MAX_DISCORD_UPDATES_PER_WINDOW) {
    activitySendTimes.push(now);
    postNative(request);
    return;
  }

  queuedNativeRequest = request;
  if (rateLimitTimer) return;
  const waitMs = Math.max(100, DISCORD_RATE_WINDOW_MS - (activitySendTimes[0] ?? now) + 100);
  rateLimitTimer = setTimeout(() => {
    rateLimitTimer = undefined;
    const queued = queuedNativeRequest;
    queuedNativeRequest = null;
    if (queued) sendRateLimited(queued);
  }, waitMs);
}

function ensureNativeConnection(): void {
  if (!status.enabled || nativePort) return;

  void publishStatus({
    hostStatus: "connecting",
    discordStatus: "connecting",
    errorMessage: undefined,
  });

  try {
    const port = chrome.runtime.connectNative(NATIVE_HOST_NAME);
    nativePort = port;
    hostReady = false;
    port.onMessage.addListener(handleNativeMessage);
    port.onDisconnect.addListener(() => {
      const message = chrome.runtime.lastError?.message ?? "Native Host disconnected";
      void handleNativeDisconnect(message);
    });
  } catch (error) {
    void handleNativeDisconnect(error instanceof Error ? error.message : String(error));
  }
}

function handleNativeMessage(message: unknown): void {
  const parsed = NativeResponseSchema.safeParse(message);
  if (!parsed.success) {
    void publishStatus({ hostStatus: "error", errorMessage: "Native Host returned invalid data" });
    return;
  }

  const response = parsed.data;
  switch (response.type) {
    case "HOST_READY": {
      hostReady = true;
      reconnectAttempt = 0;
      void chrome.alarms.clear(RECONNECT_ALARM);
      void publishStatus({ hostStatus: "connected", errorMessage: undefined });
      const queued = queuedNativeRequest;
      queuedNativeRequest = null;
      if (queued) postNative(queued);
      break;
    }
    case "DISCORD_STATUS":
      void publishStatus({
        discordStatus: response.status,
        ...(response.username ? { discordUsername: response.username } : {}),
        ...(response.message ? { errorMessage: response.message } : {}),
      });
      break;
    case "ACTIVITY_STATUS":
      if (response.status === "error") {
        void publishStatus({
          discordStatus: "error",
          errorMessage: response.message ?? "Failed to update Discord activity",
        });
      }
      break;
    case "HOST_ERROR":
      void publishStatus({ hostStatus: "error", errorMessage: response.message });
      break;
    case "PONG":
      break;
  }
}

async function handleNativeDisconnect(message: string): Promise<void> {
  nativePort = null;
  hostReady = false;
  await publishStatus({
    hostStatus: "disconnected",
    discordStatus: "disconnected",
    errorMessage: message,
  });

  if (status.enabled && status.activeActivity) {
    reconnectAttempt += 1;
    const delayMinutes = Math.min(4, 0.5 * 2 ** Math.min(reconnectAttempt - 1, 3));
    await chrome.alarms.create(RECONNECT_ALARM, { delayInMinutes: delayMinutes });
  }
}

async function schedulePauseTimeout(source: TabSource): Promise<void> {
  await chrome.alarms.clear(PAUSE_ALARM);
  if (source.update.playback.state !== "paused") return;
  if (status.pauseTimeoutMinutes < 0) return;
  if (status.pauseTimeoutMinutes === 0) {
    hiddenPausedIdentity = pauseIdentity(source);
    return;
  }
  await chrome.alarms.create(PAUSE_ALARM, {
    delayInMinutes: status.pauseTimeoutMinutes,
  });
}

async function reconcileActivity(): Promise<void> {
  if (!initialized) return;
  const activeSource = selectActiveSource(sources.values());
  let activity = activeSource ? toActivityPayload(activeSource) : null;

  if (activeSource?.update.playback.state === "playing") {
    hiddenPausedIdentity = null;
    await chrome.alarms.clear(PAUSE_ALARM);
  } else if (activeSource && hiddenPausedIdentity === pauseIdentity(activeSource)) {
    activity = null;
  }

  if (!status.enabled) activity = null;
  const fingerprint = activityFingerprint(activity);
  const changed = fingerprint !== lastSentFingerprint;

  await publishStatus({ activeActivity: activity ?? undefined });
  if (!changed) return;
  lastSentFingerprint = fingerprint;

  if (activeSource && activity?.playbackState === "paused") {
    await schedulePauseTimeout(activeSource);
    if (hiddenPausedIdentity === pauseIdentity(activeSource)) activity = null;
  }

  const request: NativeRequest = activity
    ? { type: "SET_ACTIVITY", protocolVersion: PROTOCOL_VERSION, activity }
    : { type: "CLEAR_ACTIVITY", protocolVersion: PROTOCOL_VERSION };
  sendRateLimited(request);
}

async function handleContentMessage(
  message: unknown,
  sender: chrome.runtime.MessageSender,
): Promise<{ ok: boolean }> {
  const parsed = ContentMessageSchema.safeParse(message);
  const tabId = sender.tab?.id;
  const senderUrl = sender.tab?.url;
  if (!parsed.success || typeof tabId !== "number" || !senderUrl?.startsWith("https://music.youtube.com/")) {
    return { ok: false };
  }

  if (parsed.data.type === "SOURCE_GONE") {
    const existing = sources.get(tabId);
    if (existing?.update.sourceId === parsed.data.sourceId) sources.delete(tabId);
  } else {
    sources.set(tabId, { tabId, update: parsed.data });
  }
  await persistSources();
  await reconcileActivity();
  return { ok: true };
}

async function handlePopupMessage(message: unknown): Promise<unknown> {
  if (typeof message !== "object" || message === null || !("type" in message)) return undefined;

  switch (message.type) {
    case "GET_STATUS":
      return { type: "STATUS_RESPONSE", status };
    case "SET_ENABLED": {
      const enabled = "enabled" in message && message.enabled === true;
      await chrome.storage.local.set({ enabled });
      status.enabled = enabled;
      if (enabled) {
        hiddenPausedIdentity = null;
      }
      await reconcileActivity();
      return { ok: true };
    }
    case "SET_PAUSE_TIMEOUT": {
      if (!("minutes" in message) || typeof message.minutes !== "number") return { ok: false };
      const minutes = Math.max(-1, Math.min(60, Math.floor(message.minutes)));
      status.pauseTimeoutMinutes = minutes;
      hiddenPausedIdentity = null;
      await chrome.storage.local.set({ pauseTimeoutMinutes: minutes });
      await reconcileActivity();
      return { ok: true };
    }
    case "RECONNECT":
      nativePort?.disconnect();
      nativePort = null;
      hostReady = false;
      reconnectAttempt = 0;
      ensureNativeConnection();
      return { ok: true };
    default:
      return undefined;
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void initialize()
    .then(async () => {
      const isContentMessage = ContentMessageSchema.safeParse(message).success;
      return isContentMessage
        ? handleContentMessage(message, sender)
        : handlePopupMessage(message);
    })
    .then(sendResponse)
    .catch((error: unknown) => {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    });
  return true;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void initialize().then(async () => {
    if (!sources.delete(tabId)) return;
    await persistSources();
    await reconcileActivity();
  });
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url && !changeInfo.url.startsWith("https://music.youtube.com/")) {
    void initialize().then(async () => {
      if (!sources.delete(tabId)) return;
      await persistSources();
      await reconcileActivity();
    });
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void initialize().then(async () => {
    if (alarm.name === RECONNECT_ALARM) {
      ensureNativeConnection();
    } else if (alarm.name === PAUSE_ALARM) {
      const active = selectActiveSource(sources.values());
      if (active?.update.playback.state === "paused") {
        hiddenPausedIdentity = pauseIdentity(active);
        lastSentFingerprint = "";
        await reconcileActivity();
      }
    }
  });
});

chrome.runtime.onInstalled.addListener(() => {
  void initialize().then(requestSnapshots);
});

chrome.runtime.onStartup.addListener(() => {
  void initialize().then(requestSnapshots);
});

void initialize();
