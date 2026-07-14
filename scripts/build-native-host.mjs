import { mkdir } from "node:fs/promises";
import { build } from "esbuild";

const packageRoot = new URL("../packages/native-host/", import.meta.url);
const outdir = new URL("dist/", packageRoot);
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: [new URL("src/index.ts", packageRoot).pathname],
  outfile: new URL("native-host.cjs", outdir).pathname,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node26",
  sourcemap: true,
  minify: false,
  logLevel: "info",
});
