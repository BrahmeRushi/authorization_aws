import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const assetDir = join(root, "android/app/src/main/assets/www");

await esbuild.build({
  entryPoints: [join(root, "src/mobile-entry.js")],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: ["chrome110"],
  outfile: join(root, "public/mobile.js"),
  legalComments: "none",
});

await rm(assetDir, { recursive: true, force: true });
await mkdir(assetDir, { recursive: true });
await cp(join(root, "public/mobile.html"), join(assetDir, "mobile.html"));
await cp(join(root, "public/mobile.js"), join(assetDir, "mobile.js"));
await cp(join(root, "public/styles.css"), join(assetDir, "styles.css"));
