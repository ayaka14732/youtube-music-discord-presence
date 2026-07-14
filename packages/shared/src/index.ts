export const PROTOCOL_VERSION = 1 as const;
export const NATIVE_HOST_NAME = "dev.ayaka.youtube_music_discord_presence";
export const EXTENSION_ID = "klebilgcaopidgkbffhnffgjljegimno";

export interface Track {
  title: string;
  artists: string[];
  album?: string | undefined;
  artworkUrl?: string | undefined;
  trackUrl?: string | undefined;
}

export interface Playback {
  state: "playing" | "paused" | "stopped";
  positionSeconds: number;
  durationSeconds: number | null;
}

export interface PlaybackUpdate {
  type: "PLAYBACK_UPDATE";
  protocolVersion: typeof PROTOCOL_VERSION;
  sourceId: string;
  observedAtMs: number;
  track: Track | null;
  playback: Playback;
}

export interface SourceGone {
  type: "SOURCE_GONE";
  protocolVersion: typeof PROTOCOL_VERSION;
  sourceId: string;
}

export type ContentMessage = PlaybackUpdate | SourceGone;

export interface ActivityPayload {
  title: string;
  artists: string[];
  album?: string | undefined;
  artworkUrl?: string | undefined;
  trackUrl?: string | undefined;
  playbackState: "playing" | "paused";
  positionSeconds: number;
  durationSeconds: number | null;
  observedAtMs: number;
}

export type NativeRequest =
  | { type: "PING"; protocolVersion: typeof PROTOCOL_VERSION }
  | {
      type: "SET_ACTIVITY";
      protocolVersion: typeof PROTOCOL_VERSION;
      activity: ActivityPayload;
    }
  | { type: "CLEAR_ACTIVITY"; protocolVersion: typeof PROTOCOL_VERSION };

export type NativeResponse =
  | {
      type: "HOST_READY";
      protocolVersion: typeof PROTOCOL_VERSION;
      version: string;
    }
  | { type: "PONG"; protocolVersion: typeof PROTOCOL_VERSION }
  | {
      type: "DISCORD_STATUS";
      status: "connecting" | "connected" | "disconnected" | "error";
      username?: string | undefined;
      message?: string | undefined;
    }
  | {
      type: "ACTIVITY_STATUS";
      status: "set" | "cleared" | "queued" | "error";
      message?: string | undefined;
    }
  | { type: "HOST_ERROR"; message: string };

export interface ExtensionStatus {
  enabled: boolean;
  hostStatus: "disconnected" | "connecting" | "connected" | "error";
  discordStatus: "disconnected" | "connecting" | "connected" | "error";
  discordUsername?: string | undefined;
  activeActivity?: ActivityPayload | undefined;
  errorMessage?: string | undefined;
  pauseTimeoutMinutes: number;
}
