import { describe, expect, it } from "vitest";
import { encodeNativeMessage, NativeMessageDecoder } from "./framing.ts";

describe("Native Messaging framing", () => {
  it("decodes a message split across chunks", () => {
    const frame = encodeNativeMessage({ hello: "世界" });
    const decoder = new NativeMessageDecoder();

    expect(decoder.push(frame.subarray(0, 3))).toEqual([]);
    expect(decoder.push(frame.subarray(3, 8))).toEqual([]);
    expect(decoder.push(frame.subarray(8))).toEqual([{ hello: "世界" }]);
  });

  it("decodes multiple messages from one chunk", () => {
    const decoder = new NativeMessageDecoder();
    const chunk = Buffer.concat([
      encodeNativeMessage({ index: 1 }),
      encodeNativeMessage({ index: 2 }),
    ]);

    expect(decoder.push(chunk)).toEqual([{ index: 1 }, { index: 2 }]);
  });

  it("rejects oversized frames before buffering their body", () => {
    const decoder = new NativeMessageDecoder();
    const header = Buffer.alloc(4);
    header.writeUInt32LE(1024 * 1024 + 1);
    expect(() => decoder.push(header)).toThrow(/exceeds limit/);
  });
});
