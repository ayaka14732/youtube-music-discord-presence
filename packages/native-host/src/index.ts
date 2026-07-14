import { PROTOCOL_VERSION, type NativeResponse } from "@ytmdp/shared";
import { NativeRequestSchema } from "@ytmdp/shared/schema";
import { loadConfig } from "./config.ts";
import { DiscordPresence } from "./discord-presence.ts";
import { encodeNativeMessage, NativeMessageDecoder } from "./framing.ts";

const HOST_VERSION = "0.1.0";
const decoder = new NativeMessageDecoder();
let presence: DiscordPresence | null = null;
let shuttingDown = false;

function log(message: string, error?: unknown): void {
  const suffix = error ? `: ${error instanceof Error ? error.stack ?? error.message : String(error)}` : "";
  process.stderr.write(`[ytmdp-native] ${message}${suffix}\n`);
}

function send(message: NativeResponse): void {
  try {
    process.stdout.write(encodeNativeMessage(message));
  } catch (error) {
    log("Failed to send native message", error);
  }
}

async function handleMessage(rawMessage: unknown): Promise<void> {
  const parsed = NativeRequestSchema.safeParse(rawMessage);
  if (!parsed.success) {
    send({ type: "HOST_ERROR", message: "Invalid message from extension" });
    return;
  }

  switch (parsed.data.type) {
    case "PING":
      send({ type: "PONG", protocolVersion: PROTOCOL_VERSION });
      break;
    case "SET_ACTIVITY":
      if (!presence) {
        send({ type: "ACTIVITY_STATUS", status: "error", message: "Discord is not configured" });
        return;
      }
      await presence.setActivity(parsed.data.activity);
      break;
    case "CLEAR_ACTIVITY":
      await presence?.clearActivity();
      if (!presence) send({ type: "ACTIVITY_STATUS", status: "cleared" });
      break;
  }
}

async function shutdown(exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  const forceExit = setTimeout(() => process.exit(exitCode), 1_500);
  forceExit.unref();
  await presence?.shutdown();
  await Promise.all([
    new Promise<void>((resolve) => process.stdout.write("", resolve)),
    new Promise<void>((resolve) => process.stderr.write("", resolve)),
  ]);
  process.exit(exitCode);
}

send({ type: "HOST_READY", protocolVersion: PROTOCOL_VERSION, version: HOST_VERSION });

try {
  const config = loadConfig();
  log(`Loaded configuration from ${config.configPath}`);
  presence = new DiscordPresence(config.discordClientId, send);
  presence.connect();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  log("Configuration error", error);
  send({ type: "DISCORD_STATUS", status: "error", message });
}

process.stdin.on("data", (chunk: Buffer) => {
  try {
    for (const message of decoder.push(chunk)) {
      void handleMessage(message).catch((error: unknown) => {
        log("Message handling failed", error);
        send({
          type: "HOST_ERROR",
          message: error instanceof Error ? error.message : String(error),
        });
      });
    }
  } catch (error) {
    log("Native protocol error", error);
    send({ type: "HOST_ERROR", message: "Native Messaging protocol error" });
    void shutdown(1);
  }
});

process.stdin.on("end", () => void shutdown(0));
process.stdin.on("error", (error) => {
  log("stdin error", error);
  void shutdown(1);
});
process.on("SIGTERM", () => void shutdown(0));
process.on("SIGINT", () => void shutdown(0));
process.on("uncaughtException", (error) => {
  log("Uncaught exception", error);
  send({ type: "HOST_ERROR", message: error.message });
  void shutdown(1);
});
process.on("unhandledRejection", (error) => {
  log("Unhandled rejection", error);
  send({ type: "HOST_ERROR", message: error instanceof Error ? error.message : String(error) });
});
