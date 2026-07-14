const HEADER_BYTES = 4;
const MAX_MESSAGE_BYTES = 1024 * 1024;

export function encodeNativeMessage(message: unknown): Buffer {
  const payload = Buffer.from(JSON.stringify(message), "utf8");
  if (payload.length > MAX_MESSAGE_BYTES) {
    throw new Error(`Native message exceeds ${MAX_MESSAGE_BYTES} bytes`);
  }
  const header = Buffer.allocUnsafe(HEADER_BYTES);
  header.writeUInt32LE(payload.length, 0);
  return Buffer.concat([header, payload]);
}

export class NativeMessageDecoder {
  private buffer = Buffer.alloc(0);

  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];

    while (this.buffer.length >= HEADER_BYTES) {
      const length = this.buffer.readUInt32LE(0);
      if (length > MAX_MESSAGE_BYTES) {
        this.buffer = Buffer.alloc(0);
        throw new Error(`Native message length ${length} exceeds limit`);
      }
      if (this.buffer.length < HEADER_BYTES + length) break;

      const payload = this.buffer.subarray(HEADER_BYTES, HEADER_BYTES + length);
      this.buffer = this.buffer.subarray(HEADER_BYTES + length);
      messages.push(JSON.parse(payload.toString("utf8")) as unknown);
    }

    return messages;
  }
}
