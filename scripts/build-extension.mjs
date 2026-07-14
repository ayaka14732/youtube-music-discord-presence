import { cp, mkdir } from "node:fs/promises";
import { build } from "esbuild";

const packageRoot = new URL("../packages/extension/", import.meta.url);
const outdir = new URL("dist/", packageRoot);
await mkdir(outdir, { recursive: true });

await build({
  entryPoints: {
    background: new URL("src/background.ts", packageRoot).pathname,
    content: new URL("src/content.ts", packageRoot).pathname,
    popup: new URL("src/popup.ts", packageRoot).pathname,
  },
  outdir: outdir.pathname,
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: true,
  minify: false,
  logLevel: "info",
});

await Promise.all(
  ["manifest.json", "popup.html", "popup.css"].map((file) =>
    cp(new URL(file, packageRoot), new URL(file, outdir)),
  ),
);
