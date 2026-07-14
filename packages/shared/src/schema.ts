import { z } from "zod";
import { PROTOCOL_VERSION } from "./index.ts";

const finiteNonNegative = z.number().finite().nonnegative();
const optionalWebUrl = z
  .url()
  .refine((value) => value.startsWith("https://"), "Only HTTPS URLs are allowed")
  .optional();

export const TrackSchema = z.object({
  title: z.string().trim().min(1).max(512),
  artists: z.array(z.string().trim().min(1).max(256)).min(1).max(16),
  album: z.string().trim().min(1).max(512).optional(),
  artworkUrl: optionalWebUrl,
  trackUrl: optionalWebUrl,
});

export const PlaybackSchema = z.object({
  state: z.enum(["playing", "paused", "stopped"]),
  positionSeconds: finiteNonNegative,
  durationSeconds: finiteNonNegative.nullable(),
});

export const PlaybackUpdateSchema = z.object({
  type: z.literal("PLAYBACK_UPDATE"),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  sourceId: z.string().min(1).max(128),
  observedAtMs: z.number().int().positive(),
  track: TrackSchema.nullable(),
  playback: PlaybackSchema,
});

export const SourceGoneSchema = z.object({
  type: z.literal("SOURCE_GONE"),
  protocolVersion: z.literal(PROTOCOL_VERSION),
  sourceId: z.string().min(1).max(128),
});

export const ContentMessageSchema = z.discriminatedUnion("type", [
  PlaybackUpdateSchema,
  SourceGoneSchema,
]);

export const ActivityPayloadSchema = z.object({
  title: z.string().trim().min(1).max(512),
  artists: z.array(z.string().trim().min(1).max(256)).min(1).max(16),
  album: z.string().trim().min(1).max(512).optional(),
  artworkUrl: optionalWebUrl,
  trackUrl: optionalWebUrl,
  playbackState: z.enum(["playing", "paused"]),
  positionSeconds: finiteNonNegative,
  durationSeconds: finiteNonNegative.nullable(),
  observedAtMs: z.number().int().positive(),
});

export const NativeRequestSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("PING"),
    protocolVersion: z.literal(PROTOCOL_VERSION),
  }),
  z.object({
    type: z.literal("SET_ACTIVITY"),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    activity: ActivityPayloadSchema,
  }),
  z.object({
    type: z.literal("CLEAR_ACTIVITY"),
    protocolVersion: z.literal(PROTOCOL_VERSION),
  }),
]);

export const NativeResponseSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("HOST_READY"),
    protocolVersion: z.literal(PROTOCOL_VERSION),
    version: z.string(),
  }),
  z.object({
    type: z.literal("PONG"),
    protocolVersion: z.literal(PROTOCOL_VERSION),
  }),
  z.object({
    type: z.literal("DISCORD_STATUS"),
    status: z.enum(["connecting", "connected", "disconnected", "error"]),
    username: z.string().optional(),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal("ACTIVITY_STATUS"),
    status: z.enum(["set", "cleared", "queued", "error"]),
    message: z.string().optional(),
  }),
  z.object({
    type: z.literal("HOST_ERROR"),
    message: z.string(),
  }),
]);
