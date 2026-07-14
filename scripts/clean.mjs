import { rm } from "node:fs/promises";

await Promise.all([
  rm(new URL("../packages/extension/dist", import.meta.url), { recursive: true, force: true }),
  rm(new URL("../packages/native-host/dist", import.meta.url), { recursive: true, force: true }),
]);
