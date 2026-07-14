import type { ExtensionStatus } from "@ytmdp/shared";

const enabledInput = document.querySelector<HTMLInputElement>("#enabled");
const pauseTimeout = document.querySelector<HTMLSelectElement>("#pause-timeout");
const reconnectButton = document.querySelector<HTMLButtonElement>("#reconnect");
const songElement = document.querySelector<HTMLElement>("#song");
const artistElement = document.querySelector<HTMLElement>("#artist");
const hostStatus = document.querySelector<HTMLElement>("#host-status");
const discordStatus = document.querySelector<HTMLElement>("#discord-status");
const errorElement = document.querySelector<HTMLElement>("#error");

const labels = {
  disconnected: "未连接",
  connecting: "连接中",
  connected: "已连接",
  error: "错误",
} as const;

function renderConnection(
  element: HTMLElement | null,
  value: ExtensionStatus["hostStatus"],
): void {
  if (!element) return;
  element.textContent = labels[value];
  element.className = `status ${value}`;
}

function render(status: ExtensionStatus): void {
  if (enabledInput) enabledInput.checked = status.enabled;
  if (pauseTimeout) pauseTimeout.value = String(status.pauseTimeoutMinutes);
  renderConnection(hostStatus, status.hostStatus);
  renderConnection(discordStatus, status.discordStatus);

  if (status.activeActivity) {
    if (songElement) songElement.textContent = status.activeActivity.title;
    if (artistElement) {
      const suffix = status.activeActivity.playbackState === "paused" ? " · 已暂停" : "";
      artistElement.textContent = `${status.activeActivity.artists.join(", ")}${suffix}`;
    }
  } else {
    if (songElement) songElement.textContent = status.enabled ? "等待 YouTube Music…" : "共享已关闭";
    if (artistElement) artistElement.textContent = status.enabled ? "播放歌曲后会自动显示" : "";
  }

  if (errorElement) {
    errorElement.hidden = !status.errorMessage;
    errorElement.textContent = status.errorMessage ?? "";
  }
}

async function getStatus(): Promise<void> {
  const response = (await chrome.runtime.sendMessage({ type: "GET_STATUS" })) as
    | { type: "STATUS_RESPONSE"; status: ExtensionStatus }
    | undefined;
  if (response?.type === "STATUS_RESPONSE") render(response.status);
}

enabledInput?.addEventListener("change", () => {
  void chrome.runtime
    .sendMessage({ type: "SET_ENABLED", enabled: enabledInput.checked })
    .then(getStatus);
});

pauseTimeout?.addEventListener("change", () => {
  void chrome.runtime
    .sendMessage({ type: "SET_PAUSE_TIMEOUT", minutes: Number(pauseTimeout.value) })
    .then(getStatus);
});

reconnectButton?.addEventListener("click", () => {
  reconnectButton.disabled = true;
  void chrome.runtime
    .sendMessage({ type: "RECONNECT" })
    .then(getStatus)
    .finally(() => {
      reconnectButton.disabled = false;
    });
});

chrome.runtime.onMessage.addListener((message: unknown) => {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "STATUS_UPDATE" &&
    "status" in message
  ) {
    render(message.status as ExtensionStatus);
  }
});

void getStatus();
