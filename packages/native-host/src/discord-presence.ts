import { Client } from "@xhayper/discord-rpc";
import type { ActivityPayload, NativeResponse } from "@ytmdp/shared";
import { buildDiscordActivity } from "./activity.ts";

type Emit = (message: NativeResponse) => void;

export class DiscordPresence {
  private readonly client: Client;
  private ready = false;
  private connecting = false;
  private desiredActivity: ActivityPayload | null = null;
  private retryAttempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private shuttingDown = false;

  constructor(clientId: string, private readonly emit: Emit) {
    this.client = new Client({ clientId });
    this.client.on("ready", () => {
      this.ready = true;
      this.connecting = false;
      this.retryAttempt = 0;
      this.emit({
        type: "DISCORD_STATUS",
        status: "connected",
        ...(this.client.user?.username ? { username: this.client.user.username } : {}),
      });
      void this.applyDesiredActivity();
    });
    this.client.on("disconnected", () => {
      this.ready = false;
      this.connecting = false;
      this.emit({ type: "DISCORD_STATUS", status: "disconnected" });
      this.scheduleReconnect();
    });
    this.client.on("error", (error) => {
      this.ready = false;
      this.connecting = false;
      this.emit({
        type: "DISCORD_STATUS",
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      this.scheduleReconnect();
    });
  }

  connect(): void {
    if (this.ready || this.connecting || this.shuttingDown) return;
    this.connecting = true;
    this.emit({ type: "DISCORD_STATUS", status: "connecting" });
    void this.client.login().catch((error: unknown) => {
      this.ready = false;
      this.connecting = false;
      this.emit({
        type: "DISCORD_STATUS",
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
      this.scheduleReconnect();
    });
  }

  async setActivity(activity: ActivityPayload): Promise<void> {
    this.desiredActivity = activity;
    if (!this.ready) {
      this.emit({ type: "ACTIVITY_STATUS", status: "queued" });
      this.connect();
      return;
    }
    await this.applyDesiredActivity();
  }

  async clearActivity(): Promise<void> {
    this.desiredActivity = null;
    if (!this.ready || !this.client.user) {
      this.emit({ type: "ACTIVITY_STATUS", status: "cleared" });
      return;
    }
    try {
      await this.client.user.clearActivity();
      this.emit({ type: "ACTIVITY_STATUS", status: "cleared" });
    } catch (error) {
      this.emit({
        type: "ACTIVITY_STATUS",
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    await this.clearActivity();
    try {
      await this.client.destroy();
    } catch {
      // Discord may already be gone.
    }
  }

  private async applyDesiredActivity(): Promise<void> {
    if (!this.ready || !this.client.user || !this.desiredActivity) return;
    try {
      await this.client.user.setActivity(buildDiscordActivity(this.desiredActivity));
      this.emit({ type: "ACTIVITY_STATUS", status: "set" });
    } catch (error) {
      this.emit({
        type: "ACTIVITY_STATUS",
        status: "error",
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private scheduleReconnect(): void {
    if (this.retryTimer || this.shuttingDown) return;
    const delayMs = Math.min(60_000, 2_000 * 2 ** Math.min(this.retryAttempt, 5));
    this.retryAttempt += 1;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.connect();
    }, delayMs);
  }
}
